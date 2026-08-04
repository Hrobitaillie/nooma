// État de la boucle de session (Riverpod) — le Directeur vit ici, en mémoire.
//
// Responsabilités :
//   - héberger le Directeur (profil de l'enfant) dans un provider, pour toute la durée de vie
//     de l'app (persistance Drift = TODO, hors périmètre de cette tranche — voir plus bas) ;
//   - exposer les données de la carte (nœuds joués, nœud actif, nœuds à venir) ;
//   - orchestrer une session : tap sur le nœud actif → generateSession → enchaînement des
//     NiveauSpec → recevoirSession → croissance du chemin.
//
// jour = jours écoulés depuis une date d'ancrage (stockée en mémoire, ici « maintenant » au
// démarrage). session = compteur incrémenté à chaque session terminée. premiereDeLaSemaine
// est dérivé du compteur (approximation : ~1 session/jour → toutes les 7 sessions).

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../directeur/directeur.dart';
import '../directeur/graphe.dart';
import '../services/contenu.dart';
import '../services/voix.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Providers de dépendances (contenu, voix). Chargés une fois.
// ─────────────────────────────────────────────────────────────────────────────

/// Le service de contenu (assets pédagogiques). Stateless, réutilisable.
final serviceContenuProvider = Provider<ServiceContenu>((ref) => ServiceContenu());

/// Le service de voix (TTS dev sur web, no-op ailleurs). Voir services/voix.dart.
final serviceVoixProvider = Provider<ServiceVoix>((ref) {
  final v = creerServiceVoix();
  ref.onDispose(v.couper);
  return v;
});

/// Le graphe de compétences, chargé depuis les assets (async).
final grapheProvider = FutureProvider<Graphe>((ref) async {
  return ref.watch(serviceContenuProvider).chargerGraphe();
});

/// La banque de syllabes, chargée depuis les assets (async).
final syllabesProvider = FutureProvider<List<ItemSyllabes>>((ref) async {
  return ref.watch(serviceContenuProvider).chargerSyllabes();
});

// ─────────────────────────────────────────────────────────────────────────────
// Modèle des nœuds de la carte.
// ─────────────────────────────────────────────────────────────────────────────

/// État visuel d'un nœud sur le chemin.
enum StatutNoeud {
  /// Déjà joué (rejouable plus tard — inactif dans cette tranche).
  joue,

  /// Le prochain à jouer (gros, pulsation).
  actif,

  /// À venir (estompé, type lisible).
  aVenir,
}

/// Un nœud du chemin de la carte (une session à jouer).
@immutable
class NoeudCarte {
  final int index;
  final StatutNoeud statut;

  /// Type dominant du nœud, pour l'icône (normal ● / cadeau 🎁 / rêve 🌙).
  final TypeNiveau type;

  const NoeudCarte({
    required this.index,
    required this.statut,
    required this.type,
  });

  NoeudCarte copyWith({StatutNoeud? statut}) => NoeudCarte(
        index: index,
        statut: statut ?? this.statut,
        type: type,
      );
}

/// État de la carte (biome courant + chemin de nœuds).
@immutable
class EtatCarte {
  final String biome;
  final List<NoeudCarte> noeuds;

  /// Vrai pendant qu'une session est en cours (empêche un double-tap).
  final bool sessionEnCours;

  const EtatCarte({
    required this.biome,
    required this.noeuds,
    this.sessionEnCours = false,
  });

  EtatCarte copyWith({
    String? biome,
    List<NoeudCarte>? noeuds,
    bool? sessionEnCours,
  }) =>
      EtatCarte(
        biome: biome ?? this.biome,
        noeuds: noeuds ?? this.noeuds,
        sessionEnCours: sessionEnCours ?? this.sessionEnCours,
      );

  NoeudCarte get noeudActif =>
      noeuds.firstWhere((n) => n.statut == StatutNoeud.actif);
}

/// Nombre de nœuds « à venir » (estompés) affichés devant le nœud actif (doc 04 §6.1 : 3-4).
const int kNoeudsAVenir = 3;

/// Types illustratifs des nœuds à venir (aperçu seulement — la vraie session est générée
/// au tap). ~1 cadeau et 1 rêve visibles pour montrer que le type est lisible (doc 04 §7).
/// Ce n'est PAS le résultat du Directeur : générer réellement muterait son état.
const List<TypeNiveau> _apercuAVenir = [
  TypeNiveau.coeur,
  TypeNiveau.cadeau,
  TypeNiveau.reve,
];

// ─────────────────────────────────────────────────────────────────────────────
// Le Directeur, hébergé en mémoire pour la durée de vie de l'app.
// ─────────────────────────────────────────────────────────────────────────────

/// Compteur de session et date d'ancrage, pour dériver (jour, session).
class _Calendrier {
  final DateTime ancre;
  int session;

  _Calendrier(this.ancre, this.session);

  /// Jours écoulés depuis l'ancre.
  int get jour => DateTime.now().difference(ancre).inDays;

  /// Approximation : ~1 session/jour ⇒ la 1re session de chaque bloc de 7 est « de semaine ».
  bool get premiereDeLaSemaine => session % 7 == 0;
}

/// Provider du Directeur (profil de l'enfant). Vit tant que l'app tourne.
///
/// TODO(persistance) : brancher Drift (event log append-only + projection skill_progress,
/// doc 06 §3) pour survivre au redémarrage. HORS PÉRIMÈTRE de cette tranche : Drift sur web
/// exige le setup WASM (sqlite3.wasm), non traité ici. En attendant, profil neuf à chaque
/// lancement (le Directeur démarre au premier module / biome Prairie).
final directeurProvider = FutureProvider<Directeur>((ref) async {
  final graphe = await ref.watch(grapheProvider.future);
  // Graine fixe en dev : deux lancements ⇒ même première session (reproductible pour la QA,
  // doc 04 §8). En prod, dérivée d'un identifiant de profil local.
  return Directeur(graphe, 'plouma-dev-profil-1');
});

// ─────────────────────────────────────────────────────────────────────────────
// Notifier de la carte : orchestre la boucle de session.
// ─────────────────────────────────────────────────────────────────────────────

/// Pilote la carte et la boucle de session. Découplé de l'UI (testable).
///
/// [directeur] peut être `null` tant que le contenu charge : l'état reste alors `null` et
/// aucune action n'a d'effet (l'UI affiche un indicateur de chargement).
class CarteNotifier extends StateNotifier<EtatCarte?> {
  final Directeur? directeur;
  final _Calendrier _cal;

  CarteNotifier(this.directeur)
      : _cal = _Calendrier(DateTime.now(), 0),
        super(null) {
    if (directeur != null) state = _construireCarte(nbJoues: 0);
  }

  /// Construit la carte : [nbJoues] nœuds pleins (bas), 1 actif, puis les nœuds à venir.
  EtatCarte _construireCarte({required int nbJoues}) {
    final List<NoeudCarte> noeuds = [];
    for (int i = 0; i < nbJoues; i++) {
      noeuds.add(NoeudCarte(
        index: i,
        statut: StatutNoeud.joue,
        type: TypeNiveau.coeur,
      ));
    }
    noeuds.add(NoeudCarte(
      index: nbJoues,
      statut: StatutNoeud.actif,
      type: TypeNiveau.coeur,
    ));
    for (int k = 0; k < kNoeudsAVenir; k++) {
      noeuds.add(NoeudCarte(
        index: nbJoues + 1 + k,
        statut: StatutNoeud.aVenir,
        type: _apercuAVenir[k % _apercuAVenir.length],
      ));
    }
    return EtatCarte(
      biome: directeur!.moduleCourant.biome,
      noeuds: noeuds,
      sessionEnCours: false,
    );
  }

  /// Génère la prochaine session-menu (liste de NiveauSpec) à jouer.
  List<NiveauSpec> genererProchaineSession() {
    final d = directeur;
    if (d == null) return const [];
    return d.generateSession(
      _cal.jour,
      _cal.session,
      _cal.premiereDeLaSemaine,
    );
  }

  /// Marque le début d'une session (l'UI ouvre l'écran de jeu).
  void demarrerSession() {
    final s = state;
    if (s == null || s.sessionEnCours) return;
    state = s.copyWith(sessionEnCours: true);
  }

  /// Ingère les résultats, fait avancer le Directeur, fait pousser le chemin.
  ///
  /// Retourne les événements produits par le Directeur (biome franchi, signal parent…) pour
  /// que l'UI les remonte (SnackBar/log dans cette tranche).
  List<EvenementDirecteur> terminerSession(List<ResultatNiveau> resultats) {
    final d = directeur;
    if (d == null) return const [];
    final avant = d.evenements.length;
    d.recevoirSession(resultats, _cal.jour, _cal.session);
    _cal.session++;

    final s = state;
    final int nbJoues = s == null
        ? 1
        : s.noeuds.where((n) => n.statut == StatutNoeud.joue).length + 1;

    // Le chemin pousse : un nœud joué de plus, nouveau nœud actif, aperçu régénéré.
    state = _construireCarte(nbJoues: nbJoues);

    return d.evenements.sublist(avant);
  }
}

/// Provider du notifier de carte (dépend du Directeur async).
///
/// Tant que le Directeur charge, le notifier a un Directeur `null` et l'état reste `null`
/// (l'UI affiche un indicateur de chargement).
final carteProvider =
    StateNotifierProvider<CarteNotifier, EtatCarte?>((ref) {
  final directeur = ref.watch(directeurProvider).valueOrNull;
  return CarteNotifier(directeur);
});

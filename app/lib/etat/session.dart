// État de la boucle de session (Riverpod) — le Directeur vit ici, RECONSTRUIT depuis la base.
//
// Responsabilités :
//   - héberger le Directeur (profil de l'enfant) dans un provider, RECONSTRUIT au démarrage
//     par rejeu du log (donnees/persistance.dart) → survit au redémarrage (macOS/desktop ET web) ;
//   - exposer les données de la carte (nœuds joués, nœud actif, nœuds à venir) ;
//   - orchestrer une session : tap sur le nœud actif → generateSession → enchaînement des
//     NiveauSpec → recevoirSession → PERSISTANCE (event log + projection) → croissance du chemin.
//
// jour logique = jours calendaires écoulés depuis l'ancre (date du 1er événement persisté).
// session = compteur persisté (numéro de la prochaine session = nb de sessions déjà jouées).
// premiereDeLaSemaine = première session d'une semaine calendaire depuis l'ancre.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../directeur/directeur.dart';
import '../directeur/graphe.dart';
import '../donnees/base.dart';
import '../donnees/persistance.dart';
import '../services/contenu.dart';
import '../services/voix.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Providers de dépendances (contenu, voix, base). Chargés une fois.
// ─────────────────────────────────────────────────────────────────────────────

/// Le service de contenu (assets pédagogiques). Stateless, réutilisable.
final serviceContenuProvider = Provider<ServiceContenu>((ref) => ServiceContenu());

/// Le service de voix (TTS dev sur web, no-op ailleurs). Voir services/voix.dart.
final serviceVoixProvider = Provider<ServiceVoix>((ref) {
  final v = creerServiceVoix();
  ref.onDispose(v.couper);
  return v;
});

/// La base locale Drift (event log + projection). Une par app, fermée à la disposition.
///
/// Surchargeable dans les tests (NativeDatabase.memory()) via `overrideWithValue`.
final baseLocaleProvider = Provider<BaseLocale>((ref) {
  final base = BaseLocale();
  ref.onDispose(base.close);
  return base;
});

/// Le graphe de compétences, chargé depuis les assets (async).
final grapheProvider = FutureProvider<Graphe>((ref) async {
  return ref.watch(serviceContenuProvider).chargerGraphe();
});

/// La banque de syllabes, chargée depuis les assets (async).
final syllabesProvider = FutureProvider<List<ItemSyllabes>>((ref) async {
  return ref.watch(serviceContenuProvider).chargerSyllabes();
});

/// Le registre des lignes de texte prononcées (doc 18 §4), chargé depuis les assets.
///
/// Tolérant : assets absents (tests) → registre vide, l'app retombe sur les replis durs des
/// mécaniques. Les mécaniques consomment les lignes par id via [RegistreVoix.resoudre].
final registreVoixProvider = FutureProvider<RegistreVoix>((ref) async {
  return ref.watch(serviceContenuProvider).chargerLignes();
});

/// Graine du profil (dev : fixe → parcours reproductible pour la QA, doc 04 §8).
/// En prod, dérivée d'un identifiant de profil local.
const String graineProfil = 'plouma-dev-profil-1';

/// La couche de persistance (dépend du graphe + de la base).
final persistanceProvider = FutureProvider<Persistance>((ref) async {
  final graphe = await ref.watch(grapheProvider.future);
  final base = ref.watch(baseLocaleProvider);
  // Version du contenu (traçabilité) ; repli « 0 » si les assets ne sont pas chargés (tests).
  String version = '0';
  try {
    version = await ref.watch(serviceContenuProvider).versionContenu();
  } catch (_) {
    // rootBundle indisponible (env. de test sans assets) : on garde le repli.
  }
  return Persistance(
    base: base,
    graphe: graphe,
    graine: graineProfil,
    versionContenu: version,
  );
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
// Le Directeur, RECONSTRUIT depuis la base au démarrage (rejeu du log).
// ─────────────────────────────────────────────────────────────────────────────

/// État de session reconstruit : Directeur + numéro de prochaine session.
class EtatDirecteur {
  final Directeur directeur;
  final int prochaineSession;

  const EtatDirecteur({required this.directeur, required this.prochaineSession});
}

/// Provider du Directeur (profil de l'enfant), RECONSTRUIT depuis la base par rejeu (doc 06 §3).
///
/// Au démarrage, on rejoue le log persisté : l'état reconstruit est identique à un parcours
/// live (approche « replay », voir donnees/persistance.dart). Persiste sur macOS/desktop ET web.
final directeurProvider = FutureProvider<EtatDirecteur>((ref) async {
  final persistance = await ref.watch(persistanceProvider.future);
  final reconstruit = await persistance.chargerOuInitialiser();
  return EtatDirecteur(
    directeur: reconstruit.directeur,
    prochaineSession: reconstruit.prochainNumeroSession,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Notifier de la carte : orchestre la boucle de session.
// ─────────────────────────────────────────────────────────────────────────────

/// Pilote la carte et la boucle de session. Découplé de l'UI (testable).
///
/// [etat] peut être `null` tant que le contenu / la reconstruction chargent : l'état reste
/// alors `null` et aucune action n'a d'effet (l'UI affiche un indicateur de chargement).
class CarteNotifier extends StateNotifier<EtatCarte?> {
  final Directeur? directeur;
  final Persistance? persistance;
  int _session;

  // Contexte calendaire courant (jour logique + première de la semaine), PRÉCALCULÉ de façon
  // asynchrone pour garder l'API du notifier synchrone (l'UI n'est pas modifiée). Rafraîchi
  // au démarrage et après chaque session. En attendant le premier calcul : (jour 0, 1re).
  int _jour = 0;
  bool _premiere = true;

  // File d'attente des écritures (append-only + projection) : sérialisées, non bloquantes
  // pour l'UI. L'état en mémoire (Directeur) reste la source de vérité pendant la session.
  Future<void> _fileEcriture = Future<void>.value();

  CarteNotifier(this.directeur, this.persistance, int prochaineSession)
      : _session = prochaineSession,
        super(null) {
    if (directeur != null) {
      state = _construireCarte(nbJoues: _session);
      _rafraichirContexte();
    }
  }

  /// Recalcule (jour, premiereDeLaSemaine) depuis la base, sans bloquer l'UI.
  void _rafraichirContexte() {
    final p = persistance;
    if (p == null) return;
    final int maintenant = DateTime.now().millisecondsSinceEpoch;
    // ignore: discarded_futures
    p.contexteProchaineSession(maintenant).then((ctx) {
      _jour = ctx.jour;
      _premiere = ctx.premiereDeLaSemaine;
    });
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
    return d.generateSession(_jour, _session, _premiere);
  }

  /// Marque le début d'une session (l'UI ouvre l'écran de jeu).
  void demarrerSession() {
    final s = state;
    if (s == null || s.sessionEnCours) return;
    state = s.copyWith(sessionEnCours: true);
  }

  /// Ingère les résultats, fait avancer le Directeur, PERSISTE (log + projection), pousse le chemin.
  ///
  /// Synchrone (l'UI n'est pas modifiée) : l'écriture en base est SÉRIALISÉE et non bloquante
  /// (file `_fileEcriture`). L'état en mémoire du Directeur est déjà avancé — la base ne fait
  /// que le refléter durablement. Retourne les événements produits par le Directeur.
  List<EvenementDirecteur> terminerSession(List<ResultatNiveau> resultats) {
    final d = directeur;
    if (d == null) return const [];

    final int maintenant = DateTime.now().millisecondsSinceEpoch;
    final int jour = _jour;
    final bool premiere = _premiere;
    final int numero = _session;

    final avant = d.evenements.length;
    d.recevoirSession(resultats, jour, numero);
    _session++;

    // Persistance atomique (log append-only + ligne session + projection), en file d'attente.
    final p = persistance;
    if (p != null) {
      _fileEcriture = _fileEcriture.then((_) => p.enregistrerSession(
            numeroSession: numero,
            jourLogique: jour,
            premiereDeLaSemaine: premiere,
            maintenantMs: maintenant,
            specsEtResultats: resultats,
            directeur: d,
          ));
      _rafraichirContexte();
    }

    // Le chemin pousse : un nœud joué de plus, nouveau nœud actif, aperçu régénéré.
    state = _construireCarte(nbJoues: _session);

    return d.evenements.sublist(avant);
  }

  /// Attend que toutes les écritures en file soient terminées (tests, extinction propre).
  Future<void> ecrituresTerminees() => _fileEcriture;

  /// Reset dev (kDebugMode) : vide la base. L'appelant recharge ensuite les providers.
  Future<void> reinitialiser() async {
    await _fileEcriture; // ne pas courir contre une écriture en cours
    await persistance?.reset();
  }
}

/// Provider du notifier de carte (dépend du Directeur async reconstruit + de la persistance).
///
/// Tant que la reconstruction charge, le notifier a un Directeur `null` et l'état reste `null`
/// (l'UI affiche un indicateur de chargement).
final carteProvider =
    StateNotifierProvider<CarteNotifier, EtatCarte?>((ref) {
  final etat = ref.watch(directeurProvider).valueOrNull;
  final persistance = ref.watch(persistanceProvider).valueOrNull;
  return CarteNotifier(
    etat?.directeur,
    persistance,
    etat?.prochaineSession ?? 0,
  );
});

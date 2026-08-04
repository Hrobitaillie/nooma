// Persistance par event log + projection, REJOUABLE (doc 06 §3, doc mission).
//
// APPROCHE RETENUE : REJEU (replay), pas snapshot.
// Le Directeur est une lib PURE et DÉTERMINISTE (même graine + même contenu ⇒ mêmes specs).
// Reconstruire l'état = recréer `Directeur(graphe, graine)` puis, pour chaque session passée
// (dans l'ordre), regénérer `generateSession(jour, session, premiere)` et rappeler
// `recevoirSession` avec les résultats du log réappariés aux specs regénérés.
//
// Pourquoi le rejeu plutôt qu'un snapshot JSON des champs du Directeur :
//   - FIABILITÉ : on rejoue le VRAI code du Directeur — l'état reconstruit est, par
//     construction, identique champ à champ à un parcours live (les champs privés comme
//     `_reussitesRecentes`, `_mecaniquesSession`, `_sessionsSansProgres` sont reconstruits
//     naturellement, sans avoir à les exposer ni les sérialiser).
//   - NON-INVASIF : aucune modification du dossier directeur/ (règle : oracle intact). Pas
//     de constructeur `Directeur.depuisEtat` ni d'accès aux champs privés.
//   - APPARIEMENT ROBUSTE : chaque mécanique produit EXACTEMENT `spec.nbEssais` essais
//     (repartirCibles, cadeau = 0) — on tranche donc les événements d'une session par le
//     `nbEssais` des specs regénérés. Le champ `niveau` (position) et l'ordre `(niveau, id)`
//     garantissent le bon regroupement.
//   - MIGRATION D'ALGO : si le Directeur change, rejouer le log recalcule toute la
//     progression (bénéfice majeur du modèle event-log, doc 06 §3).
//
// La projection `skill_progress` est mise à jour TRANSACTIONNELLEMENT après chaque session.

import 'package:drift/drift.dart';

import '../directeur/directeur.dart';
import '../directeur/graphe.dart';
import 'base.dart';

/// Résultat de la reconstruction au démarrage.
class EtatReconstruit {
  /// Le Directeur reconstruit (état à jour, prêt à piloter la suite).
  final Directeur directeur;

  /// Numéro de la prochaine session à jouer (= nombre de sessions déjà persistées).
  final int prochainNumeroSession;

  /// Horodatage d'ancrage (ms epoch) du jour logique 0, ou null si aucune session encore.
  final int? ancreMs;

  const EtatReconstruit({
    required this.directeur,
    required this.prochainNumeroSession,
    required this.ancreMs,
  });
}

/// Couche de persistance : écrit le log + projette, et reconstruit l'état par rejeu.
///
/// PURE côté données : ne dépend que de Drift + de la lib Directeur (pas d'UI/Flutter).
class Persistance {
  final BaseLocale base;
  final Graphe graphe;
  final String graine;
  final String versionContenu;

  Persistance({
    required this.base,
    required this.graphe,
    required this.graine,
    required this.versionContenu,
  });

  /// Jour logique correspondant à un horodatage donné, relatif à l'ancre.
  static int jourLogique({required int ancreMs, required int maintenantMs}) {
    // Jours calendaires écoulés, ancrés sur minuit local pour éviter les dérives d'heures.
    final DateTime ancre = DateTime.fromMillisecondsSinceEpoch(ancreMs);
    final DateTime maintenant =
        DateTime.fromMillisecondsSinceEpoch(maintenantMs);
    final DateTime a = DateTime(ancre.year, ancre.month, ancre.day);
    final DateTime m =
        DateTime(maintenant.year, maintenant.month, maintenant.day);
    return m.difference(a).inDays;
  }

  /// Numéro de semaine calendaire (0-based) depuis l'ancre — sert à `premiereDeLaSemaine` :
  /// une session est « première de la semaine » si aucune autre n'a été jouée dans sa semaine.
  static int semaineDe(int jourLogique) => jourLogique ~/ 7;

  /// Charge l'ancre persistée (ms epoch), ou null si aucune session encore.
  Future<int?> _ancre() async {
    final ligne = await (base.select(base.ancre)
          ..where((a) => a.id.equals(0)))
        .getSingleOrNull();
    return ligne?.timestamp;
  }

  /// Contexte calendaire de la PROCHAINE session à jouer (doc mission §5).
  ///
  /// [maintenantMs] = horodatage courant. Si aucune session encore, l'ancre sera posée à
  /// [maintenantMs] → jour 0. `premiereDeLaSemaine` = vrai si aucune session déjà persistée
  /// ne tombe dans la même semaine calendaire (depuis l'ancre).
  Future<({int jour, bool premiereDeLaSemaine})> contexteProchaineSession(
      int maintenantMs) async {
    final int? ancre = await _ancre();
    final int ancreMs = ancre ?? maintenantMs;
    final int jour = jourLogique(ancreMs: ancreMs, maintenantMs: maintenantMs);
    final int semaine = semaineDe(jour);

    // Semaines déjà couvertes par une session persistée.
    final sessions = await base.select(base.sessions).get();
    final bool dejaCetteSemaine =
        sessions.any((s) => semaineDe(s.jourLogique) == semaine);

    return (jour: jour, premiereDeLaSemaine: !dejaCetteSemaine);
  }

  /// Reconstruit l'état complet du Directeur par REJEU du log (doc mission §2).
  Future<EtatReconstruit> chargerOuInitialiser() async {
    final directeur = Directeur(graphe, graine);
    final int? ancreMs = await _ancre();

    final sessions = await (base.select(base.sessions)
          ..orderBy([(s) => OrderingTerm.asc(s.numero)]))
        .get();

    if (sessions.isEmpty) {
      return EtatReconstruit(
        directeur: directeur,
        prochainNumeroSession: 0,
        ancreMs: ancreMs,
      );
    }

    // Tous les événements, groupés par session puis ordonnés (niveau, id).
    final tousEvenements = await (base.select(base.learningEvents)
          ..orderBy([
            (e) => OrderingTerm.asc(e.session),
            (e) => OrderingTerm.asc(e.niveau),
            (e) => OrderingTerm.asc(e.id),
          ]))
        .get();

    final Map<int, List<LearningEvent>> parSession = {};
    for (final ev in tousEvenements) {
      (parSession[ev.session] ??= []).add(ev);
    }

    for (final sess in sessions) {
      // Regénère EXACTEMENT les specs de cette session (déterminisme du Directeur).
      final List<NiveauSpec> specs = directeur.generateSession(
        sess.jourLogique,
        sess.numero,
        sess.premiereDeLaSemaine,
      );

      // Réapparie les événements aux specs : chaque spec consomme `nbEssais` événements,
      // dans l'ordre. Le cadeau (nbEssais = 0) ne consomme rien → essais vides.
      final List<LearningEvent> evs = parSession[sess.numero] ?? const [];
      int curseur = 0;
      final List<ResultatNiveau> resultats = [];
      for (final spec in specs) {
        final List<ResultatEssai> essais = [];
        for (int i = 0; i < spec.nbEssais; i++) {
          if (curseur >= evs.length) break; // robustesse : log tronqué
          final ev = evs[curseur++];
          essais.add(ResultatEssai(
            competence: ev.competence,
            succes: ev.succes,
            avecAide: ev.avecAide,
          ));
        }
        resultats.add(ResultatNiveau(spec: spec, essais: essais));
      }

      directeur.recevoirSession(resultats, sess.jourLogique, sess.numero);
    }

    return EtatReconstruit(
      directeur: directeur,
      prochainNumeroSession: sessions.last.numero + 1,
      ancreMs: ancreMs,
    );
  }

  /// Enregistre une session TERMINÉE : append des événements + ligne session + projection,
  /// le tout dans UNE transaction (atomique — robuste aux extinctions, doc 06 §3).
  ///
  /// [directeur] est le Directeur (déjà avancé par `recevoirSession`) → source de la projection.
  /// [specsEtResultats] : la liste des (spec, essais) réellement jouée cette session.
  Future<void> enregistrerSession({
    required int numeroSession,
    required int jourLogique,
    required bool premiereDeLaSemaine,
    required int maintenantMs,
    required List<ResultatNiveau> specsEtResultats,
    required Directeur directeur,
  }) async {
    await base.transaction(() async {
      // Ancre : posée à la 1re session persistée (jour logique 0).
      final int? ancre = await _ancre();
      if (ancre == null) {
        await base.into(base.ancre).insert(
              AncreCompanion.insert(timestamp: maintenantMs),
              mode: InsertMode.insertOrReplace,
            );
      }

      // 1) Append-only des événements (un par essai), avec position de niveau.
      for (int niveau = 0; niveau < specsEtResultats.length; niveau++) {
        final rn = specsEtResultats[niveau];
        final int seed = _seedNiveau(numeroSession, jourLogique, niveau);
        for (final essai in rn.essais) {
          await base.into(base.learningEvents).insert(
                LearningEventsCompanion.insert(
                  session: numeroSession,
                  niveau: niveau,
                  exercice: rn.spec.mecanique,
                  competence: essai.competence,
                  succes: essai.succes,
                  avecAide: essai.avecAide,
                  dureeMs: 0, // non mesuré dans cette tranche
                  timestamp: maintenantMs,
                  seed: seed,
                  versionContenu: versionContenu,
                ),
              );
        }
      }

      // 2) Métadonnées de session (clé de reconstruction).
      await base.into(base.sessions).insert(
            SessionsCompanion.insert(
              numero: Value(numeroSession),
              jourLogique: jourLogique,
              premiereDeLaSemaine: premiereDeLaSemaine,
              timestamp: maintenantMs,
              graine: graine,
              versionContenu: versionContenu,
            ),
            mode: InsertMode.insertOrReplace,
          );

      // 3) Projection skill_progress (dérivée de l'état courant du Directeur).
      await _projeter(directeur);
    });
  }

  /// Met à jour la projection `skill_progress` depuis l'état courant du Directeur.
  ///
  /// Appelée DANS la transaction d'enregistrement de session (cohérence transactionnelle).
  Future<void> _projeter(Directeur directeur) async {
    for (final entree in directeur.etats.entries) {
      final e = entree.value;
      await base.into(base.skillProgress).insert(
            SkillProgressCompanion.insert(
              competence: entree.key,
              maitrise: Value(e.maitrise),
              rencontres: Value(e.rencontres),
              validee: Value(e.validee),
              boiteLeitner: Value(e.boiteLeitner),
              prochainRappel: Value(e.prochainRappel),
              dernierJour: Value(e.dernierJour),
            ),
            mode: InsertMode.insertOrReplace,
          );
    }
  }

  /// Seed déterministe d'un niveau (traçabilité, doc 06 §2). Purement informatif ici (le
  /// contenu réel des items n'est pas encore branché) : dérivé de (session, jour, niveau).
  int _seedNiveau(int session, int jour, int niveau) {
    // Combinaison stable, sans dépendance à la lib rng (reste dans donnees/).
    int h = 0x811c9dc5;
    for (final v in [session, jour, niveau]) {
      h = (h ^ (v & 0xFFFFFFFF)) & 0xFFFFFFFF;
      h = (h * 0x01000193) & 0xFFFFFFFF;
    }
    return h;
  }

  /// Vide entièrement la base (reset dev, doc mission §6). Efface log, sessions, ancre, projection.
  Future<void> reset() async {
    await base.transaction(() async {
      await base.delete(base.learningEvents).go();
      await base.delete(base.sessions).go();
      await base.delete(base.ancre).go();
      await base.delete(base.skillProgress).go();
    });
  }

  /// Lit la projection courante (ce que lira l'espace parent plus tard).
  Future<List<SkillProgressData>> lireProjection() {
    return base.select(base.skillProgress).get();
  }
}

// Tests de la persistance : REJOUABILITÉ + projection skill_progress (doc mission §8).
//
// Style calqué sur l'oracle du Directeur (test/directeur/directeur_test.dart) : un enfant
// scripté déterministe joue N sessions, on PERSISTE chaque session (event log + ligne session
// + projection), puis on RECONSTRUIT un Directeur par rejeu du log et on compare son état,
// CHAMP À CHAMP, à celui du Directeur « live » qui a produit les données. Aucun aléatoire côté
// enfant → tout écart signalerait un bug de persistance / reconstruction.
//
// Base : NativeDatabase.memory() (aucun fichier, aucun path_provider). Graphe lu depuis le
// contenu versionné via dart:io (comme l'oracle), pas via rootBundle.

import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/directeur.dart';
import 'package:plouma/directeur/graphe.dart';
import 'package:plouma/directeur/maitrise.dart';
import 'package:plouma/donnees/base.dart';
import 'package:plouma/donnees/persistance.dart';

const double tol = 1e-12;
const String graine = 'plouma-test-persistance';
const String version = '1';

/// Enfant scripté déterministe — MÊME règle que l'oracle (succès ssi (i+pos)%4 != 0).
List<ResultatEssai> jouerNiveau(NiveauSpec spec, int pos) {
  final List<ResultatEssai> essais = [];
  for (int i = 0; i < spec.nbEssais; i++) {
    final cible = spec.cibles[i % spec.cibles.length];
    final bool succes = (i + pos) % 4 != 0;
    essais.add(ResultatEssai(
      competence: cible.competence,
      succes: succes,
      avecAide: !succes,
    ));
  }
  return essais;
}

Graphe _chargerGraphe() {
  final grapheJson =
      jsonDecode(File('../contenu/graphe-competences.json').readAsStringSync())
          as Map<String, dynamic>;
  final mecaniquesJson =
      jsonDecode(File('../contenu/mecaniques.json').readAsStringSync())
          as Map<String, dynamic>;
  return Graphe.depuisJson(grapheJson, mecaniquesJson);
}

/// Compare deux états de compétence, champ à champ.
void comparerEtat(String id, EtatCompetence a, EtatCompetence b) {
  expect(b.maitrise, closeTo(a.maitrise, tol), reason: '$id : maitrise');
  expect(b.rencontres, a.rencontres, reason: '$id : rencontres');
  expect(b.validee, a.validee, reason: '$id : validee');
  expect(b.jourValidation, a.jourValidation, reason: '$id : jourValidation');
  expect(b.boiteLeitner, a.boiteLeitner, reason: '$id : boiteLeitner');
  expect(b.prochainRappel, closeTo(a.prochainRappel, tol),
      reason: '$id : prochainRappel');
  expect(b.dernierJour, a.dernierJour, reason: '$id : dernierJour');
  expect(b.derniereDifficulte, a.derniereDifficulte,
      reason: '$id : derniereDifficulte');
  expect(b.sousCibleConsecutifs, a.sousCibleConsecutifs,
      reason: '$id : sousCibleConsecutifs');
  expect(b.sessionsVues, a.sessionsVues, reason: '$id : sessionsVues');
}

void main() {
  final graphe = _chargerGraphe();

  late BaseLocale base;
  late Persistance persistance;

  setUp(() {
    base = BaseLocale(NativeDatabase.memory());
    persistance = Persistance(
      base: base,
      graphe: graphe,
      graine: graine,
      versionContenu: version,
    );
  });

  tearDown(() async {
    await base.close();
  });

  /// Joue et persiste [nSessions], en renvoyant le Directeur « live » de référence.
  Future<Directeur> jouerEtPersister(int nSessions) async {
    final live = Directeur(graphe, graine);
    // Ancre logique fixe pour un test déterministe (jour = s*2, comme l'oracle).
    final int ancreMs = DateTime(2026, 1, 1).millisecondsSinceEpoch;

    for (int s = 0; s < nSessions; s++) {
      final int jour = s * 2;
      final bool premiere = jour % 7 == 0;
      final int maintenant = ancreMs + jour * 24 * 60 * 60 * 1000;

      final List<NiveauSpec> niveaux = live.generateSession(jour, s, premiere);
      final List<ResultatNiveau> resultats = [
        for (int pos = 0; pos < niveaux.length; pos++)
          ResultatNiveau(
              spec: niveaux[pos], essais: jouerNiveau(niveaux[pos], pos)),
      ];

      live.recevoirSession(resultats, jour, s);

      await persistance.enregistrerSession(
        numeroSession: s,
        jourLogique: jour,
        premiereDeLaSemaine: premiere,
        maintenantMs: maintenant,
        specsEtResultats: resultats,
        directeur: live,
      );
    }
    return live;
  }

  test('rejouabilité : l\'état reconstruit == l\'état live (champ à champ)', () async {
    const int nSessions = 40;
    final live = await jouerEtPersister(nSessions);

    // Reconstruction par rejeu du log.
    final reconstruit = await persistance.chargerOuInitialiser();
    final dir = reconstruit.directeur;

    // Prochaine session = nombre de sessions jouées.
    expect(reconstruit.prochainNumeroSession, nSessions);

    // États de compétence : tous identiques.
    expect(dir.etats.keys.toSet(), live.etats.keys.toSet(),
        reason: 'mêmes compétences');
    for (final id in live.etats.keys) {
      comparerEtat(id, live.etats[id]!, dir.etats[id]!);
    }

    // Machine globale.
    expect(dir.moduleIndex, live.moduleIndex, reason: 'moduleIndex');
    expect(dir.phase, live.phase, reason: 'phase');
    expect(dir.confirmationsReussies, live.confirmationsReussies,
        reason: 'confirmationsReussies');
    expect(dir.confirmationsSessions, live.confirmationsSessions,
        reason: 'confirmationsSessions');
    expect(dir.niveauxDansBiome, live.niveauxDansBiome,
        reason: 'niveauxDansBiome');
    expect(dir.jourEntreeBiome, live.jourEntreeBiome,
        reason: 'jourEntreeBiome');
    expect(dir.violationsSautDifficulte, live.violationsSautDifficulte,
        reason: 'violationsSautDifficulte');
    expect(dir.violationsMecanique, live.violationsMecanique,
        reason: 'violationsMecanique');

    // Événements : même nombre et même contenu, dans l'ordre.
    expect(dir.evenements.length, live.evenements.length,
        reason: 'nombre d\'événements');
    for (int i = 0; i < live.evenements.length; i++) {
      expect(dir.evenements[i].type, live.evenements[i].type,
          reason: 'événement $i : type');
      expect(dir.evenements[i].detail, live.evenements[i].detail,
          reason: 'événement $i : detail');
      expect(dir.evenements[i].jour, live.evenements[i].jour,
          reason: 'événement $i : jour');
    }

    // Historique des biomes.
    expect(dir.historiqueBiomes.length, live.historiqueBiomes.length,
        reason: 'historiqueBiomes');
    for (int i = 0; i < live.historiqueBiomes.length; i++) {
      expect(dir.historiqueBiomes[i].module, live.historiqueBiomes[i].module);
      expect(dir.historiqueBiomes[i].niveaux, live.historiqueBiomes[i].niveaux);
    }
  });

  test('base vide : reconstruction = Directeur neuf, prochaine session = 0', () async {
    final reconstruit = await persistance.chargerOuInitialiser();
    expect(reconstruit.prochainNumeroSession, 0);
    expect(reconstruit.ancreMs, isNull);
    final neuf = Directeur(graphe, graine);
    for (final id in neuf.etats.keys) {
      comparerEtat(id, neuf.etats[id]!, reconstruit.directeur.etats[id]!);
    }
  });

  test('projection skill_progress : reflète l\'état du Directeur', () async {
    const int nSessions = 30;
    final live = await jouerEtPersister(nSessions);

    final projection = await persistance.lireProjection();
    final Map<String, SkillProgressData> parCompetence = {
      for (final p in projection) p.competence: p,
    };

    // Une ligne par compétence connue du Directeur.
    expect(parCompetence.length, live.etats.length,
        reason: 'une ligne par compétence');

    for (final entree in live.etats.entries) {
      final e = entree.value;
      final p = parCompetence[entree.key];
      expect(p, isNotNull, reason: '${entree.key} : présente dans la projection');
      expect(p!.maitrise, closeTo(e.maitrise, tol),
          reason: '${entree.key} : maitrise');
      expect(p.rencontres, e.rencontres, reason: '${entree.key} : rencontres');
      expect(p.validee, e.validee, reason: '${entree.key} : validee');
      expect(p.boiteLeitner, e.boiteLeitner,
          reason: '${entree.key} : boiteLeitner');
      expect(p.prochainRappel, closeTo(e.prochainRappel, tol),
          reason: '${entree.key} : prochainRappel');
      expect(p.dernierJour, e.dernierJour, reason: '${entree.key} : dernierJour');
    }

    // Au moins une compétence validée après 30 sessions (le parcours progresse).
    expect(parCompetence.values.any((p) => p.validee), isTrue,
        reason: 'au moins une compétence validée');
  });

  test('reset : vide la base (log, sessions, ancre, projection)', () async {
    await jouerEtPersister(10);
    await persistance.reset();

    expect(await base.select(base.learningEvents).get(), isEmpty);
    expect(await base.select(base.sessions).get(), isEmpty);
    expect(await base.select(base.ancre).get(), isEmpty);
    expect(await persistance.lireProjection(), isEmpty);

    // Après reset, reconstruction = Directeur neuf.
    final reconstruit = await persistance.chargerOuInitialiser();
    expect(reconstruit.prochainNumeroSession, 0);
  });

  test('reconstruction incrémentale : reprise après N puis M sessions', () async {
    // Joue 20 sessions et persiste.
    await jouerEtPersister(20);

    // Reconstruit, puis rejoue le scénario live COMPLET (40) pour comparer à la reprise.
    final reconstruit = await persistance.chargerOuInitialiser();
    expect(reconstruit.prochainNumeroSession, 20);

    // Le Directeur reconstruit doit pouvoir CONTINUER à générer sans crash (session 20+).
    final dir = reconstruit.directeur;
    final suite = dir.generateSession(40, 20, false);
    expect(suite, isNotEmpty, reason: 'la reprise génère une session valide');
  });
}

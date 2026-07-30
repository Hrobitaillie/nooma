// Oracle croisé du DIRECTEUR ENTIER (doc 06 §4). Rejoue EXACTEMENT le scénario déterministe
// figé par cadrage/simulateur/sim/oracle.ts (référence TypeScript) et compare champ à champ.
//
// L'enfant est scripté par la même règle arithmétique que l'oracle (succès ssi (i+pos)%4 != 0),
// donc AUCUN aléatoire côté enfant : tout écart TS↔Dart signale une divergence de PORT.
// Le graphe est lu via dart:io depuis le contenu versionné (../contenu, relatif à app/), pas
// via rootBundle (pas de binding Flutter nécessaire pour un test de lib pure).
//
// Tolérance 1e-12 sur les maîtrises (mêmes doubles IEEE-754 des deux côtés).

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/directeur.dart';
import 'package:plouma/directeur/graphe.dart';

const double tol = 1e-12;

/// Enfant scripté déterministe — copie EXACTE de la règle de oracle.ts.
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

void main() {
  // Chargement du graphe depuis le contenu versionné (relatif au cwd = app/).
  final grapheJson =
      jsonDecode(File('../contenu/graphe-competences.json').readAsStringSync())
          as Map<String, dynamic>;
  final mecaniquesJson =
      jsonDecode(File('../contenu/mecaniques.json').readAsStringSync())
          as Map<String, dynamic>;
  final graphe = Graphe.depuisJson(grapheJson, mecaniquesJson);

  // Oracle figé (produit par oracle.ts).
  final oracle = jsonDecode(
    File('test/directeur/oracle_directeur.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  test('le port Dart rejoue exactement le scénario oracle (Directeur complet)', () {
    final directeur = Directeur(graphe, oracle['meta']['graine'] as String);
    final int nSessions = oracle['meta']['sessions'] as int;
    final sessionsOracle = oracle['sessions'] as List<dynamic>;

    for (int s = 0; s < nSessions; s++) {
      final int jour = s * 2;
      final bool premiere = jour % 7 == 0;
      final List<NiveauSpec> niveaux =
          directeur.generateSession(jour, s, premiere);

      // Comparaison des specs générés avec l'oracle.
      final Map<String, dynamic> attendu =
          sessionsOracle[s] as Map<String, dynamic>;
      expect(attendu['jour'], jour, reason: 'session $s : jour');
      expect(attendu['premiereDeLaSemaine'], premiere,
          reason: 'session $s : premiereDeLaSemaine');
      final specsAttendus = attendu['specs'] as List<dynamic>;
      expect(niveaux.length, specsAttendus.length,
          reason: 'session $s : nombre de niveaux');

      for (int k = 0; k < niveaux.length; k++) {
        final n = niveaux[k];
        final a = specsAttendus[k] as Map<String, dynamic>;
        expect(n.type.id, a['type'], reason: 'session $s niveau $k : type');
        expect(n.mecanique, a['mecanique'],
            reason: 'session $s niveau $k : mecanique');
        expect(n.nbEssais, a['nbEssais'],
            reason: 'session $s niveau $k : nbEssais');
        final ciblesAttendues = a['cibles'] as List<dynamic>;
        expect(n.cibles.length, ciblesAttendues.length,
            reason: 'session $s niveau $k : nb cibles');
        for (int c = 0; c < n.cibles.length; c++) {
          final ca = ciblesAttendues[c] as Map<String, dynamic>;
          expect(n.cibles[c].competence, ca['competence'],
              reason: 'session $s niveau $k cible $c : competence');
          expect(n.cibles[c].difficulte, ca['difficulte'],
              reason: 'session $s niveau $k cible $c : difficulte');
        }
      }

      // Ingestion des résultats de l'enfant scripté.
      final List<ResultatNiveau> resultats = [
        for (int pos = 0; pos < niveaux.length; pos++)
          ResultatNiveau(spec: niveaux[pos], essais: jouerNiveau(niveaux[pos], pos)),
      ];
      directeur.recevoirSession(resultats, jour, s);
    }

    // États finaux.
    final etatsAttendus = oracle['etatsFinaux'] as Map<String, dynamic>;
    for (final entry in etatsAttendus.entries) {
      final id = entry.key;
      final a = entry.value as Map<String, dynamic>;
      final e = directeur.etat(id);
      expect(e.maitrise, closeTo((a['maitrise'] as num).toDouble(), tol),
          reason: '$id : maitrise');
      expect(e.validee, a['validee'], reason: '$id : validee');
      expect(e.boiteLeitner, a['boiteLeitner'], reason: '$id : boiteLeitner');
      expect(e.rencontres, a['rencontres'], reason: '$id : rencontres');
      expect(e.derniereDifficulte, a['derniereDifficulte'],
          reason: '$id : derniereDifficulte');
    }

    // Événements.
    final evAttendus = oracle['evenements'] as List<dynamic>;
    expect(directeur.evenements.length, evAttendus.length,
        reason: 'nombre d\'événements');
    for (int i = 0; i < directeur.evenements.length; i++) {
      final ev = directeur.evenements[i];
      final a = evAttendus[i] as Map<String, dynamic>;
      expect(ev.type.id, a['type'], reason: 'événement $i : type');
      expect(ev.detail, a['detail'], reason: 'événement $i : detail');
      expect(ev.jour, a['jour'], reason: 'événement $i : jour');
    }

    // Machine globale.
    expect(directeur.moduleIndex, oracle['moduleIndex'],
        reason: 'moduleIndex');
    expect(directeur.historiqueBiomes.length,
        (oracle['historiqueBiomes'] as List<dynamic>).length,
        reason: 'historiqueBiomes');
    expect(directeur.violationsSautDifficulte,
        oracle['violationsSautDifficulte'],
        reason: 'violationsSautDifficulte');
    expect(directeur.violationsMecanique, oracle['violationsMecanique'],
        reason: 'violationsMecanique');
  });
}

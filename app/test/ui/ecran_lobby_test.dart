// Widget test du lobby (vue biomes) : les 12 tuiles de biome sont présentes, et les biomes
// futurs sont sous la brume (ImageFiltered).
//
// On surcharge le provider de graphe pour éviter la dépendance aux assets : un graphe à 12
// modules suffit à faire démarrer le Directeur, dont l'index de module courant vaut 0 au
// lancement (tuile 0 = courant, tuiles 1..11 = futures → sous la brume).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/graphe.dart';
import 'package:plouma/etat/session.dart';
import 'package:plouma/ui/ecran_lobby.dart';

/// Graphe de test à 12 modules (un biome par module).
Graphe _graphe12() {
  final biomes = [
    'Prairie', 'Jardin', 'Forêt', 'Clairière', 'Village', 'Rivière',
    'Marais', 'Colline', 'Montagne', 'Grotte', 'Vallée', 'Ciel nocturne',
  ];
  final grapheJson = {
    'modules': [
      for (int i = 0; i < biomes.length; i++)
        {
          'id': 'mod-$i',
          'biome': biomes[i],
          'ordre': i + 1,
          'competences': [
            {
              'id': 'comp-$i',
              'prerequis': <String>[],
              'mecaniques': ['tape-la-syllabe'],
              'difficulte': 0.2,
            },
          ],
        },
    ],
  };
  final mecaniquesJson = {
    'mecaniques': [
      {'id': 'tape-la-syllabe'},
    ],
  };
  return Graphe.depuisJson(grapheJson, mecaniquesJson);
}

void main() {
  testWidgets('le lobby affiche 12 tuiles, brume sur les biomes futurs',
      (tester) async {
    // Surface haute : on veut rendre un maximum de tuiles d'un coup (ListView est paresseux).
    tester.view.physicalSize = const Size(1200, 4000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          grapheProvider.overrideWith((ref) async => _graphe12()),
          syllabesProvider.overrideWith((ref) async => const []),
        ],
        child: const MaterialApp(home: EcranLobby()),
      ),
    );

    // Laisse les FutureProviders (graphe → directeur) se résoudre.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // On parcourt toute la liste (ListView paresseux) en collectant les tuiles rencontrées.
    final Set<int> vues = {};
    void collecter() {
      for (int i = 0; i < 12; i++) {
        if (find.byKey(ValueKey('tuile-biome-$i')).evaluate().isNotEmpty) {
          vues.add(i);
        }
      }
    }

    collecter();
    // La tuile 0 (courant) est en tête : badge « en cours » visible.
    expect(find.text('en cours'), findsOneWidget);
    // Aucun cadenas anxiogène : la brume seule signale le futur (pas de 🔒).
    expect(find.text('🔒'), findsNothing);
    // Les tuiles futures visibles sont sous la brume (ImageFiltered).
    expect(find.byType(ImageFiltered), findsWidgets);

    // Défile jusqu'au bout pour rencontrer les 12 tuiles.
    for (int pas = 0; pas < 8 && vues.length < 12; pas++) {
      await tester.drag(find.byType(ListView), const Offset(0, -1200));
      await tester.pump();
      collecter();
    }

    // Les 12 biomes du graphe ont bien une tuile.
    expect(vues.length, 12, reason: 'tuiles vues : $vues');
  });
}

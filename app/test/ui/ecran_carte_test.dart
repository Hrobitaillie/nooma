// Widget test de la carte : le nœud actif existe et l'en-tête montre le biome.
//
// On surcharge les providers async (graphe, syllabes) pour éviter la dépendance aux assets :
// un graphe minimal suffit à faire démarrer le Directeur et donc la carte.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/graphe.dart';
import 'package:plouma/etat/session.dart';
import 'package:plouma/ui/ecran_carte.dart';

/// Graphe minimal : un module « Prairie » avec une compétence et une mécanique.
Graphe _grapheTest() {
  final grapheJson = {
    'modules': [
      {
        'id': 'syllabes',
        'biome': 'Prairie',
        'ordre': 1,
        'competences': [
          {
            'id': 'syl-seg2',
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
  testWidgets('la carte affiche le biome et un nœud actif', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          grapheProvider.overrideWith((ref) async => _grapheTest()),
          syllabesProvider.overrideWith((ref) async => const []),
        ],
        child: const MaterialApp(home: EcranCarte()),
      ),
    );

    // Laisse les FutureProviders (graphe → directeur) se résoudre. On n'utilise PAS
    // pumpAndSettle : le nœud actif a une pulsation infinie qui ne « se pose » jamais.
    await tester.pump(); // microtask du future
    await tester.pump(const Duration(milliseconds: 50));

    // Le nœud actif existe (clé dédiée).
    expect(find.byKey(const Key('noeud-actif')), findsOneWidget);

    // L'en-tête montre le biome courant.
    expect(find.text('Prairie'), findsOneWidget);

    // Le bouton « vue biomes » (accès au lobby) est présent dans l'en-tête flottant.
    expect(find.byKey(const Key('bouton-lobby')), findsOneWidget);
  });
}

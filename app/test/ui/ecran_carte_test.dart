// Widget test de la carte : le nœud actif existe et l'en-tête montre le biome.
//
// On surcharge les providers async (graphe, syllabes) pour éviter la dépendance aux assets :
// un graphe minimal suffit à faire démarrer le Directeur et donc la carte.

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/graphe.dart';
import 'package:plouma/donnees/base.dart';
import 'package:plouma/etat/session.dart';
import 'package:plouma/services/contenu.dart';
import 'package:plouma/ui/ecran_carte.dart';
import 'package:plouma/ui/ecran_session.dart';

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
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    // Base en mémoire : pas de fichier / path_provider dans un test — et FERMÉE en fin de
    // test (une base laissée ouverte pollue le test suivant du même fichier).
    final base = BaseLocale(NativeDatabase.memory());
    addTearDown(base.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          grapheProvider.overrideWith((ref) async => _grapheTest()),
          syllabesProvider.overrideWith((ref) async => const []),
          baseLocaleProvider.overrideWithValue(base),
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

    // Régression (bug du Stack dimensionné sur l'en-tête) : la zone scrollable remplit
    // l'écran, et en début de partie le nœud actif est dans la MOITIÉ BASSE de l'écran
    // (le chemin est ancré en bas), pas caché sous l'en-tête ni hors écran.
    expect(
      tester.getRect(find.byType(SingleChildScrollView)).height,
      moreOrLessEquals(800, epsilon: 1),
    );
    final Offset centreActif = tester.getCenter(find.byKey(const Key('noeud-actif')));
    expect(centreActif.dy, greaterThan(400));
    expect(centreActif.dy, lessThan(800));

    // L'en-tête montre le biome courant.
    expect(find.text('Prairie'), findsOneWidget);

    // Le bouton « vue biomes » (accès au lobby) est présent dans l'en-tête flottant.
    expect(find.byKey(const Key('bouton-lobby')), findsOneWidget);
  });

  testWidgets(
      'régression : taper le nœud actif OUVRE la session, même si la banque '
      'de mots se charge en retard (elle ne défile pas toute seule)', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    // Banque réaliste (items tagués syl-seg2)… qui met 150 ms à charger, comme au premier
    // lancement (FutureProvider paresseux). Avant le correctif, le tap lisait une banque
    // vide → tous les essais s'auto-complétaient → la session « clignotait » et se fermait.
    final banque = ServiceContenu.parserSyllabes(
      'mot;syllabesOrales;decoupage;phonemeAttaque;frequence;competences;distracteursProches;aVerifier;statut\n'
      'lapin;2;la-pin;l;1;syl-seg2;;non;valide\n'
      'bateau;2;ba-teau;b;1;syl-seg2;;non;valide\n'
      'souris;2;sou-ris;s;1;syl-seg2;;non;valide\n',
    );

    // Le cache de rootBundle peut garder un future d'un test précédent (zone morte) qui ne
    // se résoudra jamais ici → persistanceProvider pendrait indéfiniment. On repart à neuf.
    rootBundle.clear();

    final base = BaseLocale(NativeDatabase.memory());
    addTearDown(base.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          grapheProvider.overrideWith((ref) async => _grapheTest()),
          syllabesProvider.overrideWith((ref) async {
            await Future<void>.delayed(const Duration(milliseconds: 150));
            return banque;
          }),
          baseLocaleProvider.overrideWithValue(base),
        ],
        child: const MaterialApp(home: EcranCarte()),
      ),
    );
    // Attend la carte (chaîne graphe → persistance → directeur). La banque, elle, reste
    // paresseuse : son délai de 150 ms ne démarre qu'au premier read — c'est-à-dire au tap.
    for (int i = 0;
        i < 40 && find.byKey(const Key('noeud-actif')).evaluate().isEmpty;
        i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    // Tap sur le nœud actif AVANT que la banque soit chargée.
    await tester.tap(find.byKey(const Key('noeud-actif')));
    await tester.pump(); // déclenche l'attente de la banque
    await tester.pump(const Duration(milliseconds: 200)); // la banque se résout
    await tester.pump(const Duration(milliseconds: 400)); // transition de route

    // La session est OUVERTE et attend l'enfant — elle n'a pas défilé toute seule.
    expect(find.byType(EcranSession), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.byType(EcranSession), findsOneWidget,
        reason: 'la session ne doit pas se terminer sans interaction');
  });
}

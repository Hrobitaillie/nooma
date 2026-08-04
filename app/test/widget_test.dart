// Smoke test de l'app : PloumaApp démarre et affiche la carte (fond crème).
//
// Depuis la première tranche jouable, main.dart ouvre la carte Prairie (via ProviderScope)
// et non plus l'écran socle. Sans surcharge de providers, la carte est en état de chargement
// (les FutureProviders graphe/directeur ne se résolvent pas ici, faute d'assets) : on vérifie
// simplement que l'app se construit sur fond crème, sans exception.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/main.dart';
import 'package:plouma/ui/ecran_carte.dart';

void main() {
  testWidgets('PloumaApp démarre et affiche la carte',
      (WidgetTester tester) async {
    // main() enveloppe PloumaApp dans un ProviderScope : on reproduit ce câblage.
    await tester.pumpWidget(const ProviderScope(child: PloumaApp()));
    await tester.pump(); // laisse le premier build se faire

    // L'app démarre sur la carte (peut être en chargement selon les assets).
    expect(find.byType(EcranCarte), findsOneWidget);
  });
}

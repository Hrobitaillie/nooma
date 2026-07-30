// Smoke test du socle : l'app démarre et affiche l'écran d'accueil provisoire.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/main.dart';
import 'package:plouma/ui/ecran_socle.dart';

void main() {
  testWidgets('Le socle affiche « Plouma — socle technique » sur fond crème',
      (WidgetTester tester) async {
    await tester.pumpWidget(const PloumaApp());

    expect(find.text('Plouma — socle technique'), findsOneWidget);

    final Scaffold scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.backgroundColor, kCreme);
  });
}

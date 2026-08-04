// Test de la logique de comptage des taps de « Tape la syllabe » (logique PURE).

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/mecaniques/comptage_taps.dart';

void main() {
  group('CompteurTaps', () {
    test('compte les taps un par un', () {
      final c = CompteurTaps();
      expect(c.taps, 0);
      c.taper();
      c.taper();
      expect(c.taps, 2);
    });

    test('réussite quand le nombre de taps == syllabes attendues', () {
      final c = CompteurTaps()
        ..taper()
        ..taper();
      expect(c.reussitePour(2), isTrue);
      expect(c.reussitePour(3), isFalse);
      expect(c.reussitePour(1), isFalse);
    });

    test('réinitialiser remet le compteur à zéro (nouvel essai)', () {
      final c = CompteurTaps()
        ..taper()
        ..taper()
        ..taper();
      expect(c.taps, 3);
      c.reinitialiser();
      expect(c.taps, 0);
      expect(c.reussitePour(0), isTrue);
    });

    test('le délai de validation est de 1,2 s', () {
      expect(kDelaiValidationTaps, const Duration(milliseconds: 1200));
    });
  });
}

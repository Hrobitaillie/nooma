// Oracle croisé du RNG : les valeurs attendues ci-dessous ont été IMPRIMÉES côté Node
// (node --experimental-strip-types) à partir de cadrage/simulateur/core/rng.ts, puis figées ici.
// Même seed ⇒ mêmes tirages des deux côtés = l'oracle de non-régression est branché (doc 06 §4).
// Tolérance 1e-12 sur les doubles.

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/rng.dart';

const double tol = 1e-12;

void main() {
  group('splitmix32', () {
    test('seed 42 : 5 premiers tirages (oracle TS)', () {
      final rng = splitmix32(42);
      const attendus = <double>[
        0.12848330102860928,
        0.03353364090435207,
        0.07509804493747652,
        0.7065966189838946,
        0.21141720796003938,
      ];
      for (final a in attendus) {
        expect(rng(), closeTo(a, tol));
      }
    });

    test("seed hashString('plouma') : 5 premiers tirages (oracle TS)", () {
      final rng = splitmix32(hashString('plouma'));
      const attendus = <double>[
        0.18039012304507196,
        0.4857931558508426,
        0.6163586664479226,
        0.5766828563064337,
        0.4338881012517959,
      ];
      for (final a in attendus) {
        expect(rng(), closeTo(a, tol));
      }
    });

    test('même seed ⇒ mêmes tirages (déterminisme)', () {
      final a = splitmix32(12345);
      final b = splitmix32(12345);
      for (var i = 0; i < 50; i++) {
        expect(a(), b());
      }
    });

    test('tirages dans [0, 1)', () {
      final rng = splitmix32(7);
      for (var i = 0; i < 1000; i++) {
        final x = rng();
        expect(x, greaterThanOrEqualTo(0));
        expect(x, lessThan(1));
      }
    });
  });

  group('hashString', () {
    test("hashString('plouma') == 642364619 (oracle TS)", () {
      expect(hashString('plouma'), 642364619);
    });
  });

  group('pick', () {
    test('renvoie un élément de la liste, déterministe par seed', () {
      const arr = ['a', 'b', 'c', 'd'];
      final rng = splitmix32(99);
      final choix = pick(rng, arr);
      expect(arr.contains(choix), isTrue);
    });
  });
}

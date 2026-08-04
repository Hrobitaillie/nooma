// Test du cœur PURE de « La boîte à sons » (comptage de jetons, jetons proposés, découpage,
// séquence de modelling, ordre coloré des jetons — hasard mocké).

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/mecaniques/boite_a_sons_logique.dart';

void main() {
  group('BoiteASons (comptage de jetons)', () {
    test('dépose les jetons un par un', () {
      final b = BoiteASons();
      expect(b.jetonsDeposes, 0);
      b.deposer();
      b.deposer();
      expect(b.jetonsDeposes, 2);
    });

    test('réussite quand jetons déposés == syllabes attendues', () {
      final b = BoiteASons()
        ..deposer()
        ..deposer();
      expect(b.reussitePour(2), isTrue);
      expect(b.reussitePour(3), isFalse);
      expect(b.reussitePour(1), isFalse);
    });

    test('réinitialiser vide la boîte (nouvel essai)', () {
      final b = BoiteASons()
        ..deposer()
        ..deposer()
        ..deposer();
      expect(b.jetonsDeposes, 3);
      b.reinitialiser();
      expect(b.jetonsDeposes, 0);
      expect(b.reussitePour(0), isTrue);
    });

    test('le délai de validation par inactivité est de 1,5 s', () {
      expect(kDelaiValidationJetons, const Duration(milliseconds: 1500));
    });
  });

  group('jetonsProposes (toujours plus que nécessaire)', () {
    test('2 syllabes → 4 jetons (le minimum, avec surplus)', () {
      // 2 + 2 = 4, borné à [4, 6].
      expect(jetonsProposes(2), 4);
    });

    test('1 syllabe → 4 jetons (plancher à 4)', () {
      // 1 + 2 = 3, remonté au plancher de 4.
      expect(jetonsProposes(1), 4);
    });

    test('3 syllabes → 5 jetons (surplus de 2)', () {
      expect(jetonsProposes(3), 5);
    });

    test('4 syllabes → 6 jetons (plafond)', () {
      expect(jetonsProposes(4), 6);
    });

    test('5+ syllabes → plafonné à 6 jetons', () {
      expect(jetonsProposes(5), 6);
      expect(jetonsProposes(8), 6);
    });

    test('toujours dans [4, 6] et jamais moins que le nombre de syllabes usuel', () {
      for (int syll = 1; syll <= 4; syll++) {
        final n = jetonsProposes(syll);
        expect(n, greaterThanOrEqualTo(kJetonsProposesMin));
        expect(n, lessThanOrEqualTo(kJetonsProposesMax));
        // Il doit toujours rester assez de jetons pour couvrir le mot.
        expect(n, greaterThanOrEqualTo(syll));
      }
    });
  });

  group('syllabesDecoupees', () {
    test('découpe sur le tiret et nettoie les espaces', () {
      expect(syllabesDecoupees('la-pin'), ['la', 'pin']);
      expect(syllabesDecoupees('é-lé-phant'), ['é', 'lé', 'phant']);
    });

    test('écarte les segments vides (découpage mal formé)', () {
      expect(syllabesDecoupees('la--pin'), ['la', 'pin']);
      expect(syllabesDecoupees(''), isEmpty);
    });
  });

  group('sequenceModelling', () {
    test('suit le découpage syllabe par syllabe', () {
      expect(sequenceModelling('lapin', 'la-pin'), ['la', 'pin']);
    });

    test('découpage vide → repli sur le mot entier (une étape)', () {
      expect(sequenceModelling('loup', ''), ['loup']);
    });

    test('le nombre d\'étapes de modelling == nombre de syllabes', () {
      expect(sequenceModelling('lavabo', 'la-va-bo').length, 3);
    });
  });

  group('ordreJetons (permutation reproductible, hasard mocké)', () {
    test('retourne une permutation des indices [0, n)', () {
      // tirage identité (renvoie toujours l\'indice max-1 = borne haute) : ordre déterministe.
      final ordre = ordreJetons(5, (max) => max - 1);
      expect(ordre.toSet(), {0, 1, 2, 3, 4});
      expect(ordre.length, 5);
    });

    test('tirage constant 0 → rotation déterministe (Fisher-Yates)', () {
      // Avec tirage(_) = 0, chaque étape échange indices[i] avec indices[0].
      final ordre = ordreJetons(4, (max) => 0);
      // C\'est une permutation valide (test de robustesse : pas de doublon, pas de perte).
      expect(ordre.toSet(), {0, 1, 2, 3});
    });

    test('n=1 → un seul jeton, aucune permutation à faire', () {
      expect(ordreJetons(1, (max) => 0), [0]);
    });

    test('n=0 → liste vide (aucun jeton)', () {
      expect(ordreJetons(0, (max) => 0), isEmpty);
    });
  });
}

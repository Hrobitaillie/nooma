// Oracle croisé du modèle de maîtrise : valeurs IMPRIMÉES côté Node à partir de
// cadrage/simulateur/core/maitrise.ts + params.ts, puis figées ici. Une séquence fixe de
// réponses est rejouée ; on vérifie EXACTEMENT la maîtrise après chaque réponse, la maîtrise
// effective (décroissance) et les compteurs. Tolérance 1e-12 (doc 06 §4).

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/directeur/maitrise.dart';

const double tol = 1e-12;

void main() {
  group('appliquerReponse + maitriseEffective (oracle TS)', () {
    // Séquence fixe : (succes, avecAide, jour, session).
    const seq = <(bool, bool, int, int)>[
      (true, false, 0, 0),
      (true, true, 0, 0),
      (false, false, 1, 1),
      (true, false, 3, 1),
      (true, false, 5, 2),
      (true, true, 10, 3),
    ];
    // Maîtrise attendue après chaque réponse (oracle Node).
    const maitriseAttendue = <double>[
      0.25,
      0.3375,
      0.24935645971202525,
      0.4314901469417526,
      0.5640532644023599,
      0.5424725564937348,
    ];

    test('maîtrise après chaque réponse', () {
      final etat = etatInitial();
      for (var i = 0; i < seq.length; i++) {
        final (succes, avecAide, jour, session) = seq[i];
        appliquerReponse(etat, succes, avecAide, jour, session);
        expect(etat.maitrise, closeTo(maitriseAttendue[i], tol),
            reason: 'réponse #$i');
      }
      // Compteurs finaux.
      expect(etat.rencontres, 6);
      expect(etat.sessionsVues.length, 4);
      expect(etat.dernierJour, 10);
    });

    test('maitriseEffective (décroissance) après la séquence', () {
      final etat = etatInitial();
      for (final (succes, avecAide, jour, session) in seq) {
        appliquerReponse(etat, succes, avecAide, jour, session);
      }
      // dernierJour == 10 ; jour == 10 ⇒ pas de refroidissement.
      expect(maitriseEffective(etat, 10), closeTo(0.5424725564937348, tol));
      // Jours plus tard : refroidissement exponentiel (oracle Node).
      expect(maitriseEffective(etat, 20), closeTo(0.4669104563658504, tol));
      expect(maitriseEffective(etat, 40), closeTo(0.34589577350263817, tol));
    });

    test('maitriseEffective vaut 0 sans rencontre', () {
      expect(maitriseEffective(etatInitial(), 5), 0);
    });
  });

  group('validation et Leitner', () {
    test('estValidable respecte seuil + rencontres + sessions', () {
      // Oracle Node : avec alpha=0.25 il faut 8 réussites pleines pour franchir le
      // seuil de 0.85 (6 n'atteignent que ~0.80 → non validable). On répartit sur 2 sessions.
      final etat = etatInitial();
      for (var i = 0; i < 8; i++) {
        appliquerReponse(etat, true, false, i, i < 4 ? 0 : 1);
      }
      expect(etat.maitrise, greaterThanOrEqualTo(0.85));
      expect(estValidable(etat), isTrue);

      valider(etat, 8);
      expect(etat.validee, isTrue);
      // Premier écho armé à J + leitnerJours[0] (= 1).
      expect(etat.prochainRappel, closeTo(9, tol));
      // Une compétence déjà validée n'est plus « validable ».
      expect(estValidable(etat), isFalse);
    });

    test('6 réussites pleines ne suffisent pas (oracle : maîtrise ~0.80 < seuil)', () {
      final etat = etatInitial();
      for (var i = 0; i < 6; i++) {
        appliquerReponse(etat, true, false, i, i < 3 ? 0 : 1);
      }
      expect(etat.maitrise, closeTo(0.8015397668823552, tol));
      expect(estValidable(etat), isFalse);
    });

    test('appliquerEcho progresse et retombe en boîte 0', () {
      final etat = etatInitial();
      valider(etat, 0);
      appliquerEcho(etat, true, 1); // boîte 0 → 1
      expect(etat.boiteLeitner, 1);
      appliquerEcho(etat, true, 2); // → 2
      expect(etat.boiteLeitner, 2);
      appliquerEcho(etat, false, 3); // raté → retour 0
      expect(etat.boiteLeitner, 0);
      // prochainRappel = jour + leitnerJours[0] = 3 + 1 = 4
      expect(etat.prochainRappel, closeTo(4, tol));
    });
  });
}

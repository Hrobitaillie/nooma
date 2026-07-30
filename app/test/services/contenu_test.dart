// Test du parseur de la banque de syllabes (contenu/banques/syllabes.csv, séparateur « ; »).
// Fonction PURE : pas de rootBundle, pas de binding Flutter. Vérifie l'en-tête ignoré, les
// champs multi-valeurs (competences, distracteursProches) et les types (int, bool).

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/services/contenu.dart';

void main() {
  group('ServiceContenu.parserSyllabes', () {
    test('parse un CSV « ; » avec en-tête, champs simples et multi-valeurs', () {
      const csv = 'mot;syllabesOrales;decoupage;phonemeAttaque;frequence;'
          'competences;distracteursProches;aVerifier;statut\n'
          'chat;1;chat;ch;1;syl-compare;chien;non;a-relire\n'
          'papa;2;pa-pa;p;3;syl-seg2,syl-fusion;maman,tata;oui;valide\n';

      final items = ServiceContenu.parserSyllabes(csv);
      expect(items.length, 2);

      final chat = items[0];
      expect(chat.mot, 'chat');
      expect(chat.syllabesOrales, 1);
      expect(chat.decoupage, 'chat');
      expect(chat.phonemeAttaque, 'ch');
      expect(chat.frequence, 1);
      expect(chat.competences, ['syl-compare']);
      expect(chat.distracteursProches, ['chien']);
      expect(chat.aVerifier, isFalse);
      expect(chat.statut, 'a-relire');

      final papa = items[1];
      expect(papa.syllabesOrales, 2);
      expect(papa.competences, ['syl-seg2', 'syl-fusion']);
      expect(papa.distracteursProches, ['maman', 'tata']);
      expect(papa.aVerifier, isTrue);
    });

    test('champs multi-valeurs vides ⇒ listes vides', () {
      const csv = 'mot;syllabesOrales;decoupage;phonemeAttaque;frequence;'
          'competences;distracteursProches;aVerifier;statut\n'
          'loup;1;loup;l;1;;;non;a-relire\n';
      final items = ServiceContenu.parserSyllabes(csv);
      expect(items.single.competences, isEmpty);
      expect(items.single.distracteursProches, isEmpty);
    });

    test('lignes vides ignorées, CSV vide ⇒ liste vide', () {
      expect(ServiceContenu.parserSyllabes(''), isEmpty);
      expect(ServiceContenu.parserSyllabes('mot;a;b;c;d;e;f;g;h\n'), isEmpty);
    });
  });
}

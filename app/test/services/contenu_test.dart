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

  group('ServiceContenu.parserLignes + RegistreVoix', () {
    const json = '{"version":1,"lignes":['
        '{"id":"consigne-ecoute-mot","texte":"Écoute bien : {mot} !","type":"consigne","variables":["mot"]},'
        '{"id":"feedback-bravo","texte":"Bravo !","type":"feedback","variables":[]},'
        '{"id":"sans-texte","texte":"","type":"consigne"}'
        ']}';

    test('parse le registre en ignorant les entrées à texte vide', () {
      final r = ServiceContenu.parserLignes(json);
      // La ligne « sans-texte » (texte vide) est ignorée → repli utilisé pour cet id.
      expect(r.resoudre('sans-texte', repli: 'REPLI'), 'REPLI');
      expect(r.resoudre('feedback-bravo', repli: 'autre'), 'Bravo !');
    });

    test('resoudre interpole les variables {x} du registre', () {
      final r = ServiceContenu.parserLignes(json);
      expect(
        r.resoudre('consigne-ecoute-mot', repli: 'x', variables: {'mot': 'lapin'}),
        'Écoute bien : lapin !',
      );
    });

    test('id absent ⇒ repli (interpolé) : l\'app ne casse jamais', () {
      final r = ServiceContenu.parserLignes(json);
      expect(
        r.resoudre('id-inconnu', repli: 'Écoute : {mot} !', variables: {'mot': 'chat'}),
        'Écoute : chat !',
      );
    });

    test('RegistreVoix.vide ⇒ toujours le repli', () {
      const r = RegistreVoix.vide();
      expect(r.resoudre('quoi', repli: 'défaut'), 'défaut');
    });
  });
}

// Test du tirage d'items par compétence (logique PURE, hasard mocké).

import 'package:flutter_test/flutter_test.dart';
import 'package:plouma/mecaniques/tirage_items.dart';
import 'package:plouma/services/contenu.dart';

/// Fabrique un item minimal pour les tests.
ItemSyllabes _item(String mot, int syll, List<String> comps) => ItemSyllabes(
      mot: mot,
      syllabesOrales: syll,
      decoupage: mot,
      phonemeAttaque: mot.isNotEmpty ? mot[0] : '',
      frequence: 1,
      competences: comps,
      distracteursProches: const [],
      aVerifier: false,
      statut: 'valide',
    );

void main() {
  final banque = [
    _item('loup', 1, ['syl-compare']),
    _item('lapin', 2, ['syl-seg2', 'syl-compare']),
    _item('sapin', 2, ['syl-seg2', 'syl-compare']),
    _item('lavabo', 3, ['syl-seg3', 'syl-compare']),
    _item('éléphant', 3, ['syl-seg3']),
  ];

  group('itemsPourCompetence', () {
    test('syl-seg2 → uniquement les mots de 2 syllabes tagués', () {
      final r = itemsPourCompetence(banque, 'syl-seg2');
      expect(r.map((e) => e.mot).toSet(), {'lapin', 'sapin'});
    });

    test('syl-seg3 → uniquement les mots de 3 syllabes et plus tagués', () {
      final r = itemsPourCompetence(banque, 'syl-seg3');
      expect(r.map((e) => e.mot).toSet(), {'lavabo', 'éléphant'});
    });

    test('syl-compare → mélange de toutes les longueurs tagués', () {
      final r = itemsPourCompetence(banque, 'syl-compare');
      expect(r.map((e) => e.mot).toSet(),
          {'loup', 'lapin', 'sapin', 'lavabo'});
    });
  });

  group('tirerItem (hasard mocké)', () {
    test('tire l\'item à l\'indice fourni par le mock', () {
      // itemsPourCompetence('syl-seg2') = [lapin, sapin] dans l\'ordre de la banque.
      final it0 = tirerItem(banque, 'syl-seg2', (max) => 0);
      final it1 = tirerItem(banque, 'syl-seg2', (max) => 1);
      expect(it0!.mot, 'lapin');
      expect(it1!.mot, 'sapin');
    });

    test('évite de répéter le même mot deux fois d\'affilée', () {
      // Avec dernierMot=lapin, le pool filtré est [sapin] → indice 0 = sapin.
      final it = tirerItem(banque, 'syl-seg2', (max) {
        expect(max, 1); // le pool est réduit à 1 candidat (sapin)
        return 0;
      }, dernierMot: 'lapin');
      expect(it!.mot, 'sapin');
    });

    test('un seul candidat : la répétition est tolérée (pas de blocage)', () {
      final soloBanque = [_item('éléphant', 3, ['syl-seg3'])];
      final it = tirerItem(soloBanque, 'syl-seg3', (max) => 0,
          dernierMot: 'éléphant');
      expect(it!.mot, 'éléphant');
    });

    test('banque vide pour la compétence → repli par nombre de syllabes', () {
      // 'syl-fusion' n\'est tagué nulle part : repli sur tout item (nbOk générique).
      final it = tirerItem(banque, 'syl-fusion', (max) => 0);
      expect(it, isNotNull);
    });
  });
}

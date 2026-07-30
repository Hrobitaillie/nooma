// Service Contenu — chargement du contenu pédagogique versionné (règle inviolable n°8).
//
// Côté Flutter : lit les assets copiés depuis /contenu (voir tool/sync_contenu.sh), parse
// le JSON/CSV, et construit les objets PURS du Directeur (Graphe) + les banques d'items.
// Tout le contenu est DONNÉE, jamais du code en dur. La lib du Directeur reste pure : c'est
// ICI, dans la couche Flutter, qu'on lit rootBundle — le Graphe reçoit ensuite du JSON parsé.

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../directeur/graphe.dart';

/// Un item de la banque de syllabes (`contenu/banques/syllabes.csv`, séparateur « ; »).
///
/// Colonnes : mot;syllabesOrales;decoupage;phonemeAttaque;frequence;competences;
/// distracteursProches;aVerifier;statut. Les champs multi-valeurs (`competences`,
/// `distracteursProches`) sont des listes séparées par des virgules ; vides ⇒ liste vide.
class ItemSyllabes {
  final String mot;
  final int syllabesOrales;
  final String decoupage;
  final String phonemeAttaque;
  final int frequence;
  final List<String> competences;
  final List<String> distracteursProches;
  final bool aVerifier;
  final String statut;

  const ItemSyllabes({
    required this.mot,
    required this.syllabesOrales,
    required this.decoupage,
    required this.phonemeAttaque,
    required this.frequence,
    required this.competences,
    required this.distracteursProches,
    required this.aVerifier,
    required this.statut,
  });
}

/// Emplacement des assets de contenu (copiés par tool/sync_contenu.sh).
abstract final class CheminsContenu {
  static const String graphe = 'assets/contenu/graphe-competences.json';
  static const String mecaniques = 'assets/contenu/mecaniques.json';
  static const String syllabes = 'assets/contenu/banques/syllabes.csv';
}

/// Chargeur du contenu pédagogique depuis les assets Flutter.
class ServiceContenu {
  /// Construit le graphe de compétences depuis les assets (graphe + mécaniques).
  ///
  /// Le parsing JSON se fait ici ; `Graphe.depuisJson` reste pur (reçoit des Map/List).
  Future<Graphe> chargerGraphe() async {
    final String grapheStr = await rootBundle.loadString(CheminsContenu.graphe);
    final String mecaniquesStr =
        await rootBundle.loadString(CheminsContenu.mecaniques);
    final Map<String, dynamic> grapheJson =
        jsonDecode(grapheStr) as Map<String, dynamic>;
    final Map<String, dynamic> mecaniquesJson =
        jsonDecode(mecaniquesStr) as Map<String, dynamic>;
    return Graphe.depuisJson(grapheJson, mecaniquesJson);
  }

  /// Charge la banque de syllabes depuis le CSV (séparateur « ; »).
  Future<List<ItemSyllabes>> chargerSyllabes() async {
    final String csv = await rootBundle.loadString(CheminsContenu.syllabes);
    return parserSyllabes(csv);
  }

  /// Parse le contenu CSV des syllabes (séparateur « ; »). Fonction PURE et testable.
  ///
  /// La première ligne est l'en-tête. Les lignes vides sont ignorées. Un CSV simple sans
  /// guillemets ni échappement (le contenu pédagogique est validé par npm run lint-contenu).
  static List<ItemSyllabes> parserSyllabes(String csv) {
    final List<String> lignes = const LineSplitter()
        .convert(csv)
        .where((l) => l.trim().isNotEmpty)
        .toList();
    if (lignes.isEmpty) return const [];

    final List<ItemSyllabes> items = [];
    // Ligne 0 = en-tête, on démarre à 1.
    for (int i = 1; i < lignes.length; i++) {
      final List<String> champs = lignes[i].split(';');
      if (champs.length < 9) continue; // ligne malformée : ignorée (le lint est l'autorité)
      items.add(ItemSyllabes(
        mot: champs[0],
        syllabesOrales: int.tryParse(champs[1]) ?? 0,
        decoupage: champs[2],
        phonemeAttaque: champs[3],
        frequence: int.tryParse(champs[4]) ?? 0,
        competences: _liste(champs[5]),
        distracteursProches: _liste(champs[6]),
        aVerifier: champs[7].trim().toLowerCase() == 'oui',
        statut: champs[8].trim(),
      ));
    }
    return items;
  }

  static List<String> _liste(String champ) {
    final String t = champ.trim();
    if (t.isEmpty) return const [];
    return t
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }
}

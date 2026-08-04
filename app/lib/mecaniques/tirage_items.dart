// Tirage d'items par compétence — logique PURE et testable (hasard injecté).
//
// Le Directeur donne une compétence cible ; la mécanique doit tirer un ItemSyllabes adapté
// dans la banque. Les règles (doc 04 §4) : correspondance à la compétence, jamais 2× le même
// mot d'affilée. Le hasard est INJECTÉ (int Function(int max) → indice) pour rendre le tirage
// déterministe en test (mock du hasard), conformément à l'exigence de reproductibilité.

import '../services/contenu.dart';

/// Signature d'un tirage d'entier dans [0, max) — injectable pour les tests.
typedef TirageIndice = int Function(int max);

/// Filtre les items de la banque correspondant à une compétence de segmentation.
///
/// Règles (doc 03 §3.1, banque syllabes) :
///   - `syl-seg2`     → mots de 2 syllabes tagués de la compétence ;
///   - `syl-seg3`     → mots de 3 syllabes et plus ;
///   - `syl-compare`  → mélange (2 et 3+), c'est la comparaison de longueur ;
///   - autre / inconnu → tout item tagué de la compétence (repli générique).
///
/// On exige que l'item porte le tag de la compétence dans sa colonne `competences`, ET que
/// son nombre de syllabes respecte la contrainte de la compétence.
List<ItemSyllabes> itemsPourCompetence(
  List<ItemSyllabes> banque,
  String competence,
) {
  bool nbOk(ItemSyllabes it) {
    switch (competence) {
      case 'syl-seg2':
        return it.syllabesOrales == 2;
      case 'syl-seg3':
        return it.syllabesOrales >= 3;
      case 'syl-compare':
        return it.syllabesOrales >= 1; // mélange : toute longueur
      default:
        return it.syllabesOrales >= 1;
    }
  }

  final tagues = banque
      .where((it) => it.competences.contains(competence) && nbOk(it))
      .toList();
  if (tagues.isNotEmpty) return tagues;

  // Repli : la compétence n'a pas d'item tagué (contenu partiel) → tout item respectant le
  // nombre de syllabes, pour ne jamais bloquer la boucle de jeu en dev.
  return banque.where(nbOk).toList();
}

/// Tire un item pour [competence], en évitant [dernierMot] (jamais 2× le même d'affilée).
///
/// [tirage] fournit l'aléa (indice dans [0, n)). Retourne `null` si la banque ne propose
/// aucun item éligible (cas de contenu vide — l'appelant gère le fallback).
ItemSyllabes? tirerItem(
  List<ItemSyllabes> banque,
  String competence,
  TirageIndice tirage, {
  String? dernierMot,
}) {
  final candidats = itemsPourCompetence(banque, competence);
  if (candidats.isEmpty) return null;

  // Éviter la répétition immédiate si d'autres choix existent.
  final filtres = candidats.length > 1
      ? candidats.where((it) => it.mot != dernierMot).toList()
      : candidats;
  final pool = filtres.isNotEmpty ? filtres : candidats;

  return pool[tirage(pool.length)];
}

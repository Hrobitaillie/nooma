// Cœur PURE et testable de « La boîte à sons » (segmentation par jetons).
//
// L'enfant dépose un jeton dans la boîte pour CHAQUE syllabe entendue. Cette classe ne connaît
// ni l'UI ni le temps réel : elle reçoit les jetons déposés un par un et répond à « combien de
// jetons ? » / « est-ce réussi pour N syllabes ? ». Elle calcule aussi combien de jetons
// PROPOSER (plus que nécessaire, pour que compter soit un vrai choix) et la séquence de
// MODELLING (Plouma montre : un jeton saute tout seul à chaque syllabe).
//
// Test du brocoli (doc 03 §1) : le nombre de jetons attendus == le nombre de syllabes orales du
// mot ; on ne peut pas remplacer les mots par autre chose sans casser le comptage. La mécanique
// EST la segmentation.

import 'tirage_items.dart' show TirageIndice;

/// Délai d'inactivité après le dernier jeton déposé avant validation automatique (doc mission
/// §1 : « auto après ~1,5 s d'inactivité avec ≥1 jeton »).
const Duration kDelaiValidationJetons = Duration(milliseconds: 1500);

/// Nombre minimum de jetons proposés dans la rangée (doc mission §1 : « 4-6 jetons »).
const int kJetonsProposesMin = 4;

/// Nombre maximum de jetons proposés dans la rangée.
const int kJetonsProposesMax = 6;

/// Accumulateur de jetons déposés pour un essai de « La boîte à sons ».
///
/// Analogue pur de [CompteurTaps] pour « Tape la syllabe » : on dépose des jetons un par un et
/// on valide quand l'enfant a fini (bouton « fini » ou inactivité), réussite = jetons déposés
/// == syllabes orales.
class BoiteASons {
  int _deposes = 0;

  /// Nombre de jetons déposés dans la boîte depuis la remise à zéro.
  int get jetonsDeposes => _deposes;

  /// Dépose un jeton dans la boîte (un tap sur un jeton de la rangée).
  void deposer() => _deposes++;

  /// Remet la boîte à zéro (nouvel essai, ou re-jeu après modelling).
  void reinitialiser() => _deposes = 0;

  /// Réussite : le nombre de jetons déposés correspond exactement aux syllabes orales attendues.
  bool reussitePour(int syllabesAttendues) => _deposes == syllabesAttendues;
}

/// Calcule combien de jetons PROPOSER dans la rangée pour un mot de [syllabes] syllabes.
///
/// Règle (doc mission §1) : « Propose 4-6 jetons disponibles (plus que nécessaire) pour que
/// compter soit un vrai choix. » On garantit donc :
///   - au moins [kJetonsProposesMin] (4) jetons ;
///   - au moins 2 jetons de PLUS que nécessaire (le surplus rend le comptage non trivial) ;
///   - jamais plus de [kJetonsProposesMax] (6) — au-delà, la rangée devient illisible pour un
///     enfant de 5-7 ans, et un mot de plus de 4 syllabes reste couvert (4 + 2 = 6).
int jetonsProposes(int syllabes) {
  final int souhaite = syllabes + 2; // toujours un vrai surplus à compter
  final int borneBasse = souhaite < kJetonsProposesMin ? kJetonsProposesMin : souhaite;
  return borneBasse > kJetonsProposesMax ? kJetonsProposesMax : borneBasse;
}

/// Découpe le mot en syllabes à partir de son [decoupage] (colonne CSV, séparateur « - »).
///
/// Fonction PURE partagée par la séquence de modelling et l'affichage écrit. Les segments vides
/// (découpage mal formé) sont écartés ; si le découpage est vide, on retourne une liste vide et
/// l'appelant se rabat sur le mot entier.
List<String> syllabesDecoupees(String decoupage) {
  return decoupage
      .split('-')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
}

/// Séquence de modelling : ce que Plouma prononce, syllabe par syllabe, en faisant sauter un
/// jeton dans la boîte à chaque étape (doc mission §1, « Raté »).
///
/// Retourne la liste ORDONNÉE des syllabes à prononcer (1 jeton saute par élément). Si le
/// découpage est vide (contenu partiel), on se rabat sur le mot entier en une seule étape pour
/// ne jamais bloquer la boucle.
List<String> sequenceModelling(String mot, String decoupage) {
  final syllabes = syllabesDecoupees(decoupage);
  return syllabes.isNotEmpty ? syllabes : [mot];
}

/// Tire l'ordre d'apparition des jetons colorés de la rangée, pour un total de [nbJetons].
///
/// Purement cosmétique (les jetons sont interchangeables pour le comptage — on dépose n'importe
/// lequel), mais on veut un ordre reproductible en test : le hasard est INJECTÉ comme partout
/// dans les mécaniques (voir tirage_items.dart). Retourne une permutation des indices de couleur
/// [0, nbJetons) via un mélange de Fisher-Yates piloté par [tirage].
List<int> ordreJetons(int nbJetons, TirageIndice tirage) {
  final indices = [for (int i = 0; i < nbJetons; i++) i];
  for (int i = indices.length - 1; i > 0; i--) {
    final int j = tirage(i + 1); // indice dans [0, i]
    final int tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices;
}

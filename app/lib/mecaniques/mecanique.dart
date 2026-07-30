// Interface unique des mécaniques de mini-jeux (doc 06 §2).
//
// Chaque mécanique implémente `play(NiveauSpec) → List<LearningEvent>` et partage le cycle
// consigne audio → interaction → feedback → récompense. Une mécanique est un module isolé,
// régénérable indépendamment (doc 06 §7.1). Test du brocoli : si on peut remplacer les
// sons/lettres/mots sans changer le gameplay, la mécanique est ratée (doc 06 §2).
//
// Les TYPES de base (NiveauSpec, LearningEvent) vivent ici pour l'instant. Le NiveauSpec sera
// enrichi quand le Directeur produira de vrais niveaux ; il reste volontairement minimal.

/// Un niveau généré par le Directeur, prêt à être joué par une mécanique.
///
/// Squelette v1 : les champs pédagogiques (items, graphèmes, layout…) seront ajoutés au fil
/// du portage du Directeur. Ce qui est déjà STABLE : l'identité déterministe (seed) et la
/// version de contenu, tous deux journalisés dans chaque LearningEvent (doc 06 §3).
class NiveauSpec {
  /// Identifiant de la mécanique cible (ex. « tri_graphemes »).
  final String mecanique;

  /// Compétence pédagogique travaillée par ce niveau.
  final String competence;

  /// Cran de difficulté servi (0..Params.crans-1).
  final int difficulte;

  /// Seed déterministe du niveau : même seed ⇒ même niveau (doc 06 §2).
  final int seed;

  /// Version du contenu ayant servi à générer le niveau (traçabilité, doc 06 §3).
  final String versionContenu;

  const NiveauSpec({
    required this.mecanique,
    required this.competence,
    required this.difficulte,
    required this.seed,
    required this.versionContenu,
  });
}

/// Événement d'apprentissage émis par une mécanique — unité de l'event log append-only.
///
/// Reflet en mémoire d'une future ligne de la table Drift `learning_events` (doc 06 §3).
/// JAMAIS muté après création (append-only).
class LearningEvent {
  final String exercice;
  final String competence;
  final bool succes;
  final bool avecAide;
  final int dureeMs;
  final int timestamp; // ms epoch
  final int seed;
  final String versionContenu;

  const LearningEvent({
    required this.exercice,
    required this.competence,
    required this.succes,
    required this.avecAide,
    required this.dureeMs,
    required this.timestamp,
    required this.seed,
    required this.versionContenu,
  });
}

/// Contrat commun à toutes les mécaniques (doc 06 §2).
abstract interface class Mecanique {
  /// Joue un niveau et retourne les événements d'apprentissage produits.
  List<LearningEvent> play(NiveauSpec spec);
}

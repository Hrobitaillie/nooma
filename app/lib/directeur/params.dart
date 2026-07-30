// Paramètres du Directeur — portage de cadrage/simulateur/core/params.ts.
// Valeurs pré-validées par Hugo le 30/07/2026 (docs/02 §5, docs/04 §3-7, journal docs/13).
// C'est CE fichier que le simulateur éprouve : chaque valeur est ajustable ici, la simulation
// dit si les cibles produit tiennent. Toute divergence de valeur avec params.ts casse l'oracle.

/// Constantes du Directeur (équivalent de l'objet PARAMS du simulateur TypeScript).
///
/// Regroupées dans une classe à membres statiques `const` : lib PURE, aucun état mutable,
/// aucun import Flutter/Flame (contrainte d'architecture doc 06 §2).
abstract final class Params {
  // — Cible de réussite (doc 02 §5.1 : « règle des 85 % », haut de fourchette 5-7 ans).
  static const double cibleReussiteMin = 0.78;
  static const double cibleReussiteMax = 0.87;

  // — Modèle de maîtrise (doc 04 §3.2 : moyenne glissante pondérée).
  static const double alphaMaitrise = 0.25; // poids d'une nouvelle réponse
  static const double scoreAvecAide = 0.6; // réussite avec indice < réussite seule
  static const double seuilValidation = 0.85; // maîtrise ≥ seuil pour valider
  static const int rencontresMin = 6; // ≥ N rencontres…
  static const int sessionsDistinctesMin = 2; // …sur ≥ 2 sessions

  // — Pré-validation du module (doc 04 §3.2).
  static const int niveauxConfirmation = 3;
  static const double reussiteConfirmation = 0.75;

  // — Répétition espacée : Leitner simplifié (doc 02 §5.4).
  static const List<double> leitnerJours = [1, 2.5, 7, 14];
  static const double decroissanceParJour = 0.015; // refroidissement sans rencontre
  static const double seuilEcho = 0.7; // sous ce seuil ⇒ niveau écho prioritaire

  // — Mix par session (doc 02 §5.4 : 70-80 % nouveau / 20-30 % révision).
  static const double partRevision = 0.25;

  // — Difficulté (doc 04 §4 : 4 crans).
  static const int crans = 4;
  static const int sautMaxDifficulte = 1; // garde-fou : jamais plus d'un cran d'un coup

  // — Session-menu (doc 04 §6.2).
  static const int niveauxCoeurMin = 1;
  static const int niveauxCoeurMax = 2;

  // — Niveaux surprises (doc 04 §7).
  static const double freqNoeudCadeau = 1 / 7; // ~1 niveau sur 6-8
  static const String freqReve = 'hebdo'; // 1re session de la semaine = rêve
  static const double seuilDefi = 0.9; // réussite forte ⇒ défi proposé (refusable)

  // — Anti-monotonie (doc 04 §6.3).
  static const int maxMemeMecaniqueParSession = 2;

  // — Stagnation (doc 04 §2 risque 2).
  static const int stagnationNiveaux = 3;
  static const int stagnationSessions = 3;
}

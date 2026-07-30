// Paramètres du Directeur — valeurs par défaut pré-validées par Hugo le 30/07/2026
// (docs/02 §5, docs/04 §3-7, journal docs/13). C'est CE fichier que le simulateur éprouve :
// chaque valeur est ajustable ici, la simulation dit si les cibles produit tiennent.

export const PARAMS = {
  // — Cible de réussite (doc 02 §5.1 : « règle des 85 % », haut de fourchette pour 5-7 ans)
  cibleReussiteMin: 0.78,
  cibleReussiteMax: 0.87,

  // — Modèle de maîtrise (doc 04 §3.2 : moyenne glissante pondérée)
  alphaMaitrise: 0.25,          // poids d'une nouvelle réponse dans la moyenne glissante
  scoreAvecAide: 0.6,           // réussite avec indice < réussite seule
  seuilValidation: 0.85,        // maîtrise ≥ seuil pour valider une compétence
  rencontresMin: 6,             // ≥ N rencontres…
  sessionsDistinctesMin: 2,     // …réparties sur ≥ 2 sessions (pas de coup de chance)

  // — Pré-validation du module (doc 04 §3.2 : 2-3 niveaux de confirmation sur ≥ 2 sessions)
  niveauxConfirmation: 3,
  reussiteConfirmation: 0.75,   // taux sans aide exigé sur les niveaux de confirmation

  // — Répétition espacée : Leitner simplifié (doc 02 §5.4)
  leitnerJours: [1, 2.5, 7, 14],
  decroissanceParJour: 0.015,   // la maîtrise « refroidit » sans rencontre → déclenche les échos
  seuilEcho: 0.7,               // maîtrise refroidie sous ce seuil ⇒ niveau écho prioritaire

  // — Mix par session (doc 02 §5.4 : 70-80 % nouveau / 20-30 % révision)
  partRevision: 0.25,

  // — Difficulté (doc 04 §4 : 4 crans — nb de choix, vitesse, indiçage)
  crans: 4,
  sautMaxDifficulte: 1,         // garde-fou codé en dur : jamais plus d'un cran d'un coup

  // — Session-menu (doc 04 §6.2 : échauffement → cœur → dessert)
  niveauxCoeurMin: 1,
  niveauxCoeurMax: 2,

  // — Niveaux surprises (doc 04 §7)
  freqNoeudCadeau: 1 / 7,       // ~1 niveau sur 6-8
  freqReve: 'hebdo',            // 1re session de la semaine = rêve (interleaving)
  seuilDefi: 0.9,               // réussite forte ⇒ Plouma propose un défi (refusable)

  // — Anti-monotonie (doc 04 §6.3)
  maxMemeMecaniqueParSession: 2,

  // — Stagnation (doc 04 §2 risque 2)
  stagnationNiveaux: 3,         // N niveaux consécutifs sous la cible sur une même compétence
  stagnationSessions: 3,        // N sessions sans progrès ⇒ signal discret côté parent
} as const;

export type Params = typeof PARAMS;

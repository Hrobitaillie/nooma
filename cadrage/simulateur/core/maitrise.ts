// Modèle de maîtrise v1 (doc 04 §3.2, acté 30/07/2026) : moyenne glissante pondérée
// + décroissance temporelle + règles de validation. Le Directeur ne voit QUE ces scores —
// jamais l'état latent de l'enfant (qui n'existe que dans sim/enfants.ts).

import { PARAMS } from './params.ts';

export interface EtatCompetence {
  maitrise: number;            // 0..1, moyenne glissante
  rencontres: number;
  sessionsVues: Set<number>;   // index de sessions où la compétence a été travaillée
  dernierJour: number;         // dernier jour de rencontre (pour la décroissance)
  validee: boolean;
  jourValidation: number;
  boiteLeitner: number;        // 0..3 → prochains rappels J+1 / J+2-3 / J+7 / J+14
  prochainRappel: number;      // jour du prochain écho dû
  derniereDifficulte: number;  // dernier cran servi (garde-fou saut ≤ 1)
  sousCibleConsecutifs: number; // détection de stagnation
}

export function etatInitial(): EtatCompetence {
  return {
    maitrise: 0, rencontres: 0, sessionsVues: new Set(), dernierJour: -1,
    validee: false, jourValidation: -1, boiteLeitner: 0, prochainRappel: -1,
    derniereDifficulte: 0, sousCibleConsecutifs: 0,
  };
}

/** Maîtrise « refroidie » par le temps sans rencontre — sert au tri des échos. */
export function maitriseEffective(etat: EtatCompetence, jour: number): number {
  if (etat.dernierJour < 0) return 0;
  const jours = Math.max(0, jour - etat.dernierJour);
  return etat.maitrise * Math.exp(-PARAMS.decroissanceParJour * jours);
}

/** Applique une réponse (moyenne glissante pondérée, aide pénalisée). */
export function appliquerReponse(
  etat: EtatCompetence, succes: boolean, avecAide: boolean, jour: number, session: number,
): void {
  const score = succes ? (avecAide ? PARAMS.scoreAvecAide : 1) : 0;
  // On repart de la maîtrise refroidie : une longue absence se paie, comme en vrai.
  const base = maitriseEffective(etat, jour);
  etat.maitrise = base + PARAMS.alphaMaitrise * (score - base);
  etat.rencontres += 1;
  etat.sessionsVues.add(session);
  etat.dernierJour = jour;
}

/** Compétence validée : maîtrise ≥ seuil ET ≥ N rencontres sur ≥ 2 sessions. */
export function estValidable(etat: EtatCompetence): boolean {
  return !etat.validee
    && etat.maitrise >= PARAMS.seuilValidation
    && etat.rencontres >= PARAMS.rencontresMin
    && etat.sessionsVues.size >= PARAMS.sessionsDistinctesMin;
}

export function valider(etat: EtatCompetence, jour: number): void {
  etat.validee = true;
  etat.jourValidation = jour;
  etat.boiteLeitner = 0;
  etat.prochainRappel = jour + PARAMS.leitnerJours[0];
}

/** Écho réussi → boîte suivante ; raté → retour boîte 0 (Leitner). */
export function appliquerEcho(etat: EtatCompetence, succes: boolean, jour: number): void {
  if (succes) {
    etat.boiteLeitner = Math.min(etat.boiteLeitner + 1, PARAMS.leitnerJours.length - 1);
  } else {
    etat.boiteLeitner = 0;
  }
  etat.prochainRappel = jour + PARAMS.leitnerJours[etat.boiteLeitner];
}

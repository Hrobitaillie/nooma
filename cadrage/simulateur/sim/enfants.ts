// Enfants virtuels (doc 04 §8) : un état latent que le Directeur ne voit JAMAIS.
// Le modèle psychométrique est volontairement simple : compétence latente 0..1,
// apprentissage à rendements décroissants, oubli exponentiel vers un plancher,
// réussite = hasard de deviner + sigmoïde(latent − exigence du cran) + bruit.

import { splitmix32, hashString, type Rng } from '../core/rng.ts';
import { getCompetence } from '../core/graphe.ts';
import type { NiveauSpec, ResultatEssai } from '../core/directeur.ts';

export interface Profil {
  nom: string;
  tauxApprentissage: number;  // gain latent par essai réussi
  oubliParJour: number;       // λ de l'oubli exponentiel
  bruit: number;              // variabilité de la réponse (impulsivité, doigts imprécis)
  sessionsParSemaine: number;
  irregulier: boolean;        // semaines en dents de scie (1 à 7 sessions)
  part: number;               // proportion dans la population simulée
}

// Profils synthétiques : rapide / moyen / lent / irrégulier / en difficulté (doc 04 §8).
export const PROFILS: Profil[] = [
  { nom: 'rapide', tauxApprentissage: 0.17, oubliParJour: 0.010, bruit: 0.05, sessionsParSemaine: 6, irregulier: false, part: 0.20 },
  { nom: 'moyen', tauxApprentissage: 0.115, oubliParJour: 0.015, bruit: 0.08, sessionsParSemaine: 5, irregulier: false, part: 0.35 },
  { nom: 'lent', tauxApprentissage: 0.075, oubliParJour: 0.020, bruit: 0.10, sessionsParSemaine: 5, irregulier: false, part: 0.20 },
  { nom: 'irrégulier', tauxApprentissage: 0.115, oubliParJour: 0.020, bruit: 0.12, sessionsParSemaine: 4, irregulier: true, part: 0.15 },
  { nom: 'en difficulté', tauxApprentissage: 0.042, oubliParJour: 0.028, bruit: 0.13, sessionsParSemaine: 4, irregulier: false, part: 0.10 },
];

interface Latent { h: number; pic: number; dernierJour: number; }

export class EnfantVirtuel {
  profil: Profil;
  private latents = new Map<string, Latent>();
  private rng: Rng;

  constructor(profil: Profil, graine: string) {
    this.profil = profil;
    this.rng = splitmix32(hashString(graine));
  }

  private latent(compId: string): Latent {
    let l = this.latents.get(compId);
    if (!l) {
      l = { h: 0.05 + this.rng() * 0.1, pic: 0.15, dernierJour: -1 };
      this.latents.set(compId, l);
    }
    return l;
  }

  /** Oubli : décroissance vers un plancher (on ne retombe jamais à zéro, comme en vrai). */
  private appliquerOubli(l: Latent, jour: number): void {
    if (l.dernierJour >= 0 && jour > l.dernierJour) {
      const plancher = 0.35 * l.pic;
      l.h = plancher + (l.h - plancher) * Math.exp(-this.profil.oubliParJour * (jour - l.dernierJour));
    }
    l.dernierJour = jour;
  }

  /** Jours de session dans la semaine (l'irrégulier alterne semaines pleines et creuses). */
  joursDeSession(semaine: number): number[] {
    const rng = splitmix32(hashString(`${this.profil.nom}-w${semaine}`) ^ Math.floor(this.rng() * 1e9));
    let n = this.profil.sessionsParSemaine;
    if (this.profil.irregulier) n = rng() < 0.4 ? 1 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 4);
    const jours = [0, 1, 2, 3, 4, 5, 6].sort(() => rng() - 0.5).slice(0, Math.min(7, n));
    return jours.sort((a, b) => a - b);
  }

  /**
   * Joue un niveau : pour chaque essai, réussite au 1er coup ou complétion avec aide
   * (jamais d'échec bloquant — principe ✅ doc 04 §4). La fatigue de fin de session
   * dégrade légèrement la réponse (doc 03 §6).
   */
  jouerNiveau(spec: NiveauSpec, jour: number, positionDansSession: number): ResultatEssai[] {
    const essais: ResultatEssai[] = [];
    if (spec.cibles.length === 0) return essais; // nœud cadeau : pas d'apprentissage

    for (let i = 0; i < spec.nbEssais; i++) {
      const cible = spec.cibles[i % spec.cibles.length];
      const comp = getCompetence(cible.competence);
      const l = this.latent(cible.competence);
      this.appliquerOubli(l, jour);

      const nbChoix = 2 + Math.min(2, cible.difficulte);            // 2 → 4 choix (doc 04 §4)
      const pHasard = 1 / nbChoix;
      const exigence = 0.15 + 0.22 * cible.difficulte;              // ce que le cran demande
      const pCompetence = 1 / (1 + Math.exp(-6 * (l.h - exigence)));
      const fatigue = positionDansSession >= 4 ? 0.05 : 0;
      const bruit = (this.rng() - 0.5) * 2 * this.profil.bruit;
      const p = Math.max(0.02, Math.min(0.98, pHasard + (1 - pHasard) * pCompetence + bruit - fatigue));

      const succes = this.rng() < p;
      // Apprentissage : plus lent sur les compétences intrinsèquement dures ; l'essai aidé
      // apprend aussi, mais moins (modelling de Plouma).
      const taux = this.profil.tauxApprentissage * (1 - 0.5 * comp.difficulteIntrinseque);
      l.h = Math.min(1, l.h + taux * (1 - l.h) * (succes ? 1 : 0.55));
      l.pic = Math.max(l.pic, l.h);

      essais.push({ competence: cible.competence, succes, avecAide: !succes });
    }
    return essais;
  }

  /** Le défi de Plouma est refusable — l'enfant accepte une fois sur deux. */
  accepteDefi(): boolean {
    return this.rng() < 0.5;
  }
}

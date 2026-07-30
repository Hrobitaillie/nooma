// Le Directeur — moteur adaptatif pur, sans UI (doc 04 §4-8, doc 06 §4).
// Il ne voit QUE les réponses de l'enfant (via les états de maîtrise), jamais son état
// latent. generateSession(jour, seed) → une session-menu ; recevoir les résultats met
// à jour la maîtrise, la pré-validation de module et le calendrier Leitner.

import { PARAMS } from './params.ts';
import { splitmix32, hashString, pick, type Rng } from './rng.ts';
import {
  ORDRE_MODULES, getModule, competencesDe, getCompetence, type Module,
} from './graphe.ts';
import {
  etatInitial, maitriseEffective, appliquerReponse, estValidable, valider,
  appliquerEcho, type EtatCompetence,
} from './maitrise.ts';

export type TypeNiveau =
  | 'echauffement' | 'coeur' | 'dessert' | 'cadeau'
  | 'echo' | 'reve' | 'defi' | 'confirmation';

export interface NiveauSpec {
  type: TypeNiveau;
  mecanique: string;
  /** Compétences travaillées, avec le cran de difficulté servi (0..3). */
  cibles: { competence: string; difficulte: number }[];
  nbEssais: number;
}

export interface ResultatEssai {
  competence: string;
  succes: boolean;      // réussite au premier essai, sans aide
  avecAide: boolean;    // complété avec indiçage (jamais d'échec bloquant)
}

export interface ResultatNiveau {
  spec: NiveauSpec;
  essais: ResultatEssai[];
}

export interface EvenementDirecteur {
  type: 'validation-competence' | 'pre-validation-module' | 'validation-module'
      | 'changement-biome' | 'intervention-stagnation' | 'signal-parent' | 'retour-apprentissage';
  detail: string;
  jour: number;
}

export class Directeur {
  etats = new Map<string, EtatCompetence>();
  moduleIndex = 0;
  phase: 'apprentissage' | 'confirmation' = 'apprentissage';
  confirmationsReussies = 0;
  confirmationsSessions = new Set<number>();
  niveauxDansBiome = 0;
  historiqueBiomes: { module: string; niveaux: number; jourEntree: number; jourSortie: number }[] = [];
  jourEntreeBiome = 0;
  evenements: EvenementDirecteur[] = [];
  // garde-fous mesurés par la simulation
  violationsSautDifficulte = 0;
  violationsMecanique = 0;
  private derniereMecanique = '';
  private mecaniquesSession = new Map<string, number>();
  private sessionsSansProgres = 0;
  private sommeMaitrisePrecedente = 0;
  private signalEnvoyePourBiome = false;
  private reussitesRecentes: number[] = [];
  private rngGraine: number;

  constructor(graine: string) {
    this.rngGraine = hashString(graine);
    for (const m of ORDRE_MODULES) {
      for (const c of competencesDe(m)) this.etats.set(c.id, etatInitial());
    }
  }

  get moduleCourant(): Module { return getModule(ORDRE_MODULES[this.moduleIndex]); }
  get termine(): boolean { return this.moduleIndex >= ORDRE_MODULES.length; }

  etat(compId: string): EtatCompetence {
    const e = this.etats.get(compId);
    if (!e) throw new Error(`état manquant : ${compId}`);
    return e;
  }

  /** Compétences du module courant dont les prérequis sont validés (ou hors module, donc acquis). */
  private competencesOuvertes(): string[] {
    return this.moduleCourant.competences.filter((id) => {
      const c = getCompetence(id);
      return c.prerequis.every((p) => this.etat(p).validee || !this.moduleCourant.competences.includes(p));
    });
  }

  /** Cible « la plus rentable » : dans la zone proximale — ni acquise, ni hors de portée (doc 04 §4). */
  private choisirCible(jour: number): string {
    const ouvertes = this.competencesOuvertes().filter((id) => !this.etat(id).validee);
    if (ouvertes.length === 0) return this.moduleCourant.competences[0];
    // priorité : maîtrise effective la plus basse d'abord (zone proximale = ce qui est ouvert)
    return ouvertes.sort((a, b) =>
      maitriseEffective(this.etat(a), jour) - maitriseEffective(this.etat(b), jour))[0];
  }

  /** Cran servi : suit la maîtrise, sans jamais sauter plus d'un cran (garde-fou en dur). */
  private difficultePour(compId: string, jour: number): number {
    const e = this.etat(compId);
    const visee = Math.min(PARAMS.crans - 1, Math.floor(maitriseEffective(e, jour) * PARAMS.crans));
    let servie = visee;
    if (Math.abs(visee - e.derniereDifficulte) > PARAMS.sautMaxDifficulte) {
      servie = e.derniereDifficulte + Math.sign(visee - e.derniereDifficulte) * PARAMS.sautMaxDifficulte;
    }
    if (Math.abs(servie - e.derniereDifficulte) > PARAMS.sautMaxDifficulte && e.rencontres > 0) {
      this.violationsSautDifficulte++;
    }
    e.derniereDifficulte = servie;
    return servie;
  }

  /** Mécanique compatible, jamais 2× d'affilée ni plus de 2× par session (doc 04 §6.3). */
  private choisirMecanique(rng: Rng, module: Module, forcerChangement = false): string {
    const dispo = module.mecaniques.filter((m) =>
      m !== this.derniereMecanique && (this.mecaniquesSession.get(m) ?? 0) < PARAMS.maxMemeMecaniqueParSession);
    const choix = dispo.length > 0 ? pick(rng, dispo)
      : module.mecaniques.find((m) => m !== this.derniereMecanique) ?? module.mecaniques[0];
    if (choix === this.derniereMecanique && !forcerChangement) this.violationsMecanique++;
    this.derniereMecanique = choix;
    this.mecaniquesSession.set(choix, (this.mecaniquesSession.get(choix) ?? 0) + 1);
    return choix;
  }

  /** Échos dus : compétences validées dont le rappel Leitner est arrivé, ou refroidies sous le seuil. */
  private echosDus(jour: number): string[] {
    const dus: string[] = [];
    for (const [id, e] of this.etats) {
      if (!e.validee) continue;
      if ((e.prochainRappel >= 0 && jour >= e.prochainRappel)
        || maitriseEffective(e, jour) < PARAMS.seuilEcho) dus.push(id);
    }
    return dus.sort((a, b) => maitriseEffective(this.etat(a), jour) - maitriseEffective(this.etat(b), jour));
  }

  /** Compose la session-menu (doc 04 §6.2) : échauffement → cœur (1-2) → dessert. */
  generateSession(jour: number, session: number, premiereDeLaSemaine: boolean): NiveauSpec[] {
    const rng = splitmix32(this.rngGraine ^ hashString(`s${session}j${jour}`));
    this.mecaniquesSession = new Map();
    const niveaux: NiveauSpec[] = [];
    const module = this.moduleCourant;
    const echos = this.echosDus(jour);

    // 1. Échauffement : compétence la mieux maîtrisée, cran bas → succès garanti.
    const acquises = module.competences
      .filter((id) => this.etat(id).rencontres > 0)
      .sort((a, b) => maitriseEffective(this.etat(b), jour) - maitriseEffective(this.etat(a), jour));
    const compEchauffement = acquises[0] ?? this.choisirCible(jour);
    niveaux.push({
      type: 'echauffement',
      mecanique: this.choisirMecanique(rng, module),
      cibles: [{ competence: compEchauffement, difficulte: Math.max(0, this.etat(compEchauffement).derniereDifficulte - 1) }],
      nbEssais: 4,
    });

    // 2. Cœur : phase confirmation (pré-validation du module) OU apprentissage en zone proximale.
    if (this.phase === 'confirmation') {
      const melange = [...module.competences].sort(() =>rng() - 0.5).slice(0, 3);
      niveaux.push({
        type: 'confirmation',
        mecanique: this.choisirMecanique(rng, module),
        cibles: melange.map((c) => ({ competence: c, difficulte: this.etat(c).derniereDifficulte })),
        nbEssais: 6,
      });
    } else {
      const nbCoeur = PARAMS.niveauxCoeurMin
        + (rng() < 0.5 ? PARAMS.niveauxCoeurMax - PARAMS.niveauxCoeurMin : 0);
      for (let i = 0; i < nbCoeur; i++) {
        const cible = this.choisirCible(jour);
        const cibles = [{ competence: cible, difficulte: this.difficultePour(cible, jour) }];
        // mix 70-80/20-30 : une compétence d'entretien glissée dans le niveau
        if (echos.length > 0 && rng() < PARAMS.partRevision * 2) {
          const entretien = echos.shift() as string;
          cibles.push({ competence: entretien, difficulte: this.etat(entretien).derniereDifficulte });
        }
        niveaux.push({ type: 'coeur', mecanique: this.choisirMecanique(rng, module), cibles, nbEssais: 6 });
      }
    }

    // 3. Rêve de Plouma (1re session de la semaine) : interleaving de biomes passés.
    if (premiereDeLaSemaine && this.moduleIndex > 0) {
      const passees = [...this.etats.entries()].filter(([, e]) => e.validee).map(([id]) => id);
      if (passees.length >= 2) {
        const choisies = [...passees].sort(() => rng() - 0.5).slice(0, 3);
        niveaux.push({
          type: 'reve', mecanique: this.choisirMecanique(rng, module),
          cibles: choisies.map((c) => ({ competence: c, difficulte: this.etat(c).derniereDifficulte })),
          nbEssais: 5,
        });
      }
    }

    // 4. Dessert : écho déguisé si un rappel est dû, sinon cadeau ou niveau plaisir.
    if (echos.length > 0) {
      const echo = echos.shift() as string;
      niveaux.push({
        type: 'echo', mecanique: this.choisirMecanique(rng, module),
        cibles: [{ competence: echo, difficulte: this.etat(echo).derniereDifficulte }],
        nbEssais: 4,
      });
    } else if (rng() < PARAMS.freqNoeudCadeau * niveaux.length) {
      niveaux.push({ type: 'cadeau', mecanique: this.choisirMecanique(rng, module), cibles: [], nbEssais: 0 });
    }

    // 5. Défi de Plouma : seulement en réussite forte, refusable (l'acceptation est simulée côté enfant).
    const tauxRecent = this.reussitesRecentes.length >= 8
      ? this.reussitesRecentes.reduce((a, b) => a + b, 0) / this.reussitesRecentes.length : 0;
    if (tauxRecent >= PARAMS.seuilDefi && this.phase === 'apprentissage' && rng() < 0.5) {
      const cible = this.choisirCible(jour);
      const e = this.etat(cible);
      niveaux.push({
        type: 'defi', mecanique: this.choisirMecanique(rng, module),
        cibles: [{ competence: cible, difficulte: Math.min(PARAMS.crans - 1, e.derniereDifficulte + 1) }],
        nbEssais: 4,
      });
    }

    return niveaux;
  }

  /** Ingère les résultats d'une session complète et fait avancer la machine (validation, biome…). */
  recevoirSession(resultats: ResultatNiveau[], jour: number, session: number): void {
    let progres = false;
    const sommeMaitriseAvant = this.sommeMaitrisePrecedente;

    for (const { spec, essais } of resultats) {
      if (spec.type === 'cadeau') { this.niveauxDansBiome++; continue; }
      const sansAide = essais.filter((e) => e.succes).length;
      const taux = essais.length > 0 ? sansAide / essais.length : 1;
      this.reussitesRecentes.push(...essais.map((e) => (e.succes ? 1 : 0)));
      if (this.reussitesRecentes.length > 30) {
        this.reussitesRecentes = this.reussitesRecentes.slice(-30);
      }

      for (const essai of essais) {
        const e = this.etat(essai.competence);
        if (spec.type === 'echo' || spec.type === 'reve') {
          appliquerEcho(e, essai.succes, jour);
          appliquerReponse(e, essai.succes, essai.avecAide, jour, session);
        } else {
          appliquerReponse(e, essai.succes, essai.avecAide, jour, session);
        }
      }
      if (spec.cibles.some((c) => this.moduleCourant.competences.includes(c.competence))) {
        this.niveauxDansBiome++;
      }

      // Stagnation : N niveaux consécutifs sous la cible sur la même compétence cible
      // → bascule de mécanique + redescente d'un cran (doc 04 §2 risque 2).
      const cible = spec.cibles[0];
      if (cible && (spec.type === 'coeur' || spec.type === 'confirmation')) {
        const e = this.etat(cible.competence);
        if (taux < PARAMS.cibleReussiteMin) {
          e.sousCibleConsecutifs++;
          if (e.sousCibleConsecutifs >= PARAMS.stagnationNiveaux) {
            e.derniereDifficulte = Math.max(0, e.derniereDifficulte - 1);
            e.sousCibleConsecutifs = 0;
            this.evenements.push({ type: 'intervention-stagnation', detail: cible.competence, jour });
          }
        } else {
          e.sousCibleConsecutifs = 0;
        }
      }

      // Pré-validation : niveaux de confirmation réussis / ratés (doc 04 §3.2).
      if (spec.type === 'confirmation') {
        if (taux >= PARAMS.reussiteConfirmation) {
          this.confirmationsReussies++;
          this.confirmationsSessions.add(session);
        } else {
          const faible = spec.cibles.sort((a, b) => this.etat(a.competence).maitrise - this.etat(b.competence).maitrise)[0];
          this.phase = 'apprentissage';
          this.confirmationsReussies = 0;
          this.confirmationsSessions.clear();
          this.etat(faible.competence).validee = false; // retour en apprentissage ciblé
          this.evenements.push({ type: 'retour-apprentissage', detail: faible.competence, jour });
        }
      }
    }

    // Validations de compétences
    for (const id of this.moduleCourant.competences) {
      const e = this.etat(id);
      if (estValidable(e)) {
        valider(e, jour);
        progres = true;
        this.evenements.push({ type: 'validation-competence', detail: id, jour });
      }
    }

    // Toutes les compétences cœur validées → entrée en pré-validation
    if (this.phase === 'apprentissage'
      && this.moduleCourant.competences.every((id) => this.etat(id).validee)) {
      this.phase = 'confirmation';
      this.confirmationsReussies = 0;
      this.confirmationsSessions.clear();
      this.evenements.push({ type: 'pre-validation-module', detail: this.moduleCourant.id, jour });
    }

    // Pré-validation aboutie (2-3 niveaux de confirmation sur ≥ 2 sessions) → grande aventure → biome suivant
    if (this.phase === 'confirmation'
      && this.confirmationsReussies >= PARAMS.niveauxConfirmation
      && this.confirmationsSessions.size >= PARAMS.sessionsDistinctesMin) {
      this.evenements.push({ type: 'validation-module', detail: this.moduleCourant.id, jour });
      this.historiqueBiomes.push({
        module: this.moduleCourant.id, niveaux: this.niveauxDansBiome,
        jourEntree: this.jourEntreeBiome, jourSortie: jour,
      });
      this.jourEntreeBiome = jour;
      this.signalEnvoyePourBiome = false;
      this.moduleIndex++;
      this.phase = 'apprentissage';
      this.confirmationsReussies = 0;
      this.confirmationsSessions.clear();
      this.niveauxDansBiome = 0;
      if (!this.termine) {
        this.evenements.push({ type: 'changement-biome', detail: this.moduleCourant.id, jour });
      }
    }
    if (this.termine) return; // tout le graphe est validé : plus rien à piloter

    // Progrès mesurable = une validation OU la maîtrise cumulée du module courant qui monte.
    const sommeMaitrise = this.termine ? 0
      : this.moduleCourant.competences.reduce((a, id) => a + this.etat(id).maitrise, 0);
    if (sommeMaitrise - sommeMaitriseAvant > 0.02) progres = true;
    this.sommeMaitrisePrecedente = sommeMaitrise;

    // Signal discret côté parent après N sessions sans progrès mesurable (doc 04 §2).
    if (progres) {
      this.sessionsSansProgres = 0;
    } else {
      this.sessionsSansProgres++;
      if (this.sessionsSansProgres >= PARAMS.stagnationSessions) {
        this.evenements.push({ type: 'signal-parent', detail: this.moduleCourant.id, jour });
        this.sessionsSansProgres = 0;
      }
    }

    // Filet de secours (trouvé par simulation) : un enfant peut progresser « un tout petit
    // peu » à chaque session et rester des semaines dans un biome sans jamais déclencher
    // la détection par progrès — au-delà d'un volume anormal de niveaux, on signale aussi.
    if (!this.signalEnvoyePourBiome && this.niveauxDansBiome >= 55) {
      this.evenements.push({ type: 'signal-parent', detail: this.moduleCourant.id, jour });
      this.signalEnvoyePourBiome = true;
    }
  }
}

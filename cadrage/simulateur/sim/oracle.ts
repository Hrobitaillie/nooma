// Oracle croisé du DIRECTEUR ENTIER (doc 06 §4). Ce script fige, côté TypeScript (la
// référence), le comportement exact du Directeur sur un scénario 100 % DÉTERMINISTE :
// une graine fixe + un « enfant » scripté par une règle arithmétique (PAS l'EnfantVirtuel
// aléatoire de enfants.ts). La sortie JSON est rejouée à l'identique par le port Dart
// (app/test/directeur/directeur_test.dart) et comparée champ à champ.
//
// Règle de l'enfant scripté (fixe, reproductible) : dans un niveau donné à la position
// `pos` dans la session, l'essai `i` RÉUSSIT ssi (i + pos) % 4 != 0. Les nœuds cadeau
// (0 essai) ne produisent rien. `avecAide` = !succes (jamais d'échec bloquant, doc 04 §4).
//
// Exécuter : node --experimental-strip-types cadrage/simulateur/sim/oracle.ts > \
//            app/test/directeur/oracle_directeur.json

import { Directeur, type NiveauSpec, type ResultatEssai, type ResultatNiveau }
  from '../core/directeur.ts';

const GRAINE = 'oracle-plouma-1';
const N_SESSIONS = 10;

/** Enfant scripté déterministe : succès ssi (i + pos) % 4 != 0. */
function jouerNiveau(spec: NiveauSpec, pos: number): ResultatEssai[] {
  const essais: ResultatEssai[] = [];
  for (let i = 0; i < spec.nbEssais; i++) {
    const cible = spec.cibles[i % spec.cibles.length];
    const succes = (i + pos) % 4 !== 0;
    essais.push({ competence: cible.competence, succes, avecAide: !succes });
  }
  return essais;
}

const directeur = new Directeur(GRAINE);

interface SessionJson {
  jour: number;
  session: number;
  premiereDeLaSemaine: boolean;
  specs: {
    type: string;
    mecanique: string;
    cibles: { competence: string; difficulte: number }[];
    nbEssais: number;
  }[];
}

const sessions: SessionJson[] = [];

for (let s = 0; s < N_SESSIONS; s++) {
  const jour = s * 2;                         // jours 0, 2, 4, …
  const premiere = jour % 7 === 0;            // première de la semaine
  const niveaux = directeur.generateSession(jour, s, premiere);

  sessions.push({
    jour,
    session: s,
    premiereDeLaSemaine: premiere,
    specs: niveaux.map((n) => ({
      type: n.type,
      mecanique: n.mecanique,
      cibles: n.cibles.map((c) => ({ competence: c.competence, difficulte: c.difficulte })),
      nbEssais: n.nbEssais,
    })),
  });

  const resultats: ResultatNiveau[] = niveaux.map((spec, pos) => ({
    spec,
    essais: jouerNiveau(spec, pos),
  }));
  directeur.recevoirSession(resultats, jour, s);
}

// États finaux (arrondis 1e-12 pour une comparaison stable des doubles).
const arr = (x: number) => Math.round(x * 1e12) / 1e12;
const etatsFinaux: Record<string, {
  maitrise: number; validee: boolean; boiteLeitner: number;
  rencontres: number; derniereDifficulte: number;
}> = {};
for (const [id, e] of directeur.etats) {
  etatsFinaux[id] = {
    maitrise: arr(e.maitrise),
    validee: e.validee,
    boiteLeitner: e.boiteLeitner,
    rencontres: e.rencontres,
    derniereDifficulte: e.derniereDifficulte,
  };
}

const sortie = {
  meta: { graine: GRAINE, sessions: N_SESSIONS },
  sessions,
  etatsFinaux,
  evenements: directeur.evenements.map((ev) => ({
    type: ev.type, detail: ev.detail, jour: ev.jour,
  })),
  moduleIndex: directeur.moduleIndex,
  historiqueBiomes: directeur.historiqueBiomes,
  violationsSautDifficulte: directeur.violationsSautDifficulte,
  violationsMecanique: directeur.violationsMecanique,
};

process.stdout.write(JSON.stringify(sortie, null, 2) + '\n');

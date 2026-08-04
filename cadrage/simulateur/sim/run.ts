// Harnais de simulation (doc 04 §8) : N enfants virtuels × M semaines contre le Directeur.
// Vérifie statistiquement les cibles produit et écrit out/results.json pour le dashboard.
//
// Usage : npm run sim              (500 enfants × 24 semaines)
//         npm run sim -- --enfants 2000 --semaines 30 --seed nooma

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARAMS } from '../core/params.ts';
import { ORDRE_MODULES } from '../core/graphe.ts';
import { Directeur, type ResultatNiveau } from '../core/directeur.ts';
import { EnfantVirtuel, PROFILS } from './enfants.ts';
import { splitmix32, hashString } from '../core/rng.ts';

const argv = process.argv.slice(2);
function arg(nom: string, defaut: number): number {
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 ? Number(argv[i + 1]) : defaut;
}
const N_ENFANTS = arg('enfants', 500);
const N_SEMAINES = arg('semaines', 24);
const SEED = (() => { const i = argv.indexOf('--seed'); return i >= 0 ? argv[i + 1] : 'plouma'; })();

interface StatSemaine { essais: number; succes: number; essaisRevision: number; }

interface StatEnfant {
  profil: string;
  essais: number;
  succes: number;
  essaisRevision: number;
  parSemaine: StatSemaine[];
  modulesValides: number;
  niveauxParBiome: { module: string; niveaux: number; jours: number }[];
  coince: boolean;               // > 60 niveaux dans un même biome (tapis roulant)
  signauxParent: number;
  interventionsStagnation: number;
  violations: number;
}

const stats: StatEnfant[] = [];
const rngPop = splitmix32(hashString(SEED));

// Répartition des profils dans la population
function tirerProfil(): (typeof PROFILS)[number] {
  const r = rngPop();
  let cumul = 0;
  for (const p of PROFILS) { cumul += p.part; if (r < cumul) return p; }
  return PROFILS[PROFILS.length - 1];
}

console.log(`Simulation : ${N_ENFANTS} enfants × ${N_SEMAINES} semaines (seed « ${SEED} »)…`);
const t0 = Date.now();

for (let n = 0; n < N_ENFANTS; n++) {
  const profil = tirerProfil();
  const enfant = new EnfantVirtuel(profil, `${SEED}-enfant-${n}`);
  const directeur = new Directeur(`${SEED}-dir-${n}`);
  const stat: StatEnfant = {
    profil: profil.nom, essais: 0, succes: 0, essaisRevision: 0,
    parSemaine: Array.from({ length: N_SEMAINES }, () => ({ essais: 0, succes: 0, essaisRevision: 0 })),
    modulesValides: 0, niveauxParBiome: [], coince: false,
    signauxParent: 0, interventionsStagnation: 0, violations: 0,
  };

  let session = 0;
  for (let semaine = 0; semaine < N_SEMAINES && !directeur.termine; semaine++) {
    const jours = enfant.joursDeSession(semaine);
    let premiere = true;
    for (const j of jours) {
      if (directeur.termine) break;
      const jour = semaine * 7 + j;
      const niveaux = directeur.generateSession(jour, session, premiere);
      premiere = false;

      const resultats: ResultatNiveau[] = [];
      let position = 0;
      for (const spec of niveaux) {
        if (spec.type === 'defi' && !enfant.accepteDefi()) continue; // refuser est ok ✅
        const essais = enfant.jouerNiveau(spec, jour, position++);
        resultats.push({ spec, essais });
        for (const e of essais) {
          stat.essais++;
          stat.parSemaine[semaine].essais++;
          if (e.succes) { stat.succes++; stat.parSemaine[semaine].succes++; }
          if (spec.type === 'echo' || spec.type === 'reve') {
            stat.essaisRevision++;
            stat.parSemaine[semaine].essaisRevision++;
          }
        }
      }
      directeur.recevoirSession(resultats, jour, session);
      session++;
      if (directeur.niveauxDansBiome > 60) stat.coince = true; // tapis roulant : ~2× la sortie typique
    }
  }

  stat.modulesValides = directeur.historiqueBiomes.length;
  stat.niveauxParBiome = directeur.historiqueBiomes.map((h) => ({
    module: h.module, niveaux: h.niveaux, jours: h.jourSortie - h.jourEntree,
  }));
  stat.signauxParent = directeur.evenements.filter((e) => e.type === 'signal-parent').length;
  stat.interventionsStagnation = directeur.evenements.filter((e) => e.type === 'intervention-stagnation').length;
  stat.violations = directeur.violationsSautDifficulte + directeur.violationsMecanique;
  stats.push(stat);
}

// ————— Agrégats —————
function mediane(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
const somme = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const profils = PROFILS.map((p) => p.nom);
const parProfil = Object.fromEntries(profils.map((nom) => {
  const xs = stats.filter((s) => s.profil === nom);
  const essais = somme(xs.map((s) => s.essais));
  return [nom, {
    n: xs.length,
    tauxReussite: essais > 0 ? somme(xs.map((s) => s.succes)) / essais : NaN,
    modulesValidesMediane: mediane(xs.map((s) => s.modulesValides)),
    niveauxParBiomeMediane: mediane(xs.flatMap((s) => s.niveauxParBiome.map((b) => b.niveaux))),
    joursParBiomeMediane: mediane(xs.flatMap((s) => s.niveauxParBiome.map((b) => b.jours))),
    coinces: xs.filter((s) => s.coince).length,
    coincesAvecSignal: xs.filter((s) => s.coince && s.signauxParent > 0).length,
    tauxParSemaine: Array.from({ length: N_SEMAINES }, (_, w) => {
      const e = somme(xs.map((s) => s.parSemaine[w].essais));
      return e > 0 ? somme(xs.map((s) => s.parSemaine[w].succes)) / e : null;
    }),
  }];
}));

const essaisTotal = somme(stats.map((s) => s.essais));
const global = {
  tauxReussite: somme(stats.map((s) => s.succes)) / essaisTotal,
  partRevision: somme(stats.map((s) => s.essaisRevision)) / essaisTotal,
  violations: somme(stats.map((s) => s.violations)),
  interventionsStagnation: somme(stats.map((s) => s.interventionsStagnation)),
  signauxParent: somme(stats.map((s) => s.signauxParent)),
  coinces: stats.filter((s) => s.coince).length,
  coincesSansSignal: stats.filter((s) => s.coince && s.signauxParent === 0).length,
};

// Histogramme des niveaux par biome (tous profils sauf « en difficulté », cible 8-15 du doc 04 §2)
const niveauxSortie = stats.filter((s) => s.profil !== 'en difficulté')
  .flatMap((s) => s.niveauxParBiome.map((b) => b.niveaux));
const histo: Record<string, number> = {};
for (const v of niveauxSortie) {
  const bac = v <= 5 ? '≤5' : v <= 10 ? '6-10' : v <= 15 ? '11-15' : v <= 20 ? '16-20' : v <= 30 ? '21-30' : '>30';
  histo[bac] = (histo[bac] ?? 0) + 1;
}

const verdicts = [
  {
    nom: `Taux de réussite global dans la cible ${PARAMS.cibleReussiteMin * 100}-${PARAMS.cibleReussiteMax * 100} %`,
    valeur: `${(global.tauxReussite * 100).toFixed(1)} %`,
    ok: global.tauxReussite >= PARAMS.cibleReussiteMin && global.tauxReussite <= PARAMS.cibleReussiteMax,
  },
  {
    nom: 'Sortie de biome typique en 8-15 niveaux (profils hors difficulté)',
    valeur: `médiane ${mediane(niveauxSortie)}`,
    ok: mediane(niveauxSortie) >= 8 && mediane(niveauxSortie) <= 15,
  },
  {
    nom: 'Part de révision (échos + rêves) proche de 20-30 %',
    valeur: `${(global.partRevision * 100).toFixed(1)} %`,
    ok: global.partRevision >= 0.12 && global.partRevision <= 0.35,
  },
  {
    nom: 'Garde-fous : zéro saut de difficulté > 1 cran, zéro mécanique répétée',
    valeur: `${global.violations} violation(s)`,
    ok: global.violations === 0,
  },
  {
    nom: 'Aucun enfant coincé (> 60 niveaux/biome) sans signal parent',
    valeur: `${global.coinces} coincé(s), ${global.coincesSansSignal} sans signal`,
    ok: global.coincesSansSignal === 0,
  },
];

const results = {
  meta: {
    seed: SEED, enfants: N_ENFANTS, semaines: N_SEMAINES,
    dureeMs: Date.now() - t0, params: PARAMS, modules: ORDRE_MODULES,
  },
  verdicts, global, parProfil, histoNiveauxParBiome: histo,
};

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2) + '\n');

// ————— Résumé console —————
console.log(`\nTerminé en ${((Date.now() - t0) / 1000).toFixed(1)} s — ${essaisTotal.toLocaleString('fr-FR')} essais simulés.\n`);
for (const v of verdicts) console.log(` ${v.ok ? '✅' : '❌'} ${v.nom} → ${v.valeur}`);
console.log('\nPar profil :');
for (const [nom, p] of Object.entries(parProfil)) {
  console.log(
    `  ${nom.padEnd(14)} n=${String(p.n).padStart(3)}  réussite ${(p.tauxReussite * 100).toFixed(1).padStart(5)} %` +
    `  modules validés (méd.) ${p.modulesValidesMediane}/${ORDRE_MODULES.length}` +
    `  niveaux/biome (méd.) ${p.niveauxParBiomeMediane}  jours/biome (méd.) ${p.joursParBiomeMediane}` +
    (p.coinces > 0 ? `  ⚠️ coincés ${p.coinces} (signalés ${p.coincesAvecSignal})` : ''),
  );
}
console.log(`\nInterventions stagnation : ${global.interventionsStagnation} · signaux parent : ${global.signauxParent}`);
console.log('Dashboard : http://localhost:8090/#/simulateur (npm start)');

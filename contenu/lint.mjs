// Lint du contenu pédagogique (doc 06 §2 : « des scripts de lint valident tout ») —
// zéro dépendance. Valide le graphe de compétences et les banques d'items, puis génère
// la vue lisible `graphe-competences.md` (pour relecture dans le viewer).
//
// Usage : npm run lint-contenu

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const erreurs = [];
const avertissements = [];

const graphe = JSON.parse(readFileSync(join(ROOT, 'graphe-competences.json'), 'utf8'));
const MECANIQUES = new Set(
  JSON.parse(readFileSync(join(ROOT, 'mecaniques.json'), 'utf8')).mecaniques.map((m) => m.id),
);

// ————— Graphe —————
const piliers = new Set(graphe.piliers.map((p) => p.id));
const comps = new Map(); // id → { comp, module }
const ordres = new Set();

for (const mod of graphe.modules) {
  if (!piliers.has(mod.pilier)) erreurs.push(`module ${mod.id} : pilier inconnu « ${mod.pilier} »`);
  if (ordres.has(mod.ordre)) erreurs.push(`module ${mod.id} : ordre ${mod.ordre} en double`);
  ordres.add(mod.ordre);
  for (const c of mod.competences) {
    if (comps.has(c.id)) erreurs.push(`compétence ${c.id} : id en double`);
    comps.set(c.id, { comp: c, module: mod });
    if (c.mecaniques.length === 0) erreurs.push(`compétence ${c.id} : aucune mécanique`);
    for (const m of c.mecaniques) if (!MECANIQUES.has(m)) erreurs.push(`compétence ${c.id} : mécanique inconnue « ${m} »`);
    if (!(c.difficulte >= 0 && c.difficulte <= 1)) erreurs.push(`compétence ${c.id} : difficulté hors [0,1]`);
  }
}

for (const [id, { comp, module }] of comps) {
  for (const p of comp.prerequis) {
    const cible = comps.get(p);
    if (!cible) { erreurs.push(`compétence ${id} : prérequis inconnu « ${p} »`); continue; }
    // le simulateur (et la carte) supposent des modules séquencés : un prérequis ne peut
    // pas venir d'un module POSTÉRIEUR
    if (cible.module.ordre > module.ordre) {
      erreurs.push(`compétence ${id} (module ${module.id}) : prérequis ${p} dans un module postérieur (${cible.module.id})`);
    }
  }
}

// cycles (parcours en profondeur)
const etatVisite = new Map();
function visite(id, chemin) {
  if (etatVisite.get(id) === 'fait') return;
  if (etatVisite.get(id) === 'encours') { erreurs.push(`cycle de prérequis : ${[...chemin, id].join(' → ')}`); return; }
  etatVisite.set(id, 'encours');
  for (const p of comps.get(id)?.comp.prerequis ?? []) visite(p, [...chemin, id]);
  etatVisite.set(id, 'fait');
}
for (const id of comps.keys()) visite(id, []);

// ————— Banques —————
const banques = readdirSync(join(ROOT, 'banques')).filter((f) => f.endsWith('.csv'));
const statsBanques = [];

for (const fichier of banques) {
  const lignes = readFileSync(join(ROOT, 'banques', fichier), 'utf8').trim().split('\n');
  const entetes = lignes[0].split(';');
  const attendu = ['mot', 'syllabesOrales', 'decoupage', 'phonemeAttaque', 'frequence', 'competences', 'distracteursProches', 'aVerifier'];
  if (entetes.join(';') !== attendu.join(';')) {
    erreurs.push(`${fichier} : en-têtes inattendus (${entetes.join(';')})`);
    continue;
  }
  const mots = new Set();
  const items = lignes.slice(1).map((l) => {
    const v = l.split(';');
    return Object.fromEntries(attendu.map((k, i) => [k, v[i] ?? '']));
  });
  let aVerifier = 0;
  for (const it of items) {
    if (mots.has(it.mot)) erreurs.push(`${fichier} : mot en double « ${it.mot} »`);
    mots.add(it.mot);
    const n = Number(it.syllabesOrales);
    const segments = it.decoupage.split('-').length;
    if (segments !== n) erreurs.push(`${fichier} : « ${it.mot} » — ${n} syllabes annoncées mais découpage en ${segments} (${it.decoupage})`);
    if (!['1', '2', '3'].includes(it.frequence)) erreurs.push(`${fichier} : « ${it.mot} » — fréquence invalide (${it.frequence})`);
    for (const c of it.competences.split('|')) {
      if (!comps.has(c)) erreurs.push(`${fichier} : « ${it.mot} » — compétence inconnue « ${c} »`);
    }
    if (!['oui', 'non'].includes(it.aVerifier)) erreurs.push(`${fichier} : « ${it.mot} » — aVerifier doit être oui/non`);
    if (it.aVerifier === 'oui') aVerifier++;
  }
  for (const it of items) {
    for (const d of it.distracteursProches.split('|').filter(Boolean)) {
      if (!mots.has(d)) avertissements.push(`${fichier} : « ${it.mot} » — distracteur « ${d} » absent de la banque`);
    }
  }
  statsBanques.push({ fichier, nb: items.length, aVerifier, items });
}

// ————— Vue lisible (relecture orthophoniste) —————
const nbComps = comps.size;
let md = `# Graphe de compétences — v1 à relire\n\n> ⚠️ **Document généré** par \`npm run lint-contenu\` depuis \`contenu/graphe-competences.json\` — ne pas éditer à la main.\n> ${graphe.statut}\n\n${graphe.note}\n\n**${graphe.modules.length} modules (= biomes) · ${nbComps} compétences · 4 piliers.**\n`;

const ordonnes = [...graphe.modules].sort((a, b) => a.ordre - b.ordre);
for (const mod of ordonnes) {
  const pilier = graphe.piliers.find((p) => p.id === mod.pilier)?.nom;
  md += `\n## ${mod.ordre}. ${mod.nom} — biome « ${mod.biome} » *(${pilier})*\n\n${mod.description}\n\n`;
  md += `| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |\n|---|---|---|---|---|\n`;
  for (const c of mod.competences) {
    md += `| **${c.nom}** \`${c.id}\` | ${c.prerequis.map((p) => `\`${p}\``).join(', ') || '—'} | ${c.mecaniques.join(', ')} | ${c.graphemesIntroduits.join(', ') || '—'} | ${'●'.repeat(Math.round(c.difficulte * 4)) || '○'} |\n`;
  }
}

md += `\n## Banques d'items\n\n`;
for (const b of statsBanques) {
  md += `- \`banques/${b.fichier}\` : **${b.nb} items**, dont ${b.aVerifier} marqués « à vérifier » (découpage syllabique oral à arbitrer — e caduc).\n`;
}
md += `\n*Progression des graphèmes cumulée (ordre d'introduction par module) :* `;
md += ordonnes.flatMap((m) => m.competences.flatMap((c) => c.graphemesIntroduits)).join(', ') + '.\n';

writeFileSync(join(ROOT, 'graphe-competences.md'), md);

// ————— Rapport —————
for (const a of avertissements) console.warn(`⚠️  ${a}`);
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`❌ ${e}`);
  console.error(`\n${erreurs.length} erreur(s).`);
  process.exit(1);
}
console.log(`✅ Contenu valide : ${graphe.modules.length} modules, ${nbComps} compétences, ${statsBanques.map((b) => `${b.nb} items (${b.fichier})`).join(', ')}.`);
console.log('Vue de relecture régénérée : contenu/graphe-competences.md');

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
  const attendu = ['mot', 'syllabesOrales', 'decoupage', 'phonemeAttaque', 'frequence', 'competences', 'distracteursProches', 'aVerifier', 'statut'];
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
    if (!['a-relire', 'valide'].includes(it.statut)) erreurs.push(`${fichier} : « ${it.mot} » — statut doit être a-relire/valide`);
  }
  for (const it of items) {
    for (const d of it.distracteursProches.split('|').filter(Boolean)) {
      if (!mots.has(d)) avertissements.push(`${fichier} : « ${it.mot} » — distracteur « ${d} » absent de la banque`);
    }
  }
  statsBanques.push({ fichier, nb: items.length, aVerifier, valides: items.filter((i) => i.statut === 'valide').length, items });
}

// ————— Registre des lignes de texte (doc 18 §4) —————
// Valide contenu/voix/lignes.json : ids uniques kebab-case, types dans l'enum, texte non vide,
// variables déclarées ⊆ variables utilisées {x} dans le texte. Le statut audio ne vit PAS ici
// (dérivé du studio) ; ce registre = le TEXTE + sa métadonnée éditoriale.
const TYPES_LIGNES = new Set(['consigne', 'feedback', 'phoneme', 'babillage', 'mot', 'interpellation', 'histoire']);
const STATUTS_LIGNES = new Set(['actif', 'prevu']);
const RE_ID_LIGNE = /^[a-z0-9]+(-[a-z0-9]+)*$/; // kebab-case strict
let statsLignes = null;

try {
  const registre = JSON.parse(readFileSync(join(ROOT, 'voix', 'lignes.json'), 'utf8'));
  const lignes = Array.isArray(registre.lignes) ? registre.lignes : [];
  const ids = new Set();
  const parType = {};
  let actifs = 0, prevus = 0;

  for (const l of lignes) {
    const id = String(l.id ?? '');
    if (!id) { erreurs.push(`lignes.json : une ligne sans id`); continue; }
    if (!RE_ID_LIGNE.test(id)) erreurs.push(`lignes.json : id « ${id} » pas en kebab-case`);
    if (ids.has(id)) erreurs.push(`lignes.json : id en double « ${id} »`);
    ids.add(id);

    if (typeof l.texte !== 'string' || l.texte.trim() === '') {
      erreurs.push(`lignes.json : « ${id} » — texte vide`);
    }
    if (!TYPES_LIGNES.has(l.type)) erreurs.push(`lignes.json : « ${id} » — type invalide « ${l.type} »`);
    parType[l.type] = (parType[l.type] || 0) + 1;

    const statut = l.statut ?? 'actif';
    if (!STATUTS_LIGNES.has(statut)) erreurs.push(`lignes.json : « ${id} » — statut invalide « ${statut} »`);
    if (statut === 'prevu') prevus++; else actifs++;

    // variables déclarées ⊆ variables {x} présentes dans le texte.
    const declarees = Array.isArray(l.variables) ? l.variables.map(String) : [];
    const utilisees = new Set([...String(l.texte ?? '').matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]));
    for (const v of declarees) {
      if (!utilisees.has(v)) erreurs.push(`lignes.json : « ${id} » — variable déclarée « ${v} » absente du texte`);
    }
    for (const v of utilisees) {
      if (!declarees.includes(v)) avertissements.push(`lignes.json : « ${id} » — variable « {${v}} » du texte non déclarée`);
    }
  }
  statsLignes = { total: lignes.length, parType, actifs, prevus };
} catch (e) {
  avertissements.push(`lignes.json : registre absent ou illisible (${e.code || e.message}) — vue des lignes vide`);
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
  md += `- \`banques/${b.fichier}\` : **${b.nb} items**, ${b.valides} validés en relecture, dont ${b.aVerifier} marqués « à vérifier » (découpage syllabique oral à arbitrer — e caduc).\n`;
}
md += `\n*Progression des graphèmes cumulée (ordre d'introduction par module) :* `;
md += ordonnes.flatMap((m) => m.competences.flatMap((c) => c.graphemesIntroduits)).join(', ') + '.\n';

if (statsLignes) {
  const parType = Object.entries(statsLignes.parType).map(([t, n]) => `${n} ${t}`).join(', ');
  md += `\n## Lignes de texte (registre voix)\n\n`;
  md += `**${statsLignes.total} lignes** au registre (\`voix/lignes.json\`) : ${statsLignes.actifs} actives, ${statsLignes.prevus} prévues.\n\n`;
  md += `Par type : ${parType || '—'}. *(Les mots des banques et les phonèmes du graphe sont des lignes DÉRIVÉES, agrégées par le studio, non listées ici.)*\n`;
}

writeFileSync(join(ROOT, 'graphe-competences.md'), md);

// ————— Rapport —————
for (const a of avertissements) console.warn(`⚠️  ${a}`);
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`❌ ${e}`);
  console.error(`\n${erreurs.length} erreur(s).`);
  process.exit(1);
}
console.log(`✅ Contenu valide : ${graphe.modules.length} modules, ${nbComps} compétences, ${statsBanques.map((b) => `${b.nb} items (${b.fichier})`).join(', ')}.`);
if (statsLignes) {
  const parType = Object.entries(statsLignes.parType).map(([t, n]) => `${n} ${t}`).join(', ');
  console.log(`✅ Registre voix : ${statsLignes.total} lignes (${statsLignes.actifs} actives, ${statsLignes.prevus} prévues) — ${parType}.`);
}
console.log('Vue de relecture régénérée : contenu/graphe-competences.md');

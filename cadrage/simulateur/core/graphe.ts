// Graphe de compétences de simulation — structure Pilier → Module (= biome) → Compétence
// (doc 04 §3.1). Version réduite mais représentative du début de CP : 6 modules chaînés,
// assez pour éprouver la logique (validation, changement de biome, échos inter-biomes).
// Le vrai graphe sera construit avec l'orthophoniste — ici seule la FORME compte.

export interface Competence {
  id: string;
  module: string;
  prerequis: string[];     // ids de compétences
  difficulteIntrinseque: number; // 0..1 — les sons complexes sont plus durs à acquérir
}

export interface Module {
  id: string;
  biome: string;
  competences: string[];   // ids, toutes « cœur » en simulation
  mecaniques: string[];    // matrice compétence ↔ mécaniques, simplifiée au module
}

// 19 mécaniques (17 du brief + dictée muette + machine à mots, actées 30/07/2026).
export const MECANIQUES = [
  'tape-la-syllabe', 'boite-a-sons', 'attrape-le-son', 'jumeaux-presque-pareils',
  'intrus-phonologique', 'fabrique-de-syllabes', 'chasse-au-grapheme', 'tri-par-son',
  'trace-la-lettre', 'gammes-de-syllabes', 'mots-rigolos', 'lecture-flash',
  'karaoke', 'chaines-de-mots', 'mot-image', 'consignes-a-executer',
  'phrase-image', 'dictee-muette', 'machine-a-mots',
];

function comp(id: string, module: string, prerequis: string[], diff: number): Competence {
  return { id, module, prerequis, difficulteIntrinseque: diff };
}

export const COMPETENCES: Competence[] = [
  // Prairie — module Syllabes
  comp('syl-seg2', 'syllabes', [], 0.2),
  comp('syl-seg3', 'syllabes', ['syl-seg2'], 0.3),
  comp('syl-fusion', 'syllabes', ['syl-seg2'], 0.35),
  comp('syl-manip', 'syllabes', ['syl-seg3', 'syl-fusion'], 0.5),
  // Jardin — module Rimes
  comp('rime-detect', 'rimes', ['syl-seg2'], 0.3),
  comp('rime-prod', 'rimes', ['rime-detect'], 0.45),
  comp('rime-intrus', 'rimes', ['rime-detect'], 0.4),
  // Forêt — module Phonèmes (sons d'attaque)
  comp('pho-attaque', 'phonemes', ['syl-fusion'], 0.4),
  comp('pho-isole', 'phonemes', ['pho-attaque'], 0.5),
  comp('pho-fusion', 'phonemes', ['pho-attaque'], 0.55),
  comp('pho-position', 'phonemes', ['pho-isole'], 0.55),
  // Clairière — module Voyelles + premières consonnes
  comp('gra-voyelles', 'lettres', ['pho-isole'], 0.35),
  comp('gra-continues', 'lettres', ['gra-voyelles'], 0.45),
  comp('gra-occlusives', 'lettres', ['gra-continues'], 0.55),
  comp('gra-encodage', 'lettres', ['gra-voyelles'], 0.55),
  // Village — module Combinatoire CV
  comp('cv-lecture', 'combinatoire', ['gra-continues', 'pho-fusion'], 0.5),
  comp('cv-gammes', 'combinatoire', ['cv-lecture'], 0.55),
  comp('cv-mots', 'combinatoire', ['cv-lecture'], 0.6),
  comp('cv-encodage', 'combinatoire', ['cv-mots', 'gra-encodage'], 0.65),
  // Rivière — module Digraphes
  comp('dig-ou-on-an', 'digraphes', ['cv-lecture'], 0.6),
  comp('dig-lecture', 'digraphes', ['dig-ou-on-an'], 0.65),
  comp('dig-mots', 'digraphes', ['dig-lecture'], 0.7),
  comp('dig-encodage', 'digraphes', ['dig-mots'], 0.75),
];

export const MODULES: Module[] = [
  { id: 'syllabes', biome: 'Prairie', competences: ['syl-seg2', 'syl-seg3', 'syl-fusion', 'syl-manip'],
    mecaniques: ['tape-la-syllabe', 'boite-a-sons', 'fabrique-de-syllabes', 'intrus-phonologique'] },
  { id: 'rimes', biome: 'Jardin', competences: ['rime-detect', 'rime-prod', 'rime-intrus'],
    mecaniques: ['boite-a-sons', 'intrus-phonologique', 'jumeaux-presque-pareils', 'tri-par-son'] },
  { id: 'phonemes', biome: 'Forêt', competences: ['pho-attaque', 'pho-isole', 'pho-fusion', 'pho-position'],
    mecaniques: ['attrape-le-son', 'boite-a-sons', 'intrus-phonologique', 'jumeaux-presque-pareils', 'tri-par-son'] },
  { id: 'lettres', biome: 'Clairière des lettres', competences: ['gra-voyelles', 'gra-continues', 'gra-occlusives', 'gra-encodage'],
    mecaniques: ['chasse-au-grapheme', 'trace-la-lettre', 'tri-par-son', 'machine-a-mots', 'lecture-flash'] },
  { id: 'combinatoire', biome: 'Village', competences: ['cv-lecture', 'cv-gammes', 'cv-mots', 'cv-encodage'],
    mecaniques: ['gammes-de-syllabes', 'fabrique-de-syllabes', 'mots-rigolos', 'mot-image', 'dictee-muette', 'machine-a-mots'] },
  { id: 'digraphes', biome: 'Rivière', competences: ['dig-ou-on-an', 'dig-lecture', 'dig-mots', 'dig-encodage'],
    mecaniques: ['chasse-au-grapheme', 'mots-rigolos', 'mot-image', 'chaines-de-mots', 'dictee-muette', 'machine-a-mots'] },
];

export const ORDRE_MODULES = MODULES.map((m) => m.id);

export function competencesDe(moduleId: string): Competence[] {
  return COMPETENCES.filter((c) => c.module === moduleId);
}

export function getCompetence(id: string): Competence {
  const c = COMPETENCES.find((x) => x.id === id);
  if (!c) throw new Error(`compétence inconnue : ${id}`);
  return c;
}

export function getModule(id: string): Module {
  const m = MODULES.find((x) => x.id === id);
  if (!m) throw new Error(`module inconnu : ${id}`);
  return m;
}

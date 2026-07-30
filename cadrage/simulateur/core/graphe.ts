// Graphe de compétences — chargé depuis le contenu pédagogique versionné
// (`contenu/graphe-competences.json`, produit le 30/07/2026, à relire par l'orthophoniste).
// Structure Pilier → Module (= biome) → Compétence (doc 04 §3.1).
// Valider le contenu : npm run lint-contenu.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Competence {
  id: string;
  module: string;
  prerequis: string[];           // ids de compétences
  difficulteIntrinseque: number; // 0..1 — les sons complexes sont plus durs à acquérir
}

export interface Module {
  id: string;
  biome: string;
  competences: string[];   // ids, toutes « cœur » en simulation
  mecaniques: string[];    // union des mécaniques des compétences du module
}

const CONTENU = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'contenu');

interface CompetenceJson {
  id: string; nom: string; prerequis: string[]; mecaniques: string[];
  graphemesIntroduits: string[]; difficulte: number;
}
interface ModuleJson {
  id: string; nom: string; biome: string; pilier: string; ordre: number;
  competences: CompetenceJson[];
}

const graphe = JSON.parse(readFileSync(join(CONTENU, 'graphe-competences.json'), 'utf8')) as {
  modules: ModuleJson[];
};
const modulesOrdonnes = [...graphe.modules].sort((a, b) => a.ordre - b.ordre);

export const MECANIQUES: string[] = (JSON.parse(
  readFileSync(join(CONTENU, 'mecaniques.json'), 'utf8'),
) as { mecaniques: { id: string }[] }).mecaniques.map((m) => m.id);

export const COMPETENCES: Competence[] = modulesOrdonnes.flatMap((m) =>
  m.competences.map((c) => ({
    id: c.id,
    module: m.id,
    prerequis: c.prerequis,
    difficulteIntrinseque: c.difficulte,
  })));

export const MODULES: Module[] = modulesOrdonnes.map((m) => ({
  id: m.id,
  biome: m.biome,
  competences: m.competences.map((c) => c.id),
  mecaniques: [...new Set(m.competences.flatMap((c) => c.mecaniques))],
}));

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

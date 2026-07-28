// Parseur d'estimations partagé — importé par le composant <Est/> (navigateur)
// ET par l'extracteur Vite (node). Une seule définition du format = zéro dérive.
//
// Format : <amount><unit>, unit ∈ { m (minutes), h (heures), j (jours) }.
// Décimale à la virgule ou au point. Convention : 1 j = 7 h = 420 min.

export const HOURS_PER_DAY = 7;
export const MIN_PER_DAY = HOURS_PER_DAY * 60; // 420

const UNIT_MIN = { m: 1, h: 60, j: MIN_PER_DAY };

// Valeurs « à estimer » : reconnues mais comptées 0, pour rendre les trous visibles.
const TODO_VALUES = new Set(['', '____', '__tbd__', 'tbd', 'todo', '?']);

export function parseEst(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (TODO_VALUES.has(s)) return { minutes: 0, valid: true, todo: true, raw };
  const m = s.replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(m|h|j)$/);
  if (!m) return { minutes: NaN, valid: false, todo: false, raw };
  return { minutes: parseFloat(m[1]) * UNIT_MIN[m[2]], valid: true, todo: false, raw };
}

// Extraction des estimations à l'exécution (remplace l'ancien extracteur Vite).
// Récupère tous les .mdx listés dans les arbres, scanne les <Est value="…"/> et
// construit la même structure que l'ancien module virtuel — source de vérité
// unique pour les totaux par fichier et le total global.

import { SPACES } from '../../spaces.js?v=1';
import { parseEst, HOURS_PER_DAY } from './parseEst.js?v=1';

const EST_TAG = /<Est\b([^>]*?)\/?>/g;
const TITLE_RE = /^### \[([A-Z]+-\d+)\] (.+)$/gm;
const attrRe = (name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`);

export function scanText(text) {
  const entries = [];
  // Intitulés des fiches (### [CODE] Titre) -> libellés du récap par lot.
  const titles = {};
  let tm;
  TITLE_RE.lastIndex = 0;
  while ((tm = TITLE_RE.exec(text))) titles[tm[1]] = tm[2].trim();
  let totalMinutes = 0;
  let m;
  EST_TAG.lastIndex = 0;
  while ((m = EST_TAG.exec(text))) {
    const attrs = m[1];
    const valM = attrs.match(attrRe('value'));
    if (!valM) continue;
    const codeM = attrs.match(attrRe('code'));
    const parsed = parseEst(valM[1]);
    const minutes = Number.isFinite(parsed.minutes) ? parsed.minutes : 0;
    totalMinutes += minutes;
    entries.push({ code: codeM ? codeM[1] : null, raw: valM[1], minutes, valid: parsed.valid, todo: !!parsed.todo });
  }
  return { entries, totalMinutes, titles };
}

// Valeur effective d'un poste : l'override saisi dans l'UI prime sur la valeur
// écrite dans le .mdx.
export function effectiveValue(entry, overrides) {
  return overrides && entry.code && overrides[entry.code] != null ? overrides[entry.code] : entry.raw;
}

// Totaux d'un fichier en appliquant les overrides. Renvoie { totalMinutes, nb, nbDone }.
export function fileTotals(entries, overrides) {
  let totalMinutes = 0;
  let nbDone = 0;
  for (const e of entries) {
    const p = parseEst(effectiveValue(e, overrides));
    if (Number.isFinite(p.minutes)) totalMinutes += p.minutes;
    if (p.valid && !p.todo) nbDone += 1;
  }
  return { totalMinutes, nb: entries.length, nbDone };
}

// Options d'un poste. L'override peut être une string ("1j"), un objet
// {value, lot} (poste simple rattaché à un lot) OU un tableau d'options
// [{label, value, detail?, lot?}]. Sinon, on retombe sur la valeur écrite (.mdx).
// Chaque option est rattachée à un lot — 'v1' par défaut.
export function optionsOf(overrideVal, authoredRaw) {
  if (Array.isArray(overrideVal)) {
    return overrideVal.filter((o) => o && o.value != null).map((o) => ({ ...o, lot: o.lot || 'v1' }));
  }
  if (overrideVal != null && overrideVal !== '') {
    if (typeof overrideVal === 'object') {
      return overrideVal.value != null ? [{ label: '', value: overrideVal.value, lot: overrideVal.lot || 'v1' }] : [];
    }
    return [{ label: '', value: overrideVal, lot: 'v1' }];
  }
  if (authoredRaw != null) return [{ label: '', value: authoredRaw, lot: 'v1' }];
  return [];
}

// Fourchette (min/max en minutes) d'un poste + s'il est renseigné + nb d'options.
// min/max globaux (affichage de la puce) + ventilation byLot : plusieurs options
// d'un même poste dans le MÊME lot -> min–max ; lots différents -> chacune compte
// pleinement dans son lot.
export function codeRange(overrideVal, authoredRaw) {
  const opts = optionsOf(overrideVal, authoredRaw);
  if (!opts.length) return { min: 0, max: 0, count: 0, done: false, byLot: {} };
  let min = Infinity;
  let max = 0;
  let done = false;
  const byLot = {};
  for (const o of opts) {
    const p = parseEst(o.value);
    const m = Number.isFinite(p.minutes) ? p.minutes : 0;
    if (p.valid && !p.todo) done = true;
    if (m < min) min = m;
    if (m > max) max = m;
    const lot = o.lot || 'v1';
    const b = byLot[lot] || (byLot[lot] = { min: Infinity, max: 0 });
    if (m < b.min) b.min = m;
    if (m > b.max) b.max = m;
  }
  if (!Number.isFinite(min)) min = 0;
  for (const k of Object.keys(byLot)) {
    if (!Number.isFinite(byLot[k].min)) byLot[k].min = 0;
  }
  return { min, max, count: opts.length, done, byLot };
}

// Fourchette d'un fichier, VENTILÉE PAR LOT (v1 = lot par défaut) pour un total
// modulable. Renvoie { byLot: { v1: {min,max,nb}, … }, nb, nbDone } ; les
// consommateurs replient les lots absents du registre dans v1.
export function fileRange(entries, overrides) {
  let nbDone = 0;
  const byLot = {};
  for (const e of entries) {
    const r = codeRange(overrides ? overrides[e.code] : undefined, e.raw);
    for (const k of Object.keys(r.byLot)) {
      const b = byLot[k] || (byLot[k] = { min: 0, max: 0, nb: 0 });
      b.min += r.byLot[k].min;
      b.max += r.byLot[k].max;
      b.nb += 1;
    }
    if (r.done) nbDone += 1;
  }
  return { byLot, nb: entries.length, nbDone };
}

// Replie les buckets d'un byLot dont l'id n'est pas dans le registre vers v1.
export function foldUnknownLots(byLot, lots) {
  const known = new Set(lots.map((l) => l.id));
  const out = {};
  for (const k of Object.keys(byLot)) {
    const key = known.has(k) ? k : 'v1';
    const b = out[key] || (out[key] = { min: 0, max: 0, nb: 0 });
    b.min += byLot[k].min;
    b.max += byLot[k].max;
    b.nb += byLot[k].nb;
  }
  return out;
}

function flatten(tree, trail = []) {
  const out = [];
  for (const node of tree) {
    if (node.type === 'page') out.push(node.path);
    else if (node.children) out.push(...flatten(node.children, trail));
  }
  return out;
}

// { version, unitHoursPerDay, files: {'space/path': {totalMinutes, entries}}, grandTotalMinutes }
export const estimationsData = { version: 1, unitHoursPerDay: HOURS_PER_DAY, files: {}, grandTotalMinutes: 0 };

let building = null;

export function buildEstimations() {
  if (building) return building;
  building = (async () => {
    const files = {};
    let grand = 0;
    const jobs = [];
    for (const space of Object.keys(SPACES)) {
      const base = SPACES[space].base;
      for (const path of flatten(SPACES[space].tree)) {
        const key = space + '/' + path;
        jobs.push(
          fetch(base + path, { cache: 'no-cache' })
            .then((r) => (r.ok ? r.text() : ''))
            .then((text) => {
              const { entries, totalMinutes, titles } = scanText(text);
              if (entries.length) {
                files[key] = { totalMinutes, entries, titles };
                grand += totalMinutes;
              }
            })
            .catch(() => {})
        );
      }
    }
    await Promise.all(jobs);
    estimationsData.files = files;
    estimationsData.grandTotalMinutes = grand;
    return estimationsData;
  })();
  return building;
}

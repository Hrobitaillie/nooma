// Formatage FR des durées (décimale à la virgule). Les minutes restent entières
// en interne (accumulation exacte) ; on ne formate qu'au bord de l'affichage.

import { MIN_PER_DAY } from './parseEst.js?v=1';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

// Minutes -> "X h" (ex. 630 -> "10,5 h").
export function fmtH(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  return nf.format(minutes / 60) + ' h';
}

// Minutes -> "Y J" (1 J = 7 h ; ex. 630 -> "1,5 J").
export function fmtJ(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  return nf.format(minutes / MIN_PER_DAY) + ' J';
}

// Étiquette d'une estimation unitaire, normalisée dans sa famille d'unité.
// 30 -> "30 min", 120 -> "2 h", 210 -> "0,5 J" (choisi si multiple propre de jour).
export function fmtChip(minutes) {
  if (!Number.isFinite(minutes)) return '?';
  if (minutes === 0) return '—';
  // Multiple d'une demi-journée -> exprimé en J (0,5 J, 1 J, 1,5 J…).
  if (minutes % (MIN_PER_DAY / 2) === 0) return nf.format(minutes / MIN_PER_DAY) + ' J';
  if (minutes < 60) return nf.format(minutes) + ' min';
  return nf.format(minutes / 60) + ' h';
}

// "Total : X h / Y J"
export function fmtTotal(minutes) {
  return `${fmtH(minutes)} / ${fmtJ(minutes)}`;
}

// Fourchette en jours : "5 J" si égal, sinon "entre 5 et 8 J".
export function fmtJBetween(minM, maxM) {
  if (minM === maxM) return fmtJ(minM);
  return `entre ${nf.format(minM / MIN_PER_DAY)} et ${nf.format(maxM / MIN_PER_DAY)} J`;
}

// Fourchette en heures : "35 h" si égal, sinon "entre 35 et 56 h".
export function fmtHBetween(minM, maxM) {
  if (minM === maxM) return fmtH(minM);
  return `entre ${nf.format(minM / 60)} et ${nf.format(maxM / 60)} h`;
}

// Puce compacte d'une fourchette : "1 J" ou "1 J – 3 J".
export function fmtChipRange(minM, maxM) {
  if (minM === maxM) return fmtChip(minM);
  return `${fmtChip(minM)} – ${fmtChip(maxM)}`;
}

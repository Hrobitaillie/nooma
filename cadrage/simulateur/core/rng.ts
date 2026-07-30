// RNG déterministe (splitmix32) — même seed ⇒ même simulation, exigence du doc 04 §8.

export type Rng = () => number;

export function splitmix32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = z ^ (z >>> 15);
    return (z >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tirage pondéré dans une liste non vide. */
export function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Mélange Fisher-Yates — DÉTERMINISTE et reproductible d'un langage à l'autre.
 * Remplace `[...].sort(() => rng() - 0.5)` : un tri à comparateur aléatoire dépend de
 * l'implémentation interne du sort (V8 ≠ Dart), donc IMPOSSIBLE à répliquer fidèlement.
 * Ici l'ordre des tirages du rng est fixé, l'oracle Dart le rejoue à l'identique.
 * Ne mute pas l'entrée : renvoie une copie mélangée.
 */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Ordonnancement (fonctions pures, jamais stockées, recalculées à la volée).
//   - pages : ordre spatial haut → bas puis gauche → droite (décision actée §7).
//   - blocs d'une page : pile verticale = tri par position.y (evolution-v2.md §4).
//   - notes d'une cible : tri par position.y.
import type { Position } from '@flooow/core/model/types'

/** Tolérance de rangée en px monde : deux éléments à < 48 px en Y sont « sur la même ligne ». */
export const ROW_TOLERANCE = 48

type Positioned = { id: string; position: Position }

/**
 * Ordonne des éléments par lecture du canvas : haut → bas (clustering en rangées avec
 * ROW_TOLERANCE), puis gauche → droite dans chaque rangée. Tie-break déterministe (x puis id).
 * Appliqué aux pages (positions absolues).
 */
export function spatialOrder<T extends Positioned>(items: T[]): T[] {
  // 1. tri primaire par y (tie-break x puis id → tri stable et déterministe)
  const byY = [...items].sort(
    (a, b) =>
      a.position.y - b.position.y ||
      a.position.x - b.position.x ||
      a.id.localeCompare(b.id),
  )
  // 2. clustering en rangées : nouvelle rangée quand y s'éloigne de la référence de la rangée
  const rows: T[][] = []
  for (const f of byY) {
    const row = rows.at(-1)
    const ref = row?.[0]
    if (row && ref && f.position.y - ref.position.y <= ROW_TOLERANCE) row.push(f)
    else rows.push([f])
  }
  // 3. tri de chaque rangée par x (tie-break par id → ordre déterministe si x identiques)
  return rows.flatMap((row) =>
    row.sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id)),
  )
}

/**
 * Ordre vertical simple (pile) : tri par position.y croissant, tie-break par id.
 * Utilisé pour les blocs d'une page et les notes d'une cible.
 */
export function verticalOrder<T extends Positioned>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id))
}

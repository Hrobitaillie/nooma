// Héritage de lot (décision actée §9). Première valeur `lot != null` en remontant l'arbre, sinon défaut.
// En v2, la remontée suit `parentId` pour les frames (bloc → page) et `attachedTo` pour les notes
// (note → cible → page).
import type { FlooowNode, NodeIndex } from '@flooow/core/model/types'
import { isNote } from '@flooow/core/model/types'

/** Lot par défaut du projet quand aucune valeur n'est trouvée en remontant l'arbre. */
export const DEFAULT_LOT = 1

/** Parent effectif pour la remontée de lot : attachedTo (notes) ou parentId (frames). */
function lotParentId(node: FlooowNode): string | null {
  return isNote(node) ? node.attachedTo : node.parentId
}

/**
 * Résout le lot effectif d'un nœud : première valeur `lot != null` trouvée en remontant
 * (attachedTo pour les notes, parentId pour les frames), sinon DEFAULT_LOT.
 */
export function resolveLot(id: string, index: NodeIndex): number {
  return resolveLotProvenance(id, index).lot
}

export interface LotProvenance {
  lot: number
  /** id du nœud qui porte la valeur (soi-même, un ancêtre, ou null = défaut projet). */
  sourceId: string | null
  inherited: boolean
}

/** Comme resolveLot mais renvoie aussi d'où provient la valeur (pour le panneau de propriétés). */
export function resolveLotProvenance(id: string, index: NodeIndex): LotProvenance {
  let node = index.get(id)
  const seen = new Set<string>() // garde-fou anti-cycle (invariant PARENT_CYCLE testé ailleurs)
  while (node && !seen.has(node.id)) {
    seen.add(node.id)
    if (node.lot != null) {
      return { lot: node.lot, sourceId: node.id, inherited: node.id !== id }
    }
    const parentId = lotParentId(node)
    node = parentId ? index.get(parentId) : undefined
  }
  return { lot: DEFAULT_LOT, sourceId: null, inherited: true }
}

/** Type de la fonction resolveLot, utilisé par les fonctions domain qui en dépendent. */
export type ResolveLot = (id: string, index: NodeIndex) => number

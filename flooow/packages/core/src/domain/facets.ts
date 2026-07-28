// Filtrage par facette front/back/fullstack (décision actée §6 : facettes en étiquettes, jamais conteneurs).
// En v2, les facettes vivent sur les notes (comportement / API) ; frames et services n'en portent pas.
import type { Facet, FlooowNode } from '@flooow/core/model/types'
import { isNote } from '@flooow/core/model/types'

/** Facette d'un nœud si applicable (notes), sinon null (frames). */
export function nodeFacet(node: FlooowNode): Facet | null {
  if (isNote(node)) return node.attrs.facet
  return null
}

/**
 * Un nœud correspond-il au filtre facette ? `facet === null` = pas de filtre (tout passe).
 * Les frames passent toujours (on ne filtre jamais la structure — cf. logique-algorithmes.md §6).
 * Une note passe si sa facette vaut le filtre, ou `fullstack` (touche les deux couches),
 * ou n'est pas précisée (null → non exclu, pour ne pas perdre d'information).
 */
export function matchesFacet(node: FlooowNode, facet: Facet | null): boolean {
  if (facet === null) return true
  if (!isNote(node)) return true
  const f = node.attrs.facet
  return f === null || f === 'fullstack' || f === facet
}

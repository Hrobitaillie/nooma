// Pages orphelines : BFS sur les edges `navigatesTo` depuis meta.homePageId (voir logique-algorithmes.md §4).
import type { ProjectDoc } from '@flooow/core/model/types'
import { isPage } from '@flooow/core/model/types'

/** Ids des pages atteignables depuis la home via `navigatesTo`. Vide si homePageId est null/inexistant. */
export function reachablePages(doc: ProjectDoc): Set<string> {
  const reached = new Set<string>()
  const home = doc.meta.homePageId
  if (!home) return reached

  const pageIds = new Set(doc.nodes.filter(isPage).map((n) => n.id))
  if (!pageIds.has(home)) return reached

  // Liste d'adjacence : arêtes navigatesTo (page → page). Le mode de rendu 'portal' d'une arête
  // est purement visuel et ne change pas l'adjacence (evolution-v2.md §8, révisé).
  const adjacency = new Map<string, string[]>()
  const addAdjacency = (source: string, target: string): void => {
    const list = adjacency.get(source)
    if (list) list.push(target)
    else adjacency.set(source, [target])
  }
  for (const edge of doc.edges) {
    if (edge.type !== 'navigatesTo') continue
    addAdjacency(edge.source, edge.target)
  }

  const queue: string[] = [home]
  reached.add(home)
  while (queue.length) {
    const current = queue.shift() as string
    for (const target of adjacency.get(current) ?? []) {
      if (reached.has(target)) continue
      if (!pageIds.has(target)) continue // navigatesTo ne mène qu'à des pages
      reached.add(target)
      queue.push(target)
    }
  }
  return reached
}

/**
 * Ids des pages NON reliées à la navigation depuis la home.
 * Si `homePageId` est null : renvoie un ensemble vide (aucune orpheline signalée).
 */
export function orphanPages(doc: ProjectDoc): Set<string> {
  if (!doc.meta.homePageId) return new Set()
  const reached = reachablePages(doc)
  const orphans = new Set<string>()
  for (const node of doc.nodes) {
    if (isPage(node) && !reached.has(node.id)) orphans.add(node.id)
  }
  return orphans
}

// Pont entre les deux couches (cadrage-par-fonctionnalite.md §2) : l'arête `realizedBy` relie une
// fonctionnalité (source) aux pages/blocs qui la réalisent (cible), en n:n. Ce module centralise
// les remontées dans les deux sens + la « couverture » (réconciliation continue : fonctionnalités
// orphelines, pages sans fonctionnalité).
import type {
  BlockNode,
  FeatureNode,
  FlooowEdge,
  NodeIndex,
  PageNode,
  ProjectDoc,
} from '@flooow/core/model/types'
import { isBlock, isFeature, isPage } from '@flooow/core/model/types'

/** Cible possible d'une réalisation : une page ou un bloc. */
export type RealizationTarget = PageNode | BlockNode

/** Arêtes realizedBy uniquement. */
export function realizationEdges(edges: FlooowEdge[]): FlooowEdge[] {
  return edges.filter((e) => e.type === 'realizedBy')
}

/** L'arête realizedBy entre une fonctionnalité et une cible, si elle existe déjà. */
export function realizationEdge(
  featureId: string,
  targetId: string,
  edges: FlooowEdge[],
): FlooowEdge | undefined {
  return edges.find(
    (e) => e.type === 'realizedBy' && e.source === featureId && e.target === targetId,
  )
}

/** Pages/blocs qui réalisent une fonctionnalité (cibles de ses arêtes realizedBy). */
export function realizersOf(
  featureId: string,
  edges: FlooowEdge[],
  index: NodeIndex,
): RealizationTarget[] {
  const out: RealizationTarget[] = []
  for (const e of edges) {
    if (e.type !== 'realizedBy' || e.source !== featureId) continue
    const target = index.get(e.target)
    if (target && (isPage(target) || isBlock(target))) out.push(target)
  }
  return out
}

/** Fonctionnalités réalisées par une cible (page ou bloc). */
export function featuresRealizedBy(
  targetId: string,
  edges: FlooowEdge[],
  index: NodeIndex,
): FeatureNode[] {
  const out: FeatureNode[] = []
  for (const e of edges) {
    if (e.type !== 'realizedBy' || e.target !== targetId) continue
    const source = index.get(e.source)
    if (source && isFeature(source)) out.push(source)
  }
  return out
}

/**
 * Fonctionnalités couvrant une page : celles réalisées par la page elle-même OU par l'un de ses
 * blocs (une page dont un bloc réalise une fonctionnalité est considérée couverte).
 */
export function featuresOfPage(
  pageId: string,
  edges: FlooowEdge[],
  index: NodeIndex,
): FeatureNode[] {
  const targetIds = new Set<string>([pageId])
  for (const node of index.values()) {
    if (isBlock(node) && node.parentId === pageId) targetIds.add(node.id)
  }
  const seen = new Set<string>()
  const out: FeatureNode[] = []
  for (const e of edges) {
    if (e.type !== 'realizedBy' || !targetIds.has(e.target) || seen.has(e.source)) continue
    const source = index.get(e.source)
    if (source && isFeature(source)) {
      seen.add(source.id)
      out.push(source)
    }
  }
  return out
}

/** Réconciliation continue (vue « couverture ») : les deux listes de trous. */
export interface Coverage {
  /** ids des fonctionnalités qu'aucune page/bloc ne réalise. */
  orphanFeatures: string[]
  /** ids des pages sans fonctionnalité (ni sur la page ni sur ses blocs). */
  uncoveredPages: string[]
}

export function coverage(doc: ProjectDoc): Coverage {
  const realized = new Set<string>() // ids de fonctionnalités réalisées
  const coveredTargets = new Set<string>() // ids de pages/blocs cibles d'au moins une réalisation
  for (const e of doc.edges) {
    if (e.type !== 'realizedBy') continue
    realized.add(e.source)
    coveredTargets.add(e.target)
  }
  const orphanFeatures = doc.nodes
    .filter((n) => isFeature(n) && !realized.has(n.id))
    .map((n) => n.id)
  const uncoveredPages = doc.nodes
    .filter((n): n is PageNode => isPage(n))
    .filter((page) => {
      if (coveredTargets.has(page.id)) return false
      return !doc.nodes.some(
        (n) => isBlock(n) && n.parentId === page.id && coveredTargets.has(n.id),
      )
    })
    .map((p) => p.id)
  return { orphanFeatures, uncoveredPages }
}

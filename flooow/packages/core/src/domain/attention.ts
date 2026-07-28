// Points d'attention du projet : agrégat de tous les « trous » à traiter, pour la sidebar du document
// de spécifications (et, à terme, un espace commentaires). Chaque point porte une ancre intra-document
// (`anchorId`) et sa couche (pour un focus canvas), afin d'être cliquable depuis la sidebar.
import type { ApiNote, FlooowNode, ProjectDoc } from '@flooow/core/model/types'
import { isApiNote, isBehaviorNote, isFeature, isModule } from '@flooow/core/model/types'
import { completeness } from '@flooow/core/domain/completeness'
import { orphanPages } from '@flooow/core/domain/reachability'
import { coverage } from '@flooow/core/domain/realization'
import { parseEstimate } from '@flooow/core/domain/derive/estimate'

export type AttentionKind =
  | 'incomplete' // champs obligatoires manquants
  | 'orphanPage' // page non reliée à la navigation
  | 'orphanFeature' // fonctionnalité qu'aucune page/bloc ne réalise
  | 'uncoveredPage' // page ne réalisant aucune fonctionnalité
  | 'unestimated' // élément chiffrable sans estimation

export interface AttentionPoint {
  id: string // id du nœud/fonctionnalité concerné
  anchorId: string // ancre intra-document (`feat-<id>` ou `el-<id>`)
  kind: AttentionKind
  label: string // nom lisible de l'élément
  detail: string // motif court
  layer: 'structural' | 'functional' // couche pour un éventuel focus canvas
}

/** Groupe de points d'attention (une catégorie), pour l'affichage en sections. */
export interface AttentionGroup {
  kind: AttentionKind
  title: string
  points: AttentionPoint[]
}

const KIND_TITLES: Record<AttentionKind, string> = {
  incomplete: 'À compléter',
  orphanPage: 'Pages orphelines (navigation)',
  orphanFeature: 'Fonctionnalités non réalisées',
  uncoveredPage: 'Pages sans fonctionnalité',
  unestimated: 'À estimer',
}

/** Nom lisible d'un nœud (les notes API n'ont pas de champ `name`). */
function nodeName(n: FlooowNode): string {
  if (isApiNote(n)) {
    const a = (n as ApiNote).attrs
    return `${a.method} ${a.path}`.trim() || 'Note API'
  }
  return n.attrs.name || 'Sans titre'
}

function layerOf(n: FlooowNode): 'structural' | 'functional' {
  return isFeature(n) || isModule(n) ? 'functional' : 'structural'
}
function anchorOf(n: FlooowNode): string {
  return isFeature(n) ? `feat-${n.id}` : `el-${n.id}`
}

/** Construit la liste plate des points d'attention du document. */
export function attentionPoints(doc: ProjectDoc): AttentionPoint[] {
  const index = new Map(doc.nodes.map((n) => [n.id, n]))
  const points: AttentionPoint[] = []

  // Incomplets (tous types).
  for (const n of doc.nodes) {
    const c = completeness(n)
    if (!c.complete) {
      points.push({
        id: n.id,
        anchorId: anchorOf(n),
        kind: 'incomplete',
        label: nodeName(n),
        detail: `Champs manquants : ${c.missing.join(', ')}`,
        layer: layerOf(n),
      })
    }
  }

  // Pages orphelines (navigation).
  for (const id of orphanPages(doc)) {
    const n = index.get(id)
    if (!n) continue
    points.push({
      id,
      anchorId: `el-${id}`,
      kind: 'orphanPage',
      label: nodeName(n),
      detail: 'Page non reliée à la navigation.',
      layer: 'structural',
    })
  }

  // Couverture : fonctionnalités non réalisées + pages sans fonctionnalité.
  const cov = coverage(doc)
  for (const id of cov.orphanFeatures) {
    const n = index.get(id)
    if (!n) continue
    points.push({
      id,
      anchorId: `feat-${id}`,
      kind: 'orphanFeature',
      label: nodeName(n),
      detail: 'Aucune page/bloc ne la réalise.',
      layer: 'functional',
    })
  }
  for (const id of cov.uncoveredPages) {
    const n = index.get(id)
    if (!n) continue
    points.push({
      id,
      anchorId: `el-${id}`,
      kind: 'uncoveredPage',
      label: nodeName(n),
      detail: 'Ne réalise aucune fonctionnalité.',
      layer: 'structural',
    })
  }

  // À estimer : fonctionnalités sans estimation + comportements sans heures.
  for (const n of doc.nodes) {
    if (isFeature(n) && parseEstimate(n.attrs.estimate) == null) {
      points.push({
        id: n.id,
        anchorId: `feat-${n.id}`,
        kind: 'unestimated',
        label: nodeName(n),
        detail: 'Estimation manquante.',
        layer: 'functional',
      })
    } else if (isBehaviorNote(n) && n.attrs.hours == null) {
      points.push({
        id: n.id,
        anchorId: `el-${n.id}`,
        kind: 'unestimated',
        label: nodeName(n),
        detail: 'Charge (heures) non renseignée.',
        layer: 'structural',
      })
    }
  }

  return points
}

/** Regroupe les points d'attention par catégorie (ordre stable), catégories vides omises. */
export function attentionGroups(doc: ProjectDoc): AttentionGroup[] {
  const all = attentionPoints(doc)
  const order: AttentionKind[] = [
    'incomplete',
    'unestimated',
    'orphanFeature',
    'uncoveredPage',
    'orphanPage',
  ]
  return order
    .map((kind) => ({
      kind,
      title: KIND_TITLES[kind],
      points: all.filter((p) => p.kind === kind),
    }))
    .filter((g) => g.points.length > 0)
}

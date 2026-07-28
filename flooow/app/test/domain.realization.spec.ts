import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  coverage,
  featuresOfPage,
  featuresRealizedBy,
  realizationEdge,
  realizersOf,
} from '@flooow/core/domain/realization'
import { checkInvariants } from '@flooow/core/domain/invariants'
import {
  createEmptyProject,
  createPage,
  createBlock,
  createFeature,
  createEdge,
} from '@flooow/core/model/factory'
import type { FlooowEdge, FlooowNode, NodeIndex, ProjectDoc } from '@flooow/core/model/types'
import { useProjectStore } from '@/stores/project'

function index(nodes: FlooowNode[]): NodeIndex {
  return new Map(nodes.map((n) => [n.id, n]))
}
function doc(nodes: FlooowNode[], edges: FlooowEdge[] = []): ProjectDoc {
  return { ...createEmptyProject(), nodes, edges }
}

describe('realization — remontées dans les deux sens', () => {
  it('realizersOf : pages/blocs qui réalisent une fonctionnalité', () => {
    const page = createPage({ id: 'p' })
    const block = createBlock({ id: 'b', parentId: 'p' })
    const feat = createFeature({ id: 'f' })
    const e1 = createEdge({ type: 'realizedBy', source: 'f', target: 'p' })
    const e2 = createEdge({ type: 'realizedBy', source: 'f', target: 'b' })
    const ids = realizersOf('f', [e1, e2], index([page, block, feat])).map((n) => n.id)
    expect(ids.sort()).toEqual(['b', 'p'])
  })

  it('featuresRealizedBy : fonctionnalités réalisées par une cible', () => {
    const page = createPage({ id: 'p' })
    const f1 = createFeature({ id: 'f1' })
    const f2 = createFeature({ id: 'f2' })
    const e1 = createEdge({ type: 'realizedBy', source: 'f1', target: 'p' })
    const e2 = createEdge({ type: 'realizedBy', source: 'f2', target: 'p' })
    const ids = featuresRealizedBy('p', [e1, e2], index([page, f1, f2])).map((n) => n.id)
    expect(ids.sort()).toEqual(['f1', 'f2'])
  })

  it('featuresOfPage : couvre via la page OU l un de ses blocs, sans doublon', () => {
    const page = createPage({ id: 'p' })
    const block = createBlock({ id: 'b', parentId: 'p' })
    const f1 = createFeature({ id: 'f1' })
    const f2 = createFeature({ id: 'f2' })
    const onPage = createEdge({ type: 'realizedBy', source: 'f1', target: 'p' })
    const onBlock = createEdge({ type: 'realizedBy', source: 'f2', target: 'b' })
    const dupe = createEdge({ type: 'realizedBy', source: 'f1', target: 'b' })
    const ids = featuresOfPage('p', [onPage, onBlock, dupe], index([page, block, f1, f2])).map(
      (n) => n.id,
    )
    expect(ids.sort()).toEqual(['f1', 'f2'])
  })

  it('realizationEdge : retrouve l arête exacte feature→cible', () => {
    const e = createEdge({ type: 'realizedBy', source: 'f', target: 'p' })
    expect(realizationEdge('f', 'p', [e])?.id).toBe(e.id)
    expect(realizationEdge('f', 'x', [e])).toBeUndefined()
  })
})

describe('realization — couverture (réconciliation continue)', () => {
  it('signale les fonctionnalités orphelines et les pages sans fonctionnalité', () => {
    const page = createPage({ id: 'p' }) // couverte
    const uncovered = createPage({ id: 'p2' }) // sans fonctionnalité
    const feat = createFeature({ id: 'f' }) // réalisée
    const orphan = createFeature({ id: 'f2' }) // orpheline
    const e = createEdge({ type: 'realizedBy', source: 'f', target: 'p' })
    const cov = coverage(doc([page, uncovered, feat, orphan], [e]))
    expect(cov.orphanFeatures).toEqual(['f2'])
    expect(cov.uncoveredPages).toEqual(['p2'])
  })

  it('une page dont un bloc est réalisé est considérée couverte', () => {
    const page = createPage({ id: 'p' })
    const block = createBlock({ id: 'b', parentId: 'p' })
    const feat = createFeature({ id: 'f' })
    const e = createEdge({ type: 'realizedBy', source: 'f', target: 'b' })
    expect(coverage(doc([page, block, feat], [e])).uncoveredPages).toEqual([])
  })
})

describe('store — addRealizedBy / removeRealizedBy', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addRealizedBy crée une arête realizedBy valide', () => {
    const p = useProjectStore()
    const mod = p.addModule({ name: 'M' })
    const feat = p.addFeature(mod, { name: 'F' })
    const page = p.addPage({ name: 'P' })
    const id = p.addRealizedBy(feat, page)
    expect(id).not.toBeNull()
    expect(p.realizersOfFeature(feat).map((n) => n.id)).toEqual([page])
    expect(p.featuresOfTarget(page).map((n) => n.id)).toEqual([feat])
    expect(checkInvariants(p.serialize())).toEqual([])
  })

  it('refuse un doublon et des extrémités invalides', () => {
    const p = useProjectStore()
    const feat = p.addFeature(null, { name: 'F' })
    const page = p.addPage({ name: 'P' })
    expect(p.addRealizedBy(feat, page)).not.toBeNull()
    expect(p.addRealizedBy(feat, page)).toBeNull() // doublon
    expect(p.addRealizedBy(page, feat)).toBeNull() // source non-feature
    expect(p.edges.filter((e) => e.type === 'realizedBy')).toHaveLength(1)
  })

  it('removeRealizedBy retire le lien', () => {
    const p = useProjectStore()
    const feat = p.addFeature(null, { name: 'F' })
    const page = p.addPage({ name: 'P' })
    p.addRealizedBy(feat, page)
    p.removeRealizedBy(feat, page)
    expect(p.realizersOfFeature(feat)).toEqual([])
  })

  it('supprimer une page retire ses arêtes realizedBy (cascade)', () => {
    const p = useProjectStore()
    const feat = p.addFeature(null, { name: 'F' })
    const page = p.addPage({ name: 'P' })
    p.addRealizedBy(feat, page)
    p.removeNode(page)
    expect(p.edges.filter((e) => e.type === 'realizedBy')).toHaveLength(0)
    expect(p.realizationCoverage.orphanFeatures).toEqual([feat])
  })
})

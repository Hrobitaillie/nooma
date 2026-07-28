import { describe, it, expect } from 'vitest'
import { attentionPoints, attentionGroups } from '@flooow/core/domain/attention'
import {
  createEmptyProject,
  createPage,
  createModule,
  createFeature,
  createEdge,
} from '@flooow/core/model/factory'
import { mergeFeatureFields } from '@flooow/core/model/richContent'
import type { FlooowEdge, FlooowNode, ProjectDoc } from '@flooow/core/model/types'

function doc(nodes: FlooowNode[], edges: FlooowEdge[] = []): ProjectDoc {
  return { ...createEmptyProject(), nodes, edges }
}

describe('attention — agrégat des points', () => {
  it('signale une fonctionnalité non réalisée et sans estimation', () => {
    const mod = createModule({ id: 'm', name: 'M' })
    const f = createFeature({
      id: 'f',
      parentId: 'm',
      attrs: { code: 'F-01', name: 'Feat', content: mergeFeatureFields({ description: 'x' }), estimate: '' },
    })
    const pts = attentionPoints(doc([mod, f]))
    const kinds = pts.filter((p) => p.id === 'f').map((p) => p.kind)
    expect(kinds).toContain('orphanFeature')
    expect(kinds).toContain('unestimated')
    expect(pts.find((p) => p.kind === 'orphanFeature')!.anchorId).toBe('feat-f')
    expect(pts.find((p) => p.kind === 'orphanFeature')!.layer).toBe('functional')
  })

  it('signale une page sans fonctionnalité et pointe une ancre el-', () => {
    const page = createPage({ id: 'p', name: 'Panier', attrs: { name: 'Panier', slug: 'p', description: 'x', constraints: [], logic: '', notes: '' } })
    const pts = attentionPoints(doc([page]))
    const uncovered = pts.find((p) => p.kind === 'uncoveredPage')
    expect(uncovered).toBeTruthy()
    expect(uncovered!.anchorId).toBe('el-p')
    expect(uncovered!.layer).toBe('structural')
  })

  it('une fonctionnalité réalisée + estimée ne remonte plus comme orpheline/à estimer', () => {
    const mod = createModule({ id: 'm', name: 'M' })
    const f = createFeature({ id: 'f', parentId: 'm', attrs: { code: 'F-01', name: 'Feat', content: mergeFeatureFields({ description: 'x' }), estimate: '2j' } })
    const page = createPage({ id: 'p', name: 'P', attrs: { name: 'P', slug: '', description: 'x', constraints: [], logic: '', notes: '' } })
    const e = createEdge({ type: 'realizedBy', source: 'f', target: 'p' })
    const pts = attentionPoints(doc([mod, f, page], [e]))
    expect(pts.some((p) => p.id === 'f' && p.kind === 'orphanFeature')).toBe(false)
    expect(pts.some((p) => p.id === 'f' && p.kind === 'unestimated')).toBe(false)
  })

  it('attentionGroups regroupe par catégorie, catégories vides omises', () => {
    const groups = attentionGroups(createEmptyProject())
    expect(groups).toEqual([])
  })
})

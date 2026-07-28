import { describe, it, expect } from 'vitest'
import { deriveEstimate, parseEstimate, HOURS_PER_DAY } from '@flooow/core/domain/derive/estimate'
import {
  createEmptyProject,
  createPage,
  createBlock,
  createBehaviorNote,
  createModule,
  createFeature,
  createEdge,
} from '@flooow/core/model/factory'
import type { FlooowEdge, FlooowNode, ProjectDoc } from '@flooow/core/model/types'

function doc(nodes: FlooowNode[], riskCoeff = 1.25, edges: FlooowEdge[] = []): ProjectDoc {
  const base = createEmptyProject()
  return { ...base, meta: { ...base.meta, pricing: { riskCoeff, dailyRate: null } }, nodes, edges }
}

const page = createPage({ id: 'p', name: 'Accueil' })
const block = createBlock({ id: 'blk', parentId: 'p' })
// b1 : 4h front lot1 (via bloc) ; b2 : 6h back lot2 (sur la page) ; b3 : sans heures
const b1 = createBehaviorNote({ id: 'b1', attachedTo: 'blk', lot: 1, attrs: { facet: 'front', hours: 4 } })
const b2 = createBehaviorNote({ id: 'b2', attachedTo: 'p', lot: 2, attrs: { facet: 'back', hours: 6 } })
const b3 = createBehaviorNote({ id: 'b3', attachedTo: 'blk', attrs: { hours: null } })

const full = doc([page, block, b1, b2, b3])

describe('deriveEstimate — total', () => {
  it('somme des heures avec fourchette basse/haute (× riskCoeff)', () => {
    const e = deriveEstimate(full)
    expect(e.total).toEqual({ low: 10, high: 10 * 1.25 })
  })

  it('notes sans heures listées dans unestimated', () => {
    const e = deriveEstimate(full)
    expect(e.unestimated.map((n) => n.id)).toEqual(['b3'])
  })
})

describe('deriveEstimate — ventilations', () => {
  it('byLot : héritage de lot appliqué', () => {
    const e = deriveEstimate(full)
    expect(e.byLot).toEqual([
      { key: '1', label: 'Lot 1', total: { low: 4, high: 5 } },
      { key: '2', label: 'Lot 2', total: { low: 6, high: 7.5 } },
    ])
  })

  it('byPage : heures remontées à la page (note → bloc → page)', () => {
    const e = deriveEstimate(full)
    const p = e.byPage.find((b) => b.key === 'p')!
    expect(p.label).toBe('Accueil')
    expect(p.total).toEqual({ low: 10, high: 12.5 })
  })

  it('byFacet : ventilation front/back', () => {
    const e = deriveEstimate(full)
    expect(e.byFacet.find((b) => b.key === 'front')!.total.low).toBe(4)
    expect(e.byFacet.find((b) => b.key === 'back')!.total.low).toBe(6)
  })

  it('note rattachée à une cible inexistante → bucket "none"', () => {
    const loose = createBehaviorNote({ id: 'loose', attachedTo: 'ghost', attrs: { hours: 2 } })
    const e = deriveEstimate(doc([loose]))
    expect(e.byPage.map((b) => b.key)).toEqual(['none'])
    expect(e.byPage[0]!.label).toBe('Hors page')
  })
})

describe('deriveEstimate — vide', () => {
  it('document vierge → tout à zéro', () => {
    const e = deriveEstimate(createEmptyProject())
    expect(e.total).toEqual({ low: 0, high: 0 })
    expect(e.byLot).toEqual([])
    expect(e.byPage).toEqual([])
    expect(e.byFacet).toEqual([])
    expect(e.unestimated).toEqual([])
    expect(e.features.total).toEqual({ low: 0, high: 0 })
  })
})

describe('parseEstimate', () => {
  it('parse jours et heures (virgule décimale)', () => {
    expect(parseEstimate('1j')).toBe(HOURS_PER_DAY)
    expect(parseEstimate('0,5j')).toBe(HOURS_PER_DAY / 2)
    expect(parseEstimate('2h')).toBe(2)
    expect(parseEstimate('3 jours')).toBe(3 * HOURS_PER_DAY)
    expect(parseEstimate('1j 4h')).toBe(HOURS_PER_DAY + 4)
  })

  it('nombre nu interprété en jours', () => {
    expect(parseEstimate('2')).toBe(2 * HOURS_PER_DAY)
  })

  it('renvoie null pour le non-exploitable', () => {
    expect(parseEstimate('')).toBeNull()
    expect(parseEstimate('à estimer')).toBeNull()
    expect(parseEstimate('?')).toBeNull()
  })
})

describe('deriveEstimate — couche fonctionnelle', () => {
  const mod = createModule({ id: 'm', name: 'Devis' })
  const f1 = createFeature({ id: 'f1', parentId: 'm', lot: 1, attrs: { code: 'DEV-01', name: 'A', content: { type: 'doc', content: [] }, estimate: '3j' } })
  const f2 = createFeature({ id: 'f2', parentId: 'm', lot: 2, attrs: { code: 'DEV-02', name: 'B', content: { type: 'doc', content: [] }, estimate: '1j' } })
  const f3 = createFeature({ id: 'f3', parentId: 'm', attrs: { code: 'DEV-03', name: 'C', content: { type: 'doc', content: [] }, estimate: '' } })
  const page = createPage({ id: 'p', name: 'Panier' })
  const realizes = createEdge({ type: 'realizedBy', source: 'f1', target: 'p' })

  const full = doc([mod, f1, f2, f3, page], 1.25, [realizes])

  it('total en heures parsées + fourchette haute', () => {
    const e = deriveEstimate(full)
    expect(e.features.total).toEqual({ low: 4 * HOURS_PER_DAY, high: 4 * HOURS_PER_DAY * 1.25 })
  })

  it('ventile par lot et par module', () => {
    const e = deriveEstimate(full)
    expect(e.features.byLot).toEqual([
      { key: '1', label: 'Lot 1', total: { low: 3 * HOURS_PER_DAY, high: 3 * HOURS_PER_DAY * 1.25 } },
      { key: '2', label: 'Lot 2', total: { low: HOURS_PER_DAY, high: HOURS_PER_DAY * 1.25 } },
    ])
    expect(e.features.byModule[0]!.label).toBe('Devis')
    expect(e.features.byModule[0]!.total.low).toBe(4 * HOURS_PER_DAY)
  })

  it('roll-up par page via realizedBy', () => {
    const e = deriveEstimate(full)
    expect(e.features.byPage).toEqual([
      { key: 'p', label: 'Panier', total: { low: 3 * HOURS_PER_DAY, high: 3 * HOURS_PER_DAY * 1.25 } },
    ])
  })

  it('fonctionnalités sans estimation listées', () => {
    const e = deriveEstimate(full)
    expect(e.features.unestimated.map((f) => f.id)).toEqual(['f3'])
  })
})

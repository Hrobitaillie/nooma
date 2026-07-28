import { describe, it, expect } from 'vitest'
import { nodeFacet, matchesFacet } from '@flooow/core/domain/facets'
import { createPage, createBlock, createBehaviorNote, createApiNote } from '@flooow/core/model/factory'

describe('facets — nodeFacet', () => {
  it('note comportement → sa facette', () => {
    expect(nodeFacet(createBehaviorNote({ attachedTo: 'b', attrs: { facet: 'front' } }))).toBe('front')
  })
  it('note API → sa facette', () => {
    expect(nodeFacet(createApiNote({ attachedTo: 'b', serviceId: 's', attrs: { facet: 'back' } }))).toBe('back')
  })
  it('note sans facette → null', () => {
    expect(nodeFacet(createBehaviorNote({ attachedTo: 'b', attrs: { facet: null } }))).toBeNull()
  })
  it('page → null (pas de facette sur la structure)', () => {
    expect(nodeFacet(createPage({}))).toBeNull()
  })
  it('bloc → null', () => {
    expect(nodeFacet(createBlock({ parentId: 'p' }))).toBeNull()
  })
})

describe('facets — matchesFacet', () => {
  const bn = (facet: 'front' | 'back' | 'fullstack' | null) =>
    createBehaviorNote({ attachedTo: 'b', attrs: { facet } })

  it('filtre null → tout passe', () => {
    expect(matchesFacet(bn('back'), null)).toBe(true)
  })

  it('frame passe toujours (structure jamais filtrée)', () => {
    expect(matchesFacet(createPage({}), 'front')).toBe(true)
    expect(matchesFacet(createBlock({ parentId: 'p' }), 'front')).toBe(true)
  })

  it('note front passe le filtre front', () => {
    expect(matchesFacet(bn('front'), 'front')).toBe(true)
  })

  it('note back ne passe pas le filtre front', () => {
    expect(matchesFacet(bn('back'), 'front')).toBe(false)
  })

  it('note fullstack passe front ET back', () => {
    expect(matchesFacet(bn('fullstack'), 'front')).toBe(true)
    expect(matchesFacet(bn('fullstack'), 'back')).toBe(true)
  })

  it('note sans facette (null) n’est jamais exclue', () => {
    expect(matchesFacet(bn(null), 'front')).toBe(true)
    expect(matchesFacet(bn(null), 'back')).toBe(true)
  })

  it('filtre fullstack ne garde que fullstack (et non précisé)', () => {
    expect(matchesFacet(bn('front'), 'fullstack')).toBe(false)
    expect(matchesFacet(bn('fullstack'), 'fullstack')).toBe(true)
  })
})

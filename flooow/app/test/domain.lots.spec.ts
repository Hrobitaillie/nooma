import { describe, it, expect } from 'vitest'
import { resolveLot, resolveLotProvenance, DEFAULT_LOT } from '@flooow/core/domain/lots'
import { createPage, createBlock, createBehaviorNote } from '@flooow/core/model/factory'
import type { FlooowNode, NodeIndex } from '@flooow/core/model/types'

function index(nodes: FlooowNode[]): NodeIndex {
  return new Map(nodes.map((n) => [n.id, n]))
}

describe('lots — resolveLot / héritage v2', () => {
  it('DEFAULT_LOT vaut 1', () => {
    expect(DEFAULT_LOT).toBe(1)
  })

  it('nœud sans lot ni ancêtre → défaut projet (1)', () => {
    const page = createPage({ id: 'p', lot: null })
    expect(resolveLot('p', index([page]))).toBe(1)
  })

  it('valeur propre : lot explicite sur le nœud', () => {
    const page = createPage({ id: 'p', lot: 2 })
    expect(resolveLotProvenance('p', index([page]))).toEqual({
      lot: 2,
      sourceId: 'p',
      inherited: false,
    })
  })

  it('héritage : le bloc hérite du lot de sa page (via parentId)', () => {
    const page = createPage({ id: 'p', lot: 2 })
    const block = createBlock({ id: 'b', parentId: 'p', lot: null })
    expect(resolveLotProvenance('b', index([page, block]))).toEqual({
      lot: 2,
      sourceId: 'p',
      inherited: true,
    })
  })

  it('héritage transitif : note → bloc → page (via attachedTo puis parentId)', () => {
    const page = createPage({ id: 'p', lot: 3 })
    const block = createBlock({ id: 'b', parentId: 'p', lot: null })
    const note = createBehaviorNote({ id: 'n', attachedTo: 'b', lot: null })
    expect(resolveLot('n', index([page, block, note]))).toBe(3)
  })

  it('note rattachée directement à une page hérite du lot de la page', () => {
    const page = createPage({ id: 'p', lot: 4 })
    const note = createBehaviorNote({ id: 'n', attachedTo: 'p', lot: null })
    expect(resolveLot('n', index([page, note]))).toBe(4)
  })

  it('override : le bloc surcharge le lot de la page', () => {
    const page = createPage({ id: 'p', lot: 1 })
    const block = createBlock({ id: 'b', parentId: 'p', lot: 5 })
    expect(resolveLotProvenance('b', index([page, block]))).toEqual({
      lot: 5,
      sourceId: 'b',
      inherited: false,
    })
  })

  it('remonte jusqu’au défaut si aucun ancêtre ne porte de lot', () => {
    const page = createPage({ id: 'p', lot: null })
    const block = createBlock({ id: 'b', parentId: 'p', lot: null })
    expect(resolveLotProvenance('b', index([page, block]))).toEqual({
      lot: 1,
      sourceId: null,
      inherited: true,
    })
  })

  it('id inexistant → défaut', () => {
    expect(resolveLotProvenance('ghost', index([]))).toEqual({
      lot: 1,
      sourceId: null,
      inherited: true,
    })
  })

  it('résiste à un cycle de rattachement (garde-fou) → défaut', () => {
    const a = createBlock({ id: 'a', parentId: 'b', lot: null })
    const b = createBlock({ id: 'b', parentId: 'a', lot: null })
    expect(resolveLot('a', index([a, b]))).toBe(1)
  })
})

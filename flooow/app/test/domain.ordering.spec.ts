import { describe, it, expect } from 'vitest'
import { spatialOrder, verticalOrder, ROW_TOLERANCE } from '@flooow/core/domain/ordering'
import { createPage, createBlock } from '@flooow/core/model/factory'
import type { PageNode } from '@flooow/core/model/types'

function frame(id: string, x: number, y: number): PageNode {
  return createPage({ id, position: { x, y } })
}

describe('ordering — spatialOrder', () => {
  it('ROW_TOLERANCE vaut 48', () => {
    expect(ROW_TOLERANCE).toBe(48)
  })

  it('liste vide → liste vide', () => {
    expect(spatialOrder([])).toEqual([])
  })

  it('trie haut→bas puis gauche→droite', () => {
    const a = frame('a', 100, 0)
    const b = frame('b', 0, 0)
    const c = frame('c', 50, 200)
    expect(spatialOrder([c, a, b]).map((f) => f.id)).toEqual(['b', 'a', 'c'])
  })

  it('groupe en rangées : frames à < 48px en Y sont sur la même ligne', () => {
    const left = frame('left', 0, 40)
    const right = frame('right', 300, 0)
    expect(spatialOrder([left, right]).map((f) => f.id)).toEqual(['left', 'right'])
  })

  it('rangée en escalier : chaque frame à +49px → chacune sa rangée', () => {
    const f0 = frame('f0', 300, 0)
    const f1 = frame('f1', 200, 49)
    const f2 = frame('f2', 100, 98)
    expect(spatialOrder([f2, f1, f0]).map((f) => f.id)).toEqual(['f0', 'f1', 'f2'])
  })

  it('frames exactement alignées : tie-break déterministe par x puis id', () => {
    const same1 = frame('zzz', 10, 10)
    const same2 = frame('aaa', 10, 10)
    const same3 = frame('mmm', 5, 10)
    expect(spatialOrder([same1, same2, same3]).map((f) => f.id)).toEqual(['mmm', 'aaa', 'zzz'])
  })

  it('exactement à la tolérance (Δy = 48) reste dans la même rangée', () => {
    const a = frame('a', 100, 0)
    const b = frame('b', 0, 48)
    expect(spatialOrder([a, b]).map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const input = [frame('b', 0, 100), frame('a', 0, 0)]
    const copy = [...input]
    spatialOrder(input)
    expect(input).toEqual(copy)
  })
})

describe('ordering — verticalOrder (pile de blocs / notes)', () => {
  it('trie par position.y croissant', () => {
    const b0 = createBlock({ id: 'b0', parentId: 'p', position: { x: 0, y: 240 } })
    const b1 = createBlock({ id: 'b1', parentId: 'p', position: { x: 0, y: 0 } })
    const b2 = createBlock({ id: 'b2', parentId: 'p', position: { x: 0, y: 120 } })
    expect(verticalOrder([b0, b1, b2]).map((b) => b.id)).toEqual(['b1', 'b2', 'b0'])
  })

  it('tie-break par id à y égal', () => {
    const a = createBlock({ id: 'zzz', parentId: 'p', position: { x: 0, y: 0 } })
    const b = createBlock({ id: 'aaa', parentId: 'p', position: { x: 0, y: 0 } })
    expect(verticalOrder([a, b]).map((b) => b.id)).toEqual(['aaa', 'zzz'])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const input = [
      createBlock({ id: 'b', parentId: 'p', position: { x: 0, y: 100 } }),
      createBlock({ id: 'a', parentId: 'p', position: { x: 0, y: 0 } }),
    ]
    const copy = [...input]
    verticalOrder(input)
    expect(input).toEqual(copy)
  })
})

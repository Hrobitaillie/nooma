import { describe, it, expect } from 'vitest'
import { descendants, children, attachedNotes, pageOf } from '@flooow/core/domain/rollup'
import { createPage, createBlock, createBehaviorNote, createApiNote } from '@flooow/core/model/factory'
import type { ChildrenIndex, FlooowNode, NodeIndex } from '@flooow/core/model/types'

function indexes(nodes: FlooowNode[]): { index: NodeIndex; childrenIndex: ChildrenIndex } {
  const index: NodeIndex = new Map(nodes.map((n) => [n.id, n]))
  const childrenIndex: ChildrenIndex = new Map()
  for (const n of nodes) {
    const list = childrenIndex.get(n.parentId)
    if (list) list.push(n.id)
    else childrenIndex.set(n.parentId, [n.id])
  }
  return { index, childrenIndex }
}

const page = createPage({ id: 'p' })
const blockA = createBlock({ id: 'ba', parentId: 'p' })
const blockB = createBlock({ id: 'bb', parentId: 'p' })
const noteOnBlock = createBehaviorNote({ id: 'n1', attachedTo: 'ba' })
const noteOnPage = createApiNote({ id: 'n2', attachedTo: 'p', serviceId: 'svc' })
const all = [page, blockA, blockB, noteOnBlock, noteOnPage]

describe('rollup — children', () => {
  it('enfants directs d’une page (blocs via parentId)', () => {
    const { index, childrenIndex } = indexes(all)
    expect(children('p', childrenIndex, index).map((n) => n.id).sort()).toEqual(['ba', 'bb'])
  })

  it('enfants du site (parentId null) : la page + les notes (parentId null)', () => {
    const { index, childrenIndex } = indexes(all)
    expect(children(null, childrenIndex, index).map((n) => n.id).sort()).toEqual(['n1', 'n2', 'p'])
  })
})

describe('rollup — descendants (via parentId)', () => {
  it('descendants d’une page = ses blocs', () => {
    const { index, childrenIndex } = indexes(all)
    expect(descendants('p', childrenIndex, index).map((n) => n.id).sort()).toEqual(['ba', 'bb'])
  })

  it('n’inclut pas la racine elle-même', () => {
    const { index, childrenIndex } = indexes(all)
    expect(descendants('p', childrenIndex, index).map((n) => n.id)).not.toContain('p')
  })

  it('résiste à un cycle (garde-fou anti-boucle)', () => {
    const a = createBlock({ id: 'a', parentId: 'b' })
    const b = createBlock({ id: 'b', parentId: 'a' })
    const { index, childrenIndex } = indexes([a, b])
    expect(descendants('a', childrenIndex, index).map((n) => n.id)).toEqual(['b'])
  })
})

describe('rollup — attachedNotes (via attachedTo)', () => {
  it('notes rattachées à un bloc', () => {
    const { index } = indexes(all)
    expect(attachedNotes('ba', index).map((n) => n.id)).toEqual(['n1'])
  })
  it('notes rattachées à une page', () => {
    const { index } = indexes(all)
    expect(attachedNotes('p', index).map((n) => n.id)).toEqual(['n2'])
  })
  it('cible sans note → liste vide', () => {
    const { index } = indexes(all)
    expect(attachedNotes('bb', index)).toEqual([])
  })
})

describe('rollup — pageOf (remontée)', () => {
  it('note → bloc → page', () => {
    const { index } = indexes(all)
    expect(pageOf('n1', index)?.id).toBe('p')
  })
  it('note → page directement', () => {
    const { index } = indexes(all)
    expect(pageOf('n2', index)?.id).toBe('p')
  })
  it('bloc → page', () => {
    const { index } = indexes(all)
    expect(pageOf('ba', index)?.id).toBe('p')
  })
  it('page → elle-même', () => {
    const { index } = indexes(all)
    expect(pageOf('p', index)?.id).toBe('p')
  })
  it('id inexistant → null', () => {
    const { index } = indexes(all)
    expect(pageOf('ghost', index)).toBeNull()
  })
})

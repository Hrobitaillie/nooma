import { describe, it, expect } from 'vitest'
import { checkInvariants, assertInvariants, endpointId } from '@flooow/core/domain/invariants'
import type { ViolationCode } from '@flooow/core/domain/invariants'
import {
  createEmptyProject,
  createPage,
  createBlock,
  createBehaviorNote,
  createApiNote,
  createFeature,
  createModule,
  createService,
  createEdge,
} from '@flooow/core/model/factory'
import type { FlooowEdge, FlooowNode, ProjectDoc, Service } from '@flooow/core/model/types'

function doc(
  nodes: FlooowNode[],
  edges: FlooowEdge[] = [],
  homePageId: string | null = null,
  servicesList: Service[] = [],
): ProjectDoc {
  const base = createEmptyProject()
  return { ...base, meta: { ...base.meta, homePageId }, services: servicesList, nodes, edges }
}

function codes(d: ProjectDoc): ViolationCode[] {
  return checkInvariants(d).map((v) => v.code)
}

describe('invariants — document sain', () => {
  it('projet vierge : aucune violation', () => {
    expect(checkInvariants(createEmptyProject())).toEqual([])
  })

  it('petit graphe valide : aucune violation', () => {
    const page = createPage({ id: 'p', attrs: { slug: '', description: 'x' } })
    const block = createBlock({ id: 'b', parentId: 'p', lot: 2 })
    const note = createBehaviorNote({ id: 'n', attachedTo: 'b', attrs: { hours: 3 } })
    const svc = createService({ id: 'svc' })
    const api = createApiNote({ id: 'a', attachedTo: 'b', serviceId: 'svc', method: 'GET', path: '/x' })
    expect(checkInvariants(doc([page, block, note, api], [], 'p', [svc]))).toEqual([])
  })
})

describe('invariants — chaque violation', () => {
  it('DUPLICATE_ID : deux nœuds de même id', () => {
    const a = createPage({ id: 'dup' })
    const b = createBlock({ id: 'dup', parentId: null })
    expect(codes(doc([a, b]))).toContain('DUPLICATE_ID')
  })

  it('DUPLICATE_ID : deux arêtes de même id', () => {
    const p1 = createPage({ id: 'p1' })
    const p2 = createPage({ id: 'p2' })
    const e1 = createEdge({ id: 'e', type: 'navigatesTo', source: 'p1', target: 'p2' })
    const e2 = createEdge({ id: 'e', type: 'navigatesTo', source: 'p2', target: 'p1' })
    expect(codes(doc([p1, p2], [e1, e2]))).toContain('DUPLICATE_ID')
  })

  it('DUPLICATE_ID : deux services de même id', () => {
    const s1 = createService({ id: 'svc' })
    const s2 = createService({ id: 'svc' })
    expect(codes(doc([], [], null, [s1, s2]))).toContain('DUPLICATE_ID')
  })

  it('DANGLING_EDGE : arête vers un id inexistant', () => {
    const p = createPage({ id: 'p' })
    const e = createEdge({ type: 'navigatesTo', source: 'p', target: 'ghost' })
    expect(codes(doc([p], [e]))).toContain('DANGLING_EDGE')
  })

  it('PARENT_CYCLE : cycle dans parentId', () => {
    const a = createBlock({ id: 'a', parentId: 'b' })
    const b = createBlock({ id: 'b', parentId: 'a' })
    expect(codes(doc([a, b]))).toContain('PARENT_CYCLE')
  })

  it('PAGE_PARENT : une sous-page sous une PAGE est légitime (v12)', () => {
    const parent = createPage({ id: 'parent' })
    const nested = createPage({ id: 'nested', parentId: 'parent' })
    expect(codes(doc([parent, nested]))).not.toContain('PAGE_PARENT')
  })

  it('PAGE_PARENT : une page rattachée à autre chose qu’une page est refusée', () => {
    const mod = createModule({ id: 'm' })
    const nested = createPage({ id: 'nested', parentId: 'm' })
    expect(codes(doc([mod, nested]))).toContain('PAGE_PARENT')
  })

  it('PAGE_PARENT : une page rattachée à un id inexistant est refusée', () => {
    const nested = createPage({ id: 'nested', parentId: 'fantome' })
    expect(codes(doc([nested]))).toContain('PAGE_PARENT')
  })

  it('BLOCK_PARENT : bloc sans parent page', () => {
    const orphanBlock = createBlock({ id: 'b', parentId: null })
    expect(codes(doc([orphanBlock]))).toContain('BLOCK_PARENT')
  })

  it('BLOCK_PARENT : bloc dont le parent n’est pas une page', () => {
    const block = createBlock({ id: 'b1', parentId: 'b2' })
    const parentBlock = createBlock({ id: 'b2', parentId: null })
    expect(codes(doc([block, parentBlock]))).toContain('BLOCK_PARENT')
  })

  it('NOTE_ATTACH : note rattachée à un id inexistant', () => {
    const note = createBehaviorNote({ id: 'n', attachedTo: 'ghost' })
    expect(codes(doc([note]))).toContain('NOTE_ATTACH')
  })

  it('NOTE_ATTACH : note rattachée à une autre note (interdit)', () => {
    const page = createPage({ id: 'p' })
    const n1 = createBehaviorNote({ id: 'n1', attachedTo: 'p' })
    const n2 = createBehaviorNote({ id: 'n2', attachedTo: 'n1' })
    expect(codes(doc([page, n1, n2]))).toContain('NOTE_ATTACH')
  })

  it('BAD_SERVICE_REF : note API pointant un service absent du registre', () => {
    const page = createPage({ id: 'p' })
    const api = createApiNote({ id: 'a', attachedTo: 'p', serviceId: 'unknown', method: 'GET', path: '/x' })
    expect(codes(doc([page, api]))).toContain('BAD_SERVICE_REF')
  })

  it('serviceId présent dans le registre → pas de violation', () => {
    const page = createPage({ id: 'p' })
    const svc = createService({ id: 'svc' })
    const api = createApiNote({ id: 'a', attachedTo: 'p', serviceId: 'svc', method: 'GET', path: '/x' })
    expect(codes(doc([page, api], [], null, [svc]))).not.toContain('BAD_SERVICE_REF')
  })

  it('NAVIGATES_NON_PAGE : navigatesTo vers un non-page', () => {
    const p = createPage({ id: 'p' })
    const block = createBlock({ id: 'b', parentId: 'p' })
    const e = createEdge({ type: 'navigatesTo', source: 'p', target: 'b' })
    expect(codes(doc([p, block], [e]))).toContain('NAVIGATES_NON_PAGE')
  })

  it('BAD_HOME_PAGE : homePageId ne pointe pas vers une page', () => {
    const page = createPage({ id: 'p' })
    const n = createBehaviorNote({ id: 'n', attachedTo: 'p' })
    expect(codes(doc([page, n], [], 'n'))).toContain('BAD_HOME_PAGE')
  })

  it('BAD_HOME_PAGE : homePageId inexistant', () => {
    expect(codes(doc([], [], 'ghost'))).toContain('BAD_HOME_PAGE')
  })

  it('NEGATIVE_HOURS : heures < 0', () => {
    const page = createPage({ id: 'p' })
    const n = createBehaviorNote({ id: 'n', attachedTo: 'p', attrs: { hours: -2 } })
    expect(codes(doc([page, n]))).toContain('NEGATIVE_HOURS')
  })

  it('BAD_LOT : lot < 1', () => {
    const p = createPage({ id: 'p', lot: 0 })
    expect(codes(doc([p]))).toContain('BAD_LOT')
  })
})

describe('invariants — mode de rendu portal (arête)', () => {
  const src = createPage({ id: 'src', attrs: { slug: 's', description: 'd' } })
  const dst = createPage({ id: 'dst', attrs: { slug: 'd', description: 'd' } })

  it('une arête navigatesTo en rendu portal reste saine (purement visuel)', () => {
    const e = createEdge({
      id: 'e',
      type: 'navigatesTo',
      source: 'src',
      target: 'dst',
      attrs: { render: 'portal' },
    })
    expect(checkInvariants(doc([src, dst], [e]))).toEqual([])
  })
})

describe('invariants — DEPENDS_CYCLE', () => {
  const dep = (id: string, source: string, target: string) =>
    createEdge({ id, type: 'dependsOn', source, target })

  it('détecte un cycle dependsOn (cartes bloquées à vie dans l’arbre de déblocage)', () => {
    const a = createFeature({ id: 'a' })
    const b = createFeature({ id: 'b' })
    expect(codes(doc([a, b], [dep('e1', 'a', 'b'), dep('e2', 'b', 'a')]))).toContain('DEPENDS_CYCLE')
  })

  it('un diamant de dépendances n’est pas un cycle', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => createFeature({ id }))
    const edges = [dep('e1', 'a', 'b'), dep('e2', 'a', 'c'), dep('e3', 'b', 'd'), dep('e4', 'c', 'd')]
    expect(codes(doc(nodes, edges))).not.toContain('DEPENDS_CYCLE')
  })

  it('une arête dependsOn fantôme relève de DANGLING_EDGE, pas du cycle', () => {
    const a = createFeature({ id: 'a' })
    const found = codes(doc([a], [dep('e1', 'a', 'fantome')]))
    expect(found).toContain('DANGLING_EDGE')
    expect(found).not.toContain('DEPENDS_CYCLE')
  })
})

describe('invariants — endpointId & assertInvariants', () => {
  it('endpointId canonise méthode + chemin', () => {
    expect(endpointId('GET', '/ok')).toBe('GET /ok')
  })

  it('ne lève rien sur un document sain', () => {
    expect(() => assertInvariants(createEmptyProject())).not.toThrow()
  })

  it('lève une erreur agrégée sur un document invalide', () => {
    const p = createPage({ id: 'p', lot: 0 })
    expect(() => assertInvariants(doc([p]))).toThrow(/BAD_LOT/)
  })
})

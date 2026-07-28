import { describe, it, expect } from 'vitest'
import {
  slugify,
  genId,
  createPage,
  createBlock,
  createBehaviorNote,
  createApiNote,
  createFeature,
  createService,
  createEdge,
} from '@flooow/core/model/factory'

describe('slugify', () => {
  it('produit un slug [a-z0-9-]', () => {
    expect(slugify('Tableau de bord commandes')).toBe('tableau-de-bord-commandes')
  })
  it('retire les diacritiques', () => {
    expect(slugify('Réévaluation à faire')).toBe('reevaluation-a-faire')
  })
  it('collapse les séparateurs', () => {
    expect(slugify('  A// B  ')).toBe('a-b')
  })
})

describe('genId', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  it('génère un UUID v4', () => {
    expect(genId()).toMatch(UUID)
  })
  it('génère des identifiants uniques', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()))
    expect(ids.size).toBe(100)
  })
})

describe('factories', () => {
  it('createPage renseigne les valeurs par défaut', () => {
    const p = createPage({ name: 'Accueil' })
    expect(p.type).toBe('frame')
    expect(p.kind).toBe('page')
    expect(p.parentId).toBeNull()
    expect(p.attrs.name).toBe('Accueil')
    expect(p.lot).toBeNull()
  })

  it('createBlock a un blockType free par défaut et parentId=page', () => {
    const b = createBlock({ parentId: 'page-x', name: 'Hero' })
    expect(b.type).toBe('frame')
    expect(b.kind).toBe('block')
    expect(b.attrs.blockType).toBe('free')
    expect(b.parentId).toBe('page-x')
  })

  it('createBlock accepte un blockType explicite', () => {
    expect(createBlock({ parentId: 'p', blockType: 'grid' }).attrs.blockType).toBe('grid')
  })

  it('createBehaviorNote a une facette nulle par défaut et attachedTo', () => {
    const n = createBehaviorNote({ attachedTo: 'block-x' })
    expect(n.type).toBe('note')
    expect(n.kind).toBe('behavior')
    expect(n.attachedTo).toBe('block-x')
    expect(n.parentId).toBeNull()
    expect(n.attrs.facet).toBeNull()
  })

  it('createFeature naît en statut idee avec une checklist vide (v10)', () => {
    const f = createFeature({ name: 'Devis', code: 'DEV-04', parentId: 'mod-x' })
    expect(f.type).toBe('feature')
    expect(f.parentId).toBe('mod-x')
    expect(f.attrs.code).toBe('DEV-04')
    expect(f.attrs.status).toBe('idee')
    expect(f.attrs.checklist).toEqual([])
  })

  it('createApiNote référence un service + endpoint', () => {
    const n = createApiNote({ attachedTo: 'page-x', serviceId: 'svc', method: 'GET', path: '/x' })
    expect(n.kind).toBe('api')
    expect(n.attrs.serviceId).toBe('svc')
    expect(n.attrs.method).toBe('GET')
    expect(n.attrs.path).toBe('/x')
  })

  it('createEdge accepte render optionnel', () => {
    const e = createEdge({
      type: 'navigatesTo',
      source: 'a',
      target: 'b',
      attrs: { render: 'portal' },
    })
    expect(e.attrs.render).toBe('portal')
  })

  it('createEdge sans attrs : attrs vide (mode ligne par défaut)', () => {
    const e = createEdge({ type: 'navigatesTo', source: 'a', target: 'b' })
    expect(e.attrs).toEqual({})
    expect(e.attrs.render).toBeUndefined()
  })

  it('createService est une entrée de registre (id, baseUrl, risk)', () => {
    const s = createService({ name: 'ERP', baseUrl: 'https://x', risk: 'high' })
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(s.baseUrl).toBe('https://x')
    expect(s.risk).toBe('high')
    expect(s.endpoints).toEqual([])
  })
})

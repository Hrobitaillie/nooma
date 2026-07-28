import { describe, it, expect } from 'vitest'
import { completeness, countIncomplete, REQUIRED_FIELDS } from '@flooow/core/domain/completeness'
import {
  createPage,
  createBlock,
  createBehaviorNote,
  createApiNote,
} from '@flooow/core/model/factory'

describe('completeness — REQUIRED_FIELDS', () => {
  it('table conforme à la spec v2', () => {
    expect(REQUIRED_FIELDS.page).toEqual(['name', 'slug', 'description'])
    expect(REQUIRED_FIELDS.block).toEqual(['name', 'blockType'])
    expect(REQUIRED_FIELDS.behavior).toEqual(['name', 'trigger'])
    expect(REQUIRED_FIELDS.api).toEqual(['serviceId', 'method', 'path'])
  })
})

describe('completeness — par type', () => {
  it('page complète', () => {
    const page = createPage({ name: 'Accueil', attrs: { slug: '', description: 'la home' } })
    expect(completeness(page)).toEqual({ missing: [], complete: true })
  })

  it('page racine incomplète : seule la description manque (slug vide = accueil)', () => {
    const page = createPage({ name: 'Accueil' }) // slug dérivé du nom, description ''
    const c = completeness(page)
    expect(c.complete).toBe(false)
    expect(c.missing).toEqual(['description'])
  })

  it('page racine : un slug vide ne manque pas — c’est l’accueil de son arbre', () => {
    const page = createPage({ name: 'Accueil', slug: '', attrs: { description: 'la home' } })
    expect(completeness(page)).toEqual({ missing: [], complete: true })
  })

  it('sous-page : un slug vide MANQUE — deux sœurs sans segment collisionneraient', () => {
    const page = createPage({
      name: 'Fiche',
      parentId: 'parent',
      slug: '',
      attrs: { description: 'le détail' },
    })
    expect(completeness(page).missing).toEqual(['slug'])
  })

  it('bloc : name + blockType (blockType par défaut free → complet si nommé)', () => {
    const block = createBlock({ parentId: 'p', name: 'Hero', blockType: 'hero' })
    expect(completeness(block)).toEqual({ missing: [], complete: true })
  })

  it('bloc incomplet : nom manquant', () => {
    const block = createBlock({ parentId: 'p', name: '', blockType: 'grid' })
    expect(completeness(block).missing).toEqual(['name'])
  })

  it('note comportement : name + trigger', () => {
    const ok = createBehaviorNote({ attachedTo: 'b', name: 'Login', attrs: { trigger: 'clic' } })
    expect(completeness(ok).complete).toBe(true)
    const ko = createBehaviorNote({ attachedTo: 'b', name: 'Login' })
    expect(completeness(ko).missing).toEqual(['trigger'])
  })

  it('note API : serviceId + method + path', () => {
    const ko = createApiNote({ attachedTo: 'b', serviceId: 'svc' }) // method/path vides
    expect(completeness(ko).missing.sort()).toEqual(['method', 'path'])
    const ok = createApiNote({ attachedTo: 'b', serviceId: 'svc', method: 'GET', path: '/x' })
    expect(completeness(ok).complete).toBe(true)
  })

  it('champ blanc (espaces uniquement) compte comme manquant', () => {
    const page = createPage({ attrs: { slug: '', description: '   ' } })
    expect(completeness(page).missing).toEqual(['description'])
  })
})

describe('completeness — countIncomplete', () => {
  it('compte les nœuds incomplets', () => {
    const complete = createBlock({ parentId: 'p', name: 'S', blockType: 'grid' })
    const incomplete1 = createPage({ name: 'A' }) // route + description manquants
    const incomplete2 = createBehaviorNote({ attachedTo: 'b', name: 'B' }) // trigger manquant
    expect(countIncomplete([complete, incomplete1, incomplete2])).toBe(2)
  })

  it('liste vide → 0', () => {
    expect(countIncomplete([])).toBe(0)
  })
})

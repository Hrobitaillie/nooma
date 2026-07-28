import { describe, expect, it } from 'vitest'

import {
  parseViewportMemo,
  serializeViewportMemo,
  viewportMemoApplies,
  viewportMemoKey,
  type ViewportMemo,
} from '../src/canvas/viewportMemory'

const PLAN: ViewportMemo = {
  x: -120.5,
  y: 340,
  zoom: 0.62,
  layer: 'functional',
  funcView: 'plan',
  funcModule: null,
}

describe('viewportMemory — clé de stockage', () => {
  it('dérive la clé du projet ouvert (dossier/fichier)', () => {
    expect(viewportMemoKey('exemples', 'locasyst-project')).toBe(
      'flooow:viewport:exemples/locasyst-project',
    )
  })

  it('sépare deux projets homonymes de dossiers différents', () => {
    expect(viewportMemoKey('a', 'p')).not.toBe(viewportMemoKey('b', 'p'))
  })
})

describe('viewportMemory — sérialisation', () => {
  it('fait un aller-retour fidèle', () => {
    expect(parseViewportMemo(serializeViewportMemo(PLAN))).toEqual(PLAN)
  })

  it('rend null sur du JSON cassé plutôt que de lever', () => {
    expect(parseViewportMemo('{pas du json')).toBeNull()
  })

  it('rend null sur une valeur absente ou vide', () => {
    expect(parseViewportMemo(null)).toBeNull()
    expect(parseViewportMemo('')).toBeNull()
    expect(parseViewportMemo('null')).toBeNull()
    expect(parseViewportMemo('"une chaîne"')).toBeNull()
  })

  it('refuse les coordonnées non finies (un zoom NaN/Infini fige le canvas)', () => {
    expect(parseViewportMemo('{"x":null,"y":0,"zoom":1,"layer":"functional","funcView":"plan","funcModule":null}')).toBeNull()
    // JSON.stringify écrit `null` pour NaN/Infinity : on couvre les deux formes.
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, zoom: Number.NaN }))).toBeNull()
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, x: Number.POSITIVE_INFINITY }))).toBeNull()
  })

  it('refuse un zoom nul ou négatif', () => {
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, zoom: 0 }))).toBeNull()
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, zoom: -1 }))).toBeNull()
  })

  it('refuse un contexte absent ou inconnu (mémo d’une version antérieure)', () => {
    expect(parseViewportMemo('{"x":0,"y":0,"zoom":1}')).toBeNull()
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, layer: 'autre' }))).toBeNull()
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, funcView: 'autre' }))).toBeNull()
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, funcModule: 42 }))).toBeNull()
  })

  it('ignore les clés surnuméraires (pas de schéma strict ici : ce n’est pas le document)', () => {
    expect(parseViewportMemo(JSON.stringify({ ...PLAN, inconnu: 1 }))).toEqual(PLAN)
  })
})

describe('viewportMemory — rejouabilité selon la scène', () => {
  it('rejoue un cadrage pris dans la même scène', () => {
    expect(viewportMemoApplies(PLAN, { layer: 'functional', funcView: 'plan', funcModule: null })).toBe(true)
  })

  it('refuse de rejouer un cadrage d’une autre couche', () => {
    expect(viewportMemoApplies(PLAN, { layer: 'structural', funcView: 'plan', funcModule: null })).toBe(false)
  })

  it('refuse de rejouer un cadrage du plan sur une vue par module (scènes disjointes)', () => {
    expect(viewportMemoApplies(PLAN, { layer: 'functional', funcView: 'module', funcModule: 'mod-1' })).toBe(false)
  })

  it('refuse de rejouer le cadrage d’un module sur un AUTRE module', () => {
    const memo: ViewportMemo = { ...PLAN, funcView: 'module', funcModule: 'mod-1' }
    expect(viewportMemoApplies(memo, { layer: 'functional', funcView: 'module', funcModule: 'mod-2' })).toBe(false)
    expect(viewportMemoApplies(memo, { layer: 'functional', funcView: 'module', funcModule: 'mod-1' })).toBe(true)
  })

  it('ignore le module mémorisé sur la couche structurelle et en vue plan', () => {
    const memo: ViewportMemo = { ...PLAN, layer: 'structural', funcModule: 'mod-1' }
    expect(viewportMemoApplies(memo, { layer: 'structural', funcView: 'module', funcModule: 'mod-9' })).toBe(true)
    const planMemo: ViewportMemo = { ...PLAN, funcModule: 'mod-1' }
    expect(viewportMemoApplies(planMemo, { layer: 'functional', funcView: 'plan', funcModule: null })).toBe(true)
  })
})

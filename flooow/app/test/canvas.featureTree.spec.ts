// Arbre de dépendances de la couche fonctionnelle (featureTree) : niveaux dérivés des arêtes
// « dépend de » (source = la dépendante), séparation intra/externe, layout en rangées.
import { describe, it, expect } from 'vitest'
import {
  FEATURE_CARD_WIDTH,
  MODULE_GAP,
  TREE_MAX_COLS,
  featureLevels,
  moduleRowsLayout,
  splitFeatureDeps,
  treeLayout,
  type ModuleItem,
  type TreeItem,
} from '@/canvas/featureTree'

const W = FEATURE_CARD_WIDTH
const GAP = 28

function item(id: string, orderX = 0, orderY = 0, h = 100): TreeItem {
  return { id, h, orderX, orderY }
}

describe('featureLevels — niveaux dérivés de « dépend de »', () => {
  it('sans dépendance = niveau 0 ; chaque dépendante descend sous sa dépendance', () => {
    // c dépend de b, b dépend de a → a en haut, chaîne qui descend.
    const levels = featureLevels(
      ['a', 'b', 'c'],
      [
        { source: 'b', target: 'a' },
        { source: 'c', target: 'b' },
      ],
      new Set(),
    )
    expect(levels.get('a')).toBe(0)
    expect(levels.get('b')).toBe(1)
    expect(levels.get('c')).toBe(2)
  })

  it('plusieurs dépendances → sous la PLUS BASSE (max des niveaux + 1)', () => {
    // d dépend de a (niv 0) et de c (niv 1) → d au niveau 2.
    const levels = featureLevels(
      ['a', 'c', 'd'],
      [
        { source: 'c', target: 'a' },
        { source: 'd', target: 'a' },
        { source: 'd', target: 'c' },
      ],
      new Set(),
    )
    expect(levels.get('d')).toBe(2)
  })

  it('une dépendance EXTERNE pousse au moins un niveau sous les racines', () => {
    const levels = featureLevels(['a', 'b'], [], new Set(['b']))
    expect(levels.get('a')).toBe(0)
    expect(levels.get('b')).toBe(1)
  })

  it("descente externe et chaîne intra se composent (l'arbre local reste cohérent)", () => {
    // a dépend d'une externe (niv ≥ 1) et b dépend de a → b descend encore d'un cran.
    const levels = featureLevels(['a', 'b'], [{ source: 'b', target: 'a' }], new Set(['a']))
    expect(levels.get('a')).toBe(1)
    expect(levels.get('b')).toBe(2)
  })

  it('cycle : termine et coupe l’arête retour (pas de récursion infinie)', () => {
    const levels = featureLevels(
      ['a', 'b'],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
      new Set(),
    )
    expect(levels.size).toBe(2)
    // Les deux niveaux sont finis et l'un des deux descend sous l'autre.
    const vals = [...levels.values()].sort()
    expect(vals[0]).toBe(0)
    expect(vals[1]).toBe(1)
  })
})

describe('splitFeatureDeps — intra-module vs dépendances externes', () => {
  it('sépare les arêtes internes des sorties de module', () => {
    const { intra, hasExternalDep } = splitFeatureDeps(new Set(['a', 'b']), [
      { source: 'b', target: 'a' }, // intra
      { source: 'a', target: 'x' }, // a dépend d'une fonctionnalité d'un autre module
      { source: 'x', target: 'a' }, // une externe dépend de a : n'affecte pas ce module
    ])
    expect(intra).toEqual([{ source: 'b', target: 'a' }])
    expect(hasExternalDep).toEqual(new Set(['a']))
  })
})

describe('treeLayout — rangées par niveau', () => {
  it('racines en haut, dépendante dessous, hauteur de rangée = carte la plus haute', () => {
    // a et b racines (a haute de 200), c dépend de a.
    const tl = treeLayout(
      [item('a', 0, 0, 200), item('b', 300, 0, 100), item('c', 0, 0, 100)],
      [{ source: 'c', target: 'a' }],
      new Set(),
      W,
      GAP,
    )
    const [ra, rb, rc] = [tl.rects.get('a')!, tl.rects.get('b')!, tl.rects.get('c')!]
    expect(ra.y).toBe(0)
    expect(rb.y).toBe(0)
    expect(rc.y).toBe(200 + GAP) // sous la rangée 0, haute de 200
    expect(tl.rows).toEqual([['a', 'b'], ['c']])
    // Rangée 1 (une seule carte) centrée sous la rangée 0 (deux cartes).
    expect(rc.x).toBeGreaterThan(0)
  })

  it("l'ordre dans une rangée suit orderX (puis orderY, puis id)", () => {
    const tl = treeLayout(
      [item('droite', 500), item('gauche', -10), item('milieu', 200)],
      [],
      new Set(),
      W,
      GAP,
    )
    expect(tl.rows).toEqual([['gauche', 'milieu', 'droite']])
    const xs = ['gauche', 'milieu', 'droite'].map((id) => tl.rects.get(id)!.x)
    expect(xs[0]!).toBeLessThan(xs[1]!)
    expect(xs[1]!).toBeLessThan(xs[2]!)
    expect(xs[1]! - xs[0]!).toBe(W + GAP)
  })

  it('retour à la ligne au-delà de TREE_MAX_COLS cartes dans un niveau', () => {
    const items = ['a', 'b', 'c', 'd'].map((id, i) => item(id, i * 10))
    const tl = treeLayout(items, [], new Set(), W, GAP)
    expect(TREE_MAX_COLS).toBe(3)
    expect(tl.rows).toEqual([['a', 'b', 'c'], ['d']])
    expect(tl.rects.get('d')!.y).toBe(100 + GAP)
    expect(tl.contentW).toBe(3 * W + 2 * GAP)
  })

  it('rangées centrées dans innerW quand le contenu est moins large', () => {
    const tl = treeLayout([item('a')], [], new Set(), W, GAP, W + 100)
    expect(tl.rects.get('a')!.x).toBe(50)
  })

  it('module vide → layout vide', () => {
    const tl = treeLayout([], [], new Set(), W, GAP)
    expect(tl.rects.size).toBe(0)
    expect(tl.contentH).toBe(0)
    expect(tl.contentW).toBe(0)
  })
})

describe('moduleRowsLayout — rangées de modules auto, jamais de chevauchement', () => {
  const mod = (id: string, orderX: number, orderY: number, w = 300, h = 400): ModuleItem => ({
    id,
    w,
    h,
    orderX,
    orderY,
  })

  it('même rangée : ordre par clé x, espacement MODULE_GAP cumulé sur les largeurs', () => {
    // Clés volontairement superposées (mêmes positions) : le layout dé-chevauche quand même.
    const { pos, rows } = moduleRowsLayout([mod('b', 10, 0, 500), mod('a', 0, 0, 300), mod('c', 10, 0, 300)])
    expect(rows).toEqual([['a', 'b', 'c']])
    expect(pos.get('a')).toEqual({ x: 0, y: 0 })
    expect(pos.get('b')).toEqual({ x: 300 + MODULE_GAP, y: 0 })
    expect(pos.get('c')).toEqual({ x: 300 + MODULE_GAP + 500 + MODULE_GAP, y: 0 })
  })

  it('un module SOUS la rangée (aucun recouvrement vertical) ouvre une nouvelle rangée', () => {
    const { pos, rows } = moduleRowsLayout([
      mod('a', 0, 0, 300, 400),
      mod('b', 400, 0, 300, 600), // rangée 0, plus haut
      mod('c', 0, 900, 300, 300), // clé y sous [0, 600) → rangée 1
    ])
    expect(rows).toEqual([
      ['a', 'b'],
      ['c'],
    ])
    expect(pos.get('c')).toEqual({ x: 0, y: 600 + MODULE_GAP }) // sous le plus haut de la rangée 0
  })

  it('recouvrement vertical partiel → même rangée (une disposition existante ne s’éclate pas)', () => {
    const { rows } = moduleRowsLayout([mod('a', 0, 0, 300, 400), mod('b', 400, 350, 300, 400)])
    expect(rows).toEqual([['a', 'b']])
  })

  it('aucun chevauchement quelles que soient les clés', () => {
    const items = [
      mod('a', 0, 0, 320, 500),
      mod('b', 5, 3, 880, 200),
      mod('c', 2, 1, 300, 700),
      mod('d', 0, 1200, 460, 300),
    ]
    const { pos } = moduleRowsLayout(items)
    const rects = items.map((it) => {
      const p = pos.get(it.id) as { x: number; y: number }
      return { x: p.x, y: p.y, w: it.w, h: it.h }
    })
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as { x: number; y: number; w: number; h: number }
        const b = rects[j] as { x: number; y: number; w: number; h: number }
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
    }
  })
})

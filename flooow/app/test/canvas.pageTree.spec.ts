// Layout d'arbre de pages (v13, retours du 22/07) — arbre « tidy » RÉCURSIF 100 % DÉRIVÉ : les
// enfants d'une page, À TOUS LES NIVEAUX, se rangent horizontalement sous elle (chaque sous-arbre
// dans sa bande), parent centré sur les cartes de sa rangée, arbres côte à côte dans l'ordre des
// clés de racines, réservation de droite (notes) comptée dans la largeur. Géométrie pure, sans
// Vue Flow.
import { describe, it, expect } from 'vitest'
import {
  pageTreeLayout,
  TREE_COL_GAP,
  TREE_GAP,
  TREE_PAD,
  TREE_RAIL_GAP,
  type PageTreeItem,
} from '../src/canvas/pageTree'

const W = 300

function item(
  id: string,
  parentId: string | null,
  order = 0,
  h = 100,
  extraRight = 0,
): PageTreeItem {
  return { id, parentId, order, h, extraRight }
}

describe('pageTreeLayout', () => {
  it('pose une racine seule à l’origine du monde', () => {
    const { rect, depth } = pageTreeLayout([item('a', null, 0, 120)], { pageW: W })
    expect(rect.get('a')).toEqual({ x: TREE_PAD, y: TREE_PAD, w: W, h: 120 })
    expect(depth.get('a')).toBe(0)
  })

  it('range les ARBRES côte à côte dans l’ordre des clés de racines', () => {
    const layout = pageTreeLayout(
      [item('second', null, 20, 100), item('premier', null, 10, 100)],
      { pageW: W },
    )
    expect(layout.rect.get('premier')!.x).toBe(TREE_PAD)
    expect(layout.rect.get('second')!.x).toBe(TREE_PAD + W + TREE_GAP)
  })

  it('le placement est canonique : les mêmes clés donnent toujours la même scène', () => {
    const build = () =>
      pageTreeLayout(
        [item('r', null, 5, 100), item('a', 'r', 1), item('b', 'r', 2), item('c', 'a', 0)],
        { pageW: W },
      )
    const l1 = build()
    const l2 = build()
    for (const id of ['r', 'a', 'b', 'c']) expect(l2.rect.get(id)).toEqual(l1.rect.get(id))
  })

  it('centre la racine sur son rail et ordonne les rubriques par clé x', () => {
    const layout = pageTreeLayout(
      [item('root', null, 0, 100), item('b', 'root', 20), item('a', 'root', 10)],
      { pageW: W },
    )
    const root = layout.rect.get('root')!
    const ra = layout.rect.get('a')!
    const rb = layout.rect.get('b')!
    expect(ra.x).toBeLessThan(rb.x)
    // Rail sous la racine, à TREE_RAIL_GAP.
    expect(ra.y).toBe(TREE_PAD + 100 + TREE_RAIL_GAP)
    expect(rb.y).toBe(ra.y)
    // Racine centrée : son centre = le centre des deux sous-arbres.
    const totalW = 2 * W + TREE_COL_GAP
    expect(root.x + W / 2).toBeCloseTo(TREE_PAD + totalW / 2)
    expect(layout.depth.get('a')).toBe(1)
  })

  it('les enfants d’une page se rangent HORIZONTALEMENT à tous les niveaux', () => {
    const layout = pageTreeLayout(
      [
        item('root', null, 0, 100),
        item('rub', 'root', 0, 80),
        item('f1', 'rub', 10, 90),
        item('f2', 'rub', 20, 60),
      ],
      { pageW: W },
    )
    const rub = layout.rect.get('rub')!
    const f1 = layout.rect.get('f1')!
    const f2 = layout.rect.get('f2')!
    // Fratrie en RANGÉE sous le parent (pas de pile verticale) : même y, côte à côte par clé.
    expect(f1.y).toBe(rub.y + rub.h + TREE_RAIL_GAP)
    expect(f2.y).toBe(f1.y)
    expect(f2.x).toBe(f1.x + W + TREE_COL_GAP)
    // Parent centré sur la rangée de ses enfants.
    expect(rub.x + W / 2).toBeCloseTo((f1.x + f2.x + W) / 2)
    expect(layout.depth.get('f1')).toBe(2)
  })

  it('une chaîne à enfant unique reste alignée à l’aplomb, un niveau par rangée', () => {
    const layout = pageTreeLayout(
      [
        item('root', null, 0, 100),
        item('rub', 'root', 0, 80),
        item('fils', 'rub', 0, 90),
        item('petit-fils', 'fils', 0, 70),
      ],
      { pageW: W },
    )
    const rub = layout.rect.get('rub')!
    const fils = layout.rect.get('fils')!
    const pf = layout.rect.get('petit-fils')!
    expect(fils.x).toBe(rub.x)
    expect(pf.x).toBe(rub.x)
    expect(fils.y).toBe(rub.y + rub.h + TREE_RAIL_GAP)
    expect(pf.y).toBe(fils.y + fils.h + TREE_RAIL_GAP)
    expect(layout.depth.get('petit-fils')).toBe(3)
  })

  it('centre la racine à l’aplomb d’un enfant unique, réservation de droite ignorée', () => {
    const layout = pageTreeLayout(
      [
        item('root', null, 0, 100),
        item('rub', 'root', 0, 100, 180), // la réservation (notes) ne décale pas la racine
        item('fils', 'rub', 0, 100),
      ],
      { pageW: W },
    )
    expect(layout.rect.get('root')!.x).toBe(layout.rect.get('rub')!.x)
    expect(layout.rect.get('fils')!.x).toBe(layout.rect.get('rub')!.x)
  })

  it('la réservation de droite (notes) élargit le sous-arbre et pousse le suivant', () => {
    const base = pageTreeLayout(
      [item('root', null), item('rub', 'root', 0), item('rub2', 'root', 10)],
      { pageW: W },
    )
    const wide = pageTreeLayout(
      [item('root', null), item('rub', 'root', 0, 100, 180), item('rub2', 'root', 10)],
      { pageW: W },
    )
    const shift =
      (wide.rect.get('rub2')!.x - wide.rect.get('rub')!.x) -
      (base.rect.get('rub2')!.x - base.rect.get('rub')!.x)
    expect(shift).toBe(180)
    // …et pousse aussi l'arbre suivant.
    const base2 = pageTreeLayout([item('r1', null, 0), item('r2', null, 10)], { pageW: W })
    const wide2 = pageTreeLayout([item('r1', null, 0, 100, 180), item('r2', null, 10)], { pageW: W })
    expect(wide2.rect.get('r2')!.x - base2.rect.get('r2')!.x).toBe(180)
  })

  it('l’ordre des frères suit la clé x, pas l’ordre d’entrée', () => {
    const layout = pageTreeLayout(
      [item('root', null), item('rub', 'root'), item('second', 'rub', 20), item('premier', 'rub', 10)],
      { pageW: W },
    )
    expect(layout.rect.get('premier')!.x).toBeLessThan(layout.rect.get('second')!.x)
  })

  it('un parent inconnu du jeu vaut racine (page jamais évaporée)', () => {
    const layout = pageTreeLayout([item('seule', 'fantome', 0, 100)], { pageW: W })
    expect(layout.rect.get('seule')).toEqual({ x: TREE_PAD, y: TREE_PAD, w: W, h: 100 })
    expect(layout.depth.get('seule')).toBe(0)
  })

  it('un cycle de parentId ne fait ni boucle infinie ni page disparue', () => {
    const layout = pageTreeLayout([item('a', 'b'), item('b', 'a')], { pageW: W })
    expect(layout.rect.has('a')).toBe(true)
    expect(layout.rect.has('b')).toBe(true)
  })
})

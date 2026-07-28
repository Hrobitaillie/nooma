import { describe, expect, it } from 'vitest'

import {
  GAP_X,
  GAP_Y,
  PAD,
  computeLevels,
  globalTreeLayout,
  orderedByLevel,
  type GlobalItem,
} from '../src/canvas/globalTree'

const W = 276
const H = 100

function it_(id: string, deps: string[] = [], lot = 1, mod: string | null = null): GlobalItem {
  return { id, h: H, lot, module: mod, deps }
}

const OPTS = { groupByLot: false, groupByModule: false, spaceLots: false, cardW: W, moduleHeaderH: 54 }

describe('computeLevels — niveaux GLOBAUX (plus long chemin)', () => {
  it('met les racines au niveau 0 et empile les dépendants', () => {
    const lv = computeLevels([it_('a'), it_('b', ['a']), it_('c', ['b'])])
    expect(lv.get('a')).toBe(0)
    expect(lv.get('b')).toBe(1)
    expect(lv.get('c')).toBe(2)
  })

  it('prend le plus LONG chemin, pas le plus court', () => {
    // d dépend de a (niv 0) ET de c (niv 2) → il doit descendre au niveau 3, pas au niveau 1.
    const lv = computeLevels([it_('a'), it_('b', ['a']), it_('c', ['b']), it_('d', ['a', 'c'])])
    expect(lv.get('d')).toBe(3)
  })

  it('ignore une dépendance vers un id absent du jeu', () => {
    const lv = computeLevels([it_('a', ['fantome'])])
    expect(lv.get('a')).toBe(0)
  })

  it('termine sur un cycle sans boucler (garde défensive)', () => {
    const lv = computeLevels([it_('a', ['b']), it_('b', ['a'])])
    expect(lv.get('a')).toBeTypeOf('number')
    expect(lv.get('b')).toBeTypeOf('number')
  })

  it('calcule les niveaux à travers les modules — la frontière de module ne coupe rien', () => {
    // Le point de bascule : « a » et « b » sont dans deux modules différents.
    const lv = computeLevels([it_('a', [], 1, 'M1'), it_('b', ['a'], 1, 'M2')])
    expect(lv.get('b')).toBe(1)
  })
})

describe('orderedByLevel — ordre par barycentre des prérequis', () => {
  it('garde l’ordre d’entrée sur le premier niveau', () => {
    const items = [it_('a'), it_('b'), it_('c')]
    const { byLevel } = orderedByLevel(items, computeLevels(items))
    expect(byLevel.get(0)).toEqual(['a', 'b', 'c'])
  })

  it('range un dépendant sous son prérequis pour éviter les croisements', () => {
    // x/y/z au niveau 0 ; p dépend de z (index 2), q dépend de x (index 0) → q avant p.
    const items = [it_('x'), it_('y'), it_('z'), it_('p', ['z']), it_('q', ['x'])]
    const { byLevel } = orderedByLevel(items, computeLevels(items))
    expect(byLevel.get(1)).toEqual(['q', 'p'])
  })

  it('rejette en fin de rangée une carte sans prérequis placé', () => {
    const items = [it_('a'), it_('b', ['a']), it_('orpheline', ['inconnu'])]
    const lv = computeLevels(items)
    // « orpheline » retombe au niveau 0 (dep ignorée) : elle reste dans l'ordre d'entrée.
    expect(lv.get('orpheline')).toBe(0)
  })
})

describe('globalTreeLayout — flux global (aucun regroupement)', () => {
  it('pose une rangée par niveau, sans aucun retour à la ligne', () => {
    // 5 cartes au même niveau : la maquette n'a PAS de limite de colonnes (l'ancien layout
    // cassait à 3). Elles doivent toutes partager la même ordonnée.
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => it_(id))
    const { rect } = globalTreeLayout(items, OPTS)
    const ys = new Set(items.map((i) => rect.get(i.id)?.y))
    expect(ys.size).toBe(1)
  })

  it('espace les cartes de GAP_X et les niveaux de GAP_Y', () => {
    const items = [it_('a'), it_('b'), it_('c', ['a'])]
    const { rect } = globalTreeLayout(items, OPTS)
    const a = rect.get('a')!
    const b = rect.get('b')!
    const c = rect.get('c')!
    expect(b.x - (a.x + W)).toBe(GAP_X)
    expect(c.y - (a.y + H)).toBe(GAP_Y)
  })

  it('centre chaque rangée sur la plus large', () => {
    // Niveau 0 : 2 cartes ; niveau 1 : 1 carte → elle doit être centrée sous les deux.
    const items = [it_('a'), it_('b'), it_('c', ['a', 'b'])]
    const { rect } = globalTreeLayout(items, OPTS)
    const a = rect.get('a')!
    const b = rect.get('b')!
    const c = rect.get('c')!
    expect(c.x + W / 2).toBeCloseTo((a.x + b.x + W) / 2, 5)
  })

  it('démarre à la marge PAD et ne produit aucun bac', () => {
    const { rect, containers } = globalTreeLayout([it_('a')], OPTS)
    expect(rect.get('a')?.y).toBe(PAD)
    expect(containers).toEqual([])
  })
})

describe('globalTreeLayout — compartiments', () => {
  it('aligne un même niveau à la MÊME ordonnée dans deux lots différents', () => {
    // C'est l'invariant que l'ancien layout par module ne pouvait pas tenir.
    const items = [
      it_('a1', [], 1),
      it_('a2', ['a1'], 1),
      it_('b1', [], 2),
      it_('b2', ['b1'], 2),
    ]
    const { rect } = globalTreeLayout(items, { ...OPTS, groupByLot: true })
    expect(rect.get('a1')?.y).toBe(rect.get('b1')?.y)
    expect(rect.get('a2')?.y).toBe(rect.get('b2')?.y)
  })

  it('range les colonnes de lot par numéro croissant', () => {
    const items = [it_('z', [], 3), it_('a', [], 1)]
    const { rect } = globalTreeLayout(items, { ...OPTS, groupByLot: true })
    expect(rect.get('a')!.x).toBeLessThan(rect.get('z')!.x)
  })

  it('émet un bac par lot, avant ses sous-bacs de module (donc dessiné dessous)', () => {
    const items = [it_('a', [], 1, 'M1'), it_('b', [], 1, 'M2')]
    const { containers } = globalTreeLayout(items, {
      ...OPTS,
      groupByLot: true,
      groupByModule: true,
    })
    expect(containers[0]?.kind).toBe('lot')
    expect(containers.filter((c) => c.kind === 'module').map((c) => c.label)).toEqual(['M1', 'M2'])
  })

  it('place les cartes sans module dans un groupe « — » en dernier', () => {
    const items = [it_('a', [], 1, 'M1'), it_('libre', [], 1, null)]
    const { containers } = globalTreeLayout(items, {
      ...OPTS,
      groupByLot: true,
      groupByModule: true,
    })
    const mods = containers.filter((c) => c.kind === 'module').map((c) => c.label)
    expect(mods[mods.length - 1]).toBe('—')
  })

  it('répète un module présent dans deux lots, un sous-bac par lot', () => {
    const items = [it_('a', [], 1, 'Commun'), it_('b', [], 2, 'Commun')]
    const { containers } = globalTreeLayout(items, {
      ...OPTS,
      groupByLot: true,
      groupByModule: true,
    })
    expect(containers.filter((c) => c.kind === 'module' && c.label === 'Commun')).toHaveLength(2)
  })

  it('n’émet aucun bac de lot quand seul le groupement par module est actif', () => {
    const items = [it_('a', [], 1, 'M1')]
    const { containers } = globalTreeLayout(items, { ...OPTS, groupByModule: true })
    expect(containers.some((c) => c.kind === 'lot')).toBe(false)
    expect(containers.some((c) => c.kind === 'module')).toBe(true)
  })

  it('« Espacer les lots » écarte davantage les colonnes', () => {
    const items = [it_('a', [], 1), it_('b', [], 2)]
    const serre = globalTreeLayout(items, { ...OPTS, groupByLot: true })
    const large = globalTreeLayout(items, { ...OPTS, groupByLot: true, spaceLots: true })
    expect(large.rect.get('b')!.x).toBeGreaterThan(serre.rect.get('b')!.x)
  })

  it('les bacs englobent les cartes qu’ils compartimentent (vue plan)', () => {
    const items = [it_('a', [], 1, 'M1'), it_('b', ['a'], 1, 'M1')]
    const { rect, containers } = globalTreeLayout(items, {
      ...OPTS,
      groupByLot: true,
      groupByModule: true,
    })
    const lot = containers.find((c) => c.kind === 'lot')!
    for (const id of ['a', 'b']) {
      const r = rect.get(id)!
      expect(r.x).toBeGreaterThanOrEqual(lot.x)
      expect(r.x + r.w).toBeLessThanOrEqual(lot.x + lot.w)
      expect(r.y).toBeGreaterThanOrEqual(lot.y)
      expect(r.y + r.h).toBeLessThanOrEqual(lot.y + lot.h)
    }
  })
})

describe('globalTreeLayout — vue par module (focusModule)', () => {
  /**
   * Jeu de référence de tous les tests de ce bloc, calqué sur le cas réel qui a motivé le mode :
   *
   *   amont  ─ A0 (module AMONT, niveau 0)
   *              └→ M1 (module CIBLE, niveau 1) ─→ M2 (CIBLE, niveau 2) ─→ D3 (module AVAL, niv. 3)
   *   isolée ─ HORS (module TIERS) : ne touche RIEN de la cible.
   *
   * Les niveaux sont GLOBAUX : « A0 » est bien au niveau 0, « D3 » au niveau 3 — c'est ce que le
   * mode doit préserver, et ce que l'ancien layout par module ne savait pas dire.
   */
  const jeu = (): GlobalItem[] => [
    it_('A0', [], 1, 'AMONT'),
    it_('M1', ['A0'], 1, 'CIBLE'),
    it_('M2', ['M1'], 1, 'CIBLE'),
    it_('D3', ['M2'], 1, 'AVAL'),
    it_('HORS', [], 1, 'TIERS'),
  ]
  const focus = (mod = 'CIBLE'): ReturnType<typeof globalTreeLayout> =>
    globalTreeLayout(jeu(), { ...OPTS, groupByLot: true, groupByModule: true, focusModule: mod })

  it('prend le pas sur flow/bands : aucun bac de lot n’est émis', () => {
    // `groupByLot` est actif dans `focus()` — en vue par module il ne doit rien compartimenter.
    expect(focus().containers.some((c) => c.kind === 'lot')).toBe(false)
  })

  it('n’affiche que le module ciblé et les cartes d’AUTRES modules directement liées', () => {
    const { rect } = focus()
    expect([...rect.keys()].sort()).toEqual(['A0', 'D3', 'M1', 'M2'])
  })

  it('laisse dehors une carte d’un autre module qui ne touche pas la cible', () => {
    expect(focus().rect.has('HORS')).toBe(false)
  })

  it('replie les niveaux vides : seuls les niveaux peuplés forment une rangée', () => {
    // Cible seule (satellites coupés du jeu) : ses cartes sont aux niveaux GLOBAUX 1 et 2, il ne
    // doit donc PAS y avoir de rangée vide au-dessus — la 1re rangée démarre en haut du cadre.
    const items = [it_('M1', [], 1, 'CIBLE'), it_('M2', ['M1'], 1, 'CIBLE')]
    const seul = globalTreeLayout(items, { ...OPTS, focusModule: 'CIBLE' })
    const avec = focus()
    // Deux rangées consécutives, écartées d'exactement GAP_Y dans les deux cas.
    expect(seul.rect.get('M2')!.y - (seul.rect.get('M1')!.y + H)).toBe(GAP_Y)
    expect(avec.rect.get('M2')!.y - (avec.rect.get('M1')!.y + H)).toBe(GAP_Y)
    // Et le niveau 1 de « M1 » ne laisse aucun trou : sa rangée est la 2e (sous celle de « A0 »).
    expect(avec.rect.get('M1')!.y - (avec.rect.get('A0')!.y + H)).toBe(GAP_Y)
  })

  it('cale un satellite sur le NIVEAU de sa carte, jamais au niveau 0', () => {
    const { rect } = focus()
    // « D3 » est au niveau 3 : il doit partager l'ordonnée de la 4e rangée, pas celle de la 1re.
    expect(rect.get('D3')!.y).toBeGreaterThan(rect.get('M2')!.y)
    expect(rect.get('D3')!.y).not.toBe(rect.get('A0')!.y)
    // Et « A0 », prérequis de niveau 0, partage la rangée la plus haute.
    expect(rect.get('A0')!.y).toBe(Math.min(...[...rect.values()].map((r) => r.y)))
  })

  it('pose l’amont à GAUCHE et l’aval à DROITE du module affiché', () => {
    const { rect } = focus()
    expect(rect.get('A0')!.x).toBeLessThan(rect.get('M1')!.x)
    expect(rect.get('D3')!.x).toBeGreaterThan(rect.get('M2')!.x)
  })

  it('marque les cadres externes en satellite, et pas celui du module affiché', () => {
    const { containers } = focus()
    const cible = containers.find((c) => c.label === 'CIBLE')!
    expect(cible.satellite).toBeFalsy()
    expect(containers.filter((c) => c.satellite).map((c) => c.label).sort()).toEqual([
      'AMONT',
      'AVAL',
    ])
  })

  it('un cadre satellite commence au niveau de sa carte et s’arrête après elle', () => {
    const { rect, containers } = focus()
    const aval = containers.find((c) => c.label === 'AVAL')!
    const d3 = rect.get('D3')!
    // Il n'englobe PAS toute la hauteur : son sommet est sous la première rangée du monde.
    expect(aval.y).toBeGreaterThan(Math.min(...[...rect.values()].map((r) => r.y)))
    // Mais il englobe bien sa carte, en-tête compris (la carte est sous l'en-tête du cadre).
    expect(d3.y).toBeGreaterThan(aval.y)
    expect(d3.y + d3.h).toBeLessThanOrEqual(aval.y + aval.h)
  })

  it('chaque cadre englobe horizontalement ses cartes', () => {
    const { rect, containers } = focus()
    const membres: Record<string, string[]> = { CIBLE: ['M1', 'M2'], AMONT: ['A0'], AVAL: ['D3'] }
    for (const c of containers) {
      for (const id of membres[c.label] ?? []) {
        const r = rect.get(id)!
        expect(r.x).toBeGreaterThanOrEqual(c.x)
        expect(r.x + r.w).toBeLessThanOrEqual(c.x + c.w)
        expect(r.y + r.h).toBeLessThanOrEqual(c.y + c.h)
      }
    }
  })

  it('centre chaque niveau dans sa colonne', () => {
    // Cible à deux cartes au niveau 0 et une au niveau 1 : la seconde rangée est centrée.
    const items = [
      it_('a', [], 1, 'CIBLE'),
      it_('b', [], 1, 'CIBLE'),
      it_('c', ['a', 'b'], 1, 'CIBLE'),
    ]
    const { rect } = globalTreeLayout(items, { ...OPTS, focusModule: 'CIBLE' })
    const a = rect.get('a')!
    const b = rect.get('b')!
    expect(rect.get('c')!.x + W / 2).toBeCloseTo((a.x + b.x + W) / 2, 5)
  })

  it('rend un monde vide pour un module inconnu, sans jeter', () => {
    const r = globalTreeLayout(jeu(), { ...OPTS, focusModule: 'INEXISTANT' })
    expect(r.rect.size).toBe(0)
    expect(r.containers).toEqual([])
  })
})

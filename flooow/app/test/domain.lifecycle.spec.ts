import { describe, it, expect } from 'vitest'
import {
  FEATURE_STATUSES,
  STATUS_LABELS,
  UNLOCK_THRESHOLD,
  computeUnlocks,
  crossesToDev,
  findDependsCycles,
  isDone,
  phaseOf,
  satisfiesDependency,
  wouldCreateDependsCycle,
} from '@flooow/core/domain/lifecycle'
import type { DependencyEdge, FeatureStatus } from '@flooow/core/domain/lifecycle'

/** Map id → statut, en une ligne. */
function statuses(entries: Record<string, FeatureStatus>): Map<string, FeatureStatus> {
  return new Map(Object.entries(entries))
}

/** Arêtes `a dependsOn b` depuis des paires compactes. */
function deps(...pairs: [string, string][]): DependencyEdge[] {
  return pairs.map(([source, target]) => ({ source, target }))
}

describe('lifecycle — phase dérivée du statut', () => {
  it('famille cadrage', () => {
    for (const s of ['idee', 'a-qualifier', 'cadree', 'estimee', 'retenue'] as const) {
      expect(phaseOf(s)).toBe('cadrage')
    }
  })

  it('les sorties de route restent en famille cadrage (une écartée n’a jamais de suivi de dév)', () => {
    expect(phaseOf('reportee')).toBe('cadrage')
    expect(phaseOf('ecartee')).toBe('cadrage')
  })

  it('famille dév', () => {
    for (const s of ['a-developper', 'en-developpement', 'en-recette', 'validee', 'en-production'] as const) {
      expect(phaseOf(s)).toBe('dev')
    }
  })

  it('chaque statut a un libellé', () => {
    for (const s of FEATURE_STATUSES) expect(STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('lifecycle — gate de bascule (franchissement cadrage → dev)', () => {
  it('détecte le franchissement, y compris en saut brutal', () => {
    expect(crossesToDev('retenue', 'a-developper')).toBe(true)
    expect(crossesToDev('idee', 'en-recette')).toBe(true) // saut d'étapes : natif
  })

  it('ne se déclenche ni à l’intérieur d’une famille, ni au retour arrière', () => {
    expect(crossesToDev('idee', 'retenue')).toBe(false)
    expect(crossesToDev('en-developpement', 'en-recette')).toBe(false)
    expect(crossesToDev('en-developpement', 'cadree')).toBe(false) // un cadrage rouvre sans friction
  })
})

describe('lifecycle — seuil de déblocage', () => {
  it('une dépendance satisfait dès UNLOCK_THRESHOLD atteint', () => {
    expect(UNLOCK_THRESHOLD).toBe('en-developpement')
    expect(satisfiesDependency('en-developpement')).toBe(true)
    expect(satisfiesDependency('validee')).toBe(true)
    expect(satisfiesDependency('a-developper')).toBe(false)
    expect(satisfiesDependency('retenue')).toBe(false) // encore en cadrage : bloque aussi, et c'est voulu
  })

  it('une sortie de route ne satisfait JAMAIS', () => {
    expect(satisfiesDependency('reportee')).toBe(false)
    expect(satisfiesDependency('ecartee')).toBe(false)
  })

  it('isDone : validée ou en production', () => {
    expect(isDone('validee')).toBe(true)
    expect(isDone('en-production')).toBe(true)
    expect(isDone('en-recette')).toBe(false)
    expect(isDone('ecartee')).toBe(false)
  })
})

describe('lifecycle — arbre de déblocage', () => {
  it('sans dépendance : débloquée ferme ; frontière si a-developper', () => {
    const u = computeUnlocks(statuses({ a: 'a-developper', b: 'en-recette' }), [])
    expect(u.get('a')).toMatchObject({ kind: 'unlocked', firm: true, frontier: true })
    expect(u.get('b')).toMatchObject({ kind: 'unlocked', firm: true, frontier: false })
  })

  it('terminée : validee / en-production, même avec une dépendance en retard', () => {
    const u = computeUnlocks(statuses({ a: 'validee', b: 'idee' }), deps(['a', 'b']))
    expect(u.get('a')?.kind).toBe('done')
  })

  it('bloquée par une dépendance sous le seuil, avec la liste des bloqueuses', () => {
    const u = computeUnlocks(
      statuses({ a: 'a-developper', b: 'retenue', c: 'en-developpement' }),
      deps(['a', 'b'], ['a', 'c']),
    )
    expect(u.get('a')).toMatchObject({ kind: 'blocked', frontier: false, blockedBy: ['b'] })
  })

  it('débloquée souple (dep juste en cours) vs ferme (deps toutes terminées)', () => {
    const souple = computeUnlocks(
      statuses({ a: 'a-developper', b: 'en-developpement' }),
      deps(['a', 'b']),
    )
    expect(souple.get('a')).toMatchObject({ kind: 'unlocked', firm: false, frontier: true })

    const ferme = computeUnlocks(statuses({ a: 'a-developper', b: 'validee' }), deps(['a', 'b']))
    expect(ferme.get('a')).toMatchObject({ kind: 'unlocked', firm: true })
  })

  it('dépendance sortie de route : signal ⚠ distinct du cadenas', () => {
    const u = computeUnlocks(statuses({ a: 'a-developper', b: 'ecartee' }), deps(['a', 'b']))
    expect(u.get('a')).toMatchObject({ kind: 'blocked', blockedBy: [], abandonedDeps: ['b'] })
  })

  it('ignore les arêtes vers des ids inconnus (nœud non-fonctionnalité)', () => {
    const u = computeUnlocks(statuses({ a: 'a-developper' }), deps(['a', 'fantome']))
    expect(u.get('a')?.kind).toBe('unlocked')
  })
})

describe('lifecycle — cycles de dépendances', () => {
  it('graphe sain (diamant) : aucun cycle', () => {
    expect(findDependsCycles(deps(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']))).toEqual([])
  })

  it('détecte un cycle à deux et rend le chemin', () => {
    const cycles = findDependsCycles(deps(['a', 'b'], ['b', 'a']))
    expect(cycles).toHaveLength(1)
    expect(cycles[0]).toHaveLength(2)
    expect(new Set(cycles[0])).toEqual(new Set(['a', 'b']))
  })

  it('détecte un cycle long au milieu d’un graphe sain', () => {
    const cycles = findDependsCycles(deps(['x', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'a']))
    expect(cycles).toHaveLength(1)
    expect(new Set(cycles[0])).toEqual(new Set(['a', 'b', 'c']))
  })

  it('wouldCreateDependsCycle : refuse l’arête qui fermerait un cycle (direct, transitif, boucle sur soi)', () => {
    const existing = deps(['b', 'c'], ['c', 'd'])
    expect(wouldCreateDependsCycle(existing, 'd', 'b')).toBe(true) // d → b fermerait b → c → d → b
    expect(wouldCreateDependsCycle(existing, 'a', 'a')).toBe(true)
    expect(wouldCreateDependsCycle(existing, 'a', 'd')).toBe(false) // simple approfondissement
    expect(wouldCreateDependsCycle(existing, 'c', 'b')).toBe(true) // cycle direct b ↔ c
  })
})

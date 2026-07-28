// Couche fonctionnelle (module + fonctionnalité, decisions.md §15) : modèle, migration v2→v3,
// invariants, store CRUD, filtrage de couche.
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { parseProjectDoc, safeParseProjectDoc } from '@flooow/core/model/schema'
import { migrate } from '@flooow/core/model/migrations'
import { checkInvariants } from '@flooow/core/domain/invariants'
import type { ViolationCode } from '@flooow/core/domain/invariants'
import {
  createEmptyProject,
  createModule,
  createFeature,
  createPage,
  createEdge,
} from '@flooow/core/model/factory'
import {
  isModule,
  isFeature,
  layerOf,
  CURRENT_FORMAT_VERSION,
  type FlooowEdge,
  type FlooowNode,
  type ProjectDoc,
} from '@flooow/core/model/types'

function doc(nodes: FlooowNode[], edges: FlooowEdge[] = []): ProjectDoc {
  return { ...createEmptyProject(), nodes, edges }
}
function codes(d: ProjectDoc): ViolationCode[] {
  return checkInvariants(d).map((v) => v.code)
}

describe('fabriques — module & fonctionnalité', () => {
  it('createModule : frame kind=module, racine, attrs par défaut', () => {
    const m = createModule({ name: 'Devis' })
    expect(m.type).toBe('frame')
    expect(isModule(m)).toBe(true)
    expect(m.parentId).toBeNull()
    expect(m.attrs).toEqual({ name: 'Devis', description: '', notes: '' })
  })

  it('createFeature : type=feature, attrs par défaut complets', () => {
    const f = createFeature({ name: 'Formulaire devis', code: 'DEV-04', parentId: 'mod-1' })
    expect(f.type).toBe('feature')
    expect(isFeature(f)).toBe(true)
    expect(f.parentId).toBe('mod-1')
    expect(f.attrs).toMatchObject({
      code: 'DEV-04',
      name: 'Formulaire devis',
      fieldValues: {},
      estimate: '',
      content: { type: 'doc' },
    })
  })

  it('layerOf : modules/fonctionnalités = functional, pages = structural', () => {
    expect(layerOf(createModule())).toBe('functional')
    expect(layerOf(createFeature())).toBe('functional')
    expect(layerOf(createPage())).toBe('structural')
  })
})

describe('schéma zod v3 — module & fonctionnalité', () => {
  it('valide un document avec module + fonctionnalité', () => {
    const m = createModule({ id: 'mod-1', name: 'Devis' })
    const f = createFeature({ id: 'feat-1', parentId: 'mod-1', name: 'F', code: 'DEV-01' })
    expect(() => parseProjectDoc(doc([m, f]))).not.toThrow()
  })

  it('rejette une clé inconnue dans les attrs de fonctionnalité (strict)', () => {
    const bad = doc([createFeature({ id: 'f' })]) as unknown as {
      nodes: { attrs: Record<string, unknown> }[]
    }
    bad.nodes[0]!.attrs.rogue = true
    expect(safeParseProjectDoc(bad).success).toBe(false)
  })

  it('valide une arête realizedBy', () => {
    const d = doc(
      [createFeature({ id: 'f' }), createPage({ id: 'p' })],
      [createEdge({ id: 'e', type: 'realizedBy', source: 'f', target: 'p' })],
    )
    expect(safeParseProjectDoc(d).success).toBe(true)
  })
})

describe('migration v2 → v3', () => {
  it('bumpe la version sans toucher au reste', () => {
    const v2 = {
      meta: {
        name: 'Legacy v2',
        formatVersion: 2,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        pricing: { riskCoeff: 1.25, dailyRate: null },
        homePageId: null,
      },
      site: { attrs: { context: '', constraints: [], notes: '' } },
      services: [],
      nodes: [],
      edges: [],
    }
    const migrated = migrate(v2) as ProjectDoc
    expect(migrated.meta.formatVersion).toBe(CURRENT_FORMAT_VERSION)
    expect(() => parseProjectDoc(migrated)).not.toThrow()
  })
})

describe('invariants — couche fonctionnelle', () => {
  it('module avec parent → MODULE_PARENT', () => {
    const m = createModule({ id: 'm' })
    m.parentId = 'x'
    expect(codes(doc([m]))).toContain('MODULE_PARENT')
  })

  it('fonctionnalité rattachée à autre chose qu un module → FEATURE_PARENT', () => {
    const p = createPage({ id: 'p' })
    const f = createFeature({ id: 'f', parentId: 'p' })
    expect(codes(doc([p, f]))).toContain('FEATURE_PARENT')
  })

  it('fonctionnalité dans un module → aucune violation', () => {
    const m = createModule({ id: 'm' })
    const f = createFeature({ id: 'f', parentId: 'm' })
    expect(checkInvariants(doc([m, f]))).toEqual([])
  })

  it('realizedBy dont la cible n est pas page/bloc → REALIZES_TARGET', () => {
    const f1 = createFeature({ id: 'f1' })
    const f2 = createFeature({ id: 'f2' })
    const d = doc([f1, f2], [createEdge({ id: 'e', type: 'realizedBy', source: 'f1', target: 'f2' })])
    expect(codes(d)).toContain('REALIZES_TARGET')
  })

  it('realizedBy fonctionnalité → page : valide', () => {
    const f = createFeature({ id: 'f' })
    const p = createPage({ id: 'p' })
    const d = doc([f, p], [createEdge({ id: 'e', type: 'realizedBy', source: 'f', target: 'p' })])
    expect(checkInvariants(d)).toEqual([])
  })
})

describe('store — CRUD couche fonctionnelle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addModule / addFeature + getters', () => {
    const p = useProjectStore()
    const m = p.addModule({ name: 'Devis' })
    const f = p.addFeature(m, { name: 'F', code: 'DEV-01' })
    expect(p.modules).toHaveLength(1)
    expect(p.features).toHaveLength(1)
    expect(p.nodeById(f)?.parentId).toBe(m)
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
  })

  it('supprimer un module supprime ses fonctionnalités (cascade)', () => {
    const p = useProjectStore()
    const m = p.addModule()
    p.addFeature(m)
    p.addFeature(m)
    expect(p.features).toHaveLength(2)
    p.removeNode(m)
    expect(p.modules).toHaveLength(0)
    expect(p.features).toHaveLength(0)
  })

  it('relie deux fonctionnalités par dependsOn sans violer les invariants', () => {
    const p = useProjectStore()
    const m = p.addModule()
    const a = p.addFeature(m)
    const b = p.addFeature(m)
    p.addEdge({ type: 'dependsOn', source: a, target: b })
    expect(p.violations).toEqual([])
  })

  it('arrangeFunctional pose les fonctionnalités en ARBRE : racines en haut, dépendantes dessous', () => {
    const p = useProjectStore()
    const m = p.addModule()
    // a racine à contenu long (carte haute) ; b et c dépendent de a ; d dépend de b.
    const long = 'x'.repeat(1200) // ~29 lignes affichées → carte bien plus haute que le pas natif
    const a = p.addFeature(m, { name: 'A', position: { x: 0, y: 10 } })
    const b = p.addFeature(m, { name: 'B', position: { x: 0, y: 20 } })
    const c = p.addFeature(m, { name: 'C', position: { x: 40, y: 0 } })
    const d = p.addFeature(m, { name: 'D', position: { x: 0, y: 30 } })
    p.addEdge({ type: 'dependsOn', source: b, target: a })
    p.addEdge({ type: 'dependsOn', source: c, target: a })
    p.addEdge({ type: 'dependsOn', source: d, target: b })
    p.updateAttrs(a, {
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] },
    })
    p.arrangeFunctional()
    const pos = (id: string) => p.nodeById(id)!.position
    // Rangées : a (racine) en haut, b et c au même niveau dessous, d encore dessous.
    expect(pos(a).y).toBe(0)
    expect(pos(b).y).toBe(pos(c).y)
    expect(pos(b).y).toBeGreaterThan(pos(a).y)
    expect(pos(d).y).toBeGreaterThan(pos(b).y)
    // La rangée de la carte longue (a) réserve plus que le pas natif avant la suivante.
    expect(pos(b).y).toBeGreaterThan(300)
    // Dans la rangée 1, l'ordre horizontal suit les clés x stockées (b: x0 < c: x40).
    expect(pos(b).x).toBeLessThan(pos(c).x)
  })

  it('arrangeFunctional : une dépendance INTER-modules descend la carte sous les racines de son module', () => {
    const p = useProjectStore()
    const m1 = p.addModule({ position: { x: 0, y: 0 } })
    const m2 = p.addModule({ position: { x: 500, y: 0 } })
    const a1 = p.addFeature(m1, { name: 'A1' })
    const b1 = p.addFeature(m2, { name: 'B1' })
    const b2 = p.addFeature(m2, { name: 'B2' })
    // b2 dépend d'une fonctionnalité d'un AUTRE module : elle n'est pas « sans dépendance ».
    p.addEdge({ type: 'dependsOn', source: b2, target: a1 })
    p.arrangeFunctional()
    const pos = (id: string) => p.nodeById(id)!.position
    expect(pos(b1).y).toBe(0)
    expect(pos(b2).y).toBeGreaterThan(pos(b1).y)
    // Le module de la dépendance, lui, garde sa racine en haut.
    expect(pos(a1).y).toBe(0)
  })

  it('arrangeFunctional : les modules ne se chevauchent jamais, même à clés superposées', () => {
    const p = useProjectStore()
    // Trois modules volontairement créés au même endroit.
    const m1 = p.addModule({ position: { x: 0, y: 0 } })
    const m2 = p.addModule({ position: { x: 0, y: 0 } })
    const m3 = p.addModule({ position: { x: 0, y: 0 } })
    for (const m of [m1, m2, m3]) p.addFeature(m)
    p.arrangeFunctional()
    const xs = [m1, m2, m3].map((id) => p.nodeById(id)!.position.x).sort((a, b) => a - b)
    const ys = [m1, m2, m3].map((id) => p.nodeById(id)!.position.y)
    // Une seule rangée (y identiques), espacement d'au moins la largeur d'un module + écart.
    expect(new Set(ys).size).toBe(1)
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(300 + 40)
    expect(xs[2]! - xs[1]!).toBeGreaterThanOrEqual(300 + 40)
  })
})

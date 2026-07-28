// Fixture « cadrage locasyst » (LocaReception, format v4 complet : deux couches + services).
// Schéma, invariants, intégrité des liens et couverture realizedBy.
import { describe, it, expect } from 'vitest'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { migrate } from '@flooow/core/model/migrations'
import { checkInvariants } from '@flooow/core/domain/invariants'
import locasyst from '../fixtures/locasyst-project.flooow.json'

describe('fixture — cadrage locasyst (LocaReception)', () => {
  const doc = parseProjectDoc(migrate(locasyst))

  it('passe le schéma zod après migration', () => {
    expect(() => parseProjectDoc(migrate(locasyst))).not.toThrow()
  })

  it('ne viole aucun invariant référentiel', () => {
    expect(checkInvariants(doc)).toEqual([])
  })

  it('contient 12 modules et des fonctionnalités rattachées', () => {
    const modules = doc.nodes.filter((n) => n.type === 'frame' && n.kind === 'module')
    const features = doc.nodes.filter((n) => n.type === 'feature')
    expect(modules).toHaveLength(12)
    expect(features.length).toBeGreaterThan(60)
    // chaque fonctionnalité est rattachée à un module existant
    const moduleIds = new Set(modules.map((m) => m.id))
    for (const f of features) expect(moduleIds.has(f.parentId as string)).toBe(true)
  })

  it('toutes les arêtes dependsOn relient deux fonctionnalités existantes', () => {
    const featureIds = new Set(doc.nodes.filter((n) => n.type === 'feature').map((n) => n.id))
    const deps = doc.edges.filter((e) => e.type === 'dependsOn')
    expect(deps.length).toBeGreaterThan(0)
    for (const e of deps) {
      expect(featureIds.has(e.source)).toBe(true)
      expect(featureIds.has(e.target)).toBe(true)
    }
  })

  it('couche structurelle : pages, blocs et navigation depuis la page d’accueil', () => {
    const pages = doc.nodes.filter((n) => n.type === 'frame' && n.kind === 'page')
    const blocks = doc.nodes.filter((n) => n.type === 'frame' && n.kind === 'block')
    expect(pages.length).toBeGreaterThan(20)
    expect(blocks.length).toBeGreaterThan(50)
    expect(doc.meta.homePageId).not.toBeNull()
    expect(pages.some((p) => p.id === doc.meta.homePageId)).toBe(true)
  })

  it('chaque fonctionnalité est réalisée par au moins une page ou un bloc', () => {
    const realized = new Set(
      doc.edges.filter((e) => e.type === 'realizedBy').map((e) => e.source),
    )
    const orphans = doc.nodes.filter((n) => n.type === 'feature' && !realized.has(n.id))
    expect(orphans.map((n) => (n.attrs as { code: string }).code)).toEqual([])
  })

  it('les connexions API inline (ex-notes, v13) référencent des services du registre', () => {
    expect(doc.services.length).toBeGreaterThan(3)
    const svcIds = new Set(doc.services.map((s) => s.id))
    // Plus aucune note ne survit à la migration : les connexions vivent inline dans les blocs.
    expect(doc.nodes.some((n) => n.type === 'note')).toBe(false)
    const refs = doc.nodes
      .filter((n): n is Extract<typeof n, { kind: 'block' }> => n.type === 'frame' && n.kind === 'block')
      .flatMap((b) => b.attrs.apiRefs)
    expect(refs.length).toBeGreaterThan(10)
    for (const ref of refs) {
      expect(svcIds.has(ref.serviceId)).toBe(true)
    }
  })

  it('les fonctionnalités d’un module ne se chevauchent pas verticalement', () => {
    // Empilement généré : l’écart entre deux cartes successives d’un même module doit dépasser
    // le plancher minimal d’une carte (68px) — garde-fou contre une régression du générateur.
    const byModule = new Map<string, number[]>()
    for (const n of doc.nodes) {
      if (n.type !== 'feature' || !n.parentId) continue
      const ys = byModule.get(n.parentId) ?? []
      ys.push(n.position.y)
      byModule.set(n.parentId, ys)
    }
    for (const ys of byModule.values()) {
      ys.sort((a, b) => a - b)
      for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(68)
    }
  })
})

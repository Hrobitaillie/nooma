import { describe, it, expect } from 'vitest'
import { deriveSpecs } from '@flooow/core/domain/derive/specs'
import {
  createEmptyProject,
  createPage,
  createBlock,
  createBehaviorNote,
  createApiNote,
  createService,
  createEdge,
  createFeature,
} from '@flooow/core/model/factory'
import type { FlooowEdge, FlooowNode, ProjectDoc, Service } from '@flooow/core/model/types'

function doc(
  nodes: FlooowNode[],
  edges: FlooowEdge[] = [],
  homePageId: string | null = null,
  services: Service[] = [],
): ProjectDoc {
  const base = createEmptyProject()
  return {
    ...base,
    meta: { ...base.meta, homePageId },
    site: { attrs: { context: 'contexte site', constraints: ['SSO'], notes: '' } },
    services,
    nodes,
    edges,
  }
}

// Deux pages (dash plus bas), un bloc dans home, notes variées, un service.
const home = createPage({ id: 'home', position: { x: 0, y: 0 }, attrs: { slug: '', description: 'accueil' } })
const dash = createPage({
  id: 'dash',
  position: { x: 0, y: 400 },
  lot: 2,
  attrs: { slug: 'd', description: 'tdb', constraints: ['admin'] },
})
const block = createBlock({ id: 'blk', parentId: 'home', position: { x: 0, y: 0 }, blockType: 'grid' })
const bFront = createBehaviorNote({ id: 'bf', attachedTo: 'blk', position: { x: 0, y: 0 }, attrs: { facet: 'front' } })
const bBack = createBehaviorNote({ id: 'bb', attachedTo: 'blk', position: { x: 0, y: 20 }, attrs: { facet: 'back' } })
const bPage = createBehaviorNote({ id: 'bp', attachedTo: 'home', lot: 3, attrs: { facet: 'front' } })
const apiOnBlock = createApiNote({
  id: 'api1',
  attachedTo: 'blk',
  serviceId: 'svc',
  method: 'POST',
  path: '/pay',
})
const svc = createService({ id: 'svc', name: 'Paiement', endpoints: [{ method: 'POST', path: '/pay', notes: '' }] })

const full = doc([home, dash, block, bFront, bBack, bPage, apiOnBlock], [], 'home', [svc])

describe('deriveSpecs — structure', () => {
  it('transversal reprend contexte, contraintes et registre de services', () => {
    const s = deriveSpecs(full)
    expect(s.transversal.context).toBe('contexte site')
    expect(s.transversal.constraints).toEqual(['SSO'])
    expect(s.transversal.services.map((x) => x.id)).toEqual(['svc'])
  })

  it('pages en ordre spatial (haut → bas)', () => {
    const s = deriveSpecs(full)
    expect(s.pages.map((p) => p.page.id)).toEqual(['home', 'dash'])
    expect(s.transversal.toc.map((t) => t.id)).toEqual(['home', 'dash'])
  })

  it('blocs rattachés à leur page, notes comportement scindées bloc / page', () => {
    const s = deriveSpecs(full)
    const homePage = s.pages.find((p) => p.page.id === 'home')!
    expect(homePage.blocks.map((x) => x.block.id)).toEqual(['blk'])
    expect(homePage.blocks[0]!.behaviors.map((b) => b.id).sort()).toEqual(['bb', 'bf'])
    expect(homePage.blocks[0]!.blockType).toBe('grid')
    expect(homePage.behaviors.map((b) => b.id)).toEqual(['bp'])
  })

  it('notes API résolues avec nom de service, méthode et chemin', () => {
    const s = deriveSpecs(full)
    const blk = s.pages[0]!.blocks[0]!
    expect(blk.apis).toEqual([
      {
        nodeId: 'api1',
        fromNote: true,
        serviceId: 'svc',
        serviceName: 'Paiement',
        method: 'POST',
        path: '/pay',
      },
    ])
  })

  it('contraintes propres de la page remontées', () => {
    const s = deriveSpecs(full)
    expect(s.pages.find((p) => p.page.id === 'dash')!.constraints).toEqual(['admin'])
  })
})

describe('deriveSpecs — warnings', () => {
  it('signale nœuds incomplets et pages orphelines', () => {
    const s = deriveSpecs(full)
    expect(s.warnings.orphans).toContain('dash') // aucune navigatesTo → orpheline
    expect(s.warnings.incomplete).toContain('bf') // note sans trigger → incomplète
  })

  it('navigatesTo relie la home au dash → plus d’orpheline', () => {
    const nav = createEdge({ id: 'nav', type: 'navigatesTo', source: 'home', target: 'dash' })
    const s = deriveSpecs(doc([home, dash], [nav], 'home'))
    expect(s.warnings.orphans).toEqual([])
  })
})

describe('deriveSpecs — fonctionnalités (pont realizedBy)', () => {
  const feat = createFeature({ id: 'f', code: 'HOME-01', name: 'Accueil dynamique' })
  const featBlk = createFeature({ id: 'fb', code: 'GRID-01', name: 'Grille produits' })
  const realizesPage = createEdge({ type: 'realizedBy', source: 'f', target: 'home' })
  const realizesBlock = createEdge({ type: 'realizedBy', source: 'fb', target: 'blk' })

  it('rattache les fonctionnalités réalisées à la page et au bloc', () => {
    const s = deriveSpecs(
      doc([home, dash, block, feat, featBlk], [realizesPage, realizesBlock], 'home'),
    )
    const homePage = s.pages.find((p) => p.page.id === 'home')!
    expect(homePage.features).toEqual([{ id: 'f', code: 'HOME-01', name: 'Accueil dynamique' }])
    expect(homePage.blocks[0]!.features).toEqual([
      { id: 'fb', code: 'GRID-01', name: 'Grille produits' },
    ])
  })

  it('couverture : signale fonctionnalités orphelines et pages sans fonctionnalité', () => {
    const orphan = createFeature({ id: 'orph', code: 'X-01', name: 'Orpheline' })
    const s = deriveSpecs(
      doc([home, dash, block, feat, orphan], [realizesPage], 'home'),
    )
    expect(s.warnings.orphanFeatures).toContain('orph')
    expect(s.warnings.orphanFeatures).not.toContain('f')
    expect(s.warnings.uncoveredPages).toEqual(['dash']) // home couverte, dash non
  })
})

describe('deriveSpecs — filtre', () => {
  it('filtre facette : ne garde que les notes front (structure conservée)', () => {
    const s = deriveSpecs(full, { facet: 'front' })
    const blk = s.pages[0]!.blocks[0]!
    expect(blk.behaviors.map((b) => b.id)).toEqual(['bf']) // bb (back) exclu
    expect(s.pages.map((p) => p.page.id)).toEqual(['home', 'dash'])
  })

  it('filtre lot : ne garde que les éléments du lot demandé', () => {
    const s = deriveSpecs(full, { lot: 3 })
    expect(s.pages.find((p) => p.page.id === 'home')!.behaviors.map((b) => b.id)).toEqual(['bp'])
    expect(s.pages[0]!.blocks[0]!.behaviors).toEqual([]) // lot 1 hérité, exclu
  })
})

describe('deriveSpecs — vide', () => {
  it('document vierge : pas de page, transversal vide', () => {
    const s = deriveSpecs(createEmptyProject())
    expect(s.pages).toEqual([])
    expect(s.transversal.services).toEqual([])
    expect(s.warnings.incomplete).toEqual([])
  })
})

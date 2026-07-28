// Couche de lecture agent (pivot agentique) : résolution de poignées + fiches markdown compactes.
// Ce qu'on protège : les fiches montrent les INTERCONNEXIONS (ids courts actionnables) sans jamais
// embarquer le contenu riche par défaut — c'est le contrat « budget de tokens » du plan §3.2.
import { describe, it, expect } from 'vitest'
import { entityCard, projectSummary } from '@flooow/core/agent/cards'
import { findEntities, resolveRef } from '@flooow/core/agent/refs'
import {
  createApiNote,
  createBehaviorNote,
  createBlock,
  createEdge,
  createEmptyProject,
  createFeature,
  createModule,
  createPage,
  createService,
} from '@flooow/core/model/factory'
import { mergeFeatureFields, type RichDoc } from '@flooow/core/model/richContent'
import type { ProjectDoc } from '@flooow/core/model/types'

const OPT_SITE = { id: 'opt-site', fieldId: 'perimeter', name: 'Site' }

function para(text: string): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

// Deux pages reliées (home → cart), une page orpheline, un module avec deux fonctionnalités
// (DEV-04 réalisée par la page panier, DEV-06 orpheline), un service consommé, des notes.
function fixture(): ProjectDoc {
  const base = createEmptyProject('Démo agent')
  const home = createPage({ id: 'page-home', name: 'Accueil', attrs: { name: 'Accueil', slug: '', description: 'Vitrine', constraints: [], logic: '', notes: '' } })
  const cart = createPage({ id: 'page-cart', name: 'Panier', position: { x: 0, y: 300 }, attrs: { name: 'Panier', slug: 'panier', description: '', constraints: ['RGPD'], logic: '', notes: '' } })
  const lost = createPage({ id: 'page-lost', name: 'Égarée', position: { x: 0, y: 600 } })
  const block = createBlock({ id: 'blk-form', parentId: 'page-cart', name: 'Formulaire', blockType: 'grid', attrs: { name: 'Formulaire', blockType: 'grid', content: para('Champ email obligatoire'), apiRefs: [] } })
  const mod = createModule({ id: 'mod-devis', name: 'Demande de devis' })
  const dev04 = createFeature({
    id: 'feat-dev04', parentId: 'mod-devis', code: 'DEV-04', name: 'Formulaire de devis', lot: 1,
    attrs: { code: 'DEV-04', name: 'Formulaire de devis', content: mergeFeatureFields({ description: 'saisir une demande' }), fieldValues: { perimeter: OPT_SITE.id }, estimate: '3j' },
  })
  const dev06 = createFeature({
    id: 'feat-dev06', parentId: 'mod-devis', code: 'DEV-06', name: 'Email de confirmation', position: { x: 0, y: 236 },
  })
  const svc = createService({ id: 'svc-loca', name: 'Locasuite', risk: 'high', endpoints: [{ method: 'POST', path: '/location', notes: '' }] })
  const apiNote = createApiNote({ id: 'note-api1', attachedTo: 'page-cart', serviceId: 'svc-loca', method: 'POST', path: '/location' })
  const behavior = createBehaviorNote({ id: 'note-beh1', attachedTo: 'blk-form', name: 'Validation email', attrs: { name: 'Validation email', description: '', facet: 'front', trigger: '', rules: '', hours: 4, notes: '' } })
  return {
    ...base,
    meta: { ...base.meta, homePageId: 'page-home' },
    featureOptions: [OPT_SITE],
    services: [svc],
    nodes: [home, cart, lost, block, mod, dev04, dev06, apiNote, behavior],
    edges: [
      createEdge({ type: 'navigatesTo', source: 'page-home', target: 'page-cart' }),
      createEdge({ type: 'dependsOn', source: 'feat-dev06', target: 'feat-dev04' }),
      createEdge({ type: 'realizedBy', source: 'feat-dev04', target: 'page-cart' }),
    ],
  }
}

const doc = fixture()

describe('resolveRef — poignées courtes', () => {
  it('résout un id complet, un préfixe unique et un code de fonctionnalité (insensible à la casse)', () => {
    expect(resolveRef(doc, 'page-cart')).toMatchObject({ status: 'found', ref: { kind: 'page', id: 'page-cart' } })
    expect(resolveRef(doc, 'page-c')).toMatchObject({ status: 'found', ref: { id: 'page-cart' } })
    expect(resolveRef(doc, 'dev-04')).toMatchObject({ status: 'found', ref: { id: 'feat-dev04' } })
  })

  it('signale une poignée ambiguë au lieu de choisir en silence', () => {
    const res = resolveRef(doc, 'feat-dev')
    expect(res.status).toBe('ambiguous')
    if (res.status === 'ambiguous') expect(res.matches.map((m) => m.id).sort()).toEqual(['feat-dev04', 'feat-dev06'])
  })

  it('refuse les préfixes trop courts et les poignées inconnues', () => {
    expect(resolveRef(doc, 'pa').status).toBe('notFound')
    expect(resolveRef(doc, 'inexistant-xyz').status).toBe('notFound')
  })
})

describe('findEntities — recherche par nom', () => {
  it('matche sans tenir compte de la casse ni des diacritiques, sur nom / code / route / titre', () => {
    expect(findEntities(doc, 'egaree').map((r) => r.id)).toEqual(['page-lost'])
    expect(findEntities(doc, '/panier').map((r) => r.id)).toEqual(['page-cart'])
    expect(findEntities(doc, 'DEV-0').map((r) => r.id).sort()).toEqual(['feat-dev04', 'feat-dev06'])
  })
})

describe('projectSummary — niveau N0', () => {
  const summary = projectSummary(doc)

  it('inventorie tout en une ligne par entité, avec les poignées', () => {
    expect(summary).toContain('3 pages · 1 blocs · 1 modules · 2 fonctionnalités')
    expect(summary).toContain('Accueil (page-hom) · / · accueil — 0 bloc')
    expect(summary).toContain('Panier (page-car) · /panier — 1 bloc · 1 note')
    expect(summary).toContain('- DEV-04 · Formulaire de devis (feat-dev) · lot 1 · 3j')
    expect(summary).toContain('Locasuite (svc-loca) · risque high · 1 endpoint')
  })

  it('signale les trous (attention)', () => {
    expect(summary).toContain('Points d’attention')
    expect(summary).toContain('⚠ non réalisée') // DEV-06
  })
})

describe('entityCard — niveau N1 (fiche sans contenu)', () => {
  it('fiche fonctionnalité : métadonnées + liens dans les deux sens + endpoints, contenu en taille seulement', () => {
    const card = entityCard(doc, 'DEV-04')
    expect(card).toContain('## Fonctionnalité DEV-04 — Formulaire de devis')
    expect(card).toContain('module : Demande de devis (mod-devi)')
    expect(card).toContain('estimation : 3j')
    expect(card).toContain('- débloque : DEV-06 Email de confirmation (feat-dev)')
    expect(card).toContain('- réalisée par : page Panier (page-car)')
    expect(card).toContain('- endpoints : POST /location (Locasuite)')
    expect(card).toContain('Contenu : 1 ligne')
    expect(card).not.toContain('saisir une demande')
  })

  it('fiche fonctionnalité orpheline : dépendance sortante + alerte', () => {
    const card = entityCard(doc, 'DEV-06')
    expect(card).toContain('- dépend de : DEV-04 Formulaire de devis (feat-dev)')
    expect(card).toContain('⚠ orpheline')
    expect(card).toContain('estimation : à estimer')
  })

  it('fiche page : blocs, notes, navigation entrante/sortante, couverture, alertes', () => {
    const card = entityCard(doc, 'page-cart')
    expect(card).toContain('route /panier')
    expect(card).toContain('Contraintes : RGPD')
    expect(card).toContain('- Formulaire (blk-form) · grid · contenu 1 ligne')
    expect(card).toContain('- [api] POST /location (note-api')
    expect(card).toContain('Navigation : vient de Accueil (page-hom) · mène à —')
    expect(card).toContain('Fonctionnalités couvertes : DEV-04 Formulaire de devis (feat-dev)')
  })

  it('fiche page orpheline et non couverte : les deux alertes', () => {
    const card = entityCard(doc, 'page-lost')
    expect(card).toContain('⚠ page non reliée à la navigation')
    expect(card).toContain('⚠ ne réalise aucune fonctionnalité')
  })

  it('fiche service : endpoints déclarés et consommateurs remontés', () => {
    const card = entityCard(doc, 'svc-loca')
    expect(card).toContain('risque high')
    expect(card).toContain('- POST /location ← Panier (page-car)')
  })

})

describe('entityCard — niveau N2 (avec contenu) et cas limites', () => {
  it('content:true déplie le markdown du contenu', () => {
    expect(entityCard(doc, 'DEV-04', { content: true })).toContain('saisir une demande')
    expect(entityCard(doc, 'blk-form', { content: true })).toContain('Champ email obligatoire')
  })

  it('content:true sur une page déplie le contenu de ses blocs', () => {
    const card = entityCard(doc, 'page-cart', { content: true })
    expect(card).toContain('### Contenu des blocs')
    expect(card).toContain('Champ email obligatoire')
  })

  it('poignée ambiguë ou inconnue : message actionnable, jamais d’exception', () => {
    expect(entityCard(doc, 'feat-dev')).toContain('ambiguë')
    expect(entityCard(doc, 'feat-dev')).toContain('[feature]')
    expect(entityCard(doc, 'zzz-inconnu')).toContain('Aucune entité')
  })
})

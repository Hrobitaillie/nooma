// Vocabulaire d'ops agent : le contrat protégé est l'ATOMICITÉ (un lot échoue en entier ou
// s'applique en entier, document d'origine intact), la résolution par poignées avec chaînage
// intra-lot (id fourni → référençable par l'op suivant), l'auto-placement (l'agent ne donne
// jamais de position) et la validation finale (zod + invariants) qui rejette tout état incohérent.
import { describe, it, expect } from 'vitest'
import { AgentOpError, applyOps, type AgentOp } from '@flooow/core/agent/ops'
import { createEmptyProject, createPage } from '@flooow/core/model/factory'
import { docToMarkdown } from '@flooow/core/model/richContent'
import { isBlock, isFeature, isPage, type ProjectDoc } from '@flooow/core/model/types'

function emptyDoc(): ProjectDoc {
  return createEmptyProject('Test ops')
}

describe('applyOps — créations chaînées et auto-placement', () => {
  const ops: AgentOp[] = [
    { op: 'create-page', id: 'p-accueil', name: 'Accueil', slug: '', description: 'Vitrine' },
    { op: 'create-page', id: 'p-devis', name: 'Demande de devis', slug: 'devis' },
    { op: 'create-block', id: 'b-form', page: 'p-devis', name: 'Formulaire', blockType: 'cta', content: 'Champs : **nom**, email.' },
    { op: 'create-module', id: 'm-devis', name: 'Devis' },
    { op: 'create-feature', id: 'f-dev01', module: 'm-devis', code: 'DEV-01', name: 'Demander un devis', estimate: '2j', content: 'Depuis le panier.' },
    { op: 'set-home', page: 'p-accueil' },
    { op: 'link', type: 'navigatesTo', source: 'p-accueil', target: 'p-devis' },
    { op: 'link', type: 'realizedBy', source: 'f-dev01', target: 'b-form' },
  ]
  const { doc, report } = applyOps(emptyDoc(), ops)

  it('tout est créé, chaque op suivant résout les ids posés par les précédents', () => {
    expect(doc.nodes).toHaveLength(5) // 2 pages + bloc + module + fonctionnalité
    expect(doc.edges).toHaveLength(2)
    expect(doc.meta.homePageId).toBe('p-accueil')
    expect(report).toHaveLength(8)
    expect(report[0]).toContain('+ page « Accueil »')
  })

  it('auto-placement : la 2e page complète la rangée (grille compacte), jamais superposée', () => {
    const [p1, p2] = doc.nodes.filter(isPage)
    expect(p2!.position.y).toBe(p1!.position.y)
    expect(p2!.position.x).toBeGreaterThanOrEqual(p1!.position.x + 300)
  })

  it('le contenu markdown est parsé en RichDoc (et re-sérialisable)', () => {
    const block = doc.nodes.find(isBlock)!
    expect(docToMarkdown(block.attrs.content)).toBe('Champs : **nom**, email.')
  })

  it('le document rendu passe zod + invariants (déjà validé par applyOps)', () => {
    const feature = doc.nodes.find(isFeature)!
    expect(feature.parentId).toBe('m-devis')
  })
})

describe('applyOps — atomicité', () => {
  it('un op fautif au milieu du lot annule TOUT (le document d’origine est intact)', () => {
    const input = emptyDoc()
    const ops: AgentOp[] = [
      { op: 'create-page', name: 'Page valide' },
      { op: 'create-block', page: 'poignée-inexistante', name: 'Bloc' },
    ]
    expect(() => applyOps(input, ops)).toThrow(AgentOpError)
    expect(() => applyOps(input, ops)).toThrow(/ops\[1\]/)
    expect(input.nodes).toHaveLength(0) // jamais mutée
  })

  it('la validation finale rejette un lot qui viole un invariant', () => {
    // realizedBy avec une PAGE en source : refusé à la pose du lien (sémantique).
    const withPage = { ...emptyDoc(), nodes: [createPage({ id: 'p1', name: 'P' }), createPage({ id: 'p2', name: 'Q' })] }
    expect(() =>
      applyOps(withPage, [{ op: 'link', type: 'realizedBy', source: 'p1', target: 'p2' }]),
    ).toThrow(/realizedBy/)
  })

  it('id fourni déjà pris → erreur claire', () => {
    const input = { ...emptyDoc(), nodes: [createPage({ id: 'p1', name: 'P' })] }
    expect(() => applyOps(input, [{ op: 'create-page', id: 'p1', name: 'Doublon' }])).toThrow(/déjà pris/)
  })
})

describe('applyOps — update, set-field, set-content', () => {
  const base = applyOps(emptyDoc(), [
    { op: 'create-page', id: 'p1', name: 'Tarifs', slug: 'tarifs' },
    { op: 'create-feature', id: 'f1', code: 'TAR-01', name: 'Grille tarifaire' },
  ]).doc

  it('update ne touche que les champs autorisés du bon type', () => {
    const { doc } = applyOps(base, [{ op: 'update', target: 'p1', set: { slug: 'prix', lot: 2 } }])
    const page = doc.nodes.find(isPage)!
    expect(page.attrs.slug).toBe('prix')
    expect(page.lot).toBe(2)
    expect(() => applyOps(base, [{ op: 'update', target: 'p1', set: { estimate: '1j' } }])).toThrow(/non modifiable/)
  })

  it('set-field résout le champ par libellé et CRÉE l’option manquante', () => {
    const { doc } = applyOps(base, [
      { op: 'set-field', feature: 'TAR-01', field: 'Fonctionnalité attribuée à', option: 'Backoffice' },
    ])
    const option = doc.featureOptions.find((o) => o.name === 'Backoffice')!
    expect(option.fieldId).toBe('perimeter')
    const feature = doc.nodes.find(isFeature)!
    expect(feature.attrs.fieldValues['perimeter']).toBe(option.id)
  })

  it('set-field réutilise une option existante (insensible casse/accents) au lieu de dupliquer', () => {
    const once = applyOps(base, [{ op: 'set-field', feature: 'f1', field: 'perimeter', option: 'Backoffice' }]).doc
    const twice = applyOps(once, [{ op: 'set-field', feature: 'f1', field: 'perimeter', option: 'BACKOFFICE' }]).doc
    expect(twice.featureOptions.filter((o) => o.fieldId === 'perimeter')).toHaveLength(1)
  })

  it('set-content remplace le contenu riche depuis du markdown', () => {
    const { doc } = applyOps(base, [{ op: 'set-content', target: 'f1', markdown: '## Quoi\n\nAfficher la grille.' }])
    expect(docToMarkdown(doc.nodes.find(isFeature)!.attrs.content)).toBe('## Quoi\n\nAfficher la grille.')
  })
})

describe('applyOps — connexions API du bloc (v8)', () => {
  const base = applyOps(emptyDoc(), [
    { op: 'create-page', id: 'p1', name: 'Devis' },
    { op: 'create-block', id: 'b1', page: 'p1', name: 'Formulaire' },
    { op: 'create-service', id: 's1', name: 'Locasuite' },
  ]).doc

  it('add-api-ref pose la connexion SUR le bloc (pas une note), idempotent', () => {
    const { doc, report } = applyOps(base, [
      { op: 'add-api-ref', block: 'b1', service: 's1', method: 'POST', path: '/location' },
      { op: 'add-api-ref', block: 'b1', service: 's1', method: 'POST', path: '/location' },
    ])
    const block = doc.nodes.find(isBlock)!
    // `id` est tiré au sort (v11) → comparaison partielle, et l'ordre doit désigner la connexion.
    expect(block.attrs.apiRefs).toEqual([
      { id: expect.any(String), serviceId: 's1', method: 'POST', path: '/location' },
    ])
    expect(block.attrs.order).toEqual([block.attrs.apiRefs[0]!.id])
    expect(doc.nodes.filter((n) => n.type === 'note')).toHaveLength(0)
    expect(report[1]).toContain('déjà')
  })

  it('remove-api-ref retire la connexion, erreur si absente', () => {
    const withRef = applyOps(base, [
      { op: 'add-api-ref', block: 'b1', service: 's1', method: 'POST', path: '/location' },
    ]).doc
    const { doc } = applyOps(withRef, [{ op: 'remove-api-ref', block: 'b1', method: 'POST', path: '/location' }])
    expect(doc.nodes.find(isBlock)!.attrs.apiRefs).toHaveLength(0)
    expect(() =>
      applyOps(base, [{ op: 'remove-api-ref', block: 'b1', method: 'GET', path: '/x' }]),
    ).toThrow(/aucune connexion/)
  })
})

describe('applyOps — suppressions en cascade', () => {
  const base = applyOps(emptyDoc(), [
    { op: 'create-page', id: 'p1', name: 'Panier' },
    { op: 'create-block', id: 'b1', page: 'p1', name: 'Liste' },
    { op: 'create-behavior', id: 'n1', target: 'b1', name: 'Persistance' },
    { op: 'create-page', id: 'p2', name: 'Devis' },
    { op: 'link', type: 'navigatesTo', source: 'p1', target: 'p2' },
    { op: 'create-module', id: 'm1', name: 'M' },
    { op: 'create-feature', id: 'f1', module: 'm1', name: 'F' },
  ]).doc

  it('supprimer une page emporte ses blocs, leurs commentaires ancrés et les arêtes touchées', () => {
    expect(base.comments.map((c) => c.id)).toEqual(['n1']) // le behavior est un commentaire (v13)
    const { doc } = applyOps(base, [{ op: 'delete', target: 'p1' }])
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['f1', 'm1', 'p2'])
    expect(doc.edges).toHaveLength(0)
    expect(doc.comments).toHaveLength(0) // ancré sur b1, condamné avec la page
  })

  it('supprimer un module qui contient des fonctionnalités est refusé', () => {
    expect(() => applyOps(base, [{ op: 'delete', target: 'm1' }])).toThrow(/contient des fonctionnalités/)
  })

  it('lien déjà présent = no-op signalé, unlink inexistant = erreur', () => {
    const { report } = applyOps(base, [{ op: 'link', type: 'navigatesTo', source: 'p1', target: 'p2' }])
    expect(report[0]).toContain('déjà présent')
    expect(() => applyOps(base, [{ op: 'unlink', type: 'dependsOn', source: 'f1', target: 'f1' }])).toThrow(/aucun lien/)
  })
})

describe('applyOps — commentaires (v13)', () => {
  const base = applyOps(emptyDoc(), [
    { op: 'create-page', id: 'p1', name: 'Accueil' },
    { op: 'create-block', id: 'b1', page: 'p1', name: 'Héro' },
    { op: 'create-page', id: 'p2', name: 'Vide' }, // page SANS bloc (repli api-note)
    { op: 'create-service', id: 'svc1', name: 'ERP' },
  ]).doc

  it('create-comment ancre un fil (auteur Claude par défaut), reply/resolve par poignée ≥ 4', () => {
    const { doc } = applyOps(base, [
      { op: 'create-comment', id: 'c-wording', target: 'b1', markdown: 'Reformuler le **titre**.', forClaude: true },
      { op: 'reply-comment', comment: 'c-wo', markdown: 'Fait : titre raccourci.' },
      { op: 'resolve-comment', comment: 'c-wo' },
    ])
    const c = doc.comments.find((x) => x.id === 'c-wording')!
    expect(c.anchor).toEqual({ nodeId: 'b1' })
    expect(c.author).toBe('Claude')
    expect(c.forClaude).toBe(true)
    expect(c.replies).toHaveLength(1)
    expect(c.resolved).toBe(true)
  })

  it('create-comment refuse une cible non page/bloc et un corps vide', () => {
    expect(() =>
      applyOps(base, [{ op: 'create-comment', target: 'svc1', markdown: 'x' }]),
    ).toThrow(AgentOpError)
    expect(() =>
      applyOps(base, [{ op: 'create-comment', target: 'b1', markdown: '   ' }]),
    ).toThrow(/markdown requis/)
  })

  it('poignée de commentaire trop courte ou ambiguë → erreur claire', () => {
    const two = applyOps(base, [
      { op: 'create-comment', id: 'com-aaaa', target: 'b1', markdown: 'a' },
      { op: 'create-comment', id: 'com-bbbb', target: 'b1', markdown: 'b' },
    ]).doc
    expect(() => applyOps(two, [{ op: 'resolve-comment', comment: 'co' }])).toThrow(/trop courte/)
    expect(() => applyOps(two, [{ op: 'resolve-comment', comment: 'com-' }])).toThrow(/ambiguë/)
  })

  it('create-behavior (compat) produit un commentaire tag « Comportement », heures fondues', () => {
    const { doc } = applyOps(base, [
      { op: 'create-behavior', id: 'n1', target: 'b1', name: 'Relance J+3', trigger: 'Devis inactif', hours: 4 },
    ])
    const c = doc.comments.find((x) => x.id === 'n1')!
    expect(c.tag).toEqual({ label: 'Comportement', color: '#f59e0b' })
    const md = docToMarkdown(c.body)
    expect(md).toContain('**Relance J+3**')
    expect(md).toContain('Devis inactif')
    expect(md).toContain('Estimation : 4 h')
  })

  it('create-api-note (compat) : cible bloc → connexion inline ; page sans bloc → commentaire API', () => {
    const { doc } = applyOps(base, [
      { op: 'create-api-note', target: 'b1', service: 'svc1', method: 'GET', path: '/orders', notes: 'listing' },
      { op: 'create-api-note', target: 'p2', service: 'svc1', method: 'POST', path: '/quotes' },
    ])
    const block = doc.nodes.find((n) => n.id === 'b1')!
    if (!isBlock(block)) throw new Error('bloc attendu')
    expect(block.attrs.apiRefs).toEqual([
      expect.objectContaining({ serviceId: 'svc1', method: 'GET', path: '/orders', notes: 'listing' }),
    ])
    const fallback = doc.comments.find((c) => c.tag?.label === 'API')!
    expect(fallback.anchor.nodeId).toBe('p2')
    expect(docToMarkdown(fallback.body)).toContain('POST /quotes — ERP')
  })
})

// v12 → v13 : les cartes de note flottantes deviennent des commentaires façon Google Doc
// (plan-refonte-notes-commentaires.md §Migration). Ce que chaque cas protège : RIEN ne se perd —
// une note comportement finit en commentaire recomposé, une note API finit en connexion inline du
// bloc (facet/notes repris) ou, à défaut de cible inline possible, en commentaire de repli.
// Et la migration reste DÉTERMINISTE : deux passages sur le même fichier donnent le même document.
import { describe, it, expect } from 'vitest'
import { migrate } from '@flooow/core/model/migrations'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { checkInvariants } from '@flooow/core/domain/invariants'
import { docToMarkdown } from '@flooow/core/model/richContent'
import { isBlock, type BlockNode } from '@flooow/core/model/types'
import locasyst from '../fixtures/locasyst-project.flooow.json'

interface RawNote {
  id: string
  kind: 'behavior' | 'api'
  attachedTo: string
  attrs: Record<string, unknown>
}

/** Document v12 minimal : une page, des blocs empilés, un service, des notes. */
function v12(notes: RawNote[], opts: { blocks?: number } = {}): unknown {
  const blockCount = opts.blocks ?? 2
  return {
    meta: {
      name: 'T',
      formatVersion: 12,
      createdAt: '2026-01-01',
      updatedAt: '2026-07-01',
      pricing: { riskCoeff: 1, dailyRate: null },
      homePageId: 'pg',
    },
    site: { attrs: { context: '', constraints: [], notes: '' } },
    services: [
      { id: 'svc', name: 'ERP', baseUrl: 'https://erp', auth: '', risk: 'low', endpoints: [], notes: '' },
    ],
    featureFields: [],
    featureOptions: [],
    nodes: [
      {
        id: 'pg',
        type: 'frame',
        kind: 'page',
        parentId: null,
        position: { x: 0, y: 0 },
        lot: null,
        attrs: { name: 'Page', slug: '', roles: [], description: '', constraints: [], logic: '', notes: '' },
      },
      ...Array.from({ length: blockCount }, (_, i) => ({
        id: `b${i}`,
        type: 'frame',
        kind: 'block',
        parentId: 'pg',
        position: { x: 0, y: i * 120 },
        lot: null,
        attrs: { name: `B${i}`, blockType: 'free', content: { type: 'doc', content: [] }, apiRefs: [], order: [] },
      })),
      ...notes.map((n) => ({
        id: n.id,
        type: 'note',
        kind: n.kind,
        parentId: null,
        attachedTo: n.attachedTo,
        position: { x: 500, y: 0 },
        lot: null,
        attrs: n.attrs,
      })),
    ],
    edges: [],
  }
}

const behaviorAttrs = {
  name: 'Recherche à facettes',
  description: 'Filtrage multi-critères.',
  facet: 'back',
  trigger: 'Saisie utilisateur',
  rules: 'Debounce 300 ms.',
  hours: 4,
  notes: 'À confirmer avec le client.',
}

const apiAttrs = {
  serviceId: 'svc',
  method: 'GET',
  path: '/orders',
  facet: 'back',
  notes: 'Listing par agence.',
}

function run(doc: unknown): ReturnType<typeof parseProjectDoc> {
  return parseProjectDoc(migrate(doc))
}

function blockOf(doc: ReturnType<typeof parseProjectDoc>, id: string): BlockNode {
  const n = doc.nodes.find((x) => x.id === id)
  if (!n || !isBlock(n)) throw new Error(`bloc attendu : ${id}`)
  return n
}

describe('migration v12 → v13 — notes comportement', () => {
  it('convertit en commentaire tag « Comportement », ancré à la même cible', () => {
    const doc = run(v12([{ id: 'n1', kind: 'behavior', attachedTo: 'b0', attrs: behaviorAttrs }]))
    expect(doc.nodes.some((n) => n.type === 'note')).toBe(false)
    expect(doc.comments).toHaveLength(1)
    const c = doc.comments[0]!
    expect(c.id).toBe('comment-n1') // dérivé, pas tiré au hasard
    expect(c.anchor).toEqual({ nodeId: 'b0' })
    expect(c.tag).toEqual({ label: 'Comportement', color: '#f59e0b' })
    expect(c.resolved).toBe(false)
    expect(c.replies).toEqual([])
    expect(c.author).toBe('') // identité inconnue
    expect(c.createdAt).toBe('2026-07-01') // meta.updatedAt : jamais « maintenant » (rejouable)
  })

  it('recompose nom + description + déclencheur + règles + heures + notes dans le corps', () => {
    const doc = run(v12([{ id: 'n1', kind: 'behavior', attachedTo: 'b0', attrs: behaviorAttrs }]))
    const md = docToMarkdown(doc.comments[0]!.body)
    expect(md).toBe(
      '**Recherche à facettes**\n\nFiltrage multi-critères.\n\n### Déclencheur\n\nSaisie utilisateur\n\n' +
        '### Règles\n\nDebounce 300 ms.\n\nEstimation : 4 h — Facette : back\n\n### Notes\n\nÀ confirmer avec le client.',
    )
  })

  it('omet proprement les champs vides (pas de sections fantômes)', () => {
    const doc = run(
      v12([
        {
          id: 'n1',
          kind: 'behavior',
          attachedTo: 'b0',
          attrs: { name: 'Simple', description: '', facet: null, trigger: '', rules: '', hours: null, notes: '' },
        },
      ]),
    )
    expect(docToMarkdown(doc.comments[0]!.body)).toBe('**Simple**')
  })
})

describe('migration v12 → v13 — notes API', () => {
  it('rattachée à un bloc → connexion inline, facet/notes repris, order complété', () => {
    const doc = run(v12([{ id: 'a1', kind: 'api', attachedTo: 'b1', attrs: apiAttrs }]))
    expect(doc.comments).toEqual([])
    expect(blockOf(doc, 'b1').attrs.apiRefs).toEqual([
      { id: 'a1', serviceId: 'svc', method: 'GET', path: '/orders', facet: 'back', notes: 'Listing par agence.' },
    ])
    expect(blockOf(doc, 'b1').attrs.order).toEqual(['a1'])
    expect(blockOf(doc, 'b0').attrs.apiRefs).toEqual([]) // pas de fuite vers les autres blocs
  })

  it('rattachée à une PAGE → premier bloc de la page (position.y la plus haute)', () => {
    const doc = run(v12([{ id: 'a1', kind: 'api', attachedTo: 'pg', attrs: apiAttrs }]))
    expect(doc.comments).toEqual([])
    expect(blockOf(doc, 'b0').attrs.apiRefs.map((r) => r.id)).toEqual(['a1'])
    expect(blockOf(doc, 'b1').attrs.apiRefs).toEqual([])
  })

  it('rattachée à une page SANS bloc → commentaire de repli tag « API », rien de perdu', () => {
    const doc = run(v12([{ id: 'a1', kind: 'api', attachedTo: 'pg', attrs: apiAttrs }], { blocks: 0 }))
    expect(doc.comments).toHaveLength(1)
    const c = doc.comments[0]!
    expect(c.id).toBe('comment-a1')
    expect(c.anchor).toEqual({ nodeId: 'pg' })
    expect(c.tag).toEqual({ label: 'API', color: '#0891b2' })
    const md = docToMarkdown(c.body)
    expect(md).toContain('GET /orders — ERP') // endpoint + nom du service résolu
    expect(md).toContain('Facette : back')
    expect(md).toContain('Listing par agence.')
  })

  it('service absent du registre → repli en commentaire (une connexion inline muette serait pire)', () => {
    const doc = run(
      v12([{ id: 'a1', kind: 'api', attachedTo: 'b0', attrs: { ...apiAttrs, serviceId: 'fantome' } }]),
    )
    expect(blockOf(doc, 'b0').attrs.apiRefs).toEqual([])
    expect(doc.comments).toHaveLength(1)
    expect(doc.comments[0]!.tag?.label).toBe('API')
  })

  it("n'écrit facet/notes sur la connexion que s'ils portent quelque chose (clés optionnelles)", () => {
    const doc = run(
      v12([{ id: 'a1', kind: 'api', attachedTo: 'b0', attrs: { ...apiAttrs, facet: null, notes: '' } }]),
    )
    expect(blockOf(doc, 'b0').attrs.apiRefs).toEqual([
      { id: 'a1', serviceId: 'svc', method: 'GET', path: '/orders' },
    ])
  })
})

describe('migration v12 → v13 — propriétés globales', () => {
  it('est déterministe : deux passages sur le même document donnent le même résultat', () => {
    const input = v12([
      { id: 'n1', kind: 'behavior', attachedTo: 'b0', attrs: behaviorAttrs },
      { id: 'a1', kind: 'api', attachedTo: 'b1', attrs: apiAttrs },
    ])
    expect(run(input)).toEqual(run(input))
  })

  it('fixture locasyst : toutes les notes converties, aucun invariant violé', () => {
    const doc = run(locasyst)
    expect(doc.nodes.some((n) => n.type === 'note')).toBe(false)
    // 12 notes comportement → 12 commentaires « Comportement » ; les 48 notes API partent en
    // inline (les cibles pages ont des blocs) — le total de connexions reprend les 48.
    expect(doc.comments.filter((c) => c.tag?.label === 'Comportement')).toHaveLength(12)
    const refs = doc.nodes.filter(isBlock).flatMap((b) => b.attrs.apiRefs)
    const fallback = doc.comments.filter((c) => c.tag?.label === 'API')
    expect(refs.length + fallback.length).toBe(48)
    expect(checkInvariants(doc)).toEqual([])
  })
})

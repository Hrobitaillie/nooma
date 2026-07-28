import { describe, it, expect } from 'vitest'
import { parseProjectDoc, safeParseProjectDoc } from '@flooow/core/model/schema'
import { CURRENT, migrate, UnsupportedVersionError } from '@flooow/core/model/migrations'
import { checkInvariants } from '@flooow/core/domain/invariants'
import { createEmptyProject, createFeature } from '@flooow/core/model/factory'
import { docToMarkdown, isEmptyDoc } from '@flooow/core/model/richContent'
import sample from '../fixtures/sample-project.flooow.json'

describe('schema', () => {
  it('valide un document vierge', () => {
    expect(() => parseProjectDoc(createEmptyProject())).not.toThrow()
  })

  it('valide le fixture écrit à la main', () => {
    expect(() => parseProjectDoc(sample)).not.toThrow()
  })

  it('rejette une clé inconnue (.strict)', () => {
    const bad = { ...createEmptyProject(), rogue: true }
    expect(safeParseProjectDoc(bad).success).toBe(false)
  })

  it('rejette un type de nœud inconnu', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    doc.nodes = [{ id: 'x', type: 'widget', parentId: null, position: { x: 0, y: 0 }, attrs: {} }]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('rejette un nœud de type portal (portail = nœud supprimé du modèle)', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    doc.nodes = [
      {
        id: 'portal-x-out',
        type: 'portal',
        parentId: null,
        attachedTo: 'pg',
        position: { x: 10, y: 10 },
        attrs: { pairId: 'x', role: 'out' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('valide le mode de rendu portal sur une arête', () => {
    const doc = createEmptyProject() as unknown as { edges: unknown[] }
    doc.edges = [
      {
        id: 'e',
        type: 'navigatesTo',
        source: 'a',
        target: 'b',
        attrs: { render: 'portal' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(true)
  })

  it('rejette un mode de rendu inconnu (strict)', () => {
    const doc = createEmptyProject() as unknown as { edges: unknown[] }
    doc.edges = [
      {
        id: 'e',
        type: 'navigatesTo',
        source: 'a',
        target: 'b',
        attrs: { render: 'blob' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('rejette un statut de fonctionnalité hors enum (v10)', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    const feature = createFeature({ id: 'f' }) as unknown as { attrs: { status: string } }
    feature.attrs.status = 'en-orbite'
    doc.nodes = [feature]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('rejette un item de checklist avec une phase inconnue (v10)', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    const feature = createFeature({ id: 'f' }) as unknown as { attrs: { checklist: unknown[] } }
    feature.attrs.checklist = [{ id: 'c1', label: 'Endpoints mappés', done: false, phase: 'recette' }]
    doc.nodes = [feature]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('rejette un attachedTo sur une frame (strict)', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    doc.nodes = [
      {
        id: 'p',
        type: 'frame',
        kind: 'page',
        parentId: null,
        attachedTo: 'x',
        position: { x: 0, y: 0 },
        attrs: { name: '', route: '', roles: [], description: '', constraints: [], logic: '', notes: '' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })
})

describe('migrations', () => {
  it('laisse passer un document au format courant', () => {
    const doc = createEmptyProject()
    expect(migrate(doc)).toBeTruthy()
  })

  it('rejette un format futur', () => {
    const future = { meta: { formatVersion: 99 } }
    expect(() => migrate(future)).toThrow(UnsupportedVersionError)
  })

  it('rejette un document sans formatVersion', () => {
    expect(() => migrate({})).toThrow()
  })
})

describe('migrations — v1 → v2', () => {
  const v1 = {
    meta: {
      name: 'Legacy',
      formatVersion: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      pricing: { riskCoeff: 1.25, dailyRate: null },
      homePageId: 'page-home',
    },
    site: { attrs: { context: 'ctx', constraints: [], notes: '' } },
    nodes: [
      {
        id: 'page-home',
        type: 'frame',
        kind: 'page',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { w: 420, h: 300 },
        attrs: { name: 'Home', description: 'd', route: '/', roles: ['user'], constraints: [], logic: '', notes: '' },
      },
      {
        id: 'section-list',
        type: 'frame',
        kind: 'section',
        parentId: 'page-home',
        position: { x: 20, y: 80 },
        size: { w: 220, h: 140 },
        attrs: { name: 'Listing', description: 'liste', constraints: ['pag'], logic: '', notes: '' },
      },
      {
        id: 'behavior-search',
        type: 'behavior',
        parentId: 'section-list',
        position: { x: 12, y: 40 },
        lot: 2,
        attrs: { name: 'Recherche', description: 'x', facet: 'front', trigger: 'saisie', rules: '', hours: 5, notes: '' },
      },
      {
        id: 'service-erp',
        type: 'service',
        parentId: null,
        position: { x: -300, y: 120 },
        attrs: {
          name: 'ERP',
          kind: 'REST',
          auth: 'OAuth2',
          risk: 'medium',
          endpoints: [{ method: 'GET', path: '/orders', notes: '' }],
          constraints: [],
          notes: 'n',
        },
      },
    ],
    edges: [
      { id: 'e-nav', type: 'navigatesTo', source: 'page-home', target: 'page-home', attrs: {} },
      {
        id: 'e-consume',
        type: 'consumes',
        source: 'behavior-search',
        target: 'service-erp',
        attrs: { endpointRef: 'GET /orders' },
      },
    ],
  }

  it('produit un document v2 valide', () => {
    const migrated = migrate(v1)
    expect(() => parseProjectDoc(migrated)).not.toThrow()
  })

  it('section → bloc free, behavior → commentaire, service → registre, consumes → commentaire API', () => {
    const migrated = parseProjectDoc(migrate(v1))
    // migrate() applique toute la chaîne jusqu'à CURRENT. Assertion sur CURRENT et non sur un
    // littéral : ce test porte sur le fait que la chaîne va jusqu'au bout, pas sur son dernier
    // maillon — un bump de version ne doit pas le faire échouer.
    expect(migrated.meta.formatVersion).toBe(CURRENT)

    const block = migrated.nodes.find((n) => n.id === 'section-list')!
    expect(block.type).toBe('frame')
    expect((block as { kind: string }).kind).toBe('block')
    expect((block as { attrs: { blockType: string } }).attrs.blockType).toBe('free')

    // Depuis la v13, plus AUCUNE note ne survit à la chaîne : le behavior finit en commentaire
    // ancré à son ex-cible, id dérivé (déterminisme de la migration).
    expect(migrated.nodes.some((n) => n.type === 'note')).toBe(false)
    const behavior = migrated.comments.find((c) => c.id === 'comment-behavior-search')!
    expect(behavior.anchor.nodeId).toBe('section-list')
    expect(behavior.tag).toEqual({ label: 'Comportement', color: '#f59e0b' })

    expect(migrated.services.map((s) => s.id)).toEqual(['service-erp'])
    expect(migrated.nodes.some((n) => n.id === 'service-erp')).toBe(false)

    // La note api issue de `consumes` était accrochée au BEHAVIOR (jamais un bloc) : pas de cible
    // inline possible → repli en commentaire tag API, ancre conservée telle quelle (rien n'est
    // perdu, l'invariant COMMENT_ANCHOR signalera la cible disparue).
    const api = migrated.comments.find((c) => c.id === 'comment-api-e-consume-0')!
    expect(api.tag).toEqual({ label: 'API', color: '#0891b2' })
    expect(api.anchor.nodeId).toBe('behavior-search')

    // navigatesTo conservée, consumes retirée des edges.
    expect(migrated.edges.map((e) => e.type)).toEqual(['navigatesTo'])
  })
})

describe('migrations — v8 → v9 (abandon des notePages)', () => {
  // Doc v5 avec des entrées de notes : la chaîne complète v5→v9 doit finir SANS la collection
  // (le narratif vit en fichiers markdown hors du graphe depuis la v9), et le zod strict de la
  // v9 rejetterait toute clé `notePages` survivante — c'est précisément ce que la migration retire.
  const v5 = () => ({
    ...createEmptyProject(),
    meta: { ...createEmptyProject().meta, formatVersion: 5 },
    notePages: [
      { id: 'cat', parentId: null, rank: 0, title: 'Atelier', content: { type: 'doc', content: [] } },
      { id: 'pg', parentId: 'cat', rank: 0, title: 'CR', content: { type: 'doc', content: [] } },
    ],
  })

  it('la chaîne complète depuis la v5 aboutit en v9, sans clé notePages', () => {
    const migrated = parseProjectDoc(migrate(v5()))
    expect(migrated.meta.formatVersion).toBe(CURRENT)
    expect('notePages' in migrated).toBe(false)
  })

  it('accepte un document v5 sans aucune page de notes', () => {
    const doc = { ...v5(), notePages: [] }
    expect(() => parseProjectDoc(migrate(doc))).not.toThrow()
  })
})

describe('migrations — v6 → v7', () => {
  // Doc v6 minimal : le périmètre y est encore un enum figé porté par `attrs.perimeter`.
  const feature = (id: string, perimeter: string | null) => ({
    id,
    type: 'feature',
    parentId: null,
    position: { x: 0, y: 0 },
    attrs: { code: id.toUpperCase(), name: id, content: { type: 'doc', content: [] }, perimeter, estimate: '' },
  })
  const v6 = (nodes: unknown[]) => {
    const base = createEmptyProject()
    const doc: Record<string, unknown> = {
      ...base,
      meta: { ...base.meta, formatVersion: 6 },
      nodes,
    }
    // Les collections v7 n'existent pas dans un vrai document v6 : c'est la migration qui les crée.
    delete doc.featureFields
    delete doc.featureOptions
    return doc
  }

  it('crée les deux champs de projet, et n’amorce que les options réellement utilisées', () => {
    const migrated = parseProjectDoc(migrate(v6([feature('a', 'site'), feature('b', 'external')])))
    expect(migrated.meta.formatVersion).toBe(CURRENT)
    expect(migrated.featureFields.map((f) => f.id)).toEqual(['binding', 'perimeter'])
    // 'editor' et 'internal' ne sont portés par aucune fonctionnalité → aucune option morte.
    expect(migrated.featureOptions.map((o) => o.name)).toEqual(['Site', 'Externe'])
    expect(migrated.featureOptions.every((o) => o.fieldId === 'perimeter')).toBe(true)
  })

  it('reporte le périmètre de chaque fonctionnalité et retire l’ancien champ', () => {
    const migrated = parseProjectDoc(migrate(v6([feature('a', 'site'), feature('b', null)])))
    const byId = new Map(migrated.nodes.map((n) => [n.id, n]))
    const a = byId.get('a')!
    const b = byId.get('b')!
    if (a.type !== 'feature' || b.type !== 'feature') throw new Error('type inattendu')
    const site = migrated.featureOptions.find((o) => o.name === 'Site')!
    expect(a.attrs.fieldValues).toEqual({ perimeter: site.id })
    expect(b.attrs.fieldValues).toEqual({ perimeter: null })
    // `.strict()` rejetterait un `perimeter` résiduel : le parse ci-dessus le prouve déjà, mais
    // l'assertion rend l'intention explicite.
    expect('perimeter' in a.attrs).toBe(false)
  })

  it('ne laisse aucune référence pendante (invariants référentiels)', () => {
    const migrated = parseProjectDoc(migrate(v6([feature('a', 'site'), feature('b', 'site')])))
    expect(checkInvariants(migrated)).toEqual([])
  })

  it('conserve une valeur de périmètre hors enum plutôt que de la perdre', () => {
    const migrated = parseProjectDoc(migrate(v6([feature('a', 'bricolé')])))
    const opt = migrated.featureOptions.find((o) => o.name === 'bricolé')
    expect(opt).toBeTruthy()
    const a = migrated.nodes.find((n) => n.id === 'a')!
    if (a.type !== 'feature') throw new Error('type inattendu')
    expect(a.attrs.fieldValues.perimeter).toBe(opt!.id)
  })

  it('accepte un document v6 sans aucune fonctionnalité', () => {
    const migrated = parseProjectDoc(migrate(v6([])))
    expect(migrated.featureOptions).toEqual([])
    expect(migrated.featureFields).toHaveLength(2)
  })
})

describe('migrations — v7 → v8', () => {
  // Doc v7 minimal : le bloc y porte encore description / constraints / notes en champs séparés.
  const block = (id: string, attrs: Record<string, unknown>) => ({
    id,
    type: 'frame',
    kind: 'block',
    parentId: 'pg',
    position: { x: 0, y: 0 },
    attrs: { name: id, blockType: 'free', description: '', constraints: [], notes: '', ...attrs },
  })
  const v7 = (nodes: unknown[]) => {
    const base = createEmptyProject()
    return { ...base, meta: { ...base.meta, formatVersion: 7 }, nodes }
  }
  const blockOf = (doc: ReturnType<typeof parseProjectDoc>, id: string) => {
    const n = doc.nodes.find((x) => x.id === id)!
    if (n.type !== 'frame' || n.kind !== 'block') throw new Error('type inattendu')
    return n
  }

  it('fusionne description / contraintes / notes en un document riche', () => {
    const migrated = parseProjectDoc(
      migrate(
        v7([
          block('b', {
            description: 'Tableau paginé.',
            constraints: ['pagination 50/p', 'tri serveur'],
            notes: 'à confirmer',
          }),
        ]),
      ),
    )
    const md = docToMarkdown(blockOf(migrated, 'b').attrs.content)
    // Chaque contrainte reste une puce distincte : c'est tout l'intérêt de ne pas les concaténer.
    expect(md).toBe(
      'Tableau paginé.\n\n### Contraintes\n\n- pagination 50/p\n- tri serveur\n\n### Notes\n\nà confirmer',
    )
  })

  it('retire les anciens champs et amorce apiRefs à vide', () => {
    const migrated = parseProjectDoc(migrate(v7([block('b', { description: 'x' })])))
    // Double cast : on inspecte des clés que le TYPE v8 ne connaît plus, justement pour vérifier
    // que la migration les a bien retirées du document.
    const attrs = blockOf(migrated, 'b').attrs as unknown as Record<string, unknown>
    expect(attrs.apiRefs).toEqual([])
    expect(attrs.description).toBeUndefined()
    expect(attrs.constraints).toBeUndefined()
    expect(attrs.notes).toBeUndefined()
    // Le reste du bloc est intact.
    expect(attrs.name).toBe('b')
    expect(attrs.blockType).toBe('free')
  })

  it('produit un document vide pour un bloc sans aucun texte', () => {
    const migrated = parseProjectDoc(migrate(v7([block('b', {})])))
    expect(isEmptyDoc(blockOf(migrated, 'b').attrs.content)).toBe(true)
  })

  // Au maillon v8 les notes API restaient intactes (le bloc ne les aspirait pas — l'appel serait
  // apparu deux fois). Depuis la v13 la chaîne COMPLÈTE les convertit en connexions inline : c'est
  // l'état final qui se teste ici, le comportement du maillon v8 n'est plus observable.
  it('la chaîne complète convertit les notes API en connexions inline du bloc (v13)', () => {
    const apiNote = {
      id: 'api1',
      type: 'note',
      kind: 'api',
      parentId: null,
      attachedTo: 'b',
      position: { x: 0, y: 0 },
      attrs: { serviceId: 'svc', method: 'GET', path: '/x', facet: null, notes: '' },
    }
    const doc = v7([block('b', {}), apiNote]) as Record<string, unknown>
    doc.services = [{ id: 'svc', name: 'ERP', baseUrl: '', auth: '', risk: 'low', endpoints: [], notes: '' }]
    const migrated = parseProjectDoc(migrate(doc))
    expect(migrated.nodes.some((n) => n.type === 'note')).toBe(false)
    // La connexion reprend l'id de la note (déterminisme + traçabilité dans les diffs).
    expect(blockOf(migrated, 'b').attrs.apiRefs).toEqual([
      { id: 'api1', serviceId: 'svc', method: 'GET', path: '/x' },
    ])
    expect(blockOf(migrated, 'b').attrs.order).toEqual(['api1'])
  })
})

describe('migrations — v9 → v10 (cycle de vie de la fonctionnalité)', () => {
  // Fonctionnalité v9 minimale : pas encore de status ni de checklist.
  const feature = (id: string, attrs: Record<string, unknown> = {}) => ({
    id,
    type: 'feature',
    parentId: null,
    position: { x: 0, y: 0 },
    attrs: {
      code: id.toUpperCase(),
      name: id,
      content: { type: 'doc', content: [] },
      fieldValues: {},
      estimate: '',
      ...attrs,
    },
  })
  const v9 = (nodes: unknown[]) => {
    const base = createEmptyProject()
    return { ...base, meta: { ...base.meta, formatVersion: 9 }, nodes }
  }

  it('amorce status=idee et checklist vide, sans toucher au reste', () => {
    const migrated = parseProjectDoc(migrate(v9([feature('f', { estimate: '1j' })])))
    const f = migrated.nodes.find((n) => n.id === 'f')!
    if (f.type !== 'feature') throw new Error('type inattendu')
    expect(f.attrs.status).toBe('idee')
    expect(f.attrs.checklist).toEqual([])
    expect(f.attrs.estimate).toBe('1j')
    expect(f.attrs.code).toBe('F')
  })

  it('un featureField « Statut » créé à la main n’est PAS converti (il reste en place)', () => {
    const base = v9([feature('f')])
    const doc = {
      ...base,
      featureFields: [...base.featureFields, { id: 'statut-maison', label: 'Statut', order: 2 }],
      featureOptions: [{ id: 'opt-fini', fieldId: 'statut-maison', name: 'Fini' }],
    }
    const migrated = parseProjectDoc(migrate(doc))
    expect(migrated.featureFields.some((fl) => fl.id === 'statut-maison')).toBe(true)
    expect(migrated.featureOptions).toHaveLength(1)
    const f = migrated.nodes.find((n) => n.id === 'f')!
    if (f.type !== 'feature') throw new Error('type inattendu')
    expect(f.attrs.status).toBe('idee') // le défaut, pas une conversion devinée
  })

  it('ne touche pas aux autres types de nœuds', () => {
    const page = {
      id: 'p',
      type: 'frame',
      kind: 'page',
      parentId: null,
      position: { x: 0, y: 0 },
      attrs: { name: 'Accueil', route: '/', roles: [], description: '', constraints: [], logic: '', notes: '' },
    }
    const migrated = parseProjectDoc(migrate(v9([page])))
    const p = migrated.nodes.find((n) => n.id === 'p')!
    expect(p.type).toBe('frame')
    expect((p.attrs as { name: string }).name).toBe('Accueil')
  })
})

describe('migrations — v10 → v11 (ordre des éléments du bloc)', () => {
  // Bloc v10 : les connexions n'ont pas d'id, et rien ne porte l'ordre d'affichage.
  const block = (id: string, apiRefs: unknown[] = []) => ({
    id,
    type: 'frame',
    kind: 'block',
    parentId: 'pg',
    position: { x: 0, y: 0 },
    attrs: { name: id, blockType: 'free', content: { type: 'doc', content: [] }, apiRefs },
  })
  const v10 = (nodes: unknown[]) => {
    const base = createEmptyProject()
    return { ...base, meta: { ...base.meta, formatVersion: 10 }, nodes }
  }
  const blockOf = (doc: ReturnType<typeof parseProjectDoc>, id: string) => {
    const n = doc.nodes.find((x) => x.id === id)!
    if (n.type !== 'frame' || n.kind !== 'block') throw new Error('type inattendu')
    return n
  }

  it('donne un id à chaque connexion et amorce l’ordre dessus', () => {
    const migrated = parseProjectDoc(
      migrate(
        v10([
          block('b', [
            { serviceId: 's1', method: 'GET', path: '/a' },
            { serviceId: 's1', method: 'POST', path: '/b' },
          ]),
        ]),
      ),
    )
    const attrs = blockOf(migrated, 'b').attrs
    expect(attrs.apiRefs.map((r) => r.id)).toEqual(['b-api-0', 'b-api-1'])
    // L'ordre reprend les connexions telles qu'elles s'affichaient déjà — la migration ne réordonne rien.
    expect(attrs.order).toEqual(['b-api-0', 'b-api-1'])
    expect(attrs.apiRefs[0]).toMatchObject({ serviceId: 's1', method: 'GET', path: '/a' })
  })

  it('est reproductible : deux migrations du même document donnent le même résultat', () => {
    // Les ids sont dérivés de l'id du bloc, pas tirés au sort — sinon aucun diff de .graph.json ni
    // aucune réconciliation collab ne serait stable.
    const doc = v10([block('b', [{ serviceId: 's', method: 'GET', path: '/x' }])])
    expect(migrate(structuredClone(doc))).toEqual(migrate(structuredClone(doc)))
  })

  it('amorce un bloc sans connexion avec des listes vides', () => {
    const migrated = parseProjectDoc(migrate(v10([block('b')])))
    expect(blockOf(migrated, 'b').attrs.apiRefs).toEqual([])
    expect(blockOf(migrated, 'b').attrs.order).toEqual([])
  })

  it('ne touche pas aux nœuds qui ne sont pas des blocs', () => {
    const page = {
      id: 'pg',
      type: 'frame',
      kind: 'page',
      parentId: null,
      position: { x: 0, y: 0 },
      attrs: { name: 'Accueil', route: '/', roles: [], description: '', constraints: [], logic: '', notes: '' },
    }
    const migrated = parseProjectDoc(migrate(v10([page])))
    const p = migrated.nodes.find((n) => n.id === 'pg')!
    expect((p.attrs as { name: string }).name).toBe('Accueil')
    expect('order' in p.attrs).toBe(false)
  })
})

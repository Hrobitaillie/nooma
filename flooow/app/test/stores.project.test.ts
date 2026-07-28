import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { FIELD_BINDING, FIELD_PERIMETER } from '@flooow/core/model/types'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('project store — création', () => {
  it('démarre sur un projet vierge valide', () => {
    const p = useProjectStore()
    expect(p.nodes.size).toBe(0)
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
  })

  it('addPage ajoute une page et met à jour les index', () => {
    const p = useProjectStore()
    const id = p.addPage({ name: 'Accueil' })
    expect(p.nodes.has(id)).toBe(true)
    expect(p.pages).toHaveLength(1)
    expect(p.childrenOf(null).map((n) => n.id)).toContain(id)
    expect(p.dirty).toBe(true)
    expect(p.graphVersion).toBeGreaterThan(0)
  })

  it('génère des ids uniques (UUID) en cas de même nom', () => {
    const p = useProjectStore()
    const a = p.addPage({ name: 'Accueil' })
    const b = p.addPage({ name: 'Accueil' })
    expect(a).not.toBe(b)
    expect(b).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('addBlock rattache un bloc à une page et l empile en bas', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const b1 = p.addBlock(page, 'hero')
    const b2 = p.addBlock(page, 'grid')
    expect(p.orderedBlocksOf(page).map((b) => b.id)).toEqual([b1, b2])
    expect(p.nodeById(b2)?.position.y).toBeGreaterThan(p.nodeById(b1)!.position.y)
  })

  it('addBehaviorNote / addApiNote rattachées via attachedTo', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const block = p.addBlock(page, 'grid')
    const svc = p.addService({ name: 'ERP' })
    const bn = p.addBehaviorNote(block, { name: 'Recherche' })
    const an = p.addApiNote(block, svc, { method: 'GET', path: '/orders' })
    expect(p.notesOf(block).map((n) => n.id).sort()).toEqual([an, bn].sort())
    expect(p.nodeById(an)).toMatchObject({ attachedTo: block })
  })
})

describe('project store — mutations', () => {
  it('moveNode change la position', () => {
    const p = useProjectStore()
    const id = p.addPage({ name: 'P' })
    p.moveNode(id, { x: 100, y: 200 })
    expect(p.nodeById(id)?.position).toEqual({ x: 100, y: 200 })
  })

  it('reorderBlock réordonne la pile et reflow les y', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const b1 = p.addBlock(page, 'hero')
    const b2 = p.addBlock(page, 'grid')
    const b3 = p.addBlock(page, 'cta')
    p.reorderBlock(b3, 0)
    expect(p.orderedBlocksOf(page).map((b) => b.id)).toEqual([b3, b1, b2])
  })

  it('reparentBlock déplace un bloc dans une autre page', () => {
    const p = useProjectStore()
    const p1 = p.addPage({ name: 'P1' })
    const p2 = p.addPage({ name: 'P2' })
    const block = p.addBlock(p1, 'grid')
    p.reparentBlock(block, p2)
    expect(p.nodeById(block)?.parentId).toBe(p2)
    expect(p.orderedBlocksOf(p2).map((b) => b.id)).toContain(block)
    expect(p.orderedBlocksOf(p1)).toHaveLength(0)
  })

  it("reparentBlock insère à l'index demandé (drag Octopus des blocs)", () => {
    const p = useProjectStore()
    const p1 = p.addPage({ name: 'P1' })
    const p2 = p.addPage({ name: 'P2' })
    const moved = p.addBlock(p1, 'grid')
    const a = p.addBlock(p2, 'hero')
    const b = p.addBlock(p2, 'cta')
    p.reparentBlock(moved, p2, 1) // entre a et b
    expect(p.orderedBlocksOf(p2).map((x) => x.id)).toEqual([a, moved, b])
    // Index hors bornes : clampé en fin de pile, jamais d'écart dans les clés d'ordre.
    const tail = p.addBlock(p1, 'free')
    p.reparentBlock(tail, p2, 99)
    expect(p.orderedBlocksOf(p2).map((x) => x.id)).toEqual([a, moved, b, tail])
  })

  it('setBlockType change le type de bloc', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const block = p.addBlock(page, 'free')
    p.setBlockType(block, 'damier')
    expect(p.nodeById(block)).toMatchObject({ attrs: { blockType: 'damier' } })
  })

  it('attachNote rattache une note à une autre cible', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const b1 = p.addBlock(page, 'grid')
    const b2 = p.addBlock(page, 'cta')
    const note = p.addBehaviorNote(b1, { name: 'N' })
    p.attachNote(note, b2)
    expect(p.notesOf(b2).map((n) => n.id)).toContain(note)
    expect(p.notesOf(b1)).toHaveLength(0)
  })

  it('removeNode supprime en cascade blocs + notes rattachées + arêtes + homePage', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const block = p.addBlock(page, 'grid')
    const svc = p.addService({ name: 'ERP' })
    const bn = p.addBehaviorNote(block, { name: 'B' })
    const an = p.addApiNote(block, svc, { method: 'GET', path: '/x' })
    const other = p.addPage({ name: 'Other' })
    const e = p.addEdge({ type: 'navigatesTo', source: page, target: other })
    p.setHomePage(page)

    p.removeNode(page)
    expect(p.nodes.has(page)).toBe(false)
    expect(p.nodes.has(block)).toBe(false)
    expect(p.nodes.has(bn)).toBe(false) // note rattachée au bloc supprimé
    expect(p.nodes.has(an)).toBe(false)
    expect(p.services.find((s) => s.id === svc)).toBeTruthy() // registre conservé
    expect(p.edges.find((x) => x.id === e)).toBeUndefined()
    expect(p.meta.homePageId).toBeNull()
  })

  it('assignLot et setHomePage', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    p.assignLot(page, 3)
    expect(p.nodeById(page)?.lot).toBe(3)
    p.setHomePage(page)
    expect(p.meta.homePageId).toBe(page)
  })
})

describe('project store — mode de rendu d arête (portal)', () => {
  function edgeWith(p: ReturnType<typeof useProjectStore>) {
    const a = p.addPage({ name: 'A' })
    const b = p.addPage({ name: 'B' })
    const e = p.addEdge({ type: 'navigatesTo', source: a, target: b })
    return e
  }

  it('render par défaut absent (mode ligne)', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBeUndefined()
  })

  it('setEdgeRender(portal) pose render=portal', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.setEdgeRender(e, 'portal')
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBe('portal')
  })

  it('setEdgeRender(line) retire la clé render', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.setEdgeRender(e, 'portal')
    p.setEdgeRender(e, 'line')
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBeUndefined()
  })

  it('setEdgeRender no-op si le mode est déjà celui demandé', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.setEdgeRender(e, 'portal')
    const before = p.graphVersion
    p.setEdgeRender(e, 'portal')
    expect(p.graphVersion).toBe(before)
  })

  it('toggleEdgeRender bascule line ↔ portal', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.toggleEdgeRender(e)
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBe('portal')
    p.toggleEdgeRender(e)
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBeUndefined()
  })

  it('toggleEdgeRender pose le verrou renderManual', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.toggleEdgeRender(e)
    expect(p.edges.find((x) => x.id === e)?.attrs.renderManual).toBe(true)
  })

  it('autoSetRenders applique les modes non verrouillés', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.autoSetRenders([{ edgeId: e, mode: 'portal' }])
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBe('portal')
  })

  it('autoSetRenders IGNORE une arête verrouillée (renderManual)', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.toggleEdgeRender(e) // portal + verrou
    p.autoSetRenders([{ edgeId: e, mode: 'line' }]) // l auto ne doit PAS revenir en ligne
    expect(p.edges.find((x) => x.id === e)?.attrs.render).toBe('portal')
  })

  it('autoSetRenders no-op (même mode / rien à changer) n incrémente pas graphVersion', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    const before = p.graphVersion
    p.autoSetRenders([{ edgeId: e, mode: 'line' }]) // déjà en ligne
    expect(p.graphVersion).toBe(before)
  })

  it('setPortalPosition déplace une extrémité', () => {
    const p = useProjectStore()
    const e = edgeWith(p)
    p.setEdgeRender(e, 'portal', { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } })
    p.setPortalPosition(e, 'source', { x: 42, y: 7 })
    const pos = p.edges.find((x) => x.id === e)?.attrs.portalPositions
    expect(pos?.source).toEqual({ x: 42, y: 7 })
    expect(pos?.target).toEqual({ x: 100, y: 0 })
  })

  it('le rendu portal est purement visuel : la cible reste atteignable, doc valide', () => {
    const p = useProjectStore()
    const home = p.addPage({ name: 'Home' })
    const away = p.addPage({ name: 'Away' })
    p.setHomePage(home)
    const e = p.addEdge({ type: 'navigatesTo', source: home, target: away })
    p.setEdgeRender(e, 'portal')
    expect(p.orphans.has(away)).toBe(false)
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
    expect(p.violations).toEqual([])
  })
})

describe('project store — arêtes & services', () => {
  it('setEdgeType change le type d une arête (navigatesTo → dependsOn)', () => {
    const p = useProjectStore()
    const a = p.addPage({ name: 'A' })
    const b = p.addPage({ name: 'B' })
    const e = p.addEdge({ type: 'navigatesTo', source: a, target: b })
    p.setEdgeType(e, 'dependsOn')
    expect(p.edges.find((x) => x.id === e)?.type).toBe('dependsOn')
  })

  it('addService / updateService / removeService gèrent le registre', () => {
    const p = useProjectStore()
    const svc = p.addService({ name: 'ERP' })
    expect(p.services.map((s) => s.id)).toContain(svc)
    p.updateService(svc, { baseUrl: 'https://x', risk: 'high' })
    expect(p.serviceById(svc)).toMatchObject({ baseUrl: 'https://x', risk: 'high' })
    p.removeService(svc)
    expect(p.services).toHaveLength(0)
  })
})

describe('project store — undo/redo', () => {
  it('undo annule une création, redo la rejoue', () => {
    const p = useProjectStore()
    const history = useHistoryStore()
    const id = p.addPage({ name: 'P' })
    expect(p.nodes.has(id)).toBe(true)

    history.undo()
    expect(p.nodes.has(id)).toBe(false)

    history.redo()
    expect(p.nodes.has(id)).toBe(true)
  })

  it('load réinitialise l historique', () => {
    const p = useProjectStore()
    const history = useHistoryStore()
    p.addPage({ name: 'P' })
    expect(history.canUndo).toBe(true)
    p.reset()
    expect(history.canUndo).toBe(false)
  })

  it('coalescence : deux updateMeta consécutifs = une entrée', () => {
    const p = useProjectStore()
    const history = useHistoryStore()
    p.updateMeta({ name: 'A' })
    p.updateMeta({ name: 'B' })
    expect(history.depth).toBe(1)
  })
})

describe('project store — contexte site', () => {
  it('updateSite édite contexte/contraintes et coalesce', () => {
    const p = useProjectStore()
    const history = useHistoryStore()
    p.updateSite({ context: 'Portail B2B' })
    p.updateSite({ constraints: ['SSO', 'RGPD'] })
    expect(p.site.attrs.context).toBe('Portail B2B')
    expect(p.site.attrs.constraints).toEqual(['SSO', 'RGPD'])
    expect(history.depth).toBe(1) // coalescence sous la clé 'site'
  })

  it('updateSite sans changement ne crée pas d entrée', () => {
    const p = useProjectStore()
    const history = useHistoryStore()
    p.updateSite({ context: 'X' })
    const depth = history.depth
    p.updateSite({ context: 'X' })
    expect(history.depth).toBe(depth)
  })
})

describe('project store — sérialisation', () => {
  it('serialize → load est un aller-retour fidèle et valide', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    p.addBlock(page, 'grid')
    p.addService({ name: 'ERP' })
    const snapshot = p.serialize()
    expect(() => parseProjectDoc(snapshot)).not.toThrow()

    const p2 = (() => {
      setActivePinia(createPinia())
      return useProjectStore()
    })()
    p2.load(snapshot)
    expect(p2.nodes.size).toBe(2)
    expect(p2.services).toHaveLength(1)
  })
})

describe('project store — champs de fonctionnalité (v7)', () => {
  it('amorce les deux champs, sans aucune option', () => {
    const p = useProjectStore()
    expect(p.orderedFeatureFields.map((f) => f.id)).toEqual([FIELD_BINDING, FIELD_PERIMETER])
    expect(p.featureOptions).toEqual([])
  })

  it('addFeatureOption normalise, ignore un nom vide et ne crée pas de doublon', () => {
    const p = useProjectStore()
    const a = p.addFeatureOption(FIELD_PERIMETER, '  Pilot’in  ')
    expect(p.featureOptionById(a!)?.name).toBe('Pilot’in')

    expect(p.addFeatureOption(FIELD_PERIMETER, '   ')).toBeNull()
    // Même nom à la casse près → on retombe sur l'option existante, pas de seconde entrée.
    expect(p.addFeatureOption(FIELD_PERIMETER, 'pilot’in')).toBe(a)
    expect(p.optionsOfField(FIELD_PERIMETER)).toHaveLength(1)
  })

  it('cloisonne les options par champ', () => {
    const p = useProjectStore()
    p.addFeatureOption(FIELD_PERIMETER, 'Pilot’in')
    p.addFeatureOption(FIELD_BINDING, 'Backoffice')
    expect(p.optionsOfField(FIELD_PERIMETER).map((o) => o.name)).toEqual(['Pilot’in'])
    expect(p.optionsOfField(FIELD_BINDING).map((o) => o.name)).toEqual(['Backoffice'])
    // Un champ inexistant n'accepte rien.
    expect(p.addFeatureOption('inconnu', 'X')).toBeNull()
  })

  it('setFeatureFieldValue n’écrase pas la valeur des AUTRES champs', () => {
    const p = useProjectStore()
    const f = p.addFeature(null, { name: 'F' })
    const perim = p.addFeatureOption(FIELD_PERIMETER, 'Pilot’in')!
    const bind = p.addFeatureOption(FIELD_BINDING, 'Backoffice')!
    p.setFeatureFieldValue(f, FIELD_PERIMETER, perim)
    p.setFeatureFieldValue(f, FIELD_BINDING, bind)
    const node = p.nodeById(f)!
    if (node.type !== 'feature') throw new Error('type inattendu')
    expect(node.attrs.fieldValues).toEqual({ [FIELD_PERIMETER]: perim, [FIELD_BINDING]: bind })
  })

  it('refuse de supprimer une option encore utilisée, et l’autorise une fois libérée', () => {
    const p = useProjectStore()
    const f = p.addFeature(null, { name: 'F' })
    const opt = p.addFeatureOption(FIELD_PERIMETER, 'Pilot’in')!
    p.setFeatureFieldValue(f, FIELD_PERIMETER, opt)

    expect(p.optionUsageCount(opt)).toBe(1)
    expect(p.removeFeatureOption(opt)).toBe(false)
    expect(p.featureOptionById(opt)).toBeTruthy()

    p.setFeatureFieldValue(f, FIELD_PERIMETER, null)
    expect(p.optionUsageCount(opt)).toBe(0)
    expect(p.removeFeatureOption(opt)).toBe(true)
    expect(p.featureOptionById(opt)).toBeUndefined()
  })

  it('renommer une option ne délie pas les fonctionnalités (référence par id)', () => {
    const p = useProjectStore()
    const f = p.addFeature(null, { name: 'F' })
    const opt = p.addFeatureOption(FIELD_PERIMETER, 'Pilotin')!
    p.setFeatureFieldValue(f, FIELD_PERIMETER, opt)
    p.renameFeatureOption(opt, 'Pilot’in')
    const node = p.nodeById(f)!
    if (node.type !== 'feature') throw new Error('type inattendu')
    expect(node.attrs.fieldValues[FIELD_PERIMETER]).toBe(opt)
    expect(p.featureFieldLabel(node, FIELD_PERIMETER)).toBe('Pilot’in')
  })

  it('renameFeatureField change le libellé du sélecteur', () => {
    const p = useProjectStore()
    p.renameFeatureField(FIELD_PERIMETER, 'Réalisé par')
    expect(p.featureFieldById(FIELD_PERIMETER)?.label).toBe('Réalisé par')
  })

  it('les champs et options survivent à un aller-retour de sérialisation', () => {
    const p = useProjectStore()
    const f = p.addFeature(null, { name: 'F' })
    const opt = p.addFeatureOption(FIELD_PERIMETER, 'Pilot’in')!
    p.setFeatureFieldValue(f, FIELD_PERIMETER, opt)
    const doc = p.serialize()
    expect(() => parseProjectDoc(doc)).not.toThrow()
    expect(doc.featureOptions.map((o) => o.name)).toEqual(['Pilot’in'])
  })

  it('l’undo restaure les collections globales (elles passent par commit)', () => {
    const p = useProjectStore()
    const h = useHistoryStore()
    p.addFeatureOption(FIELD_PERIMETER, 'Pilot’in')
    expect(p.optionsOfField(FIELD_PERIMETER)).toHaveLength(1)
    h.undo()
    expect(p.optionsOfField(FIELD_PERIMETER)).toHaveLength(0)
    h.redo()
    expect(p.optionsOfField(FIELD_PERIMETER).map((o) => o.name)).toEqual(['Pilot’in'])
  })
})

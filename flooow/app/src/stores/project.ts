// LE graphe : source unique de vérité (architecture.md §Principe directeur), format v2.
// nodes en Map<id,node>, edges, services (registre), meta, site + index (enfants, notes) + graphVersion.
// TOUTES les mutations passent par une action nommée → undo/redo + invariants possibles.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AttachedIndex,
  BlockNode,
  BlockType,
  ChecklistItem,
  ChildrenIndex,
  Comment,
  CommentAnchor,
  CommentTag,
  CommentsIndex,
  EdgeRender,
  EdgeType,
  FeatureField,
  FeatureNode,
  FeatureOption,
  FeatureStatus,
  FlooowEdge,
  FlooowNode,
  LifecyclePhase,
  ModuleNode,
  NodeIndex,
  NoteNode,
  PageNode,
  Position,
  ProjectDoc,
  ProjectMeta,
  Service,
  SiteAttrs,
  ApiNote,
  BehaviorNote,
} from '@flooow/core/model/types'
import {
  isApiNote,
  isBehaviorNote,
  isBlock,
  isFeature,
  isModule,
  isNote,
  isPage,
  CURRENT_FORMAT_VERSION,
} from '@flooow/core/model/types'
import type { RichDoc } from '@flooow/core/model/richContent'
import {
  createApiNote,
  createBehaviorNote,
  createBlock,
  createComment,
  createCommentReply,
  createEdge,
  createEmptyProject,
  createFeature,
  createModule,
  createPage,
  createService,
  genId,
  BLOCK_STEP,
  FEATURE_STEP,
  type CreateApiNoteInput,
  type CreateCommentInput,
  type CreateBehaviorNoteInput,
  type CreateBlockInput,
  type CreateEdgeInput,
  type CreateFeatureInput,
  type CreateModuleInput,
  type CreatePageInput,
  type CreateServiceInput,
} from '@flooow/core/model/factory'
import { spatialOrder, verticalOrder } from '@flooow/core/domain/ordering'
import { estimateFeatureCard, FEATURE_CARD_GAP } from '@/canvas/cardMetrics'
import {
  FEATURE_CARD_WIDTH,
  moduleAutoSize,
  moduleRowsLayout,
  splitFeatureDeps,
  treeLayout,
  type ModuleItem,
  type TreeDep,
  type TreeItem,
} from '@/canvas/featureTree'
import { resolveLot, resolveLotProvenance } from '@flooow/core/domain/lots'
import { computeUnlocks, type FeatureUnlock } from '@flooow/core/domain/lifecycle'
import { descendants, attachedNotes } from '@flooow/core/domain/rollup'
import { fullRouteOf } from '@flooow/core/domain/routes'
import {
  coverage,
  featuresRealizedBy,
  realizationEdge,
  realizersOf,
  type RealizationTarget,
} from '@flooow/core/domain/realization'
import { orphanPages } from '@flooow/core/domain/reachability'
import { completeness } from '@flooow/core/domain/completeness'
import { checkInvariants } from '@flooow/core/domain/invariants'
import { deriveSpecs, type SpecsFilter } from '@flooow/core/domain/derive/specs'
import { deriveApi } from '@flooow/core/domain/derive/api'
import { deriveEstimate } from '@flooow/core/domain/derive/estimate'
import { deriveCatalog } from '@flooow/core/domain/derive/catalog'
import { useHistoryStore } from './history'
import { useSessionStore } from './session'

/** Patch d'attributs : toutes les clés d'attrs (frames + notes + fonctionnel), toutes optionnelles. */
export type AttrsPatch = Partial<
  PageNode['attrs'] &
    BlockNode['attrs'] &
    ModuleNode['attrs'] &
    BehaviorNote['attrs'] &
    ApiNote['attrs'] &
    FeatureNode['attrs']
>

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Clone profond d'un document. Le format ProjectDoc est JSON par contrat, donc un aller-retour
 * JSON est sûr — et évite les DataCloneError de `structuredClone` sur les proxies réactifs Vue.
 */
function cloneDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useProjectStore = defineStore('project', () => {
  // ── État sérialisable ────────────────────────────────────────────────────
  const meta = ref<ProjectMeta>(createEmptyProject().meta)
  const site = ref<{ attrs: SiteAttrs }>({ attrs: { context: '', constraints: [], notes: '' } })
  const services = ref<Service[]>([])
  const featureFields = ref<FeatureField[]>([])
  const featureOptions = ref<FeatureOption[]>([])
  const nodes = ref<NodeIndex>(new Map())
  const edges = ref<FlooowEdge[]>([])
  const comments = ref<Comment[]>([])

  // ── État dérivé / technique ──────────────────────────────────────────────
  const childrenIndex = ref<ChildrenIndex>(new Map())
  const attachedIndex = ref<AttachedIndex>(new Map())
  const graphVersion = ref(0)
  const dirty = ref(false)

  // ── Index ──────────────────────────────────────────────────────────────
  function rebuildIndexes(): void {
    const kids: ChildrenIndex = new Map()
    const attached: AttachedIndex = new Map()
    for (const node of nodes.value.values()) {
      const key = node.parentId
      const list = kids.get(key)
      if (list) list.push(node.id)
      else kids.set(key, [node.id])
      if (isNote(node)) {
        const alist = attached.get(node.attachedTo)
        if (alist) alist.push(node.id)
        else attached.set(node.attachedTo, [node.id])
      }
    }
    childrenIndex.value = kids
    attachedIndex.value = attached
  }

  /**
   * ids condamnés par la suppression de `rootId` :
   *   - descendants via parentId (blocs d'une page),
   *   - notes rattachées (attachedTo) à un élément condamné.
   * Parcours itératif (worklist) pour propager les cascades.
   */
  function cascadeIds(rootId: string): Set<string> {
    const doomed = new Set<string>()
    const work: string[] = [rootId]
    while (work.length) {
      const current = work.shift() as string
      if (doomed.has(current)) continue
      doomed.add(current)
      // Descendants via parentId (blocs d'une page).
      for (const k of childrenIndex.value.get(current) ?? []) work.push(k)
      // Notes rattachées à l'élément condamné.
      for (const node of nodes.value.values()) {
        if (isNote(node) && node.attachedTo === current) work.push(node.id)
      }
    }
    return doomed
  }

  // ── Sérialisation ────────────────────────────────────────────────────────
  function serialize(): ProjectDoc {
    return cloneDoc({
      meta: meta.value,
      site: { attrs: site.value.attrs },
      services: [...services.value],
      featureFields: [...featureFields.value],
      featureOptions: [...featureOptions.value],
      nodes: [...nodes.value.values()],
      edges: [...edges.value],
      comments: [...comments.value],
    }) as ProjectDoc
  }

  // ── Cœur transactionnel : mute + horodate + enregistre l'historique ───────
  function commit(mutate: () => void, coalesce?: string, label?: string): void {
    const before = serialize()
    mutate()
    meta.value.updatedAt = todayIso()
    graphVersion.value++
    dirty.value = true
    const after = serialize()
    useHistoryStore().record(before, after, coalesce, label)
  }

  /** Remplace l'état par un snapshot (undo/redo). Ne touche PAS l'historique. */
  function applySnapshot(doc: ProjectDoc): void {
    const clone = cloneDoc(doc)
    meta.value = clone.meta
    site.value = { attrs: clone.site.attrs }
    services.value = clone.services
    featureFields.value = clone.featureFields ?? []
    featureOptions.value = clone.featureOptions ?? []
    nodes.value = new Map(clone.nodes.map((n) => [n.id, n]))
    edges.value = clone.edges
    comments.value = clone.comments ?? []
    rebuildIndexes()
    graphVersion.value++
    dirty.value = true
  }

  /**
   * Applique un état reçu du temps réel (Y.Doc distant, jalon 6). Comme applySnapshot,
   * mais N'ENREGISTRE PAS d'historique et laisse `dirty=false` (la persistance est assurée
   * côté serveur par Hocuspocus). Bump `graphVersion` pour la réactivité du canvas. Le
   * garde anti-echo (ne pas re-pousser cet état vers le Y.Doc) est géré par le pont collab.
   */
  function applyRemote(doc: ProjectDoc): void {
    const clone = cloneDoc(doc)
    meta.value = clone.meta
    site.value = { attrs: clone.site.attrs }
    services.value = clone.services
    featureFields.value = clone.featureFields ?? []
    featureOptions.value = clone.featureOptions ?? []
    nodes.value = new Map(clone.nodes.map((n) => [n.id, n]))
    edges.value = clone.edges
    comments.value = clone.comments ?? []
    rebuildIndexes()
    graphVersion.value++
    dirty.value = false
  }

  // ── Chargement / cycle de vie ─────────────────────────────────────────────
  /** Charge un document validé (ouverture fichier / nouveau projet). Réinitialise l'historique. */
  function load(doc: ProjectDoc): void {
    const clone = cloneDoc(doc)
    meta.value = clone.meta
    site.value = { attrs: clone.site.attrs }
    services.value = clone.services
    featureFields.value = clone.featureFields ?? []
    featureOptions.value = clone.featureOptions ?? []
    nodes.value = new Map(clone.nodes.map((n) => [n.id, n]))
    edges.value = clone.edges
    comments.value = clone.comments ?? []
    rebuildIndexes()
    graphVersion.value++
    dirty.value = false
    useHistoryStore().reset()
  }

  /** Repart d'un projet vierge. */
  function reset(name?: string): void {
    load(createEmptyProject(name))
  }

  /** Marque l'état comme sauvegardé (appelé par io/file après écriture). */
  function markSaved(): void {
    dirty.value = false
  }

  // ── Actions : nœuds ────────────────────────────────────────────────────────
  function addPage(input: CreatePageInput = {}): string {
    const node = createPage(input)
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter page')
    return node.id
  }

  /** Ajoute un bloc à une page. Position par défaut : en bas de la pile (y = n × pas). */
  function addBlock(
    pageId: string,
    blockType: BlockType = 'free',
    input: Omit<CreateBlockInput, 'parentId' | 'blockType'> = {},
  ): string {
    const count = orderedBlocksOf(pageId).length
    const node = createBlock({
      ...input,
      parentId: pageId,
      blockType,
      position: input.position ?? { x: 0, y: count * BLOCK_STEP },
    })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter bloc')
    return node.id
  }

  function addBehaviorNote(
    attachedTo: string,
    input: Omit<CreateBehaviorNoteInput, 'attachedTo'> = {},
  ): string {
    const node = createBehaviorNote({ ...input, attachedTo })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter note comportement')
    return node.id
  }

  function addApiNote(
    attachedTo: string,
    serviceId: string,
    endpoint: { method: string; path: string } = { method: '', path: '' },
    input: Omit<CreateApiNoteInput, 'attachedTo' | 'serviceId' | 'method' | 'path'> = {},
  ): string {
    const node = createApiNote({
      ...input,
      attachedTo,
      serviceId,
      method: endpoint.method,
      path: endpoint.path,
    })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter note API')
    return node.id
  }

  // ── Actions : couche fonctionnelle (module / fonctionnalité) ─────────────────
  /** Ajoute un module (frame racine de la couche fonctionnelle). */
  function addModule(input: CreateModuleInput = {}): string {
    const node = createModule(input)
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter module')
    return node.id
  }

  /**
   * Ajoute une fonctionnalité. `parentId` = un module (ou null pour une fonctionnalité racine,
   * ex. socle/transverse). Position par défaut : décalée sous les fonctionnalités déjà présentes.
   */
  function addFeature(
    parentId: string | null = null,
    input: Omit<CreateFeatureInput, 'parentId'> = {},
  ): string {
    const siblings = (childrenIndex.value.get(parentId) ?? []).filter((cid) => {
      const c = nodes.value.get(cid)
      return c != null && c.type === 'feature'
    }).length
    // Empilement vertical dans le module : `position.y` = ordre (× pas), comme les blocs dans une
    // page. Coord relative au module quand il y en a un ; sinon monde (fonctionnalité racine).
    const node = createFeature({
      ...input,
      parentId,
      position: input.position ?? { x: 0, y: siblings * FEATURE_STEP },
    })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter fonctionnalité')
    return node.id
  }

  /**
   * Déplace une fonctionnalité vers un autre module (ou en racine, `newParentId = null`) à la
   * `position` donnée (relative au contenu du module cible, ou monde si racine). Met à jour les index.
   */
  function reparentFeature(id: string, newParentId: string | null, position: Position): void {
    const feat = nodes.value.get(id)
    if (!feat || !isFeature(feat)) return
    commit(() => {
      nodes.value.set(id, { ...feat, parentId: newParentId, position: { ...position } })
      rebuildIndexes()
    }, undefined, 'Déplacer fonctionnalité')
  }

  /**
   * Réorganise la couche fonctionnelle en normalisant TOUTES les positions stockées sur le layout
   * dérivé (featureTree) : chaque module = ARBRE DE DÉPENDANCES (rangées = niveaux des arêtes
   * « dépend de » intra-module, ordre horizontal préservé par clé x), et les MODULES eux-mêmes en
   * rangées auto sans chevauchement (appartenance par recouvrement vertical des clés, ordre par x,
   * espacement MODULE_GAP). `measuredHeight` (optionnel, fourni par le canvas) donne la hauteur
   * RÉELLE d'une carte déjà rendue ; à défaut on retombe sur le plancher estimé (cardMetrics).
   */
  function arrangeFunctional(measuredHeight?: (id: string) => number | undefined): void {
    const mods = [...nodes.value.values()].filter(isModule)
    if (!mods.length) return
    // Arêtes « dépend de » fonctionnalité→fonctionnalité (l'arbre de chaque module s'y taille).
    const isFeat = (id: string): boolean => {
      const n = nodes.value.get(id)
      return n != null && isFeature(n)
    }
    const deps: TreeDep[] = edges.value
      .filter((e) => e.type === 'dependsOn' && isFeat(e.source) && isFeat(e.target))
      .map((e) => ({ source: e.source, target: e.target }))
    commit(() => {
      // Passe 1 : arbre + taille auto de chaque module.
      const modItems: ModuleItem[] = []
      const trees = new Map<string, ReturnType<typeof treeLayout>>()
      for (const m of mods) {
        const feats = (childrenIndex.value.get(m.id) ?? [])
          .map((cid) => nodes.value.get(cid))
          .filter((n): n is FeatureNode => n != null && isFeature(n))
        const items: TreeItem[] = feats.map((f) => {
          const estimated = estimateFeatureCard(
            f,
            realizersOfFeature(f.id).length,
            featureFields.value.length,
          ).height
          return {
            id: f.id,
            h: Math.max(estimated, measuredHeight?.(f.id) ?? 0),
            orderX: f.position.x,
            orderY: f.position.y,
          }
        })
        const { intra, hasExternalDep } = splitFeatureDeps(new Set(items.map((i) => i.id)), deps)
        const tl = treeLayout(items, intra, hasExternalDep, FEATURE_CARD_WIDTH, FEATURE_CARD_GAP)
        trees.set(m.id, tl)
        const sz = moduleAutoSize(tl, m.attrs.width ?? 0, m.attrs.height ?? 0)
        modItems.push({ id: m.id, w: sz.w, h: sz.h, orderX: m.position.x, orderY: m.position.y })
      }
      // Passe 2 : rangées de modules + écriture des positions normalisées.
      const { pos } = moduleRowsLayout(modItems)
      for (const m of mods) {
        const p = pos.get(m.id)
        if (p) nodes.value.set(m.id, { ...m, position: { x: p.x, y: p.y } })
        const tl = trees.get(m.id)
        if (!tl) continue
        for (const [fid, r] of tl.rects) {
          const f = nodes.value.get(fid)
          if (f) nodes.value.set(fid, { ...f, position: { x: r.x, y: r.y } })
        }
      }
    }, undefined, 'Réorganiser')
  }

  function updateAttrs(id: string, patch: AttrsPatch, coalesce?: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    const nextAttrs = { ...node.attrs, ...patch }
    // No-op guard : ne pas créer d'entrée d'historique fantôme (attrs = JSON par contrat).
    if (JSON.stringify(node.attrs) === JSON.stringify(nextAttrs)) return
    commit(() => {
      const next = { ...node, attrs: nextAttrs } as FlooowNode
      nodes.value.set(id, next)
    }, coalesce)
  }

  function moveNode(id: string, position: Position, coalesce?: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    commit(() => nodes.value.set(id, { ...node, position: { ...position } }), coalesce, 'Déplacer')
  }

  /** Réordonne un bloc dans sa page à l'index cible (reflow des y de la pile). */
  function reorderBlock(blockId: string, toIndex: number): void {
    const block = nodes.value.get(blockId)
    if (!block || !isBlock(block)) return
    const pageId = block.parentId
    const ordered = orderedBlocksOf(pageId)
    const from = ordered.findIndex((b) => b.id === blockId)
    if (from === -1) return
    const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1))
    if (from === clamped) return
    const next = [...ordered]
    next.splice(clamped, 0, next.splice(from, 1)[0] as BlockNode)
    commit(() => {
      next.forEach((b, i) => {
        nodes.value.set(b.id, { ...b, position: { ...b.position, y: i * BLOCK_STEP } })
      })
    }, undefined, 'Réordonner bloc')
  }

  /**
   * Déplace un bloc dans une autre page (reparent restreint aux pages), à l'index demandé —
   * `toIndex` absent = fin de pile (comportement historique). Les blocs de la page cible sont
   * renumérotés autour du trou : leurs `y` ne sont que des CLÉS D'ORDRE, l'autolayout re-empile.
   */
  function reparentBlock(blockId: string, pageId: string, toIndex?: number): void {
    const block = nodes.value.get(blockId)
    const page = nodes.value.get(pageId)
    if (!block || !isBlock(block) || !page || !isPage(page)) return
    commit(() => {
      const ordered = orderedBlocksOf(pageId)
      const clamped = Math.max(0, Math.min(toIndex ?? ordered.length, ordered.length))
      ordered.forEach((b, i) => {
        const slot = i >= clamped ? i + 1 : i
        nodes.value.set(b.id, { ...b, position: { ...b.position, y: slot * BLOCK_STEP } })
      })
      nodes.value.set(blockId, {
        ...block,
        parentId: pageId,
        position: { x: 0, y: clamped * BLOCK_STEP },
      })
      rebuildIndexes()
    }, undefined, 'Déplacer bloc')
  }

  /**
   * Déplace une page dans l'arbre (v12) : sous une autre page (`newParentId`), ou en RACINE d'un
   * nouvel arbre (`null`). Dans les deux cas `position.x` n'est qu'une CLÉ D'ORDRE — entre frères,
   * ou entre arbres pour une racine (placement 100 % dérivé, pageTree.ts). Refuse un rattachement
   * cyclique (page sous sa propre descendance) : le geste est ignoré plutôt que de produire l'arbre
   * que l'invariant PARENT_CYCLE rejetterait ensuite.
   */
  function reparentPage(id: string, newParentId: string | null, position: Position): void {
    const page = nodes.value.get(id)
    if (!page || !isPage(page)) return
    if (newParentId != null) {
      const parent = nodes.value.get(newParentId)
      if (!parent || !isPage(parent) || newParentId === id) return
      // Remonter depuis le parent visé : croiser `id` = rattachement sous sa propre descendance.
      let cur: FlooowNode | undefined = parent
      const seen = new Set<string>()
      while (cur && isPage(cur) && !seen.has(cur.id)) {
        if (cur.id === id || cur.parentId === id) return
        seen.add(cur.id)
        cur = cur.parentId != null ? nodes.value.get(cur.parentId) : undefined
      }
    }
    if (page.parentId === newParentId && page.position.x === position.x && page.position.y === position.y) return
    commit(() => {
      nodes.value.set(id, { ...page, parentId: newParentId, position: { ...position } })
      rebuildIndexes()
    }, undefined, 'Déplacer page')
  }

  /** Rattache une note à une autre cible (page ou bloc). */
  function attachNote(noteId: string, targetId: string): void {
    const note = nodes.value.get(noteId)
    if (!note || !isNote(note)) return
    commit(() => {
      nodes.value.set(noteId, { ...note, attachedTo: targetId } as NoteNode)
      rebuildIndexes()
    }, undefined, 'Rattacher note')
  }

  /** Change le type d'un bloc. */
  function setBlockType(blockId: string, blockType: BlockType): void {
    const block = nodes.value.get(blockId)
    if (!block || !isBlock(block)) return
    commit(() => {
      nodes.value.set(blockId, { ...block, attrs: { ...block.attrs, blockType } })
    }, undefined, 'Changer type de bloc')
  }

  /** Assigne un lot (null = ré-hériter). */
  function assignLot(id: string, lot: number | null): void {
    const node = nodes.value.get(id)
    if (!node) return
    commit(() => nodes.value.set(id, { ...node, lot }), undefined, 'Assigner lot')
  }

  /**
   * Supprime un nœud + ses descendants (blocs) + notes rattachées + arêtes incidentes +
   * commentaires ancrés (cascade).
   */
  function removeNode(id: string): void {
    if (!nodes.value.has(id)) return
    commit(() => {
      const doomed = cascadeIds(id)
      for (const rid of doomed) nodes.value.delete(rid)
      edges.value = edges.value.filter((e) => !doomed.has(e.source) && !doomed.has(e.target))
      comments.value = comments.value.filter((c) => !doomed.has(c.anchor.nodeId))
      if (meta.value.homePageId && doomed.has(meta.value.homePageId)) meta.value.homePageId = null
      rebuildIndexes()
    }, undefined, 'Supprimer')
  }

  // ── Actions : arêtes ────────────────────────────────────────────────────────
  function addEdge(input: CreateEdgeInput): string {
    const edge = createEdge(input)
    commit(() => {
      edges.value = [...edges.value, edge]
    }, undefined, 'Relier')
    return edge.id
  }

  function removeEdge(id: string): void {
    if (!edges.value.some((e) => e.id === id)) return
    commit(() => {
      edges.value = edges.value.filter((e) => e.id !== id)
    }, undefined, 'Supprimer lien')
  }

  // ── Actions : pont « réalisé par » (cadrage-par-fonctionnalite.md §2) ────────
  /**
   * Relie une fonctionnalité (source) à une page/bloc (cible) qui la réalise. Refuse les extrémités
   * invalides (invariant REALIZES_TARGET) et les doublons. Renvoie l'id de l'arête, ou null.
   */
  function addRealizedBy(featureId: string, targetId: string): string | null {
    const feature = nodes.value.get(featureId)
    const target = nodes.value.get(targetId)
    if (!feature || !isFeature(feature)) return null
    if (!target || !(isPage(target) || isBlock(target))) return null
    if (realizationEdge(featureId, targetId, edges.value)) return null
    const edge = createEdge({ type: 'realizedBy', source: featureId, target: targetId })
    commit(() => {
      edges.value = [...edges.value, edge]
    }, undefined, 'Réalisé par')
    return edge.id
  }

  /** Retire le lien « réalisé par » entre une fonctionnalité et une cible. */
  function removeRealizedBy(featureId: string, targetId: string): void {
    const edge = realizationEdge(featureId, targetId, edges.value)
    if (!edge) return
    commit(() => {
      edges.value = edges.value.filter((e) => e.id !== edge.id)
    }, undefined, 'Retirer réalisé par')
  }

  // ── Actions : commentaires (v13, plan-refonte-notes-commentaires.md) ────────
  /**
   * Ancre un commentaire sur une page ou un bloc (option `range` = passage du contenu riche).
   * Refuse une ancre qui ne pointe pas un frame page/bloc existant : l'ancre est OBLIGATOIRE
   * (pas de commentaire flottant), autant l'imposer à la création plutôt que d'attendre les
   * invariants. Renvoie l'id du commentaire, ou null.
   */
  function addComment(input: CreateCommentInput): string | null {
    const target = nodes.value.get(input.anchor.nodeId)
    if (!target || !(isPage(target) || isBlock(target))) return null
    // Un fil « pour Claude » ne se crée que membre Pilot'in (le serveur bloque déjà l'écriture du
    // rôle client — ceinture ET bretelles, la restriction est une exigence explicite).
    if (input.forClaude && useSessionStore().role === 'client') return null
    const comment = createComment(input)
    commit(() => {
      comments.value = [...comments.value, comment]
    }, undefined, 'Commenter')
    return comment.id
  }

  /** Ajoute une réponse au fil. Renvoie l'id de la réponse, ou null si le fil n'existe pas. */
  function replyToComment(commentId: string, body: RichDoc, author: string): string | null {
    const comment = comments.value.find((c) => c.id === commentId)
    if (!comment) return null
    const reply = createCommentReply({ body, author })
    commit(() => {
      comments.value = comments.value.map((c) =>
        c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c,
      )
    }, undefined, 'Répondre')
    return reply.id
  }

  /** Résout / rouvre un fil. */
  function resolveComment(id: string, resolved = true): void {
    const comment = comments.value.find((c) => c.id === id)
    if (!comment || comment.resolved === resolved) return
    commit(() => {
      comments.value = comments.value.map((c) => (c.id === id ? { ...c, resolved } : c))
    }, undefined, resolved ? 'Résoudre' : 'Rouvrir')
  }

  /** Pose ou retire (null) le tag custom du fil. Les réponses n'en portent pas. */
  function setCommentTag(id: string, tag: CommentTag | null): void {
    if (!comments.value.some((c) => c.id === id)) return
    commit(() => {
      comments.value = comments.value.map((c) => {
        if (c.id !== id) return c
        const { tag: _dropped, ...rest } = c
        return tag ? { ...rest, tag } : rest
      })
    }, undefined, 'Taguer commentaire')
  }

  /**
   * Adresse (ou désadresse) un fil à Claude — membres Pilot'in uniquement : un client ne voit ni
   * ne crée ces fils, il ne peut donc pas non plus les marquer.
   */
  function setCommentForClaude(id: string, forClaude: boolean): void {
    if (useSessionStore().role === 'client') return
    if (!comments.value.some((c) => c.id === id)) return
    commit(() => {
      comments.value = comments.value.map((c) => {
        if (c.id !== id) return c
        const { forClaude: _dropped, ...rest } = c
        return forClaude ? { ...rest, forClaude: true } : rest
      })
    }, undefined, forClaude ? 'Adresser à Claude' : 'Retirer de Claude')
  }

  /** Réécrit le corps du fil (coalescé par fil : une frappe continue = une entrée d'historique). */
  function updateCommentBody(id: string, body: RichDoc): void {
    if (!comments.value.some((c) => c.id === id)) return
    commit(() => {
      comments.value = comments.value.map((c) => (c.id === id ? { ...c, body } : c))
    }, `comment:${id}`, 'Modifier commentaire')
  }

  /** Réécrit le corps d'une réponse (même coalescence, par réponse). */
  function updateReplyBody(commentId: string, replyId: string, body: RichDoc): void {
    const comment = comments.value.find((c) => c.id === commentId)
    if (!comment || !comment.replies.some((r) => r.id === replyId)) return
    commit(() => {
      comments.value = comments.value.map((c) =>
        c.id === commentId
          ? { ...c, replies: c.replies.map((r) => (r.id === replyId ? { ...r, body } : r)) }
          : c,
      )
    }, `comment:${commentId}:${replyId}`, 'Modifier réponse')
  }

  /** Repositionne l'ancre du fil (re-ancrage d'un passage après édition du texte). */
  function setCommentAnchor(id: string, anchor: CommentAnchor): void {
    if (!comments.value.some((c) => c.id === id)) return
    commit(() => {
      comments.value = comments.value.map((c) => (c.id === id ? { ...c, anchor } : c))
    }, `comment-anchor:${id}`, 'Déplacer commentaire')
  }

  /** Supprime le fil entier (réponses comprises). */
  function removeComment(id: string): void {
    if (!comments.value.some((c) => c.id === id)) return
    commit(() => {
      comments.value = comments.value.filter((c) => c.id !== id)
    }, undefined, 'Supprimer commentaire')
  }

  /** Supprime une réponse d'un fil. */
  function removeCommentReply(commentId: string, replyId: string): void {
    const comment = comments.value.find((c) => c.id === commentId)
    if (!comment || !comment.replies.some((r) => r.id === replyId)) return
    commit(() => {
      comments.value = comments.value.map((c) =>
        c.id === commentId ? { ...c, replies: c.replies.filter((r) => r.id !== replyId) } : c,
      )
    }, undefined, 'Supprimer réponse')
  }

  function setEdgeType(id: string, type: EdgeType): void {
    const edge = edges.value.find((e) => e.id === id)
    if (!edge || edge.type === type) return
    commit(() => {
      edges.value = edges.value.map((e) => (e.id === id ? { ...e, type } : e))
    }, undefined, 'Changer type de lien')
  }

  // ── Actions : mode de rendu d'arête (evolution-v2.md §8, révisé) ──────────────
  /**
   * Fixe le mode de rendu d'une arête ('line' = trait continu, 'portal' = pastilles off-page).
   * Purement visuel : n'affecte ni le comptage ni l'arborescence dérivée. 'line' retire la clé.
   */
  /** Applique un mode de rendu à une arête (attrs.render). `manual` pose le verrou renderManual. */
  function applyRender(
    e: FlooowEdge,
    mode: EdgeRender,
    initPositions?: { source: Position; target: Position },
    manual = false,
  ): FlooowEdge {
    const attrs = { ...e.attrs }
    if (mode === 'line') delete attrs.render
    else {
      attrs.render = mode
      // Auto-placement des pastilles à la conversion, si le géomètre (canvas) en fournit.
      if (!attrs.portalPositions && initPositions) {
        attrs.portalPositions = {
          source: { ...initPositions.source },
          target: { ...initPositions.target },
        }
      }
    }
    if (manual) attrs.renderManual = true
    return { ...e, attrs }
  }

  function setEdgeRender(
    edgeId: string,
    mode: EdgeRender,
    initPositions?: { source: Position; target: Position },
    manual = false,
  ): void {
    const edge = edges.value.find((e) => e.id === edgeId)
    if (!edge) return
    const current = edge.attrs.render ?? 'line'
    if (current === mode && (!manual || edge.attrs.renderManual)) return
    commit(() => {
      edges.value = edges.value.map((e) =>
        e.id === edgeId ? applyRender(e, mode, initPositions, manual) : e,
      )
    }, undefined, 'Mode de rendu')
  }

  /** Bascule MANUELLE ligne↔portail : pose le verrou renderManual (l'auto ne réécrira plus). */
  function toggleEdgeRender(
    edgeId: string,
    initPositions?: { source: Position; target: Position },
  ): void {
    const edge = edges.value.find((e) => e.id === edgeId)
    if (!edge) return
    setEdgeRender(
      edgeId,
      (edge.attrs.render ?? 'line') === 'portal' ? 'line' : 'portal',
      initPositions,
      true,
    )
  }

  /**
   * Ré-évaluation AUTOMATIQUE (création / déplacement) : applique en UN commit les modes calculés
   * par le canvas, en IGNORANT les arêtes verrouillées (renderManual) et celles déjà au bon mode.
   */
  function autoSetRenders(
    updates: {
      edgeId: string
      mode: EdgeRender
      initPositions?: { source: Position; target: Position }
    }[],
  ): void {
    const byId = new Map(updates.map((u) => [u.edgeId, u]))
    let changed = false
    const next = edges.value.map((e) => {
      const u = byId.get(e.id)
      if (!u || e.attrs.renderManual) return e
      if ((e.attrs.render ?? 'line') === u.mode) return e
      changed = true
      return applyRender(e, u.mode, u.initPositions, false)
    })
    if (!changed) return
    commit(() => {
      edges.value = next
    }, undefined, 'Portails auto')
  }

  /**
   * Place l'un des deux nœuds portail d'une arête (au drop d'un drag). `fallback` sème l'autre
   * extrémité si `portalPositions` était absent (fichier sans positions) — le canvas fournit le
   * défaut géométrique ; à défaut, l'autre bout part de `pos`.
   */
  function setPortalPosition(
    edgeId: string,
    end: 'source' | 'target',
    pos: Position,
    fallback?: { source: Position; target: Position },
  ): void {
    const edge = edges.value.find((e) => e.id === edgeId)
    if (!edge) return
    const seed = edge.attrs.portalPositions ??
      fallback ?? { source: { ...pos }, target: { ...pos } }
    const next = {
      source: { ...seed.source },
      target: { ...seed.target },
    }
    next[end] = { x: pos.x, y: pos.y }
    commit(() => {
      edges.value = edges.value.map((e) =>
        e.id === edgeId ? { ...e, attrs: { ...e.attrs, portalPositions: next } } : e,
      )
    }, undefined, 'Placer portail')
  }


  // ── Actions : services (registre) ────────────────────────────────────────────
  function addService(input: CreateServiceInput = {}): string {
    const svc = createService(input)
    commit(() => {
      services.value = [...services.value, svc]
    }, undefined, 'Ajouter service')
    return svc.id
  }

  function updateService(id: string, patch: Partial<Omit<Service, 'id'>>): void {
    const svc = services.value.find((s) => s.id === id)
    if (!svc) return
    const next = { ...svc, ...patch }
    if (JSON.stringify(svc) === JSON.stringify(next)) return
    commit(() => {
      services.value = services.value.map((s) => (s.id === id ? next : s))
    }, undefined, 'Modifier service')
  }

  function removeService(id: string): void {
    if (!services.value.some((s) => s.id === id)) return
    commit(() => {
      services.value = services.value.filter((s) => s.id !== id)
    }, undefined, 'Supprimer service')
  }

  // ── Actions : champs de fonctionnalité (listes d'options globales, v7) ───────

  /** Renomme le LIBELLÉ d'un champ (le wording du sélecteur, global au projet). */
  function renameFeatureField(fieldId: string, label: string): void {
    const field = featureFields.value.find((f) => f.id === fieldId)
    if (!field || field.label === label) return
    commit(() => {
      featureFields.value = featureFields.value.map((f) => (f.id === fieldId ? { ...f, label } : f))
    }, `field-label:${fieldId}`, 'Renommer le champ')
  }

  /**
   * Ajoute une option à un champ. Le nom est normalisé (trim) ; un nom vide est ignoré et un
   * DOUBLON (comparaison insensible à la casse) renvoie l'option existante au lieu d'en créer
   * une seconde — l'input « ajouter un item » est saisi à la volée, les doublons y sont la norme.
   * @returns l'id de l'option (créée ou déjà présente), ou null si le nom est vide.
   */
  function addFeatureOption(fieldId: string, name: string): string | null {
    const clean = name.trim()
    if (!clean) return null
    if (!featureFields.value.some((f) => f.id === fieldId)) return null
    const existing = featureOptions.value.find(
      (o) => o.fieldId === fieldId && o.name.toLowerCase() === clean.toLowerCase(),
    )
    if (existing) return existing.id
    const option: FeatureOption = { id: genId(), fieldId, name: clean }
    commit(() => {
      featureOptions.value = [...featureOptions.value, option]
    }, undefined, 'Ajouter une option')
    return option.id
  }

  function renameFeatureOption(optionId: string, name: string): void {
    const clean = name.trim()
    const option = featureOptions.value.find((o) => o.id === optionId)
    if (!clean || !option || option.name === clean) return
    commit(() => {
      featureOptions.value = featureOptions.value.map((o) =>
        o.id === optionId ? { ...o, name: clean } : o,
      )
    }, `option-name:${optionId}`, 'Renommer l’option')
  }

  /** Nombre de fonctionnalités qui référencent cette option (0 = suppression sûre). */
  function optionUsageCount(optionId: string): number {
    let n = 0
    for (const node of nodes.value.values()) {
      if (!isFeature(node)) continue
      if (Object.values(node.attrs.fieldValues).includes(optionId)) n++
    }
    return n
  }

  /**
   * Supprime une option — REFUSÉE tant qu'une fonctionnalité la référence, pour ne jamais
   * délier de données en silence (l'appelant affiche le nombre d'usages via optionUsageCount).
   * @returns false si l'option est encore utilisée (rien n'est supprimé).
   */
  function removeFeatureOption(optionId: string): boolean {
    if (!featureOptions.value.some((o) => o.id === optionId)) return false
    if (optionUsageCount(optionId) > 0) return false
    commit(() => {
      featureOptions.value = featureOptions.value.filter((o) => o.id !== optionId)
    }, undefined, 'Supprimer l’option')
    return true
  }

  /**
   * Fixe la valeur d'un champ sur une fonctionnalité (null = aucune).
   * Action dédiée plutôt qu'un `updateAttrs({ fieldValues })` : ce dernier fait un spread de
   * SURFACE, qui remplacerait tout l'objet `fieldValues` au lieu de fusionner le seul champ visé.
   */
  function setFeatureFieldValue(featureId: string, fieldId: string, optionId: string | null): void {
    const node = nodes.value.get(featureId)
    if (!node || !isFeature(node)) return
    updateAttrs(featureId, { fieldValues: { ...node.attrs.fieldValues, [fieldId]: optionId } })
  }

  // ── Actions : cycle de vie de la fonctionnalité (v10) ─────────────────────
  // Le GATE de bascule (confirmation si checklist cadrage incomplète au franchissement
  // cadrage → dev) vit dans l'UI (crossesToDev + confirm) : le store ne bloque jamais.
  function setFeatureStatus(featureId: string, status: FeatureStatus): void {
    const node = nodes.value.get(featureId)
    if (!node || !isFeature(node)) return
    updateAttrs(featureId, { status })
  }

  /** Ajoute une étape à la checklist (saisie libre, taguée par phase). Renvoie son id. */
  function addChecklistItem(featureId: string, label: string, phase: LifecyclePhase): string | null {
    const node = nodes.value.get(featureId)
    if (!node || !isFeature(node)) return null
    const trimmed = label.trim()
    if (!trimmed) return null
    const item: ChecklistItem = { id: genId(), label: trimmed, done: false, phase }
    updateAttrs(featureId, { checklist: [...node.attrs.checklist, item] })
    return item.id
  }

  function toggleChecklistItem(featureId: string, itemId: string): void {
    const node = nodes.value.get(featureId)
    if (!node || !isFeature(node)) return
    updateAttrs(featureId, {
      checklist: node.attrs.checklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
    })
  }

  function renameChecklistItem(featureId: string, itemId: string, label: string): void {
    const node = nodes.value.get(featureId)
    if (!node || !isFeature(node)) return
    const trimmed = label.trim()
    if (!trimmed) return
    updateAttrs(featureId, {
      checklist: node.attrs.checklist.map((i) => (i.id === itemId ? { ...i, label: trimmed } : i)),
    })
  }

  function removeChecklistItem(featureId: string, itemId: string): void {
    const node = nodes.value.get(featureId)
    if (!node || !isFeature(node)) return
    updateAttrs(featureId, { checklist: node.attrs.checklist.filter((i) => i.id !== itemId) })
  }

  // ── Actions : méta ────────────────────────────────────────────────────────
  function setHomePage(id: string | null): void {
    commit(() => {
      meta.value.homePageId = id
    }, undefined, 'Page d’accueil')
  }

  function updateMeta(patch: Partial<Omit<ProjectMeta, 'formatVersion'>>): void {
    commit(() => {
      meta.value = { ...meta.value, ...patch, formatVersion: CURRENT_FORMAT_VERSION }
    }, 'meta', 'Métadonnées')
  }

  /** Édite le contexte transversal du site (description, contraintes globales, notes). */
  function updateSite(patch: Partial<SiteAttrs>): void {
    const next = { ...site.value.attrs, ...patch }
    if (JSON.stringify(site.value.attrs) === JSON.stringify(next)) return
    commit(() => {
      site.value = { attrs: next }
    }, 'site', 'Contexte projet')
  }

  // ── Getters de base ────────────────────────────────────────────────────────
  const allNodes = computed<FlooowNode[]>(() => [...nodes.value.values()])
  const pages = computed<PageNode[]>(() => allNodes.value.filter(isPage))
  const blocks = computed<BlockNode[]>(() => allNodes.value.filter(isBlock))
  const modules = computed<ModuleNode[]>(() => allNodes.value.filter(isModule))
  const features = computed<FeatureNode[]>(() => allNodes.value.filter(isFeature))

  /**
   * Arbre de déblocage (cycle-de-vie-fonctionnalite.md) : état DÉRIVÉ des statuts + arêtes
   * dependsOn — terminée / débloquée (ferme, souple, frontière) / bloquée (+ deps écartées).
   * Purement visuel : rien n'écrit jamais un statut automatiquement.
   */
  const featureUnlocks = computed<Map<string, FeatureUnlock>>(() => {
    const statusById = new Map(features.value.map((f) => [f.id, f.attrs.status]))
    return computeUnlocks(statusById, edges.value.filter((e) => e.type === 'dependsOn'))
  })
  function unlockOf(id: string): FeatureUnlock | undefined {
    return featureUnlocks.value.get(id)
  }
  const behaviorNotes = computed<BehaviorNote[]>(() => allNodes.value.filter(isBehaviorNote))
  const apiNotes = computed<ApiNote[]>(() => allNodes.value.filter(isApiNote))
  const notes = computed<NoteNode[]>(() => allNodes.value.filter(isNote))
  const doc = computed<ProjectDoc>(() => serialize())

  function nodeById(id: string): FlooowNode | undefined {
    return nodes.value.get(id)
  }

  /**
   * Route absolue d'une page (v12) : recomposée depuis les slugs de ses ancêtres, jamais stockée.
   * Point d'accès UNIQUE de l'app — toute vue qui affiche une route passe par ici, sans quoi
   * certaines montreraient le segment nu et d'autres la route complète.
   */
  function routeOf(pageId: string): string {
    return fullRouteOf(pageId, nodes.value)
  }

  function serviceById(id: string): Service | undefined {
    return services.value.find((s) => s.id === id)
  }

  /** Champs de fonctionnalité dans leur ordre d'affichage (l'ordre du tableau n'est pas garanti). */
  const orderedFeatureFields = computed<FeatureField[]>(() =>
    [...featureFields.value].sort((a, b) => a.order - b.order),
  )

  function featureFieldById(id: string): FeatureField | undefined {
    return featureFields.value.find((f) => f.id === id)
  }

  function featureOptionById(id: string): FeatureOption | undefined {
    return featureOptions.value.find((o) => o.id === id)
  }

  /** Options d'un champ, dans leur ordre d'ajout. */
  function optionsOfField(fieldId: string): FeatureOption[] {
    return featureOptions.value.filter((o) => o.fieldId === fieldId)
  }

  /**
   * Libellé à afficher pour la valeur d'un champ sur une fonctionnalité (null = aucune valeur).
   * Source UNIQUE : remplace les 6 copies de `PERIMETER_LABELS` qui existaient avant la v7.
   */
  function featureFieldLabel(feature: FeatureNode, fieldId: string): string | null {
    const optionId = feature.attrs.fieldValues[fieldId]
    return optionId ? (featureOptionById(optionId)?.name ?? null) : null
  }

  function childrenOf(parentId: string | null): FlooowNode[] {
    const ids = childrenIndex.value.get(parentId) ?? []
    return ids.map((cid) => nodes.value.get(cid)).filter((n): n is FlooowNode => n != null)
  }

  // ── Getters délégués au domaine ───────────────────────────────────────────
  const orderedPages = computed<PageNode[]>(() => spatialOrder(pages.value))
  const orphans = computed<Set<string>>(() => orphanPages(doc.value))
  const apiView = computed(() => deriveApi(doc.value))
  const catalog = computed(() => deriveCatalog(doc.value))
  const estimate = computed(() => deriveEstimate(doc.value))
  const violations = computed(() => checkInvariants(doc.value))

  /** Blocs d'une page, ordonnés en pile (position.y). */
  function orderedBlocksOf(pageId: string | null): BlockNode[] {
    const kids = childrenOf(pageId).filter(isBlock)
    return verticalOrder(kids)
  }

  /** Notes rattachées à une cible, ordonnées verticalement. */
  function notesOf(targetId: string): NoteNode[] {
    return verticalOrder(attachedNotes(targetId, nodes.value))
  }

  // ── Commentaires (v13) ────────────────────────────────────────────────────
  /**
   * Commentaires VISIBLES pour l'utilisateur courant : les fils « pour Claude » sont réservés aux
   * membres Pilot'in (rôle collab `dev`/`marin`) — un `client` ne les voit NULLE PART (panneau,
   * compteurs, contours du canvas). Le serveur filtre aussi la lecture REST ; ici c'est le
   * masquage app, seul rempart possible sur le flux Y.Doc (CRDT partagé, non filtrable par pair).
   * `comments` (brut) reste la source de `serialize()` : masquer n'est pas retirer du document.
   */
  const visibleComments = computed<Comment[]>(() => {
    const session = useSessionStore()
    return session.role === 'client' ? comments.value.filter((c) => c.forClaude !== true) : comments.value
  })

  /** Index anchor.nodeId → fils VISIBLES ancrés (ordre d'ajout = ordre chronologique). */
  const commentsByNode = computed<CommentsIndex>(() => {
    const index: CommentsIndex = new Map()
    for (const comment of visibleComments.value) {
      const list = index.get(comment.anchor.nodeId)
      if (list) list.push(comment)
      else index.set(comment.anchor.nodeId, [comment])
    }
    return index
  })

  /** Fils ancrés sur un élément. */
  function commentsOf(nodeId: string): Comment[] {
    return commentsByNode.value.get(nodeId) ?? []
  }

  /**
   * Nombre de fils OUVERTS sur un élément ET ses descendants (page + ses blocs) : alimente le
   * compteur « 💬 n » de l'en-tête de page et le contour jaune du canvas.
   */
  function openCommentCountOf(id: string): number {
    let count = commentsOf(id).filter((c) => !c.resolved).length
    for (const kid of childrenIndex.value.get(id) ?? []) count += openCommentCountOf(kid)
    return count
  }

  /** Pages/blocs qui réalisent une fonctionnalité (pont realizedBy). */
  function realizersOfFeature(featureId: string): RealizationTarget[] {
    return realizersOf(featureId, edges.value, nodes.value)
  }

  /** Fonctionnalités réalisées par une page ou un bloc (pont realizedBy). */
  function featuresOfTarget(targetId: string): FeatureNode[] {
    return featuresRealizedBy(targetId, edges.value, nodes.value)
  }

  /** Couverture (réconciliation continue) : fonctionnalités orphelines + pages sans fonctionnalité. */
  const realizationCoverage = computed(() => coverage(doc.value))

  function lotOf(id: string): number {
    return resolveLot(id, nodes.value)
  }

  function lotProvenanceOf(id: string): ReturnType<typeof resolveLotProvenance> {
    return resolveLotProvenance(id, nodes.value)
  }

  function descendantsOf(frameId: string): FlooowNode[] {
    return descendants(frameId, childrenIndex.value, nodes.value)
  }

  function completenessOf(id: string): ReturnType<typeof completeness> {
    const node = nodes.value.get(id)
    if (!node) return { missing: [], complete: true }
    return completeness(node)
  }

  function specs(filter?: SpecsFilter): ReturnType<typeof deriveSpecs> {
    return deriveSpecs(doc.value, filter)
  }

  // Initialise sur un projet vierge.
  reset()

  return {
    // état
    meta,
    site,
    services,
    nodes,
    edges,
    comments,
    childrenIndex,
    attachedIndex,
    graphVersion,
    dirty,
    // getters de base
    allNodes,
    pages,
    blocks,
    modules,
    features,
    behaviorNotes,
    apiNotes,
    notes,
    doc,
    nodeById,
    routeOf,
    serviceById,
    childrenOf,
    // champs de fonctionnalité (listes d'options globales)
    featureFields,
    featureOptions,
    orderedFeatureFields,
    featureFieldById,
    featureOptionById,
    optionsOfField,
    featureFieldLabel,
    optionUsageCount,
    // getters domaine
    orderedPages,
    orphans,
    apiView,
    catalog,
    estimate,
    violations,
    orderedBlocksOf,
    notesOf,
    visibleComments,
    commentsByNode,
    commentsOf,
    openCommentCountOf,
    realizersOfFeature,
    featuresOfTarget,
    realizationCoverage,
    lotOf,
    lotProvenanceOf,
    descendantsOf,
    completenessOf,
    specs,
    featureUnlocks,
    unlockOf,
    // cycle de vie
    serialize,
    load,
    applySnapshot,
    applyRemote,
    reset,
    markSaved,
    // mutations : nœuds
    addPage,
    addBlock,
    addModule,
    addFeature,
    reparentFeature,
    arrangeFunctional,
    addBehaviorNote,
    addApiNote,
    updateAttrs,
    moveNode,
    reorderBlock,
    reparentBlock,
    reparentPage,
    attachNote,
    setBlockType,
    assignLot,
    removeNode,
    // mutations : arêtes
    addEdge,
    removeEdge,
    addRealizedBy,
    removeRealizedBy,
    // mutations : commentaires (v13)
    addComment,
    replyToComment,
    resolveComment,
    setCommentTag,
    setCommentForClaude,
    updateCommentBody,
    updateReplyBody,
    setCommentAnchor,
    removeComment,
    removeCommentReply,
    setEdgeType,
    setEdgeRender,
    toggleEdgeRender,
    autoSetRenders,
    setPortalPosition,
    // pages de notes (vue Notes)
    // mutations : services
    addService,
    updateService,
    removeService,
    // mutations : champs de fonctionnalité
    renameFeatureField,
    addFeatureOption,
    renameFeatureOption,
    removeFeatureOption,
    setFeatureFieldValue,
    // mutations : cycle de vie (v10)
    setFeatureStatus,
    addChecklistItem,
    toggleChecklistItem,
    renameChecklistItem,
    removeChecklistItem,
    // mutations : méta
    setHomePage,
    updateMeta,
    updateSite,
  }
})

/**
 * Id de sélection réservé pour le « Site » (contexte transversal). Le site n'est pas un nœud du
 * graphe : cette sentinelle permet de le sélectionner (ui.select) pour l'éditer dans le panneau de
 * propriétés, exactement comme une page ou un bloc.
 */
export const SITE_SELECTION_ID = '__site__'

// Synchronisation store ↔ Vue Flow (format v2 — evolution-v2.md §2/§3).
//
// Principe (performances.md §2) : on **mappe** le graphe du store vers des nœuds/arêtes Vue Flow —
// jamais de partage par référence. Pendant un drag, Vue Flow gère seul la position (état interne) ;
// le store n'est muté qu'au **drop** (`onNodeDragStop`) ou à la connexion (`onConnect`) : une seule
// mutation, un seul patch d'undo, un seul autosave.
//
// Géométrie v2 :
//   - Pages : rectangles à en-tête, largeur fixe, hauteur = pile de blocs. Position monde libre.
//   - Blocs : enfants Vue Flow de leur page (parentNode), pleine largeur, empilés (y = index×STEP).
//   - Commentaires (v13) : plus AUCUNE carte flottante — un élément commenté porte un contour
//     jaune contre-zoomé et le compteur « 💬 n » de l'en-tête de page ; la lecture vit dans le
//     panneau latéral (CommentsPanel). Tout le sous-système de notes (cartes, connecteurs de
//     proximité, layout latéral) a été retiré avec la refonte (plan-refonte-notes-commentaires.md).
import {
  ref,
  computed,
  watch,
  nextTick,
  onScopeDispose,
  toRaw,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue'
import {
  useVueFlow,
  MarkerType,
  type Connection,
  type Edge,
  type GraphNode,
  type Node,
  type NodeChange,
  type NodeDragEvent,
  type OnConnectStartParams,
} from '@vue-flow/core'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useTool } from '@/composables/useKeyboard'
import { useUiStore } from '@/stores/ui'
import type {
  BlockNode,
  BlockType,
  EdgeType,
  FeatureNode,
  FlooowEdge,
  FlooowNode,
  ModuleNode,
  PageNode,
  Position,
} from '@flooow/core/model/types'
import {
  isBlock,
  isFeature,
  isFrame,
  isModule,
  isPage,
  layerOf,
} from '@flooow/core/model/types'
import { pageOf } from '@flooow/core/domain/rollup'
import { childPages, pageChain } from '@flooow/core/domain/routes'
import {
  BLOCK_CARD_GAP,
  FEATURE_CARD_GAP,
  estimateBlockCard,
  estimateFeatureCard,
  cardHeight,
  cardHeightsVersion,
  type FeatureClamps,
} from './cardMetrics'
import {
  FEATURE_CARD_WIDTH,
  MODULE_CONTENT_TOP,
  MODULE_PAD_X,
  type TreeDep,
} from './featureTree'
import { lotColor } from '@/theme/tokens'
import { globalTreeLayout, type Container, type GlobalItem } from './globalTree'
import {
  TREE_RAIL_GAP,
  pageTreeLayout,
  type PageTreeItem,
  type PageTreeLayout,
  type PageTreeRect,
} from './pageTree'
import {
  readViewportMemo,
  viewportMemoApplies,
  viewportMemoKey,
  writeViewportMemo,
  type ViewportContext,
} from './viewportMemory'

// Ré-export pour compat (tokens centralisés).
export { LOT_COLORS, FACET_COLORS, RISK_COLORS, lotColor } from '@/theme/tokens'

// ── Géométrie du canvas (le modèle v2 ne porte plus de `size`) ────────────────
export const PAGE_WIDTH = 300
export const PAGE_HEADER_H = 46
export const PAGE_PAD_X = 12
export const PAGE_PAD_TOP = 12
export const PAGE_PAD_BOTTOM = 12
/** Décalage vertical du premier bloc sous l'en-tête. */
export const CONTENT_TOP = PAGE_HEADER_H + PAGE_PAD_TOP
/** Pas vertical entre deux blocs (miroir de factory.BLOCK_STEP). */
export const BLOCK_STEP = 120
export const BLOCK_WIDTH = PAGE_WIDTH - 2 * PAGE_PAD_X
// (NAV_ANCHOR_Y : SUPPRIMÉ en v13 — les ancres de navigation sont au MILIEU VERTICAL de la carte
// (`top: 50%` dans PageFrame.vue), plus au milieu de l'en-tête : avec les courbes en arrière-plan,
// l'ancre au header n'avait plus de raison d'être et le centre donne des courbes mieux réparties.)

// (Hauteur de page : voir pageAutoHeight dans le composable — pile réelle des blocs, plus de pas fixe.)

// ── Types de nœuds/arêtes Vue Flow (clés des slots #node-… / #edge-…) ─────────
export const NODE_TYPE = {
  page: 'page',
  block: 'block',
  /** Couche fonctionnelle : frame regroupant des fonctionnalités. */
  module: 'module',
  /** Couche fonctionnelle (vue plan, « Grouper par lot ») : bac englobant les modules d'un lot. */
  lot: 'lot',
  /** Couche fonctionnelle : nœud fonctionnalité (atome de cadrage). */
  feature: 'feature',
  /** Pastille portail synthétique (extrémité déplaçable d'une arête `render:'portal'`). */
  portal: 'portal',
} as const
export const EDGE_TYPE = {
  /** Arête manuelle typée (navigatesTo / dependsOn). */
  typed: 'typed',
  /**
   * Parenté de pages (v12) : arête SYNTHÉTIQUE dérivée de `parentId` — trait PLEIN orthogonal
   * (la structure), là où `navigatesTo` reste un lien de navigation transverse en pointillés.
   * Non interactive : la parenté se change au geste (drag) ou au panneau, pas en cliquant un trait.
   */
  tree: 'tree',
} as const

/** Préfixes d'id des nœuds portail synthétiques (extrémité source / cible). */
export const PORTAL_SRC_PREFIX = 'portal-src-'
export const PORTAL_TGT_PREFIX = 'portal-tgt-'

/**
 * z-index des arêtes : au-dessus de TOUS les nœuds. Sinon un lien touchant un bloc — contenu dans
 * une page au fond opaque — voit son origine et sa fin masquées par la page. La marge est large
 * (2000) : elle date de l'époque où Vue Flow élevait de +1000 le nœud sélectionné
 * (`elevateNodesOnSelect`, désactivé depuis dans FlowCanvas), on la garde comme garde-fou.
 */
export const EDGE_Z = 2000

// ── Données passées aux composants nœud (props.data) ──────────────────────────
export interface PageNodeData {
  node: PageNode
  lot: number
  lotColor: string
  blockCount: number
  /** Commentaires OUVERTS de la page ET de ses blocs (compteur « 💬 n » de l'en-tête, v13). */
  commentCount: number
  /** La page ELLE-MÊME porte ≥ 1 commentaire ouvert → contour jaune (les blocs ont le leur). */
  commented: boolean
  incomplete: boolean
  isHome: boolean
}
export interface BlockNodeData {
  node: BlockNode
  lot: number
  lotColor: string
  /** Commentaires ouverts ancrés sur le bloc (passages compris) — alimente les compteurs. */
  commentCount: number
  /**
   * Anneau « commenté » : ≥ 1 fil ouvert ancré sur le bloc ENTIER. Un fil ancré sur un PASSAGE
   * (anchor.range) n'encadre pas la carte — c'est le surlignage du texte cité qui le montre
   * (retour Hugo 22/07 : ne pas doubler le signal).
   */
  outlined: boolean
  incomplete: boolean
}
export interface TypedEdgeData {
  edgeType: EdgeType
  /** Distance d'éloignement du port avant de tourner (getSmoothStepPath). 0 = coude au ras du port
   *  (évite les S/demi-tours entre cartes proches en couche fonctionnelle). Défaut Vue Flow = 20. */
  offset?: number
  /** TEST : couleur dédiée d'une relation `dependsOn` (jamais 2× la même couleur sur une carte),
   *  pour mieux différencier/repérer les connexions. Prime sur la couleur de type dans TypedEdge. */
  color?: string
  // (`dim` : SUPPRIMÉ — l'estompage de chaîne est lu en direct via FUNC_HIGHLIGHT_KEY, comme
  // `navSoft` lit la sélection : cuit dans les data, il forçait un re-mappage complet du graphe à
  // chaque clic. Voir le watch de `ui.selectedIds` plus bas.)
}

// ── Couche fonctionnelle (module CONTIENT ses fonctionnalités, comme page → blocs) ────
// Géométrie des modules : source unique dans featureTree (partagée avec le store, sans cycle) —
// ré-exportée ici pour les composants (ModuleFrame, etc.).
export {
  MODULE_WIDTH,
  MODULE_HEADER_H,
  MODULE_PAD_X,
  MODULE_PAD_BOTTOM,
  MODULE_CONTENT_TOP,
} from './featureTree'
/** Pas vertical entre deux fonctionnalités empilées (miroir de factory.FEATURE_STEP). */
export const FEATURE_STEP = 236
/** Hauteur d'une carte fonctionnalité (fixe → empilement déterministe ; assez haute pour les champs). */
export const FEATURE_HEIGHT = 208
/** Largeur d'une carte fonctionnalité (inset dans le module — source featureTree). */
export const FEATURE_WIDTH = FEATURE_CARD_WIDTH

export interface ModuleNodeData {
  node: ModuleNode
  lot: number
  lotColor: string
  featureCount: number
  incomplete: boolean
  /**
   * VUE PAR MODULE : ce cadre est un module EXTERNE, réduit aux seules cartes qui touchent la page
   * courante. Même cadre, trois écarts de rendu seulement (trait discontinu, violet tiré vers le
   * neutre, titre en poids normal) — assez pour dire « ce module-là n'est pas la page courante »,
   * pas assez pour le faire lire comme un autre type d'objet.
   */
  satellite: boolean
}
/**
 * Bac de LOT : compartiment de premier rang de la vue plan. Purement DÉRIVÉ du layout — le lot n'est
 * pas un nœud du modèle mais une propriété des fonctionnalités —, d'où des données réduites au strict
 * nécessaire au dessin. Rien à éditer, rien à sélectionner.
 */
export interface LotFrameData {
  label: string
  color: string
}
/** Côté d'une carte fonctionnalité (port de lien « dépend de »). */
export type CardSide = 'top' | 'right' | 'bottom' | 'left'
/**
 * Un port de la carte fonctionnalité. Chaque lien occupe SON port (pas de superposition) ; un port
 * `free` par côté reste disponible pour un nouveau lien (quand on le relie, le recalcul en fait un
 * port occupé et un nouveau `free` réapparaît).
 *
 * Tous les ports sont au MILIEU de leur côté, et c'est volontairement la seule position possible :
 * un offset en pixels le long du côté (l'ancienne demi-largeur de carte) devait être recompensé de
 * la bordure et se serait retrouvé faux à la moindre variation de largeur, alors qu'un `50%` posé
 * sur la carte est juste par construction (cf. `handleStyle`, FeatureNode.vue).
 */
export interface FeatureHandle {
  id: string
  type: 'source' | 'target'
  side: CardSide
  free: boolean
  /** Seuls les ports LIBRES sont interactifs (démarrer/recevoir) → un lien = un port occupé figé. */
  connectable: boolean
}
// Ré-export pour compat : la définition vit dans cardMetrics (partagée avec le store).
export type { FeatureClamps } from './cardMetrics'
export interface FeatureNodeData {
  node: FeatureNode
  lot: number
  lotColor: string
  moduleName: string | null
  incomplete: boolean
  /** aucune page/bloc ne réalise cette fonctionnalité (pont realizedBy). */
  orphan: boolean
  handles: FeatureHandle[]
  clamps: FeatureClamps
  /** Bloquée : au moins un prérequis n'a pas atteint le seuil de déblocage (arbre de déblocage,
   *  `featureUnlocks`). Rendu grisé + cadenas quand `ui.dimBlocked` est actif. */
  blocked: boolean
  // (`chain` : SUPPRIMÉ — même raison que `TypedEdgeData.dim`, lu via FUNC_HIGHLIGHT_KEY.)
}

/** Données d'une pastille portail synthétique (extrémité déplaçable d'une arête `render:'portal'`). */
export interface PortalNodeData {
  /** Id de l'arête portail sous-jacente (store). */
  edgeId: string
  /** Extrémité représentée par cette pastille. */
  end: 'source' | 'target'
  /** Ancrage de la pastille dans son nœud à largeur fixe (gauche = côté droit page, droite = côté gauche). */
  align: 'left' | 'right'
  /** Libellé « → cible » (source) ou « ← source » (cible). */
  label: string
  /** Id de l'AUTRE extrémité (clic gauche → focus dessus). */
  other: string
  /** Pastille compacte (couche fonctionnelle) : plus petite et discrète. */
  compact?: boolean
}

/** Ouverture du popover d'arête depuis une pastille portail (fourni par FlowCanvas). */
export const EDGE_MENU_KEY: InjectionKey<
  (edgeId: string, clientX: number, clientY: number) => void
> = Symbol('flooow-edge-menu')

/** Badges d'ordre « #n » live pendant le drag d'un bloc (clé = id). Fournis par FlowCanvas. */
export const ORDER_BADGE_KEY: InjectionKey<Ref<Map<string, number>>> = Symbol('flooow-order-badge')

/**
 * Sélection partagée (collab) : id de nœud → couleurs des PAIRS qui le sélectionnent.
 * Fournie par FlowCanvas, lue par les node components (contour de la couleur du pair).
 */
export const PEER_SELECTION_KEY: InjectionKey<Ref<Map<string, string[]>>> =
  Symbol('flooow-peer-selection')

/**
 * Mise en avant de chaîne (sélection d'une fonctionnalité) : ensemble des ids éclairés, `null` si
 * aucune mise en avant. Fournie par FlowCanvas, lue EN DIRECT par FeatureNode (éclairé/estompé) et
 * TypedEdge (estompage). Injection réactive et non données de nœud : cuite dans les `data`, elle
 * imposait de re-mapper tout le graphe à chaque clic (0,3-0,7 s mesurés en baseline phase 0) pour
 * un état purement présentationnel — même arbitrage que `navSoft`, qui lit la sélection du store.
 */
export const FUNC_HIGHLIGHT_KEY: InjectionKey<ComputedRef<Set<string> | null>> =
  Symbol('flooow-func-highlight')

export type QuickCreateKind = 'page' | 'block' | 'feature'

/** Menu de quick-create au lâcher d'un lien dans le vide. */
export interface QuickCreateState {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
  sourceId: string
}
/** Popup de création de commentaire : élément visé + passage optionnel (bulle de texte). */
export interface CommentComposerState {
  nodeId: string
  range?: { from: number; to: number; text: string }
}
/** Menu contextuel (clic droit sur un nœud). */
export interface ContextMenuState {
  screenX: number
  screenY: number
  nodeId: string
}
/** Popover de changement de type d'arête (clic sur une arête typée). */
export interface EdgePopoverState {
  screenX: number
  screenY: number
  edgeId: string
  current: EdgeType
  choices: EdgeType[]
}

export interface CanvasSync {
  toFlowNodes: () => Node[]
  toFlowEdges: () => Edge[]
  /** Mise en avant de chaîne (sélection) — fournie sous FUNC_HIGHLIGHT_KEY par FlowCanvas. */
  funcHighlight: ComputedRef<Set<string> | null>
  orderBadges: Ref<Map<string, number>>
  /** Lignes de magnétisme (coordonnées MONDE) actives pendant le drag d'une page. */
  snapGuides: Ref<{ v: number[]; h: number[] }>
  dragGhost: Ref<{ x: number; y: number; w: number; h: number } | null>
  /** FANTÔME (monde) du drag de page (v13) : la place d'origine de la carte saisie, estompée. */
  pageGhost: Ref<{ x: number; y: number; w: number; h: number; label: string } | null>
  /** SLOT d'insertion (monde) du drag de page : l'emplacement où la carte s'installera au drop.
   *  `null` pendant le drag = emplacement interdit (le drop annule, la carte réintègre le fantôme). */
  pageSlot: Ref<{ x: number; y: number; w: number; h: number } | null>
  /** Drag de BLOC en cours : FlowCanvas active la transition d'écartement des autres blocs. */
  blockDragging: Ref<boolean>
  deleteSelection: () => void
  createPageAt: (position: { x: number; y: number }) => void
  /** « Réorganiser » avec les hauteurs réelles des cartes rendues (mesure Vue Flow). */
  arrangeFunctionalMeasured: () => void
  // Menus contextuels (état + actions, rendus par FlowCanvas)
  quickCreate: Ref<QuickCreateState | null>
  contextMenu: Ref<ContextMenuState | null>
  edgePopover: Ref<EdgePopoverState | null>
  closeMenus: () => void
  runQuickCreate: (kind: QuickCreateKind) => void
  contextDelete: () => void
  contextSetHome: () => void
  contextSetBlockType: (blockType: BlockType) => void
  /** « 💬 Commenter » du menu contextuel (v13) : ouvre la popup de création sur l'élément. */
  contextComment: () => void
  /** Popup de CRÉATION de commentaire ancrée à un élément (retour Hugo 22/07) : l'outil 💬, le
   *  menu contextuel et la bulle de sélection de texte la remplissent ; FlowCanvas la rend. */
  commentComposer: Ref<CommentComposerState | null>
  closeCommentComposer: () => void
  applyEdgeType: (type: EdgeType) => void
  deleteEdgeFromPopover: () => void
  /** Ouvre le popover d'arête à une position écran (clic droit sur une pastille portail). */
  openEdgeMenu: (edgeId: string, clientX: number, clientY: number) => void
}

export function useCanvasSync(): CanvasSync {
  const store = useProjectStore()
  const ui = useUiStore()
  const vf = useVueFlow()
  // Identité du projet ouvert = les params de route qui ouvrent la room collab (`folder/file`).
  const route = useRoute()
  const tool = useTool()

  const orderBadges = ref<Map<string, number>>(new Map())
  const quickCreate = ref<QuickCreateState | null>(null)
  const commentComposer = ref<CommentComposerState | null>(null)
  const contextMenu = ref<ContextMenuState | null>(null)
  const edgePopover = ref<EdgePopoverState | null>(null)
  /** Lignes de magnétisme actives (monde) pendant le drag d'une page : `v` = X, `h` = Y. */
  const snapGuides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] })
  /**
   * Fantôme d'emplacement (monde) affiché pendant le drag d'une fonctionnalité : rectangle pointillé
   * violet animé, à la taille de la carte, posé là où la carte va RÉELLEMENT atterrir dans le module
   * survolé (rangée ET ordre choisis au curseur). `null` = hors module (position libre / détachement).
   */
  const dragGhost = ref<{ x: number; y: number; w: number; h: number } | null>(null)
  /**
   * Drag de page façon Octopus (v13) : au grab, un FANTÔME (la carte estompée) reste posé à la
   * place d'origine pendant que la carte suit le curseur ; un SLOT (rectangle pointillé sky)
   * matérialise l'emplacement de dépôt courant, les voisins s'écartant pour l'ouvrir. Slot absent =
   * emplacement interdit → le drop n'écrit rien et la carte réintègre le fantôme.
   */
  const pageGhost = ref<{ x: number; y: number; w: number; h: number; label: string } | null>(null)
  const pageSlot = ref<{ x: number; y: number; w: number; h: number } | null>(null)
  /** Drag de BLOC en cours (un seul) : active la transition d'écartement des autres blocs. */
  const blockDragging = ref(false)

  // Source d'une connexion en cours (pour le quick-create au lâcher dans le vide).
  let connectSource: OnConnectStartParams | null = null
  let didConnect = false
  /**
   * Module cible décidé pendant le drag d'une fonctionnalité (piloté par le FANTÔME, pas par le centre
   * de la carte) : garantit que drag et drop choisissent le même module, y compris pour un placement à
   * gauche/au-dessus où le centre de la carte sort du module. `null` = détachement.
   */
  let featureDropModId: string | null = null

  // ── Géométrie ───────────────────────────────────────────────────────────────
  /**
   * AUTOLAYOUT structurel : pile des blocs d'une page. La position.y STOCKÉE n'est qu'un ordre
   * (i × BLOCK_STEP à l'écriture) ; le y AFFICHÉ est le cumul des hauteurs réelles (mesure Vue
   * Flow/ResizeObserver, sinon plancher estimé) + BLOCK_CARD_GAP. Symétrique de functionalLayout
   * pour la couche fonctionnelle. `y` est relatif à CONTENT_TOP.
   */
  interface BlockStack {
    rects: Map<string, { y: number; h: number }>
    contentH: number
  }
  function blockStackOf(pageId: string): BlockStack {
    const rects = new Map<string, { y: number; h: number }>()
    let y = 0
    for (const b of store.orderedBlocksOf(pageId)) {
      rects.set(b.id, { y, h: blockCardH(b) })
      y += blockCardH(b) + BLOCK_CARD_GAP
    }
    return { rects, contentH: rects.size ? y - BLOCK_CARD_GAP : 0 }
  }

  /**
   * Hauteur d'une CARTE de bloc : la mesure (ResizeObserver de BlockNode) fait AUTORITÉ, comme
   * pour les fonctionnalités — le nœud Vue Flow reste collé à son `minHeight` estimé quand
   * l'estimation dépasse le contenu, et l'écart VISIBLE entre cartes variait alors avec l'erreur
   * d'estimation (retour Hugo du 22/07 : « placement libre » perçu ; les gaps doivent être
   * constants = BLOCK_CARD_GAP). L'estimation ne reste que le plancher d'amorçage, pour la frame
   * où rien n'est encore mesuré.
   */
  function blockCardH(b: BlockNode): number {
    return cardHeight(b.id) ?? Math.max(estimateBlockCard(b), vf.findNode(b.id)?.dimensions.height ?? 0)
  }

  /** Hauteur AUTO d'une page : en-tête + pile réelle des blocs (≥ 1 emplacement) + marge. */
  function pageAutoHeight(pageId: string): number {
    return CONTENT_TOP + Math.max(blockStackOf(pageId).contentH, 88) + PAGE_PAD_BOTTOM
  }

  /**
   * Layout DÉRIVÉ de l'ARBORESCENCE des pages (v12, `pageTree.ts`) : seule une racine a une
   * position libre (l'ancre de son arbre), tout le reste — rail des rubriques, colonnes
   * indentées — se recalcule d'ici. Mis en CACHE parce que `pageRect` est appelé en boucle par
   * les layouts de notes/portails et `chooseRender` (qui testent toutes les frames) : recalculer
   * l'arbre entier à chaque appel rendrait la ré-évaluation des rendus quadratique. Invalidation
   * à CHAQUE mutation du store (flush `sync` : un handler de drop mutate PUIS relit la géométrie
   * dans le même tick) et à chaque `push()` (les hauteurs mesurées des blocs, hors store, ont pu
   * bouger entre deux rendus).
   */
  let pageLayoutCache: PageTreeLayout | null = null
  store.$subscribe(
    () => {
      pageLayoutCache = null
    },
    { flush: 'sync' },
  )
  /**
   * Items du layout d'arbre — extraite de `pagesLayout` parce que la PREVIEW de drag
   * (`applyPageDragPreview`) rejoue le même calcul avec une parenté/clé prospective. `phantom`
   * (drag en cours, décision partie ailleurs) insère un item SYNTHÉTIQUE à la place d'origine de
   * la carte saisie : le trou d'origine reste ouvert sous le fantôme tant que rien n'est lâché.
   */
  const PHANTOM_ID = '__drag-origin__'
  function buildPageItems(
    override?: { id: string; parentId: string | null; order: number },
    phantom?: { parentId: string | null; order: number; h: number },
  ): PageTreeItem[] {
    const items: PageTreeItem[] = store.pages.map((p) => ({
      id: p.id,
      parentId: override && p.id === override.id ? override.parentId : p.parentId,
      order: override && p.id === override.id ? override.order : p.position.x,
      h: pageAutoHeight(p.id),
    }))
    if (phantom) {
      items.push({ id: PHANTOM_ID, parentId: phantom.parentId, order: phantom.order, h: phantom.h })
    }
    return items
  }

  function pagesLayout(): PageTreeLayout {
    if (!pageLayoutCache) {
      pageLayoutCache = pageTreeLayout(buildPageItems(), { pageW: PAGE_WIDTH })
    }
    return pageLayoutCache
  }

  /**
   * Navigation PARENT-ENFANT : redondante avec l'arbre depuis la v12 (la parenté est déjà un trait
   * plein) — ni tracé, ni pastilles portail. La relation reste au modèle, elle cesse juste d'être
   * dessinée : sur locasyst elle doublait CHAQUE lien d'arbre d'une pastille « ← Accueil », d'où
   * la pollution constatée par Hugo le 22/07.
   */
  function isTreeRedundantNav(e: FlooowEdge): boolean {
    if (e.type !== 'navigatesTo') return false
    const s = store.nodeById(e.source)
    const t = store.nodeById(e.target)
    return (
      s != null && t != null && isPage(s) && isPage(t) &&
      (s.parentId === t.id || t.parentId === s.id)
    )
  }

  // (Bande de droite réservée pour les notes : SUPPRIMÉE le 22/07 — puis le système de notes
  // entier a suivi (v13) : les commentaires n'occupent AUCUNE place sur le canvas, l'écart entre
  // pages vaut TREE_COL_GAP partout, par construction.)

  /** Rect absolu (monde) d'une page — DÉRIVÉ de l'arbre (la position stockée n'est l'ancre que
   *  d'une racine ; pour les autres ce n'est qu'une clé d'ordre). */
  function pageRect(page: PageNode): { x: number; y: number; w: number; h: number } {
    const r = pagesLayout().rect.get(page.id)
    if (r) return { x: r.x, y: r.y, w: r.w, h: r.h }
    return {
      x: page.position.x,
      y: page.position.y,
      w: PAGE_WIDTH,
      h: pageAutoHeight(page.id),
    }
  }

  /** Page dont le rectangle contient le point monde (hors `excludeId`). */
  function pageAtPoint(px: number, py: number, excludeId?: string): PageNode | null {
    for (const page of store.pages) {
      if (page.id === excludeId) continue
      const r = pageRect(page)
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return page
    }
    return null
  }


  interface Rect {
    x: number
    y: number
    w: number
    h: number
  }

  /** Rect absolu (monde) d'une frame (page ou bloc). `null` pour les autres nœuds. */
  function frameRect(node: FlooowNode): Rect | null {
    if (isPage(node)) return pageRect(node)
    if (isBlock(node)) {
      const page = node.parentId ? store.nodeById(node.parentId) : null
      if (!page || !isPage(page)) return null
      // Rect DÉRIVÉ de la page (pageRect), jamais sa position stockée : celle-ci n'est plus
      // qu'une clé d'ordre depuis le layout dérivé — l'utiliser envoyait les blocs se caler près
      // de l'origine du monde.
      const pr = pageRect(page)
      const r = blockStackOf(page.id).rects.get(node.id)
      return {
        x: pr.x + PAGE_PAD_X,
        y: pr.y + CONTENT_TOP + (r?.y ?? node.position.y),
        w: BLOCK_WIDTH,
        h: r?.h ?? BLOCK_STEP,
      }
    }
    return null
  }

  // (Auto-détection ligne↔portail : SUPPRIMÉE en v13 — la couche structurelle ne rend plus jamais
  // de pastilles portail, toute navigation est une courbe pointillée derrière les cartes. Les attrs
  // `render`/`renderManual` du modèle sont simplement IGNORÉS au rendu — pas de migration de
  // format, les documents existants restent valides tels quels.)

  /** Décompose l'id d'un nœud portail synthétique en `{ edgeId, end }`, ou `null`. */
  function parsePortalId(id: string): { edgeId: string; end: 'source' | 'target' } | null {
    if (id.startsWith(PORTAL_SRC_PREFIX)) {
      return { edgeId: id.slice(PORTAL_SRC_PREFIX.length), end: 'source' }
    }
    if (id.startsWith(PORTAL_TGT_PREFIX)) {
      return { edgeId: id.slice(PORTAL_TGT_PREFIX.length), end: 'target' }
    }
    return null
  }

  // ── Données de nœud ──────────────────────────────────────────────────────────
  /** Commentaires OUVERTS ancrés directement sur un élément (v13). */
  function openCommentsOn(id: string): number {
    return store.commentsOf(id).filter((c) => !c.resolved).length
  }

  function pageData(node: PageNode): PageNodeData {
    const blocks = store.orderedBlocksOf(node.id)
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      blockCount: blocks.length,
      commentCount: store.openCommentCountOf(node.id),
      commented: openCommentsOn(node.id) > 0,
      incomplete: !store.completenessOf(node.id).complete,
      isHome: store.meta.homePageId === node.id,
    }
  }

  function blockData(node: BlockNode): BlockNodeData {
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      commentCount: openCommentsOn(node.id),
      outlined: store.commentsOf(node.id).some((c) => !c.resolved && c.anchor.range == null),
      incomplete: !store.completenessOf(node.id).complete,
    }
  }

  // ── Données / mapping de la couche fonctionnelle ─────────────────────────────
  function featureCountOf(moduleId: string): number {
    return (store.childrenIndex.get(moduleId) ?? []).filter((cid) => {
      const c = store.nodeById(cid)
      return c != null && isFeature(c)
    }).length
  }

  function moduleData(node: ModuleNode, satellite = false, shownCount?: number): ModuleNodeData {
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      // Un cadre annonce ce qu'il CONTIENT. Un satellite ne montre que les cartes qui touchent la
      // page courante : lui coller le total du module ferait mentir un cadre à deux cartes qui
      // afficherait « 12 ».
      featureCount: shownCount ?? featureCountOf(node.id),
      incomplete: !store.completenessOf(node.id).complete,
      satellite,
    }
  }

  // ── Hauteur variable des cartes (plancher estimé ; la carte s'auto-dimensionne au contenu réel) ────
  // Estimation partagée avec le store (« Réorganiser ») : voir cardMetrics.ts.
  function estimateFeature(
    node: FeatureNode,
    expanded = false,
  ): { height: number; clamps: FeatureClamps } {
    return estimateFeatureCard(
      node,
      store.realizersOfFeature(node.id).length,
      store.featureFields.length,
      expanded,
    )
  }

  interface FuncLayout {
    rect: Map<string, Rect>
    clamps: Map<string, FeatureClamps>
    /**
     * Rect (monde) du COMPARTIMENT de chaque module. Ce n'est plus un conteneur qui impose sa
     * géométrie à ses cartes : c'est un cadre DÉRIVÉ de leur placement, dessiné derrière elles.
     */
    moduleRect: Map<string, Rect>
    /** Bacs à dessiner derrière les cartes (lot, puis modules) — ordre = ordre d'empilement. */
    containers: Container[]
    /**
     * Vue par module : modules rendus en SATELLITE (externes, réduits à leurs cartes liées). Vide en
     * vue plan. Porté jusqu'au composant de cadre, qui n'a qu'à se désaturer et se pointiller.
     */
    satelliteModules: Set<string>
  }

  /**
   * Layout de la couche fonctionnelle — espacements TOUJOURS auto, rien ne se chevauche jamais :
   *   1. chaque module = rangées par NIVEAU DE DÉPENDANCE (treeLayout) : la rangée d'une carte est
   *      DÉRIVÉE de ses arêtes `dependsOn` intra-module, pas de sa position posée. Le drag ne choisit
   *      donc que l'ordre horizontal DANS son niveau ; la position stockée n'est qu'une clé d'ordre ;
   *   2. les MODULES eux-mêmes se placent en rangées auto (moduleRowsLayout) : appartenance à une
   *      rangée par recouvrement vertical des clés stockées, ordre par clé x, espacement MODULE_GAP.
   * Les positions stockées ne sont que des CLÉS D'ORDRE ; le rendu suit les tailles réelles.
   */
  /**
   * Ensemble VISIBLE en mode compact : la chaîne de l'ancre (elle + ses prérequis en amont + ce
   * qu'elle débloque en aval). `null` hors compact (tout est visible). Sert à la fois au layout
   * (les modules se recompactent sur le sous-ensemble) et au filtrage nœuds/arêtes.
   */
  function funcVisibleSet(): Set<string> | null {
    const anchor = ui.compactAnchor
    return anchor == null ? null : depChain(anchor)
  }

  /**
   * Chaîne de dépendance d'une fonctionnalité : elle-même, tout son AMONT (ses prérequis, de proche
   * en proche) et tout son AVAL (ce qu'elle débloque). Transitive dans les deux sens — s'arrêter aux
   * voisins directs couperait la chaîne au premier maillon, alors que c'est justement la chaîne
   * entière qui dit « voilà de quoi dépend ce que je regarde, et voilà ce que ça ouvre ».
   *
   * Base COMMUNE de deux gestes qui n'ont l'air de rien avoir en commun : le mode compact la RETIRE
   * du reste (la scène se réduit à elle), la mise en avant l'ÉCLAIRE (la scène reste entière, le
   * reste s'estompe). Une seule définition, donc les deux montrent exactement le même ensemble.
   */
  function depChain(anchor: string): Set<string> {
    const pre = new Map<string, string[]>() // node → ses prérequis (targets)
    const suc = new Map<string, string[]>() // node → ce qu'il débloque (sources)
    for (const e of store.edges) {
      if (e.type !== 'dependsOn') continue
      ;(pre.get(e.source) ?? pre.set(e.source, []).get(e.source)!).push(e.target)
      ;(suc.get(e.target) ?? suc.set(e.target, []).get(e.target)!).push(e.source)
    }
    const set = new Set<string>([anchor])
    const walk = (start: string, next: Map<string, string[]>): void => {
      const q = [start]
      while (q.length) {
        const c = q.shift() as string
        for (const n of next.get(c) ?? []) if (!set.has(n)) { set.add(n); q.push(n) }
      }
    }
    walk(anchor, pre)
    walk(anchor, suc)
    return set
  }

  /**
   * MISE EN AVANT À LA SÉLECTION — cliquer une fonctionnalité éclaire sa chaîne et estompe tout le
   * reste du plan (cartes ET liens). Renvoie l'ensemble à éclairer, ou `null` quand il n'y a rien à
   * mettre en avant :
   *  · hors couche fonctionnelle — les autres couches n'ont pas de chaîne de dépendance ;
   *  · 0 ou plusieurs sélections — une multi-sélection ne désigne pas UNE chaîne ;
   *  · sur autre chose qu'une fonctionnalité (cadre de module, note…) ;
   *  · en compact, où la scène ne contient DÉJÀ que la chaîne : tout serait éclairé, donc rien.
   *
   * `computed` et non fonction : elle est lue une fois par carte pendant `push()` (81 sur locasyst)
   * et une fois par arête, alors qu'elle balaie toutes les arêtes du projet. Le cache Vue la calcule
   * une seule fois par changement de sélection ou de graphe.
   */
  const funcHighlight = computed<Set<string> | null>(() => {
    if (ui.canvasLayer !== 'functional' || ui.compactOn) return null
    const ids = ui.selectedIds
    if (ids.length !== 1) return null
    const id = ids[0] as string
    const n = store.nodeById(id)
    return n && isFeature(n) ? depChain(id) : null
  })

  /**
   * Arêtes `dependsOn` entre fonctionnalités — la SEULE source des niveaux de l'arbre. Partagée par
   * le layout dérivé et la preview de drag : les deux doivent voir exactement les mêmes dépendances,
   * sinon le fantôme ment sur l'endroit où la carte va atterrir.
   */
  function featureDeps(): TreeDep[] {
    const isFeat = (id: string): boolean => {
      const n = store.nodeById(id)
      return n != null && isFeature(n)
    }
    return store.edges
      .filter((e) => e.type === 'dependsOn' && isFeat(e.source) && isFeat(e.target))
      .map((e) => ({ source: e.source, target: e.target }))
  }

  /**
   * Layout de la couche fonctionnelle — entièrement DÉRIVÉ (`globalTree.ts`, portage de la maquette
   * validée). Les positions stockées ne servent plus à rien ici : rouvrir un projet redonne toujours
   * exactement le même placement, puisqu'il ne dépend que des dépendances, des lots et des modules.
   *
   * Différence de fond avec l'ancien layout : les niveaux sont GLOBAUX. Un module n'est plus une
   * boîte qui calcule ses propres paliers — c'est un simple compartiment dessiné derrière, si bien
   * que le niveau 3 est à la même hauteur partout sur le canvas. Une fonctionnalité SANS module est
   * placée comme les autres (avant, elle gardait sa position brute et flottait n'importe où).
   */
  function functionalLayout(visible?: Set<string> | null): FuncLayout {
    const clamps = new Map<string, FeatureClamps>()
    // Carte sélectionnée = éditable inline → agrandie pour accueillir l'éditeur Tiptap.
    const selectedId = ui.selectedId
    const depsOf = new Map<string, string[]>()
    for (const d of featureDeps()) {
      const a = depsOf.get(d.source)
      if (a) a.push(d.target)
      else depsOf.set(d.source, [d.target])
    }
    const items: GlobalItem[] = []
    for (const f of store.features) {
      if (visible && !visible.has(f.id)) continue // hors chaîne (compact)
      const est = estimateFeature(f, f.id === selectedId)
      clamps.set(f.id, est.clamps)
      // Hauteur RÉELLE de la CARTE dès qu'elle a été rendue une fois ; l'estimation n'est plus qu'un
      // plancher d'amorçage, pour la frame où rien n'est encore mesuré.
      //
      // Deux pièges évités ici, tous deux à l'origine du bug « le layout ne suit pas la hauteur » :
      //  · ce n'est PAS `vf.findNode(f.id).dimensions.height` : la boîte du nœud vaut
      //    `max(minHeight estimé, contenu)` et reste donc figée sur l'estimation (mesuré : 864px de
      //    nœud pour 749px de carte) — elle ne bouge jamais quand la carte grandit ;
      //  · ce n'est PAS un `Math.max` avec l'estimation : celle-ci sur-estime de plus de 100px, elle
      //    écraserait la mesure et ré-annulerait la correction. La mesure fait AUTORITÉ.
      const h = cardHeight(f.id) ?? est.height
      const parent = f.parentId ? store.nodeById(f.parentId) : null
      items.push({
        id: f.id,
        h,
        lot: store.lotOf(f.id),
        // On groupe par ID de module (deux modules peuvent porter le même nom) ; le libellé du bac
        // est rétabli juste après.
        module: parent && isModule(parent) ? parent.id : null,
        deps: depsOf.get(f.id) ?? [],
      })
    }
    const g = globalTreeLayout(items, {
      groupByLot: ui.groupByLot,
      groupByModule: ui.groupByModule,
      spaceLots: ui.spaceLots,
      cardW: FEATURE_WIDTH,
      // Miroir du rendu réel du cadre de module : sans ça, le niveau 0 passe sous son en-tête.
      moduleHeaderH: MODULE_CONTENT_TOP,
      // VUE PAR MODULE : une seule page à l'écran. Renseigné, ce champ court-circuite flow/bands —
      // d'où le `null` explicite en vue plan, pour que rien ne change de ce côté.
      focusModule: ui.funcView === 'module' ? ui.funcModule : null,
    })
    const moduleRect = new Map<string, Rect>()
    const satelliteModules = new Set<string>()
    const containers = g.containers.map((c) => {
      if (c.kind !== 'module') return c
      const m = store.nodeById(c.label) // `label` porte encore l'id du module
      if (!m || !isModule(m)) return c // groupe « — » (cartes sans module)
      moduleRect.set(m.id, { x: c.x, y: c.y, w: c.w, h: c.h })
      if (c.satellite) satelliteModules.add(m.id)
      return { ...c, label: m.attrs.name || 'Module' }
    })
    return { rect: g.rect, clamps, moduleRect, containers, satelliteModules }
  }

  function featureData(
    node: FeatureNode,
    handles: FeatureHandle[],
    clamps: FeatureClamps,
  ): FeatureNodeData {
    const mod = node.parentId ? store.nodeById(node.parentId) : null
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      moduleName: mod && isModule(mod) ? mod.attrs.name : null,
      incomplete: !store.completenessOf(node.id).complete,
      orphan: store.realizersOfFeature(node.id).length === 0,
      handles,
      clamps,
      blocked: store.unlockOf(node.id)?.kind === 'blocked',
    }
  }

  function moduleFlowNode(node: ModuleNode, layout: FuncLayout): Node {
    const r = layout.moduleRect.get(node.id)
    const satellite = layout.satelliteModules.has(node.id)
    const shownCount = satellite
      ? [...layout.rect.keys()].filter((id) => store.nodeById(id)?.parentId === node.id).length
      : undefined
    return {
      id: node.id,
      type: NODE_TYPE.module,
      // Cadre DÉRIVÉ du placement de ses cartes. Non déplaçable : il n'a plus de position propre à
      // déplacer, il épouse ce que le layout global a décidé. SÉLECTIONNABLE en revanche : c'est la
      // seule porte d'entrée pour éditer le module (nom, etc.) dans le panneau. Ce qui le faisait
      // passer devant ses cartes n'était pas la sélection mais l'élévation automatique de Vue Flow,
      // désactivée sur <VueFlow> (`elevate-nodes-on-select`) — son zIndex reste donc 0, sélectionné
      // ou non.
      position: r ? { x: r.x, y: r.y } : { x: node.position.x, y: node.position.y },
      draggable: false,
      data: moduleData(node, satellite, shownCount),
      // Sous les liens (zIndex 1) et les cartes (zIndex 2) : les tracés passent DERRIÈRE les cartes
      // mais au-dessus du fond du module (visibles dans les écarts, cachés derrière les cartes).
      zIndex: 0,
      style: r ? { width: `${r.w}px`, height: `${r.h}px` } : undefined,
    }
  }

  /**
   * Bacs de LOT (vue plan, « Grouper par lot »). Rien à filtrer ici : `globalTree` n'émet des
   * conteneurs `kind: 'lot'` que dans la disposition compartimentée ET quand `groupByLot` est actif —
   * la vue par module passe par `layoutModuleFocus`, qui n'en produit aucun. Une carte sans lot
   * n'existe pas (le lot est toujours résolu, défaut 1), donc aucun cas « hors bac ».
   */
  function lotFlowNodes(layout: FuncLayout): Node[] {
    return layout.containers
      .filter((c) => c.kind === 'lot')
      .map((c) => ({
        id: `lot-frame:${c.key}`,
        type: NODE_TYPE.lot,
        position: { x: c.x, y: c.y },
        data: { label: c.label, color: lotColor(c.lot) } satisfies LotFrameData,
        // `pointerEvents: 'none'` sur le NŒUD, pas seulement sur le cadre : le div `.vue-flow__node`
        // est une boîte de plusieurs milliers de pixels de côté, et il reste une cible de clic même
        // vide et transparente. Sans ça, tout clic sur le fond quadrillé À L'INTÉRIEUR d'un lot
        // atterrissait sur le bac au lieu du pane — plus de pan, plus de lasso, plus de double-clic
        // de création dans la moitié utile du canvas.
        style: { width: `${c.w}px`, height: `${c.h}px`, pointerEvents: 'none' },
        // DERRIÈRE tout le reste : le bac englobe les sous-bacs de module (zIndex 0), les tracés (1)
        // et les cartes (2). Négatif plutôt que de remonter les trois autres — `.vue-flow__nodes`
        // fait son propre contexte d'empilement, le -1 y reste donc contenu et ne peut pas passer
        // sous le fond quadrillé du canvas.
        zIndex: -1,
        // Repère visuel, jamais une cible : non déplaçable (il n'a aucune position propre, il épouse
        // le layout), non sélectionnable et non focusable. Le cadre lui-même est en
        // `pointer-events: none` (LotFrame.vue) — sans quoi il volerait, sur toute sa surface, les
        // clics destinés aux cartes qu'il recouvre.
        draggable: false,
        selectable: false,
        focusable: false,
        connectable: false,
      }))
  }

  function featureFlowNode(node: FeatureNode, handles: FeatureHandle[], layout: FuncLayout): Node {
    const r = layout.rect.get(node.id)
    const clamps = layout.clamps.get(node.id) ?? estimateFeature(node).clamps
    const h = r?.h ?? FEATURE_HEIGHT
    // Hauteur AUTO (minHeight = plancher estimé) TOUJOURS : la carte épouse son contenu réel (Vue Flow
    // re-mesure via ResizeObserver) → contenu complet, jamais de clip, ni en aperçu ni en édition.
    const style = { width: `${FEATURE_WIDTH}px`, minHeight: `${h}px` }
    return {
      id: node.id,
      type: NODE_TYPE.feature,
      data: featureData(node, handles, clamps),
      style,
      zIndex: 2, // au-dessus des tracés → les liens passent derrière la carte
      // Position MONDE, nœud RACINE : le module n'est plus un parent Vue Flow, juste un cadre
      // dessiné derrière. Et le placement est entièrement dérivé des dépendances → non déplaçable :
      // déplacer une carte n'aurait aucun effet persistant, le layout la remettrait à sa place.
      draggable: false,
      position: r ? { x: r.x, y: r.y } : { x: node.position.x, y: node.position.y },
    }
  }



  /**
   * Ports « dépend de » : un lien = un port DISTINCT, et le port se place FACE au nœud connecté
   * (offset = coordonnée du centre de l'autre carte, projetée sur le côté), puis résolution de
   * collisions → tracés droits, pas de serpentin. Ports occupés figés (non interactifs) ; un port
   * `free` par côté (interactif) permet d'ajouter un lien. En mode portail, les liens inter-modules
   * sont des pastilles (sans port de ligne).
   */
  /**
   * Ports des liens « dépend de » — ANCRAGE FIXE, comme la maquette validée : toute relation sort du
   * BAS-CENTRE du prérequis et entre par le HAUT-CENTRE de ce qu'il débloque.
   *
   * L'ancienne version calculait un port par relation, choisissait un côté selon les recouvrements
   * de rects et écartait les ports pour éviter les collisions. Résultat : les ports se déplaçaient
   * d'un rendu à l'autre et les liens ne partaient pas du centre du bord. La maquette n'a aucun port
   * dynamique — le layout en niveaux garantit déjà que le prérequis est AU-DESSUS, donc un seul
   * ancrage vertical suffit et reste stable.
   *
   * Sens : une arête `dependsOn` va du dépendant (source) vers son prérequis (target). Le dépendant
   * est au niveau du dessous : il sort donc par son HAUT, et le prérequis reçoit par son BAS.
   */
  function computeFuncHandles(layout: FuncLayout): {
    handlesByFeature: Map<string, FeatureHandle[]>
    edgeHandles: Map<string, { sourceHandle: string; targetHandle: string }>
  } {
    const handlesByFeature = new Map<string, FeatureHandle[]>()
    const edgeHandles = new Map<string, { sourceHandle: string; targetHandle: string }>()
    const SRC = 's-top'
    const TGT = 't-bottom'
    const need = new Set<string>()
    /** Ports LATÉRAUX à matérialiser, par carte : `${id}|${portId}`. Voir plus bas. */
    const lateralPorts = new Set<string>()
    for (const e of store.edges) {
      if (e.type !== 'dependsOn') continue
      const sr = layout.rect.get(e.source)
      const tr = layout.rect.get(e.target)
      if (!sr || !tr) continue
      need.add(e.source)
      need.add(e.target)

      /**
       * ANCRAGE LATÉRAL — correction d'un défaut visible dès que deux cartes reliées sont loin
       * horizontalement (typiquement un satellite en vue par module, mais aussi deux lots éloignés
       * en vue plan) : le tracé traversait l'écran de biais et arrivait quand même par le HAUT de la
       * carte, avec un crochet final absurde. On sort et on rentre alors par le CÔTÉ.
       *
       * Le critère porte sur l'écart entre CENTRES : il dit si le lien se lit verticalement (rangée
       * n → rangée n+1, le cas courant) ou latéralement (aller-retour vers un ailleurs). Les deux
       * conditions sont nécessaires — la première écarte les cartes simplement décalées d'une
       * colonne, la seconde exige que l'horizontale domine franchement la verticale.
       *
       * Sens : une arête `dependsOn` va de la DÉPENDANTE (source) vers son PRÉREQUIS (target). Le
       * fil se lit du prérequis vers ce qu'il débloque : il sort donc du côté du prérequis qui
       * REGARDE la dépendante, et entre par le côté opposé de celle-ci.
       *
       * RESTREINT À LA VUE PAR MODULE, et c'est un arbitrage, pas une limite technique : la règle
       * se déclenche aussi en vue plan (~27 des 84 liens de locasyst, là où deux colonnes de lot
       * sont éloignées), où elle corrige le même défaut — mais la consigne de ce portage est que la
       * vue plan rende EXACTEMENT comme avant. La lever tient en une condition ; c'est une décision
       * de rendu à trancher sur pièce, pas un effet de bord à laisser filer.
       */
      const dx = sr.x - tr.x
      const dy = sr.y + sr.h / 2 - (tr.y + tr.h / 2)
      const lateral =
        ui.funcView === 'module' &&
        Math.abs(dx) > FEATURE_WIDTH &&
        Math.abs(dx) > Math.abs(dy) * 1.2
      if (!lateral) {
        edgeHandles.set(e.id, { sourceHandle: SRC, targetHandle: TGT })
        continue
      }
      // Dépendante à DROITE du prérequis → le fil sort à droite du prérequis, entre à gauche d'elle.
      const sourceHandle = dx > 0 ? 's-left' : 's-right'
      const targetHandle = dx > 0 ? 't-right' : 't-left'
      edgeHandles.set(e.id, { sourceHandle, targetHandle })
      lateralPorts.add(`${e.source}|${sourceHandle}`)
      lateralPorts.add(`${e.target}|${targetHandle}`)
    }
    const LATERAL: { id: string; type: 'source' | 'target'; side: CardSide }[] = [
      { id: 's-left', type: 'source', side: 'left' },
      { id: 's-right', type: 'source', side: 'right' },
      { id: 't-left', type: 'target', side: 'left' },
      { id: 't-right', type: 'target', side: 'right' },
    ]
    // Les deux ports VERTICAUX existent sur TOUTE carte rendue, pas seulement celles déjà reliées :
    // ils servent aussi de cibles pour créer une relation à la souris. Les ports latéraux, eux, ne
    // sont posés que là où un lien les utilise VRAIMENT — sinon chaque carte offrirait au survol
    // quatre points d'accroche de plus, dont aucun ne correspond au geste courant (relier de haut
    // en bas). Ils sont donc toujours « occupés », jamais `free`.
    for (const id of layout.rect.keys()) {
      const hs: FeatureHandle[] = [
        { id: SRC, type: 'source', side: 'top', free: !need.has(id), connectable: true },
        { id: TGT, type: 'target', side: 'bottom', free: !need.has(id), connectable: true },
      ]
      for (const p of LATERAL) {
        if (!lateralPorts.has(`${id}|${p.id}`)) continue
        hs.push({ id: p.id, type: p.type, side: p.side, free: false, connectable: false })
      }
      handlesByFeature.set(id, hs)
    }
    return { handlesByFeature, edgeHandles }
  }

  /** Deux fonctionnalités du MÊME module (lien intra-module → toujours au premier plan). */
  function sameModuleEdge(e: FlooowEdge): boolean {
    const s = store.nodeById(e.source)
    const t = store.nodeById(e.target)
    return (
      s != null &&
      t != null &&
      isFeature(s) &&
      isFeature(t) &&
      s.parentId != null &&
      s.parentId === t.parentId
    )
  }

  /**
   * Côtés d'un lien entre DEUX cartes, d'après leurs rects : si elles ne se recouvrent pas
   * verticalement (l'une nettement au-dessus/dessous de l'autre) → bas↔haut (l'offset du port se
   * décale ensuite horizontalement vers l'autre carte, cf. idealOffset) ; sinon (côte à côte,
   * recouvrement vertical) → droite↔gauche. Évite qu'un lien « B sous A » parte sur le côté.
   */
  function edgeSides(sr: Rect, tr: Rect): { s: CardSide; t: CardSide } {
    const hOverlap = Math.min(sr.x + sr.w, tr.x + tr.w) - Math.max(sr.x, tr.x)
    const vOverlap = Math.min(sr.y + sr.h, tr.y + tr.h) - Math.max(sr.y, tr.y)
    const below = tr.y + tr.h / 2 >= sr.y + sr.h / 2
    const right = tr.x + tr.w / 2 >= sr.x + sr.w / 2
    // Empilées (recouvrement en X, pas en Y) → bas↔haut (ligne verticale droite possible).
    if (hOverlap > 8 && vOverlap <= 8) {
      return below ? { s: 'bottom', t: 'top' } : { s: 'top', t: 'bottom' }
    }
    // Côte à côte (recouvrement en Y, pas en X) → droite↔gauche (ligne horizontale droite possible).
    if (vOverlap > 8 && hOverlap <= 8) {
      return right ? { s: 'right', t: 'left' } : { s: 'left', t: 'right' }
    }
    // DIAGONALE (aucun recouvrement) → coude en L : la source sort par le côté HORIZONTAL vers la
    // cible, la cible entre par le côté VERTICAL vers la source (chemin le plus court, pas de vague).
    if (hOverlap <= 8 && vOverlap <= 8) {
      return { s: right ? 'right' : 'left', t: below ? 'top' : 'bottom' }
    }
    // Cartes qui se recouvrent sur les deux axes (proches/imbriquées) → axe du plus grand recouvrement.
    if (hOverlap >= vOverlap) {
      return below ? { s: 'bottom', t: 'top' } : { s: 'top', t: 'bottom' }
    }
    return right ? { s: 'right', t: 'left' } : { s: 'left', t: 'right' }
  }

  /** Rect absolu (monde) d'une carte fonctionnalité, depuis le layout (hauteurs variables). */
  function featureRectAbs(id: string, layout: FuncLayout): Rect | null {
    return layout.rect.get(id) ?? null
  }

  /** Libellé compact d'une extrémité de portail : le code (ex. « CAT-02 »), sinon le nom. */
  function funcPortalLabel(id: string): string {
    const n = store.nodeById(id)
    if (n && isFeature(n)) return n.attrs.code || n.attrs.name || id
    return id
  }

  // Géométrie des pastilles portail (fonctionnel) : PETITES et discrètes, juste à côté de la carte.
  const FPILL_W = 56
  const FPILL_H = 15
  const FPILL_GAP = 5
  const FPILL_STEP_V = 18
  const FPILL_STEP_H = 64

  /**
   * Pastilles « portail » des liens INTER-modules en mode portail : deux pastilles par lien (une à
   * chaque extrémité), posées juste à côté de la fonctionnalité, sur le côté visant l'autre bout.
   * Empilées par (fonctionnalité, côté) pour ne pas se chevaucher. Clic → focus l'autre extrémité.
   */
  function funcPortalNodes(layout: FuncLayout): Node[] {
    if (ui.canvasLayer !== 'functional' || ui.funcEdgeMode !== 'portal') return []
    interface Pastille {
      id: string
      edgeId: string
      end: 'source' | 'target'
      other: string
      label: string
    }
    const groups = new Map<string, Pastille[]>()
    const add = (key: string, item: Pastille): void => {
      const arr = groups.get(key)
      if (arr) arr.push(item)
      else groups.set(key, [item])
    }
    for (const e of store.edges) {
      if (e.type !== 'dependsOn' || sameModuleEdge(e)) continue
      const sr = featureRectAbs(e.source, layout)
      const tr = featureRectAbs(e.target, layout)
      if (!sr || !tr) continue
      // n'afficher un portail que si les deux bouts sont bien dans la couche fonctionnelle
      const sn = store.nodeById(e.source)
      const tn = store.nodeById(e.target)
      if (!sn || !tn || layerOf(sn) !== 'functional' || layerOf(tn) !== 'functional') continue
      const { s: sSide, t: tSide } = edgeSides(sr, tr)
      add(`${e.source}|${sSide}`, {
        id: `${PORTAL_SRC_PREFIX}${e.id}`,
        edgeId: e.id,
        end: 'source',
        other: e.target,
        label: `→ ${funcPortalLabel(e.target)}`,
      })
      add(`${e.target}|${tSide}`, {
        id: `${PORTAL_TGT_PREFIX}${e.id}`,
        edgeId: e.id,
        end: 'target',
        other: e.source,
        label: `← ${funcPortalLabel(e.source)}`,
      })
    }
    const out: Node[] = []
    for (const [key, arr] of groups) {
      const sep = key.lastIndexOf('|')
      const rect = featureRectAbs(key.slice(0, sep), layout)
      const side = key.slice(sep + 1) as CardSide
      if (!rect) continue
      arr.sort((a, b) => (a.id < b.id ? -1 : 1))
      arr.forEach((p, k) => {
        let x = rect.x
        let y = rect.y
        let align: 'left' | 'right' = 'left'
        if (side === 'right') {
          x = rect.x + rect.w + FPILL_GAP
          y = rect.y + k * FPILL_STEP_V
        } else if (side === 'left') {
          x = rect.x - FPILL_GAP - FPILL_W
          y = rect.y + k * FPILL_STEP_V
          align = 'right'
        } else if (side === 'bottom') {
          y = rect.y + rect.h + FPILL_GAP
          x = rect.x + k * FPILL_STEP_H
        } else {
          y = rect.y - FPILL_GAP - FPILL_H
          x = rect.x + k * FPILL_STEP_H
        }
        out.push({
          id: p.id,
          type: NODE_TYPE.portal,
          position: { x, y },
          zIndex: EDGE_Z + 1,
          draggable: false,
          selectable: false,
          deletable: false,
          style: { width: `${FPILL_W}px` },
          data: {
            edgeId: p.edgeId,
            end: p.end,
            align,
            label: p.label,
            other: p.other,
            compact: true,
          } satisfies PortalNodeData,
        })
      })
    }
    return out
  }

  // ── Mapping FlooowNode → Node Vue Flow ─────────────────────────────────────
  function toFlowNode(node: FlooowNode): Node {
    if (isPage(node)) {
      // Position DÉRIVÉE de l'arbre (pageTree.ts). Une page enfant devient nœud ENFANT Vue Flow de
      // sa parente (position relative) : glisser une page emporte nativement toute sa descendance —
      // c'est ce qui fait qu'une racine translate son arbre, et qu'un reparentage déplace le
      // sous-arbre entier pendant le geste.
      const layout = pagesLayout()
      const r = layout.rect.get(node.id)
      const parentRect =
        node.parentId && store.nodeById(node.parentId) ? layout.rect.get(node.parentId) : undefined
      const base: Node = {
        id: node.id,
        type: NODE_TYPE.page,
        position:
          r && parentRect
            ? { x: r.x - parentRect.x, y: r.y - parentRect.y }
            : { x: r?.x ?? node.position.x, y: r?.y ?? node.position.y },
        data: pageData(node),
        style: {
          width: `${PAGE_WIDTH}px`,
          height: `${pageAutoHeight(node.id)}px`,
        },
      }
      if (r && parentRect) base.parentNode = node.parentId as string
      return base
    }
    if (isBlock(node)) {
      // Position AUTOLAYOUT : x fixe (inset), y = pile cumulée des hauteurs réelles (blockStackOf).
      // Une fois la carte MESURÉE, le nœud épouse sa hauteur (`height`) : sa boîte cesse de
      // déborder sous la carte quand l'estimation surestime — l'écart visible entre cartes vaut
      // alors exactement BLOCK_CARD_GAP. Avant mesure : minHeight = plancher ESTIMÉ.
      const stacked = node.parentId ? blockStackOf(node.parentId).rects.get(node.id) : undefined
      const measured = cardHeight(node.id)
      const base: Node = {
        id: node.id,
        type: NODE_TYPE.block,
        position: { x: PAGE_PAD_X, y: CONTENT_TOP + (stacked?.y ?? node.position.y) },
        data: blockData(node),
        style: {
          width: `${BLOCK_WIDTH}px`,
          ...(measured
            ? { height: `${measured}px` }
            : { minHeight: `${estimateBlockCard(node)}px` }),
        },
      }
      if (node.parentId) base.parentNode = node.parentId
      // Pas d'extent verrouillé : un bloc peut être glissé vers une autre page (reparent au drop).
      return base
    }
    // Plus aucun autre type structurel depuis la v13 (les notes ont disparu du canvas) — le filtre
    // de toFlowNodes ne laisse passer que pages et blocs, cette branche est un garde-fou.
    throw new Error(`toFlowNode : type structurel inattendu (${node.type})`)
  }

  /**
   * Profondeur d'arbre pour l'ORDRE des nœuds (exigence Vue Flow parent-avant-enfant) : une page
   * vaut sa profondeur dans l'arbre v12 (racine 0, rubrique 1…), un bloc vient après sa page.
   */
  function depthOf(node: FlooowNode): number {
    if (isPage(node)) return Math.max(pageChain(node.id, store.nodes).length - 1, 0)
    if (isBlock(node) && node.parentId) {
      const page = store.nodeById(node.parentId)
      return page && isPage(page) ? pageChain(page.id, store.nodes).length : 1
    }
    return 0
  }

  function toFlowNodes(): Node[] {
    // Couche fonctionnelle : modules + fonctionnalités uniquement (autre couche masquée, §15).
    if (ui.canvasLayer === 'functional') {
      const layout = functionalLayout(funcVisibleSet())
      const { handlesByFeature } = computeFuncHandles(layout)
      // Compact : seuls les modules/cartes présents dans le layout (chaîne) sont rendus.
      return [
        // Bacs de lot EN PREMIER : ils sont dessous (zIndex -1), et l'ordre du tableau départage les
        // nœuds de même zIndex.
        ...lotFlowNodes(layout),
        ...store.modules.filter((m) => layout.moduleRect.has(m.id)).map((m) => moduleFlowNode(m, layout)),
        ...store.features
          .filter((f) => layout.rect.has(f.id))
          .map((f) => featureFlowNode(f, handlesByFeature.get(f.id) ?? [], layout)),
        ...funcPortalNodes(layout),
      ]
    }
    // Couche structurelle : pages/blocs (fonctionnels exclus ; plus de notes depuis la v13).
    return [...store.nodes.values()]
      .filter((n) => layerOf(n) === 'structural' && (isPage(n) || isBlock(n)))
      .sort((a, b) => depthOf(a) - depthOf(b))
      .map((n) => toFlowNode(n))
  }

  // TEST (couleur par relation) : palette de teintes bien distinctes attribuées aux relations
  // `dependsOn` par coloration GLOUTONNE — chaque relation prend la première couleur non encore
  // employée par une AUTRE relation touchant l'une de ses deux cartes → jamais 2× la même couleur
  // sur une même carte, on repère chaque connexion. (À jeter si le rendu ne convainc pas.)
  const DEP_EDGE_TEST_COLORS = [
    '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2',
    '#db2777', '#65a30d', '#e11d48', '#0d9488', '#9333ea', '#ca8a04',
  ]
  function depEdgeColors(): Map<string, string> {
    const colorByEdge = new Map<string, string>()
    const usedByCard = new Map<string, Set<string>>()
    const used = (card: string): Set<string> => {
      let s = usedByCard.get(card)
      if (!s) usedByCard.set(card, (s = new Set()))
      return s
    }
    for (const e of store.edges) {
      if (e.type !== 'dependsOn') continue
      const su = used(e.source)
      const tu = used(e.target)
      const color =
        DEP_EDGE_TEST_COLORS.find((c) => !su.has(c) && !tu.has(c)) ??
        (DEP_EDGE_TEST_COLORS[colorByEdge.size % DEP_EDGE_TEST_COLORS.length] as string)
      colorByEdge.set(e.id, color)
      su.add(color)
      tu.add(color)
    }
    return colorByEdge
  }

  function toFlowEdges(): Edge[] {
    const out: Edge[] = []
    const depColors = depEdgeColors()
    // Compact : n'afficher que les liens dont les DEUX extrémités sont dans la chaîne visible.
    const vis = ui.canvasLayer === 'functional' ? funcVisibleSet() : null
    // (Mise en avant de chaîne : plus rien à cuire ici — TypedEdge lit FUNC_HIGHLIGHT_KEY en direct.)
    // Ports distribués (un lien = un port) pour la couche fonctionnelle, calculés une seule fois.
    const funcLayout = ui.canvasLayer === 'functional' ? functionalLayout(vis) : null
    const funcEdgeHandles = funcLayout ? computeFuncHandles(funcLayout).edgeHandles : null
    // VUE PAR MODULE : le layout ne pose QUE la page courante et ses satellites. Une arête dont une
    // extrémité n'est pas posée n'a nulle part où s'accrocher — on la coupe ici. Le filtre ne
    // s'applique qu'à ce mode : en vue plan toutes les cartes sont posées, et il ne changerait rien.
    const unplaced = (e: FlooowEdge): boolean =>
      funcLayout != null &&
      ui.funcView === 'module' &&
      (!funcLayout.rect.has(e.source) || !funcLayout.rect.has(e.target))
    // Flèche compacte pour les liens « dépend de » (sinon trop grosse dans l'écart vertical),
    // posée à l'extrémité SOURCE (la dépendante) et orientée VERS elle (`auto-start-reverse`) :
    // la flèche montre le sens du DÉBLOCAGE — le même que la dérive des pointillés (TypedEdge) —
    // et non le sens « dépend de » (qui se lit à l'inverse, ou dans le popover du lien).
    const FUNC_ARROW = {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: '#94a3b8',
      orient: 'auto-start-reverse',
    }
    // Arêtes manuelles. Une arête ne s'affiche que si ses DEUX extrémités sont dans la couche
    // active (§15) : « réalisé par » (fonctionnel → structurel) reste donc masqué dans les deux
    // modes purs (il se consultera dans la future vue « couverture »).
    for (const e of store.edges) {
      const es = store.nodeById(e.source)
      const et = store.nodeById(e.target)
      if (!es || !et || layerOf(es) !== ui.canvasLayer || layerOf(et) !== ui.canvasLayer) continue
      if (vis && (!vis.has(e.source) || !vis.has(e.target))) continue // hors chaîne (compact)
      if (unplaced(e)) continue // hors page courante (vue par module)
      if (isTreeRedundantNav(e)) continue // redondante avec l'arbre (trait plein) : pas de tracé
      // Flèches : la navigation pointe vers sa cible (markerEnd) ; « dépend de » pointe vers la
      // DÉPENDANTE (markerStart orienté vers elle, sens du déblocage, cohérent avec les pointillés
      // animés).
      const arrow = e.type === 'navigatesTo'
      // TEST : couleur dédiée de la relation (dependsOn coloré pour différencier les connexions).
      const depColor = e.type === 'dependsOn' ? depColors.get(e.id) : undefined
      const edge: Edge = {
        id: e.id,
        source: e.source,
        target: e.target,
        type: EDGE_TYPE.typed,
        // PAS de zIndex (v13) : les courbes de navigation/dépendance passent DERRIÈRE les cartes,
        // comme les arêtes d'arbre — le calque des arêtes est sous celui des nœuds par défaut.
        // Offset réduit (coude au ras du port) pour LES DEUX couches → tracés courts, pas de S entre
        // éléments proches (parité Arborescence ↔ Fonctionnalités).
        data: {
          edgeType: e.type,
          offset: 2,
          color: depColor,
        } satisfies TypedEdgeData,
      }
      if (arrow) edge.markerEnd = MarkerType.ArrowClosed
      // Flèche du déblocage teintée comme le tracé (marqueur distinct par couleur — Vue Flow
      // enregistre un marqueur par jeu de props).
      else if (e.type === 'dependsOn')
        edge.markerStart = depColor ? { ...FUNC_ARROW, color: depColor } : FUNC_ARROW
      // Couche structurelle (v13, retour Hugo) : le CÔTÉ de sortie/entrée suit la GÉOMÉTRIE — un
      // lien vers une carte située à DROITE sort par la droite de la source et entre par la gauche
      // de la cible ; vers une carte à GAUCHE, l'inverse. Les ancres étaient historiquement fixes
      // (sortie droite, entrée gauche) : tout lien « rétrograde » faisait le tour complet.
      if (ui.canvasLayer === 'structural') {
        const sr = frameRect(es)
        const tr = frameRect(et)
        if (sr && tr) {
          const rightward = tr.x + tr.w / 2 >= sr.x + sr.w / 2
          if (isPage(es)) edge.sourceHandle = rightward ? 'nav-source' : 'nav-source-left'
          else if (isBlock(es)) edge.sourceHandle = rightward ? 'b-src' : 'b-src-left'
          if (isPage(et)) edge.targetHandle = rightward ? 'nav-target' : 'nav-target-right'
          else if (isBlock(et)) edge.targetHandle = rightward ? 'b' : 'b-tgt-right'
        }
      }
      // Couche fonctionnelle : ports choisis par géométrie (pas de serpentin), flèche de sens.
      //  - lien INTRA-module → toujours au premier plan (visible dans la colonne du module) ;
      //  - lien INTER-module (les longs) → bascule : `portal` (pastilles, tracé retiré ici) ou
      //    `background` (ligne derrière les cartes, visible seulement dans les gouttières).
      if (ui.canvasLayer === 'functional') {
        const cross = !sameModuleEdge(e)
        if (cross && ui.funcEdgeMode === 'portal') continue // rendu en pastilles (funcPortalNodes)
        const h = funcEdgeHandles?.get(e.id)
        if (h) {
          edge.sourceHandle = h.sourceHandle
          edge.targetHandle = h.targetHandle
        }
        // (markerStart « déblocage » déjà posé ci-dessus pour tous les « dépend de ».)
        // Non réattachable : attraper un port occupé démarre un NOUVEAU lien, ne déplace pas celui-ci.
        edge.updatable = false
        // Toujours DERRIÈRE les cartes (zIndex 1 < cartes 2) et au-dessus du fond du module (0) :
        // visibles dans les écarts entre cartes, cachés là où ils croiseraient une carte.
        edge.zIndex = 1
      }
      out.push(edge)
    }
    if (ui.canvasLayer !== 'structural') return out
    // Parenté de pages (v12, révisée v13) : arêtes SYNTHÉTIQUES dérivées de `parentId`, en trait
    // plein, raccordées par les BORDS HAUT/BAS uniquement (décision Hugo 22/07 — pas d'entrée
    // latérale), et TOUJOURS centre bas du parent → centre haut de l'enfant. Dans une pile (cartes
    // au même x), les liens fusionnent en colonne vertébrale derrière les cartes (rendu Octopus).
    // zIndex par défaut (sous les nœuds).
    for (const p of store.pages) {
      if (p.parentId == null || !store.nodeById(p.parentId)) continue
      out.push({
        id: `tree-${p.id}`,
        source: p.parentId,
        target: p.id,
        sourceHandle: 'tree-out-center',
        targetHandle: 'tree-in-top',
        type: EDGE_TYPE.tree,
        selectable: false,
        focusable: false,
        deletable: false,
        updatable: false,
      })
    }
    return out
  }

  /** Réconcilie la sélection Vue Flow avec ui.selection sans reconstruire les nœuds. */
  function syncSelection(): void {
    const want = new Set(ui.selectedIds)
    const current: GraphNode[] = vf.getSelectedNodes.value
    const toRemove = current.filter((n) => !want.has(n.id))
    if (toRemove.length) vf.removeSelectedNodes(toRemove)
    const toAdd: GraphNode[] = []
    for (const id of want) {
      if (current.some((n) => n.id === id)) continue
      const gn = vf.findNode(id)
      if (gn) toAdd.push(gn)
    }
    if (toAdd.length) vf.addSelectedNodes(toAdd)
  }

  // ── Poussée du graphe dans Vue Flow (jamais pendant un drag) ────────────────

  /**
   * Égalité STRUCTURELLE à raccourci référentiel — le comparateur du diff incrémental. Le raccourci
   * `===` fait tout le travail utile : les data pointent vers des objets du store (`data.node`),
   * remplacés à la mutation et STABLES sinon — un nœud intact se compare en une identité. Le
   * parcours profond ne se paie que sur les petits objets reconstruits à chaque mapping (handles,
   * clamps, style) et sur le seul nœud réellement muté.
   *
   * `toRaw` d'abord, et c'est capital : les data déjà poussées reviennent EMBALLÉES (le GraphNode
   * est réactif — `gn.data.node` est un proxy de l'objet que `n.data.node` référence à nu). Sans
   * dépliage, le raccourci ne prenait jamais et chaque push re-comparait le contenu riche des 98
   * cartes : mesuré à ~60 ms de tâche longue PAR FRAPPE, pire que le setNodes intégral remplacé.
   * En boucle : pinia + Vue Flow peuvent empiler leurs proxys (toRaw ne déplie qu'un étage).
   */
  function rawOf(v: unknown): unknown {
    if (typeof v !== 'object' || v == null) return v
    let r = v as object
    for (let u = toRaw(r); u !== r; u = toRaw(r)) r = u
    return r
  }
  function sameValue(a: unknown, b: unknown): boolean {
    a = rawOf(a)
    b = rawOf(b)
    if (a === b) return true
    if (typeof a !== 'object' || a == null || typeof b !== 'object' || b == null) return false
    const aArr = Array.isArray(a)
    if (aArr !== Array.isArray(b)) return false
    if (aArr) {
      const bb = b as unknown[]
      return (a as unknown[]).length === bb.length && (a as unknown[]).every((v, i) => sameValue(v, bb[i]))
    }
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) =>
      sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  }

  /**
   * DIFF INCRÉMENTAL nœuds (phase 1 de la refonte canvas — point chaud n°2 de l'audit). L'ancien
   * `setNodes(toFlowNodes())` jetait et recréait les ~200 GraphNodes à chaque mutation : chaque
   * composant de carte recevait des props neuves et re-rendait, Vue Flow re-mesurait tout, et la
   * sélection interne était balayée (d'où le syncSelection systématique). Ici, le mapping reste la
   * source de vérité, mais on ne touche QUE ce qui a changé : les GraphNodes sont réactifs, muter
   * leurs champs re-rend les seuls composants concernés — une frappe qui ne déplace qu'une carte ne
   * re-rend qu'elle et ses voisines décalées.
   *
   * Un nœud REPARENTÉ (parentNode) est MUTÉ EN PLACE, jamais retiré puis recréé : les composants
   * de nœud sont keyés par id, un remove+add du même id dans le même patch fait réutiliser le
   * composant dont les watchers restent accrochés à l'ANCIEN GraphNode — le neuf garde alors une
   * `computedPosition` sans l'offset parent et le DOM son ancien transform (constaté : page
   * reparentée rendue « au hasard », bug du drag Octopus). Le NodeWrapper résout son parent
   * dynamiquement : muter `parentNode` + `position` sur le nœud vivant recalcule tout (vérifié).
   *
   * Renvoie les ids dont les PORTS peuvent avoir bougé (style ou jeu de handles changé) : eux seuls
   * passent par `updateNodeInternals` — l'ancien code re-mesurait TOUTES les cartes à chaque push.
   */
  /**
   * Vrai pendant les retraits du diff : le handler `onNodesChange` traduit tout changement
   * `remove` en suppression DU STORE (c'est le chemin de la suppression clavier Vue Flow). Un
   * retrait de réconciliation — bascule de couche, vue par module, chaîne compacte — n'est PAS une
   * suppression : sans ce drapeau, masquer une couche DÉTRUISAIT ses nœuds (constaté : 206 → 93 →
   * 0 au premier aller-retour arbo ↔ fonctionnalités). L'ancien `setNodes` n'émettait aucun
   * changement, le handler ne voyait jamais passer ces retraits — le drapeau restaure ce contrat.
   * Fiable parce que les hooks de changements Vue Flow sont SYNCHRONES sous `removeNodes`.
   */
  let reconcilingRemoval = false

  function reconcileNodes(): string[] {
    const next = toFlowNodes()
    const nextById = new Map(next.map((n) => [n.id, n]))
    const toRemove = vf.getNodes.value.filter((gn) => !nextById.has(gn.id))
    const toAdd: Node[] = []
    const internalsDirty: string[] = []
    for (const n of next) {
      const gn = vf.findNode(n.id)
      if (!gn) {
        toAdd.push(n)
        continue
      }
      if ((gn.parentNode || undefined) !== (n.parentNode || undefined))
        gn.parentNode = n.parentNode as string
      if (gn.position.x !== n.position.x || gn.position.y !== n.position.y) gn.position = n.position
      if (!sameValue(gn.style, n.style)) {
        gn.style = n.style
        internalsDirty.push(n.id)
      }
      if (!sameValue(gn.data, n.data)) {
        // Jeu de ports dynamiques (fonctionnalités) : un handle apparu/disparu doit être re-mesuré.
        const handlesChanged = !sameValue(
          (gn.data as { handles?: unknown }).handles,
          (n.data as { handles?: unknown }).handles,
        )
        gn.data = n.data
        if (handlesChanged && !internalsDirty.includes(n.id)) internalsDirty.push(n.id)
      }
      if (gn.zIndex !== n.zIndex) gn.zIndex = n.zIndex
      if (gn.draggable !== n.draggable) gn.draggable = n.draggable
    }
    // Retirer AVANT d'ajouter : un reparenté garde son id, l'ordre inverse dupliquerait.
    // `removeConnectedEdges: false` — les arêtes ont leur propre réconciliation juste après.
    if (toRemove.length) {
      // `deletable: false` (pastilles portail…) protège de la SUPPRESSION utilisateur (touche
      // Suppr) — mais removeNodes l'honore aussi et laisserait ces nœuds en scène pour toujours.
      // Un retrait de réconciliation n'est pas une suppression : on force le drapeau.
      for (const gn of toRemove) gn.deletable = true
      reconcilingRemoval = true
      try {
        vf.removeNodes(toRemove, false)
      } finally {
        reconcilingRemoval = false
      }
    }
    if (toAdd.length) vf.addNodes(toAdd)
    return internalsDirty
  }

  /**
   * DIFF INCRÉMENTAL arêtes — même principe, en DEUX temps autour du diff des nœuds : les arêtes
   * PÉRIMÉES se retirent AVANT (une arête d'arbre qui survivrait au retrait de sa page ferait
   * hurler Vue Flow « source or target is missing » pendant le transitoire), l'upsert se joue
   * APRÈS (une arête ne peut viser un nœud pas encore ajouté). Une extrémité changée = recréation
   * (résolution des handles à l'ajout) ; sinon mutation champ à champ des seuls écarts.
   */
  function removeStaleEdges(next: Edge[]): void {
    const nextById = new Map(next.map((e) => [e.id, e]))
    const toRemove = vf.getEdges.value.filter((ge) => {
      const e = nextById.get(ge.id)
      return !e || e.source !== ge.source || e.target !== ge.target
    })
    // Même forçage que côté nœuds : les arêtes d'arbre sont `deletable: false` (parenté non
    // supprimable à la touche Suppr), removeEdges les ignorerait — et une arête d'arbre survivant
    // au retrait de sa page fait précisément le « Edge source or target is missing » qu'on évite.
    for (const ge of toRemove) ge.deletable = true
    if (toRemove.length) vf.removeEdges(toRemove)
  }
  function upsertEdges(next: Edge[]): void {
    const toAdd: Edge[] = []
    for (const e of next) {
      const ge = vf.findEdge(e.id)
      // Extrémités changées : déjà retiré par removeStaleEdges → recréation ici.
      if (!ge || ge.source !== e.source || ge.target !== e.target) {
        toAdd.push(e)
        continue
      }
      if ((ge.sourceHandle ?? undefined) !== e.sourceHandle) ge.sourceHandle = e.sourceHandle
      if ((ge.targetHandle ?? undefined) !== e.targetHandle) ge.targetHandle = e.targetHandle
      if (!sameValue(ge.data, e.data)) ge.data = e.data
      if (!sameValue(ge.markerStart, e.markerStart)) ge.markerStart = e.markerStart as never
      if (!sameValue(ge.markerEnd, e.markerEnd)) ge.markerEnd = e.markerEnd as never
      if (ge.updatable !== e.updatable) ge.updatable = e.updatable as never
      if (ge.zIndex !== e.zIndex) ge.zIndex = e.zIndex
    }
    if (toAdd.length) vf.addEdges(toAdd)
  }

  function push(): void {
    // Repère de profilage permanent (DevTools > Performance & campagnes du runner phase 0) : la
    // durée SCRIPT du push — le style/layout que le navigateur enchaîne derrière n'est pas dedans.
    const pushStart = performance.now()
    // Les hauteurs MESURÉES des blocs (hors store) ont pu changer depuis le dernier rendu : le
    // layout d'arbre de pages doit se recalculer avec elles.
    pageLayoutCache = null
    const nextEdges = toFlowEdges()
    removeStaleEdges(nextEdges)
    const internalsDirty = reconcileNodes()
    upsertEdges(nextEdges)
    syncSelection()
    // Les ports des fonctionnalités sont DYNAMIQUES (créés/déplacés à chaque rendu). Une arête peut
    // référencer un port TOUT JUSTE créé que Vue Flow n'a pas encore mesuré → il l'abandonne et
    // l'arête ne s'affiche pas. On re-mesure les ports (updateNodeInternals) APRÈS le rendu DOM, puis
    // on RÉ-APPLIQUE les arêtes pour qu'elles se résolvent sur les ports désormais connus.
    //
    // `requestAnimationFrame` et NON `nextTick` : c'est LE correctif du bug « sélectionner une carte
    // déplace les extrémités de ses liens ». Le microtask qui suit le patch DOM tombe dans une
    // fenêtre où la carte sélectionnée est TRANSITOIREMENT repliée — l'aperçu (RichContent) vient
    // d'être retiré et l'éditeur inline (RichEditor/Tiptap) est monté mais encore VIDE : `useEditor`
    // n'instancie l'éditeur qu'au montage et sa vue ProseMirror ne s'attache qu'au microtask
    // suivant. Mesuré sur SOC-04 : carte à 544px, puis 282px pendant EXACTEMENT un microtask, puis
    // 544px de nouveau.
    //
    // Ce repli n'est jamais peint, et surtout il est INVISIBLE au ResizeObserver, qui ne compare que
    // des tailles de FIN de frame. Rien ne re-mesurait donc après coup : les bornes prises dedans
    // restaient figées pour de bon — le port `t-bottom` de la carte sélectionnée tombait 262px trop
    // haut (SOC-04), 163px (CAT-11). Une frame plus tard, le DOM est stable et la mesure est juste.
    //
    // Répartition des rôles, du coup : cette frame couvre le transitoire SOUS la frame ; le
    // ResizeObserver de FeatureNode couvre tout ce qui se stabilise PLUS TARD (contenu asynchrone,
    // polices) — lui seul voit les changements qui survivent à une frame.
    //
    // Depuis le diff incrémental : la re-mesure est CIBLÉE (les seuls nœuds dont le style ou le jeu
    // de ports a changé — l'ancien code re-mesurait tout), et la ré-application des arêtes est la
    // réconciliation elle-même, qui ne touche rien si rien n'a bougé.
    if (ui.canvasLayer === 'functional') {
      requestAnimationFrame(() => {
        const settleStart = performance.now()
        if (internalsDirty.length) vf.updateNodeInternals(internalsDirty)
        const settled = toFlowEdges()
        removeStaleEdges(settled)
        upsertEdges(settled)
        performance.measure('flooow:push:settle', { start: settleStart })
      })
    }
    performance.measure('flooow:push', { start: pushStart })
  }
  // graphVersion ne bouge qu'à une mutation nommée (donc au drop, jamais pendant le drag).
  watch(() => store.graphVersion, push, { immediate: true })

  /**
   * Re-layout sur MESURE : l'autolayout (blockStackOf / functionalLayout) dépend des hauteurs
   * rendues, mais push() n'écoute que graphVersion — sans ceci, la première mesure (ou une frappe
   * qui agrandit une carte) laisserait la pile calée sur les planchers estimés. Déclenché par les
   * changements `dimensions` de Vue Flow, gardé par une signature des hauteurs (anti-boucle :
   * re-pousser des nœuds identiques re-mesure les mêmes hauteurs → signature égale → stop).
   */
  let relayoutQueued = false
  let lastHeightSig = ''
  /** Vrai pendant un drag : on ne re-pousse jamais le graphe sous le curseur (règle du fichier). */
  let draggingNow = false
  function measuredHeightSig(): string {
    const parts: string[] = []
    for (const n of store.nodes.values()) {
      // Fonctionnalité ET bloc : la hauteur qui compte est celle de la CARTE (registre du
      // ResizeObserver), pas celle du nœud — collée à son `minHeight` estimé, elle rendait cette
      // signature CONSTANTE et la garde anti-boucle bloquait alors tout re-layout légitime.
      const h = isFeature(n)
        ? cardHeight(n.id)
        : isBlock(n)
          ? (cardHeight(n.id) ?? vf.findNode(n.id)?.dimensions.height)
          : undefined
      if (h) parts.push(`${n.id}:${Math.round(h)}`)
    }
    return parts.sort().join('|')
  }
  function scheduleMeasuredRelayout(): void {
    if (relayoutQueued) return
    relayoutQueued = true
    requestAnimationFrame(() => {
      relayoutQueued = false
      if (draggingNow) return // le drop déclenchera sa propre poussée (mutation → graphVersion)
      const sig = measuredHeightSig()
      if (sig === lastHeightSig) return
      lastHeightSig = sig
      push()
    })
  }
  // Bascule de couche (§15) : re-mappe le graphe (l'autre couche est masquée). Pas de changement
  // de graphVersion sur un simple changement de vue, d'où ce watch dédié + fitView sur la couche.
  /** Nombre de nœuds visibles dans la couche active (pour décider fitView vs zoom neutre). */
  function activeLayerNodeCount(): number {
    return ui.canvasLayer === 'functional'
      ? store.modules.length + store.features.length
      : store.pages.length
  }
  // ── Mémoire du cadrage (pan + zoom) ─────────────────────────────────────────
  // Préférence PERSONNELLE, donc `localStorage` et surtout PAS le document : le pont collab
  // persiste le store dans le `.graph.json` partagé et versionné (voir viewportMemory.ts).
  const memoKey = viewportMemoKey(String(route.params.folder ?? ''), String(route.params.file ?? ''))
  /** Scène courante : c'est elle qui décide si un cadrage mémorisé est rejouable. */
  function viewportContext(): ViewportContext {
    return {
      layer: ui.canvasLayer,
      funcView: ui.funcView,
      funcModule: ui.funcView === 'module' ? ui.funcModule : null,
    }
  }
  function saveViewport(): void {
    const { x, y, zoom } = vf.viewport.value
    writeViewportMemo(memoKey, { x, y, zoom, ...viewportContext() })
  }
  /**
   * QUAND écrire. Pas à chaque image de pan (le viewport change à 60 Hz, et `localStorage` est
   * SYNCHRONE : écrire dans la boucle de rendu, c'est bloquer le thread principal pendant le geste
   * qu'on essaie de fluidifier). On écrit donc à la FIN du geste (`onMoveEnd`), plus un petit
   * anti-rebond parce qu'une molette de zoom émet une rafale de gestes courts. Filet de sécurité au
   * démontage et à `pagehide` : un rechargement pendant le délai perdrait sinon le dernier cadrage.
   */
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleSaveViewport(): void {
    if (saveTimer !== undefined) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveViewport, 300)
  }
  function flushSaveViewport(): void {
    if (saveTimer === undefined) return
    clearTimeout(saveTimer)
    saveTimer = undefined
    saveViewport()
  }
  vf.onMoveEnd(scheduleSaveViewport)
  window.addEventListener('pagehide', flushSaveViewport)
  onScopeDispose(() => {
    window.removeEventListener('pagehide', flushSaveViewport)
    flushSaveViewport()
  })

  /**
   * Le cadrage mémorisé REMPLACE le recadrage automatique — il ne s'y ajoute pas. D'où le drapeau :
   * seul le TOUT PREMIER recadrage de cette instance de canvas (celui de `onInit`) peut restaurer.
   * Les recadrages suivants sont des réactions à un changement de scène (bascule de couche, de
   * module) : y rejouer un cadrage d'une autre scène ferait exactement la lutte qu'on veut éviter.
   *
   * Pas de course avec la mesure des nœuds, contrairement à `fitView` : `setViewport` n'est qu'une
   * transformation, elle ne lit aucune dimension et vaut donc avant même que les cartes soient
   * mesurées.
   */
  let viewportRestored = false

  /**
   * Caméra PAR SCÈNE, en mémoire de session (retour Hugo 22/07 : basculer arbo → fonctionnalités
   * → arbo perdait l'endroit où on était — les deux couches partageaient le même viewport, la
   * bascule refaisait un fitView). Chaque scène (couche / vue / module) retient son dernier
   * cadrage AU MOMENT de la quitter ; y revenir le restaure tel quel. Complète la mémoire
   * localStorage (viewportMemory), qui elle ne rejoue que le tout premier cadrage à l'ouverture.
   */
  const sceneViewports = new Map<string, { x: number; y: number; zoom: number }>()
  function sceneKey(ctx: ViewportContext): string {
    return `${ctx.layer}|${ctx.funcView}|${ctx.funcModule ?? ''}`
  }
  /** Photographie le viewport courant sous la clé de la scène qu'on QUITTE (avant push/reframe). */
  function rememberScene(ctx: ViewportContext): void {
    const { x, y, zoom } = vf.viewport.value
    sceneViewports.set(sceneKey(ctx), { x, y, zoom })
  }

  /**
   * Recadre : si la couche a des nœuds → fitView (zoom plafonné à 1.1) ; si elle est VIDE → zoom
   * neutre (1). fitView sur 0 nœud IGNORE `maxZoom` et zoome au max de l'instance (4×), ce qui
   * rendait ensuite les nœuds créés énormes et faussait tout (drag, connexions, ports).
   */
  /** Position ÉCRAN (px, coin haut-gauche) d'un nœud dans le viewport courant, et le zoom du moment. */
  function screenPosOf(nodeId: string): { x: number; y: number; zoom: number } | null {
    const gn = vf.findNode(nodeId)
    if (!gn) return null
    const vp = vf.viewport.value
    return {
      x: gn.computedPosition.x * vp.zoom + vp.x,
      y: gn.computedPosition.y * vp.zoom + vp.y,
      zoom: vp.zoom,
    }
  }
  /**
   * Translate le viewport pour REMETTRE un nœud là où il était à l'écran, à zoom inchangé. Inverse
   * de `screenPosOf` : on connaît la cible écran, on cherche l'origine du viewport qui l'y place.
   */
  function holdOnScreen(nodeId: string, at: { x: number; y: number; zoom: number }): void {
    const gn = vf.findNode(nodeId)
    if (!gn) return
    void vf.setViewport({
      x: at.x - gn.computedPosition.x * at.zoom,
      y: at.y - gn.computedPosition.y * at.zoom,
      zoom: at.zoom,
    })
  }

  function reframe(): void {
    void nextTick(() => {
      if (!viewportRestored) {
        viewportRestored = true
        const memo = readViewportMemo(memoKey)
        if (memo && viewportMemoApplies(memo, viewportContext())) {
          void vf.setViewport({ x: memo.x, y: memo.y, zoom: memo.zoom })
          return
        }
      }
      // Scène déjà visitée dans cette session → on RETOMBE exactement où on l'avait quittée
      // (retour Hugo) ; le fitView ne vaut que pour une scène jamais vue.
      const remembered = sceneViewports.get(sceneKey(viewportContext()))
      if (remembered) {
        void vf.setViewport(remembered)
        return
      }
      if (activeLayerNodeCount() > 0) fitViewWhenMeasured()
      else void vf.setViewport({ x: 0, y: 0, zoom: 1 })
    })
  }

  /**
   * fitView RÉSISTANT à la course de mesure : au `nextTick` d'une bascule de scène, les nœuds tout
   * juste poussés n'ont pas encore de dimensions et `fitView` échoue EN SILENCE — le viewport de
   * l'ancienne scène restait tel quel (c'était la cause première du « caméra liée entre les
   * couches » remonté par Hugo : la première entrée en fonctionnel gardait le cadrage de l'arbo).
   * Même recette que le focus : réessayer sur quelques frames, le temps que Vue Flow mesure.
   */
  function fitViewWhenMeasured(tries = 0): void {
    const measured = vf.getNodes.value.some((n) => n.dimensions.width > 0)
    if (measured) {
      void vf.fitView({ padding: 0.2, maxZoom: 1.1 })
      return
    }
    if (tries < 20) requestAnimationFrame(() => fitViewWhenMeasured(tries + 1))
  }
  watch(
    () => ui.canvasLayer,
    (_next, prevLayer) => {
      // Photographier la scène QUITTÉE avant tout re-mappage : le viewport est encore le sien.
      rememberScene({
        layer: prevLayer,
        funcView: ui.funcView,
        funcModule: ui.funcView === 'module' ? ui.funcModule : null,
      })
      push()
      reframe()
    },
  )
  // Bascule portail / arrière-plan (couche fonctionnelle) : re-mappe (pastilles ↔ lignes) sans
  // changement de graphVersion. Pas de fitView (on ne veut pas recadrer sur un simple changement
  // de rendu des liens).
  watch(() => ui.funcEdgeMode, push)
  // Options de COMPARTIMENTAGE (« Grouper par lot / par module », « Espacer les lots ») : elles
  // entrent dans `globalTreeLayout` mais ne touchent pas au graphe, donc aucun graphVersion — sans ce
  // watch, décocher « Grouper par lot » laissait la scène telle quelle (bacs de lot toujours à
  // l'écran, colonnes inchangées) jusqu'à la première mutation sans rapport.
  watch([() => ui.groupByLot, () => ui.groupByModule, () => ui.spaceLots], push)
  // VUE PAR MODULE : entrer/sortir du mode, ou changer de module, recompose entièrement la scène
  // (cartes visibles, cadres, niveaux dessinés). D'où le recadrage en plus du re-mappage : le
  // viewport hérité de la page précédente tombe presque toujours à côté de la nouvelle, et on
  // atterrirait sur du vide. C'est le pendant de ce que la maquette faisait en remontant la scène.
  watch([() => ui.funcView, () => ui.funcModule], (_next, prev) => {
    const [prevView, prevModule] = prev
    rememberScene({
      layer: ui.canvasLayer,
      funcView: prevView,
      funcModule: prevView === 'module' ? prevModule : null,
    })
    push()
    reframe()
  })
  // MODE COMPACT : entrer dans une chaîne ou en ressortir recompose la scène exactement comme la vue
  // par module (cartes visibles, cadres, niveaux) — et sans toucher au graphe, donc aucun
  // graphVersion pour le déclencher. Sans ce watch, `funcVisibleSet()` n'était relu qu'au prochain
  // `push()` fortuit : « Vue complète » remettait bien l'ancre à `null` et ne changeait rien à
  // l'écran.
  //
  // Le recadrage n'est PAS un `fitView` comme pour la vue par module : entrer dans une chaîne ne
  // change pas de sujet, ça retire ce qui l'entoure. Un fitView redimensionnerait et déplacerait la
  // carte qu'on est en train de regarder, et il faudrait la retrouver des yeux dans une scène qu'on
  // vient à peine de réduire. On garde donc le zoom et on translate le viewport pour que l'ANCRE
  // reste au pixel près là où elle était — le reste de la scène se recompose autour d'elle. Idem à
  // la sortie, sur la carte qu'on quitte.
  watch(
    () => ui.compactAnchor,
    (anchor, previous) => {
      const pivot = anchor ?? previous
      const before = pivot ? screenPosOf(pivot) : null
      push()
      if (!before) {
        reframe()
        return
      }
      // Deux temps : `nextTick` pour que les nœuds poussés soient dans le DOM, puis une frame pour
      // que Vue Flow ait mesuré leurs dimensions — avant ça `computedPosition` peut encore valoir
      // celle de l'ancienne scène, et on translaterait vers une position périmée.
      // Deuxième application une frame plus loin : le re-layout sur hauteurs MESURÉES
      // (`scheduleMeasuredRelayout`) passe juste après le nôtre et redescend les rangées de quelques
      // pixels — sans ce rattrapage, la carte finit à ~5px de son point de départ.
      void nextTick(() => {
        requestAnimationFrame(() => {
          holdOnScreen(pivot as string, before)
          requestAnimationFrame(() => holdOnScreen(pivot as string, before))
        })
      })
    },
  )
  // Sélection : RÉCONCILIATION SEULE, plus jamais de push() (phase 1 de la refonte canvas — le
  // point chaud n°3 de l'audit : ce push «anticipatoire» reconstruisait les 98 cartes de locasyst
  // à chaque clic, 0,3-0,7 s de main thread mesurés en baseline). Ce que le push apportait est
  // couvert autrement :
  //  · mise en avant de chaîne (chain/dim) → injection réactive FUNC_HIGHLIGHT_KEY, lue en direct
  //    par FeatureNode/TypedEdge — un clic ne change plus que des liaisons de classes CSS ;
  //  · place pour l'éditeur inline de la carte sélectionnée → le chemin MESURÉ existant : l'éditeur
  //    monte, la carte grandit, son ResizeObserver incrémente cardHeightsVersion et
  //    scheduleMeasuredRelayout re-pousse UNE fois, coalescé sur rAF (le push anticipatoire
  //    calculait de toute façon avec l'ANCIENNE hauteur — cf. le commentaire de ce watch-là).
  //    L'estimation « expanded » de functionalLayout ne sert plus qu'au relayout mesuré.
  // Plus de `deep` : `ui.selectedIds` est un computed qui fabrique un tableau NEUF à chaque
  // changement de sélection (`[...selection]`) — la référence suffit à déclencher, le parcours
  // profond ne faisait que payer une traversée de plus par clic.
  watch(
    () => ui.selectedIds,
    () => {
      void nextTick(syncSelection)
    },
  )

  /**
   * Les hauteurs MESURÉES entrent dans le layout (une carte épouse son contenu réel). Or `push()`
   * ci-dessus s'exécute AVANT que le DOM n'ait re-rendu : à la sélection, il calcule encore avec
   * l'ancienne hauteur, puis la carte grandit (éditeur inline, contenu riche monté en asynchrone)
   * et plus rien ne recalcule — les rangées du dessous gardent l'écart d'avant et les liens
   * pointent à côté.
   *
   * Le signal est le compteur de révision des hauteurs de CARTES (ResizeObserver de FeatureNode) et
   * non les `dimensions` des nœuds : celles-ci restent collées au `minHeight` estimé, si bien que ce
   * watch — dans sa version précédente — observait une valeur qui ne bougeait JAMAIS. C'était la
   * cause du bug « 0 carte déplacée sur 81 » alors qu'une carte passait de 686 à 736px.
   *
   * Pas de boucle : `push()` ne change que des POSITIONS (et un `minHeight` que la carte ne remplit
   * pas), ce qui ne modifie aucune hauteur — la mesure suivante est identique et la garde de
   * `scheduleMeasuredRelayout` coupe court.
   *
   * Pas de thrashing non plus : on ne pousse pas ici, on passe par le coalescing sur rAF de
   * `scheduleMeasuredRelayout` — une frappe ou une transition qui redimensionne la carte en continu
   * ne provoque au plus qu'un re-layout par frame, jamais un par pixel.
   */
  // Les DEUX couches depuis la v13 : les cartes de BLOC aussi sont mesurées (ResizeObserver de
  // BlockNode) et leur pile — donc la hauteur des pages et tout l'arbre — dépend de ces mesures.
  watch(
    () => cardHeightsVersion.value,
    () => scheduleMeasuredRelayout(),
  )

  // Focus (recherche / clic panneau / lien du document Specs) → centre + zoom ajusté + sélectionne.
  // Le nœud peut ne pas être encore monté quand le focus suit une bascule de couche (Specs → canvas) :
  // on réessaie sur quelques frames le temps que la nouvelle couche se rende.
  watch(
    () => ui.focusRequest,
    (req) => {
      if (!req) return
      let tries = 0
      const attempt = (): void => {
        const gn = vf.findNode(req.nodeId)
        if (gn && gn.dimensions.width > 0) {
          // Zoom ajusté : au moins 1×, plafonné à 1.4× pour un cadrage confortable et lisible.
          const target = Math.min(Math.max(vf.viewport.value.zoom, 1), 1.4)
          void vf.setCenter(
            gn.computedPosition.x + gn.dimensions.width / 2,
            gn.computedPosition.y + gn.dimensions.height / 2,
            { zoom: target, duration: 350 },
          )
          return
        }
        if (tries++ < 12) requestAnimationFrame(attempt)
      }
      attempt()
    },
  )

  // ── Handlers Vue Flow → actions du store ────────────────────────────────────
  vf.onInit(() => {
    reframe()
  })

  /**
   * Index cible d'un bloc d'après sa position live (relative à sa page) : insertion dans la pile
   * AUTOLAYOUT — on compte les autres blocs dont le milieu est au-dessus du haut de la carte glissée
   * (plus de pas fixe : les frontières sont les hauteurs cumulées réelles).
   */
  function blockIndexFromY(pageId: string, relativeY: number, draggedId?: string): number {
    const top = relativeY - CONTENT_TOP
    let index = 0
    for (const [id, r] of blockStackOf(pageId).rects) {
      if (id === draggedId) continue
      if (top > r.y + r.h / 2) index++
    }
    return index
  }

  /**
   * DRAG DE BLOC façon Octopus (retour Hugo 23/07) — même principe que le drag de page : la VRAIE
   * carte est MAINTENUE à sa place (elle garde ses liens, sa page garde sa pile), le FANTÔME suit
   * le pointeur, et un SLOT s'ouvre à l'index visé dans la page SOUS LE POINTEUR — la sienne ou
   * n'importe quelle autre. Le drop applique la décision AFFICHÉE (page + index du slot), donc ce
   * que montre le geste est exactement ce que fait le lâcher — y compris l'insertion au MILIEU
   * d'une autre page (l'ancien drop cross-page collait toujours le bloc en fin de pile).
   *
   * Réutilise `pageGhost`/`pageSlot` (mêmes refs, même rendu FlowCanvas, même vocabulaire visuel) :
   * un seul geste à la fois, les deux machines ne se marchent jamais dessus.
   */
  interface BlockDragState {
    id: string
    ghostH: number
    label: string
    grabDX: number
    grabDY: number
    /** Position RELATIVE tenue (repère de sa page), réaffirmée à chaque frame contre le suivi
     *  curseur de Vue Flow — mise à jour par la preview quand le slot décale la pile. */
    heldPos: Position
    /** Décision courante (page + index du slot affiché) ; `null` = hors de toute page (annulation). */
    applied: { pageId: string; index: number } | null
    /** Pages dont la pile est actuellement écartée par la preview (à restaurer quand la cible change). */
    previewPages: Set<string>
  }
  let blockDrag: BlockDragState | null = null

  /**
   * Pile de PREVIEW d'une page pendant le geste : TOUS ses blocs (bloc tenu compris — comme le
   * drag de page, la carte tenue reste dans le layout, l'origine ne se referme jamais), plus un
   * TROU avant le `hole.index`-ième bloc NON tenu (même sémantique que blockIndexFromY, donc que
   * le drop). Renvoie l'y relatif du trou (`null` sans trou).
   */
  function applyBlockStackPreview(
    pageId: string,
    hole: { index: number; h: number } | null,
    heldId?: string,
  ): number | null {
    let y = 0
    let holeY: number | null = null
    let i = 0
    for (const b of store.orderedBlocksOf(pageId)) {
      if (hole && holeY == null && b.id !== heldId && i === hole.index) {
        holeY = y
        y += hole.h + BLOCK_CARD_GAP
      }
      const gb = vf.findNode(b.id)
      if (gb) {
        const pos = { x: PAGE_PAD_X, y: CONTENT_TOP + y }
        if (blockDrag && b.id === heldId) blockDrag.heldPos = pos
        gb.position = pos
      }
      y += blockCardH(b) + BLOCK_CARD_GAP
      if (b.id !== heldId) i++
    }
    if (hole && holeY == null) {
      holeY = y // trou en fin de pile (ou page vide)
      y += hole.h + BLOCK_CARD_GAP
    }
    // La PAGE réagit en live (retour Hugo) : sa hauteur suit la pile de preview, trou compris —
    // sans ça le slot débordait sous un cadre figé à la hauteur du layout. Même formule que
    // pageAutoHeight (y porte un dernier gap à retrancher) ; le push du drop réécrira le style
    // depuis le store — le diff des styles s'en charge.
    const contentH = y > 0 ? y - BLOCK_CARD_GAP : 0
    const gp = vf.findNode(pageId)
    if (gp)
      gp.style = {
        ...(gp.style as Record<string, string>),
        height: `${CONTENT_TOP + Math.max(contentH, 88) + PAGE_PAD_BOTTOM}px`,
      }
    return holeY
  }

  function startBlockDrag(sn: BlockNode, gn: GraphNode, pt: Position | null): void {
    // Hauteur de la CARTE (mesurée, sinon estimée) — pas celle du nœud, qui peut la dépasser
    // (minHeight plancher) : le fantôme et le trou doivent faire la taille visuelle de la carte.
    const h = blockCardH(sn)
    blockDrag = {
      id: sn.id,
      ghostH: h,
      label: sn.attrs.name || 'Bloc',
      grabDX: pt ? pt.x - gn.computedPosition.x : BLOCK_WIDTH / 2,
      grabDY: pt ? pt.y - gn.computedPosition.y : 20,
      heldPos: { x: gn.position.x, y: gn.position.y },
      applied: sn.parentId
        ? { pageId: sn.parentId, index: blockIndexFromY(sn.parentId, gn.position.y, sn.id) }
        : null,
      previewPages: new Set(),
    }
    // Fantôme et slot à l'ORIGINE, comme le drag de page : le geste commence sur place.
    const origin = { x: gn.computedPosition.x, y: gn.computedPosition.y, w: BLOCK_WIDTH, h }
    pageGhost.value = { ...origin, label: blockDrag.label }
    pageSlot.value = origin
  }

  function endBlockDrag(): void {
    blockDrag = null
    pageGhost.value = null
    pageSlot.value = null
  }

  /** Une frame du geste : carte réaffirmée à sa place, fantôme au pointeur, slot dans la page visée. */
  function blockDragStep(sn: BlockNode, gn: GraphNode, pt: Position | null): void {
    const st = blockDrag
    if (!st || st.id !== sn.id) return
    // Annule le suivi du curseur de Vue Flow AVANT le rendu (règle du drag de page).
    gn.position = { ...st.heldPos }
    if (!pt) return
    pageGhost.value = {
      x: pt.x - st.grabDX,
      y: pt.y - st.grabDY,
      w: BLOCK_WIDTH,
      h: st.ghostH,
      label: st.label,
    }
    // STABILITÉ (règle du drag de page) : pointeur au-dessus du slot ouvert → la décision affichée
    // est la bonne, on ne recalcule rien. Indispensable ici : le slot peut vivre dans la zone où
    // la page vient de GRANDIR (preview), donc HORS de son rect de layout — `pageAtPoint` y
    // répondrait « aucune page » et refermerait le slot sous le pointeur.
    const slot = pageSlot.value
    const M = 8
    if (
      slot &&
      st.applied &&
      pt.x >= slot.x - M &&
      pt.x <= slot.x + slot.w + M &&
      pt.y >= slot.y - M &&
      pt.y <= slot.y + slot.h + M
    )
      return
    const target = pageAtPoint(pt.x, pt.y)
    // Pages écartées qui ne sont plus visées : retour à leur pile naturelle.
    for (const pid of [...st.previewPages]) {
      if (pid !== target?.id) {
        applyBlockStackPreview(pid, null, sn.parentId === pid ? sn.id : undefined)
        st.previewPages.delete(pid)
      }
    }
    if (!target) {
      // Zone AGRANDIE de la page visée (sous son rect de layout, hors slot) : le layout l'ignore,
      // on la reconnaît ici pour ne pas refermer la décision sous le pointeur.
      const ap = st.applied ? store.nodeById(st.applied.pageId) : null
      if (ap && isPage(ap)) {
        const pr = pageRect(ap)
        const gp = vf.findNode(ap.id)
        const grownH = (gp && parseFloat(String((gp.style as Record<string, string>)?.height))) || pr.h
        if (pt.x >= pr.x && pt.x <= pr.x + pr.w && pt.y >= pr.y && pt.y <= pr.y + grownH) return
      }
      pageSlot.value = null
      st.applied = null
      orderBadges.value = new Map()
      return
    }
    const pr = pageRect(target)
    const index = blockIndexFromY(target.id, pt.y - pr.y, sn.id)
    const holeY = applyBlockStackPreview(
      target.id,
      { index, h: st.ghostH },
      sn.parentId === target.id ? sn.id : undefined,
    )
    st.previewPages.add(target.id)
    pageSlot.value =
      holeY == null
        ? null
        : { x: pr.x + PAGE_PAD_X, y: pr.y + CONTENT_TOP + holeY, w: BLOCK_WIDTH, h: st.ghostH }
    st.applied = { pageId: target.id, index }
    orderBadges.value = new Map([[sn.id, index + 1]])
  }

  // (Magnétisme d'alignement des pages : SUPPRIMÉ avec le placement 100 % dérivé — plus aucune
  // position libre à aligner ; le drag d'une page est un geste de rangement avec preview.
  // `snapGuides` reste exposé pour FlowCanvas mais n'est plus jamais peuplé.)

  /** Position d'une carte glissée, relative au CONTENU d'un module (repère DÉRIVÉ du module). */
  function relInModule(gn: GraphNode, modId: string, layout: FuncLayout): { x: number; y: number } {
    const mr = layout.moduleRect.get(modId)
    const ox = mr?.x ?? 0
    const oy = mr?.y ?? 0
    return {
      x: gn.computedPosition.x - ox - MODULE_PAD_X,
      y: gn.computedPosition.y - oy - MODULE_CONTENT_TOP,
    }
  }

  type FeatureSide = 'top' | 'right' | 'bottom' | 'left'

  /**
   * Crée une fonctionnalité ADJACENTE à une autre, du côté demandé (bouton « + » au survol) —
   * placement PUR, aucune arête implicite (les paliers sont une organisation visuelle ; une
   * dépendance se crée par un LIEN) : à droite/gauche = insérée dans la MÊME rangée ; en dessous =
   * dans la rangée suivante (ou une nouvelle si la source est en bas) ; au-dessus = dans la rangée
   * précédente (ou une nouvelle en tête). En racine (hors module) : simple décalage monde.
   */
  function addAdjacentFeature(featureId: string, side: FeatureSide): void {
    const feat = store.nodeById(featureId)
    if (!feat || !isFeature(feat)) return
    if (feat.parentId) {
      const mod = store.nodeById(feat.parentId)
      if (!mod || !isModule(mod)) return
      const layout = functionalLayout()
      const mr = layout.moduleRect.get(mod.id)
      const fr = layout.rect.get(featureId)
      if (!mr || !fr) return
      const relX = fr.x - mr.x - MODULE_PAD_X
      const relY = fr.y - mr.y - MODULE_CONTENT_TOP
      // Bas de la RANGÉE de la source (cartes partageant son y dérivé) : la clé « dessous » doit
      // dépasser la carte la plus haute de la rangée pour tomber dans la bande suivante.
      let rowBottom = relY + fr.h
      for (const cid of store.childrenIndex.get(mod.id) ?? []) {
        const r = layout.rect.get(cid)
        if (r && Math.abs(r.y - fr.y) < 0.5) {
          rowBottom = Math.max(rowBottom, r.y - mr.y - MODULE_CONTENT_TOP + r.h)
        }
      }
      // Clés de bande : un demi-pas à droite/gauche s'insère dans la rangée ; « dessous » vise
      // juste sous la rangée (rejoint la suivante ou en ouvre une) ; « dessus » juste au-dessus.
      const pos =
        side === 'right'
          ? { x: relX + FEATURE_WIDTH / 2, y: relY }
          : side === 'left'
            ? { x: relX - FEATURE_WIDTH / 2, y: relY }
            : side === 'bottom'
              ? { x: relX, y: rowBottom + 1 }
              : { x: relX, y: relY - 100 }
      ui.select(store.addFeature(mod.id, { position: pos }))
    } else {
      const gm = vf.findNode(featureId)
      const h = gm?.dimensions?.height || estimateFeature(feat).height
      const w = gm?.dimensions?.width || FEATURE_WIDTH
      const G = FEATURE_CARD_GAP
      const NEW_H = 90 // hauteur approx d'une carte vide (placement « dessus »)
      const off =
        side === 'right'
          ? { x: feat.position.x + w + G, y: feat.position.y }
          : side === 'left'
            ? { x: feat.position.x - FEATURE_WIDTH - G, y: feat.position.y }
            : side === 'bottom'
              ? { x: feat.position.x, y: feat.position.y + h + G }
              : { x: feat.position.x, y: feat.position.y - NEW_H - G }
      ui.select(store.addFeature(null, { position: off }))
    }
  }

  // ── Gestes d'arbre de pages (v12) : réordonner / reparenter / détacher ──────
  /**
   * Clé d'ordre (`position.x`) pour s'insérer à `index` dans une fratrie TRIÉE par clé
   * (`childPages`) : le milieu des clés voisines, ou un pas au-delà des extrêmes. On n'écrit que
   * la page déplacée — jamais de renumérotation en cascade des frères.
   */
  function orderKeyAt(sorted: readonly PageNode[], index: number): number {
    const prev = sorted[index - 1]?.position.x
    const next = sorted[index]?.position.x
    if (prev == null && next == null) return 0
    if (prev == null) return (next as number) - 10
    if (next == null) return (prev as number) + 10
    return (prev + next) / 2
  }

  /**
   * Index d'insertion dans une fratrie d'après le point visé : TOUTES les fratries sont des
   * rangées HORIZONTALES (arbre récursif v13) — on compte les frères dont le centre est à gauche.
   * `rectOf` = rects du layout AFFICHÉ (preview du drag en cours, sinon base) : on vise ce qu'on
   * voit, pas une scène d'avant l'écartement.
   */
  function insertIndexAmong(
    kids: readonly PageNode[],
    cx: number,
    rectOf: (id: string) => PageTreeRect | undefined,
  ): number {
    let index = 0
    for (const k of kids) {
      const r = rectOf(k.id)
      if (!r) continue
      if (cx > r.x + r.w / 2) index++
    }
    return index
  }

  /** Décision d'un geste de drag de page : où la carte s'installera au drop. */
  interface PageDragDecision {
    parentId: string | null
    orderX: number
    /** Rang d'insertion dans la fratrie SANS la page draggée (clé de stabilité de la décision). */
    index: number
  }

  /** Bande latérale d'une carte survolée (fraction de sa largeur) qui vise « frère AVANT/APRÈS »
   *  plutôt qu'« enfant » : le tiers gauche insère avant, le tiers droit après, le centre (et la
   *  bande sous la carte) fait un ENFANT. C'est ce qui lève l'ambiguïté « à gauche de B ou dans
   *  B ? » constatée par Hugo — chaque intention a sa zone, stable sous le pointeur. */
  const SIDE_ZONE = 1 / 3

  /**
   * Décision PROSPECTIVE du geste de drag d'une page — partagée entre la preview live
   * (`applyPageDragPreview`, les voisins s'écartent pour ouvrir le slot) et le drop (`dropPage`),
   * pour que ce que montre le drag soit EXACTEMENT ce que fait le lâcher. Ancrée au POINTEUR
   * (`pt`), pas au centre d'une carte : on vise avec la pointe de la souris.
   *   - sur sa PROPRE descendance → `null` : emplacement INTERDIT (pas de slot, le drop annule) ;
   *   - tiers GAUCHE/DROIT d'une carte → frère AVANT/APRÈS elle (dans sa fratrie à elle) ;
   *   - centre d'une carte, ou bande du rail SOUS elle → en devenir ENFANT, au rang visé ;
   *   - racine ailleurs → réordonner LES ARBRES (la rangée des racines) ;
   *   - page enfant dans la ZONE de sa fratrie → réordonner les frères ;
   *   - page enfant sur le fond au-delà → DEVENIR RACINE d'un nouvel arbre.
   * La décision se calcule contre le layout de BASE (positions dérivées du store), jamais contre la
   * preview : elle ne dépend que du pointeur — un pointeur immobile donne toujours la même
   * décision, c'est ce qui coupe toute boucle de rétroaction avec l'écartement des voisins.
   */
  function prospectivePage(sn: PageNode, pt: Position): PageDragDecision | null {
    const cx = pt.x
    const cy = pt.y
    // Rects du layout AFFICHÉ : la preview du geste en cours si elle existe (les cartes se sont
    // écartées autour du slot), sinon la base. On vise ce que l'œil voit — viser les positions
    // d'avant l'écartement décalait la cible d'une largeur de slot près de la destination.
    const shown = pageDrag && pageDrag.id === sn.id ? pageDrag.previewRects : null
    const rectOf = (id: string): PageTreeRect | undefined =>
      shown?.get(id) ?? pagesLayout().rect.get(id)
    const at = (px: number, py: number, below: boolean): PageNode | null => {
      for (const page of store.pages) {
        if (page.id === sn.id) continue
        const r = rectOf(page.id)
        if (!r) continue
        const hit = below
          ? px >= r.x && px <= r.x + r.w && py > r.y + r.h && py <= r.y + r.h + TREE_RAIL_GAP
          : px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
        if (hit) return page
      }
      return null
    }
    const over = at(cx, cy, false)
    // Bande du rail SOUS une carte : viser « en bas d'une page » = en faire un enfant.
    const target = over ?? at(cx, cy, true)
    const targetInSubtree =
      target != null && pageChain(target.id, store.nodes).some((p) => p.id === sn.id)
    if (target && targetInSubtree) return null // sa propre descendance : interdit
    if (target) {
      const r = rectOf(target.id) as PageTreeRect
      const rel = (cx - r.x) / r.w
      // Tiers gauche/droit de la CARTE (pas de la bande basse) : frère avant/après la cible.
      if (over && (rel < SIDE_ZONE || rel > 1 - SIDE_ZONE)) {
        const sibs = childPages(target.parentId, store.nodes).filter((k) => k.id !== sn.id)
        const rank = sibs.findIndex((k) => k.id === target.id)
        const index = Math.max(rank, 0) + (rel > 1 - SIDE_ZONE ? 1 : 0)
        return { parentId: target.parentId, orderX: orderKeyAt(sibs, index), index }
      }
      // Centre de la carte, ou bande du rail sous elle : ENFANT de la cible.
      const kids = childPages(target.id, store.nodes).filter((k) => k.id !== sn.id)
      const index = insertIndexAmong(kids, cx, rectOf)
      return { parentId: target.id, orderX: orderKeyAt(kids, index), index }
    }
    if (sn.parentId == null) {
      const roots = childPages(null, store.nodes).filter((k) => k.id !== sn.id)
      const index = insertIndexAmong(roots, cx, rectOf)
      return { parentId: null, orderX: orderKeyAt(roots, index), index }
    }
    const siblings = childPages(sn.parentId, store.nodes).filter((k) => k.id !== sn.id)
    // Zone de la fratrie : l'union des rects AFFICHÉS des frères ET de sa propre place, élargie
    // d'une marge — lâcher dedans réordonne, au-delà on quitte l'arbre.
    const ZONE = 120
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const k of [...siblings, sn]) {
      const r = rectOf(k.id)
      if (!r) continue
      minX = Math.min(minX, r.x - ZONE)
      minY = Math.min(minY, r.y - ZONE)
      maxX = Math.max(maxX, r.x + r.w + ZONE)
      maxY = Math.max(maxY, r.y + r.h + ZONE)
    }
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
      const index = insertIndexAmong(siblings, cx, rectOf)
      return { parentId: sn.parentId, orderX: orderKeyAt(siblings, index), index }
    }
    // Hors zone, sur le fond : nouvel arbre, au rang visé dans la rangée des racines.
    const roots = childPages(null, store.nodes)
    const index = insertIndexAmong(roots, cx, rectOf)
    return { parentId: null, orderX: orderKeyAt(roots, index), index }
  }

  /**
   * État du drag de page en cours. `applied` est LA décision montrée à l'écran (slot + écartement) ;
   * `pending` est une décision candidate qui n'est adoptée qu'après DRAG_DECISION_DELAY —
   * l'hystérésis qui supprime le clignotement mesuré (le layout complet rejoué à chaque frame
   * faisait osciller 27/30 pages autour des seuils de `prospectivePage`).
   */
  const DRAG_DECISION_DELAY = 120
  let pageDrag: {
    id: string
    /** Décision « à sa propre place » (aucun slot fantôme à insérer tant qu'on y reste). */
    origin: PageDragDecision
    originKey: string
    /** Taille de la carte saisie : fantôme au curseur + hauteur du slot fantôme de destination. */
    ghostW: number
    ghostH: number
    label: string
    /** Décalage pointeur → coin haut-gauche de la carte au moment du grab (le fantôme le garde). */
    grabDX: number
    grabDY: number
    /** Position (repère du nœud Vue Flow, relative si enfant) où la VRAIE carte est MAINTENUE
     *  pendant tout le geste — resnappée à chaque frame par-dessus le suivi du curseur de Vue
     *  Flow : c'est le FANTÔME qui suit le grab, la carte et ses liens ne bougent pas (retour
     *  Hugo du 22/07). */
    heldPos: Position
    /** Rects du layout AFFICHÉ (dernier preview appliqué, slot fantôme compris) : c'est là-dessus
     *  que la décision vise — on pointe ce qu'on voit, pas la scène d'avant l'écartement. */
    previewRects: Map<string, PageTreeRect> | null
    applied: PageDragDecision | null
    appliedKey: string
    pending: { key: string; decision: PageDragDecision | null } | null
    pendingTimer: ReturnType<typeof setTimeout> | undefined
  } | null = null

  const decisionKey = (p: PageDragDecision | null): string =>
    p ? `${p.parentId ?? ''}|${p.index}` : 'invalid'

  /** Rang d'une page dans sa fratrie (fratrie SANS elle : rang == index d'insertion no-op). */
  function siblingRank(sn: PageNode): number {
    return Math.max(
      childPages(sn.parentId, store.nodes).findIndex((k) => k.id === sn.id),
      0,
    )
  }

  /** Démarre le geste : la carte reste à sa place (elle y sera maintenue), le fantôme naît
   *  dessus et suivra le pointeur, le slot est sur place. */
  function startPageDrag(sn: PageNode, gn: GraphNode, pt: Position | null): void {
    const r = pageRect(sn)
    const rank = siblingRank(sn)
    const initial: PageDragDecision = { parentId: sn.parentId, orderX: sn.position.x, index: rank }
    pageDrag = {
      id: sn.id,
      origin: initial,
      originKey: decisionKey(initial),
      ghostW: r.w,
      ghostH: r.h,
      label: sn.attrs.name || 'Page',
      grabDX: pt ? pt.x - r.x : r.w / 2,
      grabDY: pt ? pt.y - r.y : 24,
      heldPos: { x: gn.position.x, y: gn.position.y },
      previewRects: null,
      applied: initial,
      appliedKey: decisionKey(initial),
      pending: null,
      pendingTimer: undefined,
    }
    pageGhost.value = { x: r.x, y: r.y, w: r.w, h: r.h, label: sn.attrs.name || 'Page' }
    pageSlot.value = { x: r.x, y: r.y, w: r.w, h: r.h }
  }

  /** Fin de geste : purge l'état (les classes/z éphémères tombent avec le push() du drop). */
  function endPageDrag(): void {
    if (pageDrag?.pendingTimer !== undefined) clearTimeout(pageDrag.pendingTimer)
    pageDrag = null
    pageGhost.value = null
    pageSlot.value = null
  }
  onScopeDispose(endPageDrag)

  /**
   * PREVIEW du drag de page : la VRAIE carte (et donc ses liens, sa descendance) reste À SA PLACE
   * — le layout de preview la laisse où elle est et ouvre le slot par un item FANTÔME posé à la
   * destination : les voisins s'écartent autour de lui, l'origine ne bouge jamais. Le rect du
   * fantôme devient le SLOT dessiné. Décision à l'origine → layout de base, slot sur la carte.
   * Décision `null` (interdit) → layout de base, pas de slot.
   */
  function applyPageDragPreview(sn: PageNode, decision: PageDragDecision | null): void {
    const st = pageDrag
    const away =
      st != null && st.id === sn.id && decision != null && decisionKey(decision) !== st.originKey
    /**
     * Clé d'ordre du SLOT fantôme, recalculée contre la fratrie PLEINE (carte tenue comprise) :
     * `decision.orderX` est un milieu de clés SANS la carte tenue — quand celle-ci se trouve
     * justement entre les deux voisins, cette clé tombe sur la sienne et le slot atterrissait d'un
     * côté arbitraire d'elle. Ici : le frère que le slot doit précéder est repéré dans la liste
     * pleine, et la clé médiane y est prise — le slot se place toujours exactement où l'œil
     * l'attend. (Le DROP garde `decision.orderX` : au lâcher la carte quitte sa place, la clé
     * « sans elle » redevient la bonne.)
     */
    const phantomOrder = (d: PageDragDecision): number => {
      const full = childPages(d.parentId, store.nodes)
      const next = full.filter((k) => k.id !== sn.id)[d.index]
      const fullIndex = next ? full.findIndex((k) => k.id === next.id) : full.length
      return orderKeyAt(full, fullIndex)
    }
    const layout =
      away && decision
        ? pageTreeLayout(
            buildPageItems(undefined, {
              parentId: decision.parentId,
              order: phantomOrder(decision),
              h: st.ghostH,
            }),
            { pageW: PAGE_WIDTH },
          )
        : pagesLayout()
    for (const page of store.pages) {
      const r = layout.rect.get(page.id)
      const gp = vf.findNode(page.id)
      if (!r || !gp) continue
      // Position RELATIVE si la page est un nœud enfant Vue Flow (repère de sa parente), calculée
      // dans le MÊME layout prospectif pour que le couple reste cohérent.
      const parentRect = page.parentId != null ? layout.rect.get(page.parentId) : undefined
      const pos = parentRect
        ? { x: r.x - parentRect.x, y: r.y - parentRect.y }
        : { x: r.x, y: r.y }
      // La carte saisie est MAINTENUE : sa position de preview devient la position de snap-back
      // que pageDragStep réapplique à chaque frame par-dessus le suivi du curseur.
      if (st && page.id === sn.id) st.heldPos = { ...pos }
      gp.position = pos
    }
    if (st && st.id === sn.id) st.previewRects = layout.rect
    const slot = decision ? (away ? layout.rect.get(PHANTOM_ID) : layout.rect.get(sn.id)) : null
    pageSlot.value = slot ? { x: slot.x, y: slot.y, w: slot.w, h: slot.h } : null
  }

  /**
   * Une frame de drag : la vraie carte est resnappée à sa place (c'est le FANTÔME qui suit le
   * pointeur), puis la décision est recalculée — le layout de preview n'est rejoué QUE quand elle
   * change, après l'hystérésis de DRAG_DECISION_DELAY (une décision qui ne fait que traverser un
   * seuil ne déclenche rien ; il faut qu'elle s'installe).
   */
  function pageDragStep(sn: PageNode, gn: GraphNode, pt: Position | null): void {
    const st = pageDrag
    if (!st || st.id !== sn.id) return
    // Annule le suivi du curseur de Vue Flow AVANT le rendu : la carte et ses liens ne bougent pas.
    gn.position = { ...st.heldPos }
    if (!pt) return
    pageGhost.value = {
      x: pt.x - st.grabDX,
      y: pt.y - st.grabDY,
      w: st.ghostW,
      h: st.ghostH,
      label: st.label,
    }
    // STABILITÉ : pointeur au-dessus du slot ouvert → la décision affichée est la bonne, on n'en
    // recalcule pas d'autre. C'est ce qui rend la visée sur rects AFFICHÉS sans oscillation : le
    // slot s'ouvre là où on pointe, le pointeur se retrouve dessus, la décision se fige.
    const slot = pageSlot.value
    const M = 8
    if (
      slot &&
      pt.x >= slot.x - M &&
      pt.x <= slot.x + slot.w + M &&
      pt.y >= slot.y - M &&
      pt.y <= slot.y + slot.h + M
    ) {
      if (st.pendingTimer !== undefined) clearTimeout(st.pendingTimer)
      st.pending = null
      st.pendingTimer = undefined
      return
    }
    const p = prospectivePage(sn, pt)
    const key = decisionKey(p)
    if (key === st.appliedKey || st.pending?.key === key) return
    if (st.pendingTimer !== undefined) clearTimeout(st.pendingTimer)
    st.pending = { key, decision: p }
    st.pendingTimer = setTimeout(() => {
      if (pageDrag !== st || st.pending?.key !== key) return
      st.applied = st.pending.decision
      st.appliedKey = st.pending.key
      st.pending = null
      st.pendingTimer = undefined
      applyPageDragPreview(sn, st.applied)
    }, DRAG_DECISION_DELAY)
  }

  /**
   * DROP : applique la décision AFFICHÉE (slot + écartement), pas une décision recalculée au lâcher
   * — sinon l'hystérésis pourrait faire écrire autre chose que ce que l'écran promettait. Sans slot
   * (emplacement interdit), ou pour un dépôt à sa propre place : AUCUNE mutation, la carte
   * réintègre le fantôme (jamais de « reste où on la lâche »).
   */
  function dropPage(sn: PageNode, gn: GraphNode): void {
    const p =
      pageDrag && pageDrag.id === sn.id
        ? pageDrag.applied
        : prospectivePage(sn, {
            // repli (drag multiple : pas d'état de geste par page) : centre de la carte lâchée
            x: gn.computedPosition.x + PAGE_WIDTH / 2,
            y: gn.computedPosition.y + (gn.dimensions.height || 0) / 2,
          })
    if (!p) return push()
    if (p.parentId === sn.parentId) {
      if (p.index === siblingRank(sn)) return push() // dépôt sur place : no-op, pas d'historique
      store.moveNode(sn.id, { x: p.orderX, y: 0 })
    } else {
      store.reparentPage(sn.id, p.parentId, { x: p.orderX, y: 0 })
    }
    push() // même refusée (cycle), la scène réaffiche la forme dérivée
  }

  // Badge d'ordre live pendant le drag d'un bloc ; preview de reflow pendant le drag d'une note.
  vf.onNodeDragStart((e: NodeDragEvent) => {
    closeMenus()
    draggingNow = true
    dragGhost.value = null
    featureDropModId = null
    const map = new Map<string, number>()
    for (const gn of e.nodes) {
      const sn = store.nodeById(gn.id)
      if (sn && isBlock(sn) && sn.parentId) {
        map.set(gn.id, blockIndexFromY(sn.parentId, gn.position.y, sn.id) + 1)
        // Geste Octopus (bloc seul) : carte tenue en place + fantôme + slot — plus d'élévation de
        // zIndex, la vraie carte ne voyage plus (c'est le fantôme qui traverse les pages).
        if (e.nodes.length === 1) {
          blockDragging.value = true
          startBlockDrag(sn, gn, worldFromEvent(e.event))
        }
      }
      // Défaut sans geste de drag effectif : la carte reste dans son module (pas de détachement).
      else if (sn && isFeature(sn) && sn.parentId && e.nodes.length === 1) featureDropModId = sn.parentId
      // Drag de page (v13) : la carte reste en place, le fantôme suivra le pointeur.
      else if (sn && isPage(sn) && e.nodes.length === 1) {
        startPageDrag(sn, gn, worldFromEvent(e.event))
      }
    }
    orderBadges.value = map
  })

  vf.onNodeDrag((e: NodeDragEvent) => {
    // Magnétisme d'alignement pour un élément glissé seul.
    if (e.nodes.length === 1) {
      const gn = e.nodes[0]
      const sn = gn && store.nodeById(gn.id)
      if (gn && sn && isPage(sn)) {
        // Tout drag de page est un GESTE de rangement (réordonner / reparenter / détacher) : la
        // vraie carte est maintenue en place, le fantôme suit le pointeur, et les voisins ne
        // s'écartent que quand la DÉCISION change (hystérésis), jamais à la frame.
        pageDragStep(sn, gn, worldFromEvent(e.event))
        return
      }
      // Bloc glissé seul : geste Octopus (carte tenue, fantôme au pointeur, slot dans la page
      // visée — la sienne ou une autre). Le badge #n est posé par blockDragStep.
      if (gn && sn && isBlock(sn) && sn.parentId) {
        blockDragStep(sn, gn, worldFromEvent(e.event))
        return
      }
      // Couche fonctionnelle : plus rien à faire pendant le drag. Cartes et modules sont
      // `draggable: false` depuis le layout GLOBAL (globalTree.ts) — leur place est entièrement
      // dérivée du graphe de dépendances, aucun geste ne peut la changer.
    }
    if (orderBadges.value.size === 0) return
    const map = new Map<string, number>()
    for (const gn of e.nodes) {
      const sn = store.nodeById(gn.id)
      if (sn && isBlock(sn) && sn.parentId)
        map.set(gn.id, blockIndexFromY(sn.parentId, gn.position.y, sn.id) + 1)
    }
    orderBadges.value = map
  })

  vf.onNodeDragStop((e: NodeDragEvent) => {
    draggingNow = false
    orderBadges.value = new Map()
    blockDragging.value = false
    snapGuides.value = { v: [], h: [] }
    const dropGhost = dragGhost.value // capturé pour le placement, puis effacé
    const dropModId = featureDropModId // module de dépôt décidé par le fantôme pendant le drag
    dragGhost.value = null
    featureDropModId = null
    for (const gn of e.nodes) {
      // Les pastilles portail sont auto-positionnées (non déplaçables) → ignorées ici.
      const sn = store.nodeById(gn.id)
      if (!sn) continue
      if (isBlock(sn)) {
        // Geste Octopus (bloc seul) : le drop applique la DÉCISION AFFICHÉE (page + index du
        // slot), comme dropPage — y compris l'insertion à un index précis d'une AUTRE page.
        // `null` = lâché hors de toute page → aucune mutation, le push de fin de geste resnappe.
        if (blockDrag && blockDrag.id === sn.id) {
          const applied = blockDrag.applied
          if (applied) {
            if (applied.pageId === sn.parentId) store.reorderBlock(sn.id, applied.index)
            else store.reparentBlock(sn.id, applied.pageId, applied.index)
          }
          endBlockDrag()
        } else {
          // Repli multi-drag (pas d'état de geste par bloc) : page sous le centre de la carte.
          const cx = gn.computedPosition.x + gn.dimensions.width / 2
          const cy = gn.computedPosition.y + gn.dimensions.height / 2
          const targetPage = pageAtPoint(cx, cy, sn.id)
          if (targetPage && targetPage.id !== sn.parentId) {
            store.reparentBlock(sn.id, targetPage.id)
          } else if (targetPage && targetPage.id === sn.parentId) {
            store.reorderBlock(sn.id, blockIndexFromY(targetPage.id, gn.position.y, sn.id))
          }
        }
      } else if (isPage(sn)) {
        // Placement 100 % dérivé : le lâcher applique la même décision que la preview du drag.
        dropPage(sn, gn)
      } else if (isFeature(sn)) {
        // Le module de dépôt a été décidé par le FANTÔME pendant le drag (featureDropModId), donc drag
        // et drop concordent toujours. `null` = détachement. Le drop écrit la CLÉ posée (rangée choisie
        // au curseur + ordre horizontal), puis la normalisation aligne le stocké sur le layout dérivé.
        const ghost = dropGhost
        const modId = dropModId
        const coalesce = `place-feat-${sn.id}`
        // Repère DÉRIVÉ du module au moment du drop (avant mutation) pour convertir monde → relatif.
        const layoutAtDrop = functionalLayout()
        const relFromGhost = (mod: ModuleNode) => {
          const mr = layoutAtDrop.moduleRect.get(mod.id)
          return {
            x: (ghost as { x: number; y: number }).x - (mr?.x ?? 0) - MODULE_PAD_X,
            y: (ghost as { x: number; y: number }).y - (mr?.y ?? 0) - MODULE_CONTENT_TOP,
          }
        }
        const mod = modId ? store.nodeById(modId) : null
        if (mod && isModule(mod)) {
          // Position depuis le fantôme (l'emplacement dérivé montré pendant le drag), sinon la
          // position brute — dans les deux cas une simple CLÉ D'ORDRE que la normalisation réécrit.
          const rel = ghost ? relFromGhost(mod) : relInModule(gn, mod.id, layoutAtDrop)
          if (mod.id === sn.parentId) store.moveNode(sn.id, rel, coalesce)
          else store.reparentFeature(sn.id, mod.id, rel)
        } else if (sn.parentId) {
          // Sortie du module → DÉTACHEMENT en racine, à sa position monde (le module ne grossit pas).
          store.reparentFeature(sn.id, null, { x: gn.computedPosition.x, y: gn.computedPosition.y })
        } else {
          // Déjà racine, hors module → déplacement monde libre.
          store.moveNode(sn.id, { x: gn.position.x, y: gn.position.y })
        }
      } else if (isModule(sn)) {
        // Position lâchée = simple CLÉ D'ORDRE ; le placement réel reste dérivé du layout global.
        store.moveNode(sn.id, { x: gn.position.x, y: gn.position.y }, `place-mod-${sn.id}`)
      }
    }
    endPageDrag()
    endBlockDrag() // idempotent — filet si le geste s'est terminé sans passer par la branche bloc
    // Push INCONDITIONNEL de fin de geste : un drop peut n'engendrer AUCUNE mutation (reorderBlock
    // sur le même index, moveNode no-op…) — sans push, tout ce que le drag a déplacé en direct
    // reste figé où le geste l'a laissé : bloc à l'offset du lâcher, voisins écartés par la
    // preview, zIndex élevé du bloc saisi. L'ancien setNodes intégral n'avait pas ce trou parce
    // que CHAQUE mutation re-projetait tout ; depuis le diff, c'est ce push-ci qui resynchronise —
    // et il ne coûte que le mapping quand rien n'a changé.
    push()
  })

  vf.onNodesChange((changes: NodeChange[]) => {
    let measured = false
    for (const c of changes) {
      // Un retrait de RÉCONCILIATION (diff du push) n'est pas une suppression utilisateur : le
      // nœud existe toujours dans le store, il quitte juste la scène rendue. Voir le drapeau.
      if (c.type === 'remove' && !reconcilingRemoval) store.removeNode(c.id)
      // « Cliquer ailleurs ferme l'éditeur » : en mode sélection (selectionKeyCode + panOnDrag off),
      // le clic sur le vide ne passe pas par onPaneClick mais émet une désélection ici. Dès que la
      // carte éditée est désélectionnée sur le canvas, on referme l'éditeur.
      if (c.type === 'select' && !c.selected && c.id === ui.editorNodeId) ui.closeEditor()
      if (c.type === 'dimensions') measured = true
    }
    if (measured) scheduleMeasuredRelayout()
  })

  // ── Connexion : validation + typage inféré ──────────────────────────────────
  /** Types d'arête valides pour une paire d'extrémités (le 1er = type par défaut). */
  function validEdgeTypes(source: string, target: string): EdgeType[] {
    const s = store.nodeById(source)
    const t = store.nodeById(target)
    if (!s || !t) return []
    if (isPage(s) && isPage(t)) return ['navigatesTo', 'dependsOn']
    return ['dependsOn']
  }

  vf.onConnect((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    didConnect = true
    const type = validEdgeTypes(c.source, c.target)[0]
    if (!type) return
    const dup = store.edges.some(
      (e) => e.source === c.source && e.target === c.target && e.type === type,
    )
    if (dup) return
    store.addEdge({ type, source: c.source, target: c.target, attrs: {} })
  })

  vf.onConnectStart((params) => {
    connectSource = params
    didConnect = false
  })

  vf.onConnectEnd((event) => {
    const src = connectSource
    connectSource = null
    if (didConnect || !src?.nodeId || !event) return
    const me = event instanceof MouseEvent ? event : null
    if (!me) return
    // Couche fonctionnelle : lâcher un lien sur N'IMPORTE QUELLE partie d'une carte fonctionnalité le
    // relie (fiabilité : Vue Flow ne rattache un handle que dans un petit rayon ; ici on prend le
    // nœud réellement sous le curseur). Le port est ensuite recalculé pour faire face à la source.
    if (ui.canvasLayer === 'functional') {
      const el = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null
      const nodeEl = el?.closest('.vue-flow__node-feature') as HTMLElement | null
      const targetId = nodeEl?.getAttribute('data-id') ?? null
      if (targetId && targetId !== src.nodeId) {
        const s = store.nodeById(src.nodeId)
        const t = store.nodeById(targetId)
        if (s && t && isFeature(s) && isFeature(t)) {
          const dup = store.edges.some(
            (e) => e.source === src.nodeId && e.target === targetId && e.type === 'dependsOn',
          )
          if (!dup) store.addEdge({ type: 'dependsOn', source: src.nodeId, target: targetId, attrs: {} })
        }
        return
      }
    }
    // Lâché dans le vide → menu de quick-create au curseur.
    const rect = vf.vueFlowRef.value?.getBoundingClientRect()
    if (!rect) return
    const world = vf.project({ x: me.clientX - rect.left, y: me.clientY - rect.top })
    quickCreate.value = {
      screenX: me.clientX,
      screenY: me.clientY,
      worldX: world.x,
      worldY: world.y,
      sourceId: src.nodeId,
    }
  })

  // Double-clic : sur une page → ajoute un bloc ; sur un module → ajoute une fonctionnalité.
  vf.onNodeDoubleClick(({ node }) => {
    const sn = store.nodeById(node.id)
    if (sn && isPage(sn)) store.addBlock(sn.id, 'free')
    else if (sn && isModule(sn)) ui.select(store.addFeature(sn.id))
  })

  vf.onNodeClick(({ event, node }) => {
    // Nœud portail : la navigation (focus de l'autre bout) est gérée par PortalNode lui-même.
    if (parsePortalId(node.id)) return
    // Outil COMMENTAIRE (v13) : cliquer une page/un bloc y crée un fil (panneau ouvert, composer
    // actif). ⇧/série (sticky) enchaîne les fils ; sinon retour à la sélection, comme les autres
    // outils de création.
    if (tool.active === 'comment') {
      const clicked = store.nodeById(node.id)
      if (clicked && (isPage(clicked) || isBlock(clicked))) {
        openCommentComposer(clicked.id)
        if (!tool.sticky) tool.active = 'select'
        return
      }
    }
    // Cliquer un NŒUD alors qu'un outil de placement est actif → repasse en SÉLECTION et sélectionne
    // le nœud (l'outil de placement ne pose que sur le canvas vide).
    if (tool.active === 'module' || tool.active === 'feature') {
      tool.active = 'select'
      tool.sticky = false
    }
    closeMenus()
    const additive =
      event instanceof MouseEvent && (event.shiftKey || event.metaKey || event.ctrlKey)
    ui.select(node.id, additive)
    // Compact ARMÉ : c'est CE clic qui désigne l'ancre de la chaîne (le bouton ne fait qu'armer).
    // Restreint aux fonctionnalités — la chaîne se lit sur les `dependsOn` entre cartes, un cadre de
    // module comme ancre viderait la scène — et au clic simple, ⇧/⌘-clic construisant une
    // multi-sélection ne désigne rien. `enterCompact` ignore l'appel si une ancre est déjà posée :
    // une fois la chaîne isolée, cliquer une autre de ses cartes l'édite sans recomposer la scène.
    const clicked = store.nodeById(node.id)
    if (ui.compactArmed && !additive && clicked && isFeature(clicked)) ui.enterCompact(node.id)
  })

  vf.onNodeContextMenu(({ event, node }) => {
    // Nœud portail : le clic droit ouvre le popover d'ARÊTE (géré par PortalNode via EDGE_MENU_KEY).
    if (parsePortalId(node.id)) return
    event.preventDefault()
    const me = event instanceof MouseEvent ? event : null
    if (!me) return
    ui.select(node.id)
    quickCreate.value = null
    edgePopover.value = null
    contextMenu.value = { screenX: me.clientX, screenY: me.clientY, nodeId: node.id }
  })

  /** Ouvre le popover d'arête (type, portail, suppression) à une position écran. */
  function openEdgePopover(stored: FlooowEdge, clientX: number, clientY: number): void {
    closeMenus()
    edgePopover.value = {
      screenX: clientX,
      screenY: clientY,
      edgeId: stored.id,
      current: stored.type,
      choices: validEdgeTypes(stored.source, stored.target),
    }
  }

  /** Exposé (via provide) aux pastilles portail : clic droit → ouvre le popover. */
  function openEdgeMenu(edgeId: string, clientX: number, clientY: number): void {
    const stored = store.edges.find((e) => e.id === edgeId)
    if (stored) openEdgePopover(stored, clientX, clientY)
  }

  vf.onEdgeClick(({ edge }) => {
    // Clic GAUCHE = SÉLECTION de l'arête (révèle les poignées de waypoints, déplaçables au drag).
    // Le menu (changer le type / convertir en portail / supprimer) est au clic DROIT.
    const stored = store.edges.find((e) => e.id === edge.id)
    if (!stored) return
    closeMenus()
    ui.clearSelection()
    vf.removeSelectedEdges(vf.getSelectedEdges.value)
    const ge = vf.findEdge(edge.id)
    if (ge) vf.addSelectedEdges([ge])
  })

  vf.onEdgeContextMenu(({ event, edge }) => {
    // Clic DROIT = menu d'arête.
    const stored = store.edges.find((e) => e.id === edge.id)
    if (!stored) return
    event.preventDefault()
    const me = event instanceof MouseEvent ? event : null
    if (!me) return
    openEdgePopover(stored, me.clientX, me.clientY)
  })

  /** Module dont le rect DÉRIVÉ (monde) contient le point (pour poser une fonctionnalité dedans). */
  function moduleAtPoint(px: number, py: number, layout?: FuncLayout): ModuleNode | null {
    const l = layout ?? functionalLayout()
    for (const m of store.modules) {
      const r = l.moduleRect.get(m.id)
      if (r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return m
    }
    return null
  }

  /** Coordonnées MONDE d'un événement souris (ou null). */
  function worldFromEvent(event: unknown): Position | null {
    const me = event instanceof MouseEvent ? event : null
    const rect = vf.vueFlowRef.value?.getBoundingClientRect()
    if (!me || !rect) return null
    return vf.project({ x: me.clientX - rect.left, y: me.clientY - rect.top })
  }

  /**
   * Pose le nœud de l'outil de PLACEMENT actif (module/fonctionnalité) au point monde. Une
   * fonctionnalité posée sur un module y est rattachée ; sinon elle est racine à cet endroit.
   * L'outil RESTE actif (placement en série) et le nœud N'EST PAS sélectionné (pas d'éditeur qui
   * s'ouvre) — on repasse en sélection uniquement au clic sur un nœud. Retourne `true` si posé.
   */
  function placeToolAt(world: Position, overModule?: ModuleNode | null): boolean {
    if (tool.active === 'module') {
      store.addModule({ position: world })
    } else if (tool.active === 'feature') {
      const mod = overModule ?? moduleAtPoint(world.x, world.y)
      if (mod) store.addFeature(mod.id)
      else store.addFeature(null, { position: world })
    } else {
      return false
    }
    ui.clearSelection() // pas de sélection du nouveau nœud → l'outil reste actif pour enchaîner
    return true
  }

  vf.onPaneClick((event) => {
    const world = worldFromEvent(event)
    if (world && placeToolAt(world)) return
    ui.clearSelection()
    closeMenus()
  })

  // ── Menus : actions ──────────────────────────────────────────────────────────
  function closeMenus(): void {
    quickCreate.value = null
    contextMenu.value = null
    edgePopover.value = null
    commentComposer.value = null
  }

  /** Page de rattachement d'un nœud (pour rattacher un bloc au bon parent). */
  function targetPageId(sourceId: string): string | null {
    const n = store.nodeById(sourceId)
    if (!n) return null
    if (isPage(n)) return n.id
    return pageOf(sourceId, store.nodes)?.id ?? null
  }

  function runQuickCreate(kind: QuickCreateKind): void {
    const qc = quickCreate.value
    if (!qc) return
    const source = store.nodeById(qc.sourceId)
    if (!source) return closeMenus()
    const pos = { x: qc.worldX, y: qc.worldY }

    if (kind === 'page') {
      const id = store.addPage({ position: pos })
      if (isPage(source)) {
        store.addEdge({ type: 'navigatesTo', source: source.id, target: id, attrs: {} })
      }
      ui.select(id)
    } else if (kind === 'block') {
      const pageId = targetPageId(qc.sourceId)
      if (pageId) ui.select(store.addBlock(pageId, 'free'))
    } else if (kind === 'feature') {
      // Couche fonctionnelle : nouvelle fonctionnalité, dans le module de la source (ou la source
      // si c'est un module). Reliée par « dépend de » (geste EXPLICITE de lien) : la nouvelle dépend
      // de la source. Elle se pose à l'endroit lâché — la position n'est qu'une clé de rangée/ordre.
      const parentId = isFeature(source) ? source.parentId : isModule(source) ? source.id : null
      const mod = parentId ? store.nodeById(parentId) : null
      const mr = parentId ? functionalLayout().moduleRect.get(parentId) : null
      const rel =
        mod && isModule(mod)
          ? { x: pos.x - (mr?.x ?? 0) - MODULE_PAD_X, y: pos.y - (mr?.y ?? 0) - MODULE_CONTENT_TOP }
          : pos
      const id = store.addFeature(parentId, { position: rel })
      if (isFeature(source)) {
        store.addEdge({ type: 'dependsOn', source: id, target: source.id, attrs: {} })
      }
      ui.select(id)
    }
    closeMenus()
  }

  /** Commentaires (ouverts ou résolus) qui partiraient avec l'élément : les siens + ceux de sa
   *  descendance — le chiffre du confirm de suppression doit compter tout ce qui disparaît. */
  function commentsUnder(id: string): number {
    let count = store.commentsOf(id).length
    for (const d of store.descendantsOf(id)) count += store.commentsOf(d.id).length
    return count
  }

  function contextDelete(): void {
    const cm = contextMenu.value
    if (!cm) return
    const id = cm.nodeId
    closeMenus()
    const n = store.nodeById(id)
    if (!n) return
    const cascade = isFrame(n) ? store.descendantsOf(id).length : 0
    const attached = commentsUnder(id)
    if (cascade + attached > 0) {
      const ok = window.confirm(
        `Supprimer cet élément et ${cascade + attached} élément(s) rattaché(s) ? Réversible (Ctrl+Z).`,
      )
      if (!ok) return
    }
    store.removeNode(id)
    ui.clearSelection()
  }

  function contextSetHome(): void {
    const cm = contextMenu.value
    if (!cm) return
    const n = store.nodeById(cm.nodeId)
    if (n && isPage(n)) store.setHomePage(n.id)
    closeMenus()
  }

  function contextSetBlockType(blockType: BlockType): void {
    const cm = contextMenu.value
    if (!cm) return
    store.setBlockType(cm.nodeId, blockType)
    closeMenus()
  }

  /**
   * Ouvre la POPUP de création (retour Hugo 22/07) à côté de l'élément visé — le fil n'est créé
   * qu'à l'envoi du formulaire (CommentComposer), jamais vide.
   */
  function openCommentComposer(nodeId: string, range?: CommentComposerState['range']): void {
    ui.select(nodeId)
    commentComposer.value = { nodeId, ...(range ? { range } : {}) }
  }

  function closeCommentComposer(): void {
    commentComposer.value = null
  }

  function contextComment(): void {
    const cm = contextMenu.value
    if (!cm) return
    closeMenus()
    openCommentComposer(cm.nodeId)
  }

  /** Bulle de sélection de texte d'un bloc (RichEditor) → popup pré-ancrée sur le passage. */
  function onCommentRangeEvent(e: Event): void {
    const d = (e as CustomEvent<{ nodeId: string; range: { from: number; to: number; text: string } }>).detail
    if (d?.nodeId && d.range) openCommentComposer(d.nodeId, d.range)
  }
  window.addEventListener('flooow:comment-range', onCommentRangeEvent)
  onScopeDispose(() => window.removeEventListener('flooow:comment-range', onCommentRangeEvent))

  function applyEdgeType(type: EdgeType): void {
    const ep = edgePopover.value
    if (!ep) return
    store.setEdgeType(ep.edgeId, type)
    closeMenus()
  }

  function deleteEdgeFromPopover(): void {
    const ep = edgePopover.value
    if (!ep) return
    store.removeEdge(ep.edgeId)
    closeMenus()
  }

  // ── Création / suppression exposées à FlowCanvas ────────────────────────────
  /**
   * « Réorganiser » avec les hauteurs RÉELLES : délègue au store en lui passant la mesure Vue Flow
   * des cartes déjà rendues (le plancher estimé reste le repli). Déclenché par l'événement
   * `flooow:arrange-functional` (bouton du panneau « Liens longs »).
   */
  function arrangeFunctionalMeasured(): void {
    // `cardHeight` et non `dimensions.height` : le nœud reste collé à son `minHeight` estimé, donc
    // « Réorganiser » ré-empilait lui aussi sur l'estimation en croyant tenir la mesure.
    store.arrangeFunctional((id) => cardHeight(id) ?? undefined)
  }

  function createPageAt(position: { x: number; y: number }): void {
    ui.select(store.addPage({ position }))
  }

  /** Supprime les arêtes sélectionnées (Vue Flow). Les arêtes ne sont pas dans `ui.selection`. */
  function deleteSelectedEdges(): boolean {
    const sel = vf.getSelectedEdges.value.filter((e) => store.edges.some((x) => x.id === e.id))
    for (const e of sel) store.removeEdge(e.id)
    return sel.length > 0
  }

  // Suppression d'un lien sélectionné au clavier (Suppr/Retour arrière), quel que soit le focus.
  function onWindowDelete(e: KeyboardEvent): void {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (deleteSelectedEdges()) e.preventDefault()
  }
  window.addEventListener('keydown', onWindowDelete)
  onScopeDispose(() => window.removeEventListener('keydown', onWindowDelete))

  // (Resize manuel d'un module : plus rien à corriger — les positions des modules sont dérivées,
  // l'événement `flooow:reflow-modules` de ModuleFrame n'a plus d'abonné.)

  // Bouton « + » au survol d'une carte (FeatureNode) → créer une fonctionnalité adjacente.
  function onAddAdjacent(e: Event): void {
    const d = (e as CustomEvent<{ id: string; side: FeatureSide }>).detail
    if (d?.id && d.side) addAdjacentFeature(d.id, d.side)
  }
  window.addEventListener('flooow:add-adjacent', onAddAdjacent)
  onScopeDispose(() => window.removeEventListener('flooow:add-adjacent', onAddAdjacent))

  /**
   * Bouton « + » au survol d'une PAGE (PageFrame) : côtés = FRÈRE avant/après (sur une racine :
   * nouvelle racine posée au-delà de l'étendue de son arbre), bas = ENFANT en fin de fratrie.
   * Le placement réel est dérivé — on n'écrit que la parenté et une clé d'ordre.
   */
  type PageSide = 'left' | 'right' | 'bottom'
  function addAdjacentPage(pageId: string, side: PageSide): void {
    const page = store.nodeById(pageId)
    if (!page || !isPage(page)) return
    if (side === 'bottom') {
      const kids = childPages(page.id, store.nodes)
      const last = kids[kids.length - 1]
      ui.select(
        store.addPage({
          parentId: page.id,
          position: { x: last ? last.position.x + 10 : 0, y: 0 },
        }),
      )
    } else if (page.parentId == null) {
      // Frère d'une racine = NOUVELLE RACINE, insérée avant/après dans la RANGÉE des arbres
      // (position = simple clé d'ordre, le placement est dérivé).
      const roots = childPages(null, store.nodes)
      const i = roots.findIndex((r) => r.id === pageId)
      const index = side === 'right' ? i + 1 : Math.max(i, 0)
      ui.select(store.addPage({ position: { x: orderKeyAt(roots, index), y: 0 } }))
    } else {
      const sibs = childPages(page.parentId, store.nodes)
      const i = sibs.findIndex((s) => s.id === pageId)
      const index = side === 'right' ? i + 1 : Math.max(i, 0)
      ui.select(
        store.addPage({ parentId: page.parentId, position: { x: orderKeyAt(sibs, index), y: 0 } }),
      )
    }
  }
  function onAddAdjacentPage(e: Event): void {
    const d = (e as CustomEvent<{ id: string; side: PageSide }>).detail
    if (d?.id && d.side) addAdjacentPage(d.id, d.side)
  }
  window.addEventListener('flooow:add-adjacent-page', onAddAdjacentPage)
  onScopeDispose(() => window.removeEventListener('flooow:add-adjacent-page', onAddAdjacentPage))

  function deleteSelection(): void {
    if (deleteSelectedEdges()) return
    const ids = [...ui.selectedIds]
    if (!ids.length) return
    let cascade = 0
    for (const id of ids) {
      const n = store.nodeById(id)
      if (n && isFrame(n)) cascade += store.descendantsOf(id).length
      if (n) cascade += commentsUnder(id)
    }
    if (cascade > 0) {
      const ok = window.confirm(
        `Supprimer ${ids.length} élément(s) et ${cascade} rattaché(s) ? Réversible (Ctrl+Z).`,
      )
      if (!ok) return
    }
    for (const id of ids) store.removeNode(id)
    ui.clearSelection()
  }

  return {
    toFlowNodes,
    toFlowEdges,
    funcHighlight,
    orderBadges,
    snapGuides,
    dragGhost,
    pageGhost,
    pageSlot,
    blockDragging,
    deleteSelection,
    createPageAt,
    arrangeFunctionalMeasured,
    quickCreate,
    contextMenu,
    edgePopover,
    closeMenus,
    runQuickCreate,
    contextDelete,
    contextSetHome,
    contextSetBlockType,
    contextComment,
    commentComposer,
    closeCommentComposer,
    applyEdgeType,
    deleteEdgeFromPopover,
    openEdgeMenu,
  }
}

<script setup lang="ts">
// Instance Vue Flow : le canvas plein écran (format v2). Le graphe du store est **mappé** vers des
// nœuds/arêtes Vue Flow par useCanvasSync (mutation du store au drop/connect uniquement). Les menus
// contextuels (quick-create, clic droit, popover d'arête) sont rendus en overlay écran.
import { provide, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { VueFlow, useVueFlow, SelectionMode, ConnectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import {
  useCanvasSync,
  ORDER_BADGE_KEY,
  EDGE_MENU_KEY,
  PEER_SELECTION_KEY,
  FUNC_HIGHLIGHT_KEY,
} from './useCanvasSync'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isBlock } from '@flooow/core/model/types'
import BlockConfigPanel from '@/panels/BlockConfigPanel.vue'
import CommentComposer from '@/panels/CommentComposer.vue'
import { currentCollab, type Peer } from '@/collab/bridge'
import PresenceCursors from '@/collab/PresenceCursors.vue'
import PageFrame from './nodes/PageFrame.vue'
import BlockNode from './nodes/BlockNode.vue'
import PortalNode from './nodes/PortalNode.vue'
import ModuleFrame from './nodes/ModuleFrame.vue'
import LotFrame from './nodes/LotFrame.vue'
import FeatureNode from './nodes/FeatureNode.vue'
import TypedEdge from './edges/TypedEdge.vue'
import TreeEdge from './edges/TreeEdge.vue'
import QuickCreateMenu from './QuickCreateMenu.vue'
import ContextMenu from './ContextMenu.vue'
import EdgeTypePopover from './EdgeTypePopover.vue'
import { useGlLayer, glEnabled } from './gl/useGlLayer'
import { mountGlBackground } from './gl/background'
import { mountGlEdges } from './gl/edges'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const vf = useVueFlow()
const sync = useCanvasSync()
const ui = useUiStore()
const store = useProjectStore()

// (Couche GL : câblée plus bas, après lowDetailEdges dont elle dépend.)

/**
 * Ancrage du panneau de config d'un BLOC sélectionné : il se pose à côté de SA carte, pas dans la
 * colonne de droite. `null` = rien à afficher (aucun bloc seul en sélection).
 *
 * Le calcul vit ici parce qu'il lui faut le viewport, que seul ce composant tient : il dépend de
 * `vf.viewport` et se refait donc à chaque pan/zoom — le panneau colle à la carte au lieu de
 * flotter à une position figée pendant qu'elle s'en va.
 */
const BLOCK_PANEL_W = 288 // w-72, miroir de BlockConfigPanel
const BLOCK_PANEL_GAP = 24
const blockPanel = computed(() => {
  if (ui.selectedIds.length !== 1) return null
  const id = ui.selectedId
  if (!id) return null
  const n = store.nodeById(id)
  if (!n || !isBlock(n)) return null
  const gn = vf.findNode(id)
  if (!gn) return null
  const { x: vx, y: vy, zoom } = vf.viewport.value
  // L'écart HORIZONTAL se prend sur le cadre de la PAGE, pas sur le bloc. Un bloc est encarté dans
  // sa page (padding du PageFrame) : mesuré depuis le bloc, le panneau se posait dans cette marge et
  // chevauchait le cadre. La page est le bord visible dont il faut s'écarter.
  const page = n.parentId ? vf.findNode(n.parentId) : null
  const box = page ?? gn
  const boxLeft = box.computedPosition.x * zoom + vx
  const boxRight = boxLeft + (box.dimensions.width || 0) * zoom
  // Le CALAGE VERTICAL reste celui du bloc : c'est lui qu'on édite, le panneau doit se lire à sa
  // hauteur — sur une page qui empile beaucoup de sections, s'aligner sur la page le renverrait
  // loin au-dessus de la carte sélectionnée.
  const top = gn.computedPosition.y * zoom + vy
  // À droite de la page par défaut ; à gauche s'il n'y tient pas. Le repli se décide sur la largeur
  // de la FENÊTRE plutôt que sur celle du canvas : quand un split docke un rail, le canvas est déjà
  // décalé d'autant, et les deux mesures se rejoignent là où ça compte (le bord droit de l'écran).
  const overflowsRight =
    boxRight + BLOCK_PANEL_GAP + BLOCK_PANEL_W > window.innerWidth - BLOCK_PANEL_GAP
  const x = overflowsRight ? boxLeft - BLOCK_PANEL_GAP - BLOCK_PANEL_W : boxRight + BLOCK_PANEL_GAP
  return { id, x: Math.max(BLOCK_PANEL_GAP, x), y: Math.max(BLOCK_PANEL_GAP, top) }
})

/**
 * Popup de création de commentaire (retour Hugo 22/07) : ancrée à côté de l'élément visé, même
 * mécanique de positionnement que le panneau de config de bloc (dépend du viewport → suit la
 * carte au pan/zoom). Pour un bloc, l'écart horizontal se prend sur le cadre de sa PAGE.
 */
const COMPOSER_W = 320 // w-80, miroir de CommentComposer
const COMPOSER_GAP = 16
const composerPos = computed(() => {
  const st = sync.commentComposer.value
  if (!st) return null
  const gn = vf.findNode(st.nodeId)
  if (!gn) return null
  const { x: vx, y: vy, zoom } = vf.viewport.value
  const n = store.nodeById(st.nodeId)
  const page = n && isBlock(n) && n.parentId ? vf.findNode(n.parentId) : null
  const box = page ?? gn
  const boxLeft = box.computedPosition.x * zoom + vx
  const boxRight = boxLeft + (box.dimensions.width || 0) * zoom
  const top = gn.computedPosition.y * zoom + vy
  const overflowsRight = boxRight + COMPOSER_GAP + COMPOSER_W > window.innerWidth - COMPOSER_GAP
  const x = overflowsRight ? boxLeft - COMPOSER_GAP - COMPOSER_W : boxRight + COMPOSER_GAP
  return { x: Math.max(COMPOSER_GAP, x), y: Math.max(COMPOSER_GAP, top) }
})

/**
 * Seuil de zoom sous lequel le CONTENU des cartes n'est plus rendu (niveau de détail).
 *
 * Comme pour ZOOM_ANIM_MIN dans TypedEdge, ce n'est pas un réglage esthétique mais la correction
 * d'un coût mesuré — et cette fois mesuré PENDANT un pan, pas au repos (au repos le canvas tient
 * ses 60 fps : le coût n'existe que quand la transformation change et force à tout re-rastériser).
 *
 * Profil sur le projet locasyst (99 nœuds, 84 arêtes), pan piloté image par image à zoom 0,117 :
 * 88 ms par image (11 fps) et 78 tâches longues. Attribution par détachement du DOM — le seul test
 * fiable, `visibility:hidden` sur le conteneur ne cachait RIEN (Vue Flow réaffirme
 * `visibility:visible` sur `.vue-flow__node`, le calcul retournait bien « visible ») :
 *   · cartes retirées, arêtes gardées → 18 ms/image, 56 fps, ZÉRO tâche longue ;
 *   · arêtes retirées, cartes gardées → 94 ms/image, 11 fps, 77 tâches longues.
 * Les arêtes sont donc hors de cause, contrairement à l'intuition des « nombreux petits tracés » :
 * tout le coût vient des ~4 500 éléments intérieurs des cartes (dont ~2 000 porteurs de texte),
 * re-rastérisés à chaque image parce que la position sous-pixel des glyphes change.
 *
 * Le seuil est le remède exact du symptôme : les tâches longues n'apparaissent QUE sous ~0,35, et
 * c'est précisément là que le texte devient illisible. À 0,117 toutes les tailles de police du
 * canvas rendent entre 0,94 px et 1,88 px — on paie le rendu de glyphes que personne ne peut lire.
 *
 * `visibility` et pas `content-visibility` (aussi rapide : 37 ms contre 38 ms) parce qu'elle est
 * NEUTRE POUR LA MISE EN PAGE : aucune boîte ne change de taille (vérifié au pixel), donc ni
 * cardMetrics ni le ResizeObserver des cartes ne voient passer quoi que ce soit.
 *
 * ── Du masquage au GREEKING (barres grises façon Figma) ──────────────────────────────────────────
 * Le premier correctif masquait tout l'intérieur (`> * > *`). Il tenait la performance mais vidait
 * la carte — et, pour les fonctionnalités, la faisait DISPARAÎTRE : `.feature-node` est au 2e niveau,
 * c'est lui qui porte fond, bordure et ombre, il tombait donc avec le contenu. On ne voyait plus que
 * les cadres module et lot.
 *
 * On remplace donc le texte par des barres au lieu de tout cacher. Trois mesures ont conduit là
 * (pan piloté par `setViewport` à zoom 0,117, campagnes entrelacées pour absorber la dérive
 * machine ; référence masquage ≈ 49 fps, sans LOD du tout ≈ 12 fps / 49 tâches longues) :
 *
 *   1. `color: transparent` sur le texte ne sert À RIEN : 13,8 fps contre 12,1 sans LOD. Chrome
 *      rastérise les glyphes même invisibles. Seul un `visibility:hidden` supprime vraiment le coût,
 *      d'où des barres peintes en `::before` (le pseudo reprend `visibility:visible`, ce qui le rend
 *      visible sous un parent caché) plutôt qu'un fond posé sur l'élément textuel lui-même.
 *   2. Repeindre le chrome des cartes coûtait 15 fps (49 → 33) — et le coupable n'était ni l'ombre
 *      (33,1 → 34,6 sans elle) ni la bordure, mais le RAYON DES COINS : à `border-radius: 0` on
 *      remonte à 58,5 fps, soit PLUS vite que le masquage d'origine. Arrondir 82 cartes impose un
 *      clip par coin à chaque image ; à 0,117 un rayon de 8 px rend 0,94 px, personne ne le voit.
 *      On carre donc les coins sous le seuil : gain massif, invisible, et sans effet de mise en page
 *      (le rayon ne change aucune boîte).
 *   3. Le coût croît avec le NOMBRE de barres (34,9 fps si on greeke les ~1 640 éléments porteurs de
 *      texte). Même réduit au texte structurant, le squelette restait à 425 barres.
 *
 * ── Abandon du squelette : la carte devient une boîte NUE ─────────────────────────────────────────
 * Le greeking a fini par être retiré, et c'est un arbitrage assumé en faveur de la vitesse. Deux
 * constats l'ont emporté :
 *
 *   a. Il ne se voyait pas. À zoom 0,117 une carte entière rend ~88 px de haut : une barre de titre
 *      y fait moins de 2 px, un libellé de champ moins d'un. Le « squelette » ne se lisait pas comme
 *      une structure, seulement comme du bruit gris dans une boîte.
 *   b. Il se payait cash. Chaque barre est un `::before` peint par-dessus la carte, et le pan
 *      repeint tout : 425 barres coûtaient ~10 fps face au masquage nu, pour cette fidélité-là.
 *
 * Sous le seuil, une carte est donc une BOÎTE VIDE : son fond, sa bordure et son ombre (portés par
 * les conteneurs, qui restent peints) suffisent à dire « il y a une carte ici, elle a cette taille,
 * elle est à cet endroit » — la seule information exploitable à cette échelle. La composition
 * interne, elle, redevient lisible dès qu'on repasse le seuil, c'est-à-dire dès qu'on peut la voir.
 *
 * Le même raisonnement a fini par emporter les LIENS et les PORTS. Un lien rend un filet sous-pixel
 * qui ne dit plus quoi relie quoi, et un port fait 6 px de large à l'échelle 1, donc 0,7 px ici ;
 * mais les 84 arêtes et leurs 168 tracés se rastérisent à chaque image de pan. On ne garde donc, sous
 * le seuil, que la CARTE des positions : des boîtes vides sur fond nu. Attention si l'on y revient :
 * les ports doivent être masqués par `visibility`, jamais retirés du flux — voir la règle dédiée.
 *
 * Attention si l'on remet un jour du contenu ici : ne PAS élargir le masquage aux conteneurs. La
 * règle 1 ne cache que les FEUILLES, et c'est délibéré — une première version en `> * > *` faisait
 * disparaître les cartes de fonctionnalité, parce que `.feature-node` est au 2e niveau et porte
 * justement fond, bordure et ombre. Cacher les conteneurs, c'est cacher la carte.
 *
 * Neutralité de mise en page vérifiée de part et d'autre du seuil sur les boîtes observées par le
 * `ResizeObserver` (nœuds, cartes, bacs) : aucun écart. C'est l'invariant à ne jamais casser — ce
 * `ResizeObserver` alimente le registre de hauteurs du layout, et une boîte qui bouge au
 * franchissement du seuil relance un calcul de mise en page complet. Il tient ici par construction :
 * `visibility: hidden` et `border-radius: 0` ne participent à aucun calcul de boîte.
 */
const ZOOM_LOD_MIN = 0.35
// Recalculé à chaque image de pan, mais ne produit qu'un BOOLÉEN : tant qu'il ne bascule pas, la
// classe ne change pas et aucun style n'est invalidé.
// `ui.fullCards` (« Toujours afficher le contenu des cartes », Réglages d'affichage) court-circuite
// le LOD — réglage vivant, pas un drapeau de session : basculer prend effet sans recharger.
const lowDetail = computed(() => !ui.fullCards && vf.viewport.value.zoom < ZOOM_LOD_MIN)
// Le masquage LOD des ARÊTES ne vaut que pour la couche FONCTIONNELLE (le coût mesuré : 84 svg de
// dependsOn repeints à chaque image de pan). En couche STRUCTURELLE (v13), c'est l'inverse qui
// compte : au fitView, l'arbre et les navigations sont LA seule lecture utile — leurs traits sont
// contre-zoomés (TreeEdge/TypedEdge) pour rester lisibles, et il y en a dix fois moins.
const lowDetailEdges = computed(() => lowDetail.value && ui.canvasLayer === 'functional')

// ── Couche GL sous le pane (phase 2 — plan-phase2-gl.md) ────────────────────────────────────────
// Jalon 1 : hôte + caméra suivie + fond de grille (remplace <Background>). Jalon 2 : arêtes
// fonctionnelles (dessin des specs publiées par TypedEdge dans edgeChannel). Drapeau de repli :
// localStorage['flooow:gl'] = '0' → couche absente, rendus DOM d'origine.
const glHost = ref<HTMLElement | null>(null)
const glOn = glEnabled()
let glBg: { update: () => void } | null = null
let glEdges: { setVisible: (v: boolean) => void; dispose: () => void } | null = null
if (glOn) {
  void useGlLayer(glHost, vf).then((layer) => {
    glBg = mountGlBackground(layer, vf, () => ui.fullCards)
    glEdges = mountGlEdges(layer)
    glEdges.setVisible(!lowDetailEdges.value)
  })
  onBeforeUnmount(() => glEdges?.dispose())
  // Watchers enregistrés SYNCHRONEMENT (scope du composant) : posés dans le .then, ils
  // survivraient au démontage. Le fond recadre son quad à chaque caméra ; les arêtes GL suivent
  // le même seuil LOD que leur ancien rendu SVG (lowDetailEdges).
  watch(vf.viewport, () => glBg?.update())
  watch(lowDetailEdges, (v) => glEdges?.setVisible(!v))
  watch(() => ui.fullCards, () => glBg?.update())
}

/*
 * Contre-zoom des NOMS de cadre (lot, module) et des anneaux « commenté » : DÉPLACÉ dans
 * `counterZoom.ts` (phase 1 de la refonte canvas). Le LOD ci-dessus vide les cartes dès 0,35 mais
 * exempte ces libellés (voir les `:not(.zoom-label)` plus bas) — l'intention visuelle est intacte.
 * Ce qui a changé : la variable CSS n'est PLUS posée ici, sur la racine — écrire une custom
 * property sur la racine invalidait le style des ~5 300 éléments du canvas à chaque image de zoom
 * (c'était TOUT le coût du zoom continu de la baseline). Chaque consommateur la porte désormais
 * inline via `useCounterZoomVars` — et ce composant ne re-rend plus à chaque image de zoom.
 */

/*
 * La grille de fond est RETIRÉE sous ce même seuil (voir le `v-if` sur <Background>) : c'est le
 * deuxième coût du pan une fois les cartes traitées, 33 ms/image avec elle contre 22 ms sans, soit
 * un tiers du budget. `<Background>` peint un `<rect>` PLEIN ÉCRAN dont l'origine du motif se décale
 * à chaque déplacement : tout l'écran est donc repeint à chaque image, et c'est ce repeint qui coûte.
 *
 * Piste écartée parce que MESURÉE et non concluante : réduire la DENSITÉ du motif. À zoom 0,117 la
 * tuile fait 2,8 px, soit ~186 000 pastilles sous-pixel (rayon 0,08 px) ; en doublant le pas par
 * puissances de deux on tombe à ~2 900 pastilles — 64 fois moins — et le temps par image ne bouge
 * pas (33,4 ms contre 32,7 ms). Ce n'est donc pas le NOMBRE de points qui coûte mais la SURFACE
 * repeinte, et seule la disparition du fond la supprime. D'où le `v-if` plutôt qu'un pas adaptatif,
 * qui aurait éclairci la grille sans rien gagner.
 *
 * Le seuil se justifie aussi à l'œil : à cette échelle les points sont espacés de moins de 3 px pour
 * un rayon de 0,08 px — ce n'est plus une grille, c'est un voile gris uniforme.
 */

// Lignes de magnétisme (monde → écran via le viewport) affichées pendant le drag d'une page.
const guideLines = computed(() => {
  const { x: vx, y: vy, zoom } = vf.viewport.value
  return {
    v: sync.snapGuides.value.v.map((wx) => wx * zoom + vx),
    h: sync.snapGuides.value.h.map((wy) => wy * zoom + vy),
  }
})

// Fantôme d'emplacement (monde → écran) pendant le drag d'une fonctionnalité : rectangle pointillé
// violet animé posé sur l'emplacement magnétisé prédit.
const ghostRect = computed(() => {
  const g = sync.dragGhost.value
  if (!g) return null
  const { x: vx, y: vy, zoom } = vf.viewport.value
  return { x: g.x * zoom + vx, y: g.y * zoom + vy, w: g.w * zoom, h: g.h * zoom }
})

// Drag de page façon Octopus (v13) : FANTÔME estompé à la place d'origine de la carte saisie
// (tant que le trou d'origine existe), et SLOT pointillé sky à l'emplacement de dépôt courant
// (absent = emplacement interdit → annulation). Monde → écran comme ghostRect ; la classe
// `page-dragging` active les transitions d'écartement. Pendant un geste, au moins l'un des deux
// est présent (origine → les deux, slot ailleurs → slot seul, interdit → fantôme seul).
const pageDragging = computed(() => sync.pageGhost.value != null || sync.pageSlot.value != null)
const pageGhostRect = computed(() => {
  const g = sync.pageGhost.value
  if (!g) return null
  const { x: vx, y: vy, zoom } = vf.viewport.value
  return {
    x: g.x * zoom + vx,
    y: g.y * zoom + vy,
    w: g.w * zoom,
    h: g.h * zoom,
    label: g.label,
    fontSize: Math.max(12 * zoom, 8),
  }
})
const pageSlotRect = computed(() => {
  const s = sync.pageSlot.value
  if (!s) return null
  const { x: vx, y: vy, zoom } = vf.viewport.value
  return { x: s.x * zoom + vx, y: s.y * zoom + vy, w: s.w * zoom, h: s.h * zoom }
})

// Badges d'ordre « #n » live pendant le drag d'un bloc, lus par BlockNode.
provide(ORDER_BADGE_KEY, sync.orderBadges)
// Ouverture du popover d'arête depuis une pastille portail (clic droit).
provide(EDGE_MENU_KEY, sync.openEdgeMenu)
// Mise en avant de chaîne (sélection) : lue en direct par FeatureNode/TypedEdge — un clic ne
// re-mappe plus le graphe (phase 1 refonte canvas), il ne change que des classes.
provide(FUNC_HIGHLIGHT_KEY, sync.funcHighlight)

// ── Présence collab : curseurs des pairs + sélection partagée (jalon 7) ─────────
// Session récupérée en singleton (le canvas est rendu via <component :is> dynamique
// dans EditorView) ; null hors collab → les features de présence sont inertes.
const collab = currentCollab()
const peers = collab?.peers ?? ref<Peer[]>([])

// id de nœud → couleurs des pairs qui le sélectionnent, lu par les node components.
const peerSelections = computed(() => {
  const map = new Map<string, string[]>()
  for (const p of peers.value) {
    if (p.isSelf) continue
    for (const id of p.selection) {
      const colors = map.get(id)
      if (colors) colors.push(p.user.color)
      else map.set(id, [p.user.color])
    }
  }
  return map
})
provide(PEER_SELECTION_KEY, peerSelections)

// Publication du curseur local en coordonnées MONDE, throttlée (trailing) à ~30 Hz :
// limite le débit réseau awareness sans figer la dernière position.
const CURSOR_THROTTLE_MS = 33
let cursorTimer: ReturnType<typeof setTimeout> | undefined
let lastPointer: { x: number; y: number } | null = null
function onPointerMove(event: PointerEvent): void {
  if (!collab) return
  lastPointer = { x: event.clientX, y: event.clientY }
  if (cursorTimer) return
  cursorTimer = setTimeout(() => {
    cursorTimer = undefined
    const rect = vf.vueFlowRef.value?.getBoundingClientRect()
    if (!rect || !lastPointer) return
    collab.setCursor(vf.project({ x: lastPointer.x - rect.left, y: lastPointer.y - rect.top }))
  }, CURSOR_THROTTLE_MS)
}
function onPointerLeave(): void {
  if (!collab) return
  if (cursorTimer) {
    clearTimeout(cursorTimer)
    cursorTimer = undefined
  }
  lastPointer = null
  collab.setCursor(null)
}

/** Double-clic sur le fond = créer une page à cet endroit. */
function onPaneDblClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.vue-flow__node')) return
  const rect = vf.vueFlowRef.value?.getBoundingClientRect()
  if (!rect) return
  const pos = vf.project({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  sync.createPageAt(pos)
}

/** Suppression au clavier avec confirmation en cascade (garde-fou : champ de saisie exclu). */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  const el = event.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
  event.preventDefault()
  sync.deleteSelection()
}

// Retour visuel : Espace maintenu = mode déplacement (grab). Vue Flow gère le pan lui-même
// (panActivationKeyCode='Space') ; on ne fait qu'ajouter la classe de curseur, sans preventDefault
// et sans réagir quand le focus est dans un champ de saisie.
const spaceHeld = ref(false)
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}
function onSpaceDown(e: KeyboardEvent): void {
  if (e.code === 'Space' && !isEditable(e.target)) spaceHeld.value = true
}
function onSpaceUp(e: KeyboardEvent): void {
  if (e.code === 'Space') spaceHeld.value = false
}
// Recadrage (ZoomBar « fit », ⇧1, action « Réorganiser ») : centre et ajuste le zoom sur le contenu.
function onZoomFit(): void {
  void vf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 })
}
// « Réorganiser » (panneau « Liens longs ») : ré-empilement avec les hauteurs RÉELLES des cartes
// (mesure Vue Flow), que seul le canvas connaît — d'où l'événement, comme pour zoom-fit.
function onArrangeFunctional(): void {
  sync.arrangeFunctionalMeasured()
  onZoomFit()
}
onMounted(() => {
  window.addEventListener('keydown', onSpaceDown)
  window.addEventListener('keyup', onSpaceUp)
  window.addEventListener('flooow:zoom-fit', onZoomFit)
  window.addEventListener('flooow:arrange-functional', onArrangeFunctional)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSpaceDown)
  window.removeEventListener('keyup', onSpaceUp)
  window.removeEventListener('flooow:zoom-fit', onZoomFit)
  window.removeEventListener('flooow:arrange-functional', onArrangeFunctional)
  // Bascule de mode (specs/api/…) : le canvas disparaît mais la session collab reste
  // vivante → efface le curseur publié pour ne pas le laisser figé chez les pairs.
  onPointerLeave()
})
</script>

<template>
  <div
    class="flooow-canvas h-full w-full outline-hidden"
    :class="{
      'space-pan': spaceHeld,
      'flooow-lod': lowDetail,
      'flooow-lod-edges': lowDetailEdges,
      'flooow-full': ui.fullCards,
      'page-dragging': pageDragging,
      'block-dragging': sync.blockDragging.value,
    }"
    tabindex="0"
    @keydown="onKeydown"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <!-- Couche GL (phase 2) : SOUS le pane Vue Flow (tous deux transparents), non interactive —
         toute l'interaction reste au DOM. Le canvas Pixi est inséré ici par useGlLayer. -->
    <div v-if="glOn" ref="glHost" class="gl-layer absolute inset-0" aria-hidden="true" />
    <!--
      `elevate-nodes-on-select` est DÉSACTIVÉ : par défaut Vue Flow ajoute +1000 au z-index du nœud
      sélectionné, ce qui passe par-dessus notre empilement déclaré. Concrètement, sélectionner un
      cadre de module (zIndex 0, fond violet translucide) le faisait remonter au-dessus de ses
      propres cartes (zIndex 2) : elles paraissaient délavées et le cadre avalait leurs clics. Notre
      empilement est entièrement décidé dans useCanvasSync (module 0 < liens 1 < cartes 2 < arêtes
      EDGE_Z) et n'a pas besoin de cette élévation : l'état sélectionné se voit à la bordure/l'anneau.
    -->
    <VueFlow
      :delete-key-code="null"
      :multi-selection-key-code="'Shift'"
      :min-zoom="0.1"
      :max-zoom="4"
      :connection-radius="60"
      :elevate-nodes-on-select="false"
      :connection-mode="ConnectionMode.Loose"
      :default-viewport="{ x: 40, y: 40, zoom: 1 }"
      :pan-on-drag="false"
      :selection-key-code="true"
      :selection-mode="SelectionMode.Partial"
      :pan-activation-key-code="'Space'"
      :pan-on-scroll="true"
      :zoom-on-scroll="false"
      :zoom-on-double-click="false"
      @dblclick="onPaneDblClick"
    >
      <template #node-page="props">
        <PageFrame v-bind="props" />
      </template>
      <template #node-block="props">
        <BlockNode v-bind="props" />
      </template>
      <template #node-portal="props">
        <PortalNode v-bind="props" />
      </template>
      <template #node-module="props">
        <ModuleFrame v-bind="props" />
      </template>
      <template #node-lot="props">
        <LotFrame v-bind="props" />
      </template>
      <template #node-feature="props">
        <FeatureNode v-bind="props" />
      </template>
      <template #edge-typed="props">
        <TypedEdge v-bind="props" />
      </template>
      <template #edge-tree="props">
        <TreeEdge v-bind="props" />
      </template>

      <!-- Fond DOM : seulement en REPLI (flooow:gl='0') — la grille vit en GL depuis la phase 2
           (gl/background.ts, parité exacte de ces props ; le seuil LOD y est répliqué). -->
      <Background v-if="!glOn && !lowDetail" color="#cbd5e1" :gap="24" :size="1.4" />
      <!-- Ni <Controls /> ni <MiniMap /> Vue Flow ici : les deux ont été retirés du canvas. Les
           Controls doublonnaient la ZoomBar du calque de panneaux (même coin, mêmes actions) ; la
           minimap occupait le coin bas-droit en permanence pour une vue d'ensemble que « Ajuster à
           la vue » donne à la demande. Un seul îlot de navigation, celui du design system. -->

      <!-- Guides de magnétisme (alignement des pages) pendant le drag -->
      <svg class="snap-guides" aria-hidden="true">
        <line v-for="(sx, i) in guideLines.v" :key="`v${i}`" :x1="sx" y1="0" :x2="sx" y2="100%" />
        <line v-for="(sy, i) in guideLines.h" :key="`h${i}`" x1="0" :y1="sy" x2="100%" :y2="sy" />
      </svg>

      <!-- Fantôme d'emplacement (drag d'une fonctionnalité) : contour pointillé violet animé -->
      <svg v-if="ghostRect" class="drag-ghost" aria-hidden="true">
        <rect :x="ghostRect.x" :y="ghostRect.y" :width="ghostRect.w" :height="ghostRect.h" rx="8" ry="8" />
      </svg>

      <!-- Drag de page (v13) : fantôme estompé à l'origine + slot d'insertion pointillé sky -->
      <svg v-if="pageGhostRect" class="page-drag-ghost" aria-hidden="true">
        <rect
          :x="pageGhostRect.x"
          :y="pageGhostRect.y"
          :width="pageGhostRect.w"
          :height="pageGhostRect.h"
          rx="8"
          ry="8"
        />
        <text
          :x="pageGhostRect.x + 10"
          :y="pageGhostRect.y + pageGhostRect.fontSize + 8"
          :font-size="pageGhostRect.fontSize"
        >{{ pageGhostRect.label }}</text>
      </svg>
      <svg v-if="pageSlotRect" class="page-drag-slot" aria-hidden="true">
        <rect
          :x="pageSlotRect.x"
          :y="pageSlotRect.y"
          :width="pageSlotRect.w"
          :height="pageSlotRect.h"
          rx="8"
          ry="8"
        />
      </svg>

      <!-- Curseurs des autres utilisateurs (présence collab) -->
      <PresenceCursors :peers="peers" />
    </VueFlow>

    <!-- Config du bloc sélectionné, ancrée à sa carte (position calculée ci-dessus). `fixed` comme
         les autres overlays écran : les coordonnées sont déjà en pixels de fenêtre. -->
    <div
      v-if="blockPanel"
      class="fixed z-40"
      :style="{ left: `${blockPanel.x}px`, top: `${blockPanel.y}px` }"
    >
      <BlockConfigPanel :key="blockPanel.id" :block-id="blockPanel.id" />
    </div>

    <!-- Popup de création de commentaire, ancrée à l'élément visé (outil 💬 / menu / sélection
         de texte). Rendue en overlay écran, comme le panneau de config de bloc. -->
    <div
      v-if="sync.commentComposer.value && composerPos"
      class="fixed z-40"
      :style="{ left: `${composerPos.x}px`, top: `${composerPos.y}px` }"
    >
      <CommentComposer
        :key="sync.commentComposer.value.nodeId"
        :node-id="sync.commentComposer.value.nodeId"
        :range="sync.commentComposer.value.range"
        @close="sync.closeCommentComposer"
      />
    </div>

    <!-- Overlays écran : menus contextuels -->
    <QuickCreateMenu
      v-if="sync.quickCreate.value"
      :x="sync.quickCreate.value.screenX"
      :y="sync.quickCreate.value.screenY"
      @select="sync.runQuickCreate"
      @close="sync.closeMenus"
    />
    <ContextMenu
      v-if="sync.contextMenu.value"
      :x="sync.contextMenu.value.screenX"
      :y="sync.contextMenu.value.screenY"
      :node-id="sync.contextMenu.value.nodeId"
      @delete="sync.contextDelete"
      @set-home="sync.contextSetHome"
      @set-block-type="sync.contextSetBlockType"
      @comment="sync.contextComment"
      @close="sync.closeMenus"
    />
    <EdgeTypePopover
      v-if="sync.edgePopover.value"
      :x="sync.edgePopover.value.screenX"
      :y="sync.edgePopover.value.screenY"
      :current="sync.edgePopover.value.current"
      :choices="sync.edgePopover.value.choices"
      @select="sync.applyEdgeType"
      @remove="sync.deleteEdgeFromPopover"
      @close="sync.closeMenus"
    />
    <!-- Capteur de fermeture : clic hors menu ferme les overlays -->
    <div
      v-if="sync.quickCreate.value || sync.contextMenu.value || sync.edgePopover.value"
      class="fixed inset-0 z-40"
      @pointerdown="sync.closeMenus"
      @contextmenu.prevent="sync.closeMenus"
    />
  </div>
</template>

<style scoped>
/* Espace maintenu → curseur main (le drag panne, géré par Vue Flow). */
.flooow-canvas.space-pan :deep(.vue-flow__pane) {
  cursor: grab;
}
.flooow-canvas.space-pan :deep(.vue-flow__pane:active) {
  cursor: grabbing;
}
/* Niveau de détail très dézoomé (voir ZOOM_LOD_MIN) : la carte devient une BOÎTE NUE. Elle garde sa
   position, sa taille et son chrome (fond, bordure, ombre) ; tout son contenu disparaît.
   Effet de bord assumé : un élément en `visibility:hidden` n'est plus cliquable. Les commandes
   internes d'une carte deviennent donc inertes sous le seuil — elles font moins d'un pixel, on ne
   pouvait pas les viser ; la carte, elle, reste sélectionnable et déplaçable. */

/* 1. On coupe le CONTENU au niveau du conteneur qui porte le chrome, un seul `visibility:hidden` par
      carte au lieu d'un par feuille de texte. Ce conteneur reste peint — c'est LUI la carte — mais
      tout ce qu'il contient tombe d'un coup : textes, mais aussi le chrome des éléments internes
      (bordures et fonds des selects de statut et de champ, pastilles, séparateurs), que le masquage
      feuille-à-feuille laissait passer parce qu'un select n'est pas une feuille.
      Ne PAS remonter le masquage d'un cran : `.feature-node` & co sont au 2e niveau du nœud, les
      cacher eux ferait disparaître la carte entière au lieu de la vider (régression déjà vue).
      `.zoom-label` (nom du lot, nom du module) est la seule EXCEPTION : cf. `counterZoom.ts` — c'est
      le texte qu'on vient lire en dézoomant, il survit au masquage et prend le contre-zoom. */
.flooow-canvas.flooow-lod
  :deep(
    .vue-flow__node
      :is(.feature-node, .block-node, .page-frame, .module-frame, .lotbox, .portal-pill)
      > *:not(.vue-flow__handle):not(.zoom-label)
  ) {
  visibility: hidden;
}
/* Filet générique : les feuilles restantes (types de nœuds sans conteneur énuméré ci-dessus, et
   commandes flottantes ancrées HORS de la carte comme la pastille d'édition en surplomb). Toutes
   sont hors flux ou sans influence sur la boîte : les masquer ne déplace rien.
   `:not(.zoom-label *)` protège l'INTÉRIEUR des libellés exemptés : le nom d'un lot est un `<span>`
   feuille, la règle l'aurait recaché un cran plus bas que la règle 1. */
.flooow-canvas.flooow-lod
  :deep(
    .vue-flow__node
      *:not(:has(*)):not(svg):not(.vue-flow__handle):not(.zoom-label):not(.zoom-label *)
  ),
.flooow-canvas.flooow-lod :deep(.vue-flow__node .edit-pill) {
  visibility: hidden;
}
/* Les PORTS. Exclus de la règle 1 pour être traités ici à part, parce que le raisonnement n'est pas
   le même : ce ne sont pas des pastilles décoratives, Vue Flow LIT leur géométrie
   (`getBoundingClientRect` → `handleBounds`) pour ancrer les liens. D'où `visibility` et jamais
   `display:none` : un élément caché conserve sa boîte et ses bounds, un élément retiré du flux les
   perd — et on récupérerait des liens ancrés en (0,0) au repassage du seuil. */
.flooow-canvas.flooow-lod :deep(.vue-flow__handle) {
  visibility: hidden;
}
/* Les LIENS — couche FONCTIONNELLE seulement (classe dédiée, cf. lowDetailEdges). Sous le seuil
   ils rendent des filets sous-pixel qui n'apprennent plus rien, alors qu'ils coûtent le repeint de
   84 svg / 168 tracés à chaque image de pan — le pan translate le conteneur, mais chaque tracé
   reste à rastériser. On masque les conteneurs d'arêtes plutôt que les tracés : 84 éléments à
   styler au lieu de 168, et les marqueurs de flèche tombent avec. Les arêtes sont en position
   absolue dans leur propre calque, hors du flux des nœuds : rien à craindre côté mise en page.
   En couche STRUCTURELLE les arêtes restent visibles au dézoom (v13) : arbre et navigations sont
   contre-zoomés pour être précisément la lecture du fitView. */
.flooow-canvas.flooow-lod-edges :deep(.vue-flow__edges) {
  visibility: hidden;
}
/* Icônes et pastilles purement décoratives. */
.flooow-canvas.flooow-lod :deep(.vue-flow__node svg),
.flooow-canvas.flooow-lod :deep(.vue-flow__node .feat-lock) {
  visibility: hidden;
}

/* 2. Coins carrés sous le seuil : c'est LE gain (voir le bloc de commentaire du script — 33 → 58 fps).
      Le rayon ne participe à aucun calcul de boîte, la mise en page ne bouge donc pas d'un pixel. */
.flooow-canvas.flooow-lod :deep(.vue-flow__node *) {
  border-radius: 0;
}

/* 3. PAS DE SQUELETTE. Le greeking a été retiré : voir le bloc de commentaire du script. */
/* Guides de magnétisme : lignes fines par-dessus le canvas, non interactives. */
.snap-guides {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
  overflow: visible;
}
.snap-guides line {
  stroke: #ec4899;
  stroke-width: 1;
  stroke-dasharray: 4 3;
}
/* Fantôme d'emplacement : contour pointillé violet + « marching ants » (défilement des tirets). */
.drag-ghost {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
  overflow: visible;
}
.drag-ghost rect {
  fill: rgba(139, 92, 246, 0.08);
  stroke: #8b5cf6;
  stroke-width: 2;
  stroke-dasharray: 7 5;
  animation: ghost-march 0.5s linear infinite;
}
@keyframes ghost-march {
  to {
    stroke-dashoffset: -12;
  }
}

/* ── Drag de page façon Octopus (v13) ─────────────────────────────────────────────────────────── */
/* Écartement ANIMÉ des voisins pendant le geste : transition posée SEULEMENT pendant un drag de
   page (classe page-dragging) pour ne rien ralentir le reste du temps. Plus aucune exclusion :
   la carte saisie ne suit pas le curseur (elle est MAINTENUE à sa place par pageDragStep, c'est le
   fantôme qui suit le pointeur), donc elle aussi peut transitionner quand le slot fantôme la
   décale. Les blocs transitionnent au même rythme que leur page : le couple bouge d'un seul
   tenant. */
.flooow-canvas.page-dragging :deep(.vue-flow__node-page),
.flooow-canvas.page-dragging :deep(.vue-flow__node-block) {
  transition: transform 150ms ease;
}
/* Même écartement animé pour la RÉORGANISATION DES BLOCS dans leur page (v13) : les voisins
   s'écartent vers l'index visé pendant qu'un bloc est saisi. */
.flooow-canvas.block-dragging :deep(.vue-flow__node-block:not(.dragging)) {
  transition: transform 150ms ease;
}
/* La PAGE réagit au slot pendant un drag de bloc : sa hauteur suit la pile de preview
   (applyBlockStackPreview écrit le style en live) — animée au même rythme que l'écartement des
   blocs, pour que le cadre grandisse d'un seul tenant avec le trou qui s'ouvre. */
.flooow-canvas.block-dragging :deep(.vue-flow__node-page) {
  transition: height 150ms ease;
}
/* « Toujours afficher le contenu des cartes » (ui.fullCards) coupe AUSSI la virtualisation : en
   `content-visibility: auto`, une carte jamais affichée se rend à sa PREMIÈRE entrée dans le
   viewport — au pan, ça saccade précisément au moment du geste (retour Hugo, net après refresh
   où rien n'est encore rendu). Le réglage signifie « tout est toujours rendu » : tout se paie UNE
   fois à l'ouverture, plus jamais pendant le déplacement. Réglage par machine — le repli LOD +
   virtualisation reste le défaut pour les machines modestes. */
.flooow-canvas.flooow-full :deep(.feat-innards),
.flooow-canvas.flooow-full :deep(.block-innards) {
  content-visibility: visible;
}

/* Couche GL (phase 2) : strictement décorative — jamais une cible de pointeur ; le canvas Pixi
   est dimensionné par useGlLayer (ResizeObserver sur l'hôte). */
.gl-layer {
  pointer-events: none;
}
.gl-layer :deep(canvas) {
  display: block;
}

/* Fantôme : la silhouette de la carte saisie, qui SUIT LE POINTEUR (la vraie carte et ses liens
   restent à leur place pendant tout le geste). */
.page-drag-ghost {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 7;
  overflow: visible;
}
.page-drag-ghost rect {
  fill: rgba(255, 255, 255, 0.72);
  stroke: #94a3b8;
  stroke-width: 1.5;
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.22));
}
.page-drag-ghost text {
  fill: #475569;
  font-weight: 600;
}
/* Slot d'insertion : l'emplacement où la carte s'installera au drop (les voisins se sont écartés
   pour l'ouvrir). Même « marching ants » que le fantôme violet de la couche fonctionnelle. */
.page-drag-slot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
  overflow: visible;
}
.page-drag-slot rect {
  fill: rgba(14, 165, 233, 0.08);
  stroke: #0ea5e9;
  stroke-width: 2;
  stroke-dasharray: 7 5;
  animation: ghost-march 0.5s linear infinite;
}
</style>

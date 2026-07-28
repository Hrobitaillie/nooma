<script setup lang="ts">
// Frame page (v2) : conteneur Vue Flow des blocs. En-tête = badge lot + nom (éditable inline) +
// route + compteurs + pastille d'incomplétude + marqueur page d'accueil. Ports de navigation
// gauche/droite (navigatesTo + quick-create). Largeur fixe, hauteur = pile de blocs (pas de resize).
// v12 : ancres cachées de l'arbre de parenté (TreeEdge) + boutons « + » au survol — côtés = page
// SŒUR avant/après, bas = SOUS-PAGE (même mécanique que le « + » de FeatureNode).
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { type PageNodeData } from '../useCanvasSync'
import { usePeerSelectionStyle } from '../usePeerSelection'
import { useCounterZoomVars } from '../counterZoom'

const props = defineProps<{
  id: string
  data: PageNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()

const route = computed(() => store.routeOf(props.id))
const dimmed = computed(() => ui.lotFilter != null && props.data.lot !== ui.lotFilter)
const peerRing = usePeerSelectionStyle(() => props.id)
// Variables de contre-zoom de l'anneau « commenté », portées par l'anneau (cf. counterZoom.ts).
const commentRing = ref<HTMLElement | null>(null)
useCounterZoomVars(commentRing)

const {
  editing: titleEditing,
  draft: titleDraft,
  inputRef,
  begin: beginTitle,
  commit: commitTitle,
  onKeydown: titleKeydown,
} = useInlineEdit({
  get: () => props.data.node.attrs.name,
  set: (name) => store.updateAttrs(props.id, { name }),
})

// Boutons « + » de création adjacente (côtés = page sœur, bas = sous-page). À la différence de
// FeatureNode (un seul bouton, côté deviné au curseur), les TROIS s'affichent dès que la frame est
// survolée : le corps d'une page est recouvert par ses nœuds de bloc, si bien que seuls l'en-tête
// et les marges reçoivent le survol — deviner un côté depuis ces zones-là pointait presque
// toujours ailleurs que là où l'utilisateur voulait créer. Pas de côté HAUT : la place au-dessus
// appartient au parent (rail/colonne).
type PageSide = 'left' | 'right' | 'bottom'
const hovering = ref(false)
// Zone morte entre carte et boutons (ils sont à l'extérieur) : masquage DIFFÉRÉ pour laisser le
// curseur traverser le gap sans les perdre.
let hideTimer: ReturnType<typeof setTimeout> | undefined
function onHoverEnter(): void {
  clearTimeout(hideTimer)
  hovering.value = true
}
function scheduleHide(): void {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (hovering.value = false), 180)
}
function keepHover(): void {
  clearTimeout(hideTimer)
}
function addAdjacent(side: PageSide): void {
  clearTimeout(hideTimer)
  hovering.value = false
  window.dispatchEvent(new CustomEvent('flooow:add-adjacent-page', { detail: { id: props.id, side } }))
}
const SIDES: { side: PageSide; cls: string; label: string }[] = [
  { side: 'left', cls: 'top-1/2 -translate-y-1/2 left-[-26px]', label: 'Ajouter une page sœur avant' },
  { side: 'right', cls: 'top-1/2 -translate-y-1/2 right-[-26px]', label: 'Ajouter une page sœur après' },
  { side: 'bottom', cls: 'left-1/2 -translate-x-1/2 bottom-[-26px]', label: 'Ajouter une sous-page' },
]
</script>

<template>
  <div
    class="page-frame flex h-full w-full flex-col rounded-lg border-2 bg-white/85 shadow-xs transition-shadow"
    :class="[
      // Slate-400 (v13, contraste) : en slate-300, les cartes n'avaient plus de contour perceptible
      // au fitView. Sky en sélection, inchangé. (Pas de style « saisi » : pendant un drag, la
      // vraie carte reste sagement à sa place — c'est le fantôme qui suit le pointeur.)
      selected ? 'border-sky-500 shadow-md' : 'border-slate-400',
    ]"
    :style="[{ opacity: dimmed ? 0.25 : 1 }, peerRing]"
    @mouseenter="onHoverEnter"
    @mousemove="onHoverEnter"
    @mouseleave="scheduleHide"
  >
    <!-- Contour jaune « commenté » (v13) : la PAGE elle-même porte ≥ 1 commentaire ouvert.
         Anneau séparé de la bordure (la sélection sky la remplace) et de l'outline (pris par la
         présence des pairs) ; épaisseur contre-zoomée via --flooow-label-scale (1/zoom sous 1),
         pour rester lisible au fitView — même mécanique que TreeEdge. -->
    <span v-if="data.commented" ref="commentRing" class="comment-ring" aria-hidden="true" />

    <!-- Boutons « + » : côtés = page SŒUR avant/après, bas = SOUS-PAGE. Masqués pendant un drag
         (le survol de la carte saisie les laissait affichés en plein geste de rangement). -->
    <template v-if="hovering && !dragging">
      <button
        v-for="s in SIDES"
        :key="s.side"
        type="button"
        class="nodrag nopan absolute z-30 flex h-5 w-5 items-center justify-center rounded-md border border-primary bg-white text-primary-700 shadow-xs transition-colors hover:bg-primary hover:text-white"
        :class="s.cls"
        :title="s.label"
        @click.stop="addAdjacent(s.side)"
        @mousedown.stop
        @mouseenter="keepHover"
      >
        <svg viewBox="0 0 14 14" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M7 3v8M3 7h8" stroke-linecap="round" />
        </svg>
      </button>
    </template>
    <!-- En-tête un cran plus contrasté (v13) : slate-100 + séparateur slate-300, pour que la bande
         de titre reste lisible au dézoom. -->
    <header
      class="flex items-center gap-2 rounded-t-md border-b border-slate-300 bg-slate-100/90 px-2.5 py-1.5"
    >
      <span
        class="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-white"
        :style="{ backgroundColor: data.lotColor }"
        :title="`Lot ${data.lot}`"
      >L{{ data.lot }}</span>
      <div class="min-w-0 flex-1">
        <input
          v-if="titleEditing"
          ref="inputRef"
          v-model="titleDraft"
          class="nodrag w-full rounded-sm border border-sky-300 px-1 py-0.5 text-xs font-semibold text-slate-800 outline-hidden"
          @blur="commitTitle()"
          @keydown="titleKeydown"
        />
        <div
          v-else
          class="truncate text-xs font-semibold text-slate-800"
          title="Double-clic pour renommer"
          @dblclick.stop="beginTitle()"
        >
          {{ data.node.attrs.name || 'Page' }}
        </div>
        <div class="truncate text-[10px] text-slate-500">{{ route }}</div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500">
        <span v-if="data.isHome" title="Page d’accueil">🏠</span>
        <span v-if="data.blockCount" title="Blocs">▤ {{ data.blockCount }}</span>
        <!-- Commentaires OUVERTS de la page + ses blocs (v13, remplace le compteur de notes). -->
        <span v-if="data.commentCount" title="Commentaires ouverts">💬 {{ data.commentCount }}</span>
        <span
          v-if="data.incomplete"
          class="inline-block h-2 w-2 rounded-full bg-red-500"
          title="Champs obligatoires manquants"
        />
      </div>
    </header>

    <!-- Corps : les blocs sont rendus comme nœuds enfants par Vue Flow -->
    <div class="flex-1"></div>

    <!-- Ports de navigation (navigatesTo + quick-create) : au MILIEU VERTICAL de la carte (v13 —
         les courbes de navigation passent derrière les cartes, le centre les répartit mieux que
         l'ancien ancrage au header). CHAQUE CÔTÉ porte une sortie ET une entrée : le côté réel
         d'un lien est choisi par la géométrie (useCanvasSync) — un lien vers une carte à gauche
         sort par la gauche et entre par la droite, jamais de tour complet. Les ancres alternatives
         sont posées AVANT les historiques pour leur laisser le dessus au clic (créer un lien part
         toujours de la sortie droite / arrive sur l'entrée gauche, comme avant). -->
    <Handle
      id="nav-source-left"
      type="source"
      :position="Position.Left"
      class="nav-handle"
      :style="{ top: '50%' }"
    />
    <Handle
      id="nav-target-right"
      type="target"
      :position="Position.Right"
      class="nav-handle"
      :style="{ top: '50%' }"
    />
    <Handle
      id="nav-target"
      type="target"
      :position="Position.Left"
      class="nav-handle"
      :style="{ top: '50%' }"
    />
    <Handle
      id="nav-source"
      type="source"
      :position="Position.Right"
      class="nav-handle"
      :style="{ top: '50%' }"
    />

    <!-- Ancres CACHÉES de l'arbre de parenté (TreeEdge) — v13 : centre bas (sortie) et centre haut
         (entrée), uniques. Jamais display:none : Vue Flow lit leur géométrie pour ancrer les
         tracés. -->
    <Handle
      id="tree-out-center"
      type="source"
      :position="Position.Bottom"
      :connectable="false"
      class="tree-handle"
    />
    <Handle
      id="tree-in-top"
      type="target"
      :position="Position.Top"
      :connectable="false"
      class="tree-handle"
    />
  </div>
</template>

<style scoped>
/* Anneau « commenté » : ambre (#f59e0b, la couleur historique des notes), posé JUSTE AU-DELÀ de la
   bordure de la carte. Épaisseur et débord multipliés par le contre-zoom (var --flooow-label-scale,
   héritée du canvas) : ~2 px écran quel que soit le dézoom, exactement comme l'épaisseur des arêtes
   d'arbre. pointer-events none — l'anneau ne vole aucun clic. */
.comment-ring {
  position: absolute;
  inset: calc(-4px * var(--flooow-label-scale, 1));
  border: calc(2px * var(--flooow-label-scale, 1)) solid #f59e0b;
  border-radius: 10px;
  pointer-events: none;
}
.page-frame :deep(.nav-handle) {
  width: 10px;
  height: 10px;
  background: #0ea5e9;
  border: 2px solid #fff;
}
.page-frame :deep(.tree-handle) {
  opacity: 0;
  width: 1px;
  height: 1px;
  min-width: 0;
  min-height: 0;
  border: 0;
  pointer-events: none;
}
</style>

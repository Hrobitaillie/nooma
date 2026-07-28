<script setup lang="ts">
// Frame module (couche fonctionnelle, decisions.md §15) : CONTENEUR de fonctionnalités (comme une
// page contient ses blocs). En-tête = nom éditable + compteur ; le corps accueille les cartes
// fonctionnalité rendues par Vue Flow comme nœuds enfants. Double-clic sur le module = ajouter une
// fonctionnalité (géré par useCanvasSync).
//
// VUE PAR MODULE — variante SATELLITE (`data.satellite`) : le même cadre, pour un module externe
// réduit aux seules cartes qui touchent la page courante. C'est une VARIANTE, pas un composant
// parallèle : mêmes proportions, même rayon, même hauteur d'en-tête, même famille de teinte. Trois
// écarts seulement, tous porteurs du même message « ce module-là n'est pas la page courante » :
// trait discontinu, teinte primary tirée vers le neutre, titre en poids normal. Plus un bouton
// « ouvrir », qui dit où aller le lire. Une couleur franchement autre aurait fait lire « autre type
// d'objet ».
import { ref } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { MODULE_WIDTH, MODULE_CONTENT_TOP, type ModuleNodeData } from '../useCanvasSync'
import { usePeerSelectionStyle } from '../usePeerSelection'
import { useCounterZoomVars } from '../counterZoom'

const props = defineProps<{
  id: string
  data: ModuleNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()
const { viewport, findNode } = useVueFlow()
const peerRing = usePeerSelectionStyle(() => props.id)
// Variables de contre-zoom du titre, portées par l'enveloppe du libellé (cf. counterZoom.ts).
const labelWrap = ref<HTMLElement | null>(null)
useCounterZoomVars(labelWrap)

// ── Poignée de resize (coin bas-droit) : fixe la taille MINIMALE du module ────────────────────────
// On lit la taille rendue, on suit le pointeur (delta / zoom = monde), et on écrit width/height dans
// les attrs en COALESCANT (une seule entrée d'historique pour tout le geste). Le layout garde
// max(contenu, manuel), donc réduire sous le contenu revient à « auto ».
const MIN_H = MODULE_CONTENT_TOP + 48
let start: { px: number; py: number; w: number; h: number } | null = null

function onResizeDown(e: PointerEvent): void {
  e.stopPropagation()
  e.preventDefault()
  const gn = findNode(props.id)
  const w = gn?.dimensions?.width || props.data.node.attrs.width || MODULE_WIDTH
  const h = gn?.dimensions?.height || props.data.node.attrs.height || MIN_H
  start = { px: e.clientX, py: e.clientY, w, h }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeUp)
}
function onResizeMove(e: PointerEvent): void {
  if (!start) return
  const z = viewport.value.zoom || 1
  const w = Math.round(Math.max(MODULE_WIDTH, start.w + (e.clientX - start.px) / z))
  const h = Math.round(Math.max(MIN_H, start.h + (e.clientY - start.py) / z))
  store.updateAttrs(props.id, { width: w, height: h }, `resize-module-${props.id}`)
}
function onResizeUp(): void {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
  start = null
  // Le module a pu grandir → demander l'auto-espacement des voisins (useCanvasSync écoute).
  window.dispatchEvent(new Event('flooow:reflow-modules'))
}

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
</script>

<template>
  <div
    class="module-frame group relative flex h-full w-full flex-col rounded-xl border-2 shadow-xs transition-shadow"
    :class="[
      data.satellite ? 'is-sat border-dashed bg-primary-300/12 shadow-none' : 'bg-primary-300/25',
      selected ? 'border-primary shadow-md' : data.satellite ? 'sat-border' : 'border-primary-300',
    ]"
    :style="peerRing"
  >
    <header
      class="flex items-center gap-2 rounded-t-[10px] border-b px-3 py-2"
      :class="
        data.satellite
          ? 'sat-head border-dashed'
          : 'border-primary-300 bg-primary-300/70'
      "
    >
      <span class="shrink-0 text-[12px]" :class="{ 'opacity-55': data.satellite }" aria-hidden="true">🗂️</span>
      <!-- Enveloppe NON transformée : c'est elle qui tient la place dans le flex de l'en-tête. Le
           contre-zoom est porté par l'élément intérieur, dont la largeur se compense en `100% / k` —
           impossible à faire sur l'élément flex lui-même, dont la largeur est décidée par `flex-1`
           et non par sa propriété `width`.
           C'est aussi elle qui PORTE les variables de contre-zoom (useCounterZoomVars) : stable à
           travers la bascule édition/affichage, et d'une descendance minuscule — voir counterZoom.ts
           pour la raison de ne plus les hériter de la racine. -->
      <span ref="labelWrap" class="min-w-0 flex-1">
        <input
          v-if="titleEditing"
          ref="inputRef"
          v-model="titleDraft"
          class="zoom-label nodrag rounded-sm border border-primary/50 bg-white px-1 py-0.5 text-[13px] font-semibold text-primary-700 outline-hidden"
          @blur="commitTitle()"
          @keydown="titleKeydown"
        />
        <span
          v-else
          class="zoom-label block truncate text-[13px]"
          :class="data.satellite ? 'sat-title font-medium' : 'font-semibold text-primary-700'"
          title="Double-clic pour renommer"
          @dblclick.stop="beginTitle()"
        >
          {{ data.node.attrs.name || 'Module' }}
        </span>
      </span>
      <span
        class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        :class="data.satellite ? 'sat-count' : 'bg-primary/20 text-primary-700'"
        :title="data.satellite ? 'Fonctionnalités liées à ce module-ci' : 'Fonctionnalités'"
      >
        {{ data.featureCount }}
      </span>
      <!-- « Ouvrir » : la seule sortie évidente vers le module externe. Sans elle, le satellite dit
           qu'un ailleurs existe sans dire comment y aller — il faudrait le retrouver dans le rail. -->
      <button
        v-if="data.satellite"
        type="button"
        class="nodrag shrink-0 text-[11px] font-bold text-primary-700 underline underline-offset-2 transition-colors hover:text-primary"
        @click.stop="ui.setFuncModule(id)"
      >
        ouvrir
      </button>
    </header>

    <!-- Corps : les fonctionnalités sont rendues comme nœuds enfants par Vue Flow -->
    <div class="flex-1"></div>

    <!-- Poignée de resize (coin bas-droit). nodrag → n'entraîne pas le déplacement du module.
         Masquée sur un satellite : sa hauteur est DÉRIVÉE des niveaux de ses cartes, la
         redimensionner n'aurait aucun effet persistant (le layout la recalculerait aussitôt). -->
    <div
      v-if="!data.satellite"
      class="nodrag resize-grip absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
      :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'"
      title="Redimensionner le module"
      @pointerdown="onResizeDown"
    >
      <svg viewBox="0 0 10 10" class="h-full w-full text-primary">
        <path d="M9 3 L3 9 M9 6 L6 9" stroke="currentColor" stroke-width="1.2" fill="none" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
/* Contre-zoom du NOM du module (`--flooow-label-scale`, posé par FlowCanvas) : taille écran
   constante en dézoom, parce que c'est l'information qu'on vient chercher en vue d'ensemble — voir
   `labelScale` dans FlowCanvas.vue.
   `visibility: visible` explicite : sous le seuil de LOD c'est le `<header>` entier qui est masqué
   (il est enfant direct de `.module-frame`), le titre doit donc se ré-afficher lui-même sous un
   parent caché.
   Origine en BAS à gauche, donc le libellé grandit vers le HAUT, hors du cadre. Ce n'est pas un
   choix esthétique mais une contrainte d'EMPILEMENT : les cartes de fonctionnalité sont des nœuds
   Vue Flow SŒURS du module, à un zIndex supérieur (module 0 < cartes 2, cf. useCanvasSync) — un
   libellé qui déborderait vers le bas passerait donc DERRIÈRE les cartes qu'il recouvre, et
   disparaîtrait au moment précis où il devient utile. Au-dessus du module il n'y a que le fond du
   bac de lot (zIndex -1), qui lui est peint en dessous.
   La troncature reste calculée sur la boîte NON transformée : le nom garde le même point de coupe
   qu'à zoom 1, il déborde simplement du cadre une fois agrandi. C'est voulu — un libellé lisible
   qui dépasse dit mieux « ce bloc-ci s'appelle X » qu'un libellé contenu mais illisible. */
.zoom-label {
  visibility: visible;
  /* Largeur divisée par le facteur : la mise à l'échelle la ramène à celle de l'enveloppe, donc du
     cadre. Sans ça la troncature reste calculée sur la boîte non transformée, le libellé déborde k
     fois plus à droite et recouvre le module voisin dès que les cadres sont étroits. Ici la boîte
     rétrécit autant que le texte grossit : `truncate` coupe pile au bord du module. */
  width: calc(100% / var(--flooow-label-scale, 1));
  transform: scale(var(--flooow-label-scale, 1));
  transform-origin: 0 100%;
}

/* Palette du SATELLITE : littéralement celle du cadre normal, chaque teinte tirée d'un cran vers la
   rampe neutre `gray-*`. On passe par `color-mix` sur les TOKENS plutôt que par des hex figés : le
   satellite reste ainsi DÉRIVÉ du cadre réel — retoucher `--color-primary*` déplace les deux
   ensemble, alors qu'un hex en dur les aurait laissés diverger au premier ajustement du DS.
   Ces mélanges sont des pas intermédiaires de la rampe, que Tailwind n'expose pas en classes. */
.is-sat {
  --sat-line: color-mix(in srgb, var(--color-primary-300) 30%, var(--color-gray-300));
  --sat-fill: color-mix(in srgb, var(--color-primary-300) 45%, var(--color-gray-100));
  --sat-ink: color-mix(in srgb, var(--color-primary-700) 55%, var(--color-gray));
  --sat-chip: color-mix(in srgb, var(--color-primary-300) 30%, var(--color-gray-200));
}
.sat-border { border-color: var(--sat-line); }
.sat-head { border-bottom-color: var(--sat-line); background: var(--sat-fill); }
.sat-title { color: var(--sat-ink); }
.sat-count { background: var(--sat-chip); color: var(--sat-ink); }
</style>

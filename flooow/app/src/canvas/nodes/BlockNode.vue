<script setup lang="ts">
// Bloc : pleine largeur de la page, empilé, NON redimensionnable. Glisser verticalement =
// réordonner ; glisser vers une autre page = reparenter (géré au drop par useCanvasSync). Handles
// cachés (ancres des arêtes dependsOn), non tirables par l'utilisateur.
//
// Composition (maquette Figma « cadrage », node 31:77) : titre → zone de contenu riche → connexions
// API. Le mini-gabarit SVG par blockType et le libellé du type ont été retirés en v8 : la maquette
// ne les porte plus. `blockType` reste au modèle et s'édite dans l'inspecteur.
//
// Contenu riche : éditable sur la carte quand elle est SÉLECTIONNÉE, en lecture sinon — même
// mécanique que FeatureNode (commit débouncé + coalescé, vidé à la désélection).
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { setCardHeight, forgetCardHeight, estimateBlockCard } from '../cardMetrics'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import RichContent from '@/panels/RichContent.vue'
import RichEditor from '@/panels/RichEditor.vue'
import { isEmptyDoc, type RichDoc } from '@flooow/core/model/richContent'
import { orderedBlockElements } from '@/composables/blockElements'
import { ORDER_BADGE_KEY, type BlockNodeData } from '../useCanvasSync'
import { usePeerSelectionStyle } from '../usePeerSelection'
import { useCounterZoomVars } from '../counterZoom'

const props = defineProps<{
  id: string
  data: BlockNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()
const badges = inject(ORDER_BADGE_KEY, undefined)

const a = computed(() => props.data.node.attrs)
const order = computed(() => badges?.value.get(props.id) ?? null)
const dimmed = computed(() => ui.lotFilter != null && props.data.lot !== ui.lotFilter)
const peerRing = usePeerSelectionStyle(() => props.id)
// Variables de contre-zoom de l'anneau « commenté », portées par l'anneau (cf. counterZoom.ts).
const commentRing = ref<HTMLElement | null>(null)
useCounterZoomVars(commentRing)

/** Taille intrinsèque du conteneur virtualisé : estimation de la carte moins son chrome
 *  (p-4 vertical + bordures ≈ 34px, hors conteneur). Ne sert qu'avant le premier rendu réel. */
const innardsIntrinsicH = computed(() => Math.max(estimateBlockCard(props.data.node) - 34, 24))

/**
 * Éléments accrochés au bloc (connexions API + fonctionnalités réalisées), dans l'ordre défini au
 * panneau de config. Même fonction que lui (`orderedBlockElements`) : c'est ce qui garantit que
 * réorganiser là-bas se voit ICI, au rang près.
 * Le nom du service est résolu au rendu — le modèle ne stocke que son id.
 */
const elements = computed(() =>
  orderedBlockElements(props.data.node, store.featuresOfTarget(props.id)),
)
/**
 * L'aperçu REGROUPE par nature (connexions, puis fonctionnalités liées), là où le panneau de config
 * présente une liste unique. Les deux ne se contredisent pas : l'ordre défini au panneau est respecté
 * À L'INTÉRIEUR de chaque groupe — c'est le mélange des natures qui n'est pas repris ici, la carte
 * ayant besoin de ses deux intertitres pour rester lisible d'un coup d'œil.
 */
const apiRefs = computed(() =>
  elements.value
    .filter((el) => el.kind === 'api')
    .map((el) => ({
      ...el.ref,
      serviceName: store.serviceById(el.ref.serviceId)?.name ?? '',
    })),
)
const features = computed(() =>
  elements.value.filter((el) => el.kind === 'feature').map((el) => el.feature),
)

/** Saute sur la fonctionnalité liée (bascule de couche + centrage) — les deux couches ne sont
 *  jamais visibles ensemble, c'est le seul moyen d'aller la voir depuis ici. */
function goFeature(id: string): void {
  ui.setCanvasLayer('functional')
  ui.focusNode(id)
}

/** Passages du contenu riche visés par un commentaire OUVERT (ancre `range`, v13) → surlignés. */
const commentHighlights = computed<string[]>(() =>
  store
    .commentsOf(props.id)
    .filter((c) => !c.resolved && c.anchor.range != null)
    .map((c) => (c.anchor.range as { text: string }).text),
)

/** « 💬 Commenter » de la bulle de sélection (v13) : ouvre la POPUP de création pré-ancrée sur le
 *  passage (retour Hugo 22/07 — le fil ne se crée qu'à l'envoi du formulaire). Même canal
 *  d'événement fenêtre que les boutons « + » des cartes (le composer vit dans useCanvasSync). */
function onCommentRange(range: { from: number; to: number; text: string }): void {
  window.dispatchEvent(
    new CustomEvent('flooow:comment-range', { detail: { nodeId: props.id, range } }),
  )
}

const {
  editing: titleEditing,
  draft: titleDraft,
  inputRef,
  begin: beginTitle,
  commit: commitTitle,
  onKeydown: titleKeydown,
} = useInlineEdit({
  get: () => a.value.name,
  set: (name) => store.updateAttrs(props.id, { name }),
})

// Contenu riche éditable inline : commit débouncé + coalescé (une seule entrée d'historique par
// salve de frappe).
let contentTimer: ReturnType<typeof setTimeout> | undefined
let pendingDoc: RichDoc | null = null
function onContent(doc: RichDoc): void {
  pendingDoc = doc
  if (contentTimer) clearTimeout(contentTimer)
  contentTimer = setTimeout(commitContent, 400)
}
function commitContent(): void {
  if (contentTimer) {
    clearTimeout(contentTimer)
    contentTimer = undefined
  }
  if (pendingDoc) {
    store.updateAttrs(props.id, { content: pendingDoc }, `block-content:${props.id}`)
    pendingDoc = null
  }
}
// Sans ces deux vidages, les 400 dernières ms de frappe sont perdues quand l'éditeur disparaît.
watch(
  () => props.selected,
  (sel, prev) => {
    if (prev && !sel) commitContent()
  },
)
onBeforeUnmount(commitContent)

/**
 * Mesure de la CARTE (même mécanique que FeatureNode) : le nœud Vue Flow porte un `minHeight`
 * estimé qui dépasse souvent le contenu réel — l'empilement (blockStackOf) doit lire ce que la
 * carte fait vraiment, sinon l'écart visible entre cartes varie avec l'erreur d'estimation.
 * `setCardHeight` alimente le registre de cardMetrics, consommé par le layout structurel.
 */
const cardRef = ref<HTMLElement | null>(null)
let cardObserver: ResizeObserver | undefined
onMounted(() => {
  if (!cardRef.value || typeof ResizeObserver === 'undefined') return
  cardObserver = new ResizeObserver((entries) => {
    const h = entries[0]?.borderBoxSize?.[0]?.blockSize ?? cardRef.value?.offsetHeight ?? 0
    setCardHeight(props.id, h)
  })
  cardObserver.observe(cardRef.value)
})
onBeforeUnmount(() => {
  cardObserver?.disconnect()
  forgetCardHeight(props.id)
})
</script>

<template>
  <div
    ref="cardRef"
    class="block-node relative flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-xs transition-shadow"
    :class="[
      selected ? 'border-sky-500 shadow-md' : 'border-slate-200 hover:shadow-sm',
      // Bloc SAISI (réorganisation) : il flotte au-dessus de la pile → ombre marquée.
      dragging && 'shadow-xl',
    ]"
    :style="[{ opacity: dimmed ? 0.25 : 1 }, peerRing]"
  >
    <!-- Contour jaune « commenté » (v13) : ≥ 1 fil ouvert ancré sur le bloc ENTIER. Un fil de
         PASSAGE ne pose pas d'anneau — son texte cité est surligné dans le contenu (retour Hugo).
         Même anneau contre-zoomé que PageFrame (distinct de la sélection sky et de la présence). -->
    <span v-if="data.outlined" ref="commentRing" class="comment-ring" aria-hidden="true" />
    <!-- (Filet gauche coloré par blockType : RETIRÉ — retour Hugo 22/07, il alourdissait la carte
         face à l'anneau « commenté » sans rien apporter. Le type se lit à l'inspecteur/menu.) -->
    <!-- VIRTUALISATION (phase 1) : même conteneur que FeatureNode (`content-visibility: auto`,
         taille intrinsèque estimée) — voir le commentaire là-bas. Les ports, l'anneau « commenté »
         et le badge #n (absolus) restent DEHORS. `flex flex-col gap-3` répliqué de la carte : le
         `gap` espace les enfants, en flux bloc tout se collerait. -->
    <div
      class="block-innards flex min-w-0 flex-col gap-3"
      :style="{ containIntrinsicSize: `auto ${innardsIntrinsicH}px` }"
    >
    <!-- Titre -->
    <div class="flex items-center gap-1.5">
      <input
        v-if="titleEditing"
        ref="inputRef"
        v-model="titleDraft"
        class="nodrag min-w-0 flex-1 rounded-sm border border-sky-300 px-1 py-0.5 text-base font-black tracking-[-0.8px] text-black outline-hidden"
        @blur="commitTitle()"
        @keydown="titleKeydown"
      />
      <span
        v-else
        class="min-w-0 flex-1 truncate text-base font-black tracking-[-0.8px] text-black"
        title="Double-clic pour renommer"
        @dblclick.stop="beginTitle()"
      >
        {{ a.name || 'Bloc' }}
      </span>
      <span
        v-if="data.incomplete"
        class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
        title="Champs obligatoires manquants"
      />
    </div>

    <!-- Zone de contenu riche. Les deux états doivent avoir la MÊME métrique, sinon le texte saute
         sous le curseur au moment de la sélection (cf. RichEditor variant="card"). -->
    <div v-if="selected" class="nodrag card-body" @mousedown.stop @dblclick.stop>
      <RichEditor
        variant="card"
        :model-value="a.content"
        commentable
        :highlights="commentHighlights"
        @update:model-value="onContent"
        @comment="onCommentRange"
      />
    </div>
    <div
      v-else-if="!isEmptyDoc(a.content)"
      class="card-body cursor-text"
      title="Sélectionner pour éditer le contenu"
    >
      <RichContent :doc="a.content" :highlights="commentHighlights" />
    </div>

    <!-- Connexions API (en fin de zone de contenu, maquette 34:203) -->
    <div v-if="apiRefs.length" class="flex flex-col gap-1.5">
      <p class="text-[11px] font-bold tracking-[-0.55px] text-black">Connexions api&nbsp;:</p>
      <div class="flex flex-col gap-1">
        <div
          v-for="(r, i) in apiRefs"
          :key="i"
          class="flex flex-col gap-1 border-l border-gray-300 pl-1.5"
        >
          <p class="truncate text-[11px] font-medium tracking-[-0.55px] text-gray-600">
            {{ r.serviceName || 'service ?' }}
          </p>
          <div class="flex items-center gap-1">
            <span
              v-if="r.method"
              class="shrink-0 rounded-md bg-secondary-300 px-1 py-0.5 text-[11px] font-bold tracking-[-0.55px] text-secondary-50"
            >
              {{ r.method }}
            </span>
            <span class="truncate text-[11px] font-medium tracking-[-0.55px] text-gray">
              {{ r.path || '/' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Fonctionnalités liées — bloc séparé, sous les connexions. `mt-1` en plus du `gap-3` de la
         carte : les deux listes se ressemblent trop pour se distinguer au seul interligne courant.
         Le SAUT vers la fonctionnalité (bascule de couche) vit sur un petit bouton flèche à droite
         du texte, PAS sur toute la ligne (retour Hugo 22/07 : la ligne pleine largeur se cliquait
         par accident et téléportait dans l'autre couche). `nodrag` + `@mousedown.stop` sur le
         bouton : sans eux le clic est happé par le drag du bloc. -->
    <div v-if="features.length" class="mt-1 flex flex-col gap-1.5">
      <p class="text-[11px] font-bold tracking-[-0.55px] text-black">Fonctionnalités liées&nbsp;:</p>
      <div class="flex flex-col gap-1">
        <div
          v-for="f in features"
          :key="f.id"
          class="flex min-w-0 items-center gap-1 border-l border-gray-300 pl-1.5"
        >
          <span
            v-if="f.attrs.code"
            class="shrink-0 text-[11px] font-bold tracking-[-0.55px] text-gray-600"
          >
            {{ f.attrs.code }}
          </span>
          <span class="min-w-0 truncate text-[11px] font-medium tracking-[-0.55px] text-gray-600">
            {{ f.attrs.name || 'Sans titre' }}
          </span>
          <button
            type="button"
            class="nodrag ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:bg-primary-300 hover:text-primary-700"
            :title="`Voir « ${f.attrs.name || 'Sans titre' } » dans la couche fonctionnelle`"
            @mousedown.stop
            @click.stop="goFeature(f.id)"
          >
            <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 8l4-4M4.5 4H8v3.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    </div><!-- /block-innards (virtualisation) -->

    <div
      v-if="order != null"
      class="pointer-events-none absolute -left-2 -top-2 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
    >#{{ order }}</div>

    <!-- Ancres cachées (arêtes dependsOn), non tirables. Chaque côté porte
         une sortie ET une entrée : le côté réel d'un lien est choisi par la géométrie
         (useCanvasSync, v13) — pas de tour complet vers une carte située à gauche. -->
    <Handle
      id="b"
      type="target"
      :position="Position.Left"
      :connectable="false"
      class="hidden-handle"
    />
    <Handle
      id="b-src"
      type="source"
      :position="Position.Right"
      :connectable="false"
      class="hidden-handle"
    />
    <Handle
      id="b-src-left"
      type="source"
      :position="Position.Left"
      :connectable="false"
      class="hidden-handle"
    />
    <Handle
      id="b-tgt-right"
      type="target"
      :position="Position.Right"
      :connectable="false"
      class="hidden-handle"
    />
  </div>
</template>

<style scoped>
/* VIRTUALISATION : voir le commentaire du conteneur homologue dans FeatureNode.vue. */
.block-innards {
  content-visibility: auto;
}
/* Anneau « commenté » : voir PageFrame.vue (même règle, même contre-zoom). */
.comment-ring {
  position: absolute;
  inset: calc(-4px * var(--flooow-label-scale, 1));
  border: calc(2px * var(--flooow-label-scale, 1)) solid #f59e0b;
  border-radius: 10px;
  pointer-events: none;
}
.block-node :deep(.hidden-handle) {
  opacity: 0;
  width: 1px;
  height: 1px;
  min-width: 0;
  min-height: 0;
  border: 0;
  pointer-events: none;
}
/* Typographie du corps de carte, portée par le MÊME wrapper en aperçu et en édition — c'est tout le
   contrat de `rich.css` : `.rich-body` ne définit que le modèle de bloc (marges, titres, listes,
   code), et laisse délibérément `font-size` / `line-height` / `letter-spacing` / `color` au
   conteneur appelant. Tant que les deux états partagent ce conteneur, ils ne peuvent pas diverger.
   L'aperçu portait ces valeurs en classes utilitaires et l'éditeur n'en portait aucune : le texte
   passait donc de 11 px à ~16 px (héritage du body) au moment où l'on sélectionnait la carte, et
   avec lui TOUTES les métriques exprimées en `em` dans rich.css — marges inter-blocs, taille des
   titres, retrait des listes. Même bug que celui corrigé sur la carte de fonctionnalité (6be9665),
   que ce fichier-ci n'avait jamais reçu ; d'où le même nom de classe, `.card-body`. */
.card-body {
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: -0.55px;
  color: var(--color-gray-700);
}
</style>

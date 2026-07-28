<script setup lang="ts">
// Carte fonctionnalité : champs STRUCTURÉS éditables inline (lot, code, estimation, titre) + APERÇU
// du contenu riche (lecture seule, clampé) + « Réalisé par » + un sélecteur par champ de projet
// (doc.featureFields — nombre VARIABLE depuis la v7). Le contenu détaillé se rédige dans l'éditeur
// plein hauteur (badge « Éditer » → Tiptap). Ports « dépend de » DYNAMIQUES.
import { computed, inject, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { isEmptyDoc, type RichDoc } from '@flooow/core/model/richContent'
import {
  FEATURE_STATUSES,
  STATUS_LABELS,
  phaseOf,
  crossesToDev,
  type FeatureStatus,
} from '@flooow/core/domain/lifecycle'
import { FUNC_HIGHLIGHT_KEY, type FeatureNodeData, type CardSide } from '../useCanvasSync'
import { usePeerSelectionStyle } from '../usePeerSelection'
import RichContent from '@/panels/RichContent.vue'
import RichEditor from '@/panels/RichEditor.vue'
import FeatureFieldSelect from '@/panels/FeatureFieldSelect.vue'
import SelectMenu, { type SelectOption } from '@/components/SelectMenu.vue'
import { setCardHeight, forgetCardHeight, estimateFeatureCard } from '../cardMetrics'

const props = defineProps<{
  id: string
  data: FeatureNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()

/** Ouvre l'éditeur plein hauteur (badge « Éditer » ou double-clic sur le contenu) + sélectionne. */
function openEditor(): void {
  ui.select(props.id)
  ui.openEditor(props.id)
}

// Bouton « + » de création adjacente : au survol, un seul bouton apparaît, sur le côté le plus proche
// du curseur, à l'extérieur de la carte. Clic → crée une fonctionnalité de ce côté (via useCanvasSync).
type Side = 'top' | 'right' | 'bottom' | 'left'
const hoverSide = ref<Side | null>(null)
// Le bouton est À L'EXTÉRIEUR de la carte (petit gap), donc entre carte et bouton il y a une zone
// morte : on masque avec un léger DÉLAI pour que le curseur puisse traverser le gap sans le perdre.
let hideTimer: ReturnType<typeof setTimeout> | undefined
function onHoverMove(e: MouseEvent): void {
  clearTimeout(hideTimer)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1)
  const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1)
  hoverSide.value = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
}
function scheduleHide(): void {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (hoverSide.value = null), 180)
}
function keepHover(): void {
  clearTimeout(hideTimer)
}
function addAdjacent(side: Side): void {
  clearTimeout(hideTimer)
  hoverSide.value = null
  window.dispatchEvent(new CustomEvent('flooow:add-adjacent', { detail: { id: props.id, side } }))
}

// Mise en avant de chaîne : injection RÉACTIVE (phase 1 refonte canvas) et non plus `data.chain`
// cuit au mapping — un clic ne re-mappe plus le graphe, il ne fait bouger que ces computed.
const funcHighlight = inject(
  FUNC_HIGHLIGHT_KEY,
  computed((): Set<string> | null => null),
)
const chain = computed<'in' | 'out' | null>(() => {
  const hl = funcHighlight.value
  return hl ? (hl.has(props.id) ? 'in' : 'out') : null
})
// Grisage par filtre. Les deux filtres se CUMULENT (ET) : cocher un lot puis un module réduit à
// l'intersection, ce qu'attend quelqu'un qui empile deux critères. Le module d'une fonctionnalité
// est son `parentId` (l'arbre de contenance) — pas son `moduleName`, renommable en direct.
// La mise en avant de la chaîne s'ajoute aux filtres : hors chaîne, la carte s'estompe comme si un
// filtre l'excluait.
const dimmed = computed(
  () =>
    (ui.lotFilter != null && props.data.lot !== ui.lotFilter) ||
    (ui.moduleFilter != null && props.data.node.parentId !== ui.moduleFilter) ||
    chain.value === 'out',
)
const inChain = computed(() => chain.value === 'in')
// Bloquée (arbre de déblocage) : cadenas si `dimBlocked` actif ; grisée sauf quand sélectionnée
// (la sélection doit rester pleinement lisible).
//
// …et sauf DANS la chaîne mise en avant : une carte bloquée y est précisément ce qu'on est venu
// voir — c'est elle qui explique pourquoi la suite ne démarre pas. La laisser en gris de « bloquée »
// au milieu de cartes éclairées inverse le message : le seul maillon qui compte serait le seul
// effacé. Le cadenas, lui, reste (l'information « bloquée » ne disparaît pas, elle cesse juste
// d'être dite par du grisage, qui signifie ici « hors sujet »).
const isBlocked = computed(() => props.data.blocked && ui.dimBlocked)
const greyed = computed(() => isBlocked.value && !props.selected && !inChain.value)
const peerRing = usePeerSelectionStyle(() => props.id)
const a = computed(() => props.data.node.attrs)
const c = computed(() => props.data.clamps)
const realizers = computed(() => store.realizersOfFeature(props.id))

/**
 * Taille intrinsèque du conteneur virtualisé (cf. template) : l'estimation de la carte MOINS son
 * chrome (paddings verticaux + bordures, comptés par estimateFeatureCard mais hors du conteneur).
 * Ne sert qu'AVANT le premier rendu réel — ensuite `contain-intrinsic-size: auto` mémorise.
 */
const innardsIntrinsicH = computed(
  () =>
    estimateFeatureCard(props.data.node, realizers.value.length, store.orderedFeatureFields.length)
      .height - 20,
)

/** Va à une page/un bloc réalisateur (couche structurelle centrée). */
function goRealizer(id: string): void {
  ui.setCanvasLayer('structural')
  ui.focusNode(id)
}

const LOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

function setCode(e: Event): void {
  store.updateAttrs(props.id, { code: (e.target as HTMLInputElement).value })
}
function setEstimate(e: Event): void {
  store.updateAttrs(props.id, { estimate: (e.target as HTMLInputElement).value })
}
// Lot via SelectMenu : '' = hérité (aucun lot propre) ; le libellé « hérité » porte le lot effectif.
const lotOptions = computed<SelectOption[]>(() => [
  { value: '', label: `L${props.data.lot} · hérité` },
  ...LOT_OPTIONS.map((l) => ({ value: String(l), label: `Lot ${l}` })),
])
const lotValue = computed(() => (props.data.node.lot != null ? String(props.data.node.lot) : ''))
function onLotChange(value: string | string[] | null): void {
  const v = (value ?? '') as string
  store.assignLot(props.id, v === '' ? null : Number(v))
}

// ── Zone de suivi (cycle de vie v10) ────────────────────────────────────────
// Statut + checklist par phase. La phase est DÉRIVÉE du statut (jamais stockée) : elle décide du
// titre de zone et des items affichés (seuls ceux de la phase courante). Le select propose tous les
// statuts, groupés Cadrage / Dév — les sauts sont libres, le franchissement cadrage→dev déclenche
// une confirmation souple si le cadrage n'est pas terminé (gate, pas blocage).
const status = computed<FeatureStatus>(() => a.value.status)
const phase = computed(() => phaseOf(status.value))
const zoneTitle = computed(() => (phase.value === 'dev' ? 'Suivi de dév.' : 'Suivi de cadrage'))
// Variante visuelle de la pastille : dorée en dév, bleu-gris en cadrage, grise pour une sortie.
const pillVariant = computed(() =>
  status.value === 'reportee' || status.value === 'ecartee'
    ? 'exit'
    : phase.value === 'dev'
      ? 'dev'
      : 'cadrage',
)
// Options du select de statut : liste fermée du core, groupée par famille (Cadrage / Dév) — constant.
const STATUS_OPTIONS: SelectOption[] = FEATURE_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  group: phaseOf(s) === 'dev' ? 'Dév' : 'Cadrage',
}))

// Items de la phase courante uniquement + progression cochés/total sur cette phase.
const phaseItems = computed(() => a.value.checklist.filter((i) => i.phase === phase.value))
const doneCount = computed(() => phaseItems.value.filter((i) => i.done).length)
const progressPct = computed(() =>
  phaseItems.value.length ? Math.round((doneCount.value / phaseItems.value.length) * 100) : 0,
)

function onStatusChange(value: string | string[] | null): void {
  const next = value as FeatureStatus
  const current = status.value
  if (!next || next === current) return
  // Gate souple : franchir cadrage → dev avec des étapes de cadrage non cochées demande confirmation.
  // Composant contrôlé (:model-value=status) : en cas de refus, ne rien émettre suffit — la pastille
  // reflète toujours le statut courant, aucune remise à la main nécessaire.
  if (crossesToDev(current, next)) {
    const pending = a.value.checklist.filter((i) => i.phase === 'cadrage' && !i.done).length
    if (pending > 0) {
      const ok = window.confirm(
        `${pending} étape${pending > 1 ? 's' : ''} de cadrage non cochée${pending > 1 ? 's' : ''} — basculer quand même ?`,
      )
      if (!ok) return
    }
  }
  store.setFeatureStatus(props.id, next)
}

function toggleStep(itemId: string): void {
  store.toggleChecklistItem(props.id, itemId)
}

// Renommage inline d'un item (carte sélectionnée) : état local par item (pas de useInlineEdit,
// qui est mono-instance).
const editingItem = ref<string | null>(null)
const itemDraft = ref('')
function beginRenameStep(itemId: string, label: string): void {
  editingItem.value = itemId
  itemDraft.value = label
}
function commitRenameStep(): void {
  if (editingItem.value == null) return
  store.renameChecklistItem(props.id, editingItem.value, itemDraft.value)
  editingItem.value = null
}
function removeStep(itemId: string): void {
  if (editingItem.value === itemId) editingItem.value = null
  store.removeChecklistItem(props.id, itemId)
}

// Ajout d'une étape (carte sélectionnée) : le nouvel item hérite de la phase courante.
const newStep = ref('')
function addStep(): void {
  if (store.addChecklistItem(props.id, newStep.value, phase.value)) newStep.value = ''
}

// Titre éditable inline (double-clic).
const nameEd = useInlineEdit({
  get: () => a.value.name,
  set: (name) => store.updateAttrs(props.id, { name }),
})

// Contenu riche éditable inline (carte sélectionnée) : commit débouncé + coalescé.
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
    store.updateAttrs(props.id, { content: pendingDoc }, `feat-content:${props.id}`)
    pendingDoc = null
  }
}
// Commit immédiat à la désélection (l'éditeur inline va disparaître).
watch(
  () => props.selected,
  (sel, prev) => {
    if (prev && !sel) commitContent()
  },
)

/**
 * Montage DIFFÉRÉ de l'éditeur inline (phase 1 refonte canvas). Instancier Tiptap/ProseMirror est
 * le poste dominant du clic de sélection (~180-220 ms de tâche longue mesurés en baseline, montage
 * ET démontage) : dans la frame du clic, la carte payait l'éditeur avant même d'avoir montré son
 * anneau. On rend donc la sélection tout de suite — anneau, chaîne, aperçu clampé conservé — et
 * l'éditeur monte à l'ACCALMIE suivante (`requestIdleCallback`, plafonné à 300 ms pour ne pas
 * faire attendre une frappe volontaire). La tâche longue existe toujours, mais hors interaction :
 * elle ne bloque plus ni le clic ni le pan qui l'enchaîne. C'est déjà le contrat de la phase 3
 * (îlot d'édition monté à la demande) — on l'anticipe.
 */
const editorMounted = ref(false)
let idleHandle: number | undefined
watch(
  () => props.selected,
  (sel) => {
    if (idleHandle !== undefined) cancelIdleCallback(idleHandle)
    if (!sel) {
      editorMounted.value = false
      return
    }
    idleHandle = requestIdleCallback(
      () => {
        idleHandle = undefined
        if (props.selected) editorMounted.value = true
      },
      { timeout: 300 },
    )
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (idleHandle !== undefined) cancelIdleCallback(idleHandle)
})
onBeforeUnmount(() => {
  commitContent()
  clearTimeout(hideTimer)
})

const POS: Record<CardSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}
/**
 * Tout port est au MILIEU de son côté, et toujours en POURCENTAGE — jamais en pixels. Un enfant en
 * `position: absolute` se cale sur la boîte de PADDING, donc à l'intérieur de la bordure de 1px :
 * une valeur en pixels venue du modèle (demi-largeur de carte) devait être recompensée de cette
 * bordure et redevenait fausse à la moindre variation de largeur. Un `50%` est juste par
 * construction, quelle que soit la boîte. Même raisonnement en vertical pour les ports latéraux :
 * la hauteur utile est celle de la CARTE (contenu réel), pas le plancher estimé du nœud.
 */
function handleStyle(side: CardSide): Record<string, string> {
  const horizontal = side === 'left' || side === 'right'
  return horizontal ? { top: '50%' } : { left: '50%' }
}

/**
 * Les ports sont ancrés à la CARTE (`.feature-node`), pas au nœud Vue Flow : la carte a une hauteur
 * de contenu, le nœud un `minHeight` calculé qui la dépasse le plus souvent. Vue Flow ne re-mesure
 * les ports (`handleBounds`) que quand les dimensions du NŒUD changent — donc jamais quand seule la
 * carte grandit ou rétrécit, et pas non plus quand le contenu se stabilise après coup (éditeur
 * inline monté en asynchrone à la sélection, contenu riche rendu en différé).
 *
 * Portée EXACTE de ce filet, à ne pas surestimer : un ResizeObserver ne compare que des tailles de
 * FIN DE FRAME. Il rattrape donc tout ce qui se stabilise APRÈS coup (contenu asynchrone, polices),
 * mais il est structurellement aveugle à un repli qui naît et meurt entre deux microtasks — c'est
 * précisément le cas du passage aperçu → éditeur inline (Tiptap se monte vide le temps d'un
 * microtask). Ce transitoire-là est couvert ailleurs, par la re-mesure des ports différée d'une
 * frame dans `push()` (useCanvasSync.ts) ; les deux mécanismes sont complémentaires, pas redondants.
 *
 * Le MÊME signal alimente le registre des hauteurs (`setCardHeight`), seule source du re-layout
 * vertical : la hauteur du NŒUD Vue Flow reste collée à son `minHeight` (plancher estimé) et ne
 * bouge donc pas quand la carte grandit — cf. le commentaire de `measuredCardHeights` dans
 * cardMetrics.ts. Rien à débouncer ici : `setCardHeight` ignore les mesures identiques et le
 * consommateur coalesce sur une frame.
 */
const cardRef = ref<HTMLElement | null>(null)
const { updateNodeInternals } = useVueFlow()
let cardObserver: ResizeObserver | undefined
onMounted(() => {
  if (!cardRef.value || typeof ResizeObserver === 'undefined') return
  cardObserver = new ResizeObserver((entries) => {
    updateNodeInternals([props.id])
    // `borderBoxSize` = bordures comprises, comme la boîte que le layout empile ; `offsetHeight` en
    // repli pour les moteurs qui ne le renseignent pas.
    const h = entries[0]?.borderBoxSize?.[0]?.blockSize ?? cardRef.value?.offsetHeight ?? 0
    setCardHeight(props.id, h)
  })
  cardObserver.observe(cardRef.value)
})
onBeforeUnmount(() => {
  cardObserver?.disconnect()
  forgetCardHeight(props.id)
})
function clampStyle(lines: number): Record<string, string> {
  return { '-webkit-line-clamp': String(lines) }
}
</script>

<template>
  <!-- Le nœud est en hauteur AUTO (minHeight) : la carte épouse toujours son contenu (jamais de clip). -->
  <div
    class="group relative w-full"
    @mousemove="onHoverMove"
    @mouseleave="scheduleHide"
  >
    <!-- Bouton « + » de création adjacente : un seul, sur le côté approché, à l'extérieur de la carte. -->
    <button
      v-if="hoverSide"
      type="button"
      class="nodrag nopan add-adjacent absolute z-30 flex h-5 w-5 items-center justify-center rounded-md border border-primary bg-white text-primary-700 shadow-xs transition-colors hover:bg-primary hover:text-white"
      :class="{
        'left-1/2 -translate-x-1/2 top-[-24px]': hoverSide === 'top',
        'left-1/2 -translate-x-1/2 bottom-[-24px]': hoverSide === 'bottom',
        'top-1/2 -translate-y-1/2 left-[-24px]': hoverSide === 'left',
        'top-1/2 -translate-y-1/2 right-[-24px]': hoverSide === 'right',
      }"
      title="Ajouter une fonctionnalité de ce côté"
      @click.stop="addAdjacent(hoverSide)"
      @mousedown.stop
      @mouseenter="keepHover"
    >
      <svg viewBox="0 0 14 14" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M7 3v8M3 7h8" stroke-linecap="round" />
      </svg>
    </button>

    <!-- Badge « Éditer » : ouvre l'éditeur plein hauteur (contenu riche, champs vides). Affiché même
         sur une carte estompée par un filtre : un filtre d'affichage MET EN RETRAIT, il ne désactive
         pas — retirer l'affordance rendait la carte inutilisable tant que le filtre était posé. -->
    <button
      type="button"
      class="nodrag edit-pill absolute -top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
      :class="{ 'opacity-100!': selected }"
      title="Ouvrir l'éditeur (contenu détaillé)"
      @click.stop="openEditor"
      @mousedown.stop
    >
      <svg viewBox="0 0 20 20" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 13.5V16h2.5L14 8.5 11.5 6 4 13.5zM12.5 5l2.5 2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      Éditer
    </button>

    <!-- Cadenas « bloquée » : un prérequis n'a pas atteint le seuil de déblocage. -->
    <div
      v-if="isBlocked"
      class="feat-lock absolute -right-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] shadow-sm"
      title="Bloquée : un prérequis n'est pas encore « en développement »"
    >🔒</div>

    <div
      ref="cardRef"
      class="feature-node flex w-full flex-col rounded-lg border bg-white px-2.5 py-2 shadow-xs transition-shadow"
      :class="[selected ? 'relative z-10 border-primary shadow-md ring-1 ring-primary-300' : 'border-slate-200 hover:border-primary-300 hover:shadow-sm', { 'feat-blocked': greyed, 'feat-dimmed': dimmed, 'feat-chained': inChain && !selected }]"
      :style="peerRing"
    >
      <!-- VIRTUALISATION (phase 1) : tout le contenu lourd de la carte vit dans ce conteneur en
           `content-visibility: auto` — hors viewport, le navigateur saute son style/layout/paint.
           Les PORTS restent DEHORS (frères du conteneur) : une arête doit pouvoir s'accrocher à une
           carte jamais rendue. `contain-intrinsic-size: auto <estimation>` : jamais rendue, la
           carte fait sa hauteur ESTIMÉE (l'état que le layout gère déjà comme plancher) ; rendue
           une fois, `auto` mémorise la taille réelle. `flex flex-col` répliqué : les enfants
           étaient des items de la colonne de `.feature-node` — en flux bloc leurs marges
           fusionneraient et toutes les hauteurs décrocheraient du miroir cardMetrics. -->
      <div
        class="feat-innards flex min-w-0 flex-col"
        :style="{ containIntrinsicSize: `auto ${innardsIntrinsicH}px` }"
      >
      <!-- Ligne badges : lot (SelectMenu), code (input), orphelin, estimation (input), incomplétude -->
      <div class="mb-1.5 flex items-center gap-2">
        <SelectMenu
          wrap-class="shrink-0"
          :model-value="lotValue"
          :options="lotOptions"
          :min-width="150"
          @update:model-value="onLotChange"
        >
          <template #trigger="{ toggle, label }">
            <button
              type="button"
              class="nodrag badge lot-badge cursor-pointer border-0 font-extrabold text-white outline-hidden"
              :style="{ backgroundColor: data.lotColor }"
              title="Lot"
              @click.stop="toggle"
              @mousedown.stop
              @dblclick.stop
            >
              <span class="truncate">{{ label }}</span>
              <svg class="status-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </template>
        </SelectMenu>
        <input
          :value="a.code"
          class="nodrag badge badge-dashed w-[70px] min-w-0 shrink border-secondary bg-secondary-100 font-extrabold uppercase text-secondary-700 outline-hidden placeholder:text-secondary-300 focus:ring-1 focus:ring-secondary"
          placeholder="CODE"
          aria-label="Code"
          @change="setCode"
          @mousedown.stop
          @dblclick.stop
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span
          v-if="data.orphan"
          class="badge shrink-0 bg-secondary-50 font-bold text-secondary-400"
          title="Non réalisée : aucune page ni bloc ne réalise cette fonctionnalité"
        >⌀</span>
        <input
          :value="a.estimate"
          class="nodrag badge badge-dashed badge-estimate ml-auto w-[62px] shrink-0 text-right font-extrabold outline-hidden focus:ring-1 focus:ring-emerald-400"
          placeholder="estimer"
          aria-label="Estimation"
          @change="setEstimate"
          @mousedown.stop
          @dblclick.stop
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span
          v-if="data.incomplete"
          class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
          title="À compléter"
        />
      </div>

      <!-- Titre (éditable inline) -->
      <textarea
        v-if="nameEd.editing.value"
        :ref="(el) => (nameEd.inputRef.value = el as HTMLTextAreaElement | null)"
        v-model="nameEd.draft.value"
        rows="2"
        class="nodrag edit-area card-title w-full resize-none rounded-sm border border-primary-300 px-1 outline-hidden"
        @blur="nameEd.commit()"
        @keydown="nameEd.onKeydown"
      />
      <div
        v-else
        class="editable clamp card-title"
        :style="clampStyle(c.name)"
        title="Double-clic pour renommer"
        @dblclick.stop="nameEd.begin()"
      >{{ a.name || 'Fonctionnalité' }}</div>

      <!-- Contenu : éditeur riche INLINE quand la carte est sélectionnée ; sinon aperçu clampé.
           Les DEUX wrappers portent le MÊME contexte (taille, couleur) : c'est la carte qui décide de
           l'aspect de son contenu, l'éditeur n'en impose aucun. Tout écart ici se voit comme un saut
           du texte sous le curseur au moment de la sélection. -->
      <div
        v-if="selected && editorMounted"
        class="nodrag mt-1.5 feature-editor-inline card-body"
        @mousedown.stop
        @dblclick.stop
      >
        <RichEditor variant="card" :model-value="a.content" @update:model-value="onContent" />
      </div>
      <!-- Aperçu conservé tant que l'éditeur différé n'est pas monté : la carte sélectionnée ne
           passe jamais par un état vide (les deux wrappers partagent le même contexte, cf. plus
           haut — le remplacement est invisible hors curseur). -->
      <div
        v-else-if="!isEmptyDoc(a.content)"
        class="mt-1.5 cursor-text card-body"
        title="Sélectionner pour éditer le contenu"
      >
        <RichContent :doc="a.content" class="feature-preview" />
      </div>

      <!-- Réalisé par -->
      <div v-if="realizers.length" class="mt-1.5">
        <div class="field-label">Réalisé par</div>
        <div class="mt-0.5 flex flex-wrap gap-1">
          <button
            v-for="r in realizers"
            :key="r.id"
            type="button"
            class="nodrag inline-flex items-center gap-1 rounded-sm border border-cyan-200 bg-cyan-50 px-1 py-0.5 text-[9px] font-medium text-cyan-700 hover:bg-cyan-100"
            :title="`Aller à « ${r.attrs.name} »`"
            @click.stop="goRealizer(r.id)"
            @mousedown.stop
          >
            <span class="text-[8px] uppercase text-cyan-400">{{ r.kind === 'page' ? 'page' : 'bloc' }}</span>
            <span class="max-w-[90px] truncate">{{ r.attrs.name || 'Sans nom' }}</span>
          </button>
        </div>
      </div>

      <!-- Champs de projet : un sélecteur libellé par entrée de doc.featureFields (v7). Leur nombre,
           leur libellé et leurs options sont pilotés par le projet, plus par le code. -->
      <FeatureFieldSelect
        v-for="f in store.orderedFeatureFields"
        :key="f.id"
        class="mt-1.5"
        :feature-id="id"
        :field="f"
      />

      <!-- Zone de suivi (cycle de vie v10) : pointillé séparateur, titre + select de statut, puis la
           checklist de la phase courante et la barre de progression. Toujours présente (chaque
           fonctionnalité a un statut) ; barre masquée si la phase n'a aucun item. -->
      <div class="suivi mt-2 border-t border-dashed border-slate-300 pt-2">
        <div class="flex items-center gap-2">
          <span class="suivi-title min-w-0 flex-1 truncate">{{ zoneTitle }}</span>
          <SelectMenu
            wrap-class="shrink-0"
            :model-value="status"
            :options="STATUS_OPTIONS"
            :min-width="170"
            align="right"
            @update:model-value="onStatusChange"
          >
            <template #trigger="{ toggle }">
              <button
                type="button"
                class="nodrag status-pill cursor-pointer outline-hidden"
                :class="`status-pill--${pillVariant}`"
                title="Statut du cycle de vie"
                @click.stop="toggle"
                @mousedown.stop
                @dblclick.stop
              >
                <span class="truncate">{{ STATUS_LABELS[status] }}</span>
                <svg class="status-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </template>
          </SelectMenu>
        </div>

        <ul v-if="phaseItems.length" class="mt-1.5 flex flex-col gap-1">
          <li v-for="item in phaseItems" :key="item.id" class="group/step flex items-center gap-2">
            <button
              type="button"
              class="nodrag step-box shrink-0"
              :class="{ 'step-box--done': item.done }"
              :title="item.done ? 'Décocher' : 'Cocher'"
              @click.stop="toggleStep(item.id)"
              @mousedown.stop
            >
              <svg
                v-if="item.done"
                viewBox="0 0 14 14"
                class="h-full w-full"
                fill="none"
                stroke="#fff"
                stroke-width="2.2"
              >
                <path d="M3 7.5l2.5 2.5L11 4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <input
              v-if="selected && editingItem === item.id"
              v-model="itemDraft"
              class="nodrag step-edit min-w-0 flex-1"
              @blur="commitRenameStep"
              @keydown.enter.prevent="commitRenameStep"
              @keydown.esc.prevent="editingItem = null"
              @mousedown.stop
            />
            <template v-else>
              <span
                class="step-label min-w-0 flex-1 truncate"
                :class="{ 'step-label--done': item.done }"
                :title="selected ? 'Double-clic pour renommer' : item.label"
                @dblclick.stop="selected && beginRenameStep(item.id, item.label)"
              >{{ item.label }}</span>
              <button
                v-if="selected"
                type="button"
                class="nodrag step-remove shrink-0 opacity-0 group-hover/step:opacity-100"
                title="Retirer l'étape"
                @click.stop="removeStep(item.id)"
                @mousedown.stop
              >×</button>
            </template>
          </li>
        </ul>

        <div v-if="phaseItems.length" class="mt-1.5 flex items-center gap-2">
          <div class="progress-track min-w-0 flex-1">
            <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
          </div>
          <span class="progress-count shrink-0">{{ doneCount }}/{{ phaseItems.length }}</span>
        </div>

        <!-- Ajout d'étape : TOUJOURS affiché. Réservé à la carte sélectionnée, il apparaissait au clic
             et faisait grandir la carte au moment même où l'on interagit avec elle — tout le layout
             sautait sous le curseur. Miroir : cardMetrics le compte lui aussi inconditionnellement. -->
        <input
          v-model="newStep"
          class="nodrag step-add mt-1.5 w-full"
          placeholder="Ajouter une étape…"
          @keydown.enter.prevent="addStep"
          @mousedown.stop
          @dblclick.stop
        />
      </div>
      </div><!-- /feat-innards (virtualisation) -->

      <!-- Ports « dépend de » -->
      <Handle
        v-for="h in data.handles"
        :id="h.id"
        :key="h.id"
        :type="h.type"
        :position="POS[h.side]"
        :connectable="h.connectable"
        :style="handleStyle(h.side)"
        class="dep-handle"
        :class="h.free ? 'dep-free' : 'dep-dot'"
      />
      <Handle id="c" type="target" :position="Position.Left" :connectable="true" class="dep-catch" />
    </div>
  </div>
</template>

<style scoped>
/* VIRTUALISATION (phase 1 refonte canvas) : hors du viewport, le navigateur saute entièrement le
   style/layout/paint du contenu de la carte — c'est le levier de la charge initiale (~4 500
   éléments intérieurs sur locasyst, dont l'essentiel hors écran au premier rendu). La taille
   intrinsèque (inline, estimée par carte) évite l'effondrement des boîtes jamais rendues ; le
   ResizeObserver de la carte voit donc l'estimation puis la mesure réelle au premier passage à
   l'écran — exactement la séquence estimation→mesure que le layout absorbe déjà (coalescée rAF). */
.feat-innards {
  content-visibility: auto;
}
/* Échelle typographique de la carte, calée sur la maquette (300px ≈ FEATURE_WIDTH 276px, donc les
   tailles Figma sont à l'échelle 1:1). Miroir des constantes de cardMetrics.ts : toute retouche ici
   doit y être répercutée, sinon le plancher de hauteur estimé décroche du rendu réel. */
/* (Liseré de LOT : RETIRÉ — retour Hugo 23/07, raccord avec les cartes de l'arbo qui n'en ont
   pas ; le lot se lit au badge coloré de l'en-tête. C'était un ::before de 4px au bord gauche ;
   son affleurement au voile de grisage posait par ailleurs problème. `position: relative` reste :
   le voile ::after et les éléments absolus de la carte s'y ancrent. */
.feature-node {
  position: relative;
}
/* Mises en retrait de la carte — bloquée (arbre de déblocage) ou estompée (hors chaîne).
   L'atténuation porte sur le CONTENU, JAMAIS sur `.feature-node` lui-même : une opacité posée sur
   le conteneur rendrait aussi son fond blanc translucide, et les arêtes de dépendance — dessinées
   derrière les cartes — se verraient À TRAVERS la carte. */
/* Mise en retrait par VOILE (::after blanc semi-opaque par-dessus le contenu) et non plus par
   `filter: grayscale()` sur les enfants : un filtre CSS force une COUCHE RASTÉRISÉE par carte,
   repeinte à chaque image de pan/zoom — « grouper par lot + par module + griser les bloqués »
   faisait chuter les fps à proportion des cartes grisées (retour Hugo 23/07). Le voile est une
   simple composition alpha : coût marginal, quel que soit leur nombre. Le fond de carte reste
   plein (rien ne transparaît — l'exigence historique), le contenu se délave, et tout reste
   pleinement CLIQUABLE (`pointer-events: none` sur le voile seul : une mise en retrait n'est pas
   une désactivation). */
.feat-blocked::after,
.feat-dimmed::after {
  content: '';
  position: absolute;
  inset: 0;
  /* Rayon INTÉRIEUR de la carte, pas l'extérieur : `inset: 0` cale le voile sur la boîte de
     padding (dans la bordure de 1px), dont la courbe vaut rounded-lg (8px) − 1px. Avec `inherit`
     (8px) les coins du voile décollaient de la carte (retour Hugo). La bordure reste HORS voile,
     comme elle restait hors du filtre d'origine (`> *` ne prenait que les enfants). */
  border-radius: 7px;
  background: white;
  pointer-events: none;
}
.feat-blocked::after {
  opacity: 0.62;
}
/* Hors chaîne : plus effacée encore que « bloquée ». */
.feat-dimmed::after {
  opacity: 0.84;
}
/* Dans la chaîne de la carte sélectionnée. L'essentiel de la mise en avant vient du RETRAIT des
   autres (.feat-dimmed) ; il ne reste à poser ici qu'un liseré, assez pour relier les maillons entre
   eux d'un coup d'œil, assez discret pour que la carte SÉLECTIONNÉE — anneau plein — reste
   identifiable comme le point de départ de la chaîne. */
.feat-chained {
  border-color: var(--color-primary-300);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
}
.card-title {
  font-size: 14px;
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: -0.7px;
  color: var(--color-black);
}
.card-body {
  font-size: 11px;
  /* 1.5 = valeur de la maquette, et surtout celle de l'éditeur Tiptap (RichEditor variant="card").
     L'aperçu portait `leading-snug` (1.375) : le texte changeait donc de hauteur de ligne au moment
     où l'on sélectionnait la carte pour l'éditer. Poser la valeur ICI, sur la classe partagée par
     l'aperçu ET l'éditeur, empêche les deux de redivorcer. Miroir : CARD_TEXT_LH dans cardMetrics. */
  line-height: 1.5;
  letter-spacing: -0.55px;
  color: var(--color-gray-700);
}
/* Pastilles de la ligne d'en-tête (lot, code, estimation). */
.badge {
  padding: 4px 8px;
  border-radius: 2px;
  font-size: 11px;
  line-height: 1;
  letter-spacing: -0.55px;
}
.badge-dashed {
  border-width: 0.5px;
  border-style: dashed;
}
/* Vert de l'estimation : la maquette pose #3c814d, qui ne tombe sur aucun stop Tailwind et n'est pas
   exposé en variable Figma — gardé local plutôt que d'inventer un token de design system. */
.badge-estimate {
  border-color: #3c814d;
  background: #ecfdf5;
  color: #3c814d;
}
.badge-estimate::placeholder {
  color: #6ee7b7;
}
.clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.editable {
  border-radius: 4px;
  margin: 0 -2px;
  padding: 0 2px;
  cursor: text;
  transition: background-color 120ms ease;
}
.editable:hover {
  background: rgba(139, 92, 246, 0.07);
}
.editing-open {
  overflow: visible;
  z-index: 40;
}
.edit-area {
  position: relative;
  z-index: 10;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}
/* Aperçu du contenu riche : hérite du 11px et du gray-700 du conteneur (`.card-body`) ; le modèle de
   bloc (titres, marges, code) vient de `.rich-body` (css/rich.css), PARTAGÉ avec l'éditeur inline →
   pas de saut au passage aperçu ↔ édition. Le `leading-snug` du wrapper est écrasé ici pour rejoindre
   le 1.5 de l'éditeur en variante carte. */
.feature-node :deep(.feature-preview) {
  line-height: 1.5;
}
.field-label {
  margin-top: 4px;
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(148 163 184);
}
.feature-node :deep(.dep-handle) {
  width: 7px;
  height: 7px;
  background: #8b5cf6;
  border: 1.5px solid #fff;
}
.feature-node :deep(.dep-free) {
  opacity: 0;
  background: #c4b5fd;
  transition: opacity 120ms ease;
}
.feature-node:hover :deep(.dep-free) {
  opacity: 0.85;
}
.feature-node :deep(.dep-hidden) {
  opacity: 0 !important;
}
.feature-node :deep(.dep-catch) {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  min-width: 0;
  min-height: 0;
  opacity: 0;
  background: transparent;
  border: none;
  pointer-events: none;
}

/* ── Zone de suivi (cycle de vie v10) — miroir des hauteurs de cardMetrics.ts ── */
.suivi-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-gray);
}
/* Pastille de statut (select natif stylé en pilule) : dorée en dév, bleu-gris en cadrage, grise pour
   une sortie de route. La flèche native tient lieu de chevron (idiome déjà pris par le select de lot). */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  border-radius: 4px;
  border: 1px solid transparent;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.3px;
}
/* Badge de lot devenu bouton (SelectMenu) : mêmes métriques que .badge + chevron aligné. */
.lot-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}
.status-chevron {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  opacity: 0.7;
}
.status-pill--dev {
  background: var(--color-gold-100);
  border-color: var(--color-gold-200);
  color: var(--color-gold-700);
}
.status-pill--cadrage {
  background: var(--color-primary-300);
  border-color: var(--color-primary-300);
  color: var(--color-primary-700);
}
.status-pill--exit {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #64748b;
}
/* Case à cocher arrondie : vide (bord gris) → cochée (fond vert plein, coche blanche). */
.step-box {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  border: 1.5px solid var(--color-gray-300);
  background: #fff;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}
.step-box--done {
  background: var(--color-check);
  border-color: var(--color-check);
}
/* Libellé d'étape : cochée = texte plein (sombre), non cochée = atténuée (calé sur la maquette). */
.step-label {
  font-size: 12px;
  letter-spacing: -0.4px;
  color: var(--color-gray);
  cursor: default;
}
.step-label--done {
  color: var(--color-black);
}
.step-edit,
.step-add {
  font-size: 12px;
  letter-spacing: -0.4px;
  color: var(--color-black);
  background: #fff;
  /* Bordure d'ÉDITION = accent d'interface (`primary`), pas le violet sémantique du badge « code ». */
  border: 1px solid var(--color-primary-300);
  border-radius: 4px;
  padding: 1px 5px;
  outline: none;
}
.step-add::placeholder {
  color: var(--color-gray-300);
}
.step-remove {
  font-size: 15px;
  line-height: 1;
  color: var(--color-gray-300);
  padding: 0 2px;
  transition:
    color 120ms ease,
    opacity 120ms ease;
}
.step-remove:hover {
  color: #ef4444;
}
/* Barre de progression dorée cochés/total sur la phase courante. */
.progress-track {
  height: 7px;
  border-radius: 9999px;
  background: var(--color-gray-100);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 9999px;
  background: var(--color-gold);
  transition: width 180ms ease;
}
.progress-count {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--color-gold-700);
  /* Le compteur n/total change à chaque coche : chiffres à chasse fixe pour que la barre ne bouge pas. */
  font-variant-numeric: tabular-nums;
}
</style>

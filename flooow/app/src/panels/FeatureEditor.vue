<script setup lang="ts">
// Éditeur de fonctionnalité en SPLIT pleine hauteur (droite), style Notion. Champs STRUCTURÉS (lot,
// code, titre, périmètre, estimation) en buffer + commit débouncé ; CONTENU LIBRE dans un éditeur
// riche Tiptap (RichEditor) — commit débouncé + coalescé (une seule entrée d'historique par salve de
// frappe). S'ouvre sur « Éditer » d'une carte (voir useFeatureEditor). Le pont « réalisé par » reste.
import { reactive, ref, computed, watch, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { useFeatureEditor } from '@/composables/useFeatureEditor'
import { isFeature } from '@flooow/core/model/types'
import type { FeatureNode } from '@flooow/core/model/types'
import { EMPTY_DOC, type RichDoc } from '@flooow/core/model/richContent'
import { lotColor } from '@/theme/tokens'
import SeamlessField from './SeamlessField.vue'
import RealizationSection from './RealizationSection.vue'
import RichEditor from './RichEditor.vue'
import FeatureFieldSelect from './FeatureFieldSelect.vue'

const ui = useUiStore()
const project = useProjectStore()
const { featureId } = useFeatureEditor()

const node = computed<FeatureNode | null>(() => {
  const id = featureId.value
  if (!id) return null
  const n = project.nodeById(id)
  return n && isFeature(n) ? n : null
})

const LOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

const buf = reactive({ code: '', name: '', estimate: '' })
const contentBuf = ref<RichDoc>(EMPTY_DOC)

const panelRef = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let contentTimer: ReturnType<typeof setTimeout> | undefined
let bufferedId: string | null = null

function panelHasFocus(): boolean {
  const el = panelRef.value
  return !!el && el.contains(document.activeElement)
}

function loadBuffer(id: string | null): void {
  const n = id ? project.nodeById(id) : null
  if (!n || !isFeature(n)) return
  bufferedId = id
  buf.code = n.attrs.code
  buf.name = n.attrs.name
  buf.estimate = n.attrs.estimate
  contentBuf.value = n.attrs.content ?? EMPTY_DOC
}

// ── Champs structurés (code / titre / estimation) : commit débouncé ──────────────
function commitNow(id: string | null): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (!id || id !== bufferedId) return
  const n = project.nodeById(id)
  if (!n || !isFeature(n)) return
  project.updateAttrs(id, { code: buf.code, name: buf.name, estimate: buf.estimate })
}
function scheduleCommit(): void {
  const id = featureId.value
  if (!id) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => commitNow(id), 300)
}

// ── Contenu riche : commit débouncé + coalescé (une entrée d'historique par salve) ──
function onContentUpdate(doc: RichDoc): void {
  contentBuf.value = doc
  const id = featureId.value
  if (!id) return
  if (contentTimer) clearTimeout(contentTimer)
  contentTimer = setTimeout(() => commitContent(id), 400)
}
function commitContent(id: string | null): void {
  if (contentTimer) {
    clearTimeout(contentTimer)
    contentTimer = undefined
  }
  if (!id || id !== bufferedId) return
  project.updateAttrs(id, { content: contentBuf.value }, `feat-content:${id}`)
}

function flush(): void {
  commitNow(featureId.value)
  commitContent(featureId.value)
}

// Contrôles à commit immédiat (lot ; les champs de projet commitent depuis FeatureFieldSelect).
function setLot(value: string): void {
  const id = featureId.value
  if (!id) return
  project.assignLot(id, value === '' ? null : Number(value))
}

const lot = computed(() => (featureId.value ? project.lotOf(featureId.value) : 1))
const completeness = computed(() =>
  featureId.value ? project.completenessOf(featureId.value) : { missing: [], complete: true },
)
function close(): void {
  flush()
  ui.closeEditor()
}

watch(
  () => featureId.value,
  (id, prev) => {
    if (prev && prev !== id) {
      commitNow(prev)
      commitContent(prev)
    }
    if (id) loadBuffer(id)
  },
  { immediate: true },
)
watch(
  () => project.graphVersion,
  () => {
    if (!panelHasFocus()) loadBuffer(featureId.value)
  },
)

onBeforeUnmount(() => flush())
</script>

<template>
  <aside
    v-if="node"
    ref="panelRef"
    class="feature-editor flex h-full flex-col border-l border-slate-200 bg-white"
    aria-label="Éditeur de fonctionnalité"
  >
    <!-- Barre supérieure : lot + code + fermeture -->
    <header class="flex items-center gap-2 px-6 pt-4">
      <select
        class="lot-select rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white"
        :style="{ backgroundColor: lotColor(lot) }"
        :value="node.lot != null ? String(node.lot) : ''"
        title="Lot"
        @change="setLot(($event.target as HTMLSelectElement).value)"
      >
        <option value="">L{{ lot }} · hérité</option>
        <option v-for="l in LOT_OPTIONS" :key="l" :value="String(l)">Lot {{ l }}</option>
      </select>
      <SeamlessField v-model="buf.code" mono placeholder="CODE" class="max-w-[140px]" @update:model-value="scheduleCommit" @commit="flush" />
      <span
        v-if="!completeness.complete"
        class="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
        :title="`À renseigner : ${completeness.missing.join(', ')}`"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-amber-500" />
        à compléter
      </span>
      <button
        type="button"
        class="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        :class="{ 'ml-2!': !completeness.complete }"
        aria-label="Fermer l'éditeur"
        title="Fermer"
        @click="close"
      >
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <!-- Corps scrollable -->
    <div class="flex-1 overflow-y-auto px-6 pb-10 pt-2">
      <!-- Titre -->
      <SeamlessField v-model="buf.name" heading placeholder="Sans titre" @update:model-value="scheduleCommit" @commit="flush" />

      <!-- Champs de projet (v7) : mêmes listes, mêmes libellés que sur la carte du canvas. -->
      <div v-if="featureId" class="mt-3 flex flex-wrap items-start gap-4">
        <FeatureFieldSelect
          v-for="f in project.orderedFeatureFields"
          :key="f.id"
          :feature-id="featureId"
          :field="f"
        />
      </div>

      <!-- Estimation -->
      <div class="mt-3 flex items-center gap-2">
        <span class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Estimation</span>
        <SeamlessField v-model="buf.estimate" placeholder="1j · 4h · à estimer" class="max-w-[220px]" @update:model-value="scheduleCommit" @commit="flush" />
      </div>

      <hr class="my-5 border-slate-100" />

      <!-- Contenu libre (éditeur riche Notion-like) -->
      <RichEditor :model-value="contentBuf" @update:model-value="onContentUpdate" />

      <hr class="my-5 border-slate-100" />

      <!-- Pont inter-couches : pages/blocs qui réalisent cette fonctionnalité -->
      <RealizationSection :node-id="node.id" direction="feature" />
    </div>
  </aside>
</template>

<style scoped>
.feature-editor :deep(.lot-select) {
  border: 0;
  outline: none;
  appearance: none;
  cursor: pointer;
}
</style>

<script setup lang="ts">
// Menu de quick-create (evolution-v2.md §3) : ouvert au lâcher d'un lien dans le vide, positionné
// au curseur (coords écran). Propose de créer + relier un élément à la source.
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import type { QuickCreateKind } from './useCanvasSync'

defineProps<{ x: number; y: number }>()
const emit = defineEmits<{
  (e: 'select', kind: QuickCreateKind): void
  (e: 'close'): void
}>()

const ui = useUiStore()

const STRUCTURAL_ITEMS: { kind: QuickCreateKind; label: string; glyph: string }[] = [
  { kind: 'page', label: 'Page (naviguer vers)', glyph: '▭' },
  { kind: 'block', label: 'Bloc', glyph: '▤' },
]
const FUNCTIONAL_ITEMS: { kind: QuickCreateKind; label: string; glyph: string }[] = [
  { kind: 'feature', label: 'Fonctionnalité (dépend de)', glyph: '◈' },
]
// Options selon la couche active : la source ne peut relier que dans sa propre couche.
const ITEMS = computed(() =>
  ui.canvasLayer === 'functional' ? FUNCTIONAL_ITEMS : STRUCTURAL_ITEMS,
)
</script>

<template>
  <div
    class="quick-create fixed z-50 min-w-[190px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      Créer + relier
    </div>
    <button
      v-for="item in ITEMS"
      :key="item.kind"
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-sky-50"
      @click="emit('select', item.kind)"
    >
      <span class="w-4 text-center text-slate-400">{{ item.glyph }}</span>
      {{ item.label }}
    </button>
  </div>
</template>

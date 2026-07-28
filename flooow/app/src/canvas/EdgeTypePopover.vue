<script setup lang="ts">
// Popover de changement de type d'arête (evolution-v2.md §3) : au clic sur une arête manuelle,
// propose les types valides pour cette paire d'extrémités + suppression. (Plus d'option
// « Convertir en ligne/portail » depuis la v13 : la couche structurelle ne rend plus de portails.)
import type { EdgeType } from '@flooow/core/model/types'

defineProps<{
  x: number
  y: number
  current: EdgeType
  choices: EdgeType[]
}>()
const emit = defineEmits<{
  (e: 'select', type: EdgeType): void
  (e: 'remove'): void
  (e: 'close'): void
}>()

const LABELS: Record<EdgeType, string> = {
  navigatesTo: 'Navigue vers',
  dependsOn: 'Dépend de',
  realizedBy: 'Réalisé par',
}
</script>

<template>
  <div
    class="edge-popover fixed z-50 min-w-[150px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      Type de lien
    </div>
    <button
      v-for="type in choices"
      :key="type"
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-sky-50"
      :class="{ 'font-semibold text-sky-600': type === current }"
      @click="emit('select', type)"
    >
      <span
        class="inline-block h-1.5 w-1.5 rounded-full"
        :class="type === current ? 'bg-sky-500' : 'bg-slate-300'"
      />
      {{ LABELS[type] }}
    </button>
    <div class="my-1 border-t border-slate-100"></div>
    <button
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
      @click="emit('remove')"
    >🗑 Supprimer le lien</button>
  </div>
</template>

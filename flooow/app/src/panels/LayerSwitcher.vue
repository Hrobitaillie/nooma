<script setup lang="ts">
// Bascule de COUCHE du canvas (decisions.md §15) — le « mode » à la Figma : Arborescence
// (pages/blocs/notes) ou Fonctionnalités (modules/fonctionnalités). Orthogonale au ModeSwitcher
// (Canvas/Specs/API). Même bulle glissante que lui (useSlidingBubble), en pastille NOIRE.
// Monté dans la colonne flottante GAUCHE de PanelLayer (variante `panel`), sur le même axe X que
// le ToolDock et la ZoomBar — donc décalé comme eux quand le rail de modules
// rétrécit la scène. Visible en mode canvas seulement.
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import type { CanvasLayer } from '@flooow/core/model/types'
import { useSlidingBubble } from '@/composables/useSlidingBubble'
import FloatingPanel from './FloatingPanel.vue'

withDefaults(defineProps<{ variant?: 'panel' | 'bare' }>(), { variant: 'panel' })

const ui = useUiStore()

const layers: { id: CanvasLayer; label: string; icon: string }[] = [
  { id: 'structural', label: 'Arborescence', icon: '▤' },
  { id: 'functional', label: 'Fonctionnalités', icon: '◈' },
]

const listRef = ref<HTMLElement | null>(null)
const bubble = useSlidingBubble(listRef, () => ui.canvasLayer)
</script>

<template>
  <component
    :is="variant === 'bare' ? 'div' : FloatingPanel"
    v-bind="variant === 'bare' ? {} : { padded: false }"
    role="tablist"
    aria-label="Couche du canvas"
  >
    <div ref="listRef" class="relative flex gap-0.5 p-1">
      <!-- Bulle : glisse et s'étire vers la couche active -->
      <span
        v-show="bubble.ready"
        aria-hidden="true"
        class="absolute left-0 top-0 rounded-lg bg-black shadow-xs transition-[transform,width,height] duration-md ease-out"
        :style="{
          transform: `translate(${bubble.x}px, ${bubble.y}px)`,
          width: `${bubble.w}px`,
          height: `${bubble.h}px`,
        }"
      />
      <button
        v-for="l in layers"
        :key="l.id"
        type="button"
        role="tab"
        :aria-selected="ui.canvasLayer === l.id"
        :title="l.label"
        class="relative z-1 flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        :class="ui.canvasLayer === l.id ? 'text-white' : 'text-primary-700 hover:text-black'"
        @click="ui.setCanvasLayer(l.id)"
      >
        <span aria-hidden="true">{{ l.icon }}</span>
        {{ l.label }}
      </button>
    </div>
  </component>
</template>

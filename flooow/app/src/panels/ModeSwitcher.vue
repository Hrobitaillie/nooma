<script setup lang="ts">
// Sélecteur de mode Canvas / Specs / API — pilule à segments avec BULLE GLISSANTE
// (useSlidingBubble) : une pastille blanche absolue se déplace vers l'onglet actif.
// Monté dans la TOPBAR d'EditorView (variante `bare`, sans coquille FloatingPanel).
// Raccourcis 1…3 gérés par useKeyboard. Le narratif (ex-vue Notes) vit hors de l'app :
// lien « Docs » de la topbar vers le Portulan du site du projet.
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import type { AppMode } from '@/stores/ui'
import { useSlidingBubble } from '@/composables/useSlidingBubble'
import FloatingPanel from './FloatingPanel.vue'

withDefaults(defineProps<{ variant?: 'panel' | 'bare' }>(), { variant: 'panel' })

const ui = useUiStore()

const modes: { id: AppMode; label: string; hint: string }[] = [
  { id: 'canvas', label: 'Canvas', hint: '1' },
  { id: 'specs', label: 'Specs', hint: '2' },
  { id: 'api', label: 'API', hint: '3' },
]

const listRef = ref<HTMLElement | null>(null)
const bubble = useSlidingBubble(listRef, () => ui.mode)
</script>

<template>
  <component
    :is="variant === 'bare' ? 'div' : FloatingPanel"
    v-bind="variant === 'bare' ? {} : { padded: false }"
    role="tablist"
    aria-label="Mode d'affichage"
  >
    <div ref="listRef" class="relative flex gap-0.5 p-1">
      <!-- Bulle : glisse et s'étire vers l'onglet actif -->
      <span
        v-show="bubble.ready"
        aria-hidden="true"
        class="absolute left-0 top-0 rounded-lg bg-white shadow-xs transition-[transform,width,height] duration-md ease-out"
        :style="{
          transform: `translate(${bubble.x}px, ${bubble.y}px)`,
          width: `${bubble.w}px`,
          height: `${bubble.h}px`,
        }"
      />
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        role="tab"
        :aria-selected="ui.mode === m.id"
        :title="`${m.label} (${m.hint})`"
        class="relative z-1 rounded-lg px-3.5 py-1.5 text-sm cursor-pointer font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        :class="ui.mode === m.id ? 'text-black' : 'text-primary-700 hover:text-black'"
        @click="ui.setMode(m.id)"
      >
        {{ m.label }}
      </button>
    </div>
  </component>
</template>

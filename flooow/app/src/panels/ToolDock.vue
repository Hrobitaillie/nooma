<script setup lang="ts">
// Dock d'outils vertical (gauche-centre) v2 : sélection V, page P, bloc B, lien nav L. Un seul
// outil actif à la fois. La création retourne auto à « sélection », sauf en série (⇧ maintenu au
// clic) — géré par runTool. Les outils de NOTE ont disparu avec la refonte v13 ; l'outil
// commentaire arrive avec CommentsPanel. (evolution-v2.md §2, interface.md §ToolDock)
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { SITE_SELECTION_ID } from '@/stores/project'
import FloatingPanel from './FloatingPanel.vue'
import { toolsForLayer, useTool, runTool, type ToolId } from '@/composables/useKeyboard'

const ui = useUiStore()
const tool = useTool()

/** Sélectionne le « Site » pour éditer le contexte transversal dans le panneau de propriétés. */
function editSite(): void {
  ui.select(SITE_SELECTION_ID)
}
const siteSelected = computed(() => ui.selectedId === SITE_SELECTION_ID)

/** Outils affichés selon la couche active (structurelle ou fonctionnelle). */
const tools = computed(() => toolsForLayer(ui.canvasLayer))

// Glyphes compacts par outil (dessins SVG inline, cohérents avec les codes du canvas).
const icons: Record<ToolId, string> = {
  select: 'M4 3l14 6-6 2-2 6z',
  page: 'M5 3h10v14H5z',
  block: 'M4 8h12v6H4z',
  comment: 'M4 4h12v9H9.5L6 16.5V13H4z',
  link: 'M8 12a3 3 0 004 0l3-3a3 3 0 00-4-4l-1 1M12 8a3 3 0 00-4 0l-3 3a3 3 0 004 4l1-1',
  module: 'M3 5h6l1.5 2H17v8H3z',
  feature: 'M10 3l2 4.5 5 .5-3.5 3.5 1 5-4.5-2.5L6 19l1-5L3.5 10.5l5-.5z',
}

const separators = computed(() => new Set<ToolId>(['select', 'block', 'feature'])) // groupes visuels

function onClick(id: ToolId, event: MouseEvent): void {
  runTool(id, { sticky: event.shiftKey })
}
</script>

<template>
  <FloatingPanel :padded="false" aria-label="Outils">
    <div class="flex flex-col gap-1 p-1.5">
      <template v-for="t in tools" :key="t.id">
        <button
          type="button"
          :aria-label="`${t.label} (${t.key.toUpperCase()})`"
          :aria-pressed="tool.active === t.id"
          :title="`${t.label} — ${t.key.toUpperCase()} (⇧ = série)`"
          class="group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500"
          :class="
            tool.active === t.id
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
          "
          @click="onClick(t.id, $event)"
        >
          <svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path :d="icons[t.id]" />
          </svg>
          <span class="pointer-events-none absolute -bottom-0.5 right-0.5 text-[8px] font-semibold opacity-60">{{ t.key.toUpperCase() }}</span>
        </button>
        <div v-if="separators.has(t.id)" class="mx-1 my-0.5 h-px bg-black/10 dark:bg-white/10" />
      </template>

      <!-- Séparateur + accès au contexte projet (site) — édition dans le panneau de propriétés -->
      <div class="mx-1 my-0.5 h-px bg-black/10 dark:bg-white/10" />
      <button
        type="button"
        aria-label="Contexte du projet (description, contraintes globales)"
        :aria-pressed="siteSelected"
        title="Contexte du projet — description &amp; contraintes globales"
        class="group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500"
        :class="
          siteSelected
            ? 'bg-cyan-600 text-white shadow-xs'
            : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
        "
        @click="editSite"
      >
        <svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
          <circle cx="10" cy="10" r="7" />
          <path d="M3 10h14M10 3c2 2.5 2 11.5 0 14M10 3c-2 2.5-2 11.5 0 14" />
        </svg>
      </button>
    </div>
  </FloatingPanel>
</template>

<script setup lang="ts">
// Lentille Design / Dév du canvas (bas-centre, façon Figma). Boutons icône avec tooltip instantané ;
// pilote ui.canvasMode. En « Dév » l'édition de contenu est gelée (géré dans le store).
import { useUiStore, type CanvasMode } from '@/stores/ui'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()
const modes: { id: CanvasMode; tip: string }[] = [
  { id: 'design', tip: 'Mode design' },
  { id: 'dev', tip: 'Mode développement' },
]
</script>

<template>
  <FloatingPanel :padded="false" role="group" aria-label="Lentille design / développement">
    <div class="flex items-center gap-0.5 p-1">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="ctl"
        :class="{ on: ui.canvasMode === m.id }"
        :data-tip="m.tip"
        :aria-pressed="ui.canvasMode === m.id"
        @click="ui.setCanvasMode(m.id)"
      >
        <svg v-if="m.id === 'design'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 16l1-3.5L13.5 4l2.5 2.5L7.5 15 4 16z" /><path d="M12 5.5 14.5 8" />
        </svg>
        <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6 4 10l4 4M12 6l4 4-4 4" />
        </svg>
      </button>
    </div>
  </FloatingPanel>
</template>

<style scoped>
.ctl {
  display: grid;
  place-items: center;
  width: 40px;
  height: 30px;
  border-radius: 8px;
  color: rgb(71 85 105);
  transition: background-color 120ms, color 120ms;
}
.ctl svg { width: 18px; height: 18px; }
.ctl:hover:not(.on) { background: rgba(0, 0, 0, 0.05); color: rgb(30 41 59); }
/* Accent d'interface = token `primary` (cf. FuncControls) : le violet `secondary` est réservé au
   badge « code » des fonctionnalités, où il porte du sens. */
.ctl.on { background: var(--color-primary); color: #fff; }
:global(.dark) .ctl { color: rgb(212 212 216); }
:global(.dark) .ctl:hover:not(.on) { background: rgba(255, 255, 255, 0.1); color: #fff; }

/* Tooltip instantané — AU-DESSUS (barre en bas). */
[data-tip] { position: relative; }
[data-tip]:hover::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 60;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #0f172a;
  padding: 5px 8px;
  border-radius: 6px;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>

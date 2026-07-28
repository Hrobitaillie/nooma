<script setup lang="ts">
// Curseurs des autres utilisateurs (awareness, jalon 7). Rendus DANS le pane transformé de
// Vue Flow (Teleport vers .vue-flow__transformationpane) en coordonnées MONDE : le pan/zoom
// local déplace les curseurs nativement via le transform du pane — aucun recalcul par frame,
// donc pas de « nage » ni de téléportation pendant qu'ON se déplace. Seul un contre-zoom
// (1/zoom) est appliqué pour garder les curseurs à taille écran constante.
//
// Scoping par couche : un curseur n'est montré que si le pair est en mode canvas ET sur la
// MÊME couche (arbo/fonctionnelle) que nous — sinon il flotterait sur un contenu sans rapport.
import { computed, onMounted, ref } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { useUiStore } from '@/stores/ui'
import type { Peer } from './bridge'

const props = defineProps<{ peers: Peer[] }>()
const vf = useVueFlow()
const ui = useUiStore()

// Le pane transformé n'existe qu'une fois <VueFlow> monté ; ce composant étant son frère
// de slot (monté après), la cible est déjà là — le flag évite juste un Teleport orphelin en SSR/tests.
const ready = ref(false)
onMounted(() => {
  ready.value = true
})

const counterScale = computed(() => 1 / (vf.viewport.value.zoom || 1))

const cursors = computed(() =>
  props.peers.flatMap((p) => {
    if (p.isSelf || !p.cursor) return []
    if (p.view?.mode !== 'canvas' || p.view.layer !== ui.canvasLayer) return []
    return [
      {
        clientId: p.clientId,
        name: p.user.name,
        color: p.user.color,
        x: p.cursor.x,
        y: p.cursor.y,
      },
    ]
  }),
)
</script>

<template>
  <Teleport v-if="ready" to=".vue-flow__transformationpane">
    <div class="peer-cursors" aria-hidden="true">
      <div
        v-for="c in cursors"
        :key="c.clientId"
        class="peer-cursor"
        :style="{ transform: `translate(${c.x}px, ${c.y}px)` }"
      >
        <div class="peer-cursor-inner" :style="{ transform: `scale(${counterScale})` }">
          <svg width="18" height="22" viewBox="0 0 18 22">
            <path
              d="M1 1 L17 13 L9.5 14 L5 21 Z"
              :fill="c.color"
              stroke="#fff"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <span class="peer-cursor-name" :style="{ backgroundColor: c.color }">{{ c.name }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.peer-cursors {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 1000;
  pointer-events: none;
}
.peer-cursor {
  position: absolute;
  left: 0;
  top: 0;
  /* Lisse le mouvement du PAIR entre deux publications throttlées (~30 Hz). Le pan/zoom
     local passe par le transform du pane parent : cette transition ne le concerne pas. */
  transition: transform 90ms linear;
}
.peer-cursor-inner {
  transform-origin: 0 0;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.25));
}
.peer-cursor-name {
  position: absolute;
  left: 14px;
  top: 18px;
  max-width: 160px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
}
</style>

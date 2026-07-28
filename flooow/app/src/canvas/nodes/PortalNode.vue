<script setup lang="ts">
// Pastille PORTAIL — depuis la v13, uniquement la variante COMPACTE de la couche FONCTIONNELLE
// (funcPortalNodes : liens inter-modules en mode « portail »). La couche structurelle n'en rend
// plus : toute navigation y est une courbe pointillée derrière les cartes. Clic → focus l'autre
// bout ; clic droit → popover d'arête (type / supprimer).
import { inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useUiStore } from '@/stores/ui'
import { EDGE_MENU_KEY, type PortalNodeData } from '../useCanvasSync'

const props = defineProps<{ id: string; data: PortalNodeData }>()

const ui = useUiStore()
const openEdgeMenu = inject(EDGE_MENU_KEY, null)

function onClick(): void {
  ui.focusNode(props.data.other)
}
function onContextMenu(ev: MouseEvent): void {
  ev.preventDefault()
  ev.stopPropagation()
  openEdgeMenu?.(props.data.edgeId, ev.clientX, ev.clientY)
}
</script>

<template>
  <!-- Nœud à largeur fixe : la pastille s'ancre à gauche/droite selon le côté de la page. -->
  <div class="portal-slot" :style="{ justifyContent: data.align === 'right' ? 'flex-end' : 'flex-start' }">
    <div
      class="portal-pill"
      :class="{ 'portal-pill-compact': data.compact }"
      :title="`${data.label} — clic pour y aller, clic droit pour modifier/supprimer`"
      @click="onClick"
      @contextmenu="onContextMenu"
    >
      {{ data.label }}
      <Handle id="p-tgt" type="target" :position="Position.Left" :connectable="false" class="portal-handle" />
      <Handle id="p-src" type="source" :position="Position.Right" :connectable="false" class="portal-handle" />
    </div>
  </div>
</template>

<style scoped>
/* Conteneur à largeur fixe (fixée par le style du nœud) alignant la pastille sur un bord. */
.portal-slot {
  display: flex;
  width: 100%;
}
/* Portail = navigation → FOND gris, texte clair (cohérent avec les arêtes navigatesTo). */
.portal-pill {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 3px 10px;
  border-radius: 9999px;
  border: 1px solid #475569;
  background: #64748b;
  color: #f8fafc;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  cursor: pointer;
  user-select: none;
}
.portal-pill:hover {
  background: #475569;
  border-color: #334155;
}
/* Variante compacte (couche fonctionnelle) : petite, discrète, teinte violette. */
.portal-pill-compact {
  max-width: 56px;
  padding: 0 5px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.5;
  border-color: #c4b5fd;
  background: #ede9fe;
  color: #6d28d9;
  box-shadow: none;
  opacity: 0.9;
}
.portal-pill-compact:hover {
  background: #ddd6fe;
  border-color: #a78bfa;
  opacity: 1;
}
.portal-handle {
  opacity: 0;
  width: 1px;
  height: 1px;
  min-width: 0;
  min-height: 0;
  border: none;
  pointer-events: none;
}
</style>

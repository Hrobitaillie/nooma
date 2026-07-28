<script setup lang="ts">
// Arête de PARENTÉ de pages (v12) : trait PLEIN orthogonal, dérivé de `parentId` (useCanvasSync
// fabrique ces arêtes synthétiques, id `tree-<pageId>`). C'est la STRUCTURE du plan de site — par
// opposition à `navigatesTo`, lien de navigation transverse rendu en pointillés (TypedEdge).
// Non interactive : la parenté se change au geste (drag de la page) ou au panneau.
//
// v13 : tout lien part du CENTRE BAS du parent et arrive au CENTRE HAUT de l'enfant — plus de
// variante de gouttière. Dans une pile (toutes les cartes d'une colonne au même x depuis
// pageTree.ts), les liens parent → enfants fusionnent en une COLONNE VERTÉBRALE verticale qui
// passe DERRIÈRE les cartes (calque des arêtes sous celui des nœuds) et ne se lit que dans les
// écarts inter-cartes — le rendu Octopus. Le rail des rubriques garde son coude à mi-chemin
// (défaut smoothstep) : toutes les rubriques partagent la même ordonnée, leurs coudes fusionnent
// en un rail commun.
//
// MODE GL (jalon 3 phase 2, plan-phase2-gl.md) : l'arête n'étant PAS interactive, le composant ne
// rend RIEN — il publie sa polyligne (échantillonnée depuis le `d` smoothstep : parité de routage
// par construction) dans le canal que gl/edges.ts dessine. Repli : flooow:gl='0' → BaseEdge.
import { computed, onBeforeUnmount, watchEffect } from 'vue'
import { BaseEdge, getSmoothStepPath, useVueFlow, type Position as HandlePosition } from '@vue-flow/core'
import { glEnabled } from '../gl/useGlLayer'
import { setGlEdge, dropGlEdge, samplePathD } from '../gl/edgeChannel'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: HandlePosition
  targetPosition: HandlePosition
}>()

const path = computed(
  () =>
    getSmoothStepPath({
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
      borderRadius: 8,
    })[0],
)

// Slate-400 (v13, contraste) : le rail reste du fond de plan mais doit se VOIR — en slate-300 il
// disparaissait dès le premier dézoom. Et sous zoom 1, l'épaisseur MONDE grandit en 1/zoom (même
// esprit que le contre-zoom des libellés de cadre lot/module, commit 82e4e9f) : le trait garde
// ~2,5 px ÉCRAN au fitView au lieu de fondre en filet sous-pixel. Recalculé au changement de zoom
// seulement — un pan ne touche pas au zoom, rien n'est invalidé pendant le geste qui compte.
const { viewport } = useVueFlow()
const style = computed(() => {
  const z = viewport.value.zoom || 1
  const k = z < 1 ? 1 / z : 1
  return { stroke: '#94a3b8', strokeWidth: 2.5 * k }
})

const glMode = glEnabled()
if (glMode) {
  let sampledD = ''
  let sampledPts: number[] = []
  watchEffect(() => {
    const d = path.value
    if (d !== sampledD) {
      sampledD = d
      sampledPts = samplePathD(d)
    }
    setGlEdge(props.id, {
      pts: sampledPts,
      color: 0x94a3b8,
      alpha: 1,
      width: style.value.strokeWidth,
      dash: null,
      animated: false,
      arrowStart: false,
      arrowEnd: false,
    })
  })
  onBeforeUnmount(() => dropGlEdge(props.id))
}
</script>

<template>
  <BaseEdge v-if="!glMode" :id="id" :path="path" :style="style" />
</template>

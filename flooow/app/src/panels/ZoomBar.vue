<script setup lang="ts">
// Barre de navigation du canvas (bas-gauche) : un seul bouton, « Ajuster à la vue » (⇧1).
//
// Elle portait auparavant −, %, +, et une bascule de minimap. Tout est parti :
//  - les boutons − / + étaient MORTS : ils écrivaient `ui.setZoom()`, qui ne met à jour que le
//    pourcentage affiché et n'est jamais poussé vers `vf.zoomTo()` — le canvas ne bougeait pas.
//    Le zoom réel se fait à la molette, et le recadrage par ce bouton ;
//  - le pourcentage part avec eux : sans commande de zoom autour, un chiffre qu'on ne peut que
//    regarder n'est plus un contrôle, c'est du bruit (et `ui.zoom` n'est de toute façon pas
//    rebranché sur le viewport réel, il aurait pu mentir) ;
//  - la bascule de minimap n'a plus de cible : la <MiniMap> a été retirée de FlowCanvas.
//
// Le fit reste une opération canvas : émis en CustomEvent que FlowCanvas écoute (interface.md).
import FloatingPanel from './FloatingPanel.vue'

function zoomFit(): void {
  window.dispatchEvent(new CustomEvent('flooow:zoom-fit'))
}
</script>

<template>
  <FloatingPanel :padded="false" aria-label="Zoom">
    <div class="flex items-center p-1 text-slate-600 dark:text-zinc-300">
      <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-white/10" aria-label="Ajuster à la vue (⇧1)" title="Ajuster à la vue (⇧1)" @click="zoomFit">
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7V4h3M16 7V4h-3M4 13v3h3M16 13v3h-3" /></svg>
      </button>
    </div>
  </FloatingPanel>
</template>

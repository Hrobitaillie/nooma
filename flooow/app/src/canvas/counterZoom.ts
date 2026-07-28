// Contre-zoom des libellés et anneaux (phase 1 de la refonte canvas).
//
// Le principe visuel est inchangé depuis FlowCanvas v13 : certains textes (nom de lot, nom de
// module) et filets (anneau « commenté ») gardent une taille ÉCRAN constante en dézoom — c'est la
// seule information qu'on vient lire en vue d'ensemble. `1 / zoom` seulement en dessous de 1 : en
// zoom avant, un libellé figé à 12,5 px écran deviendrait une ligne minuscule perdue dans un cadre
// géant. On ne compense que ce qui rétrécit.
//
// Ce qui change, c'est OÙ la variable CSS est écrite. Historiquement `--flooow-label-scale` était
// posée sur la RACINE du canvas (« une seule écriture de style par changement de zoom pour tous
// les cadres ») — raisonnement juste pour le PAN (la variable n'y bouge pas), mais fatal au ZOOM :
// écrire une custom property sur un élément invalide le style calculé de TOUS ses descendants
// (elle est héritée — `@property` n'y change rien, vérifié), soit ~5 300 éléments sur locasyst à
// CHAQUE image de zoom. Mesuré en isolation : un pan à 60 fps tombe à ~93 ms/image dès qu'on
// écrit une variable par image sur la racine — c'est TOUT le coût du zoom continu de la baseline
// phase 0 (86,7 ms/image, 180/180 tâches longues).
//
// La variable est donc écrite INLINE sur chaque élément consommateur (libellés, anneaux : des
// feuilles sans descendance) par le composable ci-dessous : l'invalidation se réduit à une
// poignée d'éléments, le pan n'écrit rien (garde d'égalité), et la racine du canvas n'a plus de
// `:style` dépendant du zoom — FlowCanvas ne re-rend plus à chaque image de zoom.
import { watchPostEffect, type Ref } from 'vue'
import { useVueFlow } from '@vue-flow/core'

/** Facteur de contre-zoom (voir en-tête). Exporté pour les calculs écran ponctuels. */
export function labelScaleOf(zoom: number): number {
  const z = zoom || 1
  return z >= 1 ? 1 : 1 / z
}

/**
 * Tient `--flooow-label-scale` et `--flooow-label-lift` à jour, inline, sur l'élément donné.
 *
 * `--flooow-label-lift` = k − 1 : la surélévation du nom de LOT (voir `.lotbox-label`,
 * LotFrame.vue) — nulle à zoom 1, elle écarte les ancres du même facteur que les libellés
 * grandissent, pour que l'écart écran lot/module reste constant au lieu de se refermer.
 *
 * Garde d'égalité : le viewport change à chaque image de PAN aussi, mais le facteur n'y bouge
 * pas — on ne réécrit rien (une écriture de style par image, même identique, repayerait
 * l'invalidation de l'élément).
 */
export function useCounterZoomVars(el: Ref<HTMLElement | null>): void {
  const { viewport } = useVueFlow()
  let lastK = Number.NaN
  let lastEl: HTMLElement | null = null
  watchPostEffect(() => {
    const target = el.value
    if (!target) return
    const k = labelScaleOf(viewport.value.zoom)
    if (k === lastK && target === lastEl) return
    lastK = k
    lastEl = target
    target.style.setProperty('--flooow-label-scale', String(k))
    target.style.setProperty('--flooow-label-lift', String(k - 1))
  })
}

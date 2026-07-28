// Export PDF — V1 : impression navigateur de la vue stylée (@media print sur SpecsView).
// L'utilisateur choisit « Enregistrer au format PDF » dans la boîte d'impression système.
// Aucun rendu serveur, aucune dépendance : zéro requête réseau (securite.md §3).
//
// La vue (SpecsView) porte la classe `specs-view` et des règles @media print (masquage des
// panneaux via `.no-print`, sauts de page par section). On bascule en mode `specs` avant
// d'imprimer pour que le contenu à imprimer soit bien à l'écran.
import type { ProjectDoc } from '@flooow/core/model/types'

/**
 * Déclenche l'impression du cahier des specs. `beforetoggle` optionnel : hook appelé avant
 * l'impression (ex. `ui.setMode('specs')`) pour garantir que la vue est montée.
 */
export async function exportSpecsPdf(
  _doc: ProjectDoc,
  beforePrint?: () => void | Promise<void>,
): Promise<void> {
  if (typeof window === 'undefined') return
  if (beforePrint) await beforePrint()
  // Laisse Vue peindre la vue specs (montée + @media print) avant d'ouvrir la boîte d'impression.
  await nextPaint()
  window.print()
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

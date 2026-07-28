// Contour « sélectionné par un pair » (sélection partagée, jalon 7). Chaque node component
// l'applique en style inline sur sa racine : couleur dynamique du pair, impossible en classe.
// `outline-solid` (et pas box-shadow) pour ne pas écraser l'ombre d'élévation Tailwind des cartes.
import { computed, inject, type ComputedRef, type CSSProperties } from 'vue'
import { PEER_SELECTION_KEY } from './useCanvasSync'

export function usePeerSelectionStyle(getId: () => string): ComputedRef<CSSProperties> {
  const selections = inject(PEER_SELECTION_KEY, undefined)
  return computed(() => {
    const colors = selections?.value.get(getId())
    if (!colors?.length) return {}
    // Plusieurs pairs sur le même nœud : le premier donne l'outline, l'empilement est rare.
    return { outline: `2px solid ${colors[0]}`, outlineOffset: '2px' }
  })
}

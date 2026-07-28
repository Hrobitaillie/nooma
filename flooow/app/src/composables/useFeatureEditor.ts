// État dérivé « l'éditeur de fonctionnalité est-il ouvert ? » (split pleine hauteur, style Notion).
// Ouvert quand une fonctionnalité est en ÉDITION EXPLICITE (ui.editorNodeId, posé par « Éditer » sur
// la carte) en couche fonctionnelle et en mode canvas. Découplé de la sélection : sélectionner une
// carte ne l'ouvre plus. Partagé entre App.vue (rétrécit le canvas), PanelLayer.vue et FeatureEditor.
import { computed, type ComputedRef } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isFeature } from '@flooow/core/model/types'

export function useFeatureEditor(): {
  featureId: ComputedRef<string | null>
  open: ComputedRef<boolean>
} {
  const ui = useUiStore()
  const project = useProjectStore()

  const featureId = computed<string | null>(() => {
    if (ui.canvasLayer !== 'functional') return null
    if (ui.mode !== 'canvas') return null
    const id = ui.editorNodeId
    if (!id) return null
    const n = project.nodeById(id)
    return n && isFeature(n) ? n.id : null
  })
  const open = computed(() => featureId.value !== null)

  return { featureId, open }
}

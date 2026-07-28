// Navigation au clic sur un lien « # » rendu (RichContent). Par DÉLÉGATION sur le container plutôt
// qu'un listener par lien : RichContent produit son HTML via `generateHTML` + v-html, il n'y a donc
// aucun composant Vue par node sur lequel poser un @click.
//
// Le lien ne porte pas d'URL (cf refLinks.ts) : la cible est reconstruite ici à partir du couple
// (type, id) via les actions du store `ui`, et l'URL suit par useRouteSync. Un id forgé ou périmé ne
// résout rien — le clic est simplement inerte.
import { useUiStore } from '@/stores/ui'
import { REF_ID_ATTR, REF_TYPE_ATTR } from './refLinks'
import { isRefType, resolveRef, type RefType } from './richRefs'

export function useRefNavigation(): { onRefClick: (e: MouseEvent) => void } {
  const ui = useUiStore()

  /** Ouvre la cible. Les actions du store portent les effets de bord (bascule de mode, focus). */
  function go(type: RefType, id: string): void {
    // 'note' (legacy v8) ne passe jamais ici : resolveRef le déclare cassé, le clic est inerte.
    if (type === 'page') {
      ui.setCanvasLayer('structural')
      ui.focusNode(id)
      return
    }
    // feature : la carte vit dans la couche fonctionnelle, et on ouvre son éditeur — c'est le
    // contenu que le lien promettait. focusNode d'abord (il sélectionne, cf useRouteSync).
    ui.setCanvasLayer('functional')
    ui.focusNode(id)
    ui.openEditor(id)
  }

  function onRefClick(e: MouseEvent): void {
    const el = e.target instanceof Element ? e.target.closest(`[${REF_ID_ATTR}]`) : null
    if (!el) return
    const type = el.getAttribute(REF_TYPE_ATTR)
    const id = el.getAttribute(REF_ID_ATTR)
    if (!id || !isRefType(type)) return
    // Lien cassé : ne pas naviguer vers un fantôme (sélection d'un id inexistant, canvas recentré
    // sur rien). Le rendu le signale déjà visuellement (.ref-link--broken).
    if (!resolveRef(type, id).exists) return
    e.preventDefault()
    go(type, id)
  }

  return { onRefClick }
}

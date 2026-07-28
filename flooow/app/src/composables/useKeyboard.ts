// Raccourcis clavier globaux + état partagé du « shell » (outil actif, panneaux repliés).
// Table de référence : cadrage/05-implementation/interface.md §Raccourcis.
//
// Ce module héberge aussi le petit état d'UI transverse qui n'appartient pas au store `ui`
// (outil de création courant, série ⇧, repli du panneau de propriétés). Il est exposé via
// des singletons réactifs pour être partagé entre ToolDock, PropertiesPanel et les raccourcis.
import { reactive } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useFileActions } from '@/composables/useFileActions'
import { isBlock, isPage } from '@flooow/core/model/types'
import type { CanvasLayer, FlooowNode, Position } from '@flooow/core/model/types'

// ── Outils de création v2 (partagé ToolDock ↔ clavier ↔ canvas) ────────────────
// Modèle v2 : pages + blocs (frames) + liens de navigation. Les outils de NOTE ont disparu avec la
// refonte v13 (plan-refonte-notes-commentaires.md) — l'outil commentaire arrive avec CommentsPanel.

export type ToolId =
  | 'select'
  | 'page'
  | 'block'
  | 'comment'
  | 'link'
  | 'module'
  | 'feature'

export interface ToolDef {
  id: ToolId
  label: string
  /** touche mono-caractère (minuscule). */
  key: string
  /** couche où l'outil est proposé (`'both'` = les deux). */
  layer: CanvasLayer | 'both'
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Sélection', key: 'v', layer: 'both' },
  { id: 'page', label: 'Page', key: 'p', layer: 'structural' },
  { id: 'block', label: 'Bloc', key: 'b', layer: 'structural' },
  { id: 'comment', label: 'Commentaire', key: 'c', layer: 'structural' },
  { id: 'module', label: 'Module', key: 'm', layer: 'functional' },
  { id: 'feature', label: 'Fonctionnalité', key: 'f', layer: 'functional' },
  { id: 'link', label: 'Lien', key: 'l', layer: 'both' },
]

/** Outils proposés dans une couche donnée (palette + raccourcis). */
export function toolsForLayer(layer: CanvasLayer): ToolDef[] {
  return TOOLS.filter((t) => t.layer === 'both' || t.layer === layer)
}

const toolState = reactive<{ active: ToolId; sticky: boolean }>({
  active: 'select',
  sticky: false,
})

/** État réactif partagé de l'outil courant. */
export function useTool(): typeof toolState {
  return toolState
}

const panelState = reactive<{ propertiesCollapsed: boolean }>({
  propertiesCollapsed: false,
})

/** État réactif partagé des panneaux repliables. */
export function usePanelState(): typeof panelState {
  return panelState
}

/** Cascade de position (coords ABSOLUES) pour les créations top-level depuis le dock/clavier. */
function nextPosition(count: number): Position {
  const step = 48
  return { x: 120 + (count % 8) * step, y: 120 + (count % 8) * step }
}

/**
 * Remonte jusqu'à la page qui doit accueillir un bloc, à partir d'un nœud de contexte :
 * page → elle-même ; bloc → sa page (parentId).
 */
function pageContextFrom(node: FlooowNode): string | null {
  if (isPage(node)) return node.id
  if (isBlock(node)) return node.parentId
  return null
}

/**
 * Active un outil. Pour les outils de création, crée immédiatement le nœud correspondant,
 * le sélectionne, puis retourne à l'outil « sélection » — sauf en mode série (⇧ / sticky),
 * exactement comme Figma. `select` et `link` ne font que changer l'outil actif.
 *
 * Rattachement à la sélection (evolution-v2.md §2) :
 *  - Bloc : rejoint la page du nœud sélectionné (le store empile en bas via `position.y`).
 */
export function runTool(tool: ToolId, opts: { sticky?: boolean } = {}): void {
  const sticky = opts.sticky ?? false
  const project = useProjectStore()
  const ui = useUiStore()

  // Outils passifs : on ne fait qu'activer l'outil. `select`/`link` classiques ; `module`/`feature`
  // sont des outils de PLACEMENT (on pose le nœud au clic sur le canvas, cf. useCanvasSync.onPaneClick) ;
  // `comment` (v13) vise un ÉLÉMENT : le fil se crée au clic sur une page/un bloc (onNodeClick).
  if (tool === 'select' || tool === 'link' || tool === 'module' || tool === 'feature' || tool === 'comment') {
    toolState.active = tool
    toolState.sticky = tool === 'select' ? false : (opts.sticky ?? false)
    return
  }

  const sel = ui.selectedId ? project.nodeById(ui.selectedId) : undefined

  let id: string | undefined
  if (tool === 'page') {
    id = project.addPage({ position: nextPosition(project.pages.length) })
  } else if (tool === 'block') {
    const pageId = (sel && pageContextFrom(sel)) ?? project.pages[0]?.id ?? null
    if (pageId) id = project.addBlock(pageId, 'free')
  }

  if (id) ui.select(id)
  toolState.active = sticky ? tool : 'select'
  toolState.sticky = sticky
}

// ── Raccourcis globaux ────────────────────────────────────────────────────────

export interface KeyboardOptions {
  /** cible d'écoute (défaut : window). */
  target?: Window | HTMLElement
}

/** Le focus est-il dans un champ de saisie (où les raccourcis mono-touche sont désactivés) ? */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Installe les raccourcis globaux ; renvoie une fonction de nettoyage.
 * Les raccourcis mono-touche sont ignorés quand le focus est dans un champ ; les combinaisons
 * ⌘/Ctrl et Échap restent actives partout (conventions d'édition).
 */
export function useKeyboard(options: KeyboardOptions = {}): () => void {
  const target: Window | HTMLElement = options.target ?? window

  function onKeydown(event: KeyboardEvent): void {
    const ui = useUiStore()
    const project = useProjectStore()
    const history = useHistoryStore()

    const meta = event.metaKey || event.ctrlKey
    const inField = isEditableTarget(event.target)

    // ── Combinaisons ⌘/Ctrl (actives même dans les champs) ────────────────────
    if (meta) {
      const k = event.key.toLowerCase()
      if (k === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (k === 'y') {
        event.preventDefault()
        history.redo()
        return
      }
      if (k === 's') {
        event.preventDefault()
        const files = useFileActions()
        void (event.shiftKey ? files.saveAs() : files.save())
        return
      }
      if (k === 'o') {
        event.preventDefault()
        void useFileActions().open()
        return
      }
      if (k === 'k') {
        event.preventDefault()
        ui.togglePanel('search', true)
        return
      }
      return
    }

    // ── Échap (actif partout) ─────────────────────────────────────────────────
    if (event.key === 'Escape') {
      if (inField) {
        ;(event.target as HTMLElement).blur()
        return
      }
      if (ui.openPanels.search) {
        ui.togglePanel('search', false)
        return
      }
      if (toolState.active !== 'select') {
        toolState.active = 'select'
        toolState.sticky = false
        return
      }
      ui.clearSelection()
      return
    }

    // Au-delà, tout est désactivé dans les champs de saisie.
    if (inField) return

    // ── Modes & zoom (chiffres, via event.code pour ignorer les layouts) ──────
    if (event.code === 'Digit1' || event.code === 'Numpad1') {
      event.preventDefault()
      if (event.shiftKey) window.dispatchEvent(new CustomEvent('flooow:zoom-fit'))
      else ui.setMode('canvas')
      return
    }
    if (event.code === 'Digit2' || event.code === 'Numpad2') {
      ui.setMode('specs')
      return
    }
    if (event.code === 'Digit3' || event.code === 'Numpad3') {
      ui.setMode('api')
      return
    }

    // ── Suppression de la sélection ───────────────────────────────────────────
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const ids = ui.selectedIds
      if (ids.length === 0) return
      // Confirmation si une frame supprimée emporte des enfants (cascade).
      const withChildren = ids.filter((id) => project.descendantsOf(id).length > 0)
      if (withChildren.length > 0) {
        const total = withChildren.reduce((n, id) => n + project.descendantsOf(id).length, 0)
        const ok = window.confirm(
          `Supprimer ${ids.length} élément(s) et ${total} enfant(s) en cascade ?`,
        )
        if (!ok) return
      }
      for (const id of ids) project.removeNode(id)
      ui.clearSelection()
      return
    }

    // ── Repli du panneau de propriétés (⌥.) ───────────────────────────────────
    if (event.altKey && (event.key === '.' || event.code === 'Period')) {
      event.preventDefault()
      panelState.propertiesCollapsed = !panelState.propertiesCollapsed
      return
    }

    // (Plus de bascule minimap ⇧M : la <MiniMap> a été retirée du canvas, l'événement
    // `flooow:toggle-minimap` n'avait donc plus aucun auditeur. Un raccourci qui ne fait rien est
    // pire que pas de raccourci — et ⇧M restait pris pour l'outil « Module ».)

    // ── Outils (selon la couche active) ───────────────────────────────────────
    if (ui.mode === 'canvas' && !event.altKey) {
      const tool = toolsForLayer(ui.canvasLayer).find((t) => t.key === event.key.toLowerCase())
      if (tool) {
        event.preventDefault()
        runTool(tool.id, { sticky: event.shiftKey })
        return
      }
    }
  }

  target.addEventListener('keydown', onKeydown as EventListener)
  return () => target.removeEventListener('keydown', onKeydown as EventListener)
}

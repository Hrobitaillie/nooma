// Popup de suggestion partagée par les menus « / » (blocs), « @ » (mentions) et « # » (liens).
// Extraite de slashCommands.ts : la mécanique DOM est identique pour les trois, seuls le contenu
// des items et l'action d'insertion changent. Popup en DOM pur (pas de dépendance tippy),
// positionnée en fixed comme la barre flottante de RichEditor ; styles .slash-menu dans RichEditor.vue.
import { type Editor } from '@tiptap/core'
import { type PluginKey } from '@tiptap/pm/state'
import { exitSuggestion } from '@tiptap/suggestion'

/** Contrat minimal d'un item : de quoi peupler une ligne du menu. `run` est porté par l'appelant. */
export interface PopupItem {
  label: string
  hint: string
  /** Pastille optionnelle en tête de ligne (avatar, code fonctionnalité, icône de type). */
  badge?: { text: string; className?: string }
}

export interface PopupRenderProps<T extends PopupItem> {
  editor: Editor
  items: T[]
  command: (item: T) => void
  clientRect?: (() => DOMRect | null) | null
}

/** Contrat de rendu attendu par @tiptap/suggestion. */
export interface PopupRenderer<T extends PopupItem> {
  onStart: (props: PopupRenderProps<T>) => void
  onUpdate: (props: PopupRenderProps<T>) => void
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
  onExit: () => void
}

/** Marge minimale conservée entre le menu et les bords du viewport. */
const VIEWPORT_MARGIN = 8

/**
 * Fabrique un renderer de popup de suggestion. `emptyLabel` : texte affiché quand aucun item ne
 * correspond — pour « / » on masque le menu (l'utilisateur tape du texte), pour « @ »/« # » on
 * affiche « Aucun résultat » car le menu reste pertinent tant que la requête est en cours.
 *
 * `pluginKey` : celle de l'extension appelante, la MÊME que celle passée à `Suggestion({ pluginKey })`.
 * Obligatoire dès qu'il existe plusieurs menus : `exitSuggestion` sans clé viserait la clé par défaut
 * et le clic hors menu fermerait un autre plugin que celui affiché.
 */
export function createSuggestionPopup<T extends PopupItem>(
  options: { emptyLabel?: string; pluginKey: PluginKey },
): () => PopupRenderer<T> {
  return function createRenderer(): PopupRenderer<T> {
    let el: HTMLDivElement | null = null
    let buttons: HTMLButtonElement[] = []
    let items: T[] = []
    let selected = 0
    let apply: (item: T) => void = () => {}
    let onOutsidePointerDown: ((e: PointerEvent) => void) | null = null

    /**
     * Surbrillance SEULE, sans reconstruire la liste. Reconstruire au survol (l'ancien `render()`)
     * détachait le bouton sous le curseur — le `mousedown` suivant partait dans le vide — et remettait
     * le scroll du menu à zéro, rendant les derniers items inatteignables.
     */
    function highlight(intoView = false): void {
      buttons.forEach((b, i) => b.classList.toggle('slash-item--selected', i === selected))
      if (intoView) buttons[selected]?.scrollIntoView({ block: 'nearest' })
    }

    function render(): void {
      if (!el) return
      buttons = items.map((item, i) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'slash-item'
        if (item.badge) {
          const badge = document.createElement('span')
          badge.className = `slash-item__badge ${item.badge.className ?? ''}`.trim()
          badge.textContent = item.badge.text
          btn.append(badge)
        }
        const label = document.createElement('span')
        label.className = 'slash-item__label'
        label.textContent = item.label
        const hint = document.createElement('span')
        hint.className = 'slash-item__hint'
        hint.textContent = item.hint
        btn.append(label, hint)
        // mousedown (pas click) : ne pas voler le focus de l'éditeur avant l'insertion.
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          apply(item)
        })
        btn.addEventListener('mouseenter', () => {
          selected = i
          highlight()
        })
        return btn
      })

      if (!items.length && options.emptyLabel) {
        const empty = document.createElement('div')
        empty.className = 'slash-empty'
        empty.textContent = options.emptyLabel
        el.replaceChildren(empty)
        el.style.display = 'block'
        return
      }

      el.replaceChildren(...buttons)
      highlight()
      el.style.display = items.length ? 'block' : 'none'
    }

    /**
     * Alignée sur le bord GAUCHE du container Tiptap, sous la ligne du curseur — mais TOUJOURS dans le
     * viewport : la hauteur est bornée à la place disponible et le menu bascule au-dessus du curseur
     * quand il y a plus de place en haut. Sans ça, un menu ancré bas (typiquement une carte en bas du
     * canvas) déborde de l'écran et ses items ne sont tout simplement pas cliquables.
     */
    function position(props: PopupRenderProps<T>): void {
      if (!el) return
      const caret = props.clientRect?.() ?? null
      const editorRect = props.editor.view.dom.getBoundingClientRect()
      const anchorTop = caret?.top ?? editorRect.top
      const anchorBottom = caret?.bottom ?? editorRect.top

      el.style.maxHeight = '' // hauteur naturelle avant mesure
      const natural = el.scrollHeight
      const below = window.innerHeight - anchorBottom - 6 - VIEWPORT_MARGIN
      const above = anchorTop - 6 - VIEWPORT_MARGIN
      const flip = natural > below && above > below
      const maxHeight = Math.max(120, flip ? above : below)
      el.style.maxHeight = `${maxHeight}px`

      const height = Math.min(natural, maxHeight)
      el.style.top = `${flip ? anchorTop - 6 - height : anchorBottom + 6}px`
      el.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(editorRect.left, window.innerWidth - el.offsetWidth - VIEWPORT_MARGIN))}px`
    }

    return {
      onStart(props: PopupRenderProps<T>): void {
        el = document.createElement('div')
        el.className = 'slash-menu'
        document.body.appendChild(el)
        items = props.items
        apply = props.command
        selected = 0
        render()
        position(props)
        // Clic hors menu/éditeur : le plugin ne se ferme QUE sur transaction, donc sans ça le menu
        // resterait ouvert indéfiniment. `exitSuggestion` est l'API sûre (transaction méta seule).
        onOutsidePointerDown = (e: PointerEvent): void => {
          const t = e.target
          if (!(t instanceof Node) || el?.contains(t) || props.editor.view.dom.contains(t)) return
          exitSuggestion(props.editor.view, options.pluginKey)
        }
        document.addEventListener('pointerdown', onOutsidePointerDown, true)
      },
      onUpdate(props: PopupRenderProps<T>): void {
        items = props.items
        apply = props.command
        selected = Math.min(selected, Math.max(0, items.length - 1))
        render()
        position(props)
      },
      onKeyDown({ event }: { event: KeyboardEvent }): boolean {
        if (!el || !items.length) return false
        if (event.key === 'ArrowDown') {
          selected = (selected + 1) % items.length
          highlight(true)
          return true
        }
        if (event.key === 'ArrowUp') {
          selected = (selected - 1 + items.length) % items.length
          highlight(true)
          return true
        }
        if (event.key === 'Enter') {
          const item = items[selected]
          if (item) apply(item)
          return true
        }
        if (event.key === 'Escape') {
          el.style.display = 'none'
          return true
        }
        return false
      },
      onExit(): void {
        if (onOutsidePointerDown) document.removeEventListener('pointerdown', onOutsidePointerDown, true)
        onOutsidePointerDown = null
        el?.remove()
        el = null
        buttons = []
      },
    }
  }
}

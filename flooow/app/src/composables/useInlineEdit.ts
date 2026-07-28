// Édition inline générique (titres de pages/blocs, contenu de notes) — evolution-v2.md §3.
// Double-clic → `begin()` ; commit au blur/Entrée ; annulation à Échap. Ne touche pas le store
// tant qu'on n'a pas commité, et n'écrit que si la valeur a changé (pas d'entrée d'historique fantôme).
import { ref, nextTick, type Ref } from 'vue'

export interface UseInlineEditOptions {
  /** Lecture de la valeur courante (source de vérité = store). */
  get: () => string
  /** Écriture de la nouvelle valeur (action nommée du store). */
  set: (value: string) => void
  /** Sélectionner le texte à l'ouverture (défaut : true). */
  selectOnFocus?: boolean
}

export interface InlineEditController {
  editing: Ref<boolean>
  draft: Ref<string>
  /** À binder sur l'`<input>`/`<textarea>` (`ref="inputRef"`) pour l'autofocus. */
  inputRef: Ref<HTMLInputElement | HTMLTextAreaElement | null>
  begin: () => void
  commit: () => void
  cancel: () => void
  /** Handler `@keydown` : Entrée = commit, Échap = annule, autres = stopPropagation (garde le canvas). */
  onKeydown: (event: KeyboardEvent) => void
}

export function useInlineEdit(opts: UseInlineEditOptions): InlineEditController {
  const editing = ref(false)
  const draft = ref('')
  const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

  function begin(): void {
    if (editing.value) return
    draft.value = opts.get()
    editing.value = true
    void nextTick(() => {
      const el = inputRef.value
      if (!el) return
      el.focus()
      if (opts.selectOnFocus !== false && 'select' in el) el.select()
    })
  }

  function commit(): void {
    if (!editing.value) return
    editing.value = false
    const next = draft.value
    if (next !== opts.get()) opts.set(next)
  }

  function cancel(): void {
    editing.value = false
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    } else {
      // Empêche les raccourcis canvas (Suppr, etc.) de se déclencher pendant la saisie.
      event.stopPropagation()
    }
  }

  return { editing, draft, inputRef, begin, commit, cancel, onKeydown }
}

// Undo / redo par états inverses, cap 100, coalescence des gestes continus.
// Voir donnees-json.md §Undo/redo.
//
// NOTE d'implémentation (déviation documentée vs. RFC 6902) : le MVP stocke, pour chaque
// entrée, le snapshot AVANT et APRÈS (ProjectDoc complet, deep-cloné) plutôt qu'un patch
// JSON granulaire. Sémantique undo/redo identique, zéro dépendance nouvelle, coalescence
// triviale ; un vrai diff par patches pourra remplacer le stockage sans changer cette API.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProjectDoc } from '@flooow/core/model/types'
import { useProjectStore } from './project'

export const HISTORY_CAP = 100

export interface HistoryEntry {
  before: ProjectDoc
  after: ProjectDoc
  /** clé de coalescence : deux gestes consécutifs de même clé fusionnent en une entrée. */
  coalesce?: string
  label?: string
}

export const useHistoryStore = defineStore('history', () => {
  const undoStack = ref<HistoryEntry[]>([])
  const redoStack = ref<HistoryEntry[]>([])

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  const depth = computed(() => undoStack.value.length)

  /**
   * Enregistre une mutation (états avant/après). Appelé par le store project après chaque action.
   * Coalesce : si la dernière entrée porte la même clé, on étend son `after` au lieu de pousser.
   */
  function record(before: ProjectDoc, after: ProjectDoc, coalesce?: string, label?: string): void {
    const top = undoStack.value.at(-1)
    if (coalesce && top && top.coalesce === coalesce) {
      top.after = after
      top.label = label ?? top.label
    } else {
      undoStack.value.push({ before, after, coalesce, label })
      if (undoStack.value.length > HISTORY_CAP) undoStack.value.shift()
    }
    // Toute nouvelle mutation invalide la pile redo.
    redoStack.value = []
  }

  function undo(): void {
    const entry = undoStack.value.pop()
    if (!entry) return
    useProjectStore().applySnapshot(entry.before)
    redoStack.value.push(entry)
  }

  function redo(): void {
    const entry = redoStack.value.pop()
    if (!entry) return
    useProjectStore().applySnapshot(entry.after)
    undoStack.value.push(entry)
  }

  /** Vide l'historique (nouveau projet / ouverture de fichier). */
  function reset(): void {
    undoStack.value = []
    redoStack.value = []
  }

  return { undoStack, redoStack, canUndo, canRedo, depth, record, undo, redo, reset }
})

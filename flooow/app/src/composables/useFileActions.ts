// Actions fichier de haut niveau : relient io/file au store (load / markSaved) et transforment
// les erreurs de validation en message utilisateur. Partagé par le menu de l'application (AppMenu)
// et les raccourcis clavier (⌘O / ⌘S / ⌘⇧S) pour une seule implémentation.
import { computed, ref, watch, type ComputedRef } from 'vue'
import { useProjectStore } from '@/stores/project'
import { openProject, saveProject, saveProjectAs, ProjectFileError } from '@/io/file'
import { getCurrentServerFile, saveFile } from '@/io/api'
import { isCollabActive } from '@/collab/bridge'

export interface FileActions {
  newProject: () => void
  open: () => Promise<void>
  save: () => Promise<boolean>
  saveAs: () => Promise<boolean>
}

/**
 * Une écriture est-elle EN COURS ? Volontairement au niveau MODULE (et non dans le composable) :
 * l'écriture peut être déclenchée depuis n'importe où (⌘S, menu de l'application), alors que
 * l'indicateur qui l'affiche vit ailleurs (topbar). Un état local à un appelant serait invisible
 * des autres — c'est justement ce qui obligeait l'ancien StatusChip à porter à la fois le bouton
 * « Enregistrer » et la puce d'état.
 */
const saving = ref(false)

export type SaveState = 'saving' | 'dirty' | 'clean'

export interface SaveStatus {
  state: ComputedRef<SaveState>
  /** libellé court, en minuscule — destiné à être posé entre parenthèses après le nom du projet. */
  label: ComputedRef<string>
  /** heure du dernier passage à « propre » (HH:MM), vide tant qu'aucune sauvegarde n'a eu lieu. */
  savedAt: ComputedRef<string>
}

// Heure du dernier passage à « propre ». Le watch est installé au premier appel de useSaveStatus()
// et jamais démonté : l'indicateur doit survivre au démontage de son affichage (bascule de vue).
const lastSavedAt = ref<Date | null>(null)
let watchInstalled = false

/** État de sauvegarde partagé, pour l'indicateur de la topbar. */
export function useSaveStatus(): SaveStatus {
  const project = useProjectStore()
  if (!watchInstalled) {
    watchInstalled = true
    watch(
      () => project.dirty,
      (dirty) => {
        if (!dirty) lastSavedAt.value = new Date()
      },
      { immediate: true },
    )
  }
  const state = computed<SaveState>(() =>
    saving.value ? 'saving' : project.dirty ? 'dirty' : 'clean',
  )
  const savedAt = computed(() => {
    const d = lastSavedAt.value
    if (!d) return ''
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const label = computed(() => {
    if (state.value === 'saving') return 'enregistrement…'
    if (state.value === 'dirty') return 'modifications non enregistrées'
    return 'enregistré'
  })
  return { state, label, savedAt }
}

/** Enveloppe une écriture pour que `saving` reflète sa durée (et refuse les appels concurrents). */
async function runSaving(fn: () => Promise<boolean>): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  try {
    return await fn()
  } finally {
    saving.value = false
  }
}

export function useFileActions(): FileActions {
  const project = useProjectStore()

  /** Repart d'un projet vide (avertit si des modifications ne sont pas sauvegardées). */
  function newProject(): void {
    if (
      project.dirty &&
      !window.confirm('Des modifications ne sont pas sauvegardées. Créer un nouveau projet ?')
    ) {
      return
    }
    project.reset()
  }

  async function open(): Promise<void> {
    // Avertit avant d'écraser un projet non sauvegardé (le pipeline de validation, lui, est
    // dans io/file : taille → parse → migrate → zod → invariants).
    if (project.dirty && !window.confirm('Des modifications ne sont pas sauvegardées. Ouvrir un autre projet ?')) {
      return
    }
    try {
      const res = await openProject()
      if (res) project.load(res.doc)
    } catch (err) {
      window.alert(err instanceof ProjectFileError ? err.message : "Ouverture impossible : fichier illisible.")
    }
  }

  async function save(): Promise<boolean> {
    return runSaving(doSave)
  }

  async function doSave(): Promise<boolean> {
    // En mode collaboratif (jalon 6), la persistance est TEMPS RÉEL et automatique
    // (Hocuspocus côté serveur) : ⌘S n'a plus rien à faire.
    if (isCollabActive()) {
      project.markSaved()
      return true
    }
    // En mode serveur (un fichier est ouvert depuis l'API), ⌘S / menu Fichier
    // sauvegardent via l'API. Sinon fallback File System Access (export local).
    const current = getCurrentServerFile()
    if (current) {
      try {
        await saveFile(current.folder, current.file, project.serialize())
        project.markSaved()
        return true
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Sauvegarde impossible.')
        return false
      }
    }
    const ok = await saveProject(project.serialize())
    if (ok) project.markSaved()
    return ok
  }

  async function saveAs(): Promise<boolean> {
    return runSaving(async () => {
      const ok = await saveProjectAs(project.serialize())
      if (ok) project.markSaved()
      return ok
    })
  }

  return { newProject, open, save, saveAs }
}

// Annuaire des utilisateurs Pilot'In (rôles dev/marin), source des mentions « @ ».
// Alimenté par GET /api/users, lui-même adossé à bao — la MÊME source qu'AuthCrunch, dont `session`
// tire déjà l'identité du visiteur. Mentionner quelqu'un et le voir dans les bulles de présence
// désignent donc bien la même personne, mais les identifiants ne se recouvrent PAS : l'annuaire
// porte l'UUID bao, la session le sujet AuthCrunch. C'est l'email qui fait le pont (cf mentions.ts).
//
// Chargement paresseux et unique : l'annuaire ne bouge pas pendant une session d'édition, et on ne
// veut pas payer une requête au boot pour une fonctionnalité que l'utilisateur n'ouvrira peut-être
// jamais. `ensureLoaded` est appelé au montage de l'éditeur riche.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listUsers, type DirectoryUser } from '@/io/api'

export const useDirectoryStore = defineStore('directory', () => {
  const users = ref<DirectoryUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Empêche les chargements concurrents ET les rechargements en boucle après un échec. */
  let inflight: Promise<void> | null = null

  const byId = computed(() => new Map(users.value.map((u) => [u.id, u])))

  function ensureLoaded(): Promise<void> {
    if (users.value.length > 0) return Promise.resolve()
    if (inflight) return inflight
    loading.value = true
    error.value = null
    inflight = listUsers()
      .then((list) => {
        users.value = list
      })
      .catch((err: unknown) => {
        // Annuaire indisponible = les mentions ne proposent personne. Ce n'est pas fatal :
        // le reste de l'éditeur fonctionne, on n'escalade donc pas l'erreur.
        error.value = err instanceof Error ? err.message : 'Annuaire indisponible.'
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })
    return inflight
  }

  return { users, loading, error, byId, ensureLoaded }
})

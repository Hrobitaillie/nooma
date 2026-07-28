// Session utilisateur : identité + rôle vus depuis l'API serveur (headers AuthCrunch).
// Chargé au boot du hub. `client` = lecture seule ; `dev`/`marin` = écriture.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSession, type SessionInfo, type Role } from '@/io/api'

export type { Role }

export const useSessionStore = defineStore('session', () => {
  const identity = ref<SessionInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const role = computed<Role>(() => identity.value?.role ?? 'client')
  const canWrite = computed(() => identity.value?.canWrite ?? false)
  const authenticated = computed(() => identity.value?.authenticated ?? false)
  const displayName = computed(() => identity.value?.name ?? 'Utilisateur')

  async function fetchSession(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      identity.value = await getSession()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Session indisponible.'
    } finally {
      loading.value = false
    }
  }

  return { identity, loading, error, role, canWrite, authenticated, displayName, fetchSession }
})

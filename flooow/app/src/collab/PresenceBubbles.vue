<script setup lang="ts">
// Bulles des utilisateurs connectés (topbar). UNE bulle par connexion = par onglet :
// un même utilisateur ouvert dans 3 onglets apparaît 3 fois. Avatar si disponible
// (AuthCrunch, sinon Gravatar best-effort — `d=404`), repli initiales sur pastille
// colorée quand l'image échoue (pas de compte Gravatar) via le suivi `failed`.
// Le tooltip indique l'ACTIVITÉ du pair (vue courante, ou contenu en cours d'édition) ;
// un badge crayon signale une édition en cours — visible depuis toutes les vues (specs, API…).
import { reactive } from 'vue'
import type { Peer } from './bridge'

defineProps<{ peers: Peer[] }>()

// URLs d'avatar en échec (404 Gravatar…) → repli initiales pour ces bulles.
const failedAvatars = reactive(new Set<string>())

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (a + b).toUpperCase() || '?'
}

const VIEW_LABELS: Record<string, string> = {
  'canvas/structural': "sur l'arborescence",
  'canvas/functional': 'sur les fonctionnalités',
  specs: 'sur les specs',
  api: "sur le contrat d'API",
  catalog: 'sur le catalogue',
  notes: 'sur les notes',
}
function activity(p: Peer): string | null {
  if (p.editing) return `édite ${p.editing.label}`
  if (!p.view) return null
  const key = p.view.mode === 'canvas' ? `canvas/${p.view.layer}` : p.view.mode
  return VIEW_LABELS[key] ?? null
}
</script>

<template>
  <!-- Facepile : bulles réduites, chevauchées ; le survol fait ressortir la bulle. -->
  <div class="flex items-center -space-x-2.5">
    <div
      v-for="p in peers"
      :key="p.clientId"
      class="group relative h-7 w-7 shrink-0 rounded-full ring-2 ring-white transition-transform hover:z-10 hover:scale-110"
      :style="{ boxShadow: `0 0 0 2px ${p.user.color}` }"
    >
      <img
        v-if="p.user.avatar && !failedAvatars.has(p.user.avatar)"
        :src="p.user.avatar"
        :alt="p.user.name"
        referrerpolicy="no-referrer"
        class="h-full w-full rounded-full object-cover"
        @error="failedAvatars.add(p.user.avatar)"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center rounded-full text-[10px] font-semibold text-white"
        :style="{ backgroundColor: p.user.color }"
      >
        {{ initials(p.user.name) }}
      </div>

      <!-- Badge « édite du contenu » -->
      <span
        v-if="p.editing && !p.isSelf"
        class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[8px] shadow-sm ring-1 ring-slate-200"
        :style="{ color: p.user.color }"
        aria-hidden="true"
      >✎</span>

      <!-- Tooltip nom + activité -->
      <span
        class="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {{ p.user.name }}<span v-if="p.isSelf" class="text-slate-400"> (vous)</span>
        <span v-if="activity(p)" class="block font-normal text-slate-300">{{ activity(p) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Sidebar du document de spécifications : récap de tous les points d'attention (à compléter,
// à estimer, orphelines…), cliquables pour se rendre à l'élément. Tabbée : l'onglet « Commentaires »
// est un emplacement réservé (bulles rattachées au graphe, à venir). Émet `navigate` avec le point
// choisi ; le parent décide du scroll intra-document / focus canvas.
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { attentionGroups, type AttentionKind, type AttentionPoint } from '@flooow/core/domain/attention'

defineEmits<{
  (e: 'navigate', point: AttentionPoint): void
  (e: 'close'): void
}>()

const project = useProjectStore()
const tab = ref<'attention' | 'comments'>('attention')

const groups = computed(() => attentionGroups(project.doc))
const total = computed(() => groups.value.reduce((n, g) => n + g.points.length, 0))

const DOT: Record<AttentionKind, string> = {
  incomplete: 'bg-amber-400',
  unestimated: 'bg-emerald-400',
  orphanFeature: 'bg-violet-400',
  uncoveredPage: 'bg-violet-400',
  orphanPage: 'bg-rose-400',
}
</script>

<template>
  <aside class="attention-sidebar flex h-full w-72 flex-col border-l border-slate-200 bg-slate-50/80">
    <!-- Onglets -->
    <header class="flex items-center gap-1 border-b border-slate-200 px-2 py-2">
      <button
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        :class="tab === 'attention' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:bg-white/60'"
        @click="tab = 'attention'"
      >
        Points d'attention
        <span v-if="total" class="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{{ total }}</span>
      </button>
      <button
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        :class="tab === 'comments' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:bg-white/60'"
        @click="tab = 'comments'"
      >
        Commentaires
      </button>
      <button
        type="button"
        class="ml-auto rounded-md p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600"
        aria-label="Fermer la sidebar"
        title="Fermer"
        @click="$emit('close')"
      >
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" /></svg>
      </button>
    </header>

    <!-- Onglet Points d'attention -->
    <div v-if="tab === 'attention'" class="flex-1 overflow-y-auto p-3">
      <p v-if="!total" class="mt-4 text-center text-xs text-slate-400">
        Aucun point d'attention. Le document est complet.
      </p>
      <div v-for="g in groups" :key="g.kind" class="mb-4">
        <h3 class="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span class="h-2 w-2 rounded-full" :class="DOT[g.kind]" />
          {{ g.title }}
          <span class="text-slate-400">({{ g.points.length }})</span>
        </h3>
        <ul class="space-y-0.5">
          <li v-for="p in g.points" :key="p.kind + p.id">
            <button
              type="button"
              class="w-full rounded-md px-2 py-1 text-left text-xs text-slate-600 hover:bg-white"
              :title="p.detail"
              @click="$emit('navigate', p)"
            >
              <span class="block truncate font-medium">{{ p.label }}</span>
              <span class="block truncate text-[10px] text-slate-400">{{ p.detail }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Onglet Commentaires (réservé) -->
    <div v-else class="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div class="rounded-full bg-slate-100 p-3 text-slate-300">
        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5h16v11H9l-4 3v-3H4z" stroke-linejoin="round" /></svg>
      </div>
      <p class="mt-3 text-xs font-medium text-slate-500">Commentaires — bientôt</p>
      <p class="mt-1 text-[11px] text-slate-400">
        Des bulles rattachées aux éléments du graphe, visibles depuis chaque vue.
      </p>
    </div>
  </aside>
</template>

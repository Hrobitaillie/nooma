<script setup lang="ts">
// Section « réalisé par » / « réalise » — l'affordance du pont inter-couches (cadrage-par-
// fonctionnalite.md §2). Comme les deux couches ne sont jamais visibles ensemble sur le canvas,
// le lien realizedBy ne se trace pas par drag : on le pose ici, par recherche + chips.
//   direction='feature' : le nœud est une fonctionnalité → on choisit les PAGES/BLOCS qui la réalisent.
//   direction='target'  : le nœud est une page/bloc → on choisit les FONCTIONNALITÉS qu'il réalise.
import { ref, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isApiNote, isBlock, isFeature, isPage } from '@flooow/core/model/types'
import type { FlooowNode } from '@flooow/core/model/types'

const props = defineProps<{ nodeId: string; direction: 'feature' | 'target' }>()

const ui = useUiStore()
const project = useProjectStore()

const query = ref('')
const menuOpen = ref(false)

const title = computed(() => (props.direction === 'feature' ? 'Réalisé par' : 'Réalise'))
const addLabel = computed(() =>
  props.direction === 'feature' ? 'Ajouter une page ou un bloc…' : 'Ajouter une fonctionnalité…',
)

/** Libellé lisible d'un nœud (les notes API n'ont pas de champ `name`). */
function nodeName(n: FlooowNode): string {
  if (isApiNote(n)) return `${n.attrs.method} ${n.attrs.path}`.trim() || 'Note API'
  return n.attrs.name || 'Sans titre'
}

/** Contexte affiché sous un candidat/chip : le code pour une feature, la page pour un bloc. */
function subLabel(n: FlooowNode): string {
  if (isFeature(n)) return n.attrs.code
  if (isBlock(n)) {
    const page = n.parentId ? project.nodeById(n.parentId) : undefined
    return page ? nodeName(page) : ''
  }
  if (isPage(n)) return project.routeOf(n.id)
  return ''
}

function kindLabel(n: FlooowNode): string {
  if (isFeature(n)) return 'Fonctionnalité'
  if (isPage(n)) return 'Page'
  if (isBlock(n)) return 'Bloc'
  return ''
}

// Éléments déjà reliés (chips).
const linked = computed<FlooowNode[]>(() => {
  if (props.direction === 'feature') return project.realizersOfFeature(props.nodeId)
  return project.featuresOfTarget(props.nodeId)
})

// Candidats à relier : pages+blocs (direction feature) ou fonctionnalités (direction target),
// hors ceux déjà reliés, filtrés par la recherche.
const candidates = computed<FlooowNode[]>(() => {
  const linkedIds = new Set(linked.value.map((n) => n.id))
  const pool =
    props.direction === 'feature'
      ? project.allNodes.filter((n) => isPage(n) || isBlock(n))
      : project.allNodes.filter(isFeature)
  const q = query.value.trim().toLowerCase()
  return pool
    .filter((n) => !linkedIds.has(n.id))
    .filter(
      (n) =>
        !q ||
        nodeName(n).toLowerCase().includes(q) ||
        subLabel(n).toLowerCase().includes(q),
    )
    .slice(0, 20)
})

function link(target: FlooowNode): void {
  if (props.direction === 'feature') project.addRealizedBy(props.nodeId, target.id)
  else project.addRealizedBy(target.id, props.nodeId)
  query.value = ''
  menuOpen.value = false
}

function unlink(other: FlooowNode): void {
  if (props.direction === 'feature') project.removeRealizedBy(props.nodeId, other.id)
  else project.removeRealizedBy(other.id, props.nodeId)
}

/** Saute sur le canvas vers l'élément relié (bascule de couche + centrage). */
function reveal(n: FlooowNode): void {
  ui.setCanvasLayer(isFeature(n) ? 'functional' : 'structural')
  ui.focusNode(n.id)
}
</script>

<template>
  <section class="space-y-1.5">
    <h3 class="text-[12px] font-semibold text-slate-500">{{ title }}</h3>

    <!-- Chips des éléments reliés -->
    <ul v-if="linked.length" class="flex flex-wrap gap-1.5">
      <li
        v-for="n in linked"
        :key="n.id"
        class="group inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 py-0.5 pl-2 pr-1 text-[11px] text-slate-600 dark:border-white/15 dark:bg-zinc-800/70 dark:text-zinc-200"
      >
        <button
          type="button"
          class="max-w-[180px] truncate hover:text-cyan-700 dark:hover:text-cyan-300"
          :title="`Voir « ${nodeName(n)} » sur le canvas`"
          @click="reveal(n)"
        >
          <span v-if="subLabel(n)" class="font-mono text-[10px] text-slate-400">{{ subLabel(n) }} · </span>{{ nodeName(n) }}
        </button>
        <button
          type="button"
          class="rounded-full p-0.5 text-slate-400 hover:bg-black/5 hover:text-rose-600 dark:hover:bg-white/10"
          :aria-label="`Retirer ${nodeName(n)}`"
          @click="unlink(n)"
        >
          <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" /></svg>
        </button>
      </li>
    </ul>
    <p v-else class="text-[11px] text-slate-400">Aucun lien.</p>

    <!-- Recherche + menu de candidats -->
    <div class="relative">
      <input
        v-model="query"
        type="text"
        autocomplete="off"
        :placeholder="addLabel"
        class="w-full rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-xs text-slate-800 outline-hidden transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-800/70 dark:text-zinc-100"
        @focus="menuOpen = true"
        @input="menuOpen = true"
      />
      <div
        v-if="menuOpen && candidates.length"
        class="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-black/8 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
        role="listbox"
      >
        <button
          v-for="n in candidates"
          :key="n.id"
          type="button"
          role="option"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10"
          @mousedown.prevent="link(n)"
        >
          <span class="shrink-0 rounded-sm bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-zinc-400">{{ kindLabel(n) }}</span>
          <span class="truncate">{{ nodeName(n) }}</span>
          <span v-if="subLabel(n)" class="ml-auto truncate text-[10px] text-slate-400">{{ subLabel(n) }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Recherche rapide de nœuds (⌘K) — palette centrée. Filtre par nom, ↑/↓ pour naviguer,
// ⏎ pour centrer le canvas dessus et le sélectionner (ui.focusNode), Échap pour fermer.
import { ref, computed, watch, nextTick } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isApiNote, isBehaviorNote, isPage } from '@flooow/core/model/types'
import type { FlooowNode } from '@flooow/core/model/types'

const ui = useUiStore()
const project = useProjectStore()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const open = computed(() => ui.openPanels.search)

/** Libellé lisible d'un nœud (les notes API n'ont pas de champ `name`). */
function nodeName(n: FlooowNode): string {
  if (isApiNote(n)) return `${n.attrs.method} ${n.attrs.path}`.trim() || 'Note API'
  return n.attrs.name
}
function typeLabel(n: FlooowNode): string {
  if (isPage(n)) return 'Page'
  if (n.type === 'frame') return 'Bloc'
  return isBehaviorNote(n) ? 'Comportement' : 'API'
}
function subLabel(n: FlooowNode): string {
  if (isPage(n)) return project.routeOf(n.id)
  if (isApiNote(n)) {
    const svc = project.serviceById(n.attrs.serviceId)
    return svc?.name ?? ''
  }
  return ''
}

const results = computed<FlooowNode[]>(() => {
  const q = query.value.trim().toLowerCase()
  const all = project.allNodes
  const matches = q
    ? all.filter((n) => nodeName(n).toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
    : all
  return matches.slice(0, 20)
})

watch(open, async (isOpen) => {
  if (isOpen) {
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  }
})
watch(results, () => {
  activeIndex.value = 0
})

function close(): void {
  ui.togglePanel('search', false)
}
function choose(n: FlooowNode | undefined): void {
  if (!n) return
  ui.focusNode(n.id)
  close()
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(results.value.length - 1, activeIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    choose(results.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
</script>

<template>
  <div
    v-if="open"
    class="pointer-events-auto fixed inset-0 z-60 flex items-start justify-center bg-black/20 pt-[15vh]"
    @click.self="close"
  >
    <div
      class="w-full max-w-lg overflow-hidden rounded-xl border border-black/8 bg-white/95 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
      role="dialog"
      aria-modal="true"
      aria-label="Recherche de nœud"
    >
      <div class="flex items-center gap-2 border-b border-black/6 px-3 dark:border-white/10">
        <svg viewBox="0 0 20 20" class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="9" r="5" /><path d="M13 13l4 4" /></svg>
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="Rechercher une page, un bloc, une note…"
          class="w-full bg-transparent py-3 text-sm text-slate-800 outline-hidden placeholder:text-slate-400 dark:text-zinc-100"
          aria-label="Terme de recherche"
          @keydown="onKeydown"
        />
        <kbd class="rounded-sm border border-black/10 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-white/15">Échap</kbd>
      </div>
      <ul class="max-h-72 overflow-y-auto p-1" role="listbox">
        <li v-if="results.length === 0" class="px-3 py-6 text-center text-sm text-slate-400">Aucun résultat</li>
        <li
          v-for="(n, i) in results"
          :key="n.id"
          role="option"
          :aria-selected="i === activeIndex"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm"
          :class="i === activeIndex ? 'bg-cyan-600 text-white' : 'text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10'"
          @click="choose(n)"
          @mouseenter="activeIndex = i"
        >
          <span
            class="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
            :class="i === activeIndex ? 'bg-white/20 text-white' : 'bg-black/5 text-slate-500 dark:bg-white/10 dark:text-zinc-400'"
          >{{ typeLabel(n) }}</span>
          <span class="truncate">{{ nodeName(n) }}</span>
          <span v-if="subLabel(n)" class="ml-auto truncate text-xs opacity-70">{{ subLabel(n) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// Vue DÉTAIL d'UNE connexion API d'un bloc (v8, `BlockAttrs.apiRefs[i]`) — service, méthode, chemin.
//
// Héritier de l'ancien `BlockApiRefs.vue`, qui empilait toutes les connexions dans l'inspecteur.
// Le panneau de config du bloc étant devenu une LISTE (une ligne par élément) que l'on ouvre, ce
// composant n'édite plus qu'une entrée : la liste vit dans BlockConfigPanel, le détail ici. Découpage
// délibéré — un formulaire qui n'a qu'un sujet n'a pas à connaître son rang dans une collection, et
// l'index ne sert donc qu'à écrire au bon endroit.
//
// Reprend l'UX de la note API de PropertiesPanel : combobox de service avec création à la volée,
// méthode dans un select, chemin avec suggestions issues de `service.endpoints`. À la différence de
// la note, un `apiRef` n'a NI facette NI existence propre : il suit le bloc.
//
// Commite DIRECTEMENT dans le store (pas de buffer débouncé) : PropertiesPanel exclut volontairement
// `apiRefs` de son patch, sinon un flush en retard écraserait une sélection faite pendant la frappe.
import { computed, ref, onBeforeUnmount } from 'vue'
import { useProjectStore } from '@/stores/project'
import type { ApiRef, BlockNode } from '@flooow/core/model/types'

const props = defineProps<{ blockId: string; index: number }>()

const project = useProjectStore()

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const block = computed(() => project.nodeById(props.blockId) as BlockNode | undefined)
const refs = computed<ApiRef[]>(() => block.value?.attrs.apiRefs ?? [])
/** La connexion éditée. Peut être absente le temps d'un tick si elle vient d'être supprimée. */
const ref_ = computed<ApiRef | undefined>(() => refs.value[props.index])

/** Frappe en cours dans la combobox — vit hors du modèle tant qu'aucun service n'est choisi. */
const query = ref<string | null>(null)

// ── Liste déroulante des services ────────────────────────────────────────────
// Elle est TÉLÉPORTÉE dans <body> et positionnée en `fixed`, au lieu d'être posée en `absolute`
// sous l'input. Le corps du panneau est en `overflow-y-auto` (il doit défiler quand la config est
// longue), ce qui en fait un CONTEXTE DE ROGNAGE : un enfant `absolute` n'en sort pas, quelle que
// soit sa pile z — la liste se retrouvait coupée au bord du panneau. Aucun réglage de z-index n'y
// peut rien, il faut sortir la liste du conteneur qui rogne.
//
// Le prix est que la position ne suit plus toute seule : elle est mesurée à l'ouverture, puis
// re-mesurée sur `scroll` (en capture, donc y compris le défilement du panneau lui-même) et sur
// `resize`. Les écouteurs ne vivent que le temps de l'ouverture.
const menuOpen = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const menuRect = ref<{ x: number; y: number; w: number } | null>(null)

function measure(): void {
  const el = inputRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  menuRect.value = { x: r.left, y: r.bottom + 4, w: r.width }
}
function openMenu(): void {
  measure()
  if (menuOpen.value) return
  menuOpen.value = true
  window.addEventListener('scroll', measure, { capture: true, passive: true })
  window.addEventListener('resize', measure)
}
function closeMenu(): void {
  if (!menuOpen.value) return
  menuOpen.value = false
  window.removeEventListener('scroll', measure, { capture: true })
  window.removeEventListener('resize', measure)
}
onBeforeUnmount(closeMenu)

/** Texte affiché : la frappe en cours, sinon le nom du service référencé. */
const text = computed(
  () => query.value ?? project.serviceById(ref_.value?.serviceId ?? '')?.name ?? '',
)

const matches = computed(() => {
  const q = text.value.trim().toLowerCase()
  const all = project.services
  return q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all
})

/** Proposer la création seulement si la frappe ne correspond exactement à aucun service. */
const canCreate = computed(() => {
  const q = text.value.trim()
  if (!q) return false
  return !project.services.some((s) => s.name.trim().toLowerCase() === q.toLowerCase())
})

const endpoints = computed(() => project.serviceById(ref_.value?.serviceId ?? '')?.endpoints ?? [])

/** Écrit la liste entière : `updateAttrs` remplace `apiRefs`, il n'y a pas de patch partiel. */
function patch(p: Partial<ApiRef>): void {
  project.updateAttrs(props.blockId, {
    apiRefs: refs.value.map((r, j) => (j === props.index ? { ...r, ...p } : r)),
  })
}

function selectService(id: string): void {
  patch({ serviceId: id })
  query.value = null // la combobox retombe sur le nom du service choisi
  closeMenu()
}

function createService(): void {
  const name = text.value.trim()
  if (!name) return
  selectService(project.addService({ name }))
}

const inputClass =
  'w-full rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-sm text-slate-800 outline-hidden transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-800/70 dark:text-zinc-100'
const labelClass = 'mb-1 block text-[11px] font-medium text-slate-500 dark:text-zinc-400'
</script>

<template>
  <div v-if="ref_" class="space-y-3">
    <!-- Service : choix ou création à la volée -->
    <div>
      <label :class="labelClass" for="bar-service">Service</label>
      <input
        id="bar-service"
        ref="inputRef"
        :value="text"
        :class="inputClass"
        type="text"
        autocomplete="off"
        placeholder="Choisir ou créer un service…"
        @focus="openMenu"
        @blur="closeMenu"
        @input="query = ($event.target as HTMLInputElement).value; openMenu()"
      />
      <!-- Les options sont en `@mousedown.prevent` : le clic ne retire pas le focus de l'input, donc
           le `@blur` ci-dessus ferme sur un clic AILLEURS sans jamais avaler la sélection. -->
      <Teleport to="body">
        <div
          v-if="menuOpen && menuRect && (matches.length || canCreate)"
          class="fixed z-[60] max-h-48 overflow-y-auto rounded-lg border border-black/8 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
          :style="{ left: `${menuRect.x}px`, top: `${menuRect.y}px`, width: `${menuRect.w}px` }"
          role="listbox"
        >
          <button
            v-for="s in matches"
            :key="s.id"
            type="button"
            role="option"
            :aria-selected="s.id === ref_.serviceId"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
            :class="s.id === ref_.serviceId ? 'font-semibold text-cyan-700 dark:text-cyan-300' : 'text-slate-700 dark:text-zinc-200'"
            @mousedown.prevent="selectService(s.id)"
          >
            <span class="truncate">{{ s.name }}</span>
            <span class="ml-auto truncate text-[10px] text-slate-400">{{ s.baseUrl }}</span>
          </button>
          <button
            v-if="canCreate"
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
            @mousedown.prevent="createService"
          >
            + Créer le service « {{ text.trim() }} »
          </button>
        </div>
      </Teleport>
    </div>

    <!-- Endpoint : méthode + chemin -->
    <div>
      <label :class="labelClass">Endpoint</label>
      <div class="flex items-center gap-1">
        <select
          :value="ref_.method"
          :class="inputClass"
          class="w-24!"
          aria-label="Méthode"
          @change="patch({ method: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">—</option>
          <option v-for="m in HTTP_METHODS" :key="m" :value="m">{{ m }}</option>
        </select>
        <input
          :value="ref_.path"
          :class="inputClass"
          type="text"
          placeholder="/ressource/:id"
          aria-label="Chemin"
          @change="patch({ path: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <!-- Endpoints déjà connus du service : un clic remplit méthode + chemin d'un coup. -->
      <div v-if="endpoints.length" class="mt-1.5 flex flex-wrap gap-1">
        <button
          v-for="(ep, k) in endpoints"
          :key="k"
          type="button"
          class="rounded-sm border border-black/10 px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-cyan-500 hover:text-cyan-700 dark:border-white/15 dark:text-zinc-300 dark:hover:text-cyan-300"
          @click="patch({ method: ep.method, path: ep.path })"
        >
          {{ ep.method }} {{ ep.path }}
        </button>
      </div>
    </div>
  </div>
</template>

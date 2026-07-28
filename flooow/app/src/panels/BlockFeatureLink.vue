<script setup lang="ts">
// Vue DÉTAIL d'un lien « ce bloc réalise telle fonctionnalité » (arête `realizedBy`), dans le
// panneau de config du bloc. Deux emplois, un seul composant :
//   · `linkedId = null` → on AJOUTE : la vue n'est qu'un sélecteur ;
//   · `linkedId` posé   → on ouvre un lien existant : rappel de la cible, saut sur le canvas,
//     retrait, et le même sélecteur pour la REMPLACER.
//
// Le sélecteur est une LISTE PLEINE VUE, pas une liste déroulante posée sous un champ. Ce n'est pas
// qu'une question de goût : le corps du panneau défile (`overflow-y-auto`), donc tout ce qui se
// déploie en `absolute` s'y fait rogner — c'est exactement le bug qu'a fallu corriger sur la
// combobox de service (téléportée dans <body>). Une vue à part n'a pas ce problème du tout, et à
// cette largeur de panneau elle se lit mieux qu'un menu de 48 px de haut.
//
// Remplace la section « Réalise » (RealizationSection) qui vivait en bas du panneau : les liens de
// réalisation sont désormais des ÉLÉMENTS de la liste de config, au même titre que les connexions
// API, et s'ajoutent par le même bouton « + ».
import { ref, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isFeature } from '@flooow/core/model/types'
import type { FeatureNode } from '@flooow/core/model/types'

const props = defineProps<{ blockId: string; linkedId: string | null }>()
const emit = defineEmits<{ (e: 'done'): void }>()

const ui = useUiStore()
const project = useProjectStore()

const query = ref('')

const linked = computed<FeatureNode | null>(() => {
  if (!props.linkedId) return null
  const n = project.nodeById(props.linkedId)
  return n && isFeature(n) ? n : null
})

/** Fonctionnalités reliées à CE bloc — exclues des candidates (sauf celle qu'on est en train d'ouvrir). */
const linkedIds = computed(() => new Set(project.featuresOfTarget(props.blockId).map((n) => n.id)))

const candidates = computed<FeatureNode[]>(() => {
  const q = query.value.trim().toLowerCase()
  return project.allNodes
    .filter(isFeature)
    .filter((n) => !linkedIds.value.has(n.id))
    .filter((n) => !q || n.attrs.name.toLowerCase().includes(q) || n.attrs.code.toLowerCase().includes(q))
    .slice(0, 50)
})

/** Relie (et délie la précédente en cas de remplacement — sinon on en accumulerait une de plus). */
function choose(f: FeatureNode): void {
  if (props.linkedId) project.removeRealizedBy(props.linkedId, props.blockId)
  project.addRealizedBy(f.id, props.blockId)
  emit('done')
}

function unlink(): void {
  if (props.linkedId) project.removeRealizedBy(props.linkedId, props.blockId)
  emit('done')
}

/** Saute sur le canvas vers la fonctionnalité (bascule de couche + centrage). */
function reveal(): void {
  if (!linked.value) return
  ui.setCanvasLayer('functional')
  ui.focusNode(linked.value.id)
}
</script>

<template>
  <div class="space-y-3">
    <!-- Lien existant : ce qu'il vise, et les deux gestes qui le concernent -->
    <div v-if="linked" class="space-y-2 rounded-md border border-black/8 p-2 dark:border-white/10">
      <p class="text-sm font-medium text-slate-800 dark:text-zinc-100">{{ linked.attrs.name || 'Sans titre' }}</p>
      <p v-if="linked.attrs.code" class="font-mono text-[10px] text-slate-600 dark:text-zinc-400">{{ linked.attrs.code }}</p>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-sm px-1.5 py-0.5 text-[11px] text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
          @click="reveal"
        >
          Voir sur le canvas
        </button>
        <button
          type="button"
          class="ml-auto rounded-sm px-1.5 py-0.5 text-[11px] text-slate-600 hover:text-red-600 dark:text-zinc-400"
          @click="unlink"
        >
          Retirer
        </button>
      </div>
    </div>

    <div>
      <label class="mb-1 block text-[11px] font-medium text-slate-500 dark:text-zinc-400" for="bfl-q">
        {{ linked ? 'Remplacer par…' : 'Choisir une fonctionnalité' }}
      </label>
      <input
        id="bfl-q"
        v-model="query"
        type="text"
        autocomplete="off"
        placeholder="Rechercher…"
        class="w-full rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-sm text-slate-800 outline-hidden transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-800/70 dark:text-zinc-100"
      />
    </div>

    <p v-if="!candidates.length" class="text-xs text-slate-600 dark:text-zinc-400">Aucune fonctionnalité à relier.</p>
    <ul v-else class="space-y-1">
      <li v-for="f in candidates" :key="f.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-black/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-zinc-200 dark:hover:bg-white/10"
          @click="choose(f)"
        >
          <span class="min-w-0 truncate">{{ f.attrs.name || 'Sans titre' }}</span>
          <span v-if="f.attrs.code" class="ml-auto shrink-0 font-mono text-[10px] text-slate-600 dark:text-zinc-400">{{ f.attrs.code }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

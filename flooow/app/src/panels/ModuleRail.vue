<script setup lang="ts">
// Rail de modules de la VUE PAR MODULE (maquette `vue-par-module.html`) : la liste des modules du
// projet, et le module ouvert. Portage fidèle — nom, compteur de fonctionnalités, pastilles des lots
// présents, état actif ; le pied récapitule le module ouvert (charge, ouverture sur les autres).
//
// ARBITRAGE DE MONTAGE (le point qui a coûté le plus cher) : ce rail est un panneau DOCKÉ, frère de
// la scène — PAS un flottant de PanelLayer. PanelLayer est en `fixed inset-0` : tout ce qu'on y met
// se positionne par rapport à la FENÊTRE, si bien qu'un rail flottant à gauche passerait sous le
// ToolDock (`left-3`), qui ne saurait pas qu'il doit s'écarter. On reprend donc le montage déjà
// éprouvé du split d'édition à droite (`FeatureEditor` / `EDITOR_WIDTH` dans EditorView) : la zone
// canvas RÉTRÉCIT, et le calque de panneaux est décalé d'autant — dock, zoom et pastille de fichier
// gardent leur ancrage, simplement sur un canvas plus étroit.
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isFeature } from '@flooow/core/model/types'
import { parseEstimate, HOURS_PER_DAY } from '@flooow/core/domain/derive/estimate'
import { lotColor } from '@/theme/tokens'

const ui = useUiStore()
const project = useProjectStore()

interface RailModule {
  id: string
  name: string
  count: number
  /** Lots présents parmi les fonctionnalités du module, croissants (pastilles de l'entrée). */
  lots: number[]
}

/** Fonctionnalités d'un module (enfants directs — un module ne contient rien d'autre). */
function featuresOf(moduleId: string): string[] {
  return (project.childrenIndex.get(moduleId) ?? []).filter((cid) => {
    const c = project.nodeById(cid)
    return c != null && isFeature(c)
  })
}

const modules = computed<RailModule[]>(() =>
  project.modules.map((m) => {
    const feats = featuresOf(m.id)
    return {
      id: m.id,
      name: m.attrs.name || 'Module',
      count: feats.length,
      lots: [...new Set(feats.map((id) => project.lotOf(id)))].sort((a, b) => a - b),
    }
  }),
)

/**
 * Récapitulatif du module ouvert. Les deux chiffres répondent aux deux questions qu'on se pose une
 * fois dans un module : ce qu'il pèse, et à quel point il dépend du reste du projet — ce second
 * nombre est exactement le volume de satellites que la scène va dessiner autour de lui.
 */
const summary = computed(() => {
  const current = ui.funcModule
  if (!current) return null
  const ids = new Set(featuresOf(current))
  if (!ids.size) return { count: 0, days: 0, crossing: 0 }
  let hours = 0
  for (const id of ids) {
    const f = project.nodeById(id)
    if (f && isFeature(f)) hours += parseEstimate(f.attrs.estimate) ?? 0
  }
  const crossing = project.edges.filter(
    (e) => e.type === 'dependsOn' && ids.has(e.source) !== ids.has(e.target),
  ).length
  return { count: ids.size, days: hours / HOURS_PER_DAY, crossing }
})

const fmtDays = (d: number): string =>
  d.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
</script>

<template>
  <nav class="module-rail flex h-full flex-col overflow-hidden border-r border-gray-200 bg-white">
    <h2 class="px-4 pb-2 pt-3.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
      Modules
    </h2>

    <div class="flex flex-col gap-0.5 overflow-y-auto px-2 pb-3">
      <button
        v-for="m in modules"
        :key="m.id"
        type="button"
        class="tab"
        :class="{ on: m.id === ui.funcModule }"
        :aria-current="m.id === ui.funcModule"
        @click="ui.setFuncModule(m.id)"
      >
        <span class="flex shrink-0 gap-0.5">
          <i
            v-for="l in m.lots"
            :key="l"
            class="block h-1.5 w-1.5 rounded-[2px]"
            :style="{ background: lotColor(l) }"
            :title="`Lot ${l}`"
          />
        </span>
        <span class="min-w-0 flex-1 truncate text-left">{{ m.name }}</span>
        <span class="ct" title="Fonctionnalités">{{ m.count }}</span>
      </button>

      <p v-if="!modules.length" class="px-2 py-3 text-xs text-slate-500">
        Aucun module dans ce projet.
      </p>
    </div>

    <div
      v-if="summary"
      class="mt-auto border-t border-gray-200 px-4 py-3 text-[11.5px] leading-relaxed text-slate-500"
    >
      <b class="text-slate-800">{{ summary.count }}</b>
      fonctionnalité{{ summary.count > 1 ? 's' : '' }}
      <template v-if="summary.days > 0">
        · <b class="text-slate-800">{{ fmtDays(summary.days) }}</b> j estimés
      </template>
      <br />
      <b class="text-slate-800">{{ summary.crossing }}</b>
      lien{{ summary.crossing > 1 ? 's' : '' }} vers un autre module.
    </div>
  </nav>
</template>

<style scoped>
.tab {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  /* Liseré d'état à gauche, réservé DÈS l'état inactif : le colorer au clic sans réserver la place
     décalerait tout le libellé, et une liste qui tressaute à chaque changement d'onglet se lit mal. */
  border-left: 3px solid transparent;
  padding: 9px 10px;
  font-size: 13px;
  color: rgb(35 60 80);
  transition: background-color 120ms;
}
.tab:hover:not(.on) { background: rgb(244 247 250); }
.tab:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
/* Actif = l'accent de marque (`primary`), comme tout état actif de l'interface. */
.tab.on {
  background: var(--color-primary-300);
  border-left-color: var(--color-primary-700);
  font-weight: 700;
}
.ct {
  flex-shrink: 0;
  border: 1px solid var(--color-gray-200);
  border-radius: 999px;
  background: rgb(244 247 250);
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(98 125 152);
}
.tab.on .ct {
  border-color: transparent;
  background: #fff;
  color: var(--color-primary-700);
}
</style>

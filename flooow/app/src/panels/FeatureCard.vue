<script setup lang="ts">
// Fiche fonctionnalité « fusionnée » (cadrage-par-fonctionnalite.md), partagée par la vue Catalogue
// et le document Specs. Réunit Quoi / Implique / Dépend de / Débloque / Réalisé par / Endpoints /
// estimation. Navigation déléguée au parent (`navigate-feature` / `navigate-realizer`). Si `editable`,
// l'estimation devient un champ inline qui émet `update-estimate` (le parent commite). Ancre `id`
// (feat-<id>) pour le scroll intra-document.
import { ref, computed, watch } from 'vue'
import { lotColor } from '@/theme/tokens'
import type { CatalogFeature } from '@flooow/core/domain/derive/catalog'
import { isEmptyDoc } from '@flooow/core/model/richContent'
import RichContent from './RichContent.vue'

const props = withDefaults(defineProps<{ feature: CatalogFeature; editable?: boolean }>(), {
  editable: false,
})
defineEmits<{
  (e: 'navigate-feature', id: string): void
  (e: 'navigate-realizer', id: string): void
  (e: 'update-estimate', id: string, value: string): void
}>()

// Champs de projet renseignés (v7) : libellé et options viennent du document, plus du code.
const setFields = computed(() => props.feature.fields.filter((f) => f.value != null))
const anchorId = computed(() => `feat-${props.feature.id}`)
const accent = computed(() => lotColor(props.feature.lot))

// Buffer local d'estimation (édition inline).
const estimateBuf = ref(props.feature.estimate)
watch(
  () => props.feature.estimate,
  (v) => {
    estimateBuf.value = v
  },
)
</script>

<template>
  <article
    :id="anchorId"
    class="feature-card scroll-mt-28 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
  >
    <div class="border-l-[3px] pl-5 pr-5 py-4" :style="{ borderColor: accent }">
      <!-- En-tête : code (eyebrow) + titre + méta -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span v-if="feature.code" class="font-mono2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
          {{ feature.code }}
        </span>
        <span
          class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
          :style="{ backgroundColor: accent }"
        >Lot {{ feature.lot }}</span>
        <span
          v-for="f in setFields"
          :key="f.fieldId"
          class="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
          :title="f.label"
        >
          {{ f.value }}
        </span>
        <span
          v-if="feature.orphan"
          class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 ring-1 ring-amber-200"
          title="Aucune page/bloc ne réalise cette fonctionnalité"
        >non réalisée</span>

        <!-- Estimation : éditable inline (Specs) ou statique (Catalogue) -->
        <span class="ml-auto flex items-center gap-1.5">
          <span class="text-[10px] font-medium uppercase tracking-wide text-slate-400">Est.</span>
          <input
            v-if="editable"
            :value="estimateBuf"
            class="w-24 rounded-md border border-transparent bg-slate-50 px-2 py-0.5 text-right font-mono2 text-xs text-slate-700 outline-hidden transition hover:border-slate-200 focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-300"
            :class="{ 'text-amber-600': !estimateBuf.trim() }"
            placeholder="à estimer"
            aria-label="Estimation"
            @input="estimateBuf = ($event.target as HTMLInputElement).value"
            @change="$emit('update-estimate', feature.id, estimateBuf)"
            @blur="$emit('update-estimate', feature.id, estimateBuf)"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <span
            v-else
            class="font-mono2 text-xs"
            :class="feature.estimate.trim() ? 'text-slate-600' : 'text-amber-500'"
          >{{ feature.estimate.trim() || 'à estimer' }}</span>
        </span>
      </div>

      <!-- Titre -->
      <h4 class="mt-1.5">
        <button
          type="button"
          class="text-left font-display text-lg font-medium leading-snug text-slate-900 decoration-slate-300 decoration-1 underline-offset-4 hover:underline"
          @click="$emit('navigate-feature', feature.id)"
        >{{ feature.name || 'Sans titre' }}</button>
      </h4>

      <!-- Contenu libre (document riche) -->
      <RichContent v-if="!isEmptyDoc(feature.content)" :doc="feature.content" class="mt-3 text-sm leading-relaxed text-slate-700" />

      <dl class="mt-3 space-y-3 text-sm">
        <div v-if="feature.dependsOn.length || feature.unlocks.length" class="flex flex-wrap gap-x-8 gap-y-1.5">
          <div v-if="feature.dependsOn.length">
            <dt class="inline text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Dépend de&nbsp;</dt>
            <dd class="inline">
              <button
                v-for="(d, i) in feature.dependsOn"
                :key="d.id"
                type="button"
                class="font-medium text-slate-700 decoration-slate-300 underline-offset-2 hover:underline"
                @click="$emit('navigate-feature', d.id)"
              >{{ d.code || d.name }}<span v-if="i < feature.dependsOn.length - 1" class="font-normal text-slate-400">, </span></button>
            </dd>
          </div>
          <div v-if="feature.unlocks.length">
            <dt class="inline text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Débloque&nbsp;</dt>
            <dd class="inline">
              <button
                v-for="(d, i) in feature.unlocks"
                :key="d.id"
                type="button"
                class="font-medium text-slate-700 decoration-slate-300 underline-offset-2 hover:underline"
                @click="$emit('navigate-feature', d.id)"
              >{{ d.code || d.name }}<span v-if="i < feature.unlocks.length - 1" class="font-normal text-slate-400">, </span></button>
            </dd>
          </div>
        </div>

        <div>
          <dt class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Réalisé par</dt>
          <dd v-if="feature.realizers.length" class="mt-1 flex flex-wrap gap-1.5">
            <button
              v-for="r in feature.realizers"
              :key="r.id"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50/60 px-2 py-1 text-[11px] font-medium text-cyan-800 transition hover:bg-cyan-100"
              :title="`Voir « ${r.name} » sur le canvas`"
              @click="$emit('navigate-realizer', r.id)"
            >
              <span class="text-[9px] font-semibold uppercase tracking-wide text-cyan-400">{{ r.kind === 'page' ? 'page' : 'bloc' }}</span>
              {{ r.name || 'Sans nom' }}
            </button>
          </dd>
          <dd v-else class="mt-0.5 text-xs italic text-amber-600">
            Aucune page/bloc ne réalise cette fonctionnalité.
          </dd>
        </div>

        <div v-if="feature.endpoints.length">
          <dt class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Endpoints API</dt>
          <dd class="mt-1 flex flex-wrap gap-1.5">
            <span
              v-for="(e, i) in feature.endpoints"
              :key="i"
              class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono2 text-[11px] text-slate-700"
              :title="e.serviceName"
            >
              <span class="font-semibold text-slate-500">{{ e.method }}</span>{{ e.path }}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  </article>
</template>

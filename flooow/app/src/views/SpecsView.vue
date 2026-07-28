<script setup lang="ts">
// LE document de spécifications — le livrable final, présenté comme un dossier technique éditorial.
// Structure : couverture → Cadre (description + contraintes éditables, services) → Sommaire (rail
// sticky) → 01 Fonctionnalités (par module : table récap + fiches) → 02 Arborescence (pages → blocs →
// notes/API). Chaque NOM d'élément (fonctionnalité, page, bloc, module) est un lien vers le canvas
// (couche adaptée, sélection + zoom ajusté). Estimation éditable inline. Sidebar « points d'attention ».
// Édition contexte/contraintes/estimations ici ; le reste sur le canvas. Textes interpolés ; seuls
// les documents riches (contenu de bloc, de fonctionnalité) passent par RichContent, dont le v-html
// est borné par un schéma Tiptap contrôlé (composables/richText.ts).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { currentCollab, type Peer } from '@/collab/bridge'
import type { SpecsFilter } from '@flooow/core/domain/derive/specs'
import type { Facet } from '@flooow/core/model/types'
import type { AttentionPoint } from '@flooow/core/domain/attention'
import { exportSpecsMarkdown, projectSlug } from '@/io/export/markdown'
import { exportSpecsPdf } from '@/io/export/pdf'
import { saveTextAs } from '@/io/file'
import { lotColor } from '@/theme/tokens'
import SeamlessField from '@/panels/SeamlessField.vue'
import FeatureCard from '@/panels/FeatureCard.vue'
import RichContent from '@/panels/RichContent.vue'
import AttentionSidebar from '@/panels/AttentionSidebar.vue'
import { isEmptyDoc } from '@flooow/core/model/richContent'

const project = useProjectStore()
const ui = useUiStore()

// ── Filtre facette ──────────────────────────────────────────────────────────────
// Le contrôle vit ICI, dans la barre du document, et non plus dans un panneau flottant du canvas :
// la facette ne filtre plus QUE ce document (comportements et appels API des fiches de page), donc
// c'est le seul endroit où l'on voit ce qu'on règle. `ui.facetFilter` reste malgré tout dans le
// store d'interface — cette vue est démontée à chaque passage sur le canvas, un `ref` local
// oublierait le filtre à chaque aller-retour.
// Le filtre LOT (`ui.lotFilter`), lui, se règle toujours depuis les « Réglages d'affichage » du
// canvas, parce qu'il grise aussi les cartes là-bas : son effet est visible des deux côtés, ce qui
// n'était plus le cas de la facette.
const facetOptions: { id: Facet | null; label: string }[] = [
  { id: null, label: 'Toutes' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'fullstack', label: 'Fullstack' },
]

const filter = computed<SpecsFilter>(() => {
  const f: SpecsFilter = {}
  if (ui.facetFilter) f.facet = ui.facetFilter
  if (ui.lotFilter != null) f.lot = ui.lotFilter
  return f
})

const specs = computed(() => project.specs(filter.value))
const catalog = computed(() => project.catalog)
const incompleteSet = computed(() => new Set(specs.value.warnings.incomplete))
const orphanSet = computed(() => new Set(specs.value.warnings.orphans))
const uncoveredSet = computed(() => new Set(specs.value.warnings.uncoveredPages))

const featuresCount = computed(() =>
  catalog.value.groups.reduce((n, g) => n + g.features.length, 0),
)
const modulesCount = computed(() => catalog.value.groups.filter((g) => g.moduleId).length)
const warningCount = computed(
  () =>
    specs.value.warnings.incomplete.length +
    specs.value.warnings.orphans.length +
    specs.value.warnings.orphanFeatures.length +
    specs.value.warnings.uncoveredPages.length,
)

function isIncomplete(id: string): boolean {
  return incompleteSet.value.has(id)
}


// ── Navigation ────────────────────────────────────────────────────────────────
/** Scroll intra-document (sommaire, sidebar) avec flash de la cible. */
function scrollToAnchor(anchorId: string): void {
  const el = document.getElementById(anchorId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.classList.add('anchor-flash')
  window.setTimeout(() => el.classList.remove('anchor-flash'), 1200)
}
/** Nom d'élément structurel (page/bloc/note/service) → canvas centré + sélectionné. */
function goCanvas(id: string): void {
  ui.setCanvasLayer('structural')
  ui.focusNode(id)
}
/** Nom de fonctionnalité/module → canvas couche fonctionnelle centré + sélectionné. */
function goCanvasFn(id: string): void {
  ui.setCanvasLayer('functional')
  ui.focusNode(id)
}

// ── Présence collab : « qui édite quoi » ─────────────────────────────────────────
// Publie l'édition locale des champs du cadre (focus/blur) et surligne les contenus
// en cours d'édition par un pair (anneau + badge de sa couleur).
const collab = currentCollab()
const collabPeers = collab?.peers ?? ref<Peer[]>([])
function editStart(id: string, label: string): void {
  collab?.setEditing({ id, label })
}
function editEnd(): void {
  collab?.setEditing(null)
}
// Quitter la vue avec un champ focus : le focusout ne repasse pas par Vue → on nettoie.
onBeforeUnmount(editEnd)

const peerEditing = computed(() => {
  const map = new Map<string, { color: string; name: string }>()
  for (const p of collabPeers.value) {
    if (p.isSelf || !p.editing) continue
    map.set(p.editing.id, { color: p.user.color, name: p.user.name })
  }
  return map
})
function peerRing(id: string): Record<string, string> {
  const e = peerEditing.value.get(id)
  if (!e) return {}
  return { outline: `2px solid ${e.color}`, outlineOffset: '3px', borderRadius: '6px' }
}

// ── Sidebar points d'attention ──────────────────────────────────────────────────
const sidebarOpen = ref(true)
function onAttentionNavigate(point: AttentionPoint): void {
  scrollToAnchor(point.anchorId)
}

// ── Édition en ligne : contexte + contraintes ───────────────────────────────────
const contextBuf = ref(project.site.attrs.context)
const constraintsBuf = ref(project.site.attrs.constraints.join('\n'))
let editingSite = false
function reloadSite(): void {
  if (editingSite) return
  contextBuf.value = project.site.attrs.context
  constraintsBuf.value = project.site.attrs.constraints.join('\n')
}
watch(() => project.graphVersion, reloadSite)
function onContextInput(v: string): void {
  editingSite = true
  contextBuf.value = v
}
function saveContext(): void {
  editingSite = false
  project.updateSite({ context: contextBuf.value })
}
function onConstraintsInput(v: string): void {
  editingSite = true
  constraintsBuf.value = v
}
function saveConstraints(): void {
  editingSite = false
  const list = constraintsBuf.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  project.updateSite({ constraints: list })
}

// ── Estimation inline ───────────────────────────────────────────────────────────
function setFeatureEstimate(id: string, value: string): void {
  project.updateAttrs(id, { estimate: value })
}
function setBehaviorHours(id: string, raw: string): void {
  const t = raw.trim()
  const n = t === '' ? null : Number(t)
  project.updateAttrs(id, { hours: n != null && Number.isFinite(n) ? n : null })
}

// ── Exports ──────────────────────────────────────────────────────────────────
async function onExportMarkdown(): Promise<void> {
  await saveTextAs(`${projectSlug(project.doc)}-specs.md`, exportSpecsMarkdown(project.doc), 'text/markdown')
}
async function onExportPdf(): Promise<void> {
  await exportSpecsPdf(project.doc, () => ui.setMode('specs'))
}
</script>

<template>
  <div class="specs-view flex h-full bg-paper font-sans2 text-slate-700">
    <!-- Colonne document -->
    <div class="doc-scroll flex-1 overflow-auto">
      <!-- Barre d'outils (non imprimée) -->
      <header
        class="no-print sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200/70 bg-paper/85 px-8 py-3 backdrop-blur-sm"
      >
        <span class="font-mono2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Spécifications</span>

        <!-- Filtre facette — segmenté plutôt que menu déroulant : quatre choix exclusifs, dont on
             veut voir en permanence LEQUEL est actif (un document filtré qui ne le dit pas se lit
             comme un document incomplet). -->
        <div class="flex items-center gap-2" role="group" aria-label="Filtrer par facette">
          <span class="font-mono2 text-[10px] uppercase tracking-[0.1em] text-slate-300">Facette</span>
          <div class="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white/60 p-0.5">
            <button
              v-for="f in facetOptions"
              :key="f.label"
              type="button"
              class="facet-tab"
              :class="{ 'facet-tab-on': ui.facetFilter === f.id }"
              :aria-pressed="ui.facetFilter === f.id"
              @click="ui.setFacetFilter(f.id)"
            >{{ f.label }}</button>
          </div>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <button
            v-if="warningCount"
            type="button"
            class="rounded-full bg-amber-100/80 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-200/70"
            title="Ouvrir les points d'attention"
            @click="sidebarOpen = true"
          >{{ warningCount }} à traiter</button>
          <button type="button" class="rounded-lg border border-slate-300/80 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white" @click="onExportMarkdown">Markdown</button>
          <button type="button" class="rounded-lg border border-slate-300/80 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white" @click="onExportPdf">PDF</button>
          <button
            type="button"
            class="rounded-lg border border-slate-300/80 p-2 text-slate-500 transition hover:bg-white"
            :class="{ 'bg-white text-slate-800 ring-1 ring-slate-300': sidebarOpen }"
            :aria-pressed="sidebarOpen"
            title="Afficher/masquer les points d'attention"
            @click="sidebarOpen = !sidebarOpen"
          >
            <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h14v12H3z" /><path d="M13 4v12" /></svg>
          </button>
        </div>
      </header>

      <div class="mx-auto grid max-w-6xl grid-cols-1 gap-x-12 px-8 py-12 lg:grid-cols-[210px_minmax(0,1fr)]">
        <!-- Rail sommaire sticky -->
        <nav class="no-print hidden lg:block">
          <div class="sticky top-24">
            <p class="mb-3 font-mono2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Sommaire</p>
            <ul class="space-y-1 border-l border-slate-200 text-sm">
              <li>
                <button type="button" class="toc-link" @click="scrollToAnchor('sec-cadre')">Cadre du projet</button>
              </li>
              <li v-if="catalog.groups.length">
                <button type="button" class="toc-link font-medium text-slate-700" @click="scrollToAnchor('sec-fonctionnalites')">Fonctionnalités</button>
                <ul class="mb-1 mt-0.5 space-y-0.5">
                  <li v-for="g in catalog.groups" :key="g.moduleId ?? 'root'">
                    <button type="button" class="toc-sub" @click="scrollToAnchor(`mod-${g.moduleId ?? 'root'}`)">{{ g.moduleName }}</button>
                  </li>
                </ul>
              </li>
              <li v-if="specs.pages.length">
                <button type="button" class="toc-link font-medium text-slate-700" @click="scrollToAnchor('sec-arborescence')">Arborescence</button>
                <ul class="mb-1 mt-0.5 space-y-0.5">
                  <li v-for="p in specs.pages" :key="p.page.id">
                    <button type="button" class="toc-sub" @click="scrollToAnchor(`el-${p.page.id}`)">{{ p.page.attrs.name || 'Page' }}</button>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </nav>

        <!-- Corps du document -->
        <article class="min-w-0">
          <!-- Couverture -->
          <header class="mb-14">
            <p class="font-mono2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">Document de spécifications</p>
            <h1 class="mt-3 font-display text-5xl font-bold leading-[1.05] tracking-tight text-slate-900">
              {{ project.meta.name || 'Projet' }}
            </h1>
            <div class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 pt-4 font-mono2 text-[11px] uppercase tracking-wide text-slate-400">
              <span>Maj {{ project.meta.updatedAt }}</span>
              <span v-if="modulesCount" aria-hidden="true">·</span>
              <span v-if="modulesCount">{{ modulesCount }} module{{ modulesCount > 1 ? 's' : '' }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ featuresCount }} fonctionnalité{{ featuresCount > 1 ? 's' : '' }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ specs.pages.length }} page{{ specs.pages.length > 1 ? 's' : '' }}</span>
              <span v-if="warningCount" aria-hidden="true">·</span>
              <span v-if="warningCount" class="text-amber-500">{{ warningCount }} à traiter</span>
            </div>
          </header>

          <!-- ══ Cadre du projet ══ -->
          <section id="sec-cadre" class="scroll-mt-24">
            <h2 class="section-eyebrow">Cadre du projet</h2>

            <div class="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Description</p>
              <SeamlessField
                class="mt-1 block leading-relaxed"
                :model-value="contextBuf"
                multiline
                placeholder="Contexte, objectifs, cadre général du projet…"
                :style="peerRing('site:context')"
                @focusin="editStart('site:context', 'la description du projet')"
                @focusout="editEnd()"
                @update:model-value="onContextInput"
                @commit="saveContext"
              />

              <div class="mt-5 border-t border-slate-100 pt-4">
                <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Contraintes globales <span class="no-print font-normal normal-case tracking-normal text-slate-300">· une par ligne</span></p>
                <SeamlessField
                  class="mt-1 block leading-relaxed"
                  :model-value="constraintsBuf"
                  multiline
                  placeholder="SSO obligatoire&#10;RGPD&#10;Accessibilité RGAA AA"
                  :style="peerRing('site:constraints')"
                  @focusin="editStart('site:constraints', 'les contraintes globales')"
                  @focusout="editEnd()"
                  @update:model-value="onConstraintsInput"
                  @commit="saveConstraints"
                />
              </div>

              <div v-if="specs.transversal.services.length" class="mt-5 border-t border-slate-100 pt-4">
                <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Services externes</p>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="s in specs.transversal.services" :key="s.id" class="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <button type="button" class="font-medium text-slate-800 decoration-slate-300 underline-offset-2 hover:underline" @click="goCanvas(s.id)">{{ s.name || 'Service' }}</button>
                    <span v-if="s.baseUrl" class="font-mono2 text-[11px] text-slate-400">{{ s.baseUrl }}</span>
                    <span class="text-xs text-slate-400">· auth {{ s.auth || '—' }}</span>
                    <span
                      class="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      :class="s.risk === 'high' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' : 'bg-slate-100 text-slate-500'"
                    >risque {{ s.risk }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <!-- ══ 01 · Fonctionnalités ══ -->
          <section v-if="catalog.groups.length" id="sec-fonctionnalites" class="mt-16 scroll-mt-24">
            <div class="flex items-end gap-4 border-b border-slate-200 pb-4">
              <span class="font-display text-6xl font-bold leading-none text-violet-200">01</span>
              <div class="pb-1">
                <p class="font-mono2 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-400">Ce qu'on construit</p>
                <h2 class="font-display text-2xl font-bold tracking-tight text-slate-900">Fonctionnalités</h2>
              </div>
            </div>

            <div v-for="group in catalog.groups" :id="`mod-${group.moduleId ?? 'root'}`" :key="group.moduleId ?? 'root'" class="mt-10 scroll-mt-24">
              <div class="flex items-baseline gap-3">
                <h3 class="font-display text-xl font-medium text-slate-900">
                  <button v-if="group.moduleId" type="button" class="decoration-slate-300 underline-offset-4 hover:underline" @click="goCanvasFn(group.moduleId)">{{ group.moduleName }}</button>
                  <span v-else>{{ group.moduleName }}</span>
                </h3>
                <span class="font-mono2 text-[11px] text-slate-300">{{ group.features.length }} fonctionnalité{{ group.features.length > 1 ? 's' : '' }}</span>
              </div>
              <p v-if="group.module?.attrs.description" class="mt-1 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-500">{{ group.module.attrs.description }}</p>

              <!-- Table récapitulative -->
              <div class="mt-4 overflow-hidden rounded-xl border border-slate-200/80">
                <table class="w-full border-collapse text-sm">
                  <thead>
                    <tr class="bg-slate-50/70 text-left font-mono2 text-[10px] uppercase tracking-wide text-slate-400">
                      <th class="px-4 py-2 font-medium">ID</th>
                      <th class="px-4 py-2 font-medium">Fonctionnalité</th>
                      <th class="px-4 py-2 font-medium">Lot</th>
                      <!-- Une colonne par champ de projet (v7) : l'en-tête EST le libellé renommable. -->
                      <th v-for="fld in catalog.fields" :key="fld.id" class="px-4 py-2 font-medium">
                        {{ fld.label }}
                      </th>
                      <th class="px-4 py-2 font-medium">Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="f in group.features" :key="f.id" class="border-t border-slate-100 align-middle transition-colors hover:bg-slate-50/50">
                      <td class="px-4 py-2 font-mono2 text-[11px] text-slate-400">{{ f.code || '—' }}</td>
                      <td class="px-4 py-2">
                        <button type="button" class="text-left font-medium text-slate-800 decoration-slate-300 underline-offset-2 hover:underline" @click="goCanvasFn(f.id)">{{ f.name || 'Sans titre' }}</button>
                        <span v-if="f.orphan" class="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-600 ring-1 ring-amber-200">orpheline</span>
                      </td>
                      <td class="px-4 py-2">
                        <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" :style="{ backgroundColor: lotColor(f.lot) }">L{{ f.lot }}</span>
                      </td>
                      <td v-for="fv in f.fields" :key="fv.fieldId" class="px-4 py-2 text-slate-500">
                        {{ fv.value ?? '—' }}
                      </td>
                      <td class="px-4 py-2">
                        <input
                          :value="f.estimate"
                          class="w-20 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-mono2 text-xs text-slate-600 outline-hidden transition hover:border-slate-200 focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-300"
                          :class="{ 'text-amber-500': !f.estimate.trim() }"
                          placeholder="à estimer"
                          aria-label="Estimation"
                          @change="setFeatureEstimate(f.id, ($event.target as HTMLInputElement).value)"
                          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Fiches détaillées (éditables : estimation inline) -->
              <div class="mt-6 space-y-5">
                <div
                  v-for="f in group.features"
                  :key="f.id + '-card'"
                  class="relative"
                  :style="peerRing(f.id)"
                >
                  <span
                    v-if="peerEditing.get(f.id)"
                    class="absolute -top-2.5 right-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm"
                    :style="{ backgroundColor: peerEditing.get(f.id)!.color }"
                  >✎ {{ peerEditing.get(f.id)!.name }}</span>
                  <FeatureCard
                    :feature="f"
                    editable
                    @navigate-feature="goCanvasFn"
                    @navigate-realizer="goCanvas"
                    @update-estimate="setFeatureEstimate"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- ══ 02 · Arborescence ══ -->
          <section id="sec-arborescence" class="mt-16 scroll-mt-24">
            <div class="flex items-end gap-4 border-b border-slate-200 pb-4">
              <span class="font-display text-6xl font-bold leading-none text-cyan-200">02</span>
              <div class="pb-1">
                <p class="font-mono2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-500">Où ça apparaît</p>
                <h2 class="font-display text-2xl font-bold tracking-tight text-slate-900">Arborescence</h2>
              </div>
            </div>

            <!-- Fiches par page -->
            <section
              v-for="page in specs.pages"
              :id="`el-${page.page.id}`"
              :key="page.page.id"
              class="page-block mt-8 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <div class="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <h3 class="flex flex-wrap items-center gap-2">
                  <button type="button" class="font-display text-xl font-medium text-slate-900 decoration-slate-300 underline-offset-4 hover:underline" @click="goCanvas(page.page.id)">{{ page.page.attrs.name || 'Page sans nom' }}</button>
                  <span class="rounded-md bg-white px-2 py-0.5 font-mono2 text-[11px] text-slate-500 ring-1 ring-slate-200">{{ project.routeOf(page.page.id) }}</span>
                  <button v-if="orphanSet.has(page.page.id)" type="button" class="badge-warn ring-1 ring-rose-200 bg-rose-50 text-rose-600" title="Non reliée à la navigation — voir sur le canvas" @click="goCanvas(page.page.id)">orpheline</button>
                  <button v-if="isIncomplete(page.page.id)" type="button" class="badge-warn ring-1 ring-amber-200 bg-amber-50 text-amber-600" title="À compléter" @click="goCanvas(page.page.id)">incomplet</button>
                  <button v-if="uncoveredSet.has(page.page.id)" type="button" class="badge-warn ring-1 ring-violet-200 bg-violet-50 text-violet-600" title="Ne réalise aucune fonctionnalité" @click="goCanvas(page.page.id)">sans fonctionnalité</button>
                </h3>
                <p v-if="page.page.attrs.roles && page.page.attrs.roles.length" class="mt-1 font-mono2 text-[11px] uppercase tracking-wide text-slate-400">Accès : {{ page.page.attrs.roles.join(', ') }}</p>
                <p v-if="page.page.attrs.description" class="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{{ page.page.attrs.description }}</p>
                <div v-if="page.features.length" class="mt-3 flex flex-wrap items-center gap-1.5">
                  <span class="font-mono2 text-[10px] uppercase tracking-wide text-slate-400">Réalise</span>
                  <button v-for="f in page.features" :key="f.id" type="button" class="feat-chip" :title="`Voir « ${f.name} » sur le canvas`" @click="goCanvasFn(f.id)">
                    <span v-if="f.code" class="font-mono2 text-[9px] text-violet-400">{{ f.code }}</span>{{ f.name || 'Sans titre' }}
                  </button>
                </div>
              </div>

              <div class="px-6 py-4">
                <!-- Blocs -->
                <div v-for="b in page.blocks" :id="`el-${b.block.id}`" :key="b.block.id" class="scroll-mt-24 border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0">
                  <h4 class="flex flex-wrap items-center gap-2">
                    <button type="button" class="font-medium text-slate-800 decoration-slate-300 underline-offset-2 hover:underline" @click="goCanvas(b.block.id)">{{ b.block.attrs.name || 'Bloc sans nom' }}</button>
                    <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono2 text-[9px] uppercase tracking-wide text-slate-500">{{ b.blockType }}</span>
                    <button v-if="isIncomplete(b.block.id)" type="button" class="badge-warn ring-1 ring-amber-200 bg-amber-50 text-amber-600" title="À compléter" @click="goCanvas(b.block.id)">incomplet</button>
                  </h4>
                  <RichContent v-if="!isEmptyDoc(b.block.attrs.content)" :doc="b.block.attrs.content" class="mt-1 text-sm text-slate-600" />
                  <div v-if="b.features.length" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span class="font-mono2 text-[10px] uppercase tracking-wide text-slate-400">Réalise</span>
                    <button v-for="f in b.features" :key="f.id" type="button" class="feat-chip" :title="`Voir « ${f.name} » sur le canvas`" @click="goCanvasFn(f.id)">
                      <span v-if="f.code" class="font-mono2 text-[9px] text-violet-400">{{ f.code }}</span>{{ f.name || 'Sans titre' }}
                    </button>
                  </div>
                  <ul class="mt-2 space-y-1.5 text-sm">
                    <li v-for="beh in b.behaviors" :id="`el-${beh.id}`" :key="beh.id" class="scroll-mt-24">
                      <button type="button" class="text-left font-medium text-slate-700 decoration-slate-300 underline-offset-2 hover:underline" @click="goCanvas(beh.id)">{{ beh.attrs.name || 'comportement' }}</button>
                      <span v-if="beh.attrs.facet" class="ml-1 rounded-sm bg-slate-100 px-1 font-mono2 text-[9px] uppercase text-slate-400">{{ beh.attrs.facet }}</span>
                      <span v-if="beh.attrs.trigger" class="text-slate-500"> — {{ beh.attrs.trigger }}</span>
                      <span class="ml-1 inline-flex items-center gap-1">
                        <input
                          :value="beh.attrs.hours == null ? '' : beh.attrs.hours"
                          type="number" min="0" step="0.5"
                          class="w-14 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono2 text-xs text-slate-600 outline-hidden transition hover:border-slate-200 focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-300"
                          :class="{ 'text-amber-500': beh.attrs.hours == null }"
                          placeholder="—"
                          aria-label="Charge en heures"
                          @change="setBehaviorHours(beh.id, ($event.target as HTMLInputElement).value)"
                          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                        />
                        <span class="font-mono2 text-[10px] text-slate-400">h</span>
                      </span>
                      <button v-if="isIncomplete(beh.id)" type="button" class="badge-warn ml-1 ring-1 ring-amber-200 bg-amber-50 text-amber-600" title="À compléter" @click="goCanvas(beh.id)">incomplet</button>
                      <div v-if="beh.attrs.rules" class="pl-3 text-xs text-slate-500">Règles : {{ beh.attrs.rules }}</div>
                    </li>
                    <!-- `id` et badge « incomplet » réservés aux notes flottantes : une connexion portée
                         par le bloc cible le bloc, dont l'ancre `el-…` existe déjà plus haut (id en
                         double sinon) et dont la complétude se juge sur le bloc, pas sur l'appel. -->
                    <li v-for="(api, i) in b.apis" :id="api.fromNote ? `el-${api.nodeId}` : undefined" :key="'api' + i" class="scroll-mt-24 text-slate-500">
                      <span class="font-mono2 text-[10px] uppercase tracking-wide text-slate-400">API</span>
                      <button type="button" class="ml-1 font-medium text-cyan-700 decoration-cyan-200 underline-offset-2 hover:underline" @click="goCanvas(api.nodeId)">{{ api.serviceName }}</button>
                      <span class="font-mono2 text-xs text-slate-500"> {{ api.method }} {{ api.path }}</span>
                      <button v-if="api.fromNote && isIncomplete(api.nodeId)" type="button" class="badge-warn ml-1 ring-1 ring-amber-200 bg-amber-50 text-amber-600" title="À compléter" @click="goCanvas(api.nodeId)">incomplet</button>
                    </li>
                  </ul>
                </div>

                <!-- Comportements / API propres à la page -->
                <div v-if="page.behaviors.length" class="border-t border-slate-100 pt-3">
                  <p class="font-mono2 text-[10px] uppercase tracking-wide text-slate-400">Comportements de la page</p>
                  <ul class="mt-1.5 space-y-1.5 text-sm">
                    <li v-for="beh in page.behaviors" :id="`el-${beh.id}`" :key="beh.id" class="scroll-mt-24">
                      <button type="button" class="text-left font-medium text-slate-700 decoration-slate-300 underline-offset-2 hover:underline" @click="goCanvas(beh.id)">{{ beh.attrs.name || 'comportement' }}</button>
                      <span v-if="beh.attrs.facet" class="ml-1 rounded-sm bg-slate-100 px-1 font-mono2 text-[9px] uppercase text-slate-400">{{ beh.attrs.facet }}</span>
                      <span v-if="beh.attrs.trigger" class="text-slate-500"> — {{ beh.attrs.trigger }}</span>
                      <span class="ml-1 inline-flex items-center gap-1">
                        <input
                          :value="beh.attrs.hours == null ? '' : beh.attrs.hours"
                          type="number" min="0" step="0.5"
                          class="w-14 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono2 text-xs text-slate-600 outline-hidden transition hover:border-slate-200 focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-300"
                          :class="{ 'text-amber-500': beh.attrs.hours == null }"
                          placeholder="—"
                          aria-label="Charge en heures"
                          @change="setBehaviorHours(beh.id, ($event.target as HTMLInputElement).value)"
                          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                        />
                        <span class="font-mono2 text-[10px] text-slate-400">h</span>
                      </span>
                      <div v-if="beh.attrs.rules" class="pl-3 text-xs text-slate-500">Règles : {{ beh.attrs.rules }}</div>
                    </li>
                  </ul>
                </div>
                <div v-if="page.apis.length" class="border-t border-slate-100 pt-3">
                  <p class="font-mono2 text-[10px] uppercase tracking-wide text-slate-400">Appels API de la page</p>
                  <ul class="mt-1.5 space-y-1 text-sm">
                    <li v-for="api in page.apis" :id="`el-${api.nodeId}`" :key="api.nodeId" class="scroll-mt-24 text-slate-500">
                      <button type="button" class="font-medium text-cyan-700 decoration-cyan-200 underline-offset-2 hover:underline" @click="goCanvas(api.nodeId)">{{ api.serviceName }}</button>
                      <span class="font-mono2 text-xs"> {{ api.method }} {{ api.path }}</span>
                    </li>
                  </ul>
                </div>
                <div v-if="page.constraints.length" class="border-t border-slate-100 pt-3">
                  <p class="font-mono2 text-[10px] uppercase tracking-wide text-slate-400">Contraintes de la page</p>
                  <ul class="mt-1.5 list-disc pl-5 text-sm text-slate-500">
                    <li v-for="(c, i) in page.constraints" :key="'pc' + i">{{ c }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <p v-if="!specs.pages.length" class="mt-6 text-sm italic text-slate-400">
              Aucune page dans ce projet. Ajoutez des pages sur le canvas.
            </p>
          </section>
        </article>
      </div>
    </div>

    <!-- Sidebar points d'attention -->
    <AttentionSidebar
      v-if="sidebarOpen"
      class="no-print shrink-0"
      @navigate="onAttentionNavigate"
      @close="sidebarOpen = false"
    />
  </div>
</template>

<style scoped>
.section-eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgb(100 116 139);
}
/* Onglet du segmenté « facette ». Repose sur la palette éditoriale de la vue (slate + violet
   d'accent), et non sur le cyan des flottants du canvas : ce contrôle appartient au document. */
.facet-tab {
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 500;
  color: rgb(100 116 139);
  transition:
    background-color 120ms ease,
    color 120ms ease;
}
.facet-tab:hover {
  background: rgb(241 245 249);
  color: rgb(51 65 85);
}
.facet-tab-on,
.facet-tab-on:hover {
  background: rgb(245 243 255);
  color: rgb(109 40 217);
  box-shadow: inset 0 0 0 1px rgb(221 214 254);
}
.toc-link {
  display: block;
  width: 100%;
  padding: 2px 0 2px 12px;
  margin-left: -1px;
  border-left: 2px solid transparent;
  text-align: left;
  color: rgb(100 116 139);
  transition: color 120ms ease, border-color 120ms ease;
}
.toc-link:hover {
  color: rgb(15 23 42);
  border-color: rgb(148 163 184);
}
.toc-sub {
  display: block;
  width: 100%;
  padding: 1px 0 1px 24px;
  text-align: left;
  font-size: 12px;
  color: rgb(148 163 184);
  transition: color 120ms ease;
}
.toc-sub:hover {
  color: rgb(71 85 105);
}
.feat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 9999px;
  border: 1px solid rgb(221 214 254);
  background: rgb(245 243 255 / 0.7);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: rgb(109 40 217);
  transition: background-color 120ms ease;
}
.feat-chip:hover {
  background: rgb(237 233 254);
}
.badge-warn {
  border-radius: 9999px;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.anchor-flash {
  animation: anchor-flash 1.2s ease;
  border-radius: 12px;
}
@keyframes anchor-flash {
  0%,
  40% {
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.18);
  }
  100% {
    box-shadow: 0 0 0 3px transparent;
  }
}
@media print {
  .no-print {
    display: none !important;
  }
  .specs-view {
    height: auto;
    overflow: visible;
    background: white;
  }
  .doc-scroll {
    overflow: visible;
  }
  .page-block,
  .feature-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
</style>

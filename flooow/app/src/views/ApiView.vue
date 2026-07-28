<script setup lang="ts">
// Documentation interactive des API connectées au projet (derive/api via project.apiView),
// façon readme.io : sidebar de navigation service → endpoints, fiche par endpoint
// (description du registre, consommateurs du graph remontés via attachedTo), et console
// d'essai par endpoint (ApiTryIt, relais serveur /api/proxy pour passer CORS).
// L'auth d'essai est mémorisée PAR SERVICE dans le navigateur (localStorage) — jamais
// dans le document partagé. Services `risk:high` en tête. Clic consommateur → canvas.
import { computed, reactive, ref } from 'vue'
import type { ApiConsumer, ApiServiceGroup } from '@flooow/core/domain/derive/api'
import { endpointId } from '@flooow/core/domain/invariants'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { exportApiMarkdown, projectSlug } from '@/io/export/markdown'
import { saveTextAs } from '@/io/file'
import { emptyAuth, loadAuth, saveAuth, type ServiceAuth } from '@/io/apiTester'
import ApiTryIt from '@/panels/ApiTryIt.vue'

const project = useProjectStore()
const session = useSessionStore()
const ui = useUiStore()

const api = computed(() => project.apiView)

/** Un endpoint documenté : registre du service et/ou référencé par des notes API. */
interface DocEndpoint {
  method: string
  path: string
  /** Description libre portée par le registre du service (ServiceEndpoint.notes). */
  notes: string
  consumers: ApiConsumer[]
  /** false = référencé par une note mais absent du registre du service. */
  declared: boolean
}

/** Union ordonnée : les endpoints du registre d'abord, puis les référencés hors registre. */
function endpointsOf(group: ApiServiceGroup): DocEndpoint[] {
  const usageByKey = new Map(group.endpoints.map((u) => [endpointId(u.method, u.path), u]))
  const out: DocEndpoint[] = []
  const declared = new Set<string>()
  for (const ep of group.service.endpoints) {
    const key = endpointId(ep.method, ep.path)
    declared.add(key)
    out.push({
      method: ep.method.toUpperCase(),
      path: ep.path,
      notes: ep.notes,
      consumers: usageByKey.get(key)?.consumers ?? [],
      declared: true,
    })
  }
  for (const usage of group.endpoints) {
    if (declared.has(endpointId(usage.method, usage.path))) continue
    out.push({
      method: usage.method.toUpperCase(),
      path: usage.path,
      notes: '',
      consumers: usage.consumers,
      declared: false,
    })
  }
  return out
}

const groups = computed(() =>
  api.value.byService.map((group) => ({ group, endpoints: endpointsOf(group) })),
)

// ── Auth d'essai par service (localStorage, éditeur repliable par service) ────
const auths = reactive<Record<string, ServiceAuth>>({})
const authOpen = ref<string | null>(null)
const authSavedFor = ref<string | null>(null)

function authOf(serviceId: string): ServiceAuth {
  if (!auths[serviceId]) auths[serviceId] = loadAuth(serviceId)
  return auths[serviceId]
}

function toggleAuth(serviceId: string): void {
  authOpen.value = authOpen.value === serviceId ? null : serviceId
}

function onSaveAuth(serviceId: string): void {
  saveAuth(serviceId, authOf(serviceId))
  authSavedFor.value = serviceId
  setTimeout(() => (authSavedFor.value = null), 1500)
}

function onClearAuth(serviceId: string): void {
  auths[serviceId] = emptyAuth()
  saveAuth(serviceId, auths[serviceId])
}

const AUTH_LABELS: Record<ServiceAuth['scheme'], string> = {
  none: 'Aucune',
  bearer: 'Bearer (jeton)',
  basic: 'Basic (identifiant + mot de passe)',
  header: 'Header (clé d’API)',
  query: 'Paramètre de query',
}

// ── Navigation / ancres (le conteneur scrollable est la vue, pas la fenêtre) ──
function anchorId(serviceId: string, ep?: DocEndpoint): string {
  return ep ? `api-${serviceId}-${endpointId(ep.method, ep.path)}` : `api-${serviceId}`
}

function scrollTo(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const METHOD_TONES: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-700',
  POST: 'bg-emerald-100 text-emerald-700',
  PUT: 'bg-orange-100 text-orange-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-rose-100 text-rose-700',
}
const methodTone = (m: string): string => METHOD_TONES[m.toUpperCase()] ?? 'bg-slate-100 text-slate-600'

function focus(id: string): void {
  ui.focusNode(id)
}

/** Saute vers une fonctionnalité : bascule en couche fonctionnelle + centre le canvas. */
function focusFeature(id: string): void {
  ui.setCanvasLayer('functional')
  ui.focusNode(id)
}

async function onExportMarkdown(): Promise<void> {
  await saveTextAs(`${projectSlug(project.doc)}-api.md`, exportApiMarkdown(project.doc), 'text/markdown')
}
</script>

<template>
  <div class="api-view h-full overflow-auto bg-white text-slate-700">
    <header
      class="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-8 py-3 backdrop-blur-sm"
    >
      <h1 class="text-lg font-semibold text-slate-800">API du projet</h1>
      <p class="text-xs text-slate-400">
        Documentation des services connectés, générée depuis le cadrage.
      </p>

      <button
        type="button"
        class="ml-auto rounded-sm border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
        @click="onExportMarkdown"
      >
        Markdown
      </button>
    </header>

    <div class="mx-auto flex max-w-6xl items-start gap-8 px-8 py-6">
      <!-- Sidebar de navigation -->
      <nav
        v-if="groups.length"
        class="no-print sticky top-16 hidden w-56 shrink-0 lg:block"
        aria-label="Navigation API"
      >
        <div v-for="{ group, endpoints } in groups" :key="group.service.id" class="mb-4">
          <button
            type="button"
            class="mb-1 w-full truncate text-left text-xs font-semibold text-slate-800 hover:underline"
            @click="scrollTo(anchorId(group.service.id))"
          >
            {{ group.service.name || 'Service' }}
          </button>
          <ul class="space-y-0.5 border-l border-slate-200 pl-2">
            <li v-for="ep in endpoints" :key="anchorId(group.service.id, ep)">
              <button
                type="button"
                class="flex w-full items-baseline gap-1.5 text-left text-[11px] text-slate-500 hover:text-slate-800"
                @click="scrollTo(anchorId(group.service.id, ep))"
              >
                <span class="w-11 shrink-0 text-right font-mono font-semibold" :class="methodTone(ep.method).split(' ')[1]">
                  {{ ep.method }}
                </span>
                <span class="truncate font-mono">{{ ep.path }}</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <!-- Contenu -->
      <div class="min-w-0 flex-1">
        <p v-if="!groups.length" class="text-sm italic text-slate-400">
          Aucun service au registre. Ajoutez des services et rattachez des notes API sur le
          canvas : la documentation se construira ici toute seule.
        </p>

        <section
          v-for="{ group, endpoints } in groups"
          :id="anchorId(group.service.id)"
          :key="group.service.id"
          class="mb-10 scroll-mt-16"
        >
          <!-- En-tête du service -->
          <div
            class="rounded-lg border p-4"
            :class="group.service.risk === 'high' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/60'"
          >
            <h2 class="flex flex-wrap items-baseline gap-2 text-base font-semibold text-slate-800">
              <button type="button" class="hover:underline" @click="focus(group.service.id)">
                {{ group.service.name || 'Service' }}
              </button>
              <span
                class="rounded-sm px-1.5 py-0.5 text-xs font-normal"
                :class="group.service.risk === 'high' ? 'bg-rose-200 text-rose-800' : 'bg-slate-100 text-slate-600'"
              >
                risque {{ group.service.risk }}
              </span>
            </h2>
            <p class="mt-1 text-xs text-slate-500">
              URL de base :
              <code v-if="group.baseUrl" class="rounded-sm bg-slate-100 px-1 py-0.5 text-slate-700">{{ group.baseUrl }}</code>
              <span v-else class="italic text-slate-400">non renseignée</span>
              <span v-if="group.service.auth" class="ml-2">· auth {{ group.service.auth }}</span>
            </p>
            <p v-if="group.service.notes" class="mt-1 whitespace-pre-line text-xs text-slate-500">
              {{ group.service.notes }}
            </p>

            <!-- Auth d'essai mémorisée (navigateur uniquement) -->
            <div class="no-print mt-3">
              <button
                type="button"
                class="rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                @click="toggleAuth(group.service.id)"
              >
                🔑 Auth d’essai
                <span v-if="authOf(group.service.id).scheme !== 'none'" class="text-emerald-600">· configurée</span>
              </button>
              <div
                v-if="authOpen === group.service.id"
                class="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-white p-3"
              >
                <label class="block text-xs text-slate-600">
                  <span class="mb-1 block text-[10px] text-slate-400">Schéma</span>
                  <select
                    v-model="authOf(group.service.id).scheme"
                    class="rounded-sm border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option v-for="(label, scheme) in AUTH_LABELS" :key="scheme" :value="scheme">{{ label }}</option>
                  </select>
                </label>
                <label
                  v-if="['basic', 'header', 'query'].includes(authOf(group.service.id).scheme)"
                  class="block text-xs text-slate-600"
                >
                  <span class="mb-1 block text-[10px] text-slate-400">
                    {{ authOf(group.service.id).scheme === 'basic' ? 'Identifiant' : 'Nom' }}
                  </span>
                  <input
                    v-model="authOf(group.service.id).name"
                    class="w-36 rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs"
                    :placeholder="authOf(group.service.id).scheme === 'query' ? 'api_key' : 'X-Api-Key'"
                    spellcheck="false"
                  />
                </label>
                <label v-if="authOf(group.service.id).scheme !== 'none'" class="block text-xs text-slate-600">
                  <span class="mb-1 block text-[10px] text-slate-400">
                    {{ authOf(group.service.id).scheme === 'basic' ? 'Mot de passe' : 'Valeur' }}
                  </span>
                  <input
                    v-model="authOf(group.service.id).value"
                    type="password"
                    class="w-48 rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs"
                    spellcheck="false"
                  />
                </label>
                <button
                  type="button"
                  class="rounded-sm bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                  @click="onSaveAuth(group.service.id)"
                >
                  {{ authSavedFor === group.service.id ? 'Enregistré ✓' : 'Enregistrer' }}
                </button>
                <button
                  type="button"
                  class="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  @click="onClearAuth(group.service.id)"
                >
                  Effacer
                </button>
                <p class="w-full text-[10px] text-slate-400">
                  Gardée dans CE navigateur uniquement — jamais dans le document partagé.
                </p>
              </div>
            </div>
          </div>

          <!-- Fiches endpoints -->
          <article
            v-for="ep in endpoints"
            :id="anchorId(group.service.id, ep)"
            :key="anchorId(group.service.id, ep)"
            class="mt-6 scroll-mt-16 border-t border-slate-100 pt-5"
          >
            <div class="grid gap-6 lg:grid-cols-2">
              <!-- Colonne doc -->
              <div class="min-w-0">
                <h3 class="flex flex-wrap items-center gap-2">
                  <span class="rounded-sm px-1.5 py-0.5 font-mono text-xs font-bold" :class="methodTone(ep.method)">
                    {{ ep.method }}
                  </span>
                  <code class="break-all text-sm font-semibold text-slate-800">{{ ep.path }}</code>
                  <span
                    v-if="!ep.declared"
                    class="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700"
                    title="Référencé par une note API mais absent du registre du service"
                  >
                    hors registre
                  </span>
                </h3>
                <p v-if="ep.notes" class="mt-2 whitespace-pre-line text-sm text-slate-600">{{ ep.notes }}</p>

                <template v-if="ep.consumers.length">
                  <h4 class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Consommé par
                    <span
                      v-if="ep.consumers.length >= 3"
                      class="ml-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-700"
                      title="Endpoint consommé par de nombreux nœuds (point de fragilité)"
                    >
                      {{ ep.consumers.length }} consommateurs
                    </span>
                  </h4>
                  <ul class="mt-1 space-y-0.5 text-sm">
                    <li v-for="c in ep.consumers" :key="c.noteId" class="text-slate-600">
                      <button type="button" class="text-left hover:underline" @click="focus(c.noteId)">
                        {{ c.targetName }}
                      </button>
                      <span v-if="c.pageName" class="text-slate-400"> (page {{ c.pageName }})</span>
                      <span v-for="f in c.features" :key="f.id" class="ml-1 inline-flex items-center gap-1">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] text-violet-700 hover:bg-violet-100"
                          :title="`Voir « ${f.name} » sur le canvas`"
                          @click="focusFeature(f.id)"
                        >
                          <span v-if="f.code" class="font-mono text-violet-400">{{ f.code }}</span>
                          {{ f.name || 'Sans titre' }}
                        </button>
                      </span>
                    </li>
                  </ul>
                </template>
                <p v-else class="mt-2 text-xs italic text-slate-400">
                  Aucun consommateur : endpoint déclaré au registre mais non référencé par une note API.
                </p>
              </div>

              <!-- Colonne console -->
              <ApiTryIt
                class="no-print"
                :method="ep.method"
                :path="ep.path"
                :base-url="group.baseUrl"
                :auth="authOf(group.service.id)"
                :can-send="session.canWrite"
              />
            </div>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }
  .api-view {
    height: auto;
    overflow: visible;
  }
}
</style>

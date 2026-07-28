<script setup lang="ts">
// Éditeur d'un fichier de projet en CO-ÉDITION temps réel (/p/:folder/:file, jalon 6).
// Le shell applicatif (canvas plein écran selon ui.mode + calque de panneaux + split
// FeatureEditor) est branché sur un Y.Doc synchronisé par Hocuspocus : l'état initial
// vient du premier sync, les éditions locales et distantes fusionnent via le pont
// (collab/bridge), et la persistance .graph.json est AUTOMATIQUE côté serveur.
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { startCollab, type CollabSession, type Peer } from '@/collab/bridge'
import PresenceBubbles from '@/collab/PresenceBubbles.vue'
import FlowCanvas from '@/canvas/FlowCanvas.vue'
import PanelLayer from '@/panels/PanelLayer.vue'
import ModeSwitcher from '@/panels/ModeSwitcher.vue'
import AppMenu from '@/panels/AppMenu.vue'
import FeatureEditor from '@/panels/FeatureEditor.vue'
import CommentsPanel from '@/panels/CommentsPanel.vue'
import ModuleRail from '@/panels/ModuleRail.vue'
import SpecsView from '@/views/SpecsView.vue'
import ApiView from '@/views/ApiView.vue'
import { listFolders } from '@/io/api'
import { useFeatureEditor } from '@/composables/useFeatureEditor'
import { useRouteSync } from '@/composables/useRouteSync'
import { useSaveStatus } from '@/composables/useFileActions'

const props = defineProps<{ folder: string; file: string }>()

const ui = useUiStore()
const session = useSessionStore()
const project = useProjectStore()

// Vue courante (mode / couche canvas) ⇄ URL : historique de navigation et liens
// profonds. Le changement de `mode` ne touche que les params de CETTE route → EditorView n'est pas
// remonté, la session collab survit aux bascules de vue.
useRouteSync()

// Éditeur de fonctionnalité en split pleine hauteur (droite).
const featureEditor = useFeatureEditor()
const EDITOR_WIDTH = 'clamp(360px, 40vw, 600px)'

/**
 * Rail de modules en split pleine hauteur (GAUCHE), symétrique de l'éditeur de fonctionnalité : la
 * zone canvas rétrécit, le rail n'est PAS un flottant. C'est le seul montage qui préserve les
 * panneaux ancrés à gauche (ToolDock, ZoomBar) — PanelLayer étant en `fixed inset-0`,
 * un rail flottant les recouvrirait sans qu'ils puissent s'écarter. Voir l'en-tête de ModuleRail.
 */
const RAIL_WIDTH = '244px'
const railOpen = computed(
  () => ui.mode === 'canvas' && ui.canvasLayer === 'functional' && ui.funcView === 'module',
)

// Menu d'application (logo topbar, façon Figma).
const appMenuOpen = ref(false)

/**
 * Panneau de commentaires (v13) — règle anti-étroitesse n°2 : écran large → DOCKÉ (le canvas se
 * recadre, comme à l'ouverture du FeatureEditor) ; écran étroit (< 1200 px) → OVERLAY par-dessus
 * le canvas, même largeur plancher. On ne compresse jamais les deux à la fois.
 */
const OVERLAY_BREAKPOINT = 1200
const windowWidth = ref(window.innerWidth)
function onWindowResize(): void {
  windowWidth.value = window.innerWidth
}
onMounted(() => window.addEventListener('resize', onWindowResize))
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize))
const commentsOverlay = computed(() => windowWidth.value < OVERLAY_BREAKPOINT)
const commentsDocked = computed(() => ui.commentsPanelOpen && !commentsOverlay.value)
const commentsWidth = computed(() => `${ui.commentsPanelWidth}px`)
// `visibleComments` et non `comments` : les fils « pour Claude » sont réservés aux membres
// Pilot'in — un client ne doit pas même les compter.
const openCommentCount = computed(() => project.visibleComments.filter((c) => !c.resolved).length)

/**
 * État de sauvegarde, affiché entre parenthèses après le nom du projet. Il vivait dans le StatusChip,
 * une pastille flottante posée sur le canvas : une information de DOCUMENT rendue par-dessus le
 * dessin, qui masquait des cartes et suivait le rétrécissement de la scène. Sa place est ici, collée
 * au nom du document qu'elle qualifie — comme dans n'importe quel éditeur de fichier.
 */
const saveStatus = useSaveStatus()

// Session collaborative (pont Y.Doc ⇄ store).
let collab: CollabSession | undefined
const connected = ref(false)
const synced = ref(false)
const peers = ref<Peer[]>([])

// Statut d'affichage : on n'ouvre l'éditeur qu'une fois le premier sync reçu
// (évite d'éditer un état pré-sync qui écraserait le document distant).
const status = computed<'connecting' | 'ready'>(() => (synced.value ? 'ready' : 'connecting'))

// Documentation du projet (narratif markdown publié par Portulan) : présente quand le dossier
// du projet est lié au docs/ d'un site bao. Best-effort — pas de docs, pas de lien.
const docsUrl = ref<string | null>(null)

onMounted(async () => {
  // L'identité (nom + avatar) alimente la présence : on la garantit avant de connecter.
  if (!session.identity) await session.fetchSession()
  listFolders()
    .then((folders) => (docsUrl.value = folders.find((f) => f.slug === props.folder)?.docsUrl ?? null))
    .catch(() => {})
  collab = startCollab(props.folder, props.file)
  // Relaye l'état réactif du pont.
  watch(collab.connected, (v) => (connected.value = v), { immediate: true })
  watch(collab.synced, (v) => (synced.value = v), { immediate: true })
  watch(collab.peers, (v) => (peers.value = v), { immediate: true })
})

onBeforeUnmount(() => {
  collab?.destroy()
  collab = undefined
})

const centralComponent = computed(() => {
  switch (ui.mode) {
    case 'specs':
      return SpecsView
    case 'api':
      return ApiView
    default:
      return FlowCanvas
  }
})
</script>

<template>
  <div class="app-shell flex h-full w-full flex-col overflow-hidden bg-slate-100">
    <!-- Topbar -->
    <header class="relative z-47 flex w-full shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
      <button
        type="button"
        class="aspect-square rounded-md bg-black flex items-center p-1.5 transition-colors hover:bg-slate-700"
        :aria-expanded="appMenuOpen"
        aria-haspopup="menu"
        @click.stop="appMenuOpen = !appMenuOpen"
      >
        <SvgIcon icon="logo" class="inline-block h-4 w-auto fill-white" />
        <span class="sr-only">Menu de l'application</span>
      </button>

      <!-- Menu d'application façon Figma (retour aux projets, exports…) -->
      <div v-if="appMenuOpen" class="absolute left-2 top-full z-50 mt-1.5">
        <AppMenu @close="appMenuOpen = false" />
      </div>

      <!-- Bascule de vue — dans la topbar (remplace le panneau flottant haut-centre).
           La bascule de COUCHE, elle, a quitté cet ancrage : elle vit désormais dans la colonne
           flottante gauche de PanelLayer, avec le ToolDock et la ZoomBar. Ancrée ici, elle restait
           calée sur la topbar donc sur la FENÊTRE, et ne se décalait pas quand le rail de modules
           rétrécit la scène. -->
      <div class="relative rounded-lg bg-primary-300">
        <ModeSwitcher variant="bare" />
      </div>

      <!-- Documentation du projet (Portulan) — à côté de la bascule de vue -->
      <a
        v-if="docsUrl"
        :href="docsUrl"
        target="_blank"
        rel="noopener"
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-300 hover:text-black"
        title="Documentation du projet (nouvel onglet)"
      >
        Docs ↗
      </a>

      <!-- Nom du projet ouvert + état de sauvegarde — à droite de la bascule de vue.
           L'état est atténué et entre parenthèses : il qualifie le nom sans lui disputer la
           lecture. L'heure du dernier enregistrement reste en infobulle plutôt qu'en clair —
           une horloge dans la topbar attire l'œil en permanence pour une information qu'on ne
           consulte qu'en cas de doute. -->
      <span
        v-if="status === 'ready' && project.meta.name"
        class="min-w-0 truncate text-sm font-medium text-slate-700"
        :title="project.meta.name"
      >
        {{ project.meta.name }}
        <span
          class="font-normal text-slate-400"
          :title="saveStatus.savedAt.value ? `Dernier enregistrement à ${saveStatus.savedAt.value}` : undefined"
        >
          ({{ saveStatus.label.value }})
        </span>
      </span>

      <!-- Présence + statut temps réel — à droite de la topbar -->
      <div class="ml-auto flex items-center gap-3">
        <!-- Toggle du panneau de commentaires (v13) : « 💬 n » = fils ouverts du document. -->
        <button
          type="button"
          class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors"
          :class="
            ui.commentsPanelOpen
              ? 'border-amber-400 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-white/90 text-slate-600 hover:bg-slate-50'
          "
          :aria-pressed="ui.commentsPanelOpen"
          title="Commentaires (Échap pour fermer)"
          @click="ui.toggleCommentsPanel()"
        >
          💬 <span>{{ openCommentCount }}</span>
        </button>
        <PresenceBubbles :peers="peers" />
        <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium">
          <span
            class="inline-block h-2 w-2 rounded-full"
            :class="connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'"
            :title="connected ? 'Connecté (temps réel)' : 'Reconnexion…'"
          />
          <span class="text-slate-600">{{ connected ? 'Temps réel' : 'Reconnexion…' }}</span>
          <span
            v-if="!session.canWrite"
            class="ml-1 rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500"
          >
            lecture seule
          </span>
        </div>
      </div>
    </header>

    <!-- Connexion / premier sync -->
    <div
      v-if="status === 'connecting'"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500"
    >
      <span class="animate-pulse text-sm">Connexion au projet…</span>
     
    </div>

    <!-- Zone éditeur : prend toute la hauteur restante sous la topbar ; les overlays
         absolus (main, panneaux, présence) s'ancrent sur elle. -->
    <div v-else class="relative min-h-0 flex-1">
        <!-- Rail de modules (vue par module) — split pleine hauteur à gauche. -->
        <div
          class="absolute inset-y-0 left-0 z-45 overflow-hidden transition-[width] duration-300 ease-out"
          :style="{ width: railOpen ? RAIL_WIDTH : '0px' }"
          :inert="!railOpen"
        >
          <!-- Largeur FIXE à l'intérieur du conteneur qui s'anime : sans elle, le contenu se
               comprimerait pendant la transition au lieu de se découvrir par la droite. -->
          <div class="h-full" :style="{ width: RAIL_WIDTH }"><ModuleRail /></div>
        </div>

        <main
          class="absolute inset-y-0 transition-[right,left] duration-300 ease-out"
          :style="{
            right: featureEditor.open.value ? EDITOR_WIDTH : commentsDocked ? commentsWidth : '0px',
            left: railOpen ? RAIL_WIDTH : '0px',
          }"
        >
          <component :is="centralComponent" />
        </main>
        <!-- Le calque flottant suit le rétrécissement de la scène : ses ancrages `left-*` restent
             donc relatifs au canvas visible, pas à la fenêtre. -->
        <PanelLayer :inset-left="railOpen ? RAIL_WIDTH : '0px'" />

        <!-- Panneau de commentaires (v13) : docké (le canvas se recadre) ou overlay (< 1200 px,
             ombre marquée par-dessus le canvas). Sous le FeatureEditor (z-44 < z-45) : les deux
             ouverts, l'éditeur — geste le plus récent et le plus modal — prend le dessus. -->
        <div
          class="absolute inset-y-0 right-0 z-44 transition-transform duration-300 ease-out"
          :style="{ width: commentsWidth }"
          :class="[
            ui.commentsPanelOpen ? 'translate-x-0' : 'translate-x-full',
            commentsOverlay && ui.commentsPanelOpen ? 'shadow-2xl' : '',
          ]"
          :inert="!ui.commentsPanelOpen"
        >
          <CommentsPanel />
        </div>

        <!-- Split éditeur de fonctionnalité -->
        <div
          class="absolute inset-y-0 right-0 z-45 transition-transform duration-300 ease-out"
          :style="{ width: EDITOR_WIDTH }"
          :class="featureEditor.open.value ? 'translate-x-0 shadow-xl' : 'translate-x-full'"
        >
          <FeatureEditor />
        </div>
    </div>
  </div>
</template>

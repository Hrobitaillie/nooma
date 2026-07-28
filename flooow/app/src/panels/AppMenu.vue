<script setup lang="ts">
// Menu d'application (clic sur le logo de la topbar) — panneau sombre façon Figma.
// Retour au hub des projets, actions FICHIER, exports du dossier, actions canvas.
// Fermeture : clic hors du panneau, Échap, ou après toute action.
//
// Les actions fichier (nouveau / ouvrir / enregistrer / démos) venaient du StatusChip, une pastille
// flottante posée sur le canvas qui cumulait deux rôles sans rapport : indiquer l'état de
// sauvegarde et servir de menu fichier. Elles rejoignent ici le menu principal — leur place
// naturelle — et l'état de sauvegarde, lui, est passé dans la topbar à côté du nom du projet.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useFileActions } from '@/composables/useFileActions'
import { loadDemoProject, loadLocasystProject } from '@/io/demo'
import { exportSpecsMarkdown, exportApiMarkdown, projectSlug } from '@/io/export/markdown'
import { exportSpecsPdf } from '@/io/export/pdf'
import { saveTextAs } from '@/io/file'

const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const project = useProjectStore()
const ui = useUiStore()
const files = useFileActions()
const rootRef = ref<HTMLElement | null>(null)

function close(): void {
  emit('close')
}

function backToHub(): void {
  close()
  void router.push('/')
}

// ── Fichier ───────────────────────────────────────────────────────────────────
// Chaque entrée referme d'abord le menu : l'action peut ouvrir une boîte de dialogue native
// (sélecteur de fichier, confirm), et un menu resté ouvert derrière serait un panneau fantôme.
function newProject(): void {
  close()
  files.newProject()
}
function openProject(): void {
  close()
  void files.open()
}
function save(): void {
  close()
  void files.save()
}
function saveAs(): void {
  close()
  void files.saveAs()
}
async function loadDemo(): Promise<void> {
  close()
  if (
    project.dirty &&
    !window.confirm('Des modifications ne sont pas sauvegardées. Charger le projet de démo ?')
  ) {
    return
  }
  try {
    await loadDemoProject()
  } catch {
    window.alert('Projet de démo indisponible.')
  }
}
async function loadLocasyst(): Promise<void> {
  close()
  if (
    project.dirty &&
    !window.confirm('Des modifications ne sont pas sauvegardées. Charger le cadrage locasyst ?')
  ) {
    return
  }
  try {
    await loadLocasystProject()
    ui.setCanvasLayer('functional') // projet fonctionnel → ouvrir directement la bonne couche
  } catch {
    window.alert('Cadrage locasyst indisponible.')
  }
}

async function exportSpecsMd(): Promise<void> {
  close()
  await saveTextAs(`${projectSlug(project.doc)}-specs.md`, exportSpecsMarkdown(project.doc), 'text/markdown')
}
async function exportSpecsAsPdf(): Promise<void> {
  close()
  await exportSpecsPdf(project.doc, () => ui.setMode('specs'))
}
async function exportApiMd(): Promise<void> {
  close()
  await saveTextAs(`${projectSlug(project.doc)}-api.md`, exportApiMarkdown(project.doc), 'text/markdown')
}

/** Bascule vers le canvas (couche optionnelle) puis émet un événement une fois monté. */
function canvasAction(event: string, layer?: 'structural' | 'functional'): void {
  close()
  ui.setMode('canvas')
  if (layer) ui.setCanvasLayer(layer)
  // Le canvas doit être monté pour recevoir l'événement (bascule de mode ci-dessus) :
  // deux frames laissent Vue monter FlowCanvas et Vue Flow s'initialiser.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(event))),
  )
}

function zoomFit(): void {
  canvasAction('flooow:zoom-fit')
}

/** Espacement auto des fonctionnalités (hauteurs réelles) — couche fonctionnelle. */
function arrangeFunctional(): void {
  canvasAction('flooow:arrange-functional', 'functional')
}

/** Espacement auto des modules voisins — couche fonctionnelle. */
function reflowModules(): void {
  canvasAction('flooow:reflow-modules', 'functional')
}

// Fermeture : clic hors du panneau (pointerdown pour passer avant les clics UI) + Échap.
function onPointerDown(e: PointerEvent): void {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close()
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootRef"
    role="menu"
    aria-label="Menu de l'application"
    class="app-menu w-64 rounded-2xl bg-slate-900 py-2 text-sm text-slate-100 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/10"
  >
    <!-- Retour au hub -->
    <button type="button" role="menuitem" class="menu-row" @click="backToHub">
      <SvgIcon icon="arrow-left" class="size-4 text-slate-400" />
      Retour aux projets
    </button>

    <div class="my-2 border-t border-white/10" />

    <!-- Fichier (venu du StatusChip flottant) -->
    <p class="px-4 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      Fichier
    </p>
    <button type="button" role="menuitem" class="menu-row" @click="newProject">
      <SvgIcon icon="plus" class="size-4 text-slate-400" />
      Nouveau projet
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="openProject">
      <SvgIcon icon="folder" class="size-4 text-slate-400" />
      Ouvrir un projet…
      <kbd class="ml-auto text-[11px] text-slate-500">⌘O</kbd>
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="save">
      <SvgIcon icon="arrow-down" class="size-4 text-slate-400" />
      Enregistrer
      <kbd class="ml-auto text-[11px] text-slate-500">⌘S</kbd>
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="saveAs">
      <SvgIcon icon="arrow-down" class="size-4 text-slate-400" />
      Enregistrer sous…
      <kbd class="ml-auto text-[11px] text-slate-500">⌘⇧S</kbd>
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="loadDemo">
      <SvgIcon icon="file-text" class="size-4 text-slate-400" />
      Charger la démo
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="loadLocasyst">
      <SvgIcon icon="file-text" class="size-4 text-slate-400" />
      Charger le cadrage locasyst
    </button>

    <div class="my-2 border-t border-white/10" />

    <!-- Exports du dossier -->
    <p class="px-4 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      Exporter
    </p>
    <button type="button" role="menuitem" class="menu-row" @click="exportSpecsMd">
      <SvgIcon icon="file-text" class="size-4 text-slate-400" />
      Specs — Markdown
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="exportSpecsAsPdf">
      <SvgIcon icon="file-text" class="size-4 text-slate-400" />
      Specs — PDF
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="exportApiMd">
      <SvgIcon icon="file-text" class="size-4 text-slate-400" />
      Contrat d'API — Markdown
    </button>

    <div class="my-2 border-t border-white/10" />

    <!-- Canvas -->
    <p class="px-4 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      Canvas
    </p>
    <button type="button" role="menuitem" class="menu-row" @click="arrangeFunctional">
      <SvgIcon icon="layout-grid" class="size-4 text-slate-400" />
      Réorganiser les fonctionnalités
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="reflowModules">
      <SvgIcon icon="move-horizontal" class="size-4 text-slate-400" />
      Espacer les modules
    </button>
    <button type="button" role="menuitem" class="menu-row" @click="zoomFit">
      <SvgIcon icon="maximize" class="size-4 text-slate-400" />
      Recentrer le canvas
      <kbd class="ml-auto text-[11px] text-slate-500">⇧2</kbd>
    </button>
  </div>
</template>

<style scoped>
.menu-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 16px;
  text-align: left;
  cursor: pointer;
}
.menu-row:hover {
  background: rgb(255 255 255 / 0.08);
}
</style>

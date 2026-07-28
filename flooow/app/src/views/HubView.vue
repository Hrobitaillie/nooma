<script setup lang="ts">
// Hub d'arrivée : sidebar des dossiers de projets (gauche) + listing des fichiers du
// dossier sélectionné (main). Ouvrir un fichier → éditeur (/p/:folder/:file). Les actions
// d'écriture (créer/renommer/supprimer) ne sont proposées qu'aux rôles dev/marin.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { createEmptyProject } from '@flooow/core/model/factory'
import {
  listFolders,
  listFiles,
  createFolder,
  renameFolder,
  deleteFolder,
  createFile,
  renameFile,
  deleteFile,
  type FolderInfo,
  type FileInfo,
} from '@/io/api'

const router = useRouter()
const session = useSessionStore()

const folders = ref<FolderInfo[]>([])
const files = ref<FileInfo[]>([])
const selected = ref<string | null>(null)
const loadingFolders = ref(true)
const loadingFiles = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([session.fetchSession(), refreshFolders()])
})

async function refreshFolders(): Promise<void> {
  loadingFolders.value = true
  error.value = null
  try {
    folders.value = await listFolders()
    // Re-sélection : garde le dossier courant s'il existe encore, sinon le premier.
    if (selected.value && !folders.value.some((f) => f.slug === selected.value)) selected.value = null
    if (!selected.value && folders.value[0]) await selectFolder(folders.value[0].slug)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Chargement des dossiers impossible.'
  } finally {
    loadingFolders.value = false
  }
}

async function selectFolder(slug: string): Promise<void> {
  selected.value = slug
  loadingFiles.value = true
  error.value = null
  try {
    files.value = await listFiles(slug)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Chargement des fichiers impossible.'
    files.value = []
  } finally {
    loadingFiles.value = false
  }
}

async function refreshFiles(): Promise<void> {
  if (selected.value) await selectFolder(selected.value)
}

// ── Actions dossiers ─────────────────────────────────────────────────────────
async function onCreateFolder(): Promise<void> {
  const name = window.prompt('Nom du dossier ?')?.trim()
  if (!name) return
  try {
    const folder = await createFolder(name)
    await refreshFolders()
    await selectFolder(folder.slug)
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Création impossible.')
  }
}

async function onRenameFolder(folder: FolderInfo): Promise<void> {
  const name = window.prompt('Renommer le dossier :', folder.name)?.trim()
  if (!name || name === folder.name) return
  try {
    await renameFolder(folder.slug, name)
    await refreshFolders()
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Renommage impossible.')
  }
}

async function onDeleteFolder(folder: FolderInfo): Promise<void> {
  if (!window.confirm(`Supprimer le dossier « ${folder.name} » et son contenu ?`)) return
  try {
    await deleteFolder(folder.slug)
    if (selected.value === folder.slug) selected.value = null
    await refreshFolders()
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Suppression impossible.')
  }
}

// ── Actions fichiers ─────────────────────────────────────────────────────────
async function onCreateFile(): Promise<void> {
  if (!selected.value) return
  const name = window.prompt('Nom du projet ?')?.trim()
  if (!name) return
  try {
    const file = await createFile(selected.value, name, createEmptyProject(name))
    openFile(file)
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Création impossible.')
  }
}

async function onRenameFile(file: FileInfo): Promise<void> {
  if (!selected.value) return
  const name = window.prompt('Renommer le projet :', file.name)?.trim()
  if (!name || name === file.name) return
  try {
    await renameFile(selected.value, file.slug, name)
    await refreshFiles()
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Renommage impossible.')
  }
}

async function onDeleteFile(file: FileInfo): Promise<void> {
  if (!selected.value) return
  if (!window.confirm(`Supprimer le projet « ${file.projectName || file.name} » ?`)) return
  try {
    await deleteFile(selected.value, file.slug)
    await refreshFiles()
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Suppression impossible.')
  }
}

function openFile(file: FileInfo): void {
  if (!selected.value) return
  void router.push({ name: 'editor', params: { folder: selected.value, file: file.slug } })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}
</script>

<template>
  <div class="flex h-full w-full flex-col bg-slate-50 text-slate-800">
    <!-- En-tête -->
    <header class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div class="flex items-baseline gap-3">
        <h1 class="text-lg font-bold tracking-tight">Flooow</h1>
        <span class="text-sm text-slate-400">Projets</span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="text-slate-500">{{ session.displayName }}</span>
        <span
          v-if="session.role === 'client'"
          class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          title="Vous consultez en lecture seule"
        >
          lecture seule
        </span>
        <span
          v-else
          class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        >
          {{ session.role }}
        </span>
      </div>
    </header>

    <div v-if="error" class="border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- Sidebar dossiers -->
      <aside class="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Dossiers</span>
          <button
            v-if="session.canWrite"
            type="button"
            class="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            title="Nouveau dossier"
            @click="onCreateFolder"
          >
            + dossier
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p v-if="loadingFolders" class="px-2 py-2 text-sm text-slate-400">Chargement…</p>
          <p v-else-if="!folders.length" class="px-2 py-2 text-sm text-slate-400">Aucun dossier.</p>
          <ul v-else class="space-y-0.5">
            <li v-for="folder in folders" :key="folder.slug">
              <div
                class="group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm"
                :class="selected === folder.slug ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'"
                @click="selectFolder(folder.slug)"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate font-medium">{{ folder.name }}</span>
                  <span
                    class="shrink-0 text-xs"
                    :class="selected === folder.slug ? 'text-slate-300' : 'text-slate-400'"
                  >{{ folder.fileCount }}</span>
                </span>
                <span v-if="session.canWrite" class="ml-2 hidden shrink-0 gap-1 group-hover:flex">
                  <button
                    type="button"
                    class="rounded-sm px-1 text-xs"
                    :class="selected === folder.slug ? 'hover:bg-slate-700' : 'hover:bg-slate-200'"
                    title="Renommer"
                    @click.stop="onRenameFolder(folder)"
                  >✎</button>
                  <button
                    type="button"
                    class="rounded-sm px-1 text-xs"
                    :class="selected === folder.slug ? 'hover:bg-slate-700' : 'hover:bg-slate-200'"
                    title="Supprimer"
                    @click.stop="onDeleteFolder(folder)"
                  >🗑</button>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <!-- Main : fichiers du dossier -->
      <main class="min-h-0 flex-1 overflow-y-auto p-6">
        <div v-if="!selected" class="flex h-full items-center justify-center text-sm text-slate-400">
          Sélectionnez un dossier pour voir ses projets.
        </div>

        <template v-else>
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-base font-semibold text-slate-700">
              {{ folders.find((f) => f.slug === selected)?.name ?? selected }}
            </h2>
            <button
              v-if="session.canWrite"
              type="button"
              class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              @click="onCreateFile"
            >
              + Nouveau projet
            </button>
          </div>

          <p v-if="loadingFiles" class="text-sm text-slate-400">Chargement…</p>
          <p v-else-if="!files.length" class="text-sm text-slate-400">Aucun projet dans ce dossier.</p>

          <ul v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <li
              v-for="file in files"
              :key="file.slug"
              class="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
              @click="openFile(file)"
            >
              <p class="truncate pr-10 font-medium text-slate-800">{{ file.projectName || file.name }}</p>
              <p class="mt-1 text-xs text-slate-400">Modifié le {{ fmtDate(file.updatedAt) }}</p>
              <div
                v-if="session.canWrite"
                class="absolute right-2 top-2 hidden gap-1 group-hover:flex"
              >
                <button
                  type="button"
                  class="rounded-sm px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                  title="Renommer"
                  @click.stop="onRenameFile(file)"
                >✎</button>
                <button
                  type="button"
                  class="rounded-sm px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                  title="Supprimer"
                  @click.stop="onDeleteFile(file)"
                >🗑</button>
              </div>
            </li>
          </ul>
        </template>
      </main>
    </div>
  </div>
</template>

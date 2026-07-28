// Client de l'API serveur flooow (REST, base /api, même origin via le proxy Vite).
// Contrat : cf server/ + cadrage/05-implementation/multi-user-serveur.md.
// Toute erreur { error: { code, message } } est transformée en Error(message) lisible.
import { ref } from 'vue'
import type { ProjectDoc } from '@flooow/core/model/types'
import { validateProjectDoc } from '@/io/file'

/** Rôles bao AuthCrunch. `client` = lecture seule ; `dev`/`marin` = écriture. */
export type Role = 'dev' | 'marin' | 'client'

export interface SessionInfo {
  id: string
  name: string
  email: string | null
  role: Role
  /** URL d'avatar (claim Google `picture`) si disponible, sinon null → repli initiales. */
  avatar: string | null
  canWrite: boolean
  authenticated: boolean
}

/** Utilisateur de l'annuaire bao, tel qu'exposé par GET /api/users (mentions « @ »). */
export interface DirectoryUser {
  /**
   * UUID bao. Persisté dans les documents par le node `mention`, d'où l'id opaque plutôt que l'email
   * (qui change quand quelqu'un change de nom). À NE PAS supposer égal à `SessionInfo.id`, qui vaut
   * le sujet injecté par AuthCrunch : c'est l'email qui relie les deux (cf. mentions.ts).
   */
  id: string
  name: string
  email: string | null
  role: Role
}

export interface FolderInfo {
  slug: string
  name: string
  fileCount: number
  updatedAt: string | null
  /** URL Portulan des docs du site quand le dossier est lié à un site bao, sinon null. */
  docsUrl: string | null
}

export interface FileInfo {
  slug: string
  name: string
  projectName: string | null
  size: number
  updatedAt: string | null
}

const BASE = '/api'

/** Effectue une requête JSON et lève une Error(message) lisible sur échec. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    })
  } catch {
    throw new Error('Serveur injoignable.')
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) message = body.error.message
    } catch {
      /* corps non JSON : on garde le message par défaut */
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ── Session ──────────────────────────────────────────────────────────────────
export function getSession(): Promise<SessionInfo> {
  return request<SessionInfo>('/session')
}

// ── Annuaire (mentions) ──────────────────────────────────────────────────────
export async function listUsers(): Promise<DirectoryUser[]> {
  return (await request<{ users: DirectoryUser[] }>('/users')).users
}

// ── Dossiers ─────────────────────────────────────────────────────────────────
export async function listFolders(): Promise<FolderInfo[]> {
  return (await request<{ folders: FolderInfo[] }>('/folders')).folders
}

export async function createFolder(name: string): Promise<FolderInfo> {
  return (await request<{ folder: FolderInfo }>('/folders', { method: 'POST', body: JSON.stringify({ name }) })).folder
}

export function renameFolder(folder: string, name: string): Promise<unknown> {
  return request(`/folders/${enc(folder)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function deleteFolder(folder: string): Promise<unknown> {
  return request(`/folders/${enc(folder)}`, { method: 'DELETE' })
}

// ── Fichiers ─────────────────────────────────────────────────────────────────
export async function listFiles(folder: string): Promise<FileInfo[]> {
  return (await request<{ files: FileInfo[] }>(`/folders/${enc(folder)}/files`)).files
}

export async function createFile(folder: string, name: string, doc: ProjectDoc): Promise<FileInfo> {
  return (
    await request<{ file: FileInfo }>(`/folders/${enc(folder)}/files`, {
      method: 'POST',
      body: JSON.stringify({ name, doc }),
    })
  ).file
}

export async function loadFile(folder: string, file: string): Promise<ProjectDoc> {
  // Doc issu du réseau → repasse par le pipeline de validation (migrate → zod →
  // invariants) avant d'entrer dans le store (securite.md : tout doc non fiable est validé).
  const raw = await request<unknown>(`/files/${enc(folder)}/${enc(file)}`)
  return validateProjectDoc(raw)
}

export function saveFile(folder: string, file: string, doc: ProjectDoc): Promise<unknown> {
  return request(`/files/${enc(folder)}/${enc(file)}`, { method: 'PUT', body: JSON.stringify(doc) })
}

export function renameFile(folder: string, file: string, name: string): Promise<unknown> {
  return request(`/files/${enc(folder)}/${enc(file)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function deleteFile(folder: string, file: string): Promise<unknown> {
  return request(`/files/${enc(folder)}/${enc(file)}`, { method: 'DELETE' })
}

function enc(segment: string): string {
  return encodeURIComponent(segment)
}

// ── Fichier serveur courant (pour brancher ⌘S / menu Fichier sur l'API) ──────
// EditorView pose ce contexte au montage et le retire au démontage. useFileActions
// s'en sert pour router la sauvegarde vers l'API plutôt que File System Access.
const currentServerFile = ref<{ folder: string; file: string } | null>(null)

export function setCurrentServerFile(folder: string, file: string): void {
  currentServerFile.value = { folder, file }
}

export function clearCurrentServerFile(): void {
  currentServerFile.value = null
}

export function getCurrentServerFile(): { folder: string; file: string } | null {
  return currentServerFile.value
}

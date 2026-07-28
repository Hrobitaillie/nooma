// Ouvrir / sauver un projet : File System Access API (Chromium) + fallback download/upload
// (Firefox/Safari), détecté PAR CAPACITÉ, jamais par user-agent (donnees-json.md §Fichier).
//
// Pipeline de sécurité (securite.md §2) à CHAQUE lecture d'un fichier non fiable :
//   taille ≤ 20 Mo → JSON.parse → migrate → zod .strict() → invariants référentiels.
// Le document n'entre JAMAIS partiellement dans le store : en cas d'échec on lève, le store
// garde son état courant. Écriture atomique côté app : re-validation zod AVANT écriture
// (garde anti-corruption, securite.md §5) — on ne peut pas écrire un fichier invalide.
//
// Le handle FS Access du dernier fichier est mémorisé en IndexedDB (structured-clone), ce qui
// permet de réécrire sans re-picker. Les permissions ne sont (re)demandées que sur geste
// utilisateur (queryPermission/requestPermission déclenchés depuis un clic / ⌘S).
import type { ProjectDoc } from '@flooow/core/model/types'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { migrate } from '@flooow/core/model/migrations'
import { checkInvariants } from '@flooow/core/domain/invariants'

// Extension neutre vis-à-vis du nom de l'app (16 juil. 2026) ; les anciens
// `.flooow.json` restent ouvrables (accept inclut `.json` générique).
export const FILE_EXTENSION = '.graph.json'
/** Refus avant même le parse (securite.md §2.1). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

// ── Types File System Access API (non présents dans lib.dom pour showXxxFilePicker
//    et les permissions non standard) ────────────────────────────────────────────
interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}
interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[]
  multiple?: boolean
  excludeAcceptAllOption?: boolean
}
interface SaveFilePickerOptions {
  types?: FilePickerAcceptType[]
  suggestedName?: string
  excludeAcceptAllOption?: boolean
}
type FsPermissionMode = 'read' | 'readwrite'
interface FsPermissionDescriptor {
  mode?: FsPermissionMode
}

declare global {
  interface Window {
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
  }
  interface FileSystemFileHandle {
    queryPermission(descriptor?: FsPermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FsPermissionDescriptor): Promise<PermissionState>
  }
}

const PICKER_TYPES: FilePickerAcceptType[] = [
  { description: 'Projet Flooow', accept: { 'application/json': [FILE_EXTENSION, '.json'] } },
]

/** Erreur métier de validation (message utilisateur clair, distincte des ZodError brutes). */
export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFileError'
  }
}

// ── Capacité ────────────────────────────────────────────────────────────────────
/** Détection PAR CAPACITÉ de File System Access (jamais par user-agent). */
export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

// ── Pipeline de validation (réutilisé par autosave pour les snapshots relus) ──────
/**
 * Valide un document DÉJÀ désérialisé (objet JS inconnu) : migration → zod .strict() →
 * invariants référentiels. Lève ProjectFileError avec un message lisible en cas d'échec.
 * Utilisé aussi par io/autosave pour re-valider un snapshot IndexedDB (un autre onglet /
 * une extension a pu l'altérer — securite.md §2).
 */
export function validateProjectDoc(raw: unknown): ProjectDoc {
  let migrated: unknown
  try {
    migrated = migrate(raw)
  } catch (err) {
    throw new ProjectFileError(err instanceof Error ? err.message : 'Migration impossible.')
  }

  const result = safeParse(migrated)
  if (!result.ok) throw new ProjectFileError(result.message)
  const doc = result.doc

  const violations = checkInvariants(doc)
  if (violations.length > 0) {
    const detail = violations
      .slice(0, 5)
      .map((v) => `${v.code}${v.nodeId ? ` (${v.nodeId})` : ''} : ${v.message}`)
      .join(' | ')
    throw new ProjectFileError(
      `Document incohérent (${violations.length} violation(s) d'invariant) : ${detail}`,
    )
  }
  return doc
}

function safeParse(input: unknown): { ok: true; doc: ProjectDoc } | { ok: false; message: string } {
  try {
    return { ok: true, doc: parseProjectDoc(input) }
  } catch (err) {
    // ZodError → chemin lisible ; sinon message générique.
    const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues
    if (Array.isArray(issues) && issues.length > 0) {
      const shown = issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
        .join(' | ')
      return { ok: false, message: `Fichier projet invalide — ${shown}` }
    }
    return { ok: false, message: 'Fichier projet invalide (format non reconnu).' }
  }
}

/**
 * Valide un TEXTE brut de fichier non fiable : taille → JSON.parse → validateProjectDoc.
 */
export function validateProjectText(text: string): ProjectDoc {
  // Borne de sécurité approximative sur la charge utile (1 char ≥ 1 octet).
  if (text.length > MAX_FILE_BYTES) {
    throw new ProjectFileError('Fichier trop volumineux (> 20 Mo) : ouverture refusée.')
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ProjectFileError('Fichier illisible : JSON invalide.')
  }
  return validateProjectDoc(raw)
}

async function readFileValidated(file: File): Promise<ProjectDoc> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ProjectFileError('Fichier trop volumineux (> 20 Mo) : ouverture refusée.')
  }
  return validateProjectText(await file.text())
}

// ── Persistance du handle courant (IndexedDB) + clé de projet ─────────────────────
const HANDLE_DB = 'flooow-files'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'lastHandle'

let currentHandle: FileSystemFileHandle | null = null
let currentKey = 'projet-sans-titre'

/** Clé de projet courante (nom de fichier) — utilisée comme clé d'autosave. */
export function currentProjectKey(): string {
  return currentKey
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'))
  })
}

async function idbPut(value: unknown, key: string): Promise<void> {
  const db = await openHandleDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite')
      tx.objectStore(HANDLE_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Écriture IndexedDB échouée'))
    })
  } finally {
    db.close()
  }
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openHandleDb()
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly')
      const req = tx.objectStore(HANDLE_STORE).get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => reject(req.error ?? new Error('Lecture IndexedDB échouée'))
    })
  } finally {
    db.close()
  }
}

async function persistHandle(handle: FileSystemFileHandle): Promise<void> {
  currentHandle = handle
  currentKey = handle.name
  try {
    await idbPut(handle, HANDLE_KEY)
  } catch {
    // best-effort : la réouverture rapide est un confort, pas une exigence.
  }
}

/** Récupère (si présent) le handle du dernier fichier ouvert, sans redemander de permission. */
export async function restoreLastHandle(): Promise<FileSystemFileHandle | null> {
  if (!hasFileSystemAccess()) return null
  try {
    const handle = await idbGet<FileSystemFileHandle>(HANDLE_KEY)
    if (handle) {
      currentHandle = handle
      currentKey = handle.name
    }
    return handle
  } catch {
    return null
  }
}

async function ensurePermission(
  handle: FileSystemFileHandle,
  mode: FsPermissionMode,
): Promise<boolean> {
  // Appelé depuis un geste utilisateur (⌘S / clic) → requestPermission autorisé.
  const opts: FsPermissionDescriptor = { mode }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

// ── Ouverture ─────────────────────────────────────────────────────────────────
export interface OpenResult {
  doc: ProjectDoc
  /** nom de fichier / clé de projet (pour l'autosave). */
  name: string
}

/** Ouvre un projet : picker (ou upload en fallback) + pipeline de validation complet. */
export async function openProject(): Promise<OpenResult | null> {
  if (hasFileSystemAccess()) {
    let handles: FileSystemFileHandle[]
    try {
      handles = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
    } catch (err) {
      if (isAbort(err)) return null // l'utilisateur a annulé le picker
      throw err
    }
    const handle = handles[0]
    if (!handle) return null
    const doc = await readFileValidated(await handle.getFile())
    await persistHandle(handle)
    return { doc, name: handle.name }
  }

  // Fallback : <input type="file"> + lecture Blob.
  const file = await pickFileFallback()
  if (!file) return null
  const doc = await readFileValidated(file)
  currentHandle = null
  currentKey = file.name
  return { doc, name: file.name }
}

function pickFileFallback(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `${FILE_EXTENSION},application/json,.json`
    input.style.display = 'none'
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────
/**
 * Écrit le document dans le fichier courant (handle mémorisé) ou déclenche un download.
 * Re-valide le document (zod + invariants) AVANT écriture — garde anti-corruption.
 * Renvoie true si une écriture a bien eu lieu.
 */
export async function saveProject(doc: ProjectDoc): Promise<boolean> {
  const payload = serializeForWrite(doc)

  if (currentHandle && hasFileSystemAccess()) {
    if (!(await ensurePermission(currentHandle, 'readwrite'))) return false
    await writeToHandle(currentHandle, payload)
    return true
  }
  // Pas de handle (fallback ou premier enregistrement) → « Enregistrer sous ».
  return saveProjectAs(doc)
}

/** « Enregistrer sous » : picker de destination (ou download) + mémorisation du handle. */
export async function saveProjectAs(doc: ProjectDoc): Promise<boolean> {
  const payload = serializeForWrite(doc)
  const suggested = suggestName(doc.meta.name)

  if (hasFileSystemAccess()) {
    let handle: FileSystemFileHandle
    try {
      handle = await window.showSaveFilePicker({ types: PICKER_TYPES, suggestedName: suggested })
    } catch (err) {
      if (isAbort(err)) return false
      throw err
    }
    await writeToHandle(handle, payload)
    await persistHandle(handle)
    return true
  }

  downloadTextFile(suggested, payload, 'application/json')
  currentKey = suggested
  return true
}

/** Sérialise + RE-VALIDE (garde anti-corruption) ; horodate l'écriture. */
function serializeForWrite(doc: ProjectDoc): string {
  const stamped: ProjectDoc = {
    ...doc,
    meta: { ...doc.meta, updatedAt: new Date().toISOString().slice(0, 10) },
  }
  // Lève si le document est invalide → aucune écriture d'un fichier corrompu (securite.md §5).
  validateProjectDoc(stamped)
  return JSON.stringify(stamped, null, 2)
}

async function writeToHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(text)
  } finally {
    await writable.close()
  }
}

function suggestName(projectName: string): string {
  const slug =
    projectName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'projet'
  return `${slug}${FILE_EXTENSION}`
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// ── Download générique (réutilisé par les exports Markdown) ───────────────────────
/**
 * Enregistre un texte quelconque. Utilise showSaveFilePicker si disponible (confort),
 * sinon un download Blob. Pour les exports (Markdown), jamais de re-validation projet.
 */
export async function saveTextAs(
  filename: string,
  text: string,
  mime = 'text/plain',
): Promise<boolean> {
  if (hasFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename })
      const writable = await handle.createWritable()
      try {
        await writable.write(text)
      } finally {
        await writable.close()
      }
      return true
    } catch (err) {
      if (isAbort(err)) return false
      // en cas d'échec FS Access, on retombe sur le download.
    }
  }
  downloadTextFile(filename, text, mime)
  return true
}

export function downloadTextFile(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // libère l'URL objet au tour de boucle suivant (le download a démarré).
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

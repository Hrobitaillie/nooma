// Autosave : snapshot JSON complet en IndexedDB, debounce 2 s après la dernière mutation,
// flush immédiat sur visibilitychange:hidden, rotation des 5 derniers snapshots par projet
// (filet de sécurité anti-corruption logique — donnees-json.md §Autosave).
//
// Au boot, `findRecoverableSnapshot` propose une récupération NON destructive : si un snapshot
// est plus récent que le fichier ouvert, l'app peut proposer « Récupérer la version non
// sauvegardée ? ». Jamais d'écrasement silencieux dans un sens ou l'autre.
//
// Sécurité : chaque snapshot relu est repassé dans le MÊME pipeline de validation que les
// fichiers (un autre onglet / une extension a pu altérer IndexedDB — securite.md §2). Un
// snapshot invalide est ignoré (et purgé), jamais injecté dans le store.
import { watch } from 'vue'
import type { ProjectDoc } from '@flooow/core/model/types'
import { useProjectStore } from '@/stores/project'
import { currentProjectKey, validateProjectDoc } from './file'

export const AUTOSAVE_DEBOUNCE_MS = 2000
export const SNAPSHOT_ROTATION = 5

export interface Snapshot {
  doc: ProjectDoc
  savedAt: string // ISO complet (horloge murale)
}

interface SnapshotRecord {
  id?: number
  key: string
  doc: ProjectDoc
  savedAt: string
}

// ── IndexedDB ────────────────────────────────────────────────────────────────────
const DB_NAME = 'flooow-autosave'
const STORE = 'snapshots'
const KEY_INDEX = 'byKey'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex(KEY_INDEX, 'key', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'))
  })
}

function readAllForKey(db: IDBDatabase, key: string): Promise<SnapshotRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const index = tx.objectStore(STORE).index(KEY_INDEX)
    const req = index.getAll(IDBKeyRange.only(key))
    req.onsuccess = () => resolve((req.result as SnapshotRecord[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error('Lecture snapshots échouée'))
  })
}

// ── Écriture d'un snapshot + rotation ─────────────────────────────────────────────
/**
 * Écrit un snapshot immédiat pour `key`, puis purge les plus anciens au-delà de la rotation.
 * Best-effort : une erreur IndexedDB ne casse jamais l'édition en cours (log + retour).
 */
export async function saveSnapshot(doc: ProjectDoc, key: string): Promise<void> {
  const record: SnapshotRecord = { key, doc, savedAt: new Date().toISOString() }
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch (err) {
    console.warn('[Flooow] autosave indisponible', err)
    return
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Écriture snapshot échouée'))
    })
    await rotate(db, key)
  } catch (err) {
    console.warn('[Flooow] snapshot non enregistré', err)
  } finally {
    db.close()
  }
}

async function rotate(db: IDBDatabase, key: string): Promise<void> {
  const records = (await readAllForKey(db, key)).sort(byIdAsc)
  const surplus = records.length - SNAPSHOT_ROTATION
  if (surplus <= 0) return
  const doomed = records.slice(0, surplus)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const r of doomed) if (r.id != null) store.delete(r.id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Rotation snapshots échouée'))
  })
}

function byIdAsc(a: SnapshotRecord, b: SnapshotRecord): number {
  return (a.id ?? 0) - (b.id ?? 0)
}

// ── Lecture / récupération ─────────────────────────────────────────────────────
/**
 * Liste les snapshots conservés (du plus récent au plus ancien), en ne renvoyant que ceux qui
 * RE-VALIDENT (pipeline fichier). Les enregistrements corrompus sont ignorés silencieusement.
 */
export async function listSnapshots(key: string): Promise<Snapshot[]> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return []
  }
  try {
    const records = (await readAllForKey(db, key)).sort(byIdAsc).reverse()
    const out: Snapshot[] = []
    for (const r of records) {
      try {
        out.push({ doc: validateProjectDoc(r.doc), savedAt: r.savedAt })
      } catch {
        // snapshot altéré → ignoré (securite.md §2 : même pipeline que les fichiers).
      }
    }
    return out
  } finally {
    db.close()
  }
}

/** Snapshot valide le plus récent pour `key`, ou null. */
export async function loadLatestSnapshot(key: string): Promise<Snapshot | null> {
  const all = await listSnapshots(key)
  return all[0] ?? null
}

/**
 * Récupération au boot : renvoie le snapshot le plus récent SI il est strictement plus récent
 * que la référence donnée (updatedAt du fichier ouvert, ou lastModified). Sans référence, tout
 * snapshot présent est proposé. À l'app d'afficher la proposition — jamais d'application auto.
 */
export async function findRecoverableSnapshot(
  key: string,
  reference?: string | number | Date,
): Promise<Snapshot | null> {
  const latest = await loadLatestSnapshot(key)
  if (!latest) return null
  if (reference == null) return latest
  const refMs = new Date(reference).getTime()
  const snapMs = new Date(latest.savedAt).getTime()
  if (Number.isNaN(refMs) || Number.isNaN(snapMs)) return latest
  return snapMs > refMs ? latest : null
}

/** Purge tous les snapshots d'un projet (après enregistrement fichier réussi, si souhaité). */
export async function clearSnapshots(key: string): Promise<void> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return
  }
  try {
    const records = await readAllForKey(db, key)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const r of records) if (r.id != null) store.delete(r.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Purge snapshots échouée'))
    })
  } finally {
    db.close()
  }
}

// ── Démarrage de l'autosave (watch + debounce + flush) ────────────────────────────
export interface AutosaveOptions {
  /** Clé de projet à utiliser (défaut : io/file.currentProjectKey). */
  key?: () => string
  /** Délai de debounce en ms (défaut : 2000). */
  debounceMs?: number
}

/**
 * Démarre l'autosave : à chaque mutation du graphe (graphVersion), planifie un snapshot après
 * `debounceMs`. Flush immédiat quand l'onglet passe en arrière-plan. Renvoie une fonction d'arrêt.
 *
 * À appeler une fois Pinia active (ex. App.vue onMounted).
 */
export function startAutosave(options: AutosaveOptions = {}): () => void {
  const project = useProjectStore()
  const getKey = options.key ?? currentProjectKey
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS

  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void saveSnapshot(project.serialize(), getKey())
    }, debounceMs)
  }

  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    // Ne snapshot que s'il y a des changements non sauvegardés.
    if (project.dirty) void saveSnapshot(project.serialize(), getKey())
  }

  const stopWatch = watch(
    () => project.graphVersion,
    () => schedule(),
  )

  function onVisibility(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  return () => {
    stopWatch()
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}

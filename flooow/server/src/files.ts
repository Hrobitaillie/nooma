// Couche de stockage des projets sur disque : <dataDir>/<folder>/<file>.graph.json.
// (Extension neutre vis-à-vis du nom de l'app — décision du 16 juil. 2026.)
// Sécurité : slugs validés par regex + garde anti-path-traversal (le chemin résolu
// doit rester sous dataDir), écriture atomique (temp + rename), borne de taille.
import { promises as fs } from 'node:fs'
import { resolve, sep } from 'node:path'
import { config } from './config.js'

export const FILE_EXT = '.graph.json'
export const MAX_BYTES = 20 * 1024 * 1024

/** Slug filesystem-safe : minuscule, commence par alphanum, puis alphanum/tirets. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/** Erreur HTTP portée jusqu'au handler Hono (statut + code + message utilisateur). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface FolderInfo {
  slug: string
  name: string
  fileCount: number
  updatedAt: string | null
  /** URL Portulan des docs du site quand le dossier est un lien vers un site bao, sinon null. */
  docsUrl: string | null
}
export interface FileInfo {
  slug: string
  name: string
  projectName: string | null
  size: number
  updatedAt: string
}

/** Dérive un slug d'un nom libre (accents retirés, non-alphanum → tiret). */
export function slugify(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function assertSlug(slug: string, kind: 'dossier' | 'fichier'): void {
  if (!SLUG_RE.test(slug)) {
    throw new HttpError(400, 'invalid_slug', `Identifiant de ${kind} invalide : « ${slug} ».`)
  }
}

const ROOT = resolve(config.dataDir)

/**
 * URL Portulan des docs du site quand le dossier de projets est un lien symbolique vers le
 * `docs/.graph` d'un site bao (`/srv/<env>/<slug>/docs/.graph`) ; null sinon. Le narratif du
 * cadrage (md publiés) vit à côté du graphe — c'est le lien « Documentation » de l'app.
 */
const SITE_TARGET_RE = /^\/srv\/(dev|preprod|tma)\/([a-z0-9][a-z0-9-]*)\/docs\/\.graph\/?$/
const ENV_URL_PREFIX: Record<string, string> = { dev: 'd', preprod: 'p', tma: 't' }

async function docsUrlOf(dir: string): Promise<string | null> {
  const st = await fs.lstat(dir).catch(() => null)
  if (!st?.isSymbolicLink()) return null
  const target = await fs.readlink(dir).catch(() => null)
  if (!target) return null
  const m = SITE_TARGET_RE.exec(resolve(target))
  if (!m) return null
  const [, env, slug] = m
  return `https://${slug}--docs.${ENV_URL_PREFIX[env!]}.pilot-in.net`
}

/** Garde anti-traversal : refuse tout chemin résolu qui sort de dataDir. */
function ensureInside(p: string): void {
  if (p !== ROOT && !p.startsWith(ROOT + sep)) {
    throw new HttpError(400, 'path_escape', 'Chemin hors du répertoire de données.')
  }
}

function folderPath(folder: string): string {
  assertSlug(folder, 'dossier')
  const p = resolve(ROOT, folder)
  ensureInside(p)
  return p
}

function filePath(folder: string, file: string): string {
  assertSlug(folder, 'dossier')
  assertSlug(file, 'fichier')
  const p = resolve(ROOT, folder, file + FILE_EXT)
  ensureInside(p)
  return p
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Écriture atomique : temp dans le même dossier puis rename (rename atomique intra-fs). */
async function atomicWrite(path: string, text: string): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf(sep))
  const tmp = `${dir}${sep}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp, text, 'utf8')
  try {
    await fs.rename(tmp, path)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
}

/** Sérialise un doc client (objet) après contrôles minimaux (objet + taille). */
function serializeDoc(doc: unknown): string {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new HttpError(400, 'invalid_doc', 'Le document doit être un objet JSON.')
  }
  let text: string
  try {
    text = JSON.stringify(doc, null, 2)
  } catch {
    throw new HttpError(400, 'invalid_doc', 'Document non sérialisable en JSON.')
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw new HttpError(413, 'too_large', 'Document trop volumineux (> 20 Mo).')
  }
  return text
}

/** Lit best-effort le nom de projet (meta.name) d'un .graph.json. */
function readProjectName(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { meta?: { name?: unknown } }
    const n = parsed?.meta?.name
    return typeof n === 'string' ? n : null
  } catch {
    return null
  }
}

// ── Dossiers ──────────────────────────────────────────────────────────────────

export async function listFolders(): Promise<FolderInfo[]> {
  await fs.mkdir(ROOT, { recursive: true })
  const entries = await fs.readdir(ROOT, { withFileTypes: true })
  const out: FolderInfo[] = []
  for (const e of entries) {
    if (!SLUG_RE.test(e.name)) continue
    const dir = resolve(ROOT, e.name)
    // Un dossier de projet peut être un lien symbolique vers le docs/.flooow d'un
    // site bao (cadrage rangé chez le projet) : Dirent.isDirectory() est faux pour
    // un lien, on suit donc via stat. Lien cassé (site déplacé) → ignoré.
    const st = await fs.stat(dir).catch(() => null)
    if (!st?.isDirectory()) continue
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(FILE_EXT))
    let updatedAt: string | null = null
    for (const f of files) {
      const st = await fs.stat(resolve(dir, f))
      const iso = st.mtime.toISOString()
      if (!updatedAt || iso > updatedAt) updatedAt = iso
    }
    out.push({ slug: e.name, name: e.name, fileCount: files.length, updatedAt, docsUrl: await docsUrlOf(dir) })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function createFolder(name: string): Promise<FolderInfo> {
  const slug = slugify(name)
  if (!slug) throw new HttpError(400, 'invalid_slug', 'Nom de dossier vide.')
  const p = folderPath(slug)
  if (await exists(p)) throw new HttpError(409, 'conflict', `Le dossier « ${slug} » existe déjà.`)
  await fs.mkdir(p, { recursive: true })
  return { slug, name: slug, fileCount: 0, updatedAt: null, docsUrl: null }
}

export async function renameFolder(folder: string, newName: string): Promise<FolderInfo> {
  const src = folderPath(folder)
  if (!(await exists(src))) throw new HttpError(404, 'not_found', 'Dossier introuvable.')
  const slug = slugify(newName)
  if (!slug) throw new HttpError(400, 'invalid_slug', 'Nom de dossier vide.')
  const dst = folderPath(slug)
  if (slug !== folder && (await exists(dst)))
    throw new HttpError(409, 'conflict', `Le dossier « ${slug} » existe déjà.`)
  await fs.rename(src, dst)
  const files = (await fs.readdir(dst)).filter((f) => f.endsWith(FILE_EXT))
  return { slug, name: slug, fileCount: files.length, updatedAt: null, docsUrl: await docsUrlOf(dst) }
}

export async function deleteFolder(folder: string): Promise<void> {
  const p = folderPath(folder)
  const st = await fs.lstat(p).catch(() => null)
  if (!st) throw new HttpError(404, 'not_found', 'Dossier introuvable.')
  // Dossier lié à un site : on retire le LIEN, jamais le contenu du site derrière.
  if (st.isSymbolicLink()) {
    await fs.unlink(p)
    return
  }
  await fs.rm(p, { recursive: true, force: true })
}

// ── Fichiers ──────────────────────────────────────────────────────────────────

export async function listFiles(folder: string): Promise<FileInfo[]> {
  const dir = folderPath(folder)
  if (!(await exists(dir))) throw new HttpError(404, 'not_found', 'Dossier introuvable.')
  const names = (await fs.readdir(dir)).filter((f) => f.endsWith(FILE_EXT))
  const out: FileInfo[] = []
  for (const fname of names) {
    const slug = fname.slice(0, -FILE_EXT.length)
    if (!SLUG_RE.test(slug)) continue
    const full = resolve(dir, fname)
    const st = await fs.stat(full)
    const text = await fs.readFile(full, 'utf8').catch(() => '')
    out.push({
      slug,
      name: slug,
      projectName: readProjectName(text),
      size: st.size,
      updatedAt: st.mtime.toISOString(),
    })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Renvoie le texte JSON brut du fichier (pour renvoi tel quel). */
export async function readFileRaw(folder: string, file: string): Promise<string> {
  const p = filePath(folder, file)
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    throw new HttpError(404, 'not_found', 'Fichier introuvable.')
  }
}

export async function writeFile(folder: string, file: string, doc: unknown): Promise<string> {
  const dir = folderPath(folder)
  if (!(await exists(dir))) throw new HttpError(404, 'not_found', 'Dossier introuvable.')
  const p = filePath(folder, file)
  const text = serializeDoc(doc)
  await atomicWrite(p, text)
  const st = await fs.stat(p)
  return st.mtime.toISOString()
}

export async function createFile(folder: string, name: string, doc: unknown): Promise<FileInfo> {
  const dir = folderPath(folder)
  if (!(await exists(dir))) throw new HttpError(404, 'not_found', 'Dossier introuvable.')
  const slug = slugify(name)
  if (!slug) throw new HttpError(400, 'invalid_slug', 'Nom de projet vide.')
  const p = filePath(folder, slug)
  if (await exists(p)) throw new HttpError(409, 'conflict', `Le projet « ${slug} » existe déjà.`)
  const text = serializeDoc(doc)
  await atomicWrite(p, text)
  const st = await fs.stat(p)
  return {
    slug,
    name: slug,
    projectName: readProjectName(text),
    size: st.size,
    updatedAt: st.mtime.toISOString(),
  }
}

export async function renameFile(folder: string, file: string, newName: string): Promise<FileInfo> {
  const src = filePath(folder, file)
  if (!(await exists(src))) throw new HttpError(404, 'not_found', 'Fichier introuvable.')
  const slug = slugify(newName)
  if (!slug) throw new HttpError(400, 'invalid_slug', 'Nom de projet vide.')
  const dst = filePath(folder, slug)
  if (slug !== file && (await exists(dst)))
    throw new HttpError(409, 'conflict', `Le projet « ${slug} » existe déjà.`)
  await fs.rename(src, dst)
  const st = await fs.stat(dst)
  const text = await fs.readFile(dst, 'utf8').catch(() => '')
  return {
    slug,
    name: slug,
    projectName: readProjectName(text),
    size: st.size,
    updatedAt: st.mtime.toISOString(),
  }
}

export async function deleteFile(folder: string, file: string): Promise<void> {
  const p = filePath(folder, file)
  if (!(await exists(p))) throw new HttpError(404, 'not_found', 'Fichier introuvable.')
  await fs.rm(p, { force: true })
}

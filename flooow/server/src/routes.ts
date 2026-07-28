// Routes REST fichiers/dossiers (montées sous /api). Identité sur tout /api,
// écritures réservées aux rôles dev/marin (client = lecture seule).
import { Hono } from 'hono'
import type { Context } from 'hono'
import { identityFromRequest, canWrite, type Identity } from './auth.js'
import { applyAgentOps } from './agent.js'
import { relayProxyRequest } from './proxy.js'
import * as store from './files.js'
import { HttpError, MAX_BYTES } from './files.js'
import { listUsers } from './users.js'

type Env = { Variables: { identity: Identity } }

export const api = new Hono<Env>()

// Identité sur toutes les routes /api.
api.use('*', async (c, next) => {
  c.set('identity', identityFromRequest(c))
  await next()
})

function requireWrite(c: Context<Env>): void {
  if (!canWrite(c.get('identity'))) {
    throw new HttpError(403, 'forbidden', 'Lecture seule (rôle client).')
  }
}

/** Lit un corps JSON avec borne de taille (413) et message clair si invalide (400). */
async function readJson<T = Record<string, unknown>>(c: Context<Env>): Promise<T> {
  const len = Number(c.req.header('content-length') ?? 0)
  if (len > MAX_BYTES) throw new HttpError(413, 'too_large', 'Corps trop volumineux (> 20 Mo).')
  try {
    return (await c.req.json()) as T
  } catch {
    throw new HttpError(400, 'invalid_json', 'Corps JSON invalide.')
  }
}

// ── Session ─────────────────────────────────────────────────────────────────
function sessionPayload(c: Context<Env>) {
  const id = c.get('identity')
  return { ...id, canWrite: canWrite(id) }
}
api.get('/session', (c) => c.json(sessionPayload(c)))
api.get('/whoami', (c) => c.json(sessionPayload(c))) // alias historique

// ── Annuaire (mentions « @ ») ───────────────────────────────────────────────
// Lecture ouverte à tous les rôles : un client qui ouvre un doc doit voir à qui renvoient les
// mentions déjà écrites. Ne sont exposés que nom/email/rôle des Pilot'In internes actifs.
api.get('/users', async (c) => c.json({ users: await listUsers() }))

// ── Dossiers ────────────────────────────────────────────────────────────────
api.get('/folders', async (c) => c.json({ folders: await store.listFolders() }))

api.post('/folders', async (c) => {
  requireWrite(c)
  const { name } = await readJson<{ name: string }>(c)
  return c.json({ folder: await store.createFolder(name) }, 201)
})

api.patch('/folders/:folder', async (c) => {
  requireWrite(c)
  const { name } = await readJson<{ name: string }>(c)
  return c.json({ folder: await store.renameFolder(c.req.param('folder'), name) })
})

api.delete('/folders/:folder', async (c) => {
  requireWrite(c)
  await store.deleteFolder(c.req.param('folder'))
  return c.body(null, 204)
})

// ── Fichiers d'un dossier ─────────────────────────────────────────────────────
api.get('/folders/:folder/files', async (c) =>
  c.json({ files: await store.listFiles(c.req.param('folder')) }),
)

api.post('/folders/:folder/files', async (c) => {
  requireWrite(c)
  const { name, doc } = await readJson<{ name: string; doc: unknown }>(c)
  return c.json({ file: await store.createFile(c.req.param('folder'), name, doc) }, 201)
})

// ── Un fichier ────────────────────────────────────────────────────────────────
api.get('/files/:folder/:file', async (c) => {
  const raw = await store.readFileRaw(c.req.param('folder'), c.req.param('file'))
  // Les fils « pour Claude » (v13) sont réservés aux membres Pilot'in : un rôle `client` ne doit
  // pas les recevoir, même en lisant le fichier brut — le filtrage d'affichage de l'app ne protège
  // pas contre un GET direct. Ici le transport le permet, donc on filtre ; la room Y.Doc, elle, ne
  // sait pas servir un document différent par connexion (CRDT partagé) — côté room, les gardes
  // sont la lecture seule du rôle client et le masquage app.
  if (c.get('identity').role === 'client') {
    try {
      const doc = JSON.parse(raw) as { comments?: { forClaude?: boolean }[] }
      if (Array.isArray(doc.comments)) {
        doc.comments = doc.comments.filter((cm) => cm?.forClaude !== true)
        return c.json(doc)
      }
    } catch {
      /* JSON illisible : rendre le brut, la validation côté client tranchera */
    }
  }
  return c.body(raw, 200, { 'content-type': 'application/json; charset=utf-8' })
})

api.put('/files/:folder/:file', async (c) => {
  requireWrite(c)
  const doc = await readJson<unknown>(c)
  const updatedAt = await store.writeFile(c.req.param('folder'), c.req.param('file'), doc)
  return c.json({ ok: true, updatedAt })
})

api.patch('/files/:folder/:file', async (c) => {
  requireWrite(c)
  const { name } = await readJson<{ name: string }>(c)
  return c.json({ file: await store.renameFile(c.req.param('folder'), c.req.param('file'), name) })
})

api.delete('/files/:folder/:file', async (c) => {
  requireWrite(c)
  await store.deleteFile(c.req.param('folder'), c.req.param('file'))
  return c.body(null, 204)
})

// ── Ops agent (pivot agentique) : écriture par lot d'opérations via le Y.Doc ──
// Corps : { ops: AgentOp[] } (vocabulaire : @flooow/core/agent/ops). Atomique :
// 400 avec le message de l'op fautif si le lot est invalide, sinon { ok, report }.
api.post('/agent/:folder/:file/ops', async (c) => {
  requireWrite(c)
  const { ops } = await readJson<{ ops: unknown }>(c)
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new HttpError(400, 'invalid_ops', 'Corps attendu : { ops: [ … ] } (lot non vide).')
  }
  const report = await applyAgentOps(
    c.req.param('folder'),
    c.req.param('file'),
    ops as Parameters<typeof applyAgentOps>[2],
    c.get('identity').id,
  )
  return c.json({ ok: true, report })
})

// ── Console d'essai des API externes (vue API de l'app) ──────────────────────
// Relaye une requête vers un service tiers du cadrage : le navigateur ne peut pas
// les appeler en direct (CORS). Les headers transmis au tiers sont EXCLUSIVEMENT
// ceux fournis dans le corps : rien des headers AuthCrunch entrants ne fuit.
// L'anti-SSRF (résolution DNS validée + connexion épinglée) vit dans proxy.ts.
const PROXY_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const STRIPPED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding'])

api.post('/proxy', async (c) => {
  requireWrite(c)
  const { method, url, headers, body } = await readJson<{
    method?: string
    url?: string
    headers?: Record<string, unknown>
    body?: string | null
  }>(c)

  const m = String(method ?? 'GET').toUpperCase()
  if (!PROXY_METHODS.has(m)) {
    throw new HttpError(400, 'invalid_method', `Méthode « ${method} » non autorisée.`)
  }
  let target: URL
  try {
    target = new URL(String(url ?? ''))
  } catch {
    throw new HttpError(400, 'invalid_url', 'URL invalide.')
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new HttpError(400, 'invalid_url', 'Seuls http et https sont autorisés.')
  }

  const outHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k && typeof v === 'string' && !STRIPPED_HEADERS.has(k.toLowerCase())) outHeaders[k] = v
  }

  const bodyOut = typeof body === 'string' && m !== 'GET' && m !== 'HEAD' ? body : null
  return c.json(await relayProxyRequest(m, target, outHeaders, bodyOut))
})

// ── Gestion d'erreurs uniforme : { error: { code, message } } ─────────────────
api.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400)
  }
  console.error('[flooow-server] erreur non gérée', err)
  return c.json({ error: { code: 'internal', message: 'Erreur interne.' } }, 500)
})

// Console d'essai des API externes du cadrage (vue API). Construit les requêtes,
// applique l'auth mémorisée par service et relaie via POST /api/proxy — le
// navigateur ne peut pas appeler les API tierces en direct (CORS).
//
// ⚠️ Les secrets saisis (jetons, clés, mots de passe) restent dans le localStorage
// du NAVIGATEUR, jamais dans le document collaboratif : le .graph.json est partagé
// entre tous les participants et sauvé côté serveur.

export type AuthScheme = 'none' | 'bearer' | 'basic' | 'header' | 'query'

export interface ServiceAuth {
  scheme: AuthScheme
  /** Nom du header (`header`), du paramètre de query (`query`) ou identifiant (`basic`). */
  name: string
  /** Jeton, clé ou mot de passe. */
  value: string
}

export interface PreparedRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
}

/** Réponse du tiers, relayée par POST /api/proxy (le statut tiers est DANS le corps). */
export interface ProxyResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  truncated: boolean
  durationMs: number
}

export function emptyAuth(): ServiceAuth {
  return { scheme: 'none', name: '', value: '' }
}

// ── Persistance de l'auth par service (localStorage) ─────────────────────────
const STORAGE_PREFIX = 'flooow.api-auth.'
const SCHEMES: readonly AuthScheme[] = ['none', 'bearer', 'basic', 'header', 'query']

export function loadAuth(serviceId: string): ServiceAuth {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + serviceId)
    if (!raw) return emptyAuth()
    const parsed = JSON.parse(raw) as Partial<ServiceAuth>
    if (!SCHEMES.includes(parsed.scheme as AuthScheme)) return emptyAuth()
    return {
      scheme: parsed.scheme as AuthScheme,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      value: typeof parsed.value === 'string' ? parsed.value : '',
    }
  } catch {
    return emptyAuth()
  }
}

export function saveAuth(serviceId: string, auth: ServiceAuth): void {
  try {
    if (auth.scheme === 'none' && !auth.name && !auth.value) {
      localStorage.removeItem(STORAGE_PREFIX + serviceId)
    } else {
      localStorage.setItem(STORAGE_PREFIX + serviceId, JSON.stringify(auth))
    }
  } catch {
    /* stockage plein ou interdit : l'essai marche quand même, sans mémorisation */
  }
}

// ── Construction de la requête ────────────────────────────────────────────────
/**
 * Joint l'URL de base du service et le chemin d'un endpoint. Un chemin déjà
 * absolu (http…) est pris tel quel ; la query du chemin est préservée.
 */
export function joinUrl(baseUrl: string, path: string): string {
  const p = path.trim()
  if (/^https?:\/\//i.test(p)) return p
  const base = baseUrl.trim()
  if (!base) return p
  if (!p) return base
  return `${base.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}`
}

/** Applique l'auth à une requête : header ou paramètre de query selon le schéma. */
export function applyAuth(req: PreparedRequest, auth: ServiceAuth): PreparedRequest {
  const out: PreparedRequest = { ...req, headers: { ...req.headers } }
  switch (auth.scheme) {
    case 'bearer':
      if (auth.value) out.headers['Authorization'] = `Bearer ${auth.value}`
      break
    case 'basic':
      if (auth.name || auth.value) {
        out.headers['Authorization'] = `Basic ${btoa(`${auth.name}:${auth.value}`)}`
      }
      break
    case 'header':
      if (auth.value) out.headers[auth.name || 'X-Api-Key'] = auth.value
      break
    case 'query':
      if (auth.value) {
        const sep = out.url.includes('?') ? '&' : '?'
        out.url += `${sep}${encodeURIComponent(auth.name || 'api_key')}=${encodeURIComponent(auth.value)}`
      }
      break
    case 'none':
      break
  }
  return out
}

/** Parse un bloc « Nom: valeur » par ligne (headers additionnels de la console). */
export function parseHeaderLines(text: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const name = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim()
    if (name) headers[name] = value
  }
  return headers
}

/** Snippet curl équivalent (secrets INCLUS : c'est le but — à coller dans un terminal). */
export function buildCurl(req: PreparedRequest): string {
  const sq = (s: string): string => s.replaceAll("'", `'\\''`)
  const parts = [`curl -X ${req.method} '${sq(req.url)}'`]
  for (const [name, value] of Object.entries(req.headers)) {
    parts.push(`-H '${sq(`${name}: ${value}`)}'`)
  }
  if (req.body != null && req.body !== '') parts.push(`-d '${sq(req.body)}'`)
  return parts.join(' \\\n  ')
}

// ── Envoi via le proxy serveur ────────────────────────────────────────────────
export async function sendRequest(req: PreparedRequest): Promise<ProxyResponse> {
  let res: Response
  try {
    res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new Error('Serveur Flooow injoignable.')
  }
  const data = (await res.json().catch(() => null)) as
    | (ProxyResponse & { error?: { message?: string } })
    | null
  if (!res.ok || !data) {
    throw new Error(data?.error?.message ?? `Erreur ${res.status}.`)
  }
  return data
}

/** Corps de réponse mis en forme : JSON réindenté si c'en est, sinon tel quel. */
export function prettyBody(body: string): string {
  const t = body.trim()
  if (!t || !(t.startsWith('{') || t.startsWith('['))) return body
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return body
  }
}

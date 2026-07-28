// Identité de l'utilisateur, dérivée des headers injectés par le Caddy hôte
// (AuthCrunch) APRÈS authentification. Le serveur Node ne fait AUCUNE auth
// lui-même : il fait confiance aux headers, qui ne sont atteignables que via
// Caddy (le port brut est derrière le pare-feu — cf config.host).
//
// ⚠️ Les noms exacts des headers AuthCrunch seront figés au jalon « câblage
// container » en inspectant une vraie requête. En attendant on lit une liste de
// candidats usuels (portail AuthCrunch / claims JWT) avec repli propre.
import type { Context } from 'hono'

/** Rôles bao AuthCrunch. `client` = lecture seule ; `dev`/`marin` = écriture. */
export type Role = 'dev' | 'marin' | 'client'

export interface Identity {
  /** Identifiant stable (email si dispo, sinon login). Sert de clé d'awareness. */
  id: string
  /** Nom affiché (bulle de présence, curseurs). */
  name: string
  email: string | null
  role: Role
  /** URL d'avatar (claim `picture` Google), si AuthCrunch l'injecte ; sinon null. */
  avatar: string | null
  /** true si l'identité vient réellement des headers (false = anonyme/dev). */
  authenticated: boolean
}

// Candidats de headers, du plus spécifique au plus générique.
// AuthCrunch (Caddy security) fait `inject headers with claims` → X-Token-Subject,
// X-Token-User-Name, X-Token-User-Email, X-Token-User-Roles (vérifié dans le
// Caddyfile hôte : `authorize with sites_policy` sur *.d/p/t.pilot-in.net).
const SUBJECT_HEADERS = ['x-token-subject', 'x-token-user-id', 'x-token-id']
const NAME_HEADERS = ['x-token-user-name', 'x-token-user-login', 'x-user', 'remote-user']
const EMAIL_HEADERS = ['x-token-user-email', 'x-user-email', 'x-forwarded-email']
const ROLE_HEADERS = ['x-token-user-roles', 'x-token-user-role', 'x-user-roles', 'x-roles']
// Avatar : injecté seulement si AuthCrunch expose le claim `picture` (à confirmer côté Caddy hôte).
const PICTURE_HEADERS = ['x-token-picture', 'x-token-user-picture', 'x-token-avatar', 'x-token-user-avatar']

/** Accès générique à un header par nom (Hono, Headers WHATWG, upgrade WS…). */
export type HeaderGetter = (name: string) => string | null | undefined

function firstHeaderFrom(get: HeaderGetter, names: readonly string[]): string | null {
  for (const n of names) {
    const v = get(n)
    if (v && v.trim().length > 0) return v.trim()
  }
  return null
}

/**
 * Normalise les rôles vers un Role. AuthCrunch renvoie des rôles NAMESPACÉS et multiples,
 * ex. "authp/authp/user pilotin/dev authp/admin" → on éclate sur tout non-lettre et on
 * cherche le token `dev`/`marin` (sinon un vrai dev serait classé `client` = lecture seule).
 */
function normalizeRole(raw: string | null): Role {
  if (!raw) return 'client' // défaut le plus restrictif
  const tokens = raw.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (tokens.includes('dev')) return 'dev'
  if (tokens.includes('marin')) return 'marin'
  return 'client'
}

/** Extrait l'identité depuis un accès générique aux headers. Repli anonyme si aucun header d'auth. */
export function identityFromHeaders(get: HeaderGetter): Identity {
  const subject = firstHeaderFrom(get, SUBJECT_HEADERS)
  const name = firstHeaderFrom(get, NAME_HEADERS)
  const email = firstHeaderFrom(get, EMAIL_HEADERS)
  const role = normalizeRole(firstHeaderFrom(get, ROLE_HEADERS))
  const avatar = firstHeaderFrom(get, PICTURE_HEADERS)

  if (!subject && !name && !email) {
    // Aucun header d'auth : contexte hors-Caddy (dev local direct sur le port).
    return {
      id: 'anonyme',
      name: 'Anonyme',
      email: null,
      role: 'dev', // en dev direct on ne bride pas ; en prod Caddy fournit toujours l'auth
      avatar: null,
      authenticated: false,
    }
  }

  // Id stable : sujet JWT en priorité, puis email, puis nom.
  const id = subject ?? email ?? name ?? 'inconnu'
  return {
    id,
    name: name ?? email ?? 'Utilisateur',
    email,
    role,
    avatar,
    authenticated: true,
  }
}

/** Extrait l'identité d'une requête Hono. */
export function identityFromRequest(c: Context): Identity {
  return identityFromHeaders((n) => c.req.header(n) ?? null)
}

/** Peut écrire ? `client` est en lecture seule. */
export function canWrite(identity: Identity): boolean {
  return identity.role === 'dev' || identity.role === 'marin'
}

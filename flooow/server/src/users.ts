// Annuaire des utilisateurs Pilot'In, source des mentions « @ » de l'éditeur riche.
//
// ── Pourquoi bao ──────────────────────────────────────────────────────────────────────────────────
// Flooow n'a pas de base d'utilisateurs : l'identité du visiteur vient déjà d'AuthCrunch via les
// headers Caddy (cf auth.ts). L'annuaire tape donc la MÊME source, la CLI `bao user`, pour que
// mentionner quelqu'un et le voir dans les bulles de présence désignent la même personne.
//
// On passe par la CLI et NON par /srv/system/bao/caddy/users.json : ce fichier est le store
// AuthCrunch, il contient les hashes de mots de passe. `bao user list --json` expose exactement ce
// qu'il nous faut, et rien de secret — aucune raison de mettre un hash à portée d'un process HTTP.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Role } from './auth.js'

const run = promisify(execFile)

export interface DirectoryUser {
  /**
   * UUID bao. PERSISTÉ dans les documents (attribut du node `mention`), d'où le choix de l'id opaque
   * plutôt que de l'email : un email change quand quelqu'un change de nom, l'UUID non — les mentions
   * déjà écrites continueraient de résoudre.
   */
  id: string
  name: string
  email: string | null
  role: Role
}

/** Une entrée de `bao user list --json`. `lastSeen` existe aussi mais ne nous sert pas. */
interface BaoUser {
  id?: unknown
  email?: unknown
  name?: unknown
  role?: unknown
  active?: unknown
}

/** Durée de cache : l'annuaire bouge à l'échelle du mois, un process peut vivre des semaines. */
const TTL_MS = 10 * 60 * 1000
/** Garde-fou : un `bao` qui pend ne doit pas retenir une requête HTTP. */
const TIMEOUT_MS = 5_000

let cache: { at: number; users: DirectoryUser[] } | null = null
let inflight: Promise<DirectoryUser[]> | null = null

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Ne retient QUE les Pilot'In internes actifs (dev/marin) : les comptes `client` sont des externes,
 * ils n'ont rien à faire dans les mentions d'un cadrage. Tolérant aux champs manquants — la CLI reste
 * un outil interne, un ajout de champ ne doit pas faire tomber l'annuaire.
 */
export function parseUserList(stdout: string): DirectoryUser[] {
  const raw: unknown = JSON.parse(stdout)
  if (!Array.isArray(raw)) return []

  const users: DirectoryUser[] = []
  for (const entry of raw as BaoUser[]) {
    if (entry?.active !== true) continue
    const role = str(entry.role)
    if (role !== 'dev' && role !== 'marin') continue
    const id = str(entry.id)
    const email = str(entry.email)
    // Sans id stable, une mention ne pourrait pas résoudre : on préfère omettre l'entrée.
    if (!id) continue
    users.push({ id, name: str(entry.name) ?? email ?? id, email, role })
  }
  return users.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

async function load(): Promise<DirectoryUser[]> {
  try {
    const { stdout } = await run('bao', ['user', 'list', '--json'], { timeout: TIMEOUT_MS })
    return parseUserList(stdout)
  } catch (err) {
    // bao absent (dev hors machine bao), non autorisé, ou sortie illisible : annuaire vide. Le menu
    // « @ » ne proposera personne, le reste de l'éditeur fonctionne — jamais d'erreur à l'appelant.
    console.warn('[flooow-server] annuaire bao indisponible', err)
    return []
  }
}

/** Annuaire, avec cache TTL et déduplication des appels concurrents. */
export async function listUsers(): Promise<DirectoryUser[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.users
  if (inflight) return inflight
  inflight = load()
    .then((users) => {
      // Un échec est caché comme un succès vide : ça évite de rappeler bao à chaque frappe, et le
      // TTL laissera réessayer de toute façon.
      cache = { at: Date.now(), users }
      return users
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

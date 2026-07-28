// Configuration du serveur, lue depuis l'environnement (voir .env.example).
// Aucune valeur secrète ici : l'auth est portée par le Caddy hôte (AuthCrunch).
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Racine du DÉPÔT (server/src → ../..), pour des défauts indépendants du cwd. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function env(name: string, fallback: string): string {
  const v = process.env[name]
  return v && v.length > 0 ? v : fallback
}

export const config = {
  /** Port d'écoute du serveur Node sur l'hôte. Le container Caddy y proxy via
   *  host.containers.internal:<port> (cf .caddy-upstream). */
  port: Number(env('PORT', '3010')),

  /** Adresse d'écoute. 0.0.0.0 REQUIS pour que le Caddy du container atteigne
   *  l'hôte via host.containers.internal. Le port brut doit rester derrière le
   *  pare-feu (seul le port public Caddy est exposé). */
  host: env('HOST', '0.0.0.0'),

  /** Racine de stockage des projets : <dataDir>/<dossier>/<fichier>.graph.json.
   *  Défaut ANCRÉ sur la racine du dépôt (jamais sur le cwd) : un serveur lancé depuis
   *  server/ et un lancé via scripts/dev.sh doivent voir le MÊME data/ — deux racines
   *  divergentes = deux vérités et des projets « disparus » selon le lanceur. */
  dataDir: resolve(env('DATA_DIR', resolve(REPO_ROOT, 'data'))),

  /** Origines autorisées (CORS) en dev. En prod tout passe par le même origin
   *  (Caddy), donc CORS inutile ; utile seulement si on tape l'API en direct. */
  devOrigins: env('DEV_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** URL publique de l'app (liens directs vers /p/<dossier>/<fichier> rendus par la CLI). */
  appUrl: env('APP_URL', 'https://flooow.d.pilot-in.net').replace(/\/$/, ''),
} as const

export type Config = typeof config

// Seed idempotent : si dataDir ne contient aucun dossier de projet, copie les
// fixtures du front (app/fixtures/*.flooow.json) dans data/exemples/. Objectif :
// que le hub ait du contenu réel dès le premier démarrage. Ne touche à rien si
// des dossiers existent déjà.
import { promises as fs } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { slugify, FILE_EXT } from './files.js'

const HERE = dirname(fileURLToPath(import.meta.url)) // server/src
const FIXTURES = resolve(HERE, '../../app/fixtures')

export async function seedIfEmpty(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true })
  const entries = await fs.readdir(config.dataDir, { withFileTypes: true })
  if (entries.some((e) => e.isDirectory())) return // déjà du contenu → ne rien faire

  let names: string[]
  try {
    names = (await fs.readdir(FIXTURES)).filter((f) => f.endsWith('.flooow.json'))
  } catch {
    return // pas de fixtures accessibles → on laisse vide
  }
  if (names.length === 0) return

  const dir = resolve(config.dataDir, 'exemples')
  await fs.mkdir(dir, { recursive: true })
  for (const n of names) {
    const base = n.replace(/\.flooow\.json$/, '')
    const slug = slugify(base)
    if (!slug) continue
    const text = await fs.readFile(resolve(FIXTURES, n), 'utf8')
    await fs.writeFile(resolve(dir, slug + FILE_EXT), text, 'utf8')
  }
  console.log(`[flooow-server] seed : ${names.length} fixture(s) → data/exemples/`)
}

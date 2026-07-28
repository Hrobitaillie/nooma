// Génère fixtures/reference-project.flooow.json (format v2) : 40 pages, 120 blocs, 300 notes
// comportement, ~120 notes API, 20 services + arêtes navigatesTo. Déterministe. Validé par zod.
//   npm run gen:fixture
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  createApiNote,
  createBehaviorNote,
  createBlock,
  createEdge,
  createEmptyProject,
  createPage,
  createService,
} from '@flooow/core/model/factory'
import { parseProjectDoc } from '@flooow/core/model/schema'
import type { BlockType, Facet, FlooowEdge, FlooowNode, Risk, Service } from '@flooow/core/model/types'
import { BLOCK_TYPES } from '@flooow/core/model/types'

const PAGES = 40
const BLOCKS_PER_PAGE = 3 // → 120 blocs
const BEHAVIORS = 300
const SERVICES = 20

const facets: (Facet | null)[] = ['front', 'back', 'fullstack', null]
const risks: Risk[] = ['low', 'medium', 'high']
const blockTypes: BlockType[] = BLOCK_TYPES

// PRNG déterministe (mulberry32) pour un fixture stable.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(42)
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)] as T

const doc = createEmptyProject('Projet de référence Flooow')
doc.site.attrs.context = 'Portail métier de démonstration — jeu de données de référence.'
doc.site.attrs.constraints = ['SSO obligatoire', 'hébergement on-premise']

const nodes: FlooowNode[] = []
const edges: FlooowEdge[] = []
const services: Service[] = []
const register = (n: FlooowNode) => {
  nodes.push(n)
}

// Services (registre).
const serviceIds: string[] = []
for (let s = 0; s < SERVICES; s++) {
  const svc = createService({
    name: `Service ${s + 1}`,
    baseUrl: `https://svc-${s + 1}.acme.internal/api`,
    auth: pick(['OAuth2 client_credentials', 'API key', 'mTLS']),
    risk: pick(risks),
    endpoints: [
      { method: 'GET', path: `/resource-${s + 1}`, notes: 'pagination 100/p' },
      { method: 'POST', path: `/resource-${s + 1}`, notes: '' },
    ],
    notes: 'rate limit 60/min',
  })
  services.push(svc)
  serviceIds.push(svc.id)
}

// Pages (grille 8 colonnes) + blocs.
const pageIds: string[] = []
const blockIds: string[] = []
const COLS = 8
for (let p = 0; p < PAGES; p++) {
  const col = p % COLS
  const row = Math.floor(p / COLS)
  const page = createPage({
    name: `Page ${p + 1}`,
    position: { x: col * 520, y: row * 420 },
    lot: p < 12 ? 1 : (p % 3) + 1,
    attrs: {
      name: `Page ${p + 1}`,
      description: `Description de la page ${p + 1}.`,
      slug: `page-${p + 1}`,
      roles: ['user'],
    },
  })
  register(page)
  pageIds.push(page.id)

  for (let s = 0; s < BLOCKS_PER_PAGE; s++) {
    const block = createBlock({
      name: `Bloc ${p + 1}.${s + 1}`,
      parentId: page.id,
      blockType: pick(blockTypes),
      position: { x: 0, y: s * 120 },
      attrs: {
        name: `Bloc ${p + 1}.${s + 1}`,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: `Bloc ${s + 1} de la page ${p + 1}.` }],
            },
          ],
        },
      },
    })
    register(block)
    blockIds.push(block.id)
  }
}

// Notes comportement réparties sur les blocs (+ ~40 % accompagnées d'une note API).
for (let b = 0; b < BEHAVIORS; b++) {
  const targetId = blockIds[b % blockIds.length] as string
  const target = nodes.find((n) => n.id === targetId)!
  const note = createBehaviorNote({
    name: `Comportement ${b + 1}`,
    attachedTo: targetId,
    position: { x: target.position.x + 300, y: target.position.y + (b % 3) * 40 },
    attrs: {
      name: `Comportement ${b + 1}`,
      description: `Comportement ${b + 1}.`,
      facet: pick(facets),
      trigger: pick(['saisie utilisateur', 'chargement', 'clic', 'timer']),
      hours: Math.floor(rnd() * 12) + 1,
    },
  })
  register(note)

  if (rnd() < 0.4) {
    const svcIdx = Math.floor(rnd() * serviceIds.length)
    const apiNote = createApiNote({
      attachedTo: targetId,
      serviceId: serviceIds[svcIdx] as string,
      method: 'GET',
      path: `/resource-${svcIdx + 1}`,
      position: { x: target.position.x + 300, y: target.position.y + 140 },
      attrs: { facet: pick(facets) },
    })
    register(apiNote)
  }
}

// Navigation : chaîne navigatesTo entre pages consécutives.
for (let p = 0; p < pageIds.length - 1; p++) {
  const e = createEdge({
    type: 'navigatesTo',
    source: pageIds[p] as string,
    target: pageIds[p + 1] as string,
    attrs: {},
  })
  edges.push(e)
}

doc.services = services
doc.nodes = nodes
doc.edges = edges
doc.meta.homePageId = pageIds[0] ?? null

// Validation zod avant écriture (garde-fou anti-corruption).
const validated = parseProjectDoc(doc)

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../fixtures')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'reference-project.flooow.json')
writeFileSync(outPath, JSON.stringify(validated, null, 2) + '\n', 'utf8')

console.log(
  `OK → ${outPath}\n  ${nodes.length} nœuds (${pageIds.length} pages, ${blockIds.length} blocs, ` +
    `${nodes.filter((n) => n.type === 'note' && n.kind === 'behavior').length} notes comportement, ` +
    `${nodes.filter((n) => n.type === 'note' && n.kind === 'api').length} notes API), ` +
    `${services.length} services, ${edges.length} arêtes.`,
)

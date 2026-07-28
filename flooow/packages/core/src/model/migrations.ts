// Migrations de format : registre { fromVersion -> (doc) => doc } appliqué en chaîne.
// La validation zod s'applique APRÈS migration (voir donnees-json.md §Migrations).
import { CURRENT_FORMAT_VERSION } from './types'
import type { Position, Service, ServiceEndpoint } from './types'
import {
  mergeApiNoteFields,
  mergeBehaviorNoteFields,
  mergeBlockFields,
  mergeFeatureFields,
} from './richContent'

export const CURRENT = CURRENT_FORMAT_VERSION as number

/** Erreur levée quand un fichier provient d'une version d'app plus récente. */
export class UnsupportedVersionError extends Error {
  constructor(public readonly version: number) {
    super(
      `Format version ${version} non supporté (max ${CURRENT}). ` +
        `Ce fichier a été créé par une version plus récente de Flooow.`,
    )
    this.name = 'UnsupportedVersionError'
  }
}

// ── v1 → v2 ──────────────────────────────────────────────────────────────────
// Transformation best-effort décrite dans evolution-v2.md §1.5.
//   section → bloc (blockType='free') ; behavior node → note (attachedTo=ex-parent) ;
//   service node → registre services[] ; consumes → note api rattachée à la source ;
//   navigatesTo/dependsOn conservées (triggers → dependsOn, type retiré) ; meta.formatVersion → 2.

interface V1Node {
  id: string
  type: string
  kind?: string
  parentId: string | null
  position: Position
  size?: unknown
  lot?: number | null
  attrs: Record<string, unknown>
}

interface V1Edge {
  id: string
  type: string
  source: string
  target: string
  attrs?: { endpointRef?: string; notes?: string }
}

interface V1Doc {
  meta: Record<string, unknown> & { formatVersion: number; homePageId?: string | null }
  site: { attrs: Record<string, unknown> }
  nodes: V1Node[]
  edges: V1Edge[]
}

/** Parse « GET /orders » → { method:'GET', path:'/orders' }. Tolérant. */
function parseEndpointRef(ref: string | undefined): { method: string; path: string } {
  if (!ref) return { method: '', path: '' }
  const trimmed = ref.trim()
  const spaceAt = trimmed.indexOf(' ')
  if (spaceAt === -1) return { method: '', path: trimmed }
  return { method: trimmed.slice(0, spaceAt), path: trimmed.slice(spaceAt + 1).trim() }
}

function migrateV1toV2(input: unknown): unknown {
  const doc = input as V1Doc
  const services: Service[] = []
  const nodes: Record<string, unknown>[] = []
  const edges: Record<string, unknown>[] = []

  // Ids des ex-services → deviennent des entrées du registre (retirés des nœuds).
  const serviceIds = new Set<string>()

  for (const node of doc.nodes) {
    if (node.type === 'service') {
      const attrs = node.attrs
      const endpoints = Array.isArray(attrs.endpoints)
        ? (attrs.endpoints as ServiceEndpoint[]).map((e) => ({
            method: String(e.method ?? ''),
            path: String(e.path ?? ''),
            notes: String(e.notes ?? ''),
          }))
        : []
      services.push({
        id: node.id,
        name: String(attrs.name ?? node.id),
        baseUrl: '',
        auth: String(attrs.auth ?? ''),
        risk: (attrs.risk as Service['risk']) ?? 'low',
        endpoints,
        notes: String(attrs.notes ?? ''),
      })
      serviceIds.add(node.id)
      continue
    }

    if (node.type === 'behavior') {
      // behavior node (parentId) → note behavior rattachée à l'ancien parent.
      nodes.push({
        id: node.id,
        type: 'note',
        kind: 'behavior',
        parentId: null,
        attachedTo: node.parentId ?? '',
        position: node.position,
        ...(node.lot != null ? { lot: node.lot } : {}),
        attrs: {
          name: String(node.attrs.name ?? ''),
          description: String(node.attrs.description ?? ''),
          facet: (node.attrs.facet as string | null) ?? null,
          trigger: String(node.attrs.trigger ?? ''),
          rules: String(node.attrs.rules ?? ''),
          hours: (node.attrs.hours as number | null) ?? null,
          notes: String(node.attrs.notes ?? ''),
        },
      })
      continue
    }

    if (node.type === 'frame' && node.kind === 'section') {
      // section → bloc pleine largeur, blockType='free'.
      nodes.push({
        id: node.id,
        type: 'frame',
        kind: 'block',
        parentId: node.parentId,
        position: node.position,
        ...(node.lot != null ? { lot: node.lot } : {}),
        attrs: {
          name: String(node.attrs.name ?? ''),
          blockType: 'free',
          description: String(node.attrs.description ?? ''),
          constraints: Array.isArray(node.attrs.constraints) ? node.attrs.constraints : [],
          notes: String(node.attrs.notes ?? ''),
        },
      })
      continue
    }

    // frame page → conservée (sans size).
    nodes.push({
      id: node.id,
      type: 'frame',
      kind: 'page',
      parentId: node.parentId,
      position: node.position,
      ...(node.lot != null ? { lot: node.lot } : {}),
      attrs: {
        name: String(node.attrs.name ?? ''),
        route: String(node.attrs.route ?? ''),
        roles: Array.isArray(node.attrs.roles) ? node.attrs.roles : [],
        description: String(node.attrs.description ?? ''),
        constraints: Array.isArray(node.attrs.constraints) ? node.attrs.constraints : [],
        logic: String(node.attrs.logic ?? ''),
        notes: String(node.attrs.notes ?? ''),
      },
    })
  }

  // Edges : consumes → note api ; navigatesTo conservée ; triggers → dependsOn ; dependsOn conservée.
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))
  let apiSeq = 0
  for (const edge of doc.edges) {
    if (edge.type === 'consumes') {
      const { method, path } = parseEndpointRef(edge.attrs?.endpointRef)
      const source = nodeById.get(edge.source)
      const near: Position = source
        ? { x: source.position.x + 40, y: source.position.y + 40 }
        : { x: 0, y: 0 }
      nodes.push({
        id: `api-${edge.id}-${apiSeq++}`,
        type: 'note',
        kind: 'api',
        parentId: null,
        attachedTo: edge.source,
        position: near,
        attrs: {
          serviceId: edge.target,
          method,
          path,
          facet: null,
          notes: String(edge.attrs?.notes ?? ''),
        },
      })
      continue
    }
    // navigatesTo / dependsOn conservées ; l'ancien 'triggers' (type retiré) devient 'dependsOn'.
    edges.push({
      id: edge.id,
      type: edge.type === 'triggers' ? 'dependsOn' : edge.type,
      source: edge.source,
      target: edge.target,
      attrs: edge.attrs?.notes != null ? { notes: edge.attrs.notes } : {},
    })
  }

  const { formatVersion: _drop, ...restMeta } = doc.meta
  void _drop
  void serviceIds

  return {
    meta: { ...restMeta, formatVersion: 2 },
    site: doc.site,
    services,
    nodes,
    edges,
  }
}

// ── v2 → v3 ──────────────────────────────────────────────────────────────────
// Ajout de la couche fonctionnelle (nœuds `module` + `feature`, arête `realizedBy`,
// decisions.md §15). Purement additif : un document v2 n'a aucun nœud fonctionnel, donc la
// migration se limite à bumper la version. Le format reste sinon identique.
function migrateV2toV3(input: unknown): unknown {
  const doc = input as { meta: Record<string, unknown> }
  return {
    ...(doc as object),
    meta: { ...doc.meta, formatVersion: 3 },
  }
}

// ── v3 → v4 ──────────────────────────────────────────────────────────────────
// Contenu de fonctionnalité unifié : les champs texte description/implies/toConfirm/notes fusionnent
// en un document riche `content` (« Quoi » en tête, les autres en sections titrées). Les autres
// nœuds sont inchangés.
interface V3Node {
  type: string
  attrs: Record<string, unknown>
  [k: string]: unknown
}
interface V3Doc {
  meta: Record<string, unknown>
  nodes: V3Node[]
  [k: string]: unknown
}

function migrateV3toV4(input: unknown): unknown {
  const doc = input as V3Doc
  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'feature') return node
    const a = node.attrs
    const content = mergeFeatureFields({
      description: typeof a.description === 'string' ? a.description : '',
      implies: typeof a.implies === 'string' ? a.implies : '',
      toConfirm: typeof a.toConfirm === 'string' ? a.toConfirm : '',
      notes: typeof a.notes === 'string' ? a.notes : '',
    })
    return {
      ...node,
      attrs: {
        code: typeof a.code === 'string' ? a.code : '',
        name: typeof a.name === 'string' ? a.name : '',
        content,
        perimeter: (a.perimeter as string | null) ?? null,
        estimate: typeof a.estimate === 'string' ? a.estimate : '',
      },
    }
  })
  return { ...doc, meta: { ...doc.meta, formatVersion: 4 }, nodes }
}

// ── v4 → v5 ──────────────────────────────────────────────────────────────────
// Ajout des pages de notes (vue Notes en arbre, collection `notePages`). Purement additif :
// un document v4 n'a aucune page de notes, la migration introduit la collection vide.
function migrateV4toV5(input: unknown): unknown {
  const doc = input as { meta: Record<string, unknown> }
  return {
    ...(doc as object),
    meta: { ...doc.meta, formatVersion: 5 },
    notePages: [],
  }
}

// ── v5 → v6 ──────────────────────────────────────────────────────────────────
// L'arbre des notes cesse d'être à deux niveaux : la nature d'une entrée (titre de
// regroupement vs page éditable) était DÉDUITE de la profondeur (racine = titre), elle
// devient un champ explicite `kind`. On rejoue la convention v5 pour ne rien changer à
// l'affichage des documents existants : entrée racine → 'heading', entrée imbriquée → 'page'.
function migrateV5toV6(input: unknown): unknown {
  const doc = input as { meta: Record<string, unknown>; notePages?: unknown }
  const pages = Array.isArray(doc.notePages) ? doc.notePages : []
  const notePages = pages.map((p) => {
    const page = p as { parentId?: unknown }
    return { ...page, kind: page.parentId == null ? 'heading' : 'page' }
  })
  return {
    ...(doc as object),
    meta: { ...doc.meta, formatVersion: 6 },
    notePages,
  }
}

// ── v6 → v7 ──────────────────────────────────────────────────────────────────
// Le périmètre d'une fonctionnalité était un enum FIGÉ dans le code ('site' | 'editor' |
// 'internal' | 'external'), au libellé codé en dur. Il devient une liste d'options éditable et
// globale au projet (`featureFields` + `featureOptions`), et la valeur portée par la
// fonctionnalité passe de `attrs.perimeter` (littéral) à `attrs.fieldValues` (fieldId → optionId).
//
// Deux précautions :
//  - on ne crée QUE les options réellement utilisées par le document (en pratique 'site' et
//    'external' sur nos projets), pour ne pas amorcer une liste de valeurs mortes ;
//  - une valeur de périmètre inconnue (document trafiqué) est conservée en créant une option à
//    son nom, plutôt que d'être silencieusement perdue.
const V6_PERIMETER_LABELS: Record<string, string> = {
  site: 'Site',
  editor: 'Éditeur',
  internal: 'Interne',
  external: 'Externe',
}

interface V6Node {
  type: string
  attrs: Record<string, unknown>
  [k: string]: unknown
}
interface V6Doc {
  meta: Record<string, unknown>
  nodes: V6Node[]
  [k: string]: unknown
}

function migrateV6toV7(input: unknown): unknown {
  const doc = input as V6Doc

  // 1. Recenser les périmètres réellement portés par les fonctionnalités, dans l'ordre des
  //    libellés historiques (les valeurs hors enum passent à la suite, ordre d'apparition).
  const used = new Set<string>()
  for (const node of doc.nodes) {
    if (node.type !== 'feature') continue
    const p = node.attrs.perimeter
    if (typeof p === 'string' && p !== '') used.add(p)
  }
  const known = Object.keys(V6_PERIMETER_LABELS).filter((p) => used.has(p))
  const unknown_ = [...used].filter((p) => !(p in V6_PERIMETER_LABELS))

  // 2. Une option par périmètre utilisé. Id dérivé de la valeur → migration déterministe
  //    (rejouable, testable) là où une création utilisateur passera par genId().
  const featureOptions = [...known, ...unknown_].map((p) => ({
    id: `opt-perimeter-${p}`,
    fieldId: 'perimeter',
    name: V6_PERIMETER_LABELS[p] ?? p,
  }))

  // 3. Reporter la valeur de chaque fonctionnalité et retirer l'ancien champ.
  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'feature') return node
    const { perimeter, ...attrs } = node.attrs
    const optionId = typeof perimeter === 'string' && perimeter !== '' ? `opt-perimeter-${perimeter}` : null
    return { ...node, attrs: { ...attrs, fieldValues: { perimeter: optionId } } }
  })

  return {
    ...doc,
    meta: { ...doc.meta, formatVersion: 7 },
    // « Branchement sur le site » n'existait pas en v6 : le champ est créé, sans option.
    featureFields: [
      { id: 'binding', label: 'Branchement sur le site', order: 0 },
      { id: 'perimeter', label: 'Fonctionnalité attribuée à', order: 1 },
    ],
    featureOptions,
    nodes,
  }
}

// ── v7 → v8 ──────────────────────────────────────────────────────────────────
// Contenu de bloc unifié : description/constraints/notes fusionnent en un document riche `content`
// (même geste que la v3→v4 pour la fonctionnalité) + `apiRefs`, les connexions API portées par le
// bloc et rendues dans sa carte.
//
// Les notes `api` du canvas sont VOLONTAIREMENT laissées intactes : elles restent le moyen
// d'accrocher une connexion à une page ou de la faire vivre comme carte flottante. On ne les recopie
// donc PAS dans `apiRefs` — un même appel apparaîtrait deux fois (note + carte). `apiRefs` démarre
// vide et se remplit à la main ; c'est le seul choix non destructif, la conversion inverse étant
// impossible à deviner.
interface V7Node {
  type: string
  kind?: string
  attrs: Record<string, unknown>
  [k: string]: unknown
}
interface V7Doc {
  meta: Record<string, unknown>
  nodes: V7Node[]
  [k: string]: unknown
}

function migrateV7toV8(input: unknown): unknown {
  const doc = input as V7Doc
  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'frame' || node.kind !== 'block') return node
    const a = node.attrs
    const content = mergeBlockFields({
      description: typeof a.description === 'string' ? a.description : '',
      constraints: Array.isArray(a.constraints) ? (a.constraints as string[]) : [],
      notes: typeof a.notes === 'string' ? a.notes : '',
    })
    return {
      ...node,
      attrs: {
        name: typeof a.name === 'string' ? a.name : '',
        blockType: typeof a.blockType === 'string' ? a.blockType : 'free',
        content,
        apiRefs: [],
      },
    }
  })
  return { ...doc, meta: { ...doc.meta, formatVersion: 8 }, nodes }
}

/**
 * v8 → v9 : la collection `notePages` (vue Notes, v5–v8) disparaît du format — le narratif
 * vit désormais en fichiers markdown dans le docs/ du site du projet (publié par Portulan).
 * Les entrées existantes sont ABANDONNÉES par la migration (pas de cible dans le graphe) :
 * au moment du bump, seuls des projets d'exemples régénérables en contenaient. Un contenu
 * à conserver s'exporte en md AVANT migration (docToMarkdown).
 */
function migrateV8toV9(input: unknown): unknown {
  const doc = input as { meta: Record<string, unknown>; notePages?: unknown } & Record<string, unknown>
  const { notePages: _abandonnees, ...rest } = doc
  return { ...rest, meta: { ...doc.meta, formatVersion: 9 } }
}

/**
 * v9 → v10 : cycle de vie de la fonctionnalité (cycle-de-vie-fonctionnalite.md) — `status`
 * (défaut `idee`) et `checklist` (vide) sur chaque nœud feature. Un `featureField` créé à la main
 * dont le libellé ressemble à un statut (« Statut », « État »…) n'est PAS converti (trop de formes
 * possibles) : on le laisse en place, l'utilisateur le supprimera.
 */
function migrateV9toV10(input: unknown): unknown {
  const doc = input as { meta: Record<string, unknown>; nodes: { type: string; attrs: Record<string, unknown> }[] } & Record<string, unknown>
  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'feature') return node
    return { ...node, attrs: { ...node.attrs, status: 'idee', checklist: [] } }
  })
  return { ...doc, meta: { ...doc.meta, formatVersion: 10 }, nodes }
}

// ── v10 → v11 ────────────────────────────────────────────────────────────────
// Les éléments de config d'un bloc (connexions API et fonctionnalités réalisées) deviennent une
// liste ORDONNÉE par l'utilisateur, d'où deux ajouts solidaires sur le bloc :
//   · `ApiRef.id` — une connexion doit pouvoir être désignée par l'ordre autrement que par son rang
//     dans `apiRefs`, qui se décale à la première suppression ;
//   · `BlockAttrs.order` — la suite de clés (ids de connexions et de fonctionnalités).
//
// Les ids sont DÉRIVÉS de l'id du bloc et du rang (`<bloc>-api-<i>`), pas tirés au hasard : migrer
// deux fois le même fichier doit donner deux fois le même document, sans quoi rien n'est
// reproductible (tests, diffs de .graph.json, réconciliation collab). Ils sont uniques par
// construction, l'id du bloc l'étant déjà.
//
// `order` reprend les connexions dans leur ordre existant — le seul qui ait jamais été affiché. Les
// fonctionnalités réalisées n'y sont PAS ajoutées : elles vivent dans les arêtes, et la lecture de
// `order` place en fin de liste ce qui n'y figure pas. Les parcourir ici pour les y inscrire
// coûterait un balayage des arêtes de tout le document afin d'obtenir exactement le même rendu.
function migrateV10toV11(input: unknown): unknown {
  const doc = input as {
    meta: Record<string, unknown>
    nodes: { id: string; type: string; kind?: string; attrs: Record<string, unknown> }[]
  } & Record<string, unknown>
  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'frame' || node.kind !== 'block') return node
    const refs = (node.attrs.apiRefs as Record<string, unknown>[] | undefined) ?? []
    const apiRefs = refs.map((r, i) => ({ id: `${node.id}-api-${i}`, ...r }))
    return {
      ...node,
      attrs: { ...node.attrs, apiRefs, order: apiRefs.map((r) => r.id) },
    }
  })
  return { ...doc, meta: { ...doc.meta, formatVersion: 11 }, nodes }
}

// ── v11 → v12 ────────────────────────────────────────────────────────────────
// Les pages forment un ARBRE (`parentId`), et ne stockent plus leur route entière mais leur seul
// segment (`slug`) — la route absolue se recompose en remontant les ancêtres (domain/routes.ts).
//
// La parenté est DÉDUITE des arêtes `navigatesTo`, mais sous double condition : une seule arête
// entrante, ET une route qui prolonge réellement celle de la source. Les deux doivent être
// d'accord.
//
// Pourquoi ne pas se fier à la seule topologie de navigation. `navigatesTo` dit « on peut aller
// d'ici à là », pas « ceci vit sous cela » : le pied de page renvoie à la page de contact depuis
// tout le site, sans que /contact soit pour autant sous /mentions-legales. Parenter là-dessus
// fabriquerait des slugs faux en découpant des routes qui n'ont jamais été hiérarchiques — et une
// route fausse est bien pire qu'une page laissée à plat, puisqu'elle se propage à toute la
// descendance. Quand le préfixe ne confirme pas, la page reste racine de son propre arbre : le
// document est alors moins rangé, mais aucune route n'a bougé.
//
// AUCUNE arête n'est supprimée : un `navigatesTo` promu en parenté reste un lien de navigation.
// Les deux relations coexistent — trait plein pour la parenté, pointillés pour la navigation.
function migrateV11toV12(input: unknown): unknown {
  const doc = input as {
    meta: Record<string, unknown>
    nodes: { id: string; type: string; kind?: string; parentId: string | null; attrs: Record<string, unknown> }[]
    edges: { type: string; source: string; target: string }[]
  } & Record<string, unknown>

  const pages = doc.nodes.filter((n) => n.type === 'frame' && n.kind === 'page')
  // Deux lectures de la même route, délibérément distinctes :
  //   · `routeOf` — normalisée, pour COMPARER les préfixes ;
  //   · `rawRouteOf` — verbatim, pour EXTRAIRE le slug.
  // Les confondre corrompt les données : un projet réel stockait une URL externe complète dans
  // `route` (« https://exemple.fr »), dont la normalisation écrasait le « // » en « / ».
  // Normaliser pour décider, jamais pour écrire.
  const routeOf = new Map<string, string>()
  const rawRouteOf = new Map<string, string>()
  for (const page of pages) {
    const raw = String(page.attrs.route ?? '')
    routeOf.set(page.id, normalizeRoute(raw))
    rawRouteOf.set(page.id, raw.trim())
  }

  // Sources de navigation par cible. Une cible visée par plusieurs pages est ambiguë : on ne
  // choisit pas à la place de l'utilisateur, elle reste à plat.
  const navSources = new Map<string, string[]>()
  for (const edge of doc.edges ?? []) {
    if (edge.type !== 'navigatesTo') continue
    if (!routeOf.has(edge.source) || !routeOf.has(edge.target)) continue
    if (edge.source === edge.target) continue
    const list = navSources.get(edge.target)
    if (list) list.push(edge.source)
    else navSources.set(edge.target, [edge.source])
  }

  const parentOf = new Map<string, string>()
  for (const page of pages) {
    const sources = navSources.get(page.id)
    if (!sources || sources.length !== 1) continue
    const parentId = sources[0]
    const childRoute = routeOf.get(page.id)
    const parentRoute = parentId != null ? routeOf.get(parentId) : undefined
    if (parentId == null || childRoute == null || parentRoute == null) continue
    // Le préfixe doit confirmer, ET laisser un segment propre à l'enfant.
    const prefix = parentRoute === '/' ? '/' : `${parentRoute}/`
    if (!childRoute.startsWith(prefix) || childRoute === parentRoute) continue
    const rest = childRoute.slice(prefix.length)
    if (rest === '' || rest.includes('/')) continue // pas un enfant DIRECT : on ne devine pas
    parentOf.set(page.id, parentId)
  }

  // Un cycle est impossible ici (le préfixe strictement plus long interdit qu'une page soit son
  // propre ancêtre), mais la garde coûte trois lignes et le document d'entrée n'est pas de
  // confiance : une arête aberrante ne doit pas produire un fichier illisible.
  for (const [childId] of [...parentOf]) {
    const seen = new Set<string>([childId])
    let cursor = parentOf.get(childId)
    while (cursor) {
      if (seen.has(cursor)) {
        parentOf.delete(childId)
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor)
    }
  }

  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'frame' || node.kind !== 'page') return node
    const parentId = parentOf.get(node.id) ?? null
    let slug: string
    if (parentId) {
      // Enfant : le segment est ce que la route ajoute à celle de sa parente. Le préfixe a déjà été
      // vérifié sur les routes NORMALISÉES au moment de décider la parenté, donc il découpe juste.
      const route = routeOf.get(node.id) ?? '/'
      const parentRoute = routeOf.get(parentId) ?? '/'
      slug = route.slice(parentRoute === '/' ? 1 : parentRoute.length + 1)
    } else {
      // Racine : la route verbatim, moins son `/` de tête. Verbatim parce qu'une racine peut porter
      // un chemin à plusieurs segments (« /admin/commandes ») — ou n'importe quoi d'autre, ce champ
      // n'ayant jamais été contraint.
      slug = (rawRouteOf.get(node.id) ?? '').replace(/^\/+/, '')
    }
    // `route` doit DISPARAÎTRE : `pageAttrsSchema` est `.strict()`, une clé résiduelle ferait
    // échouer la validation du document migré.
    const { route: _dropped, ...keptAttrs } = node.attrs
    return { ...node, parentId, attrs: { ...keptAttrs, slug } }
  })

  return { ...doc, meta: { ...doc.meta, formatVersion: 12 }, nodes }
}

/** Route comparable : `/` de tête garanti, pas de `/` final, doublons écrasés. `''` → `/`. */
function normalizeRoute(raw: string): string {
  const cleaned = raw.trim().replace(/\/+/g, '/').replace(/\/+$/, '')
  if (cleaned === '' || cleaned === '/') return '/'
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

// ── v12 → v13 ────────────────────────────────────────────────────────────────
// Les cartes de note flottantes disparaissent au profit des commentaires façon Google Doc
// (plan-refonte-notes-commentaires.md §Migration) :
//   · note COMPORTEMENT → commentaire ancré à la même cible, tag « Comportement » (ambre),
//     body = nom + description + déclencheur + règles + heures recomposés en RichDoc ;
//   · note API → connexion inline `apiRefs` du bloc de rattachement (la cible directe, ou le
//     premier bloc de la page cible), `facet`/`notes` repris sur la connexion pour ne rien perdre.
//     REPLI quand l'inline est impossible (cible sans bloc, service absent du registre) :
//     commentaire tag « API » (cyan) portant tout le contenu de la note.
//
// Déterminisme (même exigence que v10→v11) : ids DÉRIVÉS, jamais tirés au hasard — le commentaire
// reprend `comment-<id de la note>`, la connexion inline reprend l'id de la note tel quel (unique
// par construction, et l'ancienne identité reste traçable dans les diffs). `createdAt` reprend
// `meta.updatedAt` : la note n'a jamais porté de date propre, et un horodatage « à maintenant »
// rendrait la migration non rejouable. `author` reste vide (identité inconnue).
const V13_TAG_BEHAVIOR = { label: 'Comportement', color: '#f59e0b' }
const V13_TAG_API = { label: 'API', color: '#0891b2' }

interface V12Node {
  id: string
  type: string
  kind?: string
  parentId: string | null
  position: Position
  attachedTo?: string
  attrs: Record<string, unknown>
  [k: string]: unknown
}

function migrateV12toV13(input: unknown): unknown {
  const doc = input as {
    meta: Record<string, unknown>
    services?: { id: string; name?: unknown }[]
    nodes: V12Node[]
  } & Record<string, unknown>

  const createdAt = typeof doc.meta.updatedAt === 'string' ? doc.meta.updatedAt : ''
  const serviceNameById = new Map((doc.services ?? []).map((s) => [s.id, String(s.name ?? '')]))

  // Premier bloc de chaque page (position.y croissante, id en départage) : cible de repli des
  // notes API accrochées à une PAGE — le modèle inline ne connaît que les blocs.
  const firstBlockOfPage = new Map<string, string>()
  for (const node of doc.nodes) {
    if (node.type !== 'frame' || node.kind !== 'block' || node.parentId == null) continue
    const rivalId = firstBlockOfPage.get(node.parentId)
    const rival = rivalId != null ? (doc.nodes.find((n) => n.id === rivalId) as V12Node) : null
    if (
      !rival ||
      node.position.y < rival.position.y ||
      (node.position.y === rival.position.y && node.id < rival.id)
    ) {
      firstBlockOfPage.set(node.parentId, node.id)
    }
  }

  const comments: Record<string, unknown>[] = []
  const refsByBlock = new Map<string, Record<string, unknown>[]>()

  for (const node of doc.nodes) {
    if (node.type !== 'note') continue
    const a = node.attrs
    const attachedTo = node.attachedTo ?? ''

    if (node.kind === 'behavior') {
      comments.push({
        id: `comment-${node.id}`,
        anchor: { nodeId: attachedTo },
        tag: V13_TAG_BEHAVIOR,
        body: mergeBehaviorNoteFields({
          name: typeof a.name === 'string' ? a.name : '',
          description: typeof a.description === 'string' ? a.description : '',
          facet: (a.facet as string | null) ?? null,
          trigger: typeof a.trigger === 'string' ? a.trigger : '',
          rules: typeof a.rules === 'string' ? a.rules : '',
          hours: typeof a.hours === 'number' ? a.hours : null,
          notes: typeof a.notes === 'string' ? a.notes : '',
        }),
        author: '',
        createdAt,
        resolved: false,
        replies: [],
      })
      continue
    }

    // Note API → inline si un bloc ET un service existent, commentaire de repli sinon.
    const target = doc.nodes.find((n) => n.id === attachedTo)
    const blockId =
      target && target.type === 'frame' && target.kind === 'block'
        ? target.id
        : target && target.type === 'frame' && target.kind === 'page'
          ? (firstBlockOfPage.get(target.id) ?? null)
          : null
    const serviceId = typeof a.serviceId === 'string' ? a.serviceId : ''
    const facet = (a.facet as string | null) ?? null
    const notes = typeof a.notes === 'string' ? a.notes : ''

    if (blockId != null && serviceNameById.has(serviceId)) {
      const ref: Record<string, unknown> = {
        id: node.id,
        serviceId,
        method: typeof a.method === 'string' ? a.method : '',
        path: typeof a.path === 'string' ? a.path : '',
        ...(facet != null ? { facet } : {}),
        ...(notes.trim() !== '' ? { notes } : {}),
      }
      const list = refsByBlock.get(blockId)
      if (list) list.push(ref)
      else refsByBlock.set(blockId, [ref])
    } else {
      comments.push({
        id: `comment-${node.id}`,
        anchor: { nodeId: attachedTo },
        tag: V13_TAG_API,
        body: mergeApiNoteFields({
          method: typeof a.method === 'string' ? a.method : '',
          path: typeof a.path === 'string' ? a.path : '',
          serviceName: serviceNameById.get(serviceId) ?? serviceId,
          facet,
          notes,
        }),
        author: '',
        createdAt,
        resolved: false,
        replies: [],
      })
    }
  }

  const nodes = doc.nodes
    .filter((n) => n.type !== 'note')
    .map((node) => {
      const refs = refsByBlock.get(node.id)
      if (!refs) return node
      const apiRefs = [...((node.attrs.apiRefs as unknown[] | undefined) ?? []), ...refs]
      // `order` gagne les nouvelles connexions en queue : même rendu que la tolérance « absent =
      // à la fin » de BlockAttrs.order, mais explicite et stable dans le fichier migré.
      const order = [
        ...((node.attrs.order as string[] | undefined) ?? []),
        ...refs.map((r) => r.id as string),
      ]
      return { ...node, attrs: { ...node.attrs, apiRefs, order } }
    })

  return { ...doc, meta: { ...doc.meta, formatVersion: 13 }, nodes, comments }
}

/**
 * Registre des migrations. La clé N transforme un document du format N vers N+1.
 */
export const migrations: Record<number, (doc: unknown) => unknown> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
  10: migrateV10toV11,
  11: migrateV11toV12,
  12: migrateV12toV13,
}

interface VersionedDoc {
  meta: { formatVersion: number }
}

function hasVersion(doc: unknown): doc is VersionedDoc {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    'meta' in doc &&
    typeof (doc as { meta: unknown }).meta === 'object' &&
    (doc as { meta: { formatVersion?: unknown } }).meta !== null &&
    typeof (doc as { meta: { formatVersion?: unknown } }).meta.formatVersion === 'number'
  )
}

/**
 * Applique en chaîne les migrations depuis la version du document jusqu'à CURRENT.
 * @throws UnsupportedVersionError si le document est plus récent que l'app.
 * @throws Error si une migration manque dans la chaîne.
 */
export function migrate(doc: unknown): unknown {
  if (!hasVersion(doc)) {
    throw new Error('Document illisible : meta.formatVersion manquant ou invalide.')
  }
  let v = doc.meta.formatVersion
  if (v > CURRENT) throw new UnsupportedVersionError(v)
  let current: unknown = doc
  while (v < CURRENT) {
    const step = migrations[v]
    if (!step) throw new Error(`Migration manquante pour la version ${v}.`)
    current = step(current)
    v++
  }
  return current
}

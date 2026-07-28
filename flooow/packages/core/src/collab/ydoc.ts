// Pont Y.Doc ⇄ ProjectDoc — mapping PARTAGÉ entre le serveur (Hocuspocus : seed +
// persistance) et le front (bridge store ⇄ Y.Doc). Une seule définition de la
// structure CRDT du graphe.
//
// Structure Y.Doc (granularité de merge) :
//   meta          : Y.Map<champ, valeur>   (merge par champ)
//   site          : Y.Map<champ, valeur>   (attrs du site, merge par champ)
//   services      : Y.Map<id, Service>     (merge par service ; valeur = objet plain, LWW)
//   featureFields : Y.Map<id, FeatureField>   (merge par champ de fonctionnalité)
//   featureOptions: Y.Map<id, FeatureOption>  (merge par option — deux ajouts d'options
//                                              différentes ne s'écrasent pas)
//   nodes         : Y.Map<id, FlooowNode>  (merge par nœud ; valeur = objet plain, LWW)
//   edges         : Y.Map<id, FlooowEdge>  (merge par arête)
//   comments      : Y.Map<id, Comment>     (merge par commentaire — deux fils concurrents sur le
//                                           même élément ne s'écrasent pas ; une réponse ajoutée
//                                           au MÊME fil par deux pairs reste LWW, comme le reste)
//
// Les valeurs sont des objets JSON purs (jamais de proxy réactif Vue). Deux éditions
// concurrentes sur des entités DIFFÉRENTES fusionnent proprement ; sur la MÊME entité,
// c'est le dernier écrit qui gagne (le texte riche aura son propre CRDT via Tiptap).
import * as Y from 'yjs'
import type {
  Comment,
  ProjectDoc,
  FeatureField,
  FeatureOption,
  FlooowNode,
  FlooowEdge,
  Service,
  ProjectMeta,
  SiteAttrs,
} from '../model/types'

/** Origine de transaction pour les écritures LOCALES du front (anti-echo dans le bridge). */
export const LOCAL_ORIGIN = 'flooow-local'

export interface YCollections {
  meta: Y.Map<unknown>
  site: Y.Map<unknown>
  services: Y.Map<Service>
  featureFields: Y.Map<FeatureField>
  featureOptions: Y.Map<FeatureOption>
  nodes: Y.Map<FlooowNode>
  edges: Y.Map<FlooowEdge>
  comments: Y.Map<Comment>
}

export function yCollections(doc: Y.Doc): YCollections {
  return {
    meta: doc.getMap('meta'),
    site: doc.getMap('site'),
    services: doc.getMap('services'),
    featureFields: doc.getMap('featureFields'),
    featureOptions: doc.getMap('featureOptions'),
    nodes: doc.getMap('nodes'),
    edges: doc.getMap('edges'),
    comments: doc.getMap('comments'),
  }
}

/** Un Y.Doc « vide » n'a encore reçu aucun contenu (à seeder depuis le fichier). */
export function isYDocEmpty(doc: Y.Doc): boolean {
  const c = yCollections(doc)
  return (
    c.meta.size === 0 &&
    c.nodes.size === 0 &&
    c.edges.size === 0 &&
    c.services.size === 0 &&
    c.featureFields.size === 0 &&
    c.featureOptions.size === 0
  )
}

/** Reconstruit un ProjectDoc complet depuis le Y.Doc. */
export function yDocToProjectDoc(doc: Y.Doc): ProjectDoc {
  const c = yCollections(doc)
  return {
    meta: c.meta.toJSON() as ProjectMeta,
    site: { attrs: c.site.toJSON() as SiteAttrs },
    services: [...c.services.values()],
    // Ordre du tableau NON significatif (comme services/nodes) : l'affichage trie sur `order`.
    featureFields: [...c.featureFields.values()],
    featureOptions: [...c.featureOptions.values()],
    nodes: [...c.nodes.values()],
    edges: [...c.edges.values()],
    comments: [...c.comments.values()],
  }
}

// ── Diff par champ (meta, site.attrs) ──────────────────────────────────────────
function diffKeyed(ymap: Y.Map<unknown>, prev: Record<string, unknown> | undefined, next: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(next)) {
    if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(v)) ymap.set(k, v)
  }
  for (const k of [...ymap.keys()]) {
    if (!(k in next)) ymap.delete(k)
  }
}

// ── Diff par id (services, nodes, edges) ───────────────────────────────────────
function diffById<T extends { id: string }>(ymap: Y.Map<T>, prev: T[] | undefined, next: T[]): void {
  const prevById = new Map((prev ?? []).map((x) => [x.id, x]))
  const nextIds = new Set<string>()
  for (const item of next) {
    nextIds.add(item.id)
    const p = prevById.get(item.id)
    if (!p || JSON.stringify(p) !== JSON.stringify(item)) ymap.set(item.id, item)
  }
  for (const id of [...ymap.keys()]) {
    if (!nextIds.has(id)) ymap.delete(id)
  }
}

/**
 * Applique dans le Y.Doc le diff `prev → next` (ProjectDoc), en une transaction.
 * Utilisé par le bridge FRONT à chaque mutation locale. `prev = null` → seed complet.
 */
export function applyDiffToYDoc(doc: Y.Doc, prev: ProjectDoc | null, next: ProjectDoc, origin: unknown = LOCAL_ORIGIN): void {
  const c = yCollections(doc)
  doc.transact(() => {
    diffKeyed(c.meta, prev?.meta as Record<string, unknown> | undefined, next.meta as unknown as Record<string, unknown>)
    diffKeyed(c.site, prev?.site.attrs as Record<string, unknown> | undefined, next.site.attrs as unknown as Record<string, unknown>)
    diffById(c.services, prev?.services, next.services)
    diffById(c.featureFields, prev?.featureFields, next.featureFields)
    diffById(c.featureOptions, prev?.featureOptions, next.featureOptions)
    diffById(c.nodes, prev?.nodes, next.nodes)
    diffById(c.edges, prev?.edges, next.edges)
    diffById(c.comments, prev?.comments, next.comments)
  }, origin)
}

/**
 * Seed complet du Y.Doc depuis un ProjectDoc (remplace tout). Utilisé par le SERVEUR
 * au premier chargement d'un document (depuis le .graph.json). Une Y.Map 'notePages'
 * orpheline peut subsister dans les Y.Doc persistés d'avant la v9 — plus jamais lue.
 */
export function seedYDoc(doc: Y.Doc, pd: ProjectDoc, origin: unknown = 'seed'): void {
  const c = yCollections(doc)
  doc.transact(() => {
    c.meta.clear()
    for (const [k, v] of Object.entries(pd.meta)) c.meta.set(k, v)
    c.site.clear()
    for (const [k, v] of Object.entries(pd.site.attrs)) c.site.set(k, v)
    c.services.clear()
    for (const s of pd.services) c.services.set(s.id, s)
    c.featureFields.clear()
    for (const f of pd.featureFields) c.featureFields.set(f.id, f)
    c.featureOptions.clear()
    for (const o of pd.featureOptions) c.featureOptions.set(o.id, o)
    c.nodes.clear()
    for (const n of pd.nodes) c.nodes.set(n.id, n)
    c.edges.clear()
    for (const e of pd.edges) c.edges.set(e.id, e)
    c.comments.clear()
    for (const cm of pd.comments) c.comments.set(cm.id, cm)
  }, origin)
}

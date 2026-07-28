// Résolution de références pour la couche agent (pivot agentique — cadrage/06-pivot-agentique/plan.md §3.2).
// Un agent ne manipule jamais d'UUID complets : il navigue par POIGNÉES courtes — préfixe d'id
// (8 caractères affichés partout), code de fonctionnalité (« DEV-04 »), ou recherche par nom.
// Tout ce qui affiche un id court dans une fiche (cards.ts) doit être résolvable ici : c'est le
// contrat qui rend les fiches navigables sans jamais charger le document entier dans le contexte.
import type { FlooowNode, ProjectDoc } from '@flooow/core/model/types'
import { isApiNote, isBlock, isFeature, isModule, isPage } from '@flooow/core/model/types'
import { fullRouteOf } from '@flooow/core/domain/routes'

export type EntityKind =
  | 'page'
  | 'block'
  | 'module'
  | 'feature'
  | 'note'
  | 'service'

/** Référence légère d'une entité adressable du projet. */
export interface EntityRef {
  kind: EntityKind
  id: string
  /** Nom lisible (méthode + chemin pour une note API). */
  name: string
}

/** Longueur des ids courts affichés dans les fiches (préfixe d'UUID, résolu par resolveRef). */
export const SHORT_ID_LENGTH = 8
/** Longueur minimale d'un préfixe accepté en résolution (en deçà : trop de faux positifs). */
export const MIN_PREFIX_LENGTH = 4

export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH)
}

function kindOfNode(n: FlooowNode): EntityKind {
  if (isPage(n)) return 'page'
  if (isBlock(n)) return 'block'
  if (isModule(n)) return 'module'
  if (isFeature(n)) return 'feature'
  return 'note'
}

/** Nom lisible d'un nœud du canvas (les notes API n'ont pas de champ `name`). */
export function nodeLabel(n: FlooowNode): string {
  if (isApiNote(n)) return `${n.attrs.method} ${n.attrs.path}`.trim() || 'Note API'
  return n.attrs.name || 'Sans titre'
}

/** Toutes les entités adressables du projet (nœuds + services). */
export function allRefs(doc: ProjectDoc): EntityRef[] {
  return [
    ...doc.nodes.map((n) => ({ kind: kindOfNode(n), id: n.id, name: nodeLabel(n) })),
    ...doc.services.map((s) => ({ kind: 'service' as const, id: s.id, name: s.name })),
  ]
}

export type Resolution =
  | { status: 'found'; ref: EntityRef }
  | { status: 'ambiguous'; matches: EntityRef[] }
  | { status: 'notFound' }

/**
 * Résout une poignée vers UNE entité. Par priorité : id complet, code de fonctionnalité (exact,
 * insensible à la casse), préfixe d'id (≥ MIN_PREFIX_LENGTH). Une poignée qui matche plusieurs
 * entités est `ambiguous` (jamais de choix silencieux : l'agent doit préciser).
 */
export function resolveRef(doc: ProjectDoc, handle: string): Resolution {
  const h = handle.trim()
  if (!h) return { status: 'notFound' }
  const refs = allRefs(doc)

  const exact = refs.filter((r) => r.id === h)
  if (exact.length === 1) return { status: 'found', ref: exact[0]! }

  const lower = h.toLowerCase()
  const byCode = refs.filter((r) => {
    if (r.kind !== 'feature') return false
    const node = doc.nodes.find((n) => n.id === r.id)
    return node != null && isFeature(node) && node.attrs.code.toLowerCase() === lower
  })
  if (byCode.length === 1) return { status: 'found', ref: byCode[0]! }
  if (byCode.length > 1) return { status: 'ambiguous', matches: byCode }

  if (h.length >= MIN_PREFIX_LENGTH) {
    const byPrefix = refs.filter((r) => r.id.startsWith(h))
    if (byPrefix.length === 1) return { status: 'found', ref: byPrefix[0]! }
    if (byPrefix.length > 1) return { status: 'ambiguous', matches: byPrefix }
  }

  return { status: 'notFound' }
}

const COMBINING_MARKS = /[̀-ͯ]/g

/** Normalisation de recherche : minuscules, sans diacritiques. */
function fold(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/**
 * Recherche plein-nom : sous-chaîne (insensible à la casse et aux diacritiques) sur les noms,
 * titres, codes de fonctionnalité et routes de page. Renvoie des références légères, jamais le
 * contenu — l'agent enchaîne sur une fiche s'il veut le détail.
 */
export function findEntities(doc: ProjectDoc, query: string): EntityRef[] {
  const q = fold(query.trim())
  if (!q) return []
  const out: EntityRef[] = []
  // La route d'une page se recompose depuis ses ancêtres (v12) : on indexe une fois pour la boucle
  // plutôt que de rebalayer les nœuds à chaque page rencontrée.
  const index = new Map(doc.nodes.map((n) => [n.id, n]))
  for (const n of doc.nodes) {
    const haystack = [
      nodeLabel(n),
      isFeature(n) ? n.attrs.code : '',
      isPage(n) ? fullRouteOf(n.id, index) : '',
    ]
    if (haystack.some((t) => t && fold(t).includes(q)))
      out.push({ kind: kindOfNode(n), id: n.id, name: nodeLabel(n) })
  }
  for (const s of doc.services) {
    if (fold(s.name).includes(q)) out.push({ kind: 'service', id: s.id, name: s.name })
  }
  return out
}

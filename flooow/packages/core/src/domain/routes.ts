// Routes des pages (v12) : une page ne stocke que son SEGMENT (`slug`), jamais sa route entière.
// La route absolue est recomposée à la lecture en remontant `parentId` jusqu'à la racine de l'arbre.
//
// POURQUOI dériver plutôt que stocker. La hiérarchie de pages EST la hiérarchie d'URL : une page
// enfant vit sous sa parente. Stocker les deux, c'est accepter qu'elles divergent — renommer
// `/catalogue` en `/materiel` laisserait douze descendants pointer sur un préfixe mort, et il
// faudrait une cascade d'écritures (annulable, conflictuelle en collab) pour les rattraper. Ici
// renommer la parente n'écrit rien : les descendants suivent parce qu'ils n'ont jamais porté le
// préfixe.
//
// Corollaire assumé : il n'y a plus de moyen de donner à une sous-page une route qui ne prolonge
// pas celle de sa parente. C'est voulu — cette liberté-là ne produisait que des arborescences qui
// mentent sur leur propre structure.
import type { NodeIndex, PageNode } from '@flooow/core/model/types'
import { isPage } from '@flooow/core/model/types'

/**
 * Normalise un segment saisi par l'utilisateur : plus de `/` aux extrémités (il est fourni par la
 * composition), espaces compactés en tirets. Un segment vide reste vide — c'est le cas légitime de
 * la page d'accueil d'un arbre, dont la route est celle de son parent.
 */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '-')
}

/**
 * Chaîne des pages de la RACINE de l'arbre jusqu'à `pageId` inclus.
 * Vide si `pageId` n'est pas une page. Le `seen` n'est pas décoratif : un cycle `parentId` est
 * refusé par l'invariant `PARENT_CYCLE`, mais cette fonction tourne aussi pendant une migration ou
 * une réconciliation collab, c'est-à-dire AVANT que les invariants aient pu se prononcer.
 */
export function pageChain(pageId: string, index: NodeIndex): PageNode[] {
  const chain: PageNode[] = []
  const seen = new Set<string>()
  let current = index.get(pageId)
  while (current && isPage(current) && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId != null ? index.get(current.parentId) : undefined
  }
  return chain
}

/**
 * Route absolue d'une page : `/` suivi des slugs de sa chaîne, les vides ignorés.
 * Une racine au slug vide donne `/` — la page d'accueil.
 */
export function fullRouteOf(pageId: string, index: NodeIndex): string {
  const segments = pageChain(pageId, index)
    .map((page) => normalizeSlug(page.attrs.slug))
    .filter((segment) => segment !== '')
  return `/${segments.join('/')}`
}

/** Page racine de l'arbre auquel appartient `pageId` (elle-même si elle est déjà racine). */
export function rootPageOf(pageId: string, index: NodeIndex): PageNode | null {
  return pageChain(pageId, index)[0] ?? null
}

/** Vrai si la page est la racine de son arbre — la seule dont la position soit libre. */
export function isRootPage(page: PageNode): boolean {
  return page.parentId == null
}

/**
 * Sous-pages directes d'une page. `parentId === null` renvoie les RACINES d'arbre — un document
 * peut en porter plusieurs, chacune ancrant son propre plan.
 * Triées par `position.x` : c'est la clé d'ordre des frères, comme `position.y` l'est des blocs
 * dans leur page.
 */
export function childPages(parentId: string | null, index: NodeIndex): PageNode[] {
  const out: PageNode[] = []
  for (const node of index.values()) {
    if (isPage(node) && node.parentId === parentId) out.push(node)
  }
  return out.sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id))
}

/**
 * Sous-pages transitives d'une page, en largeur, racine exclue.
 * Sert à la suppression en cascade et à la translation d'un arbre par sa racine.
 */
export function descendantPages(pageId: string, index: NodeIndex): PageNode[] {
  const out: PageNode[] = []
  const seen = new Set<string>([pageId])
  const queue: string[] = [pageId]
  while (queue.length) {
    const current = queue.shift() as string
    for (const child of childPages(current, index)) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      queue.push(child.id)
    }
  }
  return out
}

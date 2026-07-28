// Roll-up des structures v2 : descendants via parentId (pages → blocs),
// notes d'une cible via attachedTo, page de rattachement d'un élément.
import type {
  ChildrenIndex,
  FlooowNode,
  NodeIndex,
  NoteNode,
  PageNode,
} from '@flooow/core/model/types'
import { isBlock, isNote, isPage } from '@flooow/core/model/types'

/** Enfants directs d'un nœud (ou du site si `parentId === null`). */
export function children(
  parentId: string | null,
  childrenIndex: ChildrenIndex,
  index: NodeIndex,
): FlooowNode[] {
  const ids = childrenIndex.get(parentId) ?? []
  return ids
    .map((id) => index.get(id))
    .filter((n): n is FlooowNode => n != null)
}

/**
 * Descendants (transitifs) d'une frame via `parentId`, en parcours en largeur (BFS).
 * S'appuie sur l'index inversé `childrenIndex` (parentId → ids) maintenu par le store.
 * Le nœud racine `frameId` lui-même n'est pas inclus.
 */
export function descendants(
  frameId: string,
  childrenIndex: ChildrenIndex,
  index: NodeIndex,
): FlooowNode[] {
  const out: FlooowNode[] = []
  const seen = new Set<string>([frameId]) // garde-fou anti-cycle + n'inclut pas la racine
  const queue: string[] = [frameId]
  while (queue.length) {
    const current = queue.shift() as string
    const kids = childrenIndex.get(current) ?? []
    for (const kid of kids) {
      if (seen.has(kid)) continue
      seen.add(kid)
      const node = index.get(kid)
      if (node) out.push(node)
      queue.push(kid)
    }
  }
  return out
}

/** Notes rattachées à une cible (page ou bloc) via `attachedTo`. */
export function attachedNotes(targetId: string, index: NodeIndex): NoteNode[] {
  const out: NoteNode[] = []
  for (const node of index.values()) {
    if (isNote(node) && node.attachedTo === targetId) out.push(node)
  }
  return out
}

/**
 * Page de rattachement d'un élément quelconque, remontée jusqu'à une page :
 *   note → attachedTo → (bloc → parentId →) page. Renvoie null si non trouvée.
 */
export function pageOf(startId: string, index: NodeIndex): PageNode | null {
  let cur = index.get(startId)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (isPage(cur)) return cur
    if (isNote(cur)) cur = index.get(cur.attachedTo)
    else if (isBlock(cur)) cur = cur.parentId != null ? index.get(cur.parentId) : undefined
    else cur = undefined
  }
  return null
}

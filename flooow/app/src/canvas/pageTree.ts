/**
 * Layout d'ARBRE DE PAGES (v13, retours Hugo du 22/07) — arbre « tidy » RÉCURSIF façon Octopus :
 * les enfants d'une page, À TOUS LES NIVEAUX, se rangent HORIZONTALEMENT sous elle (comme la
 * racine et ses rubriques), chaque sous-arbre occupant sa propre bande. Fini les piles verticales
 * d'une colonne : elles se lisaient comme une chaîne (« 1 page par niveau ») alors que c'était une
 * fratrie.
 *
 * Placement 100 % DÉRIVÉ, comme la couche fonctionnelle (globalTree.ts) : qui que soit l'ouvreur
 * du document, et quel que soit l'historique des gestes, la scène est TOUJOURS rangée pareil.
 * Aucune position stockée n'est une coordonnée : `position.x` n'est qu'une CLÉ D'ORDRE — entre
 * frères, ou entre ARBRES pour les racines.
 *
 * Géométrie : chaque parent est centré sur la partie VISIBLE de la rangée de ses enfants (les
 * réservations de droite — notes — comptent dans la largeur occupée mais pas dans le centrage du
 * bord droit) ; chaque rangée pend à un RAIL orthogonal sous son parent (TreeEdge, coude à
 * mi-chemin), centre bas → centre haut. Les arbres de racines se posent côte à côte dans l'ordre
 * des clés.
 */

/** Marge d'origine du monde (gauche et haut). */
export const TREE_PAD = 60
/** Écart horizontal entre deux ARBRES. */
export const TREE_GAP = 140
/** Écart vertical entre le bas d'un parent et le haut de la rangée de ses enfants. */
export const TREE_RAIL_GAP = 72
/** Écart horizontal entre deux sous-arbres frères. */
export const TREE_COL_GAP = 48

export interface PageTreeRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PageTreeItem {
  id: string
  /** Page parente (`null` = racine d'un arbre). Un parent inconnu du jeu vaut racine (défensif). */
  parentId: string | null
  /** Clé d'ordre (la `position.x` stockée) : entre frères, ou entre arbres pour une racine. */
  order: number
  /** Hauteur réelle (mesurée) ou estimée de la carte. */
  h: number
  /** Largeur réservée à DROITE de la carte (notes). Comptée dans la largeur du sous-arbre. */
  extraRight?: number
}

export interface PageTreeLayout {
  rect: Map<string, PageTreeRect>
  /** Profondeur dans l'arbre (0 = racine, 1 = rubrique, 2+ = descendance). */
  depth: Map<string, number>
}

export interface PageTreeOptions {
  /** Largeur (fixe) d'une carte page. */
  pageW: number
}

/** Frères triés par clé d'ordre, id en départage (stable d'un rendu à l'autre). */
function sortSiblings(items: PageTreeItem[]): PageTreeItem[] {
  return items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** Géométrie locale d'un sous-arbre (repère : son bord gauche). */
interface SubtreeBox {
  /** Largeur totale occupée (réservations comprises). */
  w: number
  /** Offset local de la carte du nœud. */
  nodeL: number
  /** Offset local du début de la rangée des enfants. */
  rowL: number
  /** Bord droit VISIBLE (cartes, sans la réservation du bord droit) — sert au centrage du parent. */
  vis: number
}

/**
 * Dispose tous les arbres de pages, côte à côte dans l'ordre des racines. Les pages orphelines
 * (parent absent du jeu) valent racines ; les pages prises dans un cycle de `parentId` (interdit
 * par l'invariant PARENT_CYCLE mais possible transitoirement pendant une migration ou une
 * réconciliation collab) sont posées en queue de rangée : une page ne disparaît jamais du canvas.
 */
export function pageTreeLayout(
  items: readonly PageTreeItem[],
  opts: PageTreeOptions,
): PageTreeLayout {
  const { pageW } = opts
  const byId = new Map(items.map((it) => [it.id, it]))
  const children = new Map<string, PageTreeItem[]>()
  const roots: PageTreeItem[] = []
  for (const it of items) {
    if (it.parentId != null && byId.has(it.parentId)) {
      const arr = children.get(it.parentId)
      if (arr) arr.push(it)
      else children.set(it.parentId, [it])
    } else {
      roots.push(it)
    }
  }
  for (const arr of children.values()) sortSiblings(arr)

  const rect = new Map<string, PageTreeRect>()
  const depth = new Map<string, number>()
  /** Largeur occupée par la carte seule : la carte + sa réservation de droite. */
  const spanOf = (it: PageTreeItem): number => pageW + (it.extraRight ?? 0)

  /** Enfants d'un nœud non encore visités (garde anti-cycle, partagée mesure/pose via l'ordre
   *  déterministe du parcours depuis les racines). */
  const kidsOf = (it: PageTreeItem, seen: Set<string>): PageTreeItem[] => {
    const kids = (children.get(it.id) ?? []).filter((c) => !seen.has(c.id))
    for (const c of kids) seen.add(c.id)
    return kids
  }

  // ── Passe 1 : mesure des sous-arbres (largeur, offsets locaux carte/rangée) ────────────────────
  const box = new Map<string, SubtreeBox>()
  const measure = (it: PageTreeItem, seen: Set<string>): SubtreeBox => {
    const kids = kidsOf(it, seen)
    if (!kids.length) {
      const b: SubtreeBox = { w: spanOf(it), nodeL: 0, rowL: 0, vis: pageW }
      box.set(it.id, b)
      return b
    }
    const ms = kids.map((c) => measure(c, seen))
    const rowW =
      ms.reduce((s, m) => s + m.w, 0) + (kids.length - 1) * TREE_COL_GAP
    const lastM = ms[ms.length - 1] as SubtreeBox
    /** Bord droit visible de la rangée : le dernier sous-arbre compte pour sa partie visible. */
    const rowVis = rowW - lastM.w + lastM.vis
    // Carte du nœud centrée sur la partie VISIBLE de la rangée ; si la rangée est plus étroite que
    // la carte, c'est elle qui se décale (jamais d'offset négatif : le repère local commence à 0).
    let nodeL = (rowVis - pageW) / 2
    let rowL = 0
    if (nodeL < 0) {
      rowL = -nodeL
      nodeL = 0
    }
    const b: SubtreeBox = {
      w: Math.max(nodeL + spanOf(it), rowL + rowW),
      nodeL,
      rowL,
      vis: Math.max(nodeL + pageW, rowL + rowVis),
    }
    box.set(it.id, b)
    return b
  }

  // ── Passe 2 : pose récursive ───────────────────────────────────────────────────────────────────
  const place = (it: PageTreeItem, x: number, y: number, d: number, seen: Set<string>): void => {
    const kids = kidsOf(it, seen)
    const b = box.get(it.id) as SubtreeBox
    rect.set(it.id, { x: x + b.nodeL, y, w: pageW, h: it.h })
    depth.set(it.id, d)
    const childY = y + it.h + TREE_RAIL_GAP
    let cx = x + b.rowL
    for (const c of kids) {
      place(c, cx, childY, d + 1, seen)
      cx += (box.get(c.id) as SubtreeBox).w + TREE_COL_GAP
    }
  }

  let xCursor = TREE_PAD
  for (const root of sortSiblings(roots)) {
    if (rect.has(root.id)) continue
    const b = measure(root, new Set<string>([root.id]))
    place(root, xCursor, TREE_PAD, 0, new Set<string>([root.id]))
    xCursor += b.w + TREE_GAP
  }

  // Filet de sécurité : toute page restée sans rect (cycle de parentId…) est posée en queue de
  // rangée — visible et rattrapable, plutôt qu'évaporée.
  for (const it of items) {
    if (!rect.has(it.id)) {
      rect.set(it.id, { x: xCursor, y: TREE_PAD, w: pageW, h: it.h })
      depth.set(it.id, 0)
      xCursor += spanOf(it) + TREE_GAP
    }
  }

  return { rect, depth }
}

// Arbre de dépendances de la couche fonctionnelle (pur, sans dépendance au store ni au canvas —
// importable des deux côtés sans cycle, comme cardMetrics).
//
// Le layout d'un module n'est plus une pile verticale : les fonctionnalités s'organisent en
// RANGÉES par niveau de dépendance. En haut les fonctionnalités qui ne dépendent de rien ; une
// fonctionnalité qui dépend d'autres descend d'un niveau sous la plus basse de ses dépendances
// (arête `dependsOn` : source = la dépendante, target = sa dépendance — la flèche remonte).
//
// Inter-modules (décision Hugo, 2026-07-16) : seules les dépendances INTRA-module structurent
// l'arbre. Une dépendance EXTERNE (fonctionnalité d'un autre module, ou racine) ne fixe pas le
// niveau mais pousse la carte au moins un niveau sous les racines — elle n'est pas « sans
// dépendance » ; le lien lui-même reste rendu par les pastilles portail.

export interface TreeDep {
  /** La dépendante (source de l'arête `dependsOn`). */
  source: string
  /** Sa dépendance (target de l'arête). */
  target: string
}

/** Une carte à placer : hauteur réelle/estimée + clés d'ordre (positions stockées ou curseur). */
export interface TreeItem {
  id: string
  h: number
  /** Clé d'ordre horizontal dans sa rangée (position.x stockée, ou x du curseur pendant un drag). */
  orderX: number
  /** Départage secondaire (position.y stockée — fait survivre l'ordre des anciennes piles). */
  orderY: number
}

export interface TreeRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TreeLayoutResult {
  /** Rect de chaque carte, RELATIF au coin haut-gauche de la zone de contenu du module. */
  rects: Map<string, TreeRect>
  /** Ids par rangée visuelle (niveaux puis retours à la ligne), ordre gauche → droite. */
  rows: string[][]
  /** Largeur de la rangée la plus large et hauteur totale de l'arbre. */
  contentW: number
  contentH: number
}

/** Nombre max de cartes côte à côte dans un niveau avant retour à la ligne (module contenu). */
export const TREE_MAX_COLS = 3

// ── Géométrie des modules (source unique — le canvas la ré-exporte, le store l'importe sans cycle) ──
export const MODULE_WIDTH = 300
export const MODULE_HEADER_H = 42
export const MODULE_PAD_X = 12
export const MODULE_PAD_BOTTOM = 14
/** Décalage vertical de la 1re fonctionnalité sous l'en-tête du module. */
export const MODULE_CONTENT_TOP = MODULE_HEADER_H + 12
/** Largeur d'une carte fonctionnalité (inset dans le module). */
export const FEATURE_CARD_WIDTH = MODULE_WIDTH - 2 * MODULE_PAD_X
/** Écart (monde) entre deux modules, horizontal et vertical — l'espacement n'est plus manuel. */
export const MODULE_GAP = 40

/**
 * Taille AUTO d'un module autour de son arbre : `max(contenu, taille minimale fixée à la main)`.
 * Le resize manuel n'est qu'un plancher : le contenu peut toujours pousser le module plus grand.
 */
export function moduleAutoSize(
  tree: TreeLayoutResult,
  manualW = 0,
  manualH = 0,
): { w: number; h: number } {
  return {
    w: Math.max(MODULE_WIDTH, tree.contentW + 2 * MODULE_PAD_X, manualW),
    h: Math.max(
      MODULE_CONTENT_TOP + 48,
      MODULE_CONTENT_TOP + tree.contentH + MODULE_PAD_BOTTOM,
      manualH,
    ),
  }
}

/** Un module à placer : taille dérivée + clés d'ordre (position stockée ou position glissée). */
export interface ModuleItem {
  id: string
  w: number
  h: number
  orderX: number
  orderY: number
}

export interface ModuleRowsResult {
  /** Position monde dérivée de chaque module (l'origine de la grille est 0,0). */
  pos: Map<string, { x: number; y: number }>
  /** Ids par rangée, ordre gauche → droite. */
  rows: string[][]
}

/**
 * Layout AUTO des modules : rangées horizontales, jamais de chevauchement. Les positions stockées ne
 * sont que des CLÉS : l'appartenance à une rangée se décide par recouvrement des intervalles
 * verticaux `[orderY, orderY+h)` (une disposition sur plusieurs lignes survit ; glisser un module
 * SOUS toutes les rangées en crée une nouvelle), l'ordre dans la rangée par (orderX, orderY, id).
 * Rangées empilées (hauteur = module le plus haut) et modules espacés de MODULE_GAP, depuis (0,0).
 */
export function moduleRowsLayout(items: readonly ModuleItem[]): ModuleRowsResult {
  type Row = { items: ModuleItem[]; top: number; bottom: number }
  const rows: Row[] = []
  for (const it of [...items].sort((a, b) => a.orderY - b.orderY || a.orderX - b.orderX)) {
    const row = rows.find((r) => it.orderY < r.bottom && r.top < it.orderY + it.h)
    if (row) {
      row.items.push(it)
      row.top = Math.min(row.top, it.orderY)
      row.bottom = Math.max(row.bottom, it.orderY + it.h)
    } else {
      rows.push({ items: [it], top: it.orderY, bottom: it.orderY + it.h })
    }
  }
  rows.sort((a, b) => a.top - b.top)
  const pos = new Map<string, { x: number; y: number }>()
  const outRows: string[][] = []
  let y = 0
  for (const row of rows) {
    row.items.sort((a, b) => a.orderX - b.orderX || a.orderY - b.orderY || a.id.localeCompare(b.id))
    let x = 0
    let rowH = 0
    for (const it of row.items) {
      pos.set(it.id, { x, y })
      x += it.w + MODULE_GAP
      rowH = Math.max(rowH, it.h)
    }
    outRows.push(row.items.map((it) => it.id))
    y += rowH + MODULE_GAP
  }
  return { pos, rows: outRows }
}

/**
 * Sépare les arêtes `dependsOn` fonctionnalité→fonctionnalité d'un module : celles dont les DEUX
 * bouts sont membres (`intra`, elles structurent l'arbre) et l'ensemble des membres ayant au moins
 * une dépendance EXTERNE (`hasExternalDep`, descente minimale d'un niveau).
 */
export function splitFeatureDeps(
  memberIds: ReadonlySet<string>,
  allDeps: readonly TreeDep[],
): { intra: TreeDep[]; hasExternalDep: Set<string> } {
  const intra: TreeDep[] = []
  const hasExternalDep = new Set<string>()
  for (const d of allDeps) {
    if (!memberIds.has(d.source)) continue
    if (memberIds.has(d.target)) intra.push(d)
    else hasExternalDep.add(d.source)
  }
  return { intra, hasExternalDep }
}

/**
 * Niveau de chaque fonctionnalité : 0 = ne dépend de rien ; sinon 1 + max(niveau des dépendances
 * intra). Une dépendance externe garantit un niveau ≥ 1. Les cycles (non interdits par les
 * invariants) sont coupés en ignorant l'arête retour — le calcul termine toujours.
 */
export function featureLevels(
  ids: readonly string[],
  deps: readonly TreeDep[],
  hasExternalDep: ReadonlySet<string>,
): Map<string, number> {
  const members = new Set(ids)
  const depsOf = new Map<string, string[]>()
  for (const d of deps) {
    if (!members.has(d.source) || !members.has(d.target)) continue
    const a = depsOf.get(d.source)
    if (a) a.push(d.target)
    else depsOf.set(d.source, [d.target])
  }
  const memo = new Map<string, number>()
  const onStack = new Set<string>()
  const levelOf = (id: string): number => {
    const m = memo.get(id)
    if (m !== undefined) return m
    if (onStack.has(id)) return -1 // arête retour d'un cycle : ignorée (max avec -1 est neutre)
    onStack.add(id)
    let lvl = 0
    for (const t of depsOf.get(id) ?? []) lvl = Math.max(lvl, levelOf(t) + 1)
    if (hasExternalDep.has(id)) lvl = Math.max(lvl, 1)
    onStack.delete(id)
    memo.set(id, lvl)
    return lvl
  }
  const out = new Map<string, number>()
  for (const id of ids) out.set(id, levelOf(id))
  return out
}

/** Tri d'une rangée : clé x, puis clé y, puis id (stable et prévisible). */
function sortRow(group: TreeItem[]): TreeItem[] {
  return group.sort((a, b) => a.orderX - b.orderX || a.orderY - b.orderY || a.id.localeCompare(b.id))
}

/**
 * Rendu d'une suite de GROUPES ordonnés en rangées : retour à la ligne au-delà de TREE_MAX_COLS
 * cartes, chaque rangée centrée dans `max(innerW, largeur de la plus large)`, hauteur de rangée =
 * carte la plus haute, `gap` entre cartes et entre rangées.
 */
function renderRows(
  groups: readonly TreeItem[][],
  cardW: number,
  gap: number,
  innerW: number,
): TreeLayoutResult {
  const rows: TreeItem[][] = []
  for (const group of groups) {
    for (let i = 0; i < group.length; i += TREE_MAX_COLS) rows.push(group.slice(i, i + TREE_MAX_COLS))
  }
  const rowW = (n: number): number => n * cardW + (n - 1) * gap
  const contentW = rows.reduce((w, r) => Math.max(w, rowW(r.length)), 0)
  const W = Math.max(innerW, contentW)
  const rects = new Map<string, TreeRect>()
  const outRows: string[][] = []
  let y = 0
  for (const row of rows) {
    const x0 = Math.max(0, Math.round((W - rowW(row.length)) / 2))
    let rowH = 0
    row.forEach((it, i) => {
      rects.set(it.id, { x: x0 + i * (cardW + gap), y, w: cardW, h: it.h })
      rowH = Math.max(rowH, it.h)
    })
    outRows.push(row.map((it) => it.id))
    y += rowH + gap
  }
  return { rects, rows: outRows, contentW, contentH: rows.length ? y - gap : 0 }
}

/**
 * Layout en ARBRE d'un module : rangées = niveaux de dépendance (racines en haut, chaque
 * dépendante sous ses dépendances, une dépendance externe pousse au moins un niveau sous les
 * racines). Utilisé par « Réorganiser » (store.arrangeFunctional) pour normaliser les positions
 * stockées sur les paliers déduits des arêtes.
 */
export function treeLayout(
  items: readonly TreeItem[],
  deps: readonly TreeDep[],
  hasExternalDep: ReadonlySet<string>,
  cardW: number,
  gap: number,
  innerW = 0,
): TreeLayoutResult {
  const levels = featureLevels(
    items.map((i) => i.id),
    deps,
    hasExternalDep,
  )
  const byLevel = new Map<number, TreeItem[]>()
  for (const it of items) {
    const lvl = levels.get(it.id) ?? 0
    const g = byLevel.get(lvl)
    if (g) g.push(it)
    else byLevel.set(lvl, [it])
  }
  const groups = [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((lvl) => sortRow(byLevel.get(lvl) as TreeItem[]))
  return renderRows(groups, cardW, gap, innerW)
}

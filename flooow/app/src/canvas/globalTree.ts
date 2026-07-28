/**
 * Layout GLOBAL de la couche fonctionnelle — portage fidèle de la maquette validée
 * (artefact « explorations d'affichage de l'arbre de compétence », mode « Rangées »).
 *
 * Modèle : l'axe primaire est le NIVEAU DE DÉPENDANCE, calculé sur le graphe ENTIER. Une rangée =
 * un niveau, de longueur libre. Le lot et le module ne sont PAS des conteneurs : ce sont des
 * compartiments optionnels, dérivés du placement et dessinés DERRIÈRE les cartes.
 *
 * C'est l'inverse du modèle précédent (`featureTree.ts`), où chaque module était une boîte qui
 * calculait ses propres niveaux internes : les niveaux n'y étaient donc jamais comparables d'un
 * module à l'autre. Ici le niveau 3 est à la même ordonnée partout sur le canvas.
 */

/** Écart horizontal entre deux cartes d'un même niveau. */
export const GAP_X = 40
/** Écart vertical entre deux niveaux. */
export const GAP_Y = 64
/** Marge autour du monde en disposition libre (sans compartiment). */
export const PAD = 60

// ── Compartiments (maquette : bac de lot ⊃ sous-bac de module) ────────────────────────────────
/** Marge intérieure d'un bac de lot, autour de ses sous-bacs. */
const INNER = 28
/**
 * Marge intérieure d'un sous-bac de module, autour de ses cartes. NE PAS désolidariser de
 * `MODULE_PAD_X` / `MODULE_PAD_BOTTOM` (`featureTree.ts`, 12 et 14) : cette constante est
 * l'hypothèse que le LAYOUT fait sur le rembourrage réellement dessiné par `ModuleFrame.vue`. La
 * gonfler ici n'aérerait pas le sous-bac, elle décalerait le cadre par rapport à ses cartes.
 */
const MPAD = 14
/**
 * Hauteur réservée au libellé d'un bac de LOT (simple étiquette dessinée dans le cadre).
 * Le bac de MODULE, lui, est un vrai composant avec un en-tête : sa hauteur vient des options
 * (`moduleHeaderH`), sinon les cartes du niveau 0 mordent sur cet en-tête.
 *
 * Doit rester nettement supérieur à la hauteur du texte du libellé (`LotFrame.vue` : ~15px de
 * glyphes sous 10px de `padding-top`, soit ~25px) : le reste est la respiration sous l'étiquette,
 * sans laquelle le premier sous-bac de module vient coller au nom du lot.
 */
const LOT_LABEL = 46
/** Marges du monde en disposition compartimentée. */
const LEFT = 40
const TOPM = 40

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface GlobalItem {
  id: string
  /** Hauteur réelle (mesurée) ou estimée de la carte. */
  h: number
  lot: number
  /** `null` = pas de module (groupe « — » en dernière colonne, comme la maquette). */
  module: string | null
  /** Prérequis : les ids hors du jeu courant sont ignorés (cf. `computeLevels`). */
  deps: readonly string[]
}

export interface Container {
  kind: 'lot' | 'module'
  /** Identifiant stable du compartiment (clé de rendu). */
  key: string
  label: string
  /** Lot du bac (un sous-bac de module hérite du lot de sa colonne) — pilote la couleur. */
  lot: number
  x: number
  y: number
  w: number
  h: number
  /**
   * Vue par module seulement : ce cadre est un module EXTERNE, réduit aux seules cartes liées au
   * module affiché. C'est la même chose qu'un cadre de module (mêmes proportions, même en-tête),
   * pas un autre objet — d'où un simple drapeau plutôt qu'un `kind` à part : le rendu n'a qu'à
   * désaturer et pointiller, il n'a rien de nouveau à savoir dessiner.
   */
  satellite?: boolean
}

export interface GlobalLayoutOptions {
  groupByLot: boolean
  groupByModule: boolean
  /** Aère la séparation entre lots (interrupteur « Espacer les lots »). */
  spaceLots: boolean
  cardW: number
  /**
   * Hauteur de l'en-tête du composant module, sous lequel commencent ses cartes. Doit refléter le
   * rendu réel (`MODULE_CONTENT_TOP`) : trop petit, le niveau 0 déborde sur l'en-tête.
   */
  moduleHeaderH: number
  /**
   * VUE PAR MODULE : identifiant du module affiché. Renseigné, il prend le pas sur `groupByLot` /
   * `groupByModule` — on ne dessine plus le plan entier mais une seule page, et les compartiments
   * de lot n'auraient plus rien à compartimenter.
   */
  focusModule?: string | null
}

export interface GlobalLayout {
  rect: Map<string, Rect>
  /** Bacs à dessiner DERRIÈRE les cartes, bac de lot avant ses sous-bacs (donc dessous). */
  containers: Container[]
  levels: Map<string, number>
  w: number
  h: number
}

/**
 * Niveau de chaque carte = plus LONG chemin depuis une racine (`0` = ne dépend de rien, sinon
 * `1 + max(niveau des prérequis)`), calculé sur l'ensemble du jeu.
 *
 * Deux règles reprises de la maquette : une dépendance vers un id absent du jeu est IGNORÉE (elle
 * ne pousse pas d'un niveau), et les cycles sont coupés par la pile de récursion. Les cycles sont
 * déjà interdits par l'invariant `DEPENDS_CYCLE` : cette branche est purement défensive, elle
 * garantit seulement que le calcul termine.
 */
export function computeLevels(items: readonly GlobalItem[]): Map<string, number> {
  const byId = new Map(items.map((it) => [it.id, it]))
  const memo = new Map<string, number>()
  const onStack = new Set<string>()
  const levelOf = (id: string): number => {
    const m = memo.get(id)
    if (m !== undefined) return m
    if (onStack.has(id)) return -1 // arête retour : neutre pour le `max` ci-dessous
    onStack.add(id)
    let lvl = 0
    for (const d of byId.get(id)?.deps ?? []) {
      if (byId.has(d)) lvl = Math.max(lvl, levelOf(d) + 1)
    }
    onStack.delete(id)
    memo.set(id, lvl)
    return lvl
  }
  const out = new Map<string, number>()
  for (const it of items) out.set(it.id, levelOf(it.id))
  return out
}

/**
 * Ordre horizontal dans chaque niveau, par BARYCENTRE des prérequis : une carte se place à la
 * moyenne des positions de ses prérequis dans le niveau au-dessus, ce qui réduit les croisements de
 * fils. Le premier niveau garde l'ordre d'entrée ; une carte sans prérequis placé part en fin de
 * rangée. Une seule passe descendante (comme la maquette), pas de raffinement itératif.
 */
export function orderedByLevel(
  items: readonly GlobalItem[],
  levels: Map<string, number>,
): { byLevel: Map<number, string[]>; levels: number[] } {
  const byId = new Map(items.map((it) => [it.id, it]))
  const byLevel = new Map<number, string[]>()
  for (const it of items) {
    const l = levels.get(it.id) ?? 0
    const a = byLevel.get(l)
    if (a) a.push(it.id)
    else byLevel.set(l, [it.id])
  }
  const ordered = [...byLevel.keys()].sort((a, b) => a - b)
  const pos = new Map<string, number>()
  const bary = (id: string): number => {
    const ps = (byId.get(id)?.deps ?? [])
      .map((d) => pos.get(d))
      .filter((v): v is number => v != null)
    return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : Number.MAX_SAFE_INTEGER
  }
  ordered.forEach((l, i) => {
    const ids = (byLevel.get(l) as string[]).slice()
    // `sort` est stable : à barycentre égal, l'ordre d'entrée est conservé.
    if (i > 0) ids.sort((a, b) => bary(a) - bary(b))
    ids.forEach((id, idx) => pos.set(id, idx))
    byLevel.set(l, ids)
  })
  return { byLevel, levels: ordered }
}

/** Hauteur de chaque niveau (carte la plus haute) et ordonnée de sa rangée. */
function rowGeometry(
  items: readonly GlobalItem[],
  levels: Map<string, number>,
  startY: number,
): { levelList: number[]; rowTop: Map<number, number>; bottom: number } {
  const hById = new Map(items.map((it) => [it.id, it.h]))
  const rowH = new Map<number, number>()
  for (const it of items) {
    const l = levels.get(it.id) ?? 0
    rowH.set(l, Math.max(rowH.get(l) ?? 0, hById.get(it.id) ?? 0))
  }
  // Seuls les niveaux réellement peuplés sont itérés : un niveau vide ne laisse pas de trou.
  const levelList = [...rowH.keys()].sort((a, b) => a - b)
  const rowTop = new Map<number, number>()
  let y = startY
  for (const l of levelList) {
    rowTop.set(l, y)
    y += (rowH.get(l) ?? 0) + GAP_Y
  }
  return { levelList, rowTop, bottom: y - GAP_Y }
}

/**
 * Disposition LIBRE (aucun regroupement) : une rangée par niveau, chaque rangée centrée sur la plus
 * large du graphe. Aucun retour à la ligne — une rangée est aussi longue que son niveau l'exige.
 */
function layoutFlow(
  items: readonly GlobalItem[],
  levels: Map<string, number>,
  opts: GlobalLayoutOptions,
): GlobalLayout {
  const { cardW, spaceLots } = opts
  const { byLevel, levels: levelList } = orderedByLevel(items, levels)
  const lotOf = new Map(items.map((it) => [it.id, it.lot]))
  const hOf = new Map(items.map((it) => [it.id, it.h]))
  /** Supplément d'écart à chaque changement de lot dans la rangée (« Espacer les lots »). */
  const LG = spaceLots ? 96 : 0
  const lotRank = new Map(
    [...new Set(items.map((it) => it.lot))].sort((a, b) => a - b).map((l, i) => [l, i]),
  )

  const rows = new Map<number, string[]>()
  for (const l of levelList) {
    const ids = (byLevel.get(l) as string[]).slice()
    if (spaceLots) {
      // Regrouper visuellement les lots dans la rangée ; le barycentre départage à lot égal.
      const base = new Map(ids.map((id, i) => [id, i]))
      ids.sort(
        (a, b) =>
          (lotRank.get(lotOf.get(a) as number) as number) -
            (lotRank.get(lotOf.get(b) as number) as number) ||
          (base.get(a) as number) - (base.get(b) as number),
      )
    }
    rows.set(l, ids)
  }

  const rowWidth = (ids: readonly string[]): number => {
    let w = 0
    let prev: number | null = null
    ids.forEach((id, i) => {
      if (i > 0) w += GAP_X + (spaceLots && lotOf.get(id) !== prev ? LG : 0)
      w += cardW
      prev = lotOf.get(id) as number
    })
    return w
  }
  const rw = new Map<number, number>()
  let maxRowW = 0
  for (const l of levelList) {
    const w = rowWidth(rows.get(l) as string[])
    rw.set(l, w)
    maxRowW = Math.max(maxRowW, w)
  }

  const rect = new Map<string, Rect>()
  let y = PAD
  for (const l of levelList) {
    const ids = rows.get(l) as string[]
    let x = PAD + (maxRowW - (rw.get(l) as number)) / 2
    let rowH = 0
    let prev: number | null = null
    ids.forEach((id, i) => {
      if (i > 0) x += GAP_X + (spaceLots && lotOf.get(id) !== prev ? LG : 0)
      const h = hOf.get(id) ?? 0
      rect.set(id, { x, y, w: cardW, h })
      x += cardW
      rowH = Math.max(rowH, h)
      prev = lotOf.get(id) as number
    })
    y += rowH + GAP_Y
  }
  return {
    rect,
    containers: [],
    levels,
    w: maxRowW + PAD * 2,
    h: levelList.length ? y - GAP_Y + PAD : PAD * 2,
  }
}

/** Une cellule (lot × module) : ses cartes par niveau, et la largeur de son niveau le plus peuplé. */
function buildCell(
  ids: readonly string[],
  levels: Map<string, number>,
  orderIdx: Map<string, number>,
  cardW: number,
): { byL: Map<number, string[]>; w: number } {
  const byL = new Map<number, string[]>()
  for (const id of ids) {
    const l = levels.get(id) ?? 0
    const a = byL.get(l)
    if (a) a.push(id)
    else byL.set(l, [id])
  }
  let w = cardW
  for (const a of byL.values()) {
    a.sort((p, q) => (orderIdx.get(p) ?? 0) - (orderIdx.get(q) ?? 0))
    w = Math.max(w, a.length * cardW + (a.length - 1) * GAP_X)
  }
  return { byL, w }
}

/**
 * Disposition COMPARTIMENTÉE : une grille dont les LIGNES sont les niveaux globaux et les COLONNES
 * les groupes (lot, puis module à l'intérieur). Les niveaux restent alignés d'une colonne à
 * l'autre — c'est tout l'intérêt : le niveau 3 est à la même hauteur dans le lot 1 et dans le lot 5.
 *
 * Les bacs sont DÉRIVÉS de ce placement (mêmes curseurs, mêmes largeurs de cellule) et n'imposent
 * jamais rien aux cartes.
 */
function layoutBands(
  items: readonly GlobalItem[],
  levels: Map<string, number>,
  opts: GlobalLayoutOptions,
): GlobalLayout {
  const { cardW, groupByLot, groupByModule, spaceLots, moduleHeaderH } = opts
  const LOTGAP = spaceLots ? 120 : 52
  const MODGAP = spaceLots ? 40 : 26

  const { byLevel, levels: levelOrder } = orderedByLevel(items, levels)
  const orderIdx = new Map<string, number>()
  for (const l of levelOrder) {
    ;(byLevel.get(l) as string[]).forEach((id, i) => orderIdx.set(id, i))
  }

  // Une colonne de module n'existe que si on groupe par module ET qu'au moins une carte en a un.
  const hasMod = groupByModule && items.some((it) => it.module)
  const lotLabelH = groupByLot ? LOT_LABEL : 0
  const modLabelH = hasMod ? moduleHeaderH : 0
  const { rowTop, bottom } = rowGeometry(items, levels, TOPM + lotLabelH + modLabelH)

  const rect = new Map<string, Rect>()
  const containers: Container[] = []
  const modBox = hasMod ? MPAD : 0
  /**
   * Bas du CONTENU d'un bac de lot : le bas du sous-bac de module (qui déborde déjà de `MPAD` sous
   * sa dernière carte), pas le bas des cartes. Sans ce relais, le bac de lot se fermait à
   * `bottom + INNER` alors que ses sous-bacs descendaient à `bottom + MPAD` : la marge basse réelle
   * valait `INNER - MPAD`, soit une respiration bien plus courte en bas que sur les côtés.
   */
  const contentBottom = bottom + modBox
  const hOf = new Map(items.map((it) => [it.id, it.h]))

  const placeCell = (cell: { byL: Map<number, string[]>; w: number }, x: number): void => {
    for (const [l, arr] of cell.byL) {
      const rowW = arr.length * cardW + (arr.length - 1) * GAP_X
      let x0 = x + (cell.w - rowW) / 2
      for (const id of arr) {
        rect.set(id, { x: x0, y: rowTop.get(l) as number, w: cardW, h: hOf.get(id) ?? 0 })
        x0 += cardW + GAP_X
      }
    }
  }

  // Colonnes de premier rang : les lots (ordre croissant) ou une colonne unique.
  const lots = groupByLot
    ? [...new Set(items.map((it) => it.lot))].sort((a, b) => a - b)
    : [null as number | null]

  let x = LEFT
  for (const lot of lots) {
    const lotItems = lot == null ? items.slice() : items.filter((it) => it.lot === lot)
    if (!lotItems.length) continue

    // Sous-colonnes : les modules, dans leur ORDRE D'APPARITION (un module présent dans deux lots
    // apparaît donc une fois par bac). Le groupe sans module ferme la marche, libellé « — ».
    const mods: (string | null)[] = hasMod
      ? [...new Set(lotItems.filter((it) => it.module).map((it) => it.module as string))]
      : [null]
    if (hasMod && lotItems.some((it) => !it.module)) mods.push(null)

    const cells = mods.map((mod) => {
      // Sans colonne de module, l'unique cellule prend toutes les cartes du lot.
      const ids = (hasMod ? lotItems.filter((it) => (it.module ?? null) === mod) : lotItems).map(
        (it) => it.id,
      )
      return { mod, cell: buildCell(ids, levels, orderIdx, cardW) }
    })

    const lotContentW =
      cells.reduce((s, c) => s + c.cell.w + 2 * modBox, 0) +
      Math.max(0, cells.length - 1) * (hasMod ? MODGAP : 0)
    const lotX = x
    const lotW = 2 * INNER + lotContentW

    if (groupByLot && lot != null) {
      containers.push({
        kind: 'lot',
        key: `lot-${lot}`,
        label: `Lot ${lot}`,
        lot,
        x: lotX,
        y: TOPM,
        w: lotW,
        h: contentBottom + INNER - TOPM,
      })
    }

    let mx = lotX + INNER
    for (const c of cells) {
      placeCell(c.cell, mx + modBox)
      if (hasMod) {
        containers.push({
          kind: 'module',
          key: `mod-${lot ?? 'all'}-${c.mod ?? '—'}`,
          label: c.mod ?? '—',
          lot: lot ?? 1,
          x: mx,
          y: TOPM + lotLabelH,
          w: c.cell.w + 2 * modBox,
          h: bottom + MPAD - (TOPM + lotLabelH),
        })
      }
      mx += c.cell.w + 2 * modBox + (hasMod ? MODGAP : 0)
    }
    x = lotX + lotW + LOTGAP
  }

  return {
    rect,
    containers,
    levels,
    w: x - LOTGAP + LEFT,
    h: contentBottom + INNER + TOPM,
  }
}

// ── Vue par module (« une page = un module ») ────────────────────────────────────────────────
/** Marge gauche du monde en vue par module : la gouttière qui accueille les repères de niveau. */
const FOCUS_LEFT = 96
/** Marge haute du monde en vue par module (au-dessus du cadre du module affiché). */
const FOCUS_TOP = 40
/** Écart horizontal entre deux colonnes (module affiché ↔ satellite, ou satellite ↔ satellite). */
const COL_GAP = 64
/** Marge intérieure horizontale d'un cadre de module (miroir de `MODULE_PAD_X`). */
const FOCUS_MOD_PAD_X = 12
/** Marge intérieure basse d'un cadre de module (miroir de `MODULE_PAD_BOTTOM`). */
const FOCUS_MOD_PAD_BOTTOM = 14

/**
 * Disposition « VUE PAR MODULE » — portage de la maquette validée `vue-par-module.html`.
 *
 * On n'affiche plus le plan entier mais UNE page : le module ciblé au centre, et autour de lui les
 * seules cartes d'autres modules qui le touchent DIRECTEMENT (dans un sens ou dans l'autre). Ces
 * modules externes deviennent des « satellites » : un cadre réduit à ces cartes-là, amont à gauche,
 * aval à droite.
 *
 * Deux propriétés font tout l'intérêt du mode, et aucune n'est décorative :
 *
 *  - les rangées restent les niveaux GLOBAUX. Un satellite se pose donc au niveau RÉEL de sa carte,
 *    pas en haut de l'écran : on lit d'un coup d'œil qu'un prérequis externe arrive tard dans la
 *    chaîne. C'est précisément ce que le layout par module de `featureTree.ts` ne pouvait pas dire ;
 *  - seuls les niveaux réellement peuplés sont dessinés. Un module dont les cartes vivent aux
 *    niveaux 3 à 5 ne traîne pas trois rangées vides au-dessus de lui.
 *
 * La latéralité (amont/aval) porte le « ça vient d'ailleurs » ; le sens du déblocage, lui, reste
 * vertical partout, comme en vue plan.
 */
function layoutModuleFocus(
  items: readonly GlobalItem[],
  levels: Map<string, number>,
  opts: GlobalLayoutOptions,
): GlobalLayout {
  const { cardW, moduleHeaderH, focusModule } = opts
  const empty: GlobalLayout = { rect: new Map(), containers: [], levels, w: 0, h: 0 }

  const byId = new Map(items.map((it) => [it.id, it]))
  const inMod = items.filter((it) => it.module === focusModule)
  if (!inMod.length) return empty // module vide ou inconnu : rien à poser
  const inSet = new Set(inMod.map((it) => it.id))

  // Cartes EXTERNES directement liées, et de quel côté les poser. Une arête va du prérequis vers ce
  // qu'il débloque : le prérequis externe est en AMONT, le dépendant externe en AVAL. Une carte à la
  // fois amont et aval (elle dépend du module ET l'alimente) est tranchée par la dernière arête
  // rencontrée — un tel cas n'a de toute façon pas de bon côté, l'arbitrer coûterait plus qu'il ne
  // rapporte.
  const ext = new Map<string, 'up' | 'down'>()
  for (const it of items) {
    for (const dep of it.deps) {
      if (!byId.has(dep)) continue
      if (inSet.has(it.id) && !inSet.has(dep)) ext.set(dep, 'up')
      if (inSet.has(dep) && !inSet.has(it.id)) ext.set(it.id, 'down')
    }
  }

  const shown = [...inMod, ...[...ext.keys()].map((id) => byId.get(id) as GlobalItem)]
  const levelOf = (id: string): number => levels.get(id) ?? 0

  // Ordre horizontal DANS une rangée : le barycentre calculé sur le sous-ensemble affiché (même
  // règle qu'en vue plan), pour ne pas croiser les fils sans raison.
  const { byLevel, levels: shownLevels } = orderedByLevel(shown, levels)
  const orderIdx = new Map<string, number>()
  for (const l of shownLevels) (byLevel.get(l) as string[]).forEach((id, i) => orderIdx.set(id, i))
  const byOrder = (a: GlobalItem, b: GlobalItem): number =>
    (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0)

  // Rangées : niveaux globaux, mais uniquement ceux qui portent une carte affichée.
  const rowH = new Map<number, number>()
  for (const f of shown) rowH.set(levelOf(f.id), Math.max(rowH.get(levelOf(f.id)) ?? 0, f.h))
  const rowTop = new Map<number, number>()
  let y = FOCUS_TOP + moduleHeaderH
  for (const l of shownLevels) {
    rowTop.set(l, y)
    y += (rowH.get(l) as number) + GAP_Y
  }
  const contentBottom = y - GAP_Y

  const rowWidth = (n: number): number => n * cardW + (n - 1) * GAP_X

  /**
   * Largeur d'un cadre : sa rangée la plus large. Factorisée parce que la pré-passe (qui décide
   * l'abscisse du centre) et le placement DOIVENT s'accorder au pixel près — sinon la colonne
   * centrale ne tombe pas là où les satellites l'attendent.
   */
  const frameWidth = (fs: readonly GlobalItem[]): number => {
    const per = new Map<number, number>()
    for (const f of fs) per.set(levelOf(f.id), (per.get(levelOf(f.id)) ?? 0) + 1)
    let w = cardW
    for (const n of per.values()) w = Math.max(w, rowWidth(n))
    return w + 2 * FOCUS_MOD_PAD_X
  }

  // Largeur du CENTRE : sa rangée la plus large. `shownLevels` contient aussi les niveaux amenés par
  // les satellites, où le module courant n'a parfois aucune carte — d'où le repli sur `cardW` plutôt
  // qu'un 0 qui écraserait le cadre.
  let centerW = cardW
  {
    const per = new Map<number, number>()
    for (const f of inMod) per.set(levelOf(f.id), (per.get(levelOf(f.id)) ?? 0) + 1)
    for (const n of per.values()) centerW = Math.max(centerW, rowWidth(n))
  }

  const rect = new Map<string, Rect>()
  const containers: Container[] = []
  const extItems = shown.filter((f) => ext.has(f.id))
  const modsOf = (dir: 'up' | 'down'): (string | null)[] => [
    ...new Set(extItems.filter((f) => ext.get(f.id) === dir).map((f) => f.module)),
  ]
  const upMods = modsOf('up')
  const downMods = modsOf('down')
  const satOf = (mod: string | null): GlobalItem[] =>
    extItems.filter((f) => f.module === mod).sort(byOrder)

  /** Pré-passe : la largeur totale d'une colonne de satellites, gouttières comprises. */
  const colW = (mods: readonly (string | null)[]): number =>
    mods.reduce((s, m) => {
      const fs = satOf(m)
      return fs.length ? s + frameWidth(fs) + COL_GAP : s
    }, 0)

  const centerX = FOCUS_LEFT + colW(upMods)
  const centerFrameW = centerW + 2 * FOCUS_MOD_PAD_X

  containers.push({
    kind: 'module',
    key: `focus-${focusModule}`,
    label: focusModule as string,
    lot: inMod[0]?.lot ?? 1,
    x: centerX,
    y: FOCUS_TOP,
    w: centerFrameW,
    h: contentBottom + FOCUS_MOD_PAD_BOTTOM - FOCUS_TOP,
  })
  for (const l of shownLevels) {
    const row = inMod.filter((f) => levelOf(f.id) === l).sort(byOrder)
    if (!row.length) continue
    let x = centerX + FOCUS_MOD_PAD_X + (centerW - rowWidth(row.length)) / 2
    for (const f of row) {
      rect.set(f.id, { x, y: rowTop.get(l) as number, w: cardW, h: f.h })
      x += cardW + GAP_X
    }
  }

  /** Pose une colonne de satellites depuis `x0`, en se déployant vers `dir` (−1 = vers la gauche). */
  const placeCol = (mods: readonly (string | null)[], x0: number, dir: 1 | -1): void => {
    let x = x0
    for (const mod of mods) {
      const fs = satOf(mod)
      if (!fs.length) continue
      const ls = [...new Set(fs.map((f) => levelOf(f.id)))].sort((a, b) => a - b)
      const w = frameWidth(fs)
      const fx = dir < 0 ? x - w : x
      // Le cadre satellite N'ENGLOBE QUE ses niveaux : il commence au niveau de sa PREMIÈRE carte et
      // s'arrête après la DERNIÈRE. C'est ce raccourci qui rend le niveau lisible — un cadre pleine
      // hauteur redirait « ce module existe » au lieu de « il intervient ICI ».
      const first = ls[0] as number
      const last = ls[ls.length - 1] as number
      const top = (rowTop.get(first) as number) - moduleHeaderH
      const bottom = (rowTop.get(last) as number) + (rowH.get(last) as number) + FOCUS_MOD_PAD_BOTTOM
      containers.push({
        kind: 'module',
        key: `sat-${mod ?? '—'}`,
        label: mod ?? '—',
        lot: fs[0]?.lot ?? 1,
        x: fx,
        y: top,
        w,
        h: bottom - top,
        satellite: true,
      })
      for (const l of ls) {
        const row = fs.filter((f) => levelOf(f.id) === l)
        let cx = fx + (w - rowWidth(row.length)) / 2
        for (const f of row) {
          rect.set(f.id, { x: cx, y: rowTop.get(l) as number, w: cardW, h: f.h })
          cx += cardW + GAP_X
        }
      }
      x += dir * (w + COL_GAP)
    }
  }
  placeCol(upMods, centerX - COL_GAP, -1)
  placeCol(downMods, centerX + centerFrameW + COL_GAP, 1)

  const right = [...rect.values()].reduce((m, r) => Math.max(m, r.x + r.w), 0)
  return {
    rect,
    containers,
    levels,
    w: right + FOCUS_LEFT,
    h: contentBottom + FOCUS_TOP * 2,
  }
}

/**
 * Point d'entrée : dispose l'ensemble des cartes fonctionnelles. En vue par module (`focusModule`
 * renseigné) on ne dessine qu'une page ; sinon, sans aucun regroupement actif on retombe sur le flux
 * global (aucun bac), et avec regroupement sur la grille compartimentée.
 */
export function globalTreeLayout(
  items: readonly GlobalItem[],
  opts: GlobalLayoutOptions,
): GlobalLayout {
  const levels = computeLevels(items)
  if (!items.length) return { rect: new Map(), containers: [], levels, w: 0, h: 0 }
  if (opts.focusModule) return layoutModuleFocus(items, levels, opts)
  return opts.groupByLot || opts.groupByModule
    ? layoutBands(items, levels, opts)
    : layoutFlow(items, levels, opts)
}

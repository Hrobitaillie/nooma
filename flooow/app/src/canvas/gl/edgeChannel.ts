// Canal arêtes DOM → GL (jalon 2 de la phase 2, plan-phase2-gl.md).
//
// Le pont de migration : chaque composant d'arête Vue Flow GARDE son rôle (routage par les ancres
// mesurées, sélection, clic → popover — toute l'interaction reste DOM) mais ne PEINT plus ; il
// publie ici sa spec visuelle, et le module GL (funcEdges.ts) dessine. Zéro duplication de
// géométrie : les coordonnées sont celles que Vue Flow calcule déjà (espace MONDE, le même que le
// conteneur `world` de la couche).
//
// Le signal de redraw est un abonnement COALESCÉ EN MICROTÂCHE, volontairement HORS réactivité
// Vue : 84 arêtes publient dans le même flush — un ref-compteur observé re-déclenchait le watcher
// du module GL au-delà de la limite de récursion du scheduler (« Maximum recursive updates »,
// constaté au premier montage). Ici, N publications d'un même tick = UNE synchronisation.
export interface GlEdgeSpec {
  /**
   * POLYLIGNE monde [x0,y0, x1,y1, …], échantillonnée par le composant d'arête depuis son propre
   * `d` SVG (samplePathD) : le GL trace exactement ce que le DOM aurait routé — Bézier, coudes
   * smoothstep, tout passe par le même chemin, aucune géométrie à répliquer.
   */
  pts: number[]
  /** Couleur du tracé (entier 0xRRGGBB). */
  color: number
  /** 0,15 = estompé (chaîne) ; 0,3 = navigation assoupie ; 1 = normal. */
  alpha: number
  width: number
  /** Motif [tiret, trou] en unités monde, `null` = trait plein. */
  dash: [number, number] | null
  /** Dérive du motif active (zoom ≥ 0,8, non estompé, motion autorisée). */
  animated: boolean
  /** Flèche côté SOURCE (« dépend de » : sens du déblocage), teintée comme le tracé. */
  arrowStart: boolean
  /** Flèche côté CIBLE (navigation), teintée comme le tracé. */
  arrowEnd: boolean
  /** Remplissage (formes fermées — bacs de lot) : peint sous le trait. */
  fill?: { color: number; alpha: number } | null
  /**
   * Calque de destination : `edges` (défaut) suit la visibilité LOD des arêtes ; `frames` reste
   * TOUJOURS visible et se peint dessous — les bacs de lot restent la carte des positions au
   * dézoom, exactement comme leurs nœuds DOM ne participaient pas au masquage LOD.
   */
  layer?: 'edges' | 'frames'
}

/** `d` d'un rectangle arrondi (sens horaire, fermé) — pour publier un cadre via samplePathD. */
export function roundedRectD(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2)
  return (
    `M ${x + rr} ${y} H ${x + w - rr} A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}` +
    ` V ${y + h - rr} A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}` +
    ` H ${x + rr} A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr}` +
    ` V ${y + rr} A ${rr} ${rr} 0 0 1 ${x + rr} ${y} Z`
  )
}

/**
 * Échantillonne un `d` SVG en polyligne monde (~un point tous les `step`, bornes incluses) via un
 * `<path>` DÉTACHÉ — l'API de géométrie SVG travaille hors DOM. L'élément est réutilisé : un seul
 * nœud pour toutes les arêtes de la session.
 */
const SAMPLE_STEP = 3.5
let probe: SVGPathElement | null = null
export function samplePathD(d: string, step = SAMPLE_STEP): number[] {
  if (!probe) probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  probe.setAttribute('d', d)
  const total = probe.getTotalLength()
  const n = Math.max(2, Math.ceil(total / step))
  const pts: number[] = []
  for (let i = 0; i <= n; i++) {
    const p = probe.getPointAtLength((total * i) / n)
    pts.push(p.x, p.y)
  }
  return pts
}

export const glEdgeSpecs = new Map<string, GlEdgeSpec>()
/** Ids réellement modifiés depuis la dernière synchro — le traceur ne redessine qu'eux. */
export const glEdgeDirty = new Set<string>()

const subscribers = new Set<() => void>()
let scheduled = false
function notify(): void {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    for (const cb of subscribers) cb()
  })
}

/** Abonne le module GL aux changements du canal (coalescés). Renvoie le désabonnement. */
export function onGlEdgesChanged(cb: () => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

/**
 * DÉDUPLICATION — le garde-fou du pan : les computeds de style des arêtes se réévaluent à chaque
 * image (le viewport est un objet NEUF par image), donc chaque composant republie une spec
 * IDENTIQUE 60 fois par seconde de geste. Sans ce compare, le traceur redessinait ~120 tracés par
 * image de pan (constaté : « déplacement laggy », retour Hugo). `pts` se compare par RÉFÉRENCE :
 * les publishers cachent leur polyligne par `d` — une géométrie inchangée est le même tableau.
 */
function sameSpec(a: GlEdgeSpec, b: GlEdgeSpec): boolean {
  return (
    a.pts === b.pts &&
    a.color === b.color &&
    a.alpha === b.alpha &&
    a.width === b.width &&
    a.animated === b.animated &&
    a.arrowStart === b.arrowStart &&
    a.arrowEnd === b.arrowEnd &&
    (a.dash === b.dash ||
      (a.dash != null && b.dash != null && a.dash[0] === b.dash[0] && a.dash[1] === b.dash[1])) &&
    ((a.fill ?? null) === (b.fill ?? null) ||
      (a.fill != null &&
        b.fill != null &&
        a.fill.color === b.fill.color &&
        a.fill.alpha === b.fill.alpha)) &&
    (a.layer ?? 'edges') === (b.layer ?? 'edges')
  )
}

export function setGlEdge(id: string, spec: GlEdgeSpec): void {
  const prev = glEdgeSpecs.get(id)
  if (prev && sameSpec(prev, spec)) return
  glEdgeSpecs.set(id, spec)
  glEdgeDirty.add(id)
  notify()
}

export function dropGlEdge(id: string): void {
  if (glEdgeSpecs.delete(id)) {
    glEdgeDirty.delete(id)
    notify()
  }
}

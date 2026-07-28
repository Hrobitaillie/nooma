// Traceur d'arêtes GL (jalons 2-3 de la phase 2) — dessine les polylignes publiées dans le canal
// (edgeChannel.ts) par TypedEdge et TreeEdge : tiretés par segments d'abscisse curviligne,
// flèches aux extrémités, estompage, et dérive du motif « dépend de » (l'équivalent GL de
// `stroke-dashoffset` — qui, en DOM, forçait un repeint de chaque tracé par image, cf. le seuil
// ZOOM_ANIM_MIN de TypedEdge ; ici la phase avance et le GPU recompose).
//
// La géométrie vient TOUTE des composants DOM (échantillonnage de leur propre `d` SVG) : parité
// de routage par construction, ce module ne connaît que des points.
import { Container, Graphics } from 'pixi.js'
import { glEdgeSpecs, glEdgeDirty, onGlEdgesChanged, type GlEdgeSpec } from './edgeChannel'
import type { GlLayer } from './useGlLayer'

/** Période de la dérive : parité DOM — dashoffset 16 (tiret 10 + trou 6) en 4 s, linéaire. */
const DRIFT_UNITS_PER_S = 16 / 4

interface EdgeDraw {
  g: Graphics
  /** Longueurs cumulées de la polyligne (cache — recalculé quand `spec.pts` change de référence). */
  pts: number[]
  lens: number[]
  total: number
  /** Boîte englobante monde (culling du tick d'animation). */
  minX: number
  minY: number
  maxX: number
  maxY: number
  spec: GlEdgeSpec
}

function relen(e: EdgeDraw): void {
  const pts = e.spec.pts
  const lens: number[] = [0]
  let total = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i * 2 + 1 < pts.length; i++) {
    const x = pts[i * 2]!
    const y = pts[i * 2 + 1]!
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (i > 0) {
      total += Math.hypot(x - pts[i * 2 - 2]!, y - pts[i * 2 - 1]!)
      lens.push(total)
    }
  }
  e.pts = pts
  e.lens = lens
  e.total = total
  e.minX = minX
  e.minY = minY
  e.maxX = maxX
  e.maxY = maxY
}

/** Point à l'abscisse curviligne `d` (0 = source) sur la polyligne cachée. */
function pointAt(e: EdgeDraw, d: number): [number, number] {
  const { pts, lens, total } = e
  const target = Math.max(0, Math.min(d, total))
  let i = 1
  while (i < lens.length - 1 && lens[i]! < target) i++
  const l0 = lens[i - 1]!
  const seg = lens[i]! - l0 || 1
  const t = (target - l0) / seg
  return [
    pts[(i - 1) * 2]! + (pts[i * 2]! - pts[(i - 1) * 2]!) * t,
    pts[(i - 1) * 2 + 1]! + (pts[i * 2 + 1]! - pts[(i - 1) * 2 + 1]!) * t,
  ]
}

/** Triangle de flèche à l'extrémité `at` (abscisse), orienté par la tangente locale. */
function drawArrow(e: EdgeDraw, g: Graphics, at: 'start' | 'end'): void {
  const d0 = at === 'start' ? 0 : e.total
  const dRef = at === 'start' ? Math.min(10, e.total) : Math.max(e.total - 10, 0)
  const [x1, y1] = pointAt(e, d0)
  const [x2, y2] = pointAt(e, dRef)
  // Pointe VERS l'extérieur du tracé (parité marqueurs DOM : auto-start-reverse côté source,
  // sens du chemin côté cible).
  const ang = Math.atan2(y1 - y2, x1 - x2)
  const L = 9
  const W = 3.5
  g.moveTo(x1 + Math.cos(ang) * L * 0.4, y1 + Math.sin(ang) * L * 0.4)
  g.lineTo(
    x1 - Math.cos(ang) * L * 0.6 - Math.sin(ang) * W,
    y1 - Math.sin(ang) * L * 0.6 + Math.cos(ang) * W,
  )
  g.lineTo(
    x1 - Math.cos(ang) * L * 0.6 + Math.sin(ang) * W,
    y1 - Math.sin(ang) * L * 0.6 - Math.cos(ang) * W,
  )
  g.closePath()
  g.fill(e.spec.color)
}

function drawEdge(e: EdgeDraw, phase: number): void {
  const { g, spec } = e
  const n = e.pts.length / 2 - 1
  g.clear()
  g.alpha = spec.alpha
  if (spec.fill) {
    g.poly(e.pts, true)
    g.fill({ color: spec.fill.color, alpha: spec.fill.alpha })
  }
  if (!spec.dash) {
    g.moveTo(e.pts[0]!, e.pts[1]!)
    for (let i = 1; i <= n; i++) g.lineTo(e.pts[i * 2]!, e.pts[i * 2 + 1]!)
    g.stroke({ width: spec.width, color: spec.color })
  } else {
    // Tiretés par segments d'abscisse curviligne. Phase POSITIVE = le motif remonte vers la
    // source (début du tracé) — parité avec `stroke-dashoffset: 16` croissant du DOM.
    const [dashLen, gapLen] = spec.dash
    const period = dashLen + gapLen
    let d = -(((phase % period) + period) % period)
    while (d < e.total) {
      const a = Math.max(d, 0)
      const b = Math.min(d + dashLen, e.total)
      if (b > a) {
        const [ax, ay] = pointAt(e, a)
        g.moveTo(ax, ay)
        // Le tiret suit la polyligne (pas une corde) : les sommets intermédiaires sont inclus.
        let i = 1
        while (i < e.lens.length && e.lens[i]! < b) {
          if (e.lens[i]! > a) g.lineTo(e.pts[i * 2]!, e.pts[i * 2 + 1]!)
          i++
        }
        const [bx, by] = pointAt(e, b)
        g.lineTo(bx, by)
      }
      d += period
    }
    g.stroke({ width: spec.width, color: spec.color })
  }
  if (spec.arrowStart) drawArrow(e, g, 'start')
  if (spec.arrowEnd) drawArrow(e, g, 'end')
}

/**
 * Monte le calque d'arêtes dans la couche et le tient synchronisé sur le canal : diff par id,
 * longueurs recalculées seulement quand la polyligne change de référence, dérive animée par
 * ticker démarré UNIQUEMENT quand au moins un motif est animé (le rendu reste à la demande sinon).
 */
export function mountGlEdges(layer: GlLayer): {
  setVisible: (v: boolean) => void
  dispose: () => void
} {
  const root = new Container()
  root.zIndex = -100 // au-dessus du fond (-1000) et des cadres (-200)
  layer.world.addChild(root)
  // Cadres (bacs de lot) : SOUS les arêtes, et exemptés du masquage LOD (setVisible) — au dézoom
  // ils SONT la carte des positions, comme leurs nœuds DOM ne participaient pas au LOD.
  const framesRoot = new Container()
  framesRoot.zIndex = -200
  layer.world.addChild(framesRoot)

  const draws = new Map<string, EdgeDraw>()
  let animating = false
  /**
   * Phase de dérive DÉRIVÉE DE L'HORLOGE et non accumulée : le motif reste juste quel que soit le
   * rythme (ticker jeté/repris, image sautée) — c'est ce qui autorise le tick à NE RIEN FAIRE
   * quand aucune arête animée n'est à l'écran, sans que le motif « saute » au retour.
   */
  const phaseNow = (): number => (performance.now() / 1000) * DRIFT_UNITS_PER_S
  /** Cadence de la dérive : ~30 img/s suffisent à un motif qui avance de 4 unités/s — le tick à
   *  60 brûlait du CPU en continu au repos (retour Hugo : ~30 % CPU quoi qu'il arrive). */
  const TICK_MIN_MS = 33
  let lastTickAt = 0

  function sync(): void {
    for (const [id, e] of draws) {
      if (!glEdgeSpecs.has(id)) {
        e.g.destroy()
        draws.delete(id)
      }
    }
    // Redraw LIMITÉ aux ids modifiés (glEdgeDirty) : pendant un zoom, seuls les tracés
    // contre-zoomés (arbre, navs) republient — les 84 « dépend de » ne se redessinent pas.
    for (const id of glEdgeDirty) {
      const spec = glEdgeSpecs.get(id)
      if (!spec) continue
      let e = draws.get(id)
      if (!e) {
        e = {
          g: new Graphics(),
          pts: [],
          lens: [],
          total: 0,
          minX: 0,
          minY: 0,
          maxX: 0,
          maxY: 0,
          spec,
        }
        ;(spec.layer === 'frames' ? framesRoot : root).addChild(e.g)
        draws.set(id, e)
      }
      const ptsChanged = e.pts !== spec.pts
      e.spec = spec
      if (ptsChanged) relen(e)
      drawEdge(e, spec.animated ? phaseNow() : 0)
    }
    glEdgeDirty.clear()
    layer.invalidate()
    let anyAnimated = false
    for (const e of draws.values()) {
      if (e.spec.animated) {
        anyAnimated = true
        break
      }
    }
    setAnimating(anyAnimated && root.visible)
  }

  function tick(): void {
    const now = performance.now()
    if (now - lastTickAt < TICK_MIN_MS) return
    lastTickAt = now
    // CULLING : seules les arêtes animées DONT LA BOÎTE CROISE L'ÉCRAN se redessinent — à zoom de
    // travail (≥ 0,8, seuil de l'animation), l'écran n'en montre qu'une poignée sur les 84.
    const { position, scale } = layer.world
    const wx0 = -position.x / scale.x
    const wy0 = -position.y / scale.y
    const wx1 = wx0 + layer.app.renderer.width / layer.app.renderer.resolution / scale.x
    const wy1 = wy0 + layer.app.renderer.height / layer.app.renderer.resolution / scale.y
    const phase = phaseNow()
    let drawnAny = false
    for (const e of draws.values()) {
      if (!e.spec.animated) continue
      if (e.maxX < wx0 || e.minX > wx1 || e.maxY < wy0 || e.minY > wy1) continue
      drawEdge(e, phase)
      drawnAny = true
    }
    if (drawnAny) layer.app.render()
  }
  function setAnimating(on: boolean): void {
    if (on === animating) return
    animating = on
    if (on) {
      layer.app.ticker.add(tick)
      layer.app.ticker.start()
    } else {
      layer.app.ticker.remove(tick)
      layer.app.ticker.stop()
    }
  }

  const off = onGlEdgesChanged(sync)
  sync()

  return {
    setVisible(v: boolean) {
      if (root.visible === v) return
      root.visible = v
      layer.invalidate()
      setAnimating(v && [...draws.values()].some((e) => e.spec.animated))
    },
    // Appelé par FlowCanvas au démontage (mount hors scope Vue : pas d'onScopeDispose possible).
    dispose() {
      off()
      setAnimating(false)
    },
  }
}

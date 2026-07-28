// Fond de grille en GL (jalon 1 de la phase 2) — remplace `<Background>` Vue Flow.
//
// Parité visuelle avec le fond DOM : points #cbd5e1, pas de 24 unités monde, rayon 1,4, masqué
// sous le seuil de LOD (0,35) — sous ce zoom les points font moins de 3 px d'écart, « ce n'est
// plus une grille, c'est un voile gris » (mesures et verdict dans FlowCanvas, phase 0).
//
// Pourquoi le DOM perdait : le `<rect>` SVG plein écran se REPEINT entier à chaque image de pan
// (33 ms/image avec, 22 sans — un tiers du budget, cf. FlowCanvas). Ici c'est UN quad GPU en
// `TilingSprite` : la texture d'une tuile est générée une fois, le tuilage et la transform de
// caméra sont gratuits — le coût par image devient nul quel que soit l'écran.
import { Graphics, Rectangle, TilingSprite, type Renderer } from 'pixi.js'
import type { VueFlowStore } from '@vue-flow/core'
import type { GlLayer } from './useGlLayer'

const GAP = 24 // pas de grille (unités monde) — parité <Background :gap="24">
const DOT_R = 1.4 // rayon d'un point — parité :size="1.4"
const COLOR = 0xcbd5e1 // gris slate-300 — parité color="#cbd5e1"
const ZOOM_MIN = 0.35 // seuil LOD : même bascule que le fond DOM (lowDetail)
/** Résolution de la texture d'une tuile : 4× le monde pour rester net jusqu'au zoom 4 (max Vue Flow). */
const TILE_SCALE = 4

/**
 * Installe la grille dans la couche et la tient cadrée sur le viewport : le sprite est posé en
 * coordonnées MONDE (le `world` porte la caméra) et recouvre exactement l'écran visible, ancré
 * sur un multiple du pas — le motif est stable dans le monde, comme le fond DOM.
 */
export function mountGlBackground(
  layer: GlLayer,
  vf: VueFlowStore,
  /** « Toujours afficher » (ui.fullCards) : vrai → la grille ne se masque jamais au dézoom. */
  isLodDisabled: () => boolean = () => false,
): { update: () => void } {
  const tile = new Graphics()
    .circle((GAP * TILE_SCALE) / 2, (GAP * TILE_SCALE) / 2, DOT_R * TILE_SCALE)
    .fill(COLOR)
  const texture = (layer.app.renderer as Renderer).generateTexture({
    target: tile,
    frame: new Rectangle(0, 0, GAP * TILE_SCALE, GAP * TILE_SCALE),
  })
  tile.destroy()
  const sprite = new TilingSprite({ texture })
  sprite.tileScale.set(1 / TILE_SCALE) // la tuile texture (96px) rend 24 unités monde
  sprite.zIndex = -1000 // tout au fond de la scène GL
  layer.world.addChild(sprite)

  function update(): void {
    const { x, y, zoom } = vf.viewport.value
    sprite.visible = isLodDisabled() || zoom >= ZOOM_MIN
    if (!sprite.visible) {
      layer.invalidate()
      return
    }
    // Rect MONDE visible, élargi au multiple du pas : l'origine du sprite tombe sur la grille,
    // le motif ne « nage » pas pendant le pan.
    const w = layer.app.renderer.width / layer.app.renderer.resolution
    const h = layer.app.renderer.height / layer.app.renderer.resolution
    const x0 = Math.floor(-x / zoom / GAP) * GAP - GAP
    const y0 = Math.floor(-y / zoom / GAP) * GAP - GAP
    sprite.position.set(x0, y0)
    sprite.width = w / zoom + 3 * GAP
    sprite.height = h / zoom + 3 * GAP
    layer.invalidate()
  }
  update()
  return { update }
}

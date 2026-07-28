// Couche GL sous le pane Vue Flow — hôte de la phase 2 de la refonte canvas.
// Plan : cadrage/06-pivot-agentique/plan-phase2-gl.md. Spec parente : audit-refonte-canvas-webgl.md.
//
// Principes tenus ici :
//  - le DOM reste MAÎTRE de la caméra : le conteneur `world` SUIT `vf.viewport` (une transform
//    par changement, aucune conversion par objet — les modules dessinent en coordonnées MONDE) ;
//  - rendu À LA DEMANDE : pas de ticker permanent, un `invalidate()` coalescé sur rAF — une scène
//    immobile ne coûte rien (et le rAF headless qui ne bat pas n'empêche aucune mesure DOM) ;
//  - repli intégral par drapeau : `localStorage['flooow:gl'] = '0'` coupe la couche, le rendu DOM
//    d'origine reprend (chaque jalon garde son équivalent DOM derrière ce même drapeau tant que
//    la phase n'est pas close).
import { onScopeDispose, watch, type Ref } from 'vue'
import { Application, Container } from 'pixi.js'
import type { VueFlowStore } from '@vue-flow/core'

/** Drapeau de repli : poser '0' pour couper la couche GL (rendu DOM d'origine). */
export const GL_FLAG_KEY = 'flooow:gl'
export function glEnabled(): boolean {
  try {
    return localStorage.getItem(GL_FLAG_KEY) !== '0'
  } catch {
    return true
  }
}

// (Le drapeau d'essai du LOD est devenu un vrai réglage : `ui.fullCards` — « Toujours afficher le
// contenu des cartes », Réglages d'affichage. Même clé localStorage, gérée par le store UI.)

export interface GlLayer {
  app: Application
  /** Conteneur MONDE : sa transform EST la caméra ; les enfants dessinent en unités monde. */
  world: Container
  /** Redessine au prochain rAF (coalescé) — à appeler sur tout changement de scène. */
  invalidate: () => void
}

/**
 * Monte la couche dans `host` (div plein pane, `pointer-events: none`) et la tient synchronisée
 * sur la caméra Vue Flow. Renvoie une promesse de couche (l'init Pixi est asynchrone) ; les
 * modules de dessin (fond, arêtes…) s'accrochent au `world` une fois la promesse résolue.
 *
 * Cycle de vie lié au scope appelant (FlowCanvas) : détruite avec lui — `<component :is>` de
 * EditorView remonte le canvas entier à chaque changement de projet, la couche suit.
 */
export function useGlLayer(host: Ref<HTMLElement | null>, vf: VueFlowStore): Promise<GlLayer> {
  let disposed = false
  let raf = 0
  const onDispose: Array<() => void> = []
  const app = new Application()
  const world = new Container()

  const layer: GlLayer = {
    app,
    world,
    invalidate() {
      if (raf || disposed) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!disposed && app.renderer) app.render()
      })
    },
  }

  const ready = (async () => {
    // `webgl` d'abord : déterministe partout (SwiftShader headless compris) ; `webgpu` sera
    // évalué en fin de phase — l'API est identique, seule la préférence change.
    await app.init({
      backgroundAlpha: 0, // le fond de page reste au DOM ; la couche ne peint que la scène
      antialias: true,
      resolution: Math.min(devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    })
    if (disposed) {
      app.destroy(true)
      return layer
    }
    app.ticker?.stop() // rendu à la demande uniquement
    app.stage.addChild(world)
    const el = host.value
    if (el) {
      el.appendChild(app.canvas)
      const fit = () => {
        app.renderer.resize(el.clientWidth || 1, el.clientHeight || 1)
        layer.invalidate()
      }
      fit()
      const ro = new ResizeObserver(fit)
      ro.observe(el)
      onDispose.push(() => ro.disconnect())
    }
    syncCamera()
    // Exposé en dev pour l'inspection (campagnes du runner, débogage console).
    if (import.meta.env.DEV) (window as { __flooowGl?: GlLayer }).__flooowGl = layer
    return layer
  })()

  /** LA matrice partagée : monde → écran, identique au `transform` du pane DOM. */
  function syncCamera(): void {
    const { x, y, zoom } = vf.viewport.value
    world.position.set(x, y)
    world.scale.set(zoom)
    layer.invalidate()
  }
  watch(vf.viewport, syncCamera)

  onScopeDispose(() => {
    disposed = true
    if (raf) cancelAnimationFrame(raf)
    for (const f of onDispose) f()
    void ready.then(() => {
      // `true` : détruit aussi le canvas DOM et libère le contexte GL.
      if (app.renderer) app.destroy(true)
    })
  })

  return ready
}

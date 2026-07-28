/**
 * Runner de la baseline performance du canvas — phase 0 de la refonte WebGL.
 * Spec : cadrage/06-pivot-agentique/audit-refonte-canvas-webgl.md (§6, phase 0).
 * Résultats : cadrage/06-pivot-agentique/baseline-canvas-phase0.md.
 *
 * S'ÉVALUE DANS LA PAGE (console DevTools ou chrome_eval bao), il ne s'importe pas :
 * il définit `window.__pb` puis on appelle ses campagnes une à une. Reproduit la
 * méthodologie des campagnes historiques commentées dans FlowCanvas.vue (pan piloté
 * par `setViewport` image par image, ms/image + fps + tâches longues), pour que les
 * chiffres restent comparables d'une phase à l'autre.
 *
 * Accès à l'instance Vue Flow par les internals DEV de Vue (`__vueParentComponent`) :
 * ne fonctionne qu'en build Vite dev — c'est voulu, la baseline se mesure sur le dev
 * server, jamais sur un build prod.
 */
(() => {
  const raf = () => new Promise((r) => requestAnimationFrame(r))

  /** Remonte de l'élément .vue-flow au setupState de FlowCanvas (expose vf et ui). */
  function flowCanvasState() {
    let c = document.querySelector('.vue-flow')?.__vueParentComponent
    for (let i = 0; c && i < 15; i++) {
      const ss = c.setupState || {}
      if (ss.vf?.setViewport) return ss
      c = c.parent
    }
    throw new Error('FlowCanvas introuvable (build prod ? canvas non monté ?)')
  }

  /** Observe les tâches longues pendant `run`, et chronomètre chaque image rAF. */
  async function withProbes(run) {
    const longTasks = []
    const po = new PerformanceObserver((l) => longTasks.push(...l.getEntries()))
    po.observe({ type: 'longtask', buffered: false })
    const frames = []
    let last = await raf()
    const tick = (ts) => {
      frames.push(ts - last)
      last = ts
    }
    const t0 = performance.now()
    await run(async () => tick(await raf()))
    const wall = performance.now() - t0
    po.disconnect()
    frames.sort((a, b) => a - b)
    const sum = frames.reduce((a, b) => a + b, 0)
    const q = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] ?? 0
    return {
      frames: frames.length,
      wallMs: Math.round(wall),
      avgMs: +(sum / (frames.length || 1)).toFixed(1),
      p50Ms: +q(0.5).toFixed(1),
      p95Ms: +q(0.95).toFixed(1),
      maxMs: +(frames[frames.length - 1] ?? 0).toFixed(1),
      fps: +((frames.length / wall) * 1000).toFixed(1),
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((a, e) => a + e.duration, 0)),
    }
  }

  window.__pb = {
    flowCanvasState,

    /** Carte d'identité de l'environnement de mesure (à joindre à chaque rapport). */
    env() {
      const gl = document.createElement('canvas').getContext('webgl2')
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
      const m = performance.memory
      return {
        ua: navigator.userAgent,
        cores: navigator.hardwareConcurrency,
        deviceMemoryGb: navigator.deviceMemory ?? null,
        dpr: devicePixelRatio,
        viewport: `${innerWidth}x${innerHeight}`,
        glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        jsHeapMb: m ? Math.round(m.usedJSHeapSize / 1048576) : null,
      }
    },

    /** Volumétrie montée : ce que le DOM paie réellement, par couche courante. */
    counts() {
      const q = (s) => document.querySelectorAll(s).length
      const cards = document.querySelectorAll('.vue-flow__node')
      let inner = 0
      let text = 0
      for (const c of cards) {
        inner += c.querySelectorAll('*').length
        for (const el of c.querySelectorAll('*'))
          if (
            [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          )
            text++
      }
      const { vf } = flowCanvasState()
      return {
        url: location.pathname,
        zoom: +vf.viewport.value.zoom.toFixed(3),
        flowNodes: q('.vue-flow__node'),
        flowEdges: q('.vue-flow__edge'),
        cardInnerEls: inner,
        cardTextEls: text,
        domTotal: q('*'),
        jsHeapMb: performance.memory
          ? Math.round(performance.memory.usedJSHeapSize / 1048576)
          : null,
      }
    },

    /**
     * Pan piloté image par image à zoom fixe — la campagne de référence maison.
     * Aller-retour horizontal : `frames` images, ±stepPx par image.
     */
    async pan({ zoom, stepPx = 15, frames = 180 } = {}) {
      const { vf } = flowCanvasState()
      const v0 = { ...vf.viewport.value }
      if (zoom == null) zoom = v0.zoom
      await vf.setViewport({ x: v0.x, y: v0.y, zoom })
      await raf()
      await raf()
      let x = v0.x
      const res = await withProbes(async (frame) => {
        for (let i = 0; i < frames; i++) {
          x += i < frames / 2 ? -stepPx : stepPx
          void vf.setViewport({ x, y: v0.y, zoom })
          await frame()
        }
      })
      await vf.setViewport(v0)
      return { campaign: 'pan', zoom, stepPx, ...res }
    },

    /** Zoom continu piloté image par image (aller-retour from→to→from, centre écran). */
    async zoom({ from = 0.117, to = 1, frames = 180 } = {}) {
      const { vf } = flowCanvasState()
      const v0 = { ...vf.viewport.value }
      const cx = innerWidth / 2
      const cy = innerHeight / 2
      // Point monde sous le centre écran à l'état initial, pour zoomer « sur place ».
      const wx = (cx - v0.x) / v0.zoom
      const wy = (cy - v0.y) / v0.zoom
      const zAt = (t) => from * Math.pow(to / from, t) // interpolation géométrique
      const res = await withProbes(async (frame) => {
        for (let i = 0; i < frames; i++) {
          const t = i < frames / 2 ? i / (frames / 2) : 2 - i / (frames / 2)
          const z = zAt(t)
          void vf.setViewport({ x: cx - wx * z, y: cy - wy * z, zoom: z })
          await frame()
        }
      })
      await vf.setViewport(v0)
      return { campaign: 'zoom', from, to, ...res }
    },

    /**
     * Clic de sélection sur une carte (point chaud n°3 : le watch deep sur la
     * sélection reconstruit le graphe). Mesure la fenêtre de 600 ms qui suit le clic.
     */
    async clickSelect(selector = '.vue-flow__node') {
      const el = document.querySelector(selector)
      if (!el) throw new Error('aucune carte visible pour ' + selector)
      const r = el.getBoundingClientRect()
      const opts = {
        bubbles: true,
        clientX: r.x + r.width / 2,
        clientY: r.y + Math.min(20, r.height / 2),
      }
      return {
        campaign: 'clickSelect',
        target: el.className.baseVal || el.className,
        ...(await withProbes(async (frame) => {
          el.dispatchEvent(new PointerEvent('pointerdown', opts))
          el.dispatchEvent(new PointerEvent('pointerup', opts))
          el.dispatchEvent(new MouseEvent('click', opts))
          const end = performance.now() + 600
          while (performance.now() < end) await frame()
        })),
      }
    },

    /** Vide la sélection (clic sur le fond), pour enchaîner les campagnes proprement. */
    async clearSelect() {
      const pane = document.querySelector('.vue-flow__pane')
      const opts = { bubbles: true, clientX: 40, clientY: innerHeight - 40 }
      pane.dispatchEvent(new PointerEvent('pointerdown', opts))
      pane.dispatchEvent(new PointerEvent('pointerup', opts))
      pane.dispatchEvent(new MouseEvent('click', opts))
      await raf()
      return true
    },
  }
  return 'runner phase 0 chargé (window.__pb)'
})()

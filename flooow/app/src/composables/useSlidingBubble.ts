// Bulle glissante des contrôles segmentés (ModeSwitcher, LayerSwitcher) : mesure le
// bouton actif ([aria-selected="true"]) et expose position/taille pour une pastille
// absolue animée en transform/width. Re-mesure au changement d'actif (watch) et quand
// la géométrie bouge (ResizeObserver : chargement de police, resize).
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface BubbleBox {
  x: number
  y: number
  w: number
  h: number
  ready: boolean
}

export function useSlidingBubble(
  listRef: Ref<HTMLElement | null>,
  active: () => unknown,
): Ref<BubbleBox> {
  const bubble = ref<BubbleBox>({ x: 0, y: 0, w: 0, h: 0, ready: false })

  function measure(): void {
    const btn = listRef.value?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!btn) return
    bubble.value = {
      x: btn.offsetLeft,
      y: btn.offsetTop,
      w: btn.offsetWidth,
      h: btn.offsetHeight,
      ready: true,
    }
  }

  watch(active, () => void nextTick(measure))

  let observer: ResizeObserver | undefined
  onMounted(() => {
    measure()
    observer = new ResizeObserver(measure)
    if (listRef.value) observer.observe(listRef.value)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return bubble
}

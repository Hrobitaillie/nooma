<script setup lang="ts">
// Bac de LOT (couche fonctionnelle, vue plan) : le compartiment de premier rang de la maquette, qui
// englobe les sous-bacs de module d'un même lot. Portage fidèle de la section `.lotbox` : trait
// discontinu de 1.5px, rayon 18px, couleur du lot, fond de cette même couleur à 6 %, libellé en haut
// à gauche (pastille carrée + nom) en 12.5px/800.
//
// Ce n'est PAS un objet du modèle : le lot n'a pas de nœud, c'est une propriété des fonctionnalités.
// Le cadre est donc entièrement DÉRIVÉ du layout (`globalTree.ts` → `Container` de `kind: 'lot'`),
// comme le cadre de module — d'où l'absence de tout `store` ici, il n'y a rien à éditer.
//
// Purement DÉCORATIF, et c'est structurant : le bac couvre toute la surface de ses cartes, donc s'il
// interceptait le pointeur il volerait tous les clics destinés aux cartes et aux cadres de module
// qu'il contient. D'où `pointer-events: none` sur la racine (le nœud est par ailleurs posé
// non déplaçable et non sélectionnable côté useCanvasSync — ceinture et bretelles, parce qu'un seul
// des deux laisserait passer soit le clic, soit la boîte de sélection au lasso).
import { onBeforeUnmount, ref, watchEffect } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { LotFrameData } from '../useCanvasSync'
import { useCounterZoomVars } from '../counterZoom'
import { glEnabled } from '../gl/useGlLayer'
import { setGlEdge, dropGlEdge, samplePathD, roundedRectD } from '../gl/edgeChannel'

const props = defineProps<{
  id: string
  data: LotFrameData
}>()

// Variables de contre-zoom du libellé, portées par lui-même (cf. counterZoom.ts).
const labelEl = ref<HTMLElement | null>(null)
useCounterZoomVars(labelEl)

/**
 * MODE GL (jalon 4 phase 2, plan-phase2-gl.md) : le BAC (fond à 6 % + bordure tiretée — le grand
 * rectangle translucide que le DOM re-rastérisait à chaque image de pan) est publié dans le canal
 * et peint par gl/edges.ts, calque `frames` (sous les arêtes, exempté du LOD). Le LIBELLÉ reste
 * DOM : c'est du texte contre-zoomé, sa netteté attendra l'atlas de glyphes de la phase 3.
 * Parité du motif : `border: 1.5px dashed` (tiret ≈ 8/6 à l'œil), rayon 18, couleur du lot.
 */
const glMode = glEnabled()
if (glMode) {
  const { findNode } = useVueFlow()
  let lastKey = ''
  let pts: number[] = []
  watchEffect(() => {
    const gn = findNode(props.id)
    if (!gn) return
    const w = gn.dimensions.width || 0
    const h = gn.dimensions.height || 0
    if (w <= 0 || h <= 0) return
    const { x, y } = gn.computedPosition
    const key = `${x}|${y}|${w}|${h}`
    if (key !== lastKey) {
      lastKey = key
      pts = samplePathD(roundedRectD(x, y, w, h, 18), 6)
    }
    const color = props.data.color.startsWith('#')
      ? parseInt(props.data.color.slice(1), 16)
      : 0x64748b
    setGlEdge(`lotbox:${props.id}`, {
      pts,
      color,
      alpha: 1,
      width: 1.5,
      dash: [8, 6],
      animated: false,
      arrowStart: false,
      arrowEnd: false,
      fill: { color, alpha: 0.06 },
      layer: 'frames',
    })
  })
  onBeforeUnmount(() => dropGlEdge(`lotbox:${props.id}`))
}
</script>

<template>
  <!-- `--lot` porte la couleur du lot une seule fois : le trait, la pastille et le libellé la
       reprennent, et le fond en dérive par `color-mix` (6 %) — plutôt qu'un rgba() recalculé en JS,
       qui obligerait à parser la couleur du token. -->
  <div class="lotbox" :class="{ 'gl-box': glMode }" :style="{ '--lot': data.color }">
    <div ref="labelEl" class="lotbox-label zoom-label">
      <span class="lotbox-dot" aria-hidden="true" />
      <span class="truncate">{{ data.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.lotbox {
  width: 100%;
  height: 100%;
  border: 1.5px dashed var(--lot);
  border-radius: 18px;
  background: color-mix(in srgb, var(--lot) 6%, transparent);
  /* Repère visuel seulement : jamais de clic intercepté (cf. commentaire de tête). */
  pointer-events: none;
}
/* Mode GL : le bac est peint par la couche (gl/edges.ts) — le nœud DOM ne garde que le libellé.
   La bordure reste dans la boîte (transparente) pour ne changer AUCUNE métrique de layout. */
.lotbox.gl-box {
  border-color: transparent;
  background: none;
}
/* Libellé en haut à gauche, DANS le cadre : la géométrie du bac réserve déjà cette bande
   (LOT_LABEL = 46 dans globalTree.ts), les cartes ne peuvent donc pas venir dessous.
   Le retrait horizontal reprend `INNER` (28) : le libellé s'aligne ainsi sur le bord gauche du
   premier sous-bac de module, au lieu de flotter en retrait par rapport à lui. */
/* Contre-zoom (`--flooow-label-scale`, posé par FlowCanvas) : le nom garde une taille ÉCRAN
   constante quel que soit le zoom, c'est LA information qu'on vient lire en vue d'ensemble.
   `transform-origin` en BAS à gauche, donc le libellé grandit vers le HAUT, en dehors du cadre :
   la bande réservée ne fait que 46px (LOT_LABEL) et, dézoomé fort, un libellé qui grandirait vers
   le bas recouvrirait les sous-bacs de module qu'il est censé nommer. Au-dessus du lot il n'y a
   que du vide. Un `transform` ne participe à aucun calcul de boîte : la géométrie du layout est
   inchangée, et `width` reste celle du cadre — `truncate` coupe donc toujours au même endroit. */
.lotbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Largeur et retraits DIVISÉS par le facteur, pour que la mise à l'échelle les ramène à leur
     valeur monde. Sans ça, la troncature se calcule sur la boîte non transformée : le libellé se
     coupe au même caractère qu'à zoom 1 puis déborde k fois plus à droite, et va recouvrir le lot
     voisin. Ici la boîte rétrécit exactement autant que le texte grossit — le nom occupe donc
     toujours la largeur du cadre, ni plus (pas de chevauchement) ni moins (pas d'espace perdu), et
     `truncate` coupe pile au bord. Conséquence assumée : sur un cadre étroit très dézoomé, il ne
     reste que les premiers caractères. Un nom tronqué qui reste chez lui vaut mieux qu'un nom
     entier qui masque son voisin. */
  width: calc(100% / var(--flooow-label-scale, 1));
  padding: calc(10px / var(--flooow-label-scale, 1))
    calc(28px / var(--flooow-label-scale, 1)) 0;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: var(--lot);
  /* La surélévation (`--flooow-label-lift` = k − 1, cf. FlowCanvas) tient la HIÉRARCHIE au dézoom.
     Sans elle, le nom du lot et celui de son premier module grandissent tous deux vers le haut
     depuis des ancres séparées par une distance FIXE (la bande LOT_LABEL, 46 px monde) : les
     libellés croissant en 1/zoom finissent par la combler et le titre de lot s'écrit sur celui du
     module. 26 px = une ligne de titre de module (13 px × 1,5) plus ~6 px de respiration ; multiplié
     par (k − 1), l'écart devient constant À L'ÉCRAN au lieu de se refermer, et reste nul à zoom 1.
     Le `translateY` est placé AVANT le `scale` dans la liste, donc appliqué APRÈS lui, dans l'espace
     monde non mis à l'échelle : le déplacement vaut bien 26 px × lift, sans double amplification. */
  transform: translateY(calc(-26px * var(--flooow-label-lift, 0)))
    scale(var(--flooow-label-scale, 1));
  transform-origin: 0 100%;
}
.lotbox-dot {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  border-radius: 2px;
  background: var(--lot);
}
</style>

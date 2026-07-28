<script setup lang="ts">
// Arête manuelle typée, en rendu ORTHOGONAL automatique (segments à angles droits) via le routeur
// natif de Vue Flow `getSmoothStepPath` — plus de points d'inflexion à manipuler (décision Hugo).
// Code couleur : navigatesTo = GRIS pointillé (lien de navigation transverse — la STRUCTURE, elle,
// est portée par la parenté v12 en trait plein, cf. TreeEdge) · dependsOn = gris tireté animé.
import { computed, inject, onBeforeUnmount, watchEffect } from 'vue'
import { BaseEdge, getBezierPath, useVueFlow, type Position as HandlePosition } from '@vue-flow/core'
import type { EdgeType as FlooowEdgeType } from '@flooow/core/model/types'
import { NAV_COLOR } from '@/theme/tokens'
import { useUiStore } from '@/stores/ui'
import { FUNC_HIGHLIGHT_KEY, type TypedEdgeData } from '../useCanvasSync'
import { glEnabled } from '../gl/useGlLayer'
import { setGlEdge, dropGlEdge, samplePathD } from '../gl/edgeChannel'

const props = defineProps<{
  id: string
  /** Id du nœud source (fourni par Vue Flow) — sert à réveiller le tracé quand il est sélectionné. */
  source: string
  target: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: HandlePosition
  targetPosition: HandlePosition
  markerEnd?: string
  /** Flèche côté SOURCE (« dépend de » : pointe vers la dépendante — sens du déblocage). */
  markerStart?: string
  data?: TypedEdgeData
  selected?: boolean
}>()

const kind = computed<FlooowEdgeType>(() => props.data?.edgeType ?? 'dependsOn')

// Estompage de chaîne : lu EN DIRECT (phase 1 refonte canvas) et non plus cuit dans `data.dim` —
// un lien n'appartient à la chaîne mise en avant que si ses DEUX extrémités y sont, sinon il
// s'estompe avec les cartes qu'il relie (des tracés pleine intensité partant de la chaîne vers des
// cartes grisées brouilleraient sa lecture). Même arbitrage que `navSoft` ci-dessous.
const funcHighlight = inject(
  FUNC_HIGHLIGHT_KEY,
  computed((): Set<string> | null => null),
)
const dim = computed(() => {
  const hl = funcHighlight.value
  return hl != null && (!hl.has(props.source) || !hl.has(props.target))
})

/**
 * NAVIGATION ESTOMPÉE par défaut (retour Hugo du 22/07) : les courbes pointillées sont du contexte
 * d'arrière-plan, pas une lecture de premier plan — elles se font discrètes tant que rien ne les
 * concerne. Pleine opacité quand le TRACÉ est sélectionné, ou quand sa page d'ORIGINE ou
 * d'ARRIVÉE l'est : sélectionner une page « allume » ses navigations. Lu directement depuis le
 * store UI (réactif) : aucune re-projection du graphe au changement de sélection.
 */
const ui = useUiStore()
const NAV_SOFT_OPACITY = 0.3
const navSoft = computed(
  () =>
    kind.value === 'navigatesTo' &&
    !props.selected &&
    !ui.selectedIds.includes(props.source) &&
    !ui.selectedIds.includes(props.target),
)

/**
 * Seuil de zoom sous lequel la dérive des pointillés est SUSPENDUE.
 *
 * Ce n'est pas un réglage esthétique, c'est la correction d'un coût mesuré. `stroke-dashoffset`
 * n'est pas une propriété compositable : le navigateur ne peut pas la déléguer au GPU, il doit
 * recalculer le style PUIS REPEINDRE chaque tracé à chaque image. Profil Chrome sur le projet
 * locasyst (84 arêtes `dependsOn`), page au repos, personne ne touche à rien : 359 recalculs de
 * style en 12 s pour 0,0 ms de layout et 2,5 ms de script — soit 97 % du thread principal occupé
 * à animer des pointillés, et les threads de rastérisation à 352 %. Le pan n'était pas lent en
 * lui-même : il ne restait tout simplement plus de budget à lui donner.
 *
 * Le seuil est le remède exact du symptôme : très dézoomé, TOUT le monde tient dans la fenêtre,
 * donc les 84 animations sont visibles à la fois et doivent toutes être repeintes — alors même
 * qu'à cette échelle le motif n'est de toute façon plus lisible. Zoomé, le culling en écarte
 * l'essentiel et l'animation redevient à la fois gratuite et signifiante.
 *
 * La valeur est réglée à l'œil, pas au calcul de lisibilité : le seuil purement technique (le motif
 * cesse d'être distinguable vers 0,45) laissait l'animation démarrer alors qu'on survole encore le
 * plan d'ensemble, où une dizaine de tracés se mettent à ramper d'un coup pour une information dont
 * on n'a pas l'usage à cette échelle. À 0,8 elle n'apparaît qu'une fois entré dans une zone, quand
 * on lit vraiment un enchaînement.
 */
const ZOOM_ANIM_MIN = 0.8
const { viewport } = useVueFlow()
// Le calcul est refait à chaque changement de viewport (donc à chaque image de pan), mais il ne
// produit qu'un BOOLÉEN : tant qu'il ne bascule pas, `style` n'est pas recalculé et aucune arête
// n'est re-rendue. 84 comparaisons de nombres par image sont sans commune mesure avec 84 repeints.
// Un lien estompé (hors chaîne mise en avant) n'anime pas non plus ses pointillés : à 15 % d'opacité
// la dérive ne se lit plus, mais son coût de repeint (cf. ci-dessus) resterait entier.
// `ui.animateDeps` (« Animer les liens de dépendance », Réglages d'affichage) coupe la dérive à
// la source : spec republiée, ticker GL arrêté — du CPU rendu au repos, au choix de la machine.
const animated = computed(
  () =>
    kind.value === 'dependsOn' &&
    ui.animateDeps &&
    !dim.value &&
    viewport.value.zoom >= ZOOM_ANIM_MIN,
)

const STYLES: Record<FlooowEdgeType, { stroke: string; width: number; dash?: string }> = {
  // Pointillés (v12) : la navigation est un lien TRANSVERSE, le trait plein est réservé à la
  // parenté structurelle (TreeEdge). Motif court et serré, distinct du tireté long de dependsOn.
  navigatesTo: { stroke: NAV_COLOR, width: 2, dash: '4 4' },
  dependsOn: { stroke: '#94a3b8', width: 1, dash: '10 6' },
  // « réalisé par » (pont fonctionnel → structurel) : vert, visible surtout en vue couverture.
  realizedBy: { stroke: '#10b981', width: 1.5, dash: '2 5' },
}
const style = computed(() => {
  const s = STYLES[kind.value]
  // TEST (couleur par relation) : si l'arête porte une couleur dédiée (dependsOn coloré pour
  // différencier les connexions d'une carte), elle prime sur la couleur de type. Le tireté et
  // l'animation restent inchangés.
  const base = props.data?.color ?? s.stroke
  // Compensation au DÉZOOM pour la NAVIGATION (v13, cf. TreeEdge) : sous zoom 1, épaisseur ET
  // motif grandissent en 1/zoom → la courbe garde ~2 px écran et des pointillés lisibles au
  // fitView. Pas pour « dépend de » : son motif est couplé à l'animation de dérive (période 16),
  // et la couche fonctionnelle masque de toute façon ses liens sous le seuil LOD.
  const z = viewport.value.zoom || 1
  const k = kind.value === 'navigatesTo' && z < 1 ? 1 / z : 1
  return {
    stroke: props.selected ? '#0ea5e9' : base,
    strokeWidth: s.width * k,
    strokeDasharray:
      s.dash && k !== 1
        ? s.dash
            .split(' ')
            .map((n) => Number(n) * k)
            .join(' ')
        : s.dash,
    // Hors chaîne mise en avant : le tracé s'efface sans disparaître (il reste cliquable, et le
    // plan garde sa structure d'ensemble en filigrane). Sinon, navigation ESTOMPÉE par défaut
    // (réveillée par la sélection du tracé ou d'une de ses extrémités).
    ...(dim.value ? { opacity: 0.15 } : navSoft.value ? { opacity: NAV_SOFT_OPACITY } : {}),
    // La bascule estompé ↔ réveillé se fait en douceur (la sélection change d'un clic sec).
    transition: 'opacity 120ms ease',
    // « Dépend de » : les pointillés dérivent LENTEMENT dans le sens du DÉBLOCAGE, de la dépendance
    // (target) vers la dépendante (source) — on lit « ceci débloque cela ». Un dashoffset CROISSANT
    // fait remonter le motif vers le début du tracé (la source) ; période = tiret 10 + trou 6 = 16.
    ...(animated.value ? { animation: 'flooow-unblock-flow 4s linear infinite' } : {}),
  }
})

// Tracé COURBE (Bézier) entre les poignées source/cible — les liens de dépendance suivent une
// courbe douce (arbre de compétence) plutôt qu'un routage orthogonal. La navigation (v13 : courbe
// pointillée DERRIÈRE les cartes) est plus bombée : passant sous les cartes, c'est sa silhouette
// dans les gouttières qui la fait lire — une courbe trop plate s'y confondrait avec le rail d'arbre.
const routed = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: kind.value === 'navigatesTo' ? 0.5 : 0.3,
  }),
)
const path = computed(() => routed.value[0])

/**
 * MODE GL (jalons 2-3 phase 2, plan-phase2-gl.md) : ce composant ne peint plus — il publie sa
 * spec visuelle dans le canal (edgeChannel) que gl/edges.ts dessine, et ne rend qu'un chemin de
 * FRAPPE transparent : le routage, la sélection et le clic (popover) restent intégralement
 * Vue Flow. La polyligne est échantillonnée depuis le `d` calculé ici même (parité de routage par
 * construction), et mise en cache par `d` — un pur changement de style (estompage, contre-zoom)
 * ne ré-échantillonne pas. Repli : flooow:gl='0' → BaseEdge d'origine.
 */
const glMode = glEnabled()
if (glMode) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let sampledD = ''
  let sampledPts: number[] = []
  watchEffect(() => {
    const s = style.value
    const stroke = String(s.stroke ?? '#94a3b8')
    const d = path.value
    if (d !== sampledD) {
      sampledD = d
      sampledPts = samplePathD(d)
    }
    // Motif : la chaîne calculée par `style` (contre-zoom compris) fait foi ; l'écriture
    // « a b » redevient [a, b].
    const dashStr = typeof s.strokeDasharray === 'string' ? s.strokeDasharray : null
    const dashNums = dashStr ? dashStr.split(' ').map(Number) : null
    setGlEdge(props.id, {
      pts: sampledPts,
      color: stroke.startsWith('#') ? parseInt(stroke.slice(1), 16) : 0x94a3b8,
      alpha: dim.value ? 0.15 : navSoft.value ? NAV_SOFT_OPACITY : 1,
      width: Number(s.strokeWidth) || 1,
      dash: dashNums && dashNums.length >= 2 ? [dashNums[0]!, dashNums[1]!] : null,
      animated: animated.value && !reduced.matches,
      arrowStart: kind.value === 'dependsOn',
      arrowEnd: kind.value === 'navigatesTo',
    })
  })
  onBeforeUnmount(() => dropGlEdge(props.id))
}
</script>

<template>
  <path v-if="glMode" :d="path" class="gl-edge-hit" fill="none" />
  <BaseEdge
    v-else
    :id="id"
    :path="path"
    :marker-end="markerEnd"
    :marker-start="markerStart"
    :style="style"
  />
</template>

<style>
/* Chemin de FRAPPE du mode GL : invisible mais cliquable sur toute l'épaisseur utile — porte la
   sélection et le popover d'arête pendant que funcEdges.ts peint le visuel. */
.gl-edge-hit {
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: pointer;
}

/* Dérive du motif tireté « dépend de » (10 + 6 = 16 px de période) : offset croissant = les tirets
   remontent le tracé vers la source (la dépendante) — le sens du déblocage. Global (non scopé) :
   l'animation est référencée par style inline sur le <path> de BaseEdge. */
@keyframes flooow-unblock-flow {
  to {
    stroke-dashoffset: 16;
  }
}

/* Accessibilité : pas de mouvement pour qui l'a désactivé. */
@media (prefers-reduced-motion: reduce) {
  .vue-flow__edge-path {
    animation: none !important;
  }
}
</style>

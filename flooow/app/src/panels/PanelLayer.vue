<script setup lang="ts">
// Calque overlay au-dessus du canvas (interface.md §Calque de panneaux).
// - fixed/absolute inset-0, pointer-events:none ; chaque panneau réactive pointer-events:auto,
//   le canvas reste pannable/zoomable entre les panneaux.
// - Visibilité pilotée par ui.mode (canvas = tous) et par ui.openPanels.
// - Installe les raccourcis clavier globaux (useKeyboard), montés tant que l'app vit.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isBlock, isFeature } from '@flooow/core/model/types'
import { useKeyboard } from '@/composables/useKeyboard'
import { useFeatureEditor } from '@/composables/useFeatureEditor'
import FuncControls from './FuncControls.vue'
import DisplaySettings from './DisplaySettings.vue'
import CanvasModeToggle from './CanvasModeToggle.vue'
import LayerSwitcher from './LayerSwitcher.vue'
import ToolDock from './ToolDock.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import ZoomBar from './ZoomBar.vue'
import SearchPopover from './SearchPopover.vue'

/**
 * Bord GAUCHE du calque. Le calque est en `fixed inset-0` : par défaut ses panneaux se posent donc
 * par rapport à la fenêtre, ce qui convient tant que la scène occupe toute la largeur. Dès qu'un
 * split docké la rétrécit (rail de modules, à gauche), il faut décaler le calque d'autant — sinon
 * le ToolDock à `left-3` reste collé au bord de la FENÊTRE et disparaît sous le rail.
 *
 * Le parent le fournit parce que c'est lui qui décide de la largeur du split : le calque n'a pas à
 * savoir ce qui le pousse, seulement de combien.
 */
const props = withDefaults(defineProps<{ insetLeft?: string }>(), { insetLeft: '0px' })

const ui = useUiStore()
const project = useProjectStore()
const isCanvas = computed(() => ui.mode === 'canvas')
// Split éditeur de fonctionnalité ouvert → on masque le panneau flottant et la barre de filtres
// (elles vivraient sous/derrière le split, à droite).
const featureEditor = useFeatureEditor()
// Types qui ont leur PROPRE point d'édition et n'ouvrent donc pas le panneau de propriétés — sans
// quoi deux panneaux éditeraient le même nœud en même temps :
//   · fonctionnalité → badge « Éditer » de la carte, éditeur plein hauteur ;
//   · bloc → BlockConfigPanel, flottant à côté de sa carte (rendu par FlowCanvas, qui seul sait où
//     la carte se trouve à l'écran).
// Les autres types gardent le panneau de cette colonne.
const singleSelectionHasOwnPanel = computed(() => {
  if (ui.selectedIds.length !== 1) return false
  const n = ui.selectedId ? project.nodeById(ui.selectedId) : undefined
  return !!n && (isFeature(n) || isBlock(n))
})

let teardownKeyboard: (() => void) | undefined
onMounted(() => {
  teardownKeyboard = useKeyboard()
})
onBeforeUnmount(() => {
  teardownKeyboard?.()
})
</script>

<template>
  <div
    class="panel-layer pointer-events-none fixed inset-0 z-40 transition-[left] duration-300 ease-out"
    :style="{ left: props.insetLeft }"
  >
    <!-- (Le ModeSwitcher vit dans la topbar d'EditorView.) -->

    <!-- COLONNE GAUCHE HAUTE — pile des flottants ancrés en haut à gauche. Le StatusChip (état de
         sauvegarde + menu fichier) l'occupait en premier : l'état est passé dans la topbar à côté
         du nom du projet, et le menu fichier dans le menu de l'application. Reste la bascule de
         couche. La colonne flex est conservée telle quelle : c'est elle qui permet d'ajouter ou de
         retirer un flottant sans recalculer les `top-*` des autres — exactement ce qui vient de
         servir ici.
         La bascule de couche était auparavant ancrée SOUS la pilule de vues, dans la topbar. Elle
         y était solidaire de la FENÊTRE : en vue par module, le rail docké rétrécit la scène, les
         flottants de gauche se décalent avec le calque (voir `insetLeft`) mais elle, non — elle
         se retrouvait désalignée, à cheval sur le rail. Ici elle partage `left-3` avec le ToolDock,
         la ZoomBar, et hérite donc du décalage du calque.
         `top-16` et pas `top-3` : le calque est en `fixed inset-0`, donc son origine verticale est
         le haut de la FENÊTRE, pas le haut de la scène — la topbar (~53 px) occupe déjà cette
         bande. C'est la convention déjà tenue par les autres flottants ancrés en haut du fichier
         (colonne droite, pilule FuncControls) : tous partent à `top-16`, seule bande qui dégage la
         topbar tout en gardant la marge de 12 px des flottants. -->
    <div class="pointer-events-none absolute left-3 top-16 flex flex-col items-start gap-3">
      <!-- Bascule de couche (Arborescence / Fonctionnalités) — mode canvas seulement -->
      <div v-if="isCanvas" class="pointer-events-auto">
        <LayerSwitcher />
      </div>
    </div>

    <!-- Contrôles couche fonctionnelle (dispo hybride flottant) — pilule haut-centre, si split fermé -->
    <div
      v-if="isCanvas && ui.canvasLayer === 'functional' && !featureEditor.open.value"
      class="pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2"
    >
      <FuncControls />
    </div>

    <!-- COLONNE DROITE — pile des panneaux flottants (réglages d'affichage, puis propriétés).
         Les deux visaient auparavant le même `right-3 top-16` et se recouvraient réellement dès
         qu'ils coexistaient : multi-sélection de cartes en couche fonctionnelle (le panneau de
         propriétés, plus bas dans le DOM, peignait par-dessus les réglages).
         Le correctif n'est pas un décalage vertical codé en dur sur l'un des deux : un offset fige
         la hauteur de l'autre panneau et casse au moindre panneau ajouté. Ils partagent donc une
         colonne flex, où l'ordre du DOM suffit à faire l'empilement. Deux propriétés en tombent
         gratuitement : les réglages gardent le haut, conforme à la maquette validée ; et dans les
         couches où ils ne sont pas montés, le panneau de propriétés remonte de lui-même en
         `top-16`, sa position historique.
         La colonne n'est volontairement PAS bornée en bas ni mise en `overflow` : ça créerait un
         contexte de rognage qui couperait les listes déroulantes en `absolute` du panneau de
         propriétés. Chaque panneau borne déjà sa propre hauteur et défile en interne. -->
    <div class="pointer-events-none absolute right-3 top-16 flex flex-col items-end gap-3">
      <!-- Réglages d'affichage — LES DEUX COUCHES. Longtemps réservés à la fonctionnelle, ils
           s'ouvrent à la structurelle depuis le retrait de la FilterBar flottante : c'est elle qui
           portait le filtre TYPE DE NOTE, lequel n'agit QUE sur les notes de la couche structurelle
           et n'aurait donc plus eu aucun point d'entrée. La carte trie elle-même ses sections selon
           `ui.canvasLayer` (regroupement et « griser les bloquées » restent fonctionnels) : c'est à
           elle de savoir ce que chacun de ses réglages pilote, pas au calque de panneaux. -->
      <div v-if="isCanvas && !featureEditor.open.value" class="pointer-events-auto">
        <DisplaySettings />
      </div>

      <!-- PropertiesPanel — à la sélection, mode canvas. Cède la place au split fonctionnalité. -->
      <Transition name="props">
        <div
          v-if="isCanvas && ui.openPanels.properties && ui.hasSelection && !featureEditor.open.value && !singleSelectionHasOwnPanel"
          class="pointer-events-auto"
        >
          <PropertiesPanel />
        </div>
      </Transition>
    </div>

    <!-- Lentille design / dév — bas centre (façon Figma) -->
    <div
      v-if="isCanvas && ui.canvasLayer === 'functional' && !featureEditor.open.value"
      class="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2"
    >
      <CanvasModeToggle />
    </div>

    <!-- (Plus de FilterBar en bas à droite : le panneau flottant de filtres a été retiré. Chacun de
         ses filtres a rejoint l'endroit où son effet est visible — lot / module / type de note dans
         les « Réglages d'affichage » ci-dessus, facette dans la vue Specs, seule vue qu'elle filtre
         encore.) -->

    <!-- ToolDock — gauche centre, mode canvas seulement -->
    <Transition name="dock">
      <div
        v-if="isCanvas && ui.openPanels.toolDock"
        class="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2"
      >
        <ToolDock />
      </div>
    </Transition>

    <!-- ZoomBar — bas gauche, mode canvas seulement -->
    <div
      v-if="isCanvas && ui.openPanels.zoomBar"
      class="pointer-events-auto absolute bottom-3 left-3"
    >
      <ZoomBar />
    </div>

    <!-- SearchPopover — overlay ⌘K (gère sa propre visibilité) -->
    <SearchPopover />
  </div>
</template>

<style scoped>
/* Transitions courtes 150 ms ease-out (interface.md §Micro-interactions). */
.props-enter-active,
.props-leave-active,
.dock-enter-active,
.dock-leave-active {
  transition:
    opacity 150ms ease-out,
    transform 150ms ease-out;
}
.props-enter-from,
.props-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
.dock-enter-from,
.dock-leave-to {
  opacity: 0;
  transform: translate(-8px, -50%);
}
.dock-enter-to,
.dock-leave-from {
  transform: translate(0, -50%);
}
</style>

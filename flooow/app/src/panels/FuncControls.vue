<script setup lang="ts">
// Contrôles de la couche fonctionnelle — disposition « hybride flottant » (validée maquette).
// Pilule flottante haut-centre : Compact + Fond/Portail (rendu des liens longs).
// Le bouton Compact ARME le mode ; c'est le clic sur une carte qui referme la scène sur sa chaîne.
// « Vue complète » (pilule de gauche) relâche la chaîne SANS éteindre le mode : la carte suivante
// qu'on clique re-isole la sienne. Seul le bouton Compact rappuyé quitte le mode.
// Boutons ICÔNE (fond `primary` quand actif) avec tooltip instantané ; « Réorganiser » vit dans le
// menu de l'app (AppMenu), pas ici.
//
// PLUS d'engrenage : la carte de réglages (DisplaySettings.vue, haut droite) est désormais toujours
// affichée et ne se replie que par le chevron de son propre en-tête. Un bouton qui aurait piloté sa
// visibilité n'aurait plus rien à piloter, et deux façons de replier la même carte se seraient
// contredites.
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isFeature, isModule } from '@flooow/core/model/types'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()
const project = useProjectStore()

/**
 * Module à afficher la PREMIÈRE fois qu'on entre en vue par module. La sélection courante prime :
 * si on est en train de regarder une carte (ou un cadre de module), basculer doit ouvrir CE
 * module-là — sinon le mode s'ouvrirait ailleurs et l'utilisateur perdrait ce qu'il regardait.
 * Sans sélection exploitable, on ouvre le premier module du projet, qui est aussi celui du haut du
 * rail : le point d'entrée n'est jamais arbitraire.
 *
 * N'est consulté que si aucun module n'est encore mémorisé (`ui.setFuncView`) : ressortir puis
 * revenir dans le mode retrouve le module qu'on y avait laissé.
 */
function defaultModule(): string | null {
  const sel = ui.selectedId ? project.nodeById(ui.selectedId) : null
  if (sel && isModule(sel)) return sel.id
  if (sel && isFeature(sel) && sel.parentId) {
    const parent = project.nodeById(sel.parentId)
    if (parent && isModule(parent)) return parent.id
  }
  return project.modules[0]?.id ?? null
}

/** Le bouton Compact a trois états, et l'infobulle est le seul endroit qui les distingue. */
const compactTip = computed(() =>
  ui.compactOn
    ? 'Compact — chaîne isolée (cliquer ici quitte le mode)'
    : ui.compactArmed
      ? 'Compact — cliquez une fonctionnalité pour isoler sa chaîne'
      : 'Compact — isoler la chaîne d’une fonctionnalité',
)

/**
 * Ancre de départ du compact : la fonctionnalité SÉLECTIONNÉE au moment où on arme, s'il y en a une.
 * Seules les fonctionnalités comptent — la chaîne se lit sur les `dependsOn` entre cartes, un module
 * ou une note comme ancre donnerait une scène vide.
 */
function selectedFeature(): string | null {
  const sel = ui.selectedId ? project.nodeById(ui.selectedId) : null
  return sel && isFeature(sel) ? sel.id : null
}

function toggleFuncView(): void {
  ui.setFuncView(ui.funcView === 'module' ? 'plan' : 'module', defaultModule())
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Sortie du mode compact — pilule SÉPARÉE, à gauche des contrôles permanents : elle n'apparaît
         que le temps d'une chaîne isolée, et l'insérer DANS la pilule en décalerait tous les boutons
         à chaque entrée/sortie du mode. Même coquille et mêmes boutons que la pilule voisine : deux
         objets flottants voisins qui ne partageraient pas leur style se liraient comme deux
         interfaces différentes. -->
    <FloatingPanel v-if="ui.compactOn" :padded="false">
      <div class="flex items-center p-1">
        <button type="button" class="ctl ctl-labeled" @click="ui.exitCompact()">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11.5 5 6.5 10l5 5" />
          </svg>
          Vue complète
        </button>
      </div>
    </FloatingPanel>

    <FloatingPanel :padded="false" role="group" aria-label="Contrôles de la couche fonctionnelle">
      <div class="flex items-center gap-0.5 p-1">
        <!-- Compact -->
        <button
          type="button"
          class="ctl"
          :class="{ on: ui.compactArmed }"
          :data-tip="compactTip"
          :aria-pressed="ui.compactArmed"
          @click="ui.toggleCompact(selectedFeature())"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 3H4v3M16 7V4h-3M13 17h3v-3M4 13v3h3" />
            <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <!-- Vue par module : une page = un module (+ ses satellites) -->
        <button
          type="button"
          class="ctl"
          :class="{ on: ui.funcView === 'module' }"
          data-tip="Vue par module — n'afficher qu'un module et ce qui le touche"
          :aria-pressed="ui.funcView === 'module'"
          @click="toggleFuncView()"
        >
          <!-- Un cadre, une colonne pleine à gauche : le rail de modules et la page qu'il ouvre. -->
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <path d="M8 4v12" />
            <path d="M3.6 7h3.8M3.6 10h3.8M3.6 13h3.8" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>

        <span class="sep" />

        <!-- Rendu des liens longs : fond / portail -->
        <button
          type="button"
          class="ctl"
          :class="{ on: ui.funcEdgeMode === 'background' }"
          data-tip="Liens : tracés sur le fond"
          :aria-pressed="ui.funcEdgeMode === 'background'"
          @click="ui.setFuncEdgeMode('background')"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7">
            <circle cx="5.5" cy="6" r="2" /><circle cx="14.5" cy="14" r="2" />
            <path d="M7 7.4 13 12.6" stroke-dasharray="2.2 2.2" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="ctl"
          :class="{ on: ui.funcEdgeMode === 'portal' }"
          data-tip="Liens : pastilles portail (inter-modules)"
          :aria-pressed="ui.funcEdgeMode === 'portal'"
          @click="ui.setFuncEdgeMode('portal')"
        >
          <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="5.5" cy="10" r="2.4" /><circle cx="14.5" cy="10" r="2.4" /></svg>
        </button>
      </div>
    </FloatingPanel>
  </div>
</template>

<style scoped>
.ctl {
  display: grid;
  place-items: center;
  width: 36px;
  height: 30px;
  border-radius: 8px;
  color: rgb(71 85 105);
  transition: background-color 120ms, color 120ms;
}
.ctl svg { width: 18px; height: 18px; }
/* Même bouton, mais porteur d'un libellé : il n'apparaît qu'une fois (sortie du compact) et une
   icône seule ne dirait pas ce qu'on retrouve en sortant. */
.ctl-labeled {
  display: flex;
  align-items: center;
  gap: 4px;
  width: auto;
  padding: 0 10px 0 6px;
  font-size: 12px;
  font-weight: 600;
}
.ctl:hover:not(.on) { background: rgba(0, 0, 0, 0.05); color: rgb(30 41 59); }
/* Accent d'interface = `primary` (token du design system), et non plus le violet `secondary` :
   ce dernier garde un rôle SÉMANTIQUE (badge « code » d'une fonctionnalité) qu'un usage décoratif
   diluerait. Token plutôt qu'hex en dur pour que la marque reste pilotable depuis _colors.css. */
.ctl.on { background: var(--color-primary); color: #fff; }
:global(.dark) .ctl { color: rgb(212 212 216); }
:global(.dark) .ctl:hover:not(.on) { background: rgba(255, 255, 255, 0.1); color: #fff; }
.sep { width: 1px; height: 20px; background: rgba(0, 0, 0, 0.1); margin: 0 3px; }
:global(.dark) .sep { background: rgba(255, 255, 255, 0.12); }

/* Tooltip INSTANTANÉ (le title natif a un délai) — sous le bouton (pilule en haut). */
[data-tip] { position: relative; }
[data-tip]:hover::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translateX(-50%);
  white-space: nowrap;
  z-index: 60;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #0f172a;
  padding: 5px 8px;
  border-radius: 6px;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
/* (Le style `.switch` a suivi les interrupteurs dans DisplaySettings.vue.) */
</style>

<script setup lang="ts">
// Carte « Réglages d'affichage » du canvas — flotte en HAUT DROITE (maquette).
// TOUJOURS AFFICHÉE en mode canvas : il n'y a plus d'engrenage pour la faire apparaître
// (cf. FuncControls). Un réglage caché derrière un bouton est un réglage qu'on oublie ; ici l'état
// du canvas est lisible en permanence.
//
// La carte est montée sur LES DEUX COUCHES depuis la suppression de la FilterBar flottante, qui
// était le dernier point d'entrée du filtre TYPE DE NOTE — un filtre purement structurel. Mais
// chaque réglage n'existe que là où il produit un effet : afficher un contrôle mort est pire que
// ne pas l'afficher, l'utilisateur le manipule et conclut que l'app est cassée. D'où le tri par
// couche ci-dessous (`isStructural`), qui suit exactement les consommateurs réels de chaque état :
//  - regroupement lot/module, « griser les bloquées », filtre module → FeatureNode/useCanvasSync,
//    couche FONCTIONNELLE uniquement ;
//  - filtre type de note → NoteCard, couche STRUCTURELLE uniquement ;
//  - filtre lot → les deux (NoteCard grise les notes hors lot, FeatureNode les cartes).
//
// Deux niveaux de repli, qui ne servent pas la même chose :
//  - l'en-tête replie le CORPS entier (on garde la carte à l'écran sans la subir) — état porté par
//    le store (`ui.displaySettingsExpanded`) pour survivre au démontage de la carte ;
//  - chaque section est un <details> natif (ouvert par défaut) — natif plutôt qu'un v-if maison
//    parce que le clavier, l'ARIA et l'animation du marqueur sont déjà gratuits.
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { lotColor } from '@/theme/tokens'
import FloatingPanel from './FloatingPanel.vue'
import FilterBadgeField, { type FilterOption } from './FilterBadgeField.vue'

const ui = useUiStore()
const project = useProjectStore()

/** Couche active : décide QUELS réglages sont montés (voir l'en-tête du fichier). */
const isStructural = computed(() => ui.canvasLayer === 'structural')

// ── Section Filtres ────────────────────────────────────────────────────────────────────────────
// Les options viennent du PROJET, pas d'une liste figée : proposer un lot 7 quand le cadrage en
// compte trois donnerait un filtre qui ne cache jamais rien.
const lotOptions = computed<FilterOption[]>(() => {
  const lots = [...new Set(project.features.map((f) => project.lotOf(f.id)))].sort((a, b) => a - b)
  return lots.map((l) => ({ id: String(l), label: `Lot ${l}`, color: lotColor(l) }))
})
const moduleOptions = computed<FilterOption[]>(() =>
  project.modules.map((m) => ({ id: m.id, label: m.attrs.name || 'Module sans nom' })),
)

// Ponts entre les filtres MONO-valués du store et l'API tableau de FilterBadgeField (qui garde la
// porte ouverte au multi). `max: 1` est le seul endroit qui impose la cardinalité côté interface.
const lotSelection = computed<string[]>(() => (ui.lotFilter == null ? [] : [String(ui.lotFilter)]))
function setLotSelection(ids: string[]): void {
  const first = ids[0]
  ui.setLotFilter(first == null ? null : Number(first))
}
const moduleSelection = computed<string[]>(() => (ui.moduleFilter ? [ui.moduleFilter] : []))
function setModuleSelection(ids: string[]): void {
  ui.setModuleFilter(ids[0] ?? null)
}

// (Filtre « Types de note » : RETIRÉ avec la refonte v13 — les notes ont disparu du canvas, les
// commentaires se filtrent dans le panneau CommentsPanel, là où ils se lisent.)
</script>

<template>
  <FloatingPanel :padded="false" class="settings-card">
    <header class="flex items-center justify-between gap-2 px-3 py-2">
      <span class="card-title">Réglages d'affichage</span>
      <button
        type="button"
        class="fold"
        :aria-expanded="ui.displaySettingsExpanded"
        :title="ui.displaySettingsExpanded ? 'Replier' : 'Déplier'"
        @click="ui.toggleDisplaySettings()"
      >{{ ui.displaySettingsExpanded ? '▾' : '▸' }}</button>
    </header>

    <div v-if="ui.displaySettingsExpanded" class="card-body">
      <!-- Regroupement : compartiments lot/module dessinés derrière les CARTES DE FONCTIONNALITÉ.
           Aucun équivalent en couche structurelle (pages/blocs/notes) → section non montée. -->
      <details v-if="!isStructural" class="sec" open>
        <summary><span class="chev">▸</span>Regroupement</summary>
        <label class="row">
          <span>Grouper par lot</span>
          <input
            type="checkbox"
            class="switch"
            :checked="ui.groupByLot"
            @change="ui.setGroupByLot(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <label class="row">
          <span>Grouper par module</span>
          <input
            type="checkbox"
            class="switch"
            :checked="ui.groupByModule"
            @change="ui.setGroupByModule(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <label class="row">
          <span>Espacer les lots</span>
          <input
            type="checkbox"
            class="switch"
            :checked="ui.spaceLots"
            @change="ui.setSpaceLots(($event.target as HTMLInputElement).checked)"
          />
        </label>
      </details>

      <!-- Section montée sur LES DEUX couches : « toujours afficher » (LOD) vaut partout. Seule la
           ligne « Griser les bloquées » est propre au fonctionnel (prérequis non débloqués). -->
      <details class="sec" open>
        <summary><span class="chev">▸</span>Affichage</summary>
        <label v-if="!isStructural" class="row">
          <span>Griser les bloquées</span>
          <input
            type="checkbox"
            class="switch"
            :checked="ui.dimBlocked"
            @change="ui.setDimBlocked(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <!-- Court-circuite le LOD (masquage du contenu des cartes et de la grille sous zoom 0,35).
             Tenable depuis la refonte canvas (couche GL + virtualisation) ; préférence PERSONNELLE,
             persistée en localStorage par le store — chaque machine choisit selon ses moyens. -->
        <label class="row">
          <span>Toujours afficher le contenu des cartes</span>
          <input
            type="checkbox"
            class="switch"
            :checked="ui.fullCards"
            @change="ui.setFullCards(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <!-- Dérive des tiretés « dépend de » (sens du déblocage, zoom rapproché) — décochable pour
             rendre du CPU sur les machines qui le sentent. -->
        <label class="row">
          <span>Animer les liens de dépendance</span>
          <input
            type="checkbox"
            class="switch"
            :checked="ui.animateDeps"
            @change="ui.setAnimateDeps(($event.target as HTMLInputElement).checked)"
          />
        </label>
      </details>

      <details class="sec" open>
        <summary><span class="chev">▸</span>Filtres</summary>
        <FilterBadgeField
          label="Lots"
          add-label="+ Lots…"
          :options="lotOptions"
          :model-value="lotSelection"
          :max="1"
          @update:model-value="setLotSelection"
        />
        <!-- `moduleFilter` n'est lu que par FeatureNode : sans effet sur pages/blocs/notes. -->
        <FilterBadgeField
          v-if="!isStructural"
          label="Modules"
          add-label="+ Modules…"
          :options="moduleOptions"
          :model-value="moduleSelection"
          :max="1"
          @update:model-value="setModuleSelection"
        />
      </details>
    </div>
  </FloatingPanel>
</template>

<style scoped>
/* 244px : largeur de la maquette. Fixe et pas `w-fit` — les libellés des interrupteurs varient et
   une carte qui change de largeur au repli/dépli d'une section « saute » sous le curseur. */
.settings-card {
  width: 244px;
}
.card-title {
  font-size: 12.5px;
  font-weight: 600;
  color: rgb(30 41 59);
}
:global(.dark) .card-title { color: rgb(228 228 231); }

/* Le corps scrolle plutôt que de pousser la carte hors de l'écran : elle est ancrée en haut à
   droite, donc un débordement partirait sous le pli sans moyen de le rattraper. */
.card-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.fold {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1;
  color: rgb(100 116 139);
  transition: background-color 120ms, color 120ms;
}
.fold:hover { background: rgba(0, 0, 0, 0.05); color: rgb(30 41 59); }
:global(.dark) .fold { color: rgb(161 161 170); }
:global(.dark) .fold:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.sec > summary {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(148 163 184);
  user-select: none;
}
/* Le marqueur natif (triangle noir) est remplacé par `.chev`, seul à pouvoir être stylé/animé
   de façon identique sur tous les moteurs. */
.sec > summary { list-style: none; }
.sec > summary::-webkit-details-marker { display: none; }
.chev {
  display: inline-block;
  font-size: 9px;
  transition: transform 150ms ease;
}
.sec[open] > summary .chev { transform: rotate(90deg); }

.row {
  display: flex;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 6px;
  padding: 6px 4px;
  font-size: 12px;
  color: rgb(51 65 85);
}
:global(.dark) .row { color: rgb(228 228 231); }

/* Interrupteur — repris tel quel de la pilule (FuncControls) : même geste, même objet visuel. */
.switch {
  appearance: none;
  width: 34px;
  height: 19px;
  border-radius: 999px;
  background: rgb(203 213 225);
  position: relative;
  cursor: pointer;
  transition: background 150ms;
  flex: 0 0 auto;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 150ms;
}
/* Accent d'interface = token `primary` (cf. FuncControls) : le violet `secondary` reste réservé aux
   usages sémantiques (badge « code » d'une fonctionnalité). */
.switch:checked { background: var(--color-primary); }
.switch:checked::after { transform: translateX(15px); }
</style>

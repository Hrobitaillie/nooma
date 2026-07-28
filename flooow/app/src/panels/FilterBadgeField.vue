<script lang="ts">
// Bloc `<script>` normal (et non `setup`) : `<script setup>` ne peut rien exporter, or le type des
// options doit être visible par les appelants qui construisent la liste (DisplaySettings).
export interface FilterOption {
  id: string
  label: string
  /** Pastille de couleur devant le libellé (couleur de lot) ; absente = pas de pastille. */
  color?: string
}
</script>

<script setup lang="ts">
// Champ de filtre « badges retirables + combobox à recherche » de la section Filtres des réglages
// d'affichage (maquette validée). Générique : il ne connaît ni les lots ni les modules, seulement
// une liste d'options identifiées. C'est ce qui permet de le poser deux fois dans DisplaySettings
// sans dupliquer le combobox, et ce qui rendra un futur passage en multi-valeur indolore — la
// valeur est DÉJÀ un tableau ici, seul `max` la contraint aujourd'hui à un badge (voir
// `ui.lotFilter`, mono-valué parce qu'il alimente `SpecsFilter.lot` côté cœur).
import { computed, nextTick, ref, watch } from 'vue'
// `FilterOption` vient du bloc `<script>` ci-dessus : les deux blocs partagent la même portée.

const props = withDefaults(
  defineProps<{
    label: string
    options: FilterOption[]
    /** Ids sélectionnés. Tableau même en mono-valeur, pour ne pas figer la cardinalité. */
    modelValue: string[]
    /** Libellé du bouton pointillé d'ouverture, ex. « + Lots… ». */
    addLabel: string
    /** Nombre maximal de badges. Atteint, le bouton d'ajout disparaît. */
    max?: number
  }>(),
  { max: Number.POSITIVE_INFINITY },
)
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)

const byId = computed(() => new Map(props.options.map((o) => [o.id, o])))
/** Badges affichés. On repart des ids : une option disparue du projet ne doit plus être rendue. */
const selected = computed<FilterOption[]>(() =>
  props.modelValue.map((id) => byId.value.get(id)).filter((o): o is FilterOption => !!o),
)
const canAdd = computed(() => props.modelValue.length < props.max)

/** Options proposées : celles déjà prises sont EXCLUES (les reproposer n'offre aucune action). */
const matches = computed<FilterOption[]>(() => {
  const q = query.value.trim().toLowerCase()
  return props.options.filter(
    (o) => !props.modelValue.includes(o.id) && (!q || o.label.toLowerCase().includes(q)),
  )
})

function openCombo(): void {
  open.value = true
  query.value = ''
  // Le champ n'existe pas encore au moment du clic (v-if) : on attend le rendu pour le focus.
  void nextTick(() => inputRef.value?.focus())
}
function close(): void {
  open.value = false
  query.value = ''
}
function pick(id: string): void {
  // En mono-valeur (max 1) on REMPLACE au lieu d'empiler : sinon le bouton d'ajout ayant disparu,
  // la sélection serait un cul-de-sac tant qu'on n'a pas retiré le badge à la main.
  const next = props.max === 1 ? [id] : [...props.modelValue, id]
  emit('update:modelValue', next)
  close()
}
function remove(id: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((v) => v !== id),
  )
}
/** Entrée valide la PREMIÈRE option filtrée — le geste « je tape, je valide » sans viser à la souris. */
function onEnter(): void {
  const first = matches.value[0]
  if (first) pick(first.id)
}

// Clic hors du champ = fermeture. Écouteur posé seulement pendant l'ouverture : un listener
// document permanent pour un popover fermé 99 % du temps est du bruit.
function onDocPointerDown(e: PointerEvent): void {
  if (!rootRef.value?.contains(e.target as Node)) close()
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocPointerDown)
  else document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <div ref="rootRef" class="field">
    <div class="field-label">{{ label }}</div>

    <div class="badges">
      <span v-for="o in selected" :key="o.id" class="badge">
        <span v-if="o.color" class="dot" :style="{ backgroundColor: o.color }" aria-hidden="true" />
        <span class="badge-text">{{ o.label }}</span>
        <button type="button" class="badge-x" :title="`Retirer ${o.label}`" @click="remove(o.id)">
          ×
        </button>
      </span>
    </div>

    <button v-if="canAdd && !open" type="button" class="add" @click="openCombo">
      {{ addLabel }}
    </button>

    <div v-if="open" class="combo">
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="combo-search"
        :placeholder="`Rechercher…`"
        :aria-label="`Rechercher parmi les ${label.toLowerCase()}`"
        @keydown.enter.prevent="onEnter"
        @keydown.esc.prevent.stop="close"
      />
      <ul class="combo-list">
        <li v-for="o in matches" :key="o.id">
          <button type="button" class="combo-item" @click="pick(o.id)">
            <span v-if="o.color" class="dot" :style="{ backgroundColor: o.color }" aria-hidden="true" />
            {{ o.label }}
          </button>
        </li>
        <li v-if="!matches.length" class="combo-empty">Aucun résultat</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.field {
  position: relative;
  padding: 4px 4px 8px;
}
.field-label {
  margin-bottom: 5px;
  font-size: 12px;
  color: rgb(51 65 85);
}
:global(.dark) .field-label { color: rgb(228 228 231); }

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.badges:not(:empty) { margin-bottom: 5px; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 4px 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--color-primary);
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary-700);
}
.badge-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-x {
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  color: var(--color-primary);
  transition: background-color 120ms, color 120ms;
}
.badge-x:hover { background: var(--color-primary); color: #fff; }

.dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
}

/* Bouton d'ajout en POINTILLÉS : signale une place à remplir plutôt qu'une action déjà pleine. */
.add {
  width: 100%;
  padding: 4px 6px;
  border: 1px dashed var(--color-primary);
  border-radius: 6px;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary-700);
  text-align: left;
  transition: background-color 120ms;
}
.add:hover { background: rgba(255, 255, 255, 0.6); }

.combo {
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}
.combo-search {
  width: 100%;
  padding: 5px 7px;
  border: 0;
  border-bottom: 1px solid var(--color-gray-200);
  font-size: 12px;
  color: var(--color-black);
  outline: none;
}
.combo-list {
  max-height: 132px;
  overflow-y: auto;
}
.combo-item {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 4px 7px;
  font-size: 12px;
  text-align: left;
  color: rgb(51 65 85);
}
.combo-item:hover { background: var(--color-primary-300); }
.combo-empty {
  padding: 5px 7px;
  font-size: 11px;
  font-style: italic;
  color: rgb(148 163 184);
}
</style>

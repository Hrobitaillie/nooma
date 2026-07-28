<script setup lang="ts">
// Sélecteur d'une option de champ de projet (v7), partagé par la carte canvas et les panneaux.
// Désormais un mince habillage de SelectMenu (menu maison téléporté, à l'échelle de l'écran même
// dans le canvas zoomé) : ce composant n'apporte que la logique métier propre aux champs de projet
// — liste/libellé GLOBAUX au projet, ajout d'item (pied de menu) et suppression d'option (× par
// ligne, refusée si l'option est encore portée par des fonctionnalités).
import { computed, ref } from 'vue'
import type { FeatureField } from '@flooow/core/model/types'
import { useProjectStore } from '@/stores/project'
import SelectMenu, { type SelectOption } from '@/components/SelectMenu.vue'

const props = defineProps<{
  featureId: string
  field: FeatureField
}>()

const store = useProjectStore()

const draft = ref('')
/** Message d'échec transitoire (suppression refusée) — affiché dans le pied de menu. */
const notice = ref('')

const currentId = computed<string | null>(() => {
  const node = store.nodeById(props.featureId)
  if (!node || node.type !== 'feature') return null
  return node.attrs.fieldValues[props.field.id] ?? null
})
const currentName = computed(
  () => (currentId.value ? store.featureOptionById(currentId.value)?.name : null) ?? null,
)

// Options du menu : celles du champ + une entrée « Aucune valeur » (value '') quand une valeur est
// posée, pour permettre de la retirer. Les ids d'options sont des genId(), jamais '' → pas de collision.
const optionList = computed<SelectOption[]>(() => {
  const base = store.optionsOfField(props.field.id).map((o) => ({ value: o.id, label: o.name }))
  return currentId.value ? [...base, { value: '', label: 'Aucune valeur' }] : base
})

function onPick(value: string | string[] | null): void {
  const v = (value ?? '') as string
  store.setFeatureFieldValue(props.featureId, props.field.id, v === '' ? null : v)
}

/** Ajoute l'item saisi ET le sélectionne (geste attendu depuis une carte), puis referme le menu. */
function addAndPick(close: () => void): void {
  const id = store.addFeatureOption(props.field.id, draft.value)
  if (!id) return
  store.setFeatureFieldValue(props.featureId, props.field.id, id)
  draft.value = ''
  notice.value = ''
  close()
}

function remove(optionId: string): void {
  if (store.removeFeatureOption(optionId)) {
    notice.value = ''
    return
  }
  // Refus : l'option est encore portée par des fonctionnalités (pas de déliaison silencieuse).
  const n = store.optionUsageCount(optionId)
  notice.value = `Utilisée par ${n} fonctionnalité${n > 1 ? 's' : ''} — retirez-la d'abord.`
}

// Saisie d'ajout : on coupe la propagation pour que la navigation clavier du menu (↑/↓/Entrée)
// n'intercepte pas la frappe dans l'input.
function onAddKeydown(e: KeyboardEvent, close: () => void): void {
  e.stopPropagation()
  if (e.key === 'Enter') {
    e.preventDefault()
    addAndPick(close)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
</script>

<template>
  <div class="nodrag" @mousedown.stop @dblclick.stop>
    <!-- Le deux-points est POSÉ ICI : `field.label` ne porte que le nom, pour rester utilisable tel
         quel en en-tête de colonne (Specs) ou en clé d'export Markdown. -->
    <div class="field-label">{{ field.label }} :</div>
    <SelectMenu
      wrap-class="mt-1"
      :model-value="currentId"
      :options="optionList"
      :min-width="170"
      empty-text="Aucune option pour l'instant."
      @update:model-value="onPick"
    >
      <template #trigger="{ toggle, open }">
        <button
          type="button"
          class="field-pill"
          :aria-expanded="open"
          aria-haspopup="listbox"
          @click.stop="toggle"
          @mousedown.stop
          @dblclick.stop
        >
          <span :class="currentName ? '' : 'opacity-60'">{{ currentName ?? 'Choisir…' }}</span>
          <svg class="ffs-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>

      <template #option="{ option }">
        <span class="ffs-opt-label" :class="{ 'opacity-60': option.value === '' }">{{ option.label }}</span>
        <span
          v-if="option.value !== ''"
          class="ffs-del"
          role="button"
          :aria-label="`Supprimer « ${option.label} »`"
          title="Supprimer cette option du projet"
          @click.stop="remove(option.value)"
        >×</span>
      </template>

      <template #footer="{ close }">
        <input
          v-model="draft"
          class="ffs-add"
          placeholder="ajouter un item"
          @keydown="onAddKeydown($event, close)"
        />
        <p v-if="notice" class="ffs-notice">{{ notice }}</p>
      </template>
    </SelectMenu>
  </div>
</template>

<style scoped>
.field-label {
  font-size: 11px;
  letter-spacing: -0.55px;
  color: var(--color-black);
}
/* Pastille du sélecteur — reprise du badge « Backoffice » de la maquette. */
.field-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 2px;
  background: var(--color-gray-200);
  color: var(--color-gray-700);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: -0.55px;
  max-width: 100%;
}
.field-pill:hover {
  background: var(--color-gray-300);
}
.ffs-chevron {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  opacity: 0.7;
}
/* Contenu du slot #option (rendu DANS le menu téléporté, mais compilé dans CE scope → stylé ici). */
.ffs-opt-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ffs-del {
  flex-shrink: 0;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1;
  color: transparent;
  cursor: pointer;
}
.sm-option:hover .ffs-del {
  color: var(--color-gray-300);
}
.ffs-del:hover {
  color: rgb(220 38 38);
}
.ffs-add {
  width: 100%;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--color-gray-200);
  font-size: 13px;
  color: var(--color-black);
  outline: none;
}
/* Focus = accent d'interface (`primary`), pas le violet sémantique du badge « code ». */
.ffs-add:focus {
  border-color: var(--color-primary);
}
.ffs-add::placeholder {
  color: var(--color-gray-300);
}
.ffs-notice {
  margin-top: 4px;
  font-size: 11px;
  color: #d97706;
}
</style>

<script lang="ts">
/**
 * Option d'un SelectMenu. `group` (optionnel) regroupe les options sous un intertitre ; l'ordre des
 * groupes suit leur première apparition dans `options`. `hint` = texte secondaire discret à droite.
 */
export interface SelectOption {
  value: string
  label: string
  group?: string
  disabled?: boolean
  hint?: string
}
</script>

<script setup lang="ts">
// Select MAISON, réutilisable — remplace le <select> natif partout où le popup natif pose problème
// (typiquement DANS le canvas : le nœud est mis à l'échelle par le zoom Vue Flow, et le popup natif
// hérite du font-size rapetissé → options illisibles). Le menu est TÉLÉPORTÉ au <body>, donc rendu à
// l'échelle de l'écran quel que soit le zoom du canvas. Options : recherche (autocomplete), multi-
// sélection, groupes, navigation clavier. Le trigger se personnalise entièrement via le slot #trigger
// (pour garder un style maison — ex. la pastille de statut) ; sinon un bouton par défaut est fourni.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** string (mono) | string[] (multi) | null. Composant CONTRÔLÉ : la valeur vient du parent. */
    modelValue: string | string[] | null
    options: SelectOption[]
    multiple?: boolean
    searchable?: boolean
    placeholder?: string
    searchPlaceholder?: string
    disabled?: boolean
    /** Classe(s) du bouton trigger PAR DÉFAUT (ignoré si le slot #trigger est fourni). */
    triggerClass?: string | string[]
    /** Classe(s) de la racine `.sm-wrap` — sert à la placer dans un flex (ex. `shrink-0`) sans
        wrapper intermédiaire (un span wrapper introduit une line-box qui casse l'alignement). */
    wrapClass?: string | string[]
    menuClass?: string | string[]
    /** Largeur mini du menu (il s'aligne au moins sur la largeur du trigger). */
    minWidth?: number
    /** Bord du trigger sur lequel aligner le menu. */
    align?: 'left' | 'right'
    emptyText?: string
  }>(),
  {
    multiple: false,
    searchable: false,
    placeholder: 'Choisir…',
    searchPlaceholder: 'Filtrer…',
    disabled: false,
    triggerClass: undefined,
    wrapClass: undefined,
    menuClass: undefined,
    minWidth: 180,
    align: 'left',
    emptyText: 'Aucune option',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | null] }>()

const open = ref(false)
const query = ref('')
/** Index de l'option ACTIVE (surlignée clavier) dans `navOptions` ; -1 = aucune. */
const highlight = ref(-1)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

// ── Sélection ────────────────────────────────────────────────────────────────
const selectedValues = computed<string[]>(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : []
  return props.modelValue == null ? [] : [props.modelValue as string]
})
function isSelected(v: string): boolean {
  return selectedValues.value.includes(v)
}
const triggerLabel = computed(() => {
  const vals = selectedValues.value
  if (!vals.length) return props.placeholder
  const labels = vals.map((v) => props.options.find((o) => o.value === v)?.label ?? v)
  if (!props.multiple) return labels[0]
  return labels.length === 1 ? labels[0] : `${labels.length} sélectionnés`
})

// ── Filtrage + regroupement ──────────────────────────────────────────────────
const filtered = computed<SelectOption[]>(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter((o) => o.label.toLowerCase().includes(q)) : props.options
})
interface OptionGroup {
  label: string | null
  options: SelectOption[]
}
const groups = computed<OptionGroup[]>(() => {
  const out: OptionGroup[] = []
  const byLabel = new Map<string | null, OptionGroup>()
  for (const o of filtered.value) {
    const key = o.group ?? null
    let grp = byLabel.get(key)
    if (!grp) {
      grp = { label: key, options: [] }
      byLabel.set(key, grp)
      out.push(grp)
    }
    grp.options.push(o)
  }
  return out
})
/** Options navigables au clavier (dans l'ordre d'affichage, sans les désactivées). */
const navOptions = computed<SelectOption[]>(() => filtered.value.filter((o) => !o.disabled))
const navIndexByValue = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  navOptions.value.forEach((o, i) => m.set(o.value, i))
  return m
})

function choose(o: SelectOption): void {
  if (o.disabled) return
  if (props.multiple) {
    const cur = selectedValues.value
    emit(
      'update:modelValue',
      cur.includes(o.value) ? cur.filter((v) => v !== o.value) : [...cur, o.value],
    )
    // Multi : on garde le menu ouvert pour enchaîner les coches.
  } else {
    emit('update:modelValue', o.value)
    closeMenu()
  }
}

// ── Ouverture / positionnement (fixed, calé sur le rect écran du trigger) ─────
function updatePosition(): void {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const width = Math.max(props.minWidth, r.width)
  const rawLeft = props.align === 'right' ? r.right - width : r.left
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8))
  const spaceBelow = window.innerHeight - r.bottom
  const openUp = spaceBelow < 260 && r.top > spaceBelow
  menuStyle.value = {
    position: 'fixed',
    width: `${width}px`,
    left: `${left}px`,
    ...(openUp ? { bottom: `${window.innerHeight - r.top + 4}px` } : { top: `${r.bottom + 4}px` }),
  }
}

async function openMenu(): Promise<void> {
  if (props.disabled || open.value) return
  open.value = true
  query.value = ''
  updatePosition()
  const sel = navOptions.value.findIndex((o) => isSelected(o.value))
  highlight.value = sel >= 0 ? sel : navOptions.value.length ? 0 : -1
  await nextTick()
  if (props.searchable) searchRef.value?.focus()
  else menuRef.value?.focus()
}
function closeMenu(): void {
  open.value = false
  query.value = ''
  highlight.value = -1
}
function toggleMenu(): void {
  if (open.value) closeMenu()
  else void openMenu()
}

// ── Clavier ──────────────────────────────────────────────────────────────────
function scrollActiveIntoView(): void {
  void nextTick(() => {
    menuRef.value
      ?.querySelector<HTMLElement>(`[data-nav="${highlight.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}
function moveHighlight(delta: number): void {
  const n = navOptions.value.length
  if (!n) return
  const base = highlight.value < 0 ? (delta > 0 ? -1 : 0) : highlight.value
  highlight.value = (base + delta + n) % n
  scrollActiveIntoView()
}
function onMenuKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveHighlight(-1)
      break
    case 'Home':
      e.preventDefault()
      highlight.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      e.preventDefault()
      highlight.value = navOptions.value.length - 1
      scrollActiveIntoView()
      break
    case 'Enter': {
      e.preventDefault()
      const o = navOptions.value[highlight.value]
      if (o) choose(o)
      break
    }
    case 'Escape':
      e.preventDefault()
      closeMenu()
      triggerRef.value?.querySelector<HTMLElement>('[data-sm-trigger]')?.focus()
      break
    case 'Tab':
      closeMenu()
      break
  }
}
function setActive(o: SelectOption): void {
  const i = navIndexByValue.value.get(o.value)
  if (i != null) highlight.value = i
}

// Le filtrage peut faire sortir l'index actif de la plage : on le ramène dans les clous.
watch(filtered, () => {
  const n = navOptions.value.length
  if (highlight.value >= n) highlight.value = n - 1
  else if (highlight.value < 0 && n) highlight.value = 0
})

function onPointerDown(e: PointerEvent): void {
  const t = e.target as globalThis.Node
  if (triggerRef.value?.contains(t) || menuRef.value?.contains(t)) return
  closeMenu()
}
watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('scroll', updatePosition, true)
    window.removeEventListener('resize', updatePosition)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
})

// Exposé pour un pilotage externe éventuel (ex. ouvrir programmatiquement).
defineExpose({ open: openMenu, close: closeMenu, toggle: toggleMenu })
</script>

<template>
  <span ref="triggerRef" class="sm-wrap" :class="wrapClass">
    <slot name="trigger" :toggle="toggleMenu" :open="open" :label="triggerLabel" :disabled="disabled">
      <button
        type="button"
        data-sm-trigger
        class="sm-trigger"
        :class="triggerClass"
        :disabled="disabled"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click.stop="toggleMenu"
        @keydown.down.prevent="openMenu"
        @keydown.enter.prevent="toggleMenu"
      >
        <span class="sm-trigger-label truncate" :class="{ 'sm-placeholder': !selectedValues.length }">
          {{ triggerLabel }}
        </span>
        <svg class="sm-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </slot>
  </span>

  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="sm-menu"
      :class="menuClass"
      :style="menuStyle"
      role="listbox"
      tabindex="-1"
      @keydown="onMenuKeydown"
    >
      <div v-if="searchable" class="sm-search-wrap">
        <input
          ref="searchRef"
          v-model="query"
          class="sm-search"
          :placeholder="searchPlaceholder"
          @keydown="onMenuKeydown"
        />
      </div>

      <div class="sm-list">
        <template v-for="grp in groups" :key="grp.label ?? '__none__'">
          <div v-if="grp.label" class="sm-group">{{ grp.label }}</div>
          <button
            v-for="o in grp.options"
            :key="o.value"
            type="button"
            class="sm-option"
            :class="{
              'is-selected': isSelected(o.value),
              'is-active': navIndexByValue.get(o.value) === highlight,
              'is-disabled': o.disabled,
            }"
            :data-nav="navIndexByValue.get(o.value)"
            role="option"
            :aria-selected="isSelected(o.value)"
            :disabled="o.disabled"
            @click.stop="choose(o)"
            @mouseenter="setActive(o)"
          >
            <span v-if="multiple" class="sm-check" :class="{ 'sm-check--on': isSelected(o.value) }">
              <svg v-if="isSelected(o.value)" viewBox="0 0 14 14" fill="none" stroke="#fff" stroke-width="2.4">
                <path d="M3 7.5l2.5 2.5L11 4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <slot name="option" :option="o" :selected="isSelected(o.value)">
              <span class="sm-option-label truncate">{{ o.label }}</span>
            </slot>
            <span v-if="o.hint" class="sm-option-hint">{{ o.hint }}</span>
            <svg
              v-if="!multiple && isSelected(o.value)"
              class="sm-tick"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 7.5l2.5 2.5L11 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </template>
        <p v-if="!filtered.length" class="sm-empty">{{ emptyText }}</p>
      </div>

      <!-- Pied de menu optionnel (ex. input « ajouter un item »). Le contenu maîtrise sa propre
           validation ; `close` permet de refermer le menu après une action. -->
      <div v-if="$slots.footer" class="sm-footer">
        <slot name="footer" :close="closeMenu" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sm-wrap {
  display: inline-flex;
  max-width: 100%;
}
/* Bouton trigger par défaut (le slot #trigger le remplace complètement au besoin). */
.sm-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-gray-200);
  background: #fff;
  color: var(--color-gray-700);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
}
.sm-trigger:hover:not(:disabled) {
  background: var(--color-gray-100);
}
.sm-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sm-trigger-label {
  min-width: 0;
}
.sm-placeholder {
  opacity: 0.6;
}
.sm-chevron {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}
</style>

<!-- Menu NON scopé : téléporté au <body>, il est hors du sous-arbre du composant, donc les styles
     scopés ne l'atteignent pas. Préfixe `.sm-` pour éviter toute collision globale. -->
<style>
.sm-menu {
  z-index: 1000;
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--color-gray-200);
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  font-family: inherit;
}
.sm-search-wrap {
  padding: 6px;
  border-bottom: 1px solid var(--color-gray-100);
}
.sm-search {
  width: 100%;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--color-gray-200);
  background: #fff;
  font-size: 13px;
  color: var(--color-black);
  outline: none;
}
/* Focus/coche/case = accent d'interface (`primary`). Le violet `secondary` reste au badge « code ». */
.sm-search:focus {
  border-color: var(--color-primary);
}
.sm-search::placeholder {
  color: var(--color-gray-300);
}
.sm-list {
  overflow-y: auto;
  padding: 4px;
}
.sm-group {
  padding: 6px 8px 2px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-gray);
}
.sm-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  text-align: left;
  font-size: 13px;
  color: var(--color-gray-700);
  cursor: pointer;
}
.sm-option.is-active {
  background: var(--color-gray-100);
}
.sm-option.is-selected {
  font-weight: 600;
  color: var(--color-black);
}
.sm-option.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.sm-option-label {
  min-width: 0;
  flex: 1;
}
.sm-option-hint {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-gray-300);
}
.sm-tick {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--color-primary);
}
/* Case de la multi-sélection. */
.sm-check {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 4px;
  border: 1.5px solid var(--color-gray-300);
  background: #fff;
}
.sm-check--on {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.sm-empty {
  padding: 8px;
  font-size: 12px;
  font-style: italic;
  color: var(--color-gray-300);
}
.sm-footer {
  border-top: 1px solid var(--color-gray-100);
  padding: 6px;
}
</style>

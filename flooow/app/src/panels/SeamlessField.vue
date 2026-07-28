<script setup lang="ts">
// Champ « invisibilisé » façon Notion : l'input/textarea n'a ni bordure ni fond au repos (on a
// l'impression d'un simple texte éditable) ; au survol/focus un léger fond apparaît. Le textarea
// s'auto-agrandit à son contenu. Émet `update:modelValue` en direct et `commit` au blur.
import { ref, onMounted, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    multiline?: boolean
    heading?: boolean
    mono?: boolean
  }>(),
  { placeholder: '', multiline: false, heading: false, mono: false },
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'commit'): void
}>()

const area = ref<HTMLTextAreaElement | null>(null)

function resize(): void {
  const t = area.value
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${t.scrollHeight}px`
}
function onArea(e: Event): void {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  resize()
}
function onInput(e: Event): void {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

onMounted(() => {
  if (props.multiline) resize()
})
watch(
  () => props.modelValue,
  () => {
    if (props.multiline) void nextTick(resize)
  },
)
</script>

<template>
  <textarea
    v-if="multiline"
    ref="area"
    :value="modelValue"
    :placeholder="placeholder"
    rows="1"
    class="seamless block w-full resize-none"
    @input="onArea"
    @blur="emit('commit')"
  />
  <input
    v-else
    :value="modelValue"
    :placeholder="placeholder"
    type="text"
    class="seamless block w-full"
    :class="{ 'seamless-heading': heading, 'seamless-mono': mono }"
    @input="onInput"
    @blur="emit('commit')"
  />
</template>

<style scoped>
.seamless {
  border: 0;
  background: transparent;
  outline: none;
  border-radius: 6px;
  padding: 3px 6px;
  margin: -3px -6px;
  color: rgb(30 41 59);
  font-size: 14px;
  line-height: 1.5;
  transition: background-color 120ms ease;
}
.seamless::placeholder {
  color: rgb(148 163 184);
}
.seamless:hover {
  background: rgba(15, 23, 42, 0.035);
}
.seamless:focus {
  background: rgba(139, 92, 246, 0.07);
}
.seamless-heading {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: rgb(15 23 42);
}
.seamless-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
  color: rgb(124 58 237);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
</style>

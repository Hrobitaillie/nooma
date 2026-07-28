<script setup lang="ts">
// Popup de CRÉATION d'un commentaire (retour Hugo 22/07) : ancrée à côté de l'élément visé —
// l'outil 💬, le menu contextuel et la bulle de sélection de texte ouvrent CE formulaire (tag,
// message, « Commenter » / « ✳ Envoyer à Claude ») au lieu de créer un fil vide dans le panneau.
// Le fil n'existe qu'à l'envoi : fermer la popup n'écrit rien dans le document.
import { computed, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { isBlock, isPage, type CommentAnchor } from '@flooow/core/model/types'
import { isEmptyDoc, TEXT_COLORS, type RichDoc } from '@flooow/core/model/richContent'
import RichEditor from './RichEditor.vue'

const props = defineProps<{
  /** Élément visé (page ou bloc) — et, optionnellement, le passage sélectionné dans son contenu. */
  nodeId: string
  range?: { from: number; to: number; text: string }
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useProjectStore()
const session = useSessionStore()
const ui = useUiStore()

const member = computed(() => session.role !== 'client')

const targetLabel = computed(() => {
  const n = store.nodeById(props.nodeId)
  if (!n) return 'Élément'
  if (isPage(n)) return n.attrs.name || 'Page'
  if (isBlock(n)) return n.attrs.name || 'Bloc'
  return 'Élément'
})

const body = ref<RichDoc | null>(null)

// Tag optionnel : libellé libre + couleur de la palette bornée. Les libellés déjà employés dans le
// document sont proposés (datalist) pour ne pas multiplier les variantes d'un même tag.
const tagLabel = ref('')
const tagColor = ref('#f59e0b')
const TAG_COLORS = TEXT_COLORS.filter((c) => c.value != null).map((c) => c.value as string)
const knownTags = computed(() => {
  const seen = new Map<string, string>()
  for (const c of store.visibleComments) if (c.tag && !seen.has(c.tag.label)) seen.set(c.tag.label, c.tag.color)
  return [...seen.keys()]
})
function pickKnownColor(): void {
  const c = store.visibleComments.find((x) => x.tag?.label === tagLabel.value.trim())
  if (c?.tag) tagColor.value = c.tag.color
}

const canSend = computed(() => body.value != null && !isEmptyDoc(body.value))

function submit(forClaude: boolean): void {
  if (!canSend.value) return
  const anchor: CommentAnchor = props.range
    ? { nodeId: props.nodeId, range: props.range }
    : { nodeId: props.nodeId }
  const label = tagLabel.value.trim()
  const id = store.addComment({
    anchor,
    body: body.value as RichDoc,
    ...(label ? { tag: { label, color: tagColor.value } } : {}),
    forClaude,
    author: session.displayName,
  })
  emit('close')
  // Le fil créé s'active dans le panneau (qui s'ouvre) : on voit tout de suite où il vit.
  if (id) ui.setActiveComment(id)
}
</script>

<template>
  <div
    class="comment-composer w-80 rounded-lg border border-amber-300 bg-white shadow-xl"
    @pointerdown.stop
    @keydown.esc.stop="emit('close')"
  >
    <header class="flex items-center gap-2 rounded-t-lg border-b border-amber-100 bg-amber-50 px-3 py-2">
      <span class="text-sm">💬</span>
      <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">
        Commenter « {{ targetLabel }} »
      </span>
      <button
        type="button"
        class="tip rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-amber-100 hover:text-slate-600"
        data-tip="Fermer (Échap)"
        @click="emit('close')"
      >✕</button>
    </header>

    <!-- Passage visé (bulle de sélection de texte) : rappelé pour confirmer l'ancre. -->
    <p v-if="range" class="border-b border-slate-100 px-3 py-1.5 text-[12px] text-slate-500">
      Passage : <mark class="rounded-sm bg-amber-200 px-0.5">{{ range.text }}</mark>
    </p>

    <div class="composer px-3 py-2">
      <RichEditor
        variant="card"
        :model-value="body"
        placeholder="Votre commentaire…"
        @update:model-value="body = $event"
      />
    </div>

    <!-- Tag optionnel -->
    <div class="flex items-center gap-1.5 px-3 pb-2">
      <input
        v-model="tagLabel"
        list="composer-known-tags"
        type="text"
        class="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-[12.5px] outline-hidden focus:border-sky-400"
        placeholder="Tag (optionnel)"
        @change="pickKnownColor"
      />
      <datalist id="composer-known-tags">
        <option v-for="t in knownTags" :key="t" :value="t" />
      </datalist>
      <button
        v-for="color in TAG_COLORS"
        :key="color"
        type="button"
        class="h-4 w-4 shrink-0 rounded-full border"
        :class="tagColor === color ? 'ring-2 ring-sky-400 ring-offset-1' : 'border-black/10'"
        :style="{ backgroundColor: color }"
        @click="tagColor = color"
      />
    </div>

    <footer class="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
      <button
        type="button"
        class="rounded-md bg-sky-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-sky-700 disabled:opacity-40"
        :disabled="!canSend"
        @click="submit(false)"
      >Commenter</button>
      <button
        v-if="member"
        type="button"
        class="tip rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-[12.5px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
        data-tip="Fil adressé à l'agent — réservé aux membres Pilot'in"
        :disabled="!canSend"
        @click="submit(true)"
      >✳ Envoyer à Claude</button>
    </footer>
  </div>
</template>

<style scoped>
/* Même métrique de composer que le panneau (12.5px — retour Hugo : le 11px était trop petit). */
.composer {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-gray-700);
}
.composer :deep(.rich-editor-body) {
  min-height: 3.5rem;
  border: 1px solid rgb(226 232 240);
  border-radius: 6px;
  padding: 6px 8px;
  background: #fff;
}
/* Tooltip instantané (voir CommentsPanel pour la même règle — les title natifs sont trop lents). */
.tip {
  position: relative;
}
.tip:hover::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  z-index: 60;
  white-space: nowrap;
  border-radius: 6px;
  background: rgb(15 23 42 / 0.92);
  color: #fff;
  font-size: 12px;
  padding: 4px 8px;
  pointer-events: none;
}
</style>

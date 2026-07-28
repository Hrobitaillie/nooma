<script setup lang="ts">
// Éditeur de contenu riche « Notion-like » (Tiptap). Saisie markdown native (## titre, - liste,
// **gras**…) + BARRE DE MISE EN FORME flottante, PORTÉE DANS <body> (hors du canvas Vue Flow
// transformé) → taille CONSTANTE quel que soit le zoom. Poignées de bloc (drag handle) en variante
// sidebar. Émet le JSON ProseMirror (v-model), resync externe sans casser la saisie.
//
// La barre sert DEUX cas : sélection non vide (marks + lien) et simple curseur posé dans un bloc
// (conversion de bloc, couleur). Sans sélection elle s'efface pendant la FRAPPE — sinon elle
// recouvre le texte à chaque caractère — et revient au premier déplacement du curseur.
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import DragHandle from '@tiptap/extension-drag-handle-vue-3'
import { richEditExtensions, isAllowedLinkUri } from '@/composables/richText'
import { useDirectoryStore } from '@/stores/directory'
import { EMPTY_DOC, TEXT_COLORS, type RichDoc } from '@flooow/core/model/richContent'

const props = withDefaults(
  defineProps<{
    modelValue: RichDoc | null
    placeholder?: string
    variant?: 'sidebar' | 'card'
    /** v13 : la bulle de sélection propose « 💬 Commenter » (émet `comment` avec l'ancre). */
    commentable?: boolean
    /**
     * Passages commentés à SURLIGNER pendant l'édition (retour Hugo 22/07 : le surlignage
     * disparaissait dès qu'on éditait le bloc). Décorations ProseMirror — jamais de marks : rien
     * n'est écrit dans le document, le surlignage suit les frappes et disparaît proprement.
     */
    highlights?: string[]
  }>(),
  {
    placeholder: "Écrivez quelque chose… (## titre, - liste, **gras**)",
    variant: 'sidebar',
    commentable: false,
    highlights: undefined,
  },
)
const emit = defineEmits<{
  (e: 'update:modelValue', doc: RichDoc): void
  /** Ancre du passage sélectionné (positions ProseMirror + texte, cf. CommentAnchor.range). */
  (e: 'comment', range: { from: number; to: number; text: string }): void
}>()

/**
 * Décorations de surlignage des passages commentés — même repérage PAR TEXTE que RichContent
 * (repli d'ancrage du modèle) : les textes du doc sont concaténés avec leurs positions, la
 * première occurrence de chaque passage devient une décoration inline. Recalculées à chaque
 * transaction (editorProps.decorations est réévaluée par ProseMirror) : le surlignage suit
 * l'édition, et s'éteint si le passage est réécrit au point de ne plus se retrouver.
 */
function commentDecorations(state: EditorState): DecorationSet {
  const texts = (props.highlights ?? []).filter((t) => t.trim() !== '')
  if (!texts.length) return DecorationSet.empty
  const chunks: { start: number; from: number; len: number }[] = []
  let full = ''
  state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      chunks.push({ start: full.length, from: pos, len: node.text.length })
      full += node.text
    }
    return true
  })
  const posAt = (gi: number): number | null => {
    for (const c of chunks) {
      if (gi >= c.start && gi < c.start + c.len) return c.from + (gi - c.start)
    }
    return null
  }
  const decos: Decoration[] = []
  for (const t of texts) {
    const at = full.indexOf(t)
    if (at < 0) continue
    const from = posAt(at)
    const to = posAt(at + t.length - 1)
    if (from != null && to != null) decos.push(Decoration.inline(from, to + 1, { class: 'comment-hl' }))
  }
  return DecorationSet.create(state.doc, decos)
}

// Les décorations ne sont réévaluées qu'à une transaction : un changement de la LISTE des passages
// (fil résolu, nouveau fil) doit en provoquer une, à vide.
watch(
  () => props.highlights,
  () => {
    const ed = editor.value
    if (ed) ed.view.dispatch(ed.state.tr)
  },
  { deep: true },
)

/** « 💬 Commenter » (v13) : émet l'ancre du passage sélectionné, au relâchement de la sélection
 *  (la bulle n'apparaît qu'à ce moment-là). Le texte accompagne les offsets : c'est le repli
 *  d'ancrage du modèle quand le document a bougé. */
function emitComment(): void {
  const ed = editor.value
  if (!ed) return
  const { empty, from, to } = ed.state.selection
  if (empty) return
  emit('comment', { from, to, text: ed.state.doc.textBetween(from, to, '\n') })
  hideBubble()
}

const directory = useDirectoryStore()

// ── Barre flottante (position écran, portée dans body) ──────────────────────────
const bubble = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 })
/** Contexte recalculé à chaque affichage : le template ne lit PAS l'état Tiptap directement (il ne
 *  serait pas réactif de façon fiable). */
const ctx = ref<{ hasSelection: boolean; inLink: boolean }>({ hasSelection: false, inLink: false })
const colorOpen = ref(false)
const linkEditing = ref(false)
const linkDraft = ref('')
const linkInput = ref<HTMLInputElement | null>(null)

/** Vrai tant que la dernière transaction modifiait le DOCUMENT, faux dès qu'elle ne fait que déplacer
 *  le curseur (clic, flèches). Ne suffit pas seul à masquer : cf. `updateBubble`. */
let typing = false

function hideBubble(): void {
  bubble.value = { ...bubble.value, show: false }
  colorOpen.value = false
  linkEditing.value = false
}

function updateBubble(): void {
  const ed = editor.value
  if (!ed || !ed.isEditable) {
    bubble.value = { show: false, x: 0, y: 0 }
    return
  }
  // Les pop-overs (palette, saisie de lien) prennent le focus : la barre doit leur survivre.
  const held = colorOpen.value || linkEditing.value
  const { empty, from, to, $from } = ed.state.selection
  // La barre ne s'efface que quand elle GÊNE : on écrit dans un bloc qui a déjà du texte. Un bloc
  // VIDE la garde — c'est le cas d'un bloc qu'on vient d'insérer (menu « / », Entrée), où elle est
  // justement attendue. Règle fondée sur l'ÉTAT, et non sur l'origine de la transaction : elle vaut
  // donc aussi pour les commandes qui ne passent pas par `runCommand` (le menu « / » en premier).
  const writingOverText = typing && $from.parent.content.size > 0
  if ((!ed.isFocused && !held) || (empty && writingOverText && !held)) {
    hideBubble()
    return
  }
  try {
    const s = ed.view.coordsAtPos(from)
    const e = ed.view.coordsAtPos(to)
    bubble.value = { show: true, x: (s.left + e.left) / 2, y: Math.min(s.top, e.top) }
    ctx.value = { hasSelection: !empty, inLink: ed.isActive('link') }
  } catch {
    hideBubble()
  }
}
function onReposition(): void {
  if (bubble.value.show) updateBubble()
}

const editor = useEditor({
  content: (props.modelValue ?? EMPTY_DOC) as never,
  extensions: richEditExtensions(props.placeholder),
  // `.rich-body` = modèle de bloc partagé avec l'aperçu RichContent (css/rich.css) : c'est lui qui
  // évite le saut du contenu quand la carte passe en édition. `--lg` monte l'échelle des titres sur
  // les surfaces pleine largeur. `variant` ne change pas pour une instance donnée (une carte reste
  // une carte) → figé à la création de l'éditeur, comme le reste de editorProps.
  editorProps: {
    attributes: {
      class: props.variant === 'sidebar' ? 'rich-editor-body rich-body rich-body--lg' : 'rich-editor-body rich-body',
    },
    // Surlignage des passages commentés (v13) : la fonction lit `props.highlights` à chaque appel,
    // elle reste donc juste même si la liste change après la création de l'éditeur.
    decorations: commentDecorations,
  },
  onUpdate: ({ editor, transaction }) => {
    emit('update:modelValue', editor.getJSON() as RichDoc)
    if (transaction.docChanged) typing = true
    updateBubble()
  },
  // Émis APRÈS onUpdate pour une même transaction : ne relâcher `typing` que sur un déplacement pur.
  onSelectionUpdate: ({ transaction }) => {
    if (!transaction.docChanged) typing = false
    updateBubble()
  },
  onFocus: updateBubble,
  onBlur: updateBubble,
})

// Resynchronisation externe (changement de fonctionnalité, undo/redo) — sans casser le focus/saisie.
watch(
  () => props.modelValue,
  (doc) => {
    const ed = editor.value
    if (!ed || ed.isFocused) return
    const next = doc ?? EMPTY_DOC
    if (JSON.stringify(ed.getJSON()) !== JSON.stringify(next)) {
      ed.commands.setContent(next as never, { emitUpdate: false })
    }
  },
)

onMounted(() => {
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('wheel', onReposition, { passive: true })
  window.addEventListener('resize', onReposition)
  // Annuaire des mentions : chargé ici plutôt qu'au boot du hub — c'est le seul endroit où « @ »
  // peut servir. L'appel est idempotent et dédupliqué (cf stores/directory), donc les N éditeurs
  // d'une vue Catalogue ne déclenchent qu'une requête ; un échec laisse juste le menu « @ » vide.
  void directory.ensureLoaded()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('wheel', onReposition)
  window.removeEventListener('resize', onReposition)
  editor.value?.destroy()
})

interface MenuBtn {
  label: string
  title: string
  active: string | [string, Record<string, unknown>]
  run: () => void
}
// Marks inline : applicables même curseur seul (ProseMirror pose une « stored mark » → le prochain
// caractère saisi la porte). Les boutons de bloc restent des BASCULES : recliquer le titre actif
// ramène au paragraphe, ce qui évite un bouton « ¶ » dédié.
const markButtons: MenuBtn[] = [
  { label: 'B', title: 'Gras', active: 'bold', run: () => editor.value?.chain().focus().toggleBold().run() },
  { label: 'I', title: 'Italique', active: 'italic', run: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: 'U', title: 'Souligné', active: 'underline', run: () => editor.value?.chain().focus().toggleUnderline().run() },
  { label: '</>', title: 'Code', active: 'code', run: () => editor.value?.chain().focus().toggleCode().run() },
]
const blockButtons: MenuBtn[] = [
  { label: 'H1', title: 'Titre 1 (recliquer pour revenir au paragraphe)', active: ['heading', { level: 1 }], run: () => editor.value?.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'H2', title: 'Titre 2 (recliquer pour revenir au paragraphe)', active: ['heading', { level: 2 }], run: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'H3', title: 'Titre 3 (recliquer pour revenir au paragraphe)', active: ['heading', { level: 3 }], run: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: '•', title: 'Liste', active: 'bulletList', run: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: '1.', title: 'Liste numérotée', active: 'orderedList', run: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { label: '"', title: 'Citation', active: 'blockquote', run: () => editor.value?.chain().focus().toggleBlockquote().run() },
]
function isActive(a: MenuBtn['active']): boolean {
  const ed = editor.value
  if (!ed) return false
  return Array.isArray(a) ? ed.isActive(a[0], a[1]) : ed.isActive(a)
}

/**
 * Exécute une commande de la barre. Indispensable : ces commandes modifient le document, donc
 * `typing` passerait à vrai et la barre se masquerait aussitôt après le clic — impossible d'enchaîner
 * deux réglages (H2 puis une couleur). Un clic n'est pas une frappe : on relâche le drapeau.
 */
function runCommand(fn: () => void): void {
  fn()
  typing = false
  updateBubble()
}

// ── Couleur du texte (palette bornée, cf. TEXT_COLORS) ───────────────────────────
/** Couleur courante, pour la pastille du bouton. */
function currentColor(): string | null {
  return (editor.value?.getAttributes('textStyle').color as string | undefined) ?? null
}
function applyColor(value: string | null): void {
  runCommand(() => {
    const chain = editor.value?.chain().focus()
    if (!chain) return
    if (value) chain.setColor(value).run()
    else chain.unsetColor().run()
  })
  colorOpen.value = false
}

// ── Lien ─────────────────────────────────────────────────────────────────────────
function openLinkEditor(): void {
  const ed = editor.value
  if (!ed) return
  linkDraft.value = (ed.getAttributes('link').href as string | undefined) ?? ''
  colorOpen.value = false
  linkEditing.value = true
  void nextTick(() => linkInput.value?.focus())
}
/** Vrai si la saisie courante ne passera pas l'allowlist (http/https/mailto). */
function linkInvalid(): boolean {
  return linkDraft.value.trim() !== '' && !isAllowedLinkUri(linkDraft.value)
}
function applyLink(): void {
  const ed = editor.value
  if (!ed) return
  const href = linkDraft.value.trim()
  // Une URL refusée laisse l'éditeur ouvert (message inline) plutôt que d'avaler la saisie.
  if (href && !isAllowedLinkUri(href)) return
  linkEditing.value = false
  runCommand(() => {
    // Champ vidé = retrait du lien.
    const chain = ed.chain().focus().extendMarkRange('link')
    if (href) chain.setLink({ href }).run()
    else chain.unsetLink().run()
  })
}
function cancelLink(): void {
  linkEditing.value = false
  editor.value?.chain().focus().run()
}
</script>

<template>
  <div class="rich-editor" :class="`rich-editor--${variant}`">
    <!-- Barre flottante portée dans body : taille constante (hors transformation du canvas).
         `@mousedown.prevent` partout : ne jamais voler le focus de l'éditeur avant la commande. -->
    <Teleport to="body">
      <div
        v-if="bubble.show"
        class="bubble-menu"
        :style="{ left: bubble.x + 'px', top: bubble.y - 8 + 'px' }"
      >
        <!-- Saisie de lien : remplace la barre le temps de l'édition. -->
        <template v-if="linkEditing">
          <input
            ref="linkInput"
            v-model="linkDraft"
            type="url"
            class="bubble-input"
            :class="{ 'bubble-input--invalid': linkInvalid() }"
            placeholder="https://… ou mailto:…"
            aria-label="Adresse du lien"
            @keydown.enter.prevent="applyLink()"
            @keydown.esc.prevent="cancelLink()"
          />
          <span v-if="linkInvalid()" class="bubble-hint" role="alert">http, https ou mailto uniquement</span>
          <button type="button" class="bubble-btn" title="Appliquer" @mousedown.prevent="applyLink()">✓</button>
          <button type="button" class="bubble-btn" title="Annuler" @mousedown.prevent="cancelLink()">✕</button>
        </template>

        <template v-else>
          <button
            v-for="b in markButtons"
            :key="b.label"
            type="button"
            class="bubble-btn"
            :class="{ 'bubble-btn--active': isActive(b.active) }"
            :title="b.title"
            @mousedown.prevent="runCommand(b.run)"
          >{{ b.label }}</button>

          <span class="bubble-sep" aria-hidden="true" />

          <button
            v-for="b in blockButtons"
            :key="b.label"
            type="button"
            class="bubble-btn"
            :class="{ 'bubble-btn--active': isActive(b.active) }"
            :title="b.title"
            @mousedown.prevent="runCommand(b.run)"
          >{{ b.label }}</button>

          <span class="bubble-sep" aria-hidden="true" />

          <!-- Couleur : palette fermée (TEXT_COLORS). -->
          <span class="bubble-color">
            <button
              type="button"
              class="bubble-btn"
              :class="{ 'bubble-btn--active': colorOpen }"
              title="Couleur du texte"
              :aria-expanded="colorOpen"
              @mousedown.prevent="colorOpen = !colorOpen"
            >
              <span class="bubble-color__a">A</span>
              <span class="bubble-color__bar" :style="{ background: currentColor() ?? 'currentColor' }" />
            </button>
            <span v-if="colorOpen" class="bubble-palette">
              <button
                v-for="c in TEXT_COLORS"
                :key="c.id"
                type="button"
                class="bubble-swatch"
                :class="{ 'bubble-swatch--active': currentColor() === c.value }"
                :title="c.label"
                :aria-label="c.label"
                @mousedown.prevent="applyColor(c.value)"
              >
                <span class="bubble-swatch__dot" :style="{ background: c.value ?? 'transparent' }" />
              </button>
            </span>
          </span>

          <!-- Lien : nécessite une sélection, ou le curseur déjà dans un lien (pour l'éditer). -->
          <button
            v-if="ctx.hasSelection || ctx.inLink"
            type="button"
            class="bubble-btn"
            :class="{ 'bubble-btn--active': ctx.inLink }"
            :title="ctx.inLink ? 'Modifier le lien' : 'Créer un lien'"
            @mousedown.prevent="openLinkEditor()"
          >🔗</button>

          <!-- Commenter le passage sélectionné (v13, surfaces commentables uniquement). -->
          <button
            v-if="commentable && ctx.hasSelection"
            type="button"
            class="bubble-btn"
            title="Commenter ce passage"
            @mousedown.prevent="emitComment()"
          >💬</button>
        </template>
      </div>
    </Teleport>

    <!-- Poignée de bloc au survol (drag + réordonner), variante pleine largeur uniquement. -->
    <DragHandle v-if="editor && variant === 'sidebar'" :editor="editor">
      <div class="drag-handle" title="Glisser pour réordonner">
        <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor"><circle cx="3" cy="2" r="1" /><circle cx="7" cy="2" r="1" /><circle cx="3" cy="5" r="1" /><circle cx="7" cy="5" r="1" /><circle cx="3" cy="8" r="1" /><circle cx="7" cy="8" r="1" /></svg>
      </div>
    </DragHandle>

    <EditorContent :editor="editor" />
  </div>
</template>

<style scoped>
/* ── Corps de l'éditeur (aspect Notion) ── */
.rich-editor :deep(.rich-editor-body) {
  outline: none;
  /* `cursor` est héritée : dans le canvas, la carte hérite du `grab` de .vue-flow__node.draggable. */
  cursor: text;
}
/* Surlignage d'un passage commenté (décoration, v13) : même rendu que RichContent en lecture. */
.rich-editor :deep(.comment-hl) {
  background: #fde68a;
  border-radius: 2px;
}
/* Surface principale de sa page : l'éditeur assume sa typographie. */
.rich-editor--sidebar :deep(.rich-editor-body) {
  min-height: 180px;
  font-size: 15px;
  line-height: 1.65;
  color: rgb(30 41 59);
}
/* Inséré DANS une carte du canvas, qui a déjà sa propre échelle : taille, interligne, interlettrage
   et couleur restent TOUS hérités du wrapper `.card-body` (FeatureNode), qui pose le même contexte
   pour l'aperçu et pour l'éditeur. Recopier ces valeurs ici — ne serait-ce que la `font-size` — c'est
   les voir diverger : l'éditeur était figé à 10px/1.5 quand la carte est passée à 11px, et le texte
   changeait donc de TAILLE au moment où l'on sélectionnait la carte. Seul le `min-height`, qui
   n'existe qu'en édition (garder une zone cliquable sur un contenu vide), a sa place ici. */
.rich-editor--card :deep(.rich-editor-body) {
  min-height: 20px;
}
/* Le modèle de bloc (marges, titres, listes, code, liens…) vient de `.rich-body` — css/rich.css,
   partagé avec l'aperçu RichContent. NE RIEN REDÉFINIR ICI : ces styles scopés ne sont dans aucun
   @layer, ils écraseraient donc silencieusement le partagé (layer components) quelle que soit la
   spécificité, et on retrouverait le saut à la sélection. Seul l'ÉDITION-SPÉCIFIQUE a sa place. */

/* `openOnClick: false` → on édite le lien par la barre flottante, le curseur reste un curseur texte
   (l'aperçu, lui, garde le curseur par défaut : le lien y est cliquable). */
.rich-editor :deep(.rich-editor-body a) {
  cursor: text;
}
/* Placeholder par bloc vide (extension Placeholder). */
.rich-editor :deep(.is-empty::before) {
  content: attr(data-placeholder);
  color: rgb(148 163 184);
  float: left;
  height: 0;
  pointer-events: none;
}

/* ── Poignée de bloc (drag handle) ── */
.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 20px;
  margin-right: 2px;
  border-radius: 5px;
  color: rgb(148 163 184);
  cursor: grab;
  transition: background-color 120ms ease;
}
.drag-handle:hover {
  background: rgb(241 245 249);
  color: rgb(71 85 105);
}
</style>

<!-- Barre flottante : NON scopée (portée dans body, hors du composant). -->
<style>
.bubble-menu {
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  border-radius: 12px;
  background: rgb(15 23 42);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
  transform: translate(-50%, -100%);
}
.bubble-menu .bubble-sep {
  width: 1px;
  align-self: stretch;
  margin: 3px 4px;
  background: rgba(255, 255, 255, 0.16);
}
.bubble-menu .bubble-btn {
  min-width: 32px;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  color: rgb(203 213 225);
  transition: background-color 120ms ease, color 120ms ease;
}
.bubble-menu .bubble-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.bubble-menu .bubble-btn--active {
  background: rgb(139 92 246);
  color: #fff;
}

/* ── Couleur du texte : bouton « A » souligné de la teinte courante + palette fermée ── */
.bubble-color {
  position: relative;
  display: inline-flex;
}
.bubble-color .bubble-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1;
}
.bubble-color__bar {
  display: block;
  width: 15px;
  height: 3px;
  border-radius: 2px;
}
.bubble-palette {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 3px;
  padding: 5px;
  border-radius: 10px;
  background: rgb(15 23 42);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
}
.bubble-swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border-radius: 8px;
}
.bubble-swatch:hover,
.bubble-swatch--active {
  background: rgba(255, 255, 255, 0.16);
}
/* « Défaut » n'a pas de teinte : le damier gris marque l'absence de couleur. */
.bubble-swatch__dot {
  width: 15px;
  height: 15px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

/* ── Saisie de lien ── */
.bubble-input {
  width: 250px;
  padding: 5px 9px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
  outline: none;
}
.bubble-input::placeholder {
  color: rgb(148 163 184);
}
.bubble-input:focus {
  background: rgba(255, 255, 255, 0.16);
}
.bubble-input--invalid {
  box-shadow: inset 0 0 0 1px rgb(248 113 113);
}
.bubble-hint {
  padding: 0 7px;
  color: rgb(248 113 113);
  font-size: 12px;
  white-space: nowrap;
}

/* ── Menus de saisie « / » (blocs), « @ » (mentions) et « # » (liens) : popup DOM pure,
      thème clair, alignée sur le bord gauche du container Tiptap. Mécanique partagée dans
      composables/suggestionPopup.ts, contenu dans slashCommands / mentions / refLinks. ── */
.slash-menu {
  position: fixed;
  z-index: 60;
  min-width: 320px;
  /* Pas de max-height ici : slashCommands.position() la calcule depuis la place réellement
     disponible dans le viewport (et bascule le menu au-dessus du curseur si besoin). */
  overflow-y: auto;
  padding: 6px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgb(226 232 240);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.06),
    0 12px 32px rgba(15, 23, 42, 0.14);
}
.slash-menu .slash-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 9px 14px;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
}
.slash-menu .slash-item--selected {
  background: rgb(241 245 249);
}
.slash-menu .slash-item__label {
  font-size: 14px;
  font-weight: 600;
  color: rgb(15 23 42);
}
.slash-menu .slash-item__hint {
  font-size: 12px;
  color: rgb(100 116 139);
}

/* Items À PASTILLE (« @ » et « # ») : la pastille passe à gauche, sur les deux lignes. Ciblé par
   :has() pour ne pas toucher au menu « / », qui n'en a pas et reste en simple colonne. */
.slash-menu .slash-item:has(.slash-item__badge) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    'badge label'
    'badge hint';
  align-items: center;
  column-gap: 10px;
}
.slash-menu .slash-item__badge {
  grid-area: badge;
}
.slash-menu .slash-item:has(.slash-item__badge) .slash-item__label {
  grid-area: label;
}
.slash-menu .slash-item:has(.slash-item__badge) .slash-item__hint {
  grid-area: hint;
}
/* Un titre de note long ne doit pas élargir la popup indéfiniment. */
.slash-menu .slash-item__label,
.slash-menu .slash-item__hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.slash-menu .slash-item__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: rgb(241 245 249);
  color: rgb(100 116 139);
}
/* Initiales : même repli que les bulles de présence, en rond pour dire « personne ». */
.slash-menu .slash-item__badge--user {
  border-radius: 999px;
  background: rgb(238 242 255);
  color: rgb(67 56 202);
  font-size: 11px;
  letter-spacing: 0;
}
/* Teintes alignées sur celles des liens rendus (css/rich.css) : la pastille du menu annonce la
   couleur du bouton qui sera inséré. */
.slash-menu .slash-item__badge--note {
  background: rgb(238 242 255);
  color: rgb(79 70 229);
}
.slash-menu .slash-item__badge--feature {
  background: rgb(245 243 255);
  color: rgb(124 58 237);
}
.slash-menu .slash-item__badge--page {
  background: rgb(236 253 245);
  color: rgb(5 150 105);
}

/* « Aucun résultat » : sur « @ »/« # » le menu reste pertinent tant que la requête est en cours
   (contrairement à « / », où l'utilisateur écrit simplement du texte et où le menu s'efface). */
.slash-menu .slash-empty {
  padding: 10px 14px;
  font-size: 13px;
  color: rgb(100 116 139);
}
</style>

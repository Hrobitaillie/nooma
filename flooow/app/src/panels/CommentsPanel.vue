<script setup lang="ts">
// Panneau latéral droit des commentaires (v13, plan-refonte-notes-commentaires.md §Lot 3).
// Les TROIS règles anti-étroitesse, non négociables :
//   1. plancher de largeur 320 px (resize borné, largeur mémorisée en localStorage — ui store) ;
//   2. docké ou par-dessus, jamais les deux compressés (décidé par EditorView : < 1200 px → overlay) ;
//   3. la densité vient du PLI : seul le fil actif est déplié, les autres sont clampés à 2 lignes.
// Retours Hugo (22/07, 2e passe) : typo remontée (13 px de corps — le 11 px ne se lisait pas),
// fil actif nettement marqué (fond + anneau ambre), fils REGROUPÉS par élément ancré (un en-tête
// d'ancre par groupe : c'est ainsi que plusieurs commentaires sur un même bloc se lisent), et
// tooltips custom instantanés (le `title` natif est trop lent et trop petit).
// Focus croisé : cliquer un fil centre son élément sur le canvas (ui.focusNode) ; sélectionner un
// élément commenté sur le canvas allume son groupe et active son premier fil ouvert.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import type { Comment } from '@flooow/core/model/types'
import { isBlock, isPage } from '@flooow/core/model/types'
import { isEmptyDoc, TEXT_COLORS, type RichDoc } from '@flooow/core/model/richContent'
import RichContent from './RichContent.vue'
import RichEditor from './RichEditor.vue'

const store = useProjectStore()
const ui = useUiStore()
const session = useSessionStore()
// Identité du projet ouvert (mêmes params que la room collab) : sert à la référence copiable.
const route = useRoute()

// ── Restriction « pour Claude » (lot 4) ──────────────────────────────────────
// Membre Pilot'in = rôle collab dev/marin. Un client ne voit ni le filtre ✳, ni les fils forClaude
// (déjà absents de store.visibleComments), ni le bouton pour en marquer un.
const member = computed(() => session.role !== 'client')

// ── Filtres (règle 3 : en tête, un seul actif) ───────────────────────────────
type FilterId = 'open' | 'resolved' | 'claude' | `tag:${string}`
const filter = ref<FilterId>('open')

/** Tags custom présents dans les fils visibles (uniques par libellé, ordre d'apparition). */
const tagChips = computed<{ label: string; color: string }[]>(() => {
  const seen = new Map<string, string>()
  for (const c of store.visibleComments) {
    if (c.tag && !seen.has(c.tag.label)) seen.set(c.tag.label, c.tag.color)
  }
  return [...seen].map(([label, color]) => ({ label, color }))
})

function matches(c: Comment): boolean {
  if (filter.value === 'open') return !c.resolved
  if (filter.value === 'resolved') return c.resolved
  if (filter.value === 'claude') return c.forClaude === true
  return c.tag?.label === filter.value.slice(4)
}

// ── Ordre document : les fils se lisent dans l'ordre du canvas, pas d'insertion ──
const elementRank = computed<Map<string, number>>(() => {
  const rank = new Map<string, number>()
  let i = 0
  for (const page of store.orderedPages) {
    rank.set(page.id, i++)
    for (const b of store.orderedBlocksOf(page.id)) rank.set(b.id, i++)
  }
  return rank
})

const visible = computed<Comment[]>(() =>
  store.visibleComments
    .filter(matches)
    .slice()
    .sort((a, b) => {
      const ra = elementRank.value.get(a.anchor.nodeId) ?? Number.MAX_SAFE_INTEGER
      const rb = elementRank.value.get(b.anchor.nodeId) ?? Number.MAX_SAFE_INTEGER
      return ra - rb || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    }),
)

/**
 * REGROUPEMENT par élément ancré (retour Hugo : « comment gérer plusieurs commentaires sur un
 * bloc ? ») : un groupe = un élément, avec en-tête d'ancre et compteur — les fils d'un même bloc
 * se lisent ensemble, et le focus croisé allume le groupe entier.
 */
interface ThreadGroup {
  nodeId: string
  label: string
  comments: Comment[]
}
const groups = computed<ThreadGroup[]>(() => {
  const out: ThreadGroup[] = []
  for (const c of visible.value) {
    const last = out[out.length - 1]
    if (last && last.nodeId === c.anchor.nodeId) last.comments.push(c)
    else out.push({ nodeId: c.anchor.nodeId, label: anchorLabel(c), comments: [c] })
  }
  return out
})

const openCount = computed(() => store.visibleComments.filter((c) => !c.resolved).length)

/** Libellé de l'élément ancre : « Page » ou « Page › Bloc ». Cible disparue = mention explicite. */
function anchorLabel(c: Comment): string {
  const n = store.nodeById(c.anchor.nodeId)
  if (!n) return 'Élément supprimé'
  if (isPage(n)) return n.attrs.name || 'Page'
  if (isBlock(n)) {
    const page = n.parentId ? store.nodeById(n.parentId) : null
    const pageName = page && isPage(page) ? page.attrs.name || 'Page' : null
    return pageName ? `${pageName} › ${n.attrs.name || 'Bloc'}` : n.attrs.name || 'Bloc'
  }
  return 'Élément'
}

/**
 * Nom affiché en tête d'un fil ou d'une réponse (retour Hugo) : RIEN pour Claude (le ✳ suffit,
 * répéter « Claude » alourdit) ni pour les fils migrés sans auteur.
 */
function authorName(author: string): string | null {
  return author && author !== 'Claude' ? author : null
}

// ── Fil actif (règle 3 : un seul déplié) ─────────────────────────────────────
const active = computed(() => store.visibleComments.find((c) => c.id === ui.activeCommentId) ?? null)

// Le fil activé — au clic sur le canvas comme depuis la liste — se fait AMENER À LA VUE (retour
// Hugo : sélectionner un élément commenté doit faire défiler la sidebar jusqu'à son fil).
const listRef = ref<HTMLElement | null>(null)
watch(
  () => ui.activeCommentId,
  (id) => {
    if (!id) return
    void nextTick(() => {
      // `CSS.escape` n'existe pas partout (jsdom) : les ids sont des UUID/slugs sûrs, on se
      // contente d'échapper les guillemets pour rester un sélecteur valide.
      const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')
      const el = listRef.value?.querySelector(`[data-thread-id="${safe}"]`)
      // `start` et non `nearest` : le fil activé REMONTE en tête de la sidebar (retour Hugo) —
      // on sait toujours où le chercher des yeux, et son fil de réponses a la place de se déplier.
      el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    })
  },
)

function activate(c: Comment): void {
  ui.setActiveComment(c.id)
  // Centrage de l'élément commenté — seulement s'il existe encore.
  if (store.nodeById(c.anchor.nodeId)) ui.focusNode(c.anchor.nodeId)
}

// Focus croisé inverse : un élément commenté sélectionné sur le canvas allume son groupe (classe
// sur le conteneur) et active son premier fil OUVERT. On n'écrase pas un fil actif déjà ancré sur
// cet élément (naviguer dans ses réponses ne doit pas sauter au premier fil).
watch(
  () => ui.selectedId,
  (id) => {
    if (!id || !ui.commentsPanelOpen) return
    if (active.value?.anchor.nodeId === id) return
    const first = store.commentsOf(id).find((c) => !c.resolved)
    if (first) ui.setActiveComment(first.id)
  },
)

// ── Mutations ────────────────────────────────────────────────────────────────
const canWrite = computed(() => session.canWrite)

function toggleResolved(c: Comment): void {
  store.resolveComment(c.id, !c.resolved)
}
function removeThread(c: Comment): void {
  if (!window.confirm('Supprimer ce fil de commentaires (réponses comprises) ?')) return
  store.removeComment(c.id)
  if (ui.activeCommentId === c.id) ui.setActiveComment(null)
}

// Corps du fil : la création passe par la popup ancrée (CommentComposer), donc un fil a toujours
// un corps — il se réédite d'un clic sur ✎. Le repli « corps vide » reste couvert (fils migrés).
const editingBody = ref(false)
watch(active, () => (editingBody.value = false))
const bodyEditable = computed(
  () => active.value != null && canWrite.value && (editingBody.value || isEmptyDoc(active.value.body)),
)
function onBodyInput(doc: RichDoc): void {
  if (active.value) store.updateCommentBody(active.value.id, doc)
}

// Réponse : brouillon local, poussé d'un bloc à l'envoi (une réponse = une entrée d'historique).
const replyDraft = ref<RichDoc | null>(null)
function sendReply(): void {
  const c = active.value
  if (!c || !replyDraft.value || isEmptyDoc(replyDraft.value)) return
  store.replyToComment(c.id, replyDraft.value, session.displayName)
  replyDraft.value = null
}

// ── Référence copiable d'un fil ──────────────────────────────────────────────
// `flooow://<dossier>/<fichier>#<id>` : LE pont vers l'agent — colle-la à Claude (« traite ce
// commentaire flooow://… ») ou passe-la à `flooow comment <réf>`, de n'importe quel dépôt.
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function copyRef(c: Comment): void {
  const ref_ = `flooow://${String(route.params.folder ?? '')}/${String(route.params.file ?? '')}#${c.id}`
  navigator.clipboard
    ?.writeText(ref_)
    .then(() => {
      copied.value = true
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied.value = false), 1500)
    })
    .catch(() => {})
}

// ── Tag custom du fil actif (libellé + couleur, palette bornée du modèle) ────
const tagEditing = ref(false)
const tagLabel = ref('')
const tagColor = ref('#f59e0b')
const TAG_COLORS = TEXT_COLORS.filter((c) => c.value != null).map((c) => c.value as string)
function beginTag(): void {
  tagLabel.value = active.value?.tag?.label ?? ''
  tagColor.value = active.value?.tag?.color ?? '#f59e0b'
  tagEditing.value = true
}
function applyTag(): void {
  const c = active.value
  if (!c) return
  const label = tagLabel.value.trim()
  store.setCommentTag(c.id, label ? { label, color: tagColor.value } : null)
  tagEditing.value = false
}

// ── Redimensionnement (règle 1 : plancher 320 px, mémoire locale) ────────────
// Le panneau est ancré au bord DROIT dans les deux modes : la largeur se déduit du pointeur.
let resizing = false
function onResizeStart(e: PointerEvent): void {
  resizing = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onResizeMove(e: PointerEvent): void {
  if (!resizing) return
  ui.setCommentsPanelWidth(window.innerWidth - e.clientX)
}
function onResizeEnd(): void {
  resizing = false
}

// Échap referme (règle 2 : toggle unique, sortie clavier).
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ui.commentsPanelOpen) ui.toggleCommentsPanel(false)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <aside
    class="comments-panel flex h-full flex-col border-l border-slate-200 bg-white"
    aria-label="Commentaires"
  >
    <!-- Poignée de resize (bord gauche). -->
    <div
      class="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-sky-200/60"
      @pointerdown="onResizeStart"
      @pointermove="onResizeMove"
      @pointerup="onResizeEnd"
      @pointercancel="onResizeEnd"
    />

    <!-- En-tête : titre + compteur + fermeture -->
    <header class="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2">
      <span class="text-sm font-semibold text-slate-800">💬 Commentaires</span>
      <span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-500">
        {{ openCount }}
      </span>
      <button
        type="button"
        class="tip ml-auto rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        data-tip="Fermer (Échap)"
        @click="ui.toggleCommentsPanel(false)"
      >✕</button>
    </header>

    <!-- Filtres (règle 3 : en tête) -->
    <div class="flex shrink-0 flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
      <button
        type="button"
        class="chip"
        :class="{ 'chip--on': filter === 'open' }"
        @click="filter = 'open'"
      >Ouverts</button>
      <button
        type="button"
        class="chip"
        :class="{ 'chip--on': filter === 'resolved' }"
        @click="filter = 'resolved'"
      >Résolus</button>
      <button
        v-if="member"
        type="button"
        class="chip"
        :class="{ 'chip--on': filter === 'claude' }"
        @click="filter = 'claude'"
      >✳ Claude</button>
      <button
        v-for="t in tagChips"
        :key="t.label"
        type="button"
        class="chip"
        :class="{ 'chip--on': filter === `tag:${t.label}` }"
        :style="filter === `tag:${t.label}` ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' } : { borderColor: t.color }"
        @click="filter = `tag:${t.label}`"
      >{{ t.label }}</button>
    </div>

    <!-- Liste des fils, REGROUPÉS par élément ancré -->
    <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
      <p v-if="groups.length === 0" class="px-2 py-6 text-center text-[13px] text-slate-400">
        Aucun commentaire ici. Sélectionnez un élément du canvas et utilisez l'outil 💬 pour en
        créer un.
      </p>

      <section
        v-for="g in groups"
        :key="g.nodeId"
        class="thread-group mb-4 rounded-lg border p-1.5"
        :class="ui.selectedId === g.nodeId ? 'border-amber-300 bg-amber-50/50' : 'border-transparent'"
      >
        <!-- En-tête d'ancre : l'élément, et le nombre de fils s'il y en a plusieurs. -->
        <div class="flex items-center gap-1.5 px-1.5 pb-1.5">
          <span class="min-w-0 truncate text-sm font-bold text-slate-800">{{ g.label }}</span>
          <span
            v-if="g.comments.length > 1"
            class="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700"
          >{{ g.comments.length }}</span>
        </div>

        <article
          v-for="c in g.comments"
          :key="c.id"
          :data-thread-id="c.id"
          class="thread mb-2 rounded-lg border px-3 py-2.5 last:mb-0"
          :class="c.id === ui.activeCommentId
            ? 'thread--active border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300/70'
            : 'border-slate-200 bg-white hover:border-slate-300'"
        >
          <!-- En-tête du fil : AUTEUR en évidence (rien pour Claude — le ✳ suffit), tag, méta. -->
          <button type="button" class="block w-full text-left" @click="activate(c)">
            <div class="flex items-center gap-1.5">
              <span
                v-if="authorName(c.author)"
                class="min-w-0 truncate text-[13px] font-semibold text-slate-800"
              >{{ authorName(c.author) }}</span>
              <span
                v-if="c.forClaude"
                class="tip shrink-0 text-[12px]"
                data-tip="Commentaire pour Claude"
              >✳</span>
              <span
                v-if="c.tag"
                class="shrink-0 rounded-sm px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white"
                :style="{ backgroundColor: c.tag.color }"
              >{{ c.tag.label }}</span>
              <span v-if="c.resolved" class="tip shrink-0 text-[11px] text-emerald-600" data-tip="Résolu">✓</span>
              <span class="ml-auto shrink-0 text-[11px] text-slate-400">{{ c.createdAt }}</span>
            </div>
            <div v-if="c.replies.length" class="mt-1 text-[11px] text-slate-400">
              {{ c.replies.length }} réponse{{ c.replies.length > 1 ? 's' : '' }}
            </div>
            <!-- Replié : extrait RICHE clampé (retour Hugo — le texte brut aplatissait tout,
                 impossible de repérer un fil ; ici gras, titres et listes restent lisibles).
                 Clamp par max-height + fondu (le line-clamp CSS ne traverse pas les blocs). -->
            <div v-if="c.id !== ui.activeCommentId" class="excerpt mt-1.5">
              <RichContent v-if="!isEmptyDoc(c.body)" :doc="c.body" />
              <p v-else class="text-[13px] italic text-slate-400">(sans contenu)</p>
            </div>
          </button>

          <!-- Fil ACTIF : corps complet + réponses + composer -->
          <template v-if="c.id === ui.activeCommentId && active">
            <div class="mt-2 text-[13px] leading-normal text-slate-800">
              <div v-if="bodyEditable" class="composer">
                <RichEditor
                  variant="card"
                  :model-value="active.body"
                  placeholder="Votre commentaire…"
                  @update:model-value="onBodyInput"
                />
              </div>
              <template v-else>
                <RichContent :doc="active.body" />
                <button
                  v-if="canWrite"
                  type="button"
                  class="tip mt-0.5 text-[11px] text-slate-400 hover:text-slate-600"
                  data-tip="Modifier le commentaire"
                  @click="editingBody = true"
                >✎ modifier</button>
              </template>
            </div>

            <!-- Réponses -->
            <div v-for="r in active.replies" :key="r.id" class="mt-2.5 border-l-2 border-amber-200 pl-2.5">
              <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span v-if="authorName(r.author)" class="text-[12px] font-semibold text-slate-700">{{ authorName(r.author) }}</span>
                <span v-else class="tip text-[12px]" data-tip="Réponse de l'agent">✳</span>
                <span>{{ r.createdAt }}</span>
                <button
                  v-if="canWrite"
                  type="button"
                  class="tip ml-auto hover:text-red-500"
                  data-tip="Supprimer la réponse"
                  @click="store.removeCommentReply(active.id, r.id)"
                >✕</button>
              </div>
              <div class="mt-0.5 text-[13px] leading-normal text-slate-800"><RichContent :doc="r.body" /></div>
            </div>

            <!-- Composer de réponse -->
            <div v-if="canWrite" class="composer mt-2.5">
              <RichEditor
                variant="card"
                :model-value="replyDraft"
                placeholder="Répondre…"
                @update:model-value="replyDraft = $event"
              />
              <div class="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  class="rounded-md bg-sky-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-sky-700 disabled:opacity-40"
                  :disabled="!replyDraft || isEmptyDoc(replyDraft)"
                  @click="sendReply"
                >Répondre</button>

                <button
                  type="button"
                  class="tip rounded-md border border-slate-200 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
                  :data-tip="active.resolved ? 'Rouvrir le fil' : 'Marquer comme résolu'"
                  @click="toggleResolved(active)"
                >{{ active.resolved ? '↺ Rouvrir' : '✓ Résoudre' }}</button>

                <button
                  type="button"
                  class="tip rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
                  :data-tip="active.tag ? 'Modifier le tag' : 'Ajouter un tag'"
                  @click="tagEditing ? (tagEditing = false) : beginTag()"
                >🏷</button>

                <!-- Référence copiable : à coller à Claude (« traite ce commentaire <réf> »)
                     ou à `flooow comment <réf>` — voir CLAUDE.md / AGENTS.md du projet. -->
                <button
                  type="button"
                  class="tip rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
                  :data-tip="copied ? 'Référence copiée !' : 'Copier la référence (à coller à Claude)'"
                  @click="copyRef(active)"
                >🔗</button>

                <!-- Adresser à Claude (membres Pilot'in uniquement — lot 4). -->
                <button
                  v-if="member"
                  type="button"
                  class="tip rounded-md border px-2 py-1 text-[12px]"
                  :class="active.forClaude ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
                  :data-tip="active.forClaude ? 'Ne plus adresser à Claude' : 'Adresser à Claude (l\'agent le relèvera)'"
                  @click="store.setCommentForClaude(active.id, !active.forClaude)"
                >✳</button>

                <button
                  type="button"
                  class="tip ml-auto rounded-md px-1.5 py-1 text-[12px] text-slate-400 hover:text-red-500"
                  data-tip="Supprimer le fil"
                  @click="removeThread(active)"
                >🗑</button>
              </div>

              <!-- Éditeur de tag custom (libellé libre + couleur de la palette bornée) -->
              <div v-if="tagEditing" class="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
                <input
                  v-model="tagLabel"
                  type="text"
                  class="w-full rounded-sm border border-slate-300 px-1.5 py-1 text-[12px] outline-hidden focus:border-sky-400"
                  placeholder="Libellé du tag (vide = retirer)"
                  @keydown.enter.prevent="applyTag"
                />
                <div class="mt-1.5 flex items-center gap-1">
                  <button
                    v-for="color in TAG_COLORS"
                    :key="color"
                    type="button"
                    class="h-4 w-4 rounded-full border"
                    :class="tagColor === color ? 'ring-2 ring-offset-1 ring-sky-400' : 'border-black/10'"
                    :style="{ backgroundColor: color }"
                    @click="tagColor = color"
                  />
                  <button
                    type="button"
                    class="ml-auto rounded-md bg-sky-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-sky-700"
                    @click="applyTag"
                  >OK</button>
                </div>
              </div>
            </div>
          </template>
        </article>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.comments-panel {
  position: relative;
}
.chip {
  border: 1px solid rgb(226 232 240);
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 12px;
  color: rgb(71 85 105);
  background: #fff;
  transition: background-color 0.15s;
}
.chip:hover {
  background: rgb(248 250 252);
}
.chip--on {
  background: rgb(2 132 199);
  border-color: rgb(2 132 199);
  color: #fff;
}
.clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Extrait riche replié : ~3 lignes puis fondu — un max-height, pas un line-clamp, parce que le
   contenu est fait de BLOCS (paragraphes, listes) que -webkit-box ne sait pas clamper. */
.excerpt {
  position: relative;
  max-height: 4.2em;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.45;
  color: rgb(51 65 85);
  mask-image: linear-gradient(#000 55%, transparent 98%);
}
/* Composer : 12.5 px (retour Hugo — le 11 px hérité des cartes ne se lisait pas dans le panneau). */
.composer {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-gray-700);
}
.composer :deep(.rich-editor-body) {
  min-height: 2.5rem;
  border: 1px solid rgb(226 232 240);
  border-radius: 6px;
  padding: 5px 7px;
  background: #fff;
}
/* Tooltips instantanés (retour Hugo : les `title` natifs arrivent trop tard et sont illisibles).
   Pas de délai, 12 px, fond ardoise — apparition au survol immédiat via ::after. */
.tip {
  position: relative;
}
.tip:hover::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  white-space: nowrap;
  border-radius: 6px;
  background: rgb(15 23 42 / 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  padding: 4px 8px;
  pointer-events: none;
}
/* Le tooltip du bouton le plus à droite (🗑, ✕ d'en-tête) ne doit pas sortir du panneau. */
.tip.ml-auto:hover::after {
  left: auto;
  right: 0;
  transform: none;
}
</style>

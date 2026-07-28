<script setup lang="ts">
// Config d'un BLOC (section de page), en panneau flottant ANCRÉ À CÔTÉ de sa carte — pas dans la
// colonne de droite sous les réglages d'affichage, où il vivait avant. Un bloc est une section
// parmi d'autres dans une page qui en empile beaucoup : envoyer sa config à l'autre bout de l'écran
// obligeait à faire l'aller-retour des yeux pour savoir laquelle on éditait. Le positionnement est
// calculé par FlowCanvas, seul à connaître le viewport ; ce composant ne connaît que son bloc.
//
// Deux vues, une seule à la fois (maître / détail) :
//   · LISTE — un élément de config par ligne, plus un bouton « + » qui offre ce qu'on peut ajouter.
//   · DÉTAIL — le formulaire de l'élément ouvert, avec retour vers la liste.
//
// La liste est HÉTÉROGÈNE et c'est le point : tout ce qu'on accroche à un bloc s'y ajoute par le
// même geste et se relit au même endroit. Deux natures aujourd'hui, dans l'ordre du menu :
//   · connexion API (`attrs.apiRefs[i]`) — ajoutée VIDE, puis configurée en l'ouvrant ;
//   · fonctionnalité réalisée (arête `realizedBy`) — l'ajout ouvre d'abord un sélecteur, parce
//     qu'un lien sans cible ne veut rien dire (contrairement à une connexion, qu'on peut poser puis
//     remplir). D'où deux chemins d'ajout légèrement différents pour une même liste.
// C'est ce qui a remplacé la section « Réalise » (RealizationSection), autrefois affichée à part en
// bas du panneau.
//
// Le panneau n'a NI champ « nom » NI champ « type de bloc » : le nom s'édite en inline sur la carte
// (double-clic), et le type a été retiré de la config sur demande — il reste réglable par le menu
// contextuel de la carte, donc rien n'est devenu inatteignable.
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { genId } from '@flooow/core/model/factory'
import type { ApiRef, BlockNode } from '@flooow/core/model/types'
import { orderedBlockElements, movedKeys } from '@/composables/blockElements'
import FloatingPanel from './FloatingPanel.vue'
import BlockApiRefEditor from './BlockApiRefEditor.vue'
import BlockFeatureLink from './BlockFeatureLink.vue'

const props = defineProps<{ blockId: string }>()

const project = useProjectStore()

const block = computed(() => project.nodeById(props.blockId) as BlockNode | undefined)
const refs = computed<ApiRef[]>(() => block.value?.attrs.apiRefs ?? [])
/** Fonctionnalités que ce bloc réalise (arêtes `realizedBy`). */
const features = computed(() => project.featuresOfTarget(props.blockId))
/** La liste unifiée, telle qu'elle s'affiche ici ET dans la carte (même fonction pour les deux). */
const elements = computed(() =>
  block.value ? orderedBlockElements(block.value, features.value) : [],
)

/**
 * Vue détail ouverte. `null` = on est sur la liste.
 * `{ kind: 'feature', id: null }` = ajout d'un lien (sélecteur seul, pas encore de cible).
 */
type View = { kind: 'api'; index: number } | { kind: 'feature'; id: string | null }
const view = ref<View | null>(null)
/** Le menu du bouton « + » est ouvert. */
const addMenu = ref(false)

// Changer de bloc doit TOUJOURS ramener à la liste : sans ça, sélectionner un autre bloc pendant
// qu'un élément est ouvert affiche l'entrée de même rang du nouveau bloc — un formulaire qui a l'air
// d'être resté en place alors qu'il a changé de sujet — voire une vue vide s'il en a moins.
watch(
  () => props.blockId,
  () => {
    view.value = null
    addMenu.value = false
  },
)

const detailTitle = computed(() => {
  if (view.value?.kind === 'api') return 'Connexion API'
  if (view.value?.kind === 'feature') return view.value.id ? 'Fonctionnalité réalisée' : 'Ajouter une fonctionnalité'
  return block.value?.attrs.name || 'Bloc'
})

/** Libellé d'une ligne de connexion : ce qui est renseigné, sinon un appel explicite à la configurer. */
function apiLabel(r: ApiRef): string {
  const svc = project.serviceById(r.serviceId)?.name ?? ''
  const ep = `${r.method} ${r.path}`.trim()
  return [svc, ep].filter(Boolean).join(' · ') || 'À configurer'
}

function addApiRef(): void {
  addMenu.value = false
  const ref: ApiRef = { id: genId(), serviceId: '', method: '', path: '' }
  // Ajouté à `order` dans la foulée : sans ça la connexion se rangerait en fin de liste par défaut
  // de clé, ce qui donne le même résultat aujourd'hui mais cesserait d'être vrai dès qu'une
  // fonctionnalité non ordonnée traîne derrière — elle passerait devant la ligne qu'on vient de créer.
  project.updateAttrs(props.blockId, {
    apiRefs: [...refs.value, ref],
    order: [...elements.value.map((e) => e.key), ref.id],
  })
}

function removeApiRef(i: number, key: string): void {
  project.updateAttrs(props.blockId, {
    apiRefs: refs.value.filter((_, j) => j !== i),
    order: (block.value?.attrs.order ?? []).filter((k) => k !== key),
  })
  if (view.value?.kind === 'api' && view.value.index === i) view.value = null
}

/** Déplace un élément du rang `from` au rang `to`. Écrit l'ordre COMPLET (cf. `movedKeys`). */
function move(from: number, to: number): void {
  project.updateAttrs(props.blockId, { order: movedKeys(elements.value, from, to) })
  // La vue détail d'une connexion est repérée par son RANG dans `apiRefs`, que la réorganisation ne
  // touche pas — rien à recaler ici. C'est précisément ce que l'ajout de `ApiRef.id` a permis :
  // l'ordre d'affichage et le rang de stockage sont devenus deux choses indépendantes.
}

// ── Réorganisation par glisser-déposer ───────────────────────────────────────
// Glisser-déposer HTML natif (`draggable` + dragover/drop) plutôt qu'un suivi manuel du pointeur :
// le navigateur fournit déjà le seuil de déclenchement, l'image fantôme et l'annulation à l'Échap.
// Sûr ici alors qu'il ne l'aurait pas été sur une carte : ce panneau est rendu HORS du `<VueFlow>`
// (FlowCanvas le pose après la fermeture du composant), donc aucun de ces événements ne traverse le
// gestionnaire de gestes du canvas — pas de pan ni de sélection au rectangle déclenchés par erreur.
//
// Le glissé se saisit sur la LIGNE ENTIÈRE, qui devient aussi l'aperçu suivant le curseur : par
// défaut le navigateur prend pour fantôme l'élément d'où part le glissé, et partir de la poignée
// donnait donc une icône de 14 px baladeuse — on ne voyait pas ce qu'on déplaçait.
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent): void {
  // `effectAllowed` + une donnée quelconque : sans charge utile, Firefox refuse d'amorcer le glissé.
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
    // Fantôme = la ligne entière, saisie SOUS LE CURSEUR à l'endroit exact où on l'a attrapée
    // (décalage = position du clic dans la ligne), pour qu'elle ne saute pas au moment du clic.
    const row = e.currentTarget as HTMLElement
    const r = row.getBoundingClientRect()
    e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top)
  }
  // Différé d'un tour de boucle : le navigateur photographie le fantôme à la fin de ce gestionnaire,
  // et `dragFrom` déclenche l'estompage de la ligne (`opacity-40`). Posé tout de suite, c'est la
  // ligne DÉJÀ estompée qui serait capturée — le fantôme naîtrait à moitié transparent.
  setTimeout(() => {
    dragFrom.value = i
    dragOver.value = i
  }, 0)
}
function onDragEnter(i: number): void {
  if (dragFrom.value != null) dragOver.value = i
}
function onDrop(): void {
  if (dragFrom.value != null && dragOver.value != null) move(dragFrom.value, dragOver.value)
  onDragEnd()
}
function onDragEnd(): void {
  dragFrom.value = null
  dragOver.value = null
}
/** Même déplacement au clavier : la poignée est focusable, ↑/↓ déplacent la ligne. */
function onHandleKey(i: number, e: KeyboardEvent): void {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  move(i, e.key === 'ArrowUp' ? i - 1 : i + 1)
}

function addFeature(): void {
  addMenu.value = false
  view.value = { kind: 'feature', id: null }
}

function removeFeature(id: string): void {
  project.removeRealizedBy(id, props.blockId)
  project.updateAttrs(props.blockId, {
    order: (block.value?.attrs.order ?? []).filter((k) => k !== id),
  })
  if (view.value?.kind === 'feature' && view.value.id === id) view.value = null
}
</script>

<template>
  <FloatingPanel v-if="block" :padded="false" role="complementary" aria-label="Configuration du bloc">
    <div class="flex max-h-[60vh] w-72 flex-col">
      <!-- En-tête : titre, ou retour + sujet en vue détail. Le nom du bloc y est rappelé mais NON
           éditable — il s'édite sur la carte, et deux champs pour un même nom finiraient par se
           contredire (l'un débouncé, l'autre non). -->
      <header class="flex items-center gap-1.5 border-b border-black/6 px-3 py-2 dark:border-white/10">
        <button
          v-if="view"
          type="button"
          class="-ml-1 rounded-md p-1 text-slate-600 hover:bg-black/5 hover:text-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-zinc-300 dark:hover:bg-white/10"
          aria-label="Retour à la liste"
          title="Retour"
          @click="view = null"
        >
          <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5l-5 5 5 5" /></svg>
        </button>
        <span class="min-w-0 truncate text-sm font-semibold">{{ detailTitle }}</span>

        <!-- « + » : uniquement sur la liste (en détail, il n'y a rien à ajouter à un formulaire). -->
        <div v-if="!view" class="relative ml-auto">
          <button
            type="button"
            class="rounded-md p-1 text-slate-600 hover:bg-black/5 hover:text-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-zinc-300 dark:hover:bg-white/10"
            aria-label="Ajouter un élément"
            title="Ajouter un élément"
            :aria-expanded="addMenu"
            @click="addMenu = !addMenu"
          >
            <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 5v10M5 10h10" /></svg>
          </button>
          <div
            v-if="addMenu"
            class="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-black/8 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10"
              @click="addApiRef"
            >
              Ajouter une connexion API
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10"
              @click="addFeature"
            >
              Ajouter une fonctionnalité
            </button>
          </div>
        </div>
      </header>

      <div class="flex-1 space-y-3 overflow-y-auto p-3">
        <!-- ── DÉTAIL ── -->
        <BlockApiRefEditor
          v-if="view?.kind === 'api'"
          :block-id="blockId"
          :index="view.index"
        />
        <BlockFeatureLink
          v-else-if="view?.kind === 'feature'"
          :block-id="blockId"
          :linked-id="view.id"
          @done="view = null"
        />

        <!-- ── LISTE ── (une seule boucle : l'ordre est celui de `elements`, toutes natures mêlées) -->
        <template v-else>
          <p v-if="!elements.length" class="text-xs text-slate-600 dark:text-zinc-400">
            Aucun élément. Utilisez « + » pour en ajouter.
          </p>
          <ul v-else class="space-y-1">
            <!-- La LIGNE ENTIÈRE est saisissable, et c'est elle qui suit le curseur (l'aperçu de
                 glissé est réglé sur elle dans `onDragStart`). Attraper la seule poignée donnait un
                 fantôme réduit à l'icône : on ne voyait pas ce qu'on déplaçait.
                 Le clic d'ouverture survit à `draggable` : le navigateur n'amorce un glissé qu'après
                 un seuil de déplacement, et émet `click` normalement en deçà. -->
            <li
              v-for="(el, i) in elements"
              :key="el.key"
              draggable="true"
              class="flex cursor-grab items-center gap-1 rounded-md transition-colors active:cursor-grabbing"
              :class="{
                'opacity-40': dragFrom === i,
                'bg-cyan-100/70 dark:bg-cyan-500/15': dragOver === i && dragFrom !== i,
              }"
              @dragstart="onDragStart(i, $event)"
              @dragend="onDragEnd"
              @dragenter.prevent="onDragEnter(i)"
              @dragover.prevent
              @drop.prevent="onDrop"
            >
              <!-- Poignée : plus le seul point de départ du glissé (toute la ligne l'est), mais elle
                   reste l'AFFORDANCE qui l'annonce, et la cible clavier (↑/↓) pour le même geste. -->
              <span
                tabindex="0"
                role="button"
                class="shrink-0 rounded-sm px-0.5 text-slate-500 hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-zinc-400 dark:hover:text-zinc-100"
                aria-label="Déplacer (glisser, ou ↑ / ↓)"
                title="Glisser pour réorganiser (↑ / ↓ au clavier)"
                @keydown="onHandleKey(i, $event)"
              >
                <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                  <circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" />
                  <circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" />
                  <circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" />
                </svg>
              </span>

              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-black/15 px-2 py-1.5 text-left hover:border-cyan-500 hover:bg-cyan-50/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-white/15 dark:hover:bg-white/5"
                @click="view = el.kind === 'api' ? { kind: 'api', index: el.index } : { kind: 'feature', id: el.key }"
              >
                <span
                  class="shrink-0 rounded-sm px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  :class="el.kind === 'api' ? 'bg-sky-200 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300' : 'bg-violet-200 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300'"
                >
                  {{ el.kind === 'api' ? 'API' : 'Fonc' }}
                </span>
                <span class="min-w-0 truncate text-xs text-slate-700 dark:text-zinc-200">
                  {{ el.kind === 'api' ? apiLabel(el.ref) : el.feature.attrs.name || 'Sans titre' }}
                </span>
                <svg viewBox="0 0 20 20" class="ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-zinc-400" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 5l5 5-5 5" /></svg>
              </button>

              <button
                type="button"
                class="shrink-0 rounded-sm px-1.5 py-0.5 text-[13px] leading-none text-slate-500 hover:text-red-600 dark:text-zinc-400"
                aria-label="Retirer cet élément"
                @click="el.kind === 'api' ? removeApiRef(el.index, el.key) : removeFeature(el.key)"
              >
                ×
              </button>
            </li>
          </ul>
        </template>
      </div>
    </div>
  </FloatingPanel>
</template>

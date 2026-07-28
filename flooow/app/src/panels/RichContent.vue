<script setup lang="ts">
// Rendu LECTURE SEULE d'un contenu riche (document Tiptap/ProseMirror JSON) → HTML, via generateHTML
// sur le schéma CONTRÔLÉ (richExtensions) : aucun nœud HTML brut, donc le HTML produit ne contient
// que des balises de mise en forme connues (p, h1-3, ul/ol/li, strong/em/u/code, a, pre, blockquote,
// br, hr). Les deux attributs sensibles — `href` du lien et `color` du textStyle — sont bornés AU
// RENDU par richText.ts (allowlist de protocoles, palette fermée). Utilisé sur la carte, Specs,
// Catalogue.
//
// Aucun style propre : la mise en forme vient de `.rich-body` (css/rich.css), partagée avec
// RichEditor → l'aperçu et l'édition ont la même hauteur, pas de saut à la sélection.
import { computed } from 'vue'
import { generateHTML } from '@tiptap/core'
import { richExtensions } from '@/composables/richText'
import { useRefNavigation } from '@/composables/useRefNavigation'
import { isEmptyDoc, type RichDoc } from '@flooow/core/model/richContent'

const props = defineProps<{
  doc: RichDoc | null | undefined
  /**
   * Passages à SURLIGNER en jaune (v13) : textes des ancres `range` des commentaires ouverts du
   * bloc. Le repérage se fait par TEXTE et non par offsets ProseMirror — c'est le repli robuste
   * prévu au modèle (CommentAnchor.range) : un texte introuvable (passage réécrit) ne surligne
   * rien, le contour jaune du bloc continue de signaler le commentaire.
   */
  highlights?: string[]
}>()

const { onRefClick } = useRefNavigation()

/**
 * Enveloppe dans `<mark class="comment-hl">` la première occurrence de `text` dans le HTML rendu.
 * Le texte peut traverser plusieurs nœuds inline (gras, lien…) : chaque nœud texte couvert reçoit
 * SA balise mark — pas de `Range.surroundContents`, qui refuse les bornes à cheval sur deux
 * éléments.
 */
function wrapFirstMatch(root: HTMLElement, text: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  const starts: number[] = []
  let full = ''
  let n: Node | null
  while ((n = walker.nextNode())) {
    starts.push(full.length)
    full += n.textContent ?? ''
    nodes.push(n as Text)
  }
  const at = full.indexOf(text)
  if (at < 0) return
  const end = at + text.length
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Text
    const nodeStart = starts[i] as number
    const len = node.textContent?.length ?? 0
    if (nodeStart + len <= at || nodeStart >= end) continue
    const from = Math.max(at - nodeStart, 0)
    const to = Math.min(end - nodeStart, len)
    const target = node.splitText(from)
    target.splitText(to - from)
    const mark = document.createElement('mark')
    mark.className = 'comment-hl'
    target.parentNode?.insertBefore(mark, target)
    mark.appendChild(target)
  }
}

// Les libellés des mentions et des liens « # » sont résolus depuis les stores PENDANT generateHTML :
// cette lecture est donc trackée par le computed, et renommer une note (ou un départ de l'annuaire)
// rafraîchit tous les liens qui la visent — sans réécrire le contenu des documents.
const html = computed<string>(() => {
  if (isEmptyDoc(props.doc)) return ''
  let out: string
  try {
    out = generateHTML(props.doc as never, richExtensions)
  } catch {
    return ''
  }
  const texts = (props.highlights ?? []).filter((t) => t.trim() !== '')
  if (texts.length === 0 || typeof DOMParser === 'undefined') return out
  // Post-traitement DOM (pas de regex sur le HTML : l'occurrence peut traverser des balises).
  // Sûr : rien n'est injecté, on ne fait qu'envelopper des nœuds TEXTE existants.
  const parsed = new DOMParser().parseFromString(`<div>${out}</div>`, 'text/html')
  const root = parsed.body.firstElementChild as HTMLElement | null
  if (!root) return out
  for (const t of texts) wrapFirstMatch(root, t)
  return root.innerHTML
})
</script>

<template>
  <!-- v-html sûr : sortie de generateHTML sur un schéma CONTRÔLÉ (pas de HTML brut ; href et color
       bornés au rendu). Voir l'en-tête du composant. -->
  <!-- Clic délégué : les liens « # » sont des spans sans href (aucun composant Vue par node à qui
       poser un @click), la cible est reconstruite depuis data-ref-type/data-ref-id. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-if="html" class="rich-content rich-body" v-html="html" @click="onRefClick" />
</template>

<style scoped>
/* Surlignage d'un passage commenté (v13) : ambre clair, même famille que le contour des cartes.
   :deep obligatoire — le contenu vient de v-html, hors de la portée du scoping. */
.rich-content :deep(mark.comment-hl) {
  background: #fde68a;
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
</style>

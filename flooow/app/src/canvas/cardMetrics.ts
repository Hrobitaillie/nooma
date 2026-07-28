// Métriques déterministes des cartes fonctionnalité (plancher de hauteur, sans mesure DOM).
// Extraites de useCanvasSync pour être partagées avec le store : l'action « Réorganiser »
// ré-empile les cartes d'un module sans chevauchement à partir de la même estimation.
// Aucune dépendance au store ni au canvas (importable des deux côtés sans cycle).
import { shallowRef } from 'vue'
import type { BlockNode, FeatureNode } from '@flooow/core/model/types'
import { docToPlainText } from '@flooow/core/model/richContent'
import { phaseOf } from '@flooow/core/domain/lifecycle'

const CARD_CHARS_PER_LINE = 38 // approx pour ~276px à 11px
const CARD_NAME_LH = 16 // titre 14px × line-height 1.15 (miroir de .card-title, FeatureNode.vue)
const CARD_TEXT_LH = 16.5 // corps 11px × line-height 1.5 (miroir de .card-body, FeatureNode.vue)
const CARD_LABEL_H = 15
/** Un champ de projet sur la carte : gap + libellé + gap + pastille du sélecteur. */
const CARD_FIELD_H = 6 + CARD_LABEL_H + 4 + 20

/**
 * Interstice vertical entre deux cartes ré-empilées (miroir de l'empilement natif :
 * FEATURE_STEP 236 − FEATURE_HEIGHT 208).
 */
export const FEATURE_CARD_GAP = 28

// ── Registre des hauteurs RÉELLES des cartes fonctionnalité ──────────────────
/**
 * Hauteur MESURÉE de chaque `.feature-node` rendue, alimentée par le ResizeObserver de
 * FeatureNode.vue et consommée par `functionalLayout` (useCanvasSync).
 *
 * POURQUOI un registre à part, plutôt que la hauteur du nœud Vue Flow. Le nœud porte
 * `minHeight = hauteur ESTIMÉE` : sa boîte vaut donc `max(estimation, contenu)` et reste COLLÉE à
 * l'estimation tant que le contenu passe dessous. Or l'estimation sur-estime largement (mesuré :
 * nœud 864px pour une carte de 749px) — une carte qui grandissait de 686 à 736px ne faisait bouger
 * AUCUNE des 81 cartes, parce que `dimensions.height` n'avait pas bougé d'un pixel. Le layout doit
 * lire ce que la CARTE fait réellement, pas le plancher qu'on a réservé pour elle.
 *
 * Pas de boucle possible : ce registre ne sert qu'au calcul de POSITIONS. Le seul retour de la
 * mesure vers le rendu est le `minHeight` du nœud, et la carte (bloc en hauteur auto dans un nœud
 * sans hauteur imposée) ne s'étire jamais pour le remplir — poser `minHeight = hauteur mesurée`
 * laisse donc la carte strictement identique, la mesure suivante est la même, la boucle s'éteint.
 */
const measuredCardHeights = new Map<string, number>()

/**
 * Compteur de révision des hauteurs mesurées : c'est le SIGNAL réactif du re-layout. Une `Map` n'est
 * pas réactive et la rendre profonde coûterait cher pour rien — un entier qui s'incrémente suffit à
 * réveiller le watch, qui coalesce ensuite sur une frame.
 */
export const cardHeightsVersion = shallowRef(0)

/** Enregistre la hauteur rendue d'une carte. No-op si elle n'a pas bougé (au pixel près). */
export function setCardHeight(id: string, height: number): void {
  const h = Math.round(height)
  if (h <= 0 || measuredCardHeights.get(id) === h) return
  measuredCardHeights.set(id, h)
  cardHeightsVersion.value++
}

/**
 * Oublie la mesure d'une carte démontée. Volontairement SANS incrément de version : une carte qui
 * disparaît ne peut plus déplacer personne, et bumper ici rouvrirait un aller-retour
 * démontage → re-layout → re-rendu dont on n'a aucun besoin.
 */
export function forgetCardHeight(id: string): void {
  measuredCardHeights.delete(id)
}

/** Hauteur rendue d'une carte, ou `undefined` tant qu'elle n'a jamais été mesurée. */
export function cardHeight(id: string): number | undefined {
  return measuredCardHeights.get(id)
}

/** Interstice vertical entre deux blocs empilés dans leur page (autolayout structurel). */
export const BLOCK_CARD_GAP = 16

/**
 * Hauteur estimée (plancher) d'une carte BLOC : titre + contenu riche + connexions API.
 * Même rôle qu'estimateFeatureCard : plancher avant mesure DOM — l'autolayout de la page empile
 * sur la hauteur RÉELLE (Vue Flow/ResizeObserver) dès que la carte est rendue.
 * Métriques : p-4 (16) + gap-3 (12) entre sections, titre text-base (~24), corps 11px (CARD_TEXT_LH).
 */
export function estimateBlockCard(node: BlockNode): number {
  const a = node.attrs
  const contentLines = textLines(docToPlainText(a.content), 200)
  let h = 16 + 24 // pad haut + ligne de titre
  if (contentLines) h += 12 + contentLines * CARD_TEXT_LH
  if (a.apiRefs.length) h += 12 + a.apiRefs.length * 24
  h += 16 // pad bas
  return Math.max(Math.round(h), 88)
}

/** Nombre de lignes affichées (clamp ellipsis) par zone de la carte ; 0 = zone masquée. */
export interface FeatureClamps {
  name: number
  content: number // aperçu du contenu riche (texte brut clampé)
}

export function clampLines(text: string | null | undefined, cap: number): number {
  const t = (text ?? '').trim()
  if (!t) return 0
  return Math.min(cap, Math.max(1, Math.ceil(t.length / CARD_CHARS_PER_LINE)))
}

/**
 * Lignes d'affichage d'un texte MULTI-BLOCS (texte brut d'un document riche) : chaque ligne source
 * (paragraphe, item de liste, titre, ligne vide de séparation) occupe au moins une ligne rendue —
 * `longueur/42` seul sous-estime fortement un contenu structuré en sections courtes.
 */
export function textLines(text: string | null | undefined, cap: number): number {
  const t = (text ?? '').trim()
  if (!t) return 0
  const lines = t
    .split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.trim().length / CARD_CHARS_PER_LINE)), 0)
  return Math.min(cap, lines)
}

/**
 * Hauteur estimée d'une carte + lignes affichées (déterministe, sans mesure DOM). Sert de PLANCHER :
 * la carte s'auto-dimensionne au contenu réel (Vue Flow ResizeObserver), donc pas d'ellipsis ni de
 * clip — le contenu s'affiche EN ENTIER. `realizerCount` = nombre de pages/blocs qui réalisent la
 * fonctionnalité (chips « réalisé par »). `fieldCount` = nombre de champs de projet affichés en pied
 * de carte (doc.featureFields) — variable depuis la v7, d'où le paramètre. `expanded` (carte
 * sélectionnée) réserve un peu plus de place pour l'édition (zone minimale + respiration).
 */
export function estimateFeatureCard(
  node: FeatureNode,
  realizerCount: number,
  fieldCount: number,
  expanded = false,
): { height: number; clamps: FeatureClamps } {
  const a = node.attrs
  const rawContent = textLines(docToPlainText(a.content), 200) // contenu complet (pas d'ellipsis)
  const clamps: FeatureClamps = {
    name: Math.max(1, clampLines(a.name || 'Fonctionnalité', 2)),
    content: expanded ? Math.max(rawContent, 3) : rawContent, // min ~3 lignes en édition
  }
  let h = 10 + 19 + 6 // pad haut + ligne badges + marge titre
  h += clamps.name * CARD_NAME_LH
  if (clamps.content) h += 6 + clamps.content * CARD_TEXT_LH
  if (expanded) h += 20 // respiration d'édition (curseur/bulle)
  // « Réalisé par » : chips (≈2 par ligne) + label, si présent.
  if (realizerCount > 0) h += CARD_LABEL_H + Math.ceil(realizerCount / 2) * 20
  h += fieldCount * CARD_FIELD_H // sélecteurs de champs, toujours présents (éditables inline)
  // Zone de suivi (v10) : toujours présente (pointillé + ligne titre/select), + une ligne par item
  // de la phase courante, + barre de progression si ≥1 item, + input « ajouter » (inconditionnel).
  const phaseItems = a.checklist.filter((i) => i.phase === phaseOf(a.status)).length
  h += 8 + 24 // séparateur pointillé (marge + trait) + ligne titre/select
  h += phaseItems * 20
  if (phaseItems > 0) h += 6 + 7 // marge + barre de progression
  // Input « ajouter une étape » : rendu en permanence (plus seulement carte sélectionnée), donc
  // compté en permanence — sans quoi le plancher sous-estimerait toute carte non sélectionnée.
  h += 6 + 24 // marge + input d'ajout d'étape
  h += 10 // pad bas
  return { height: Math.max(Math.round(h), 68), clamps }
}

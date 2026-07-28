// Mémoire du CADRAGE (pan + zoom) d'un projet, côté client uniquement.
//
// POURQUOI hors du document : le projet est co-édité — le pont collab (packages/core/src/collab)
// persiste le store dans le `.graph.json`, qui est versionné et partagé. Or le cadrage est une
// préférence STRICTEMENT personnelle : rangé dans le document, il voyagerait chez tous les pairs
// (chacun se ferait déplacer la vue par le voisin) et salirait le fichier de projet à chaque
// molette. D'où le `localStorage`, indexé sur l'identité du projet ouvert (`folder/file`, les mêmes
// params de route qui servent à ouvrir la room collab).
//
// POURQUOI le CONTEXTE est mémorisé avec les coordonnées : un viewport n'a de sens que dans la
// scène où il a été pris. Les couches (structurelle / fonctionnelle) et la vue par module dessinent
// des scènes DISJOINTES, à des coordonnées monde sans rapport. Restaurer un cadrage pris en vue
// plan alors qu'on arrive sur une vue par module, c'est atterrir sur du vide. On ne restaure donc
// que si le contexte concorde ; sinon on laisse le recadrage automatique (`fitView`) faire son
// travail. C'est aussi ce qui règle l'arbitrage « lien partagé vs cadrage personnel » : une URL qui
// porte une vue précise que le destinataire n'avait jamais ouverte ne concorde pas, il voit donc la
// scène cadrée sur son contenu, pas le cadrage intime de quelqu'un d'autre.
import type { CanvasLayer } from '@flooow/core/model/types'
import type { FuncView } from '@/stores/ui'

/** Contexte de scène dans lequel un cadrage a été pris (et le seul où le rejouer a du sens). */
export interface ViewportContext {
  layer: CanvasLayer
  funcView: FuncView
  /** Module affiché en vue par module ; `null` hors de cette vue. */
  funcModule: string | null
}

export interface ViewportMemo extends ViewportContext {
  x: number
  y: number
  zoom: number
}

/** Clé de stockage d'un projet. `folder/file` = l'identité de la room collab, donc du document. */
export function viewportMemoKey(folder: string, file: string): string {
  return `flooow:viewport:${folder}/${file}`
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Relit un mémo sérialisé. Rend `null` sur TOUT ce qui n'est pas un mémo complet et sain : JSON
 * cassé, champs manquants, `NaN`/`Infinity` (un zoom infini fige le canvas), zoom nul ou négatif,
 * ou écrit par une version antérieure au champ de contexte. On préfère perdre un cadrage que
 * restaurer une transformation qui rendrait le canvas inutilisable.
 */
export function parseViewportMemo(raw: string | null | undefined): ViewportMemo | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const m = data as Record<string, unknown>
  if (!isFiniteNumber(m.x) || !isFiniteNumber(m.y) || !isFiniteNumber(m.zoom)) return null
  if (m.zoom <= 0) return null
  if (m.layer !== 'structural' && m.layer !== 'functional') return null
  if (m.funcView !== 'plan' && m.funcView !== 'module') return null
  if (m.funcModule !== null && typeof m.funcModule !== 'string') return null
  return {
    x: m.x,
    y: m.y,
    zoom: m.zoom,
    layer: m.layer,
    funcView: m.funcView,
    funcModule: m.funcModule,
  }
}

export function serializeViewportMemo(memo: ViewportMemo): string {
  return JSON.stringify(memo)
}

/**
 * Le mémo est-il rejouable dans le contexte courant ? En vue plan, `funcModule` ne décrit aucune
 * scène (il n'est qu'un souvenir du dernier module visité) : le comparer ferait échouer la
 * restauration pour une valeur qui ne change rien à ce qui est dessiné.
 */
export function viewportMemoApplies(memo: ViewportMemo, ctx: ViewportContext): boolean {
  if (memo.layer !== ctx.layer) return false
  if (memo.layer === 'structural') return true
  if (memo.funcView !== ctx.funcView) return false
  if (memo.funcView === 'plan') return true
  return memo.funcModule === ctx.funcModule
}

/**
 * Lecture tolérante : `localStorage` peut être indisponible (mode privé de certains navigateurs,
 * stockage bloqué par la politique du site) — l'accès lui-même lève alors. Jamais d'exception vers
 * l'appelant : l'ouverture d'un projet ne doit pas dépendre de la santé du stockage.
 */
export function readViewportMemo(key: string): ViewportMemo | null {
  try {
    return parseViewportMemo(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

/** Écriture best-effort. Quota plein (`QuotaExceededError`) = cadrage perdu, rien de plus. */
export function writeViewportMemo(key: string, memo: ViewportMemo): void {
  try {
    window.localStorage.setItem(key, serializeViewportMemo(memo))
  } catch {
    /* stockage plein ou interdit : on renonce silencieusement */
  }
}

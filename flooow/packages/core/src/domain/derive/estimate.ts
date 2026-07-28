// Chiffrage : graphe → totaux heures par lot/page/facette (format v2) + couche fonctionnelle v3.
// Deux sources coexistent pendant la transition (decisions.md §15) :
//   - COMPORTEMENTS (notes) : héritage historique, `hours` numérique ;
//   - FONCTIONNALITÉS : l'estimation vit désormais ici (`estimate` texte, ex. « 1j »), parsée en heures.
// Le rendu affiche les deux séparément tant que des comportements portent encore des heures.
import type {
  BehaviorNote,
  FeatureNode,
  FlooowNode,
  ModuleNode,
  NodeIndex,
  ProjectDoc,
} from '@flooow/core/model/types'
import { isBehaviorNote, isFeature, isModule } from '@flooow/core/model/types'
import { resolveLot } from '@flooow/core/domain/lots'
import { pageOf } from '@flooow/core/domain/rollup'
import { realizersOf } from '@flooow/core/domain/realization'

/** Nombre d'heures dans une journée-homme (conversion « 1j » → heures). */
export const HOURS_PER_DAY = 8

/**
 * Parse une estimation texte libre (façon locasyst : « 1j », « 0,5j », « 2h », « 1j 4h ») en heures.
 * Virgule décimale acceptée. Un nombre nu est interprété en JOURS (unité dominante du cadrage).
 * Renvoie null si rien d'exploitable (« à estimer », vide, « ? »).
 */
export function parseEstimate(raw: string): number | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/,/g, '.')
  if (!s) return null
  let hours = 0
  let matched = false
  const days = s.match(/(\d+(?:\.\d+)?)\s*(?:jours?|j|days?|d)\b/)
  if (days) {
    hours += parseFloat(days[1]!) * HOURS_PER_DAY
    matched = true
  }
  const hrs = s.match(/(\d+(?:\.\d+)?)\s*(?:heures?|h|hrs?)\b/)
  if (hrs) {
    hours += parseFloat(hrs[1]!)
    matched = true
  }
  if (matched) return hours
  const bare = s.match(/^(\d+(?:\.\d+)?)$/)
  if (bare) return parseFloat(bare[1]!) * HOURS_PER_DAY // nombre nu = jours
  return null
}

/** Fourchette basse (heures saisies) / haute (× riskCoeff). */
export interface EstimateTotal {
  low: number
  high: number
}

export interface EstimateBucket {
  key: string // ex. lot number en string, id de page, facette
  label: string
  total: EstimateTotal
}

/** Chiffrage issu de la couche fonctionnelle (fonctionnalités → heures parsées). */
export interface FeatureEstimate {
  byLot: EstimateBucket[]
  byModule: EstimateBucket[] // groupé par module parent (« Transverse » pour les racines)
  byPage: EstimateBucket[] // roll-up via realizedBy (une fonctionnalité comptée sur chaque page réalisée)
  /** fonctionnalités sans estimation exploitable. */
  unestimated: FeatureNode[]
  total: EstimateTotal
}

export interface Estimate {
  byLot: EstimateBucket[]
  byPage: EstimateBucket[]
  byFacet: EstimateBucket[]
  /** notes chiffrables sans `hours` renseigné. */
  unestimated: FlooowNode[]
  total: EstimateTotal
  /** chiffrage de la couche fonctionnelle (source cible en v3). */
  features: FeatureEstimate
}

/** Applique le coefficient de risque pour obtenir la fourchette haute. */
function toTotal(hours: number, riskCoeff: number): EstimateTotal {
  return { low: hours, high: hours * riskCoeff }
}

/**
 * Construit les totaux de chiffrage. Conversion € (dailyRate) au rendu uniquement, jamais ici.
 * Seules les notes comportement portent des heures.
 */
export function deriveEstimate(doc: ProjectDoc): Estimate {
  const index: NodeIndex = new Map(doc.nodes.map((n) => [n.id, n]))
  const riskCoeff = doc.meta.pricing.riskCoeff

  const behaviors = doc.nodes.filter(isBehaviorNote)
  const estimated = behaviors.filter((b): b is BehaviorNote => b.attrs.hours != null)
  const unestimated: FlooowNode[] = behaviors.filter((b) => b.attrs.hours == null)

  // Accumulateurs d'heures par clé, avec un libellé stable.
  const lotHours = new Map<string, number>()
  const pageHours = new Map<string, number>()
  const pageLabel = new Map<string, string>()
  const facetHours = new Map<string, number>()
  let totalHours = 0

  const facetLabel: Record<string, string> = {
    front: 'Front',
    back: 'Back',
    fullstack: 'Fullstack',
    none: 'Non précisé',
  }

  for (const b of estimated) {
    const hours = b.attrs.hours as number
    totalHours += hours

    const lotKey = String(resolveLot(b.id, index))
    lotHours.set(lotKey, (lotHours.get(lotKey) ?? 0) + hours)

    const page = pageOf(b.id, index)
    const pageKey = page ? page.id : 'none'
    pageHours.set(pageKey, (pageHours.get(pageKey) ?? 0) + hours)
    if (!pageLabel.has(pageKey)) {
      pageLabel.set(pageKey, page ? page.attrs.name : 'Hors page')
    }

    const facetKey = b.attrs.facet ?? 'none'
    facetHours.set(facetKey, (facetHours.get(facetKey) ?? 0) + hours)
  }

  const byLot: EstimateBucket[] = [...lotHours.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, hours]) => ({ key, label: `Lot ${key}`, total: toTotal(hours, riskCoeff) }))

  const byPage: EstimateBucket[] = [...pageHours.entries()]
    .sort((a, b) => (pageLabel.get(a[0]) ?? '').localeCompare(pageLabel.get(b[0]) ?? ''))
    .map(([key, hours]) => ({
      key,
      label: pageLabel.get(key) ?? key,
      total: toTotal(hours, riskCoeff),
    }))

  const byFacet: EstimateBucket[] = [...facetHours.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, hours]) => ({
      key,
      label: facetLabel[key] ?? key,
      total: toTotal(hours, riskCoeff),
    }))

  return {
    byLot,
    byPage,
    byFacet,
    unestimated,
    total: toTotal(totalHours, riskCoeff),
    features: deriveFeatureEstimate(doc, index, riskCoeff),
  }
}

/** Chiffrage de la couche fonctionnelle : fonctionnalités → heures parsées, ventilées lot/module/page. */
function deriveFeatureEstimate(
  doc: ProjectDoc,
  index: NodeIndex,
  riskCoeff: number,
): FeatureEstimate {
  const features = doc.nodes.filter(isFeature)
  const unestimated: FeatureNode[] = []

  const lotHours = new Map<string, number>()
  const moduleHours = new Map<string, number>()
  const moduleLabel = new Map<string, string>()
  const pageHours = new Map<string, number>()
  const pageLabel = new Map<string, string>()
  let totalHours = 0

  for (const f of features) {
    const hours = parseEstimate(f.attrs.estimate)
    if (hours == null) {
      unestimated.push(f)
      continue
    }
    totalHours += hours

    const lotKey = String(resolveLot(f.id, index))
    lotHours.set(lotKey, (lotHours.get(lotKey) ?? 0) + hours)

    const moduleKey = f.parentId ?? 'none'
    moduleHours.set(moduleKey, (moduleHours.get(moduleKey) ?? 0) + hours)
    if (!moduleLabel.has(moduleKey)) {
      const mod = f.parentId ? index.get(f.parentId) : undefined
      moduleLabel.set(
        moduleKey,
        mod && isModule(mod) ? (mod as ModuleNode).attrs.name || 'Module' : 'Transverse',
      )
    }

    // Roll-up par page via realizedBy : chaque page/bloc réalisant la fonctionnalité reçoit ses
    // heures (dédupliquées par page). Une fonctionnalité réalisée par n pages compte sur chacune.
    const realizedPages = new Map<string, string>()
    for (const target of realizersOf(f.id, doc.edges, index)) {
      const page = pageOf(target.id, index)
      if (page) realizedPages.set(page.id, page.attrs.name)
    }
    for (const [pageId, name] of realizedPages) {
      pageHours.set(pageId, (pageHours.get(pageId) ?? 0) + hours)
      if (!pageLabel.has(pageId)) pageLabel.set(pageId, name)
    }
  }

  const byLot: EstimateBucket[] = [...lotHours.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, hours]) => ({ key, label: `Lot ${key}`, total: toTotal(hours, riskCoeff) }))

  const byModule: EstimateBucket[] = [...moduleHours.entries()]
    .sort((a, b) => (moduleLabel.get(a[0]) ?? '').localeCompare(moduleLabel.get(b[0]) ?? ''))
    .map(([key, hours]) => ({
      key,
      label: moduleLabel.get(key) ?? key,
      total: toTotal(hours, riskCoeff),
    }))

  const byPage: EstimateBucket[] = [...pageHours.entries()]
    .sort((a, b) => (pageLabel.get(a[0]) ?? '').localeCompare(pageLabel.get(b[0]) ?? ''))
    .map(([key, hours]) => ({
      key,
      label: pageLabel.get(key) ?? key,
      total: toTotal(hours, riskCoeff),
    }))

  return { byLot, byModule, byPage, unestimated, total: toTotal(totalHours, riskCoeff) }
}

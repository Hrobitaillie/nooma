// Dérivation de la vue API (format v2, evolution-v2.md §4).
// Regroupée PAR SERVICE (URL de base en tête). Sous chaque service : tous les endpoints
// référencés par des notes API, et pour chaque endpoint les pages/blocs consommateurs
// (remontés via attachedTo). Services `risk:high` en tête. Base de l'export contrat d'API.
import type { ApiNote, NodeIndex, ProjectDoc, Service, ServiceEndpoint } from '@flooow/core/model/types'
import { isApiNote, isBlock, isPage } from '@flooow/core/model/types'
import { pageOf } from '@flooow/core/domain/rollup'
import { endpointId } from '@flooow/core/domain/invariants'
import { featuresRealizedBy } from '@flooow/core/domain/realization'

/** Référence légère d'une fonctionnalité (pont realizedBy). */
export interface ApiFeatureRef {
  id: string
  code: string
  name: string
}

/** Un consommateur d'un endpoint : la note API + sa cible + sa page + les fonctionnalités couvertes. */
export interface ApiConsumer {
  noteId: string
  targetId: string // attachedTo (page ou bloc)
  targetName: string
  pageId: string | null
  pageName: string | null
  features: ApiFeatureRef[] // fonctionnalités réalisées par la cible ou sa page (realizedBy)
}

export interface ApiEndpointUsage {
  method: string
  path: string
  consumers: ApiConsumer[]
}

/** Un endpoint consommé, rattaché à une fonctionnalité (regroupement inverse pour le Catalogue). */
export interface ApiFeatureEndpoint {
  serviceId: string
  serviceName: string
  method: string
  path: string
}

export interface ApiServiceGroup {
  service: Service
  baseUrl: string
  /** endpoints réellement référencés par des notes API (avec leurs consommateurs). */
  endpoints: ApiEndpointUsage[]
  /** endpoints déclarés au registre mais jamais référencés par une note (hint). */
  unreferencedEndpoints: ServiceEndpoint[]
}

export interface ApiView {
  byService: ApiServiceGroup[] // services risk:high en tête
  /** endpoints consommés regroupés par fonctionnalité (via realizedBy). Base de la vue Catalogue. */
  byFeature: Map<string, ApiFeatureEndpoint[]>
}

/** Construit la vue API groupée par service. */
export function deriveApi(doc: ProjectDoc): ApiView {
  const index: NodeIndex = new Map(doc.nodes.map((n) => [n.id, n]))
  const apiNotes = doc.nodes.filter(isApiNote)
  const serviceNameById = new Map(doc.services.map((s) => [s.id, s.name]))

  /**
   * Fonctionnalités couvrant la cible d'une note API : celles réalisées par la cible elle-même,
   * plus (si la cible est un bloc) celles réalisées au niveau de sa page. Un endpoint posé sur un
   * bloc remonte ainsi aux fonctionnalités rattachées à la page qui le contient.
   */
  const featuresForTarget = (targetId: string): ApiFeatureRef[] => {
    const sources = [...featuresRealizedBy(targetId, doc.edges, index)]
    const target = index.get(targetId)
    if (target && isBlock(target) && target.parentId) {
      sources.push(...featuresRealizedBy(target.parentId, doc.edges, index))
    }
    const seen = new Map<string, ApiFeatureRef>()
    for (const f of sources) {
      if (!seen.has(f.id)) seen.set(f.id, { id: f.id, code: f.attrs.code, name: f.attrs.name })
    }
    return [...seen.values()]
  }

  const consumerOf = (note: ApiNote): ApiConsumer => {
    const target = index.get(note.attachedTo)
    const page = pageOf(note.attachedTo, index)
    const targetName = target && (isPage(target) || isBlock(target)) ? target.attrs.name : note.attachedTo
    return {
      noteId: note.id,
      targetId: note.attachedTo,
      targetName,
      pageId: page ? page.id : null,
      pageName: page ? page.attrs.name : null,
      features: featuresForTarget(note.attachedTo),
    }
  }

  // Notes API regroupées par service.
  const notesByService = new Map<string, ApiNote[]>()
  for (const note of apiNotes) {
    const list = notesByService.get(note.attrs.serviceId)
    if (list) list.push(note)
    else notesByService.set(note.attrs.serviceId, [note])
  }

  const byService: ApiServiceGroup[] = doc.services.map((service) => {
    const notes = notesByService.get(service.id) ?? []

    // Regroupe les notes par endpoint (méthode + chemin).
    const usageByEp = new Map<string, ApiEndpointUsage>()
    for (const note of notes) {
      const epId = endpointId(note.attrs.method, note.attrs.path)
      let usage = usageByEp.get(epId)
      if (!usage) {
        usage = { method: note.attrs.method, path: note.attrs.path, consumers: [] }
        usageByEp.set(epId, usage)
      }
      usage.consumers.push(consumerOf(note))
    }
    const endpoints = [...usageByEp.values()]

    const referenced = new Set(usageByEp.keys())
    const unreferencedEndpoints = service.endpoints.filter(
      (ep) => !referenced.has(endpointId(ep.method, ep.path)),
    )

    return { service, baseUrl: service.baseUrl, endpoints, unreferencedEndpoints }
  })

  // risk:high en tête, puis ordre alphabétique stable par nom.
  const riskRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  byService.sort(
    (a, b) =>
      (riskRank[a.service.risk] ?? 3) - (riskRank[b.service.risk] ?? 3) ||
      a.service.name.localeCompare(b.service.name),
  )

  // Regroupement inverse : pour chaque fonctionnalité, les endpoints consommés par les cibles
  // qui la réalisent (dédupliqués par service+méthode+chemin). Alimente la vue Catalogue.
  const byFeature = new Map<string, ApiFeatureEndpoint[]>()
  for (const note of apiNotes) {
    const features = featuresForTarget(note.attachedTo)
    if (!features.length) continue
    const entry: ApiFeatureEndpoint = {
      serviceId: note.attrs.serviceId,
      serviceName: serviceNameById.get(note.attrs.serviceId) ?? note.attrs.serviceId,
      method: note.attrs.method,
      path: note.attrs.path,
    }
    const key = `${entry.serviceId}|${endpointId(entry.method, entry.path)}`
    for (const f of features) {
      const list = byFeature.get(f.id)
      if (!list) byFeature.set(f.id, [entry])
      else if (!list.some((e) => `${e.serviceId}|${endpointId(e.method, e.path)}` === key))
        list.push(entry)
    }
  }

  return { byService, byFeature }
}

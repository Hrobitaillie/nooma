// Dérivation du cahier des specs (format v2, evolution-v2.md §4).
//   page → ses blocs (ordre vertical) → pour chaque bloc, ses notes rattachées
//   (comportements + appels API) + contraintes ; puis notes/contraintes propres à la page.
// Consommée telle quelle par SpecsView.vue ET l'export markdown (un seul dérivateur, deux rendus).
import type {
  ApiNote,
  BehaviorNote,
  BlockNode,
  BlockType,
  Facet,
  NodeIndex,
  PageNode,
  ProjectDoc,
  Service,
} from '@flooow/core/model/types'
import { isApiNote, isBehaviorNote, isBlock, isPage } from '@flooow/core/model/types'
import { spatialOrder, verticalOrder } from '@flooow/core/domain/ordering'
import { orphanPages } from '@flooow/core/domain/reachability'
import { completeness } from '@flooow/core/domain/completeness'
import { matchesFacet } from '@flooow/core/domain/facets'
import { resolveLot } from '@flooow/core/domain/lots'
import { coverage, featuresRealizedBy } from '@flooow/core/domain/realization'

/** Filtre optionnel : produit un cahier « front seulement » ou « lot 1 seulement ». */
export interface SpecsFilter {
  facet?: Facet
  lot?: number
}

export interface SpecsWarnings {
  /** ids des nœuds incomplets. */
  incomplete: string[]
  /** ids des pages orphelines (non reliées à la navigation). */
  orphans: string[]
  /** ids des fonctionnalités qu'aucune page/bloc ne réalise (couverture, pont realizedBy). */
  orphanFeatures: string[]
  /** ids des pages qui ne réalisent aucune fonctionnalité (ni page ni blocs). */
  uncoveredPages: string[]
}

/**
 * Un appel API résolu, prêt à afficher. Deux provenances depuis la v8, volontairement fondues ici :
 * une note `api` flottante du canvas, ou une connexion portée par le bloc (`BlockAttrs.apiRefs`).
 * Un lecteur de specs veut tous les appels du bloc, peu importe comment ils ont été saisis.
 */
export interface SpecsApiNote {
  /** Nœud à cibler au clic : la note API, ou le BLOC quand la connexion est portée par lui. */
  nodeId: string
  /** `true` = note flottante (a une existence propre, donc un contrôle de complétude). */
  fromNote: boolean
  serviceId: string
  serviceName: string
  method: string
  path: string
}

/** Référence légère d'une fonctionnalité réalisée par une page/un bloc (pont realizedBy). */
export interface SpecsFeatureRef {
  id: string
  code: string
  name: string
}

export interface SpecsBlock {
  block: BlockNode
  blockType: BlockType
  behaviors: BehaviorNote[] // notes comportement rattachées
  apis: SpecsApiNote[] // notes API rattachées + connexions portées par le bloc (v8)
  features: SpecsFeatureRef[] // fonctionnalités réalisées par ce bloc (realizedBy)
}

export interface SpecsPage {
  page: PageNode
  blocks: SpecsBlock[] // ordre vertical (pile)
  behaviors: BehaviorNote[] // notes comportement propres à la page
  apis: SpecsApiNote[] // notes API propres à la page
  features: SpecsFeatureRef[] // fonctionnalités réalisées directement par la page (realizedBy)
  constraints: string[]
}

export interface SpecsTransversal {
  context: string
  constraints: string[]
  services: Service[] // registre
  toc: { id: string; name: string }[] // sommaire, ordre spatial
}

export interface SpecsDocument {
  warnings: SpecsWarnings
  transversal: SpecsTransversal
  pages: SpecsPage[] // ordre spatial haut→bas / gauche→droite
}

/**
 * Construit la structure du cahier des specs. `filter` s'applique aux notes rattachées,
 * jamais aux frames (la structure page/blocs est conservée).
 */
export function deriveSpecs(doc: ProjectDoc, filter?: SpecsFilter): SpecsDocument {
  const index: NodeIndex = new Map(doc.nodes.map((n) => [n.id, n]))
  const serviceById = new Map(doc.services.map((s) => [s.id, s]))
  const facetFilter: Facet | null = filter?.facet ?? null
  const lotFilter = filter?.lot

  const lotOk = (id: string): boolean => lotFilter == null || resolveLot(id, index) === lotFilter

  /** Notes comportement rattachées à une cible, filtrées (facette + lot), triées verticalement. */
  function behaviorsOf(targetId: string): BehaviorNote[] {
    const notes = doc.nodes.filter(
      (n): n is BehaviorNote =>
        isBehaviorNote(n) &&
        n.attachedTo === targetId &&
        matchesFacet(n, facetFilter) &&
        lotOk(n.id),
    )
    return verticalOrder(notes)
  }

  /** Notes API rattachées à une cible, filtrées (facette + lot), résolues + triées. */
  function apisOf(targetId: string): SpecsApiNote[] {
    const notes = doc.nodes.filter(
      (n): n is ApiNote =>
        isApiNote(n) && n.attachedTo === targetId && matchesFacet(n, facetFilter) && lotOk(n.id),
    )
    return verticalOrder(notes).map((note) => {
      const svc = serviceById.get(note.attrs.serviceId)
      return {
        nodeId: note.id,
        fromNote: true,
        serviceId: note.attrs.serviceId,
        serviceName: svc ? svc.name : note.attrs.serviceId,
        method: note.attrs.method,
        path: note.attrs.path,
      }
    })
  }

  /**
   * Connexions API portées par le bloc lui-même (v8). Pas de filtrage par facette : un `apiRef` n'en
   * porte pas — il suit le sort du bloc, contrairement à la note qui a sa propre facette et son lot.
   */
  function apiRefsOf(block: BlockNode): SpecsApiNote[] {
    return block.attrs.apiRefs.map((ref) => {
      const svc = serviceById.get(ref.serviceId)
      return {
        nodeId: block.id,
        fromNote: false,
        serviceId: ref.serviceId,
        serviceName: svc ? svc.name : ref.serviceId,
        method: ref.method,
        path: ref.path,
      }
    })
  }

  /** Fonctionnalités réalisées par une cible (pont realizedBy), en références légères. */
  function featuresOf(targetId: string): SpecsFeatureRef[] {
    return featuresRealizedBy(targetId, doc.edges, index).map((f) => ({
      id: f.id,
      code: f.attrs.code,
      name: f.attrs.name,
    }))
  }

  const pagesOrdered = spatialOrder(doc.nodes.filter(isPage))

  const pages: SpecsPage[] = pagesOrdered.map((page) => {
    const blocksOrdered = verticalOrder(
      doc.nodes.filter((n): n is BlockNode => isBlock(n) && n.parentId === page.id),
    )
    const blocks: SpecsBlock[] = blocksOrdered.map((block) => ({
      block,
      blockType: block.attrs.blockType,
      behaviors: behaviorsOf(block.id),
      // Notes flottantes d'abord (elles portent un ordre spatial), puis les connexions du bloc.
      apis: [...apisOf(block.id), ...apiRefsOf(block)],
      features: featuresOf(block.id),
    }))
    return {
      page,
      blocks,
      behaviors: behaviorsOf(page.id),
      apis: apisOf(page.id),
      features: featuresOf(page.id),
      constraints: page.attrs.constraints,
    }
  })

  // Warnings calculés sur le document complet (photo du projet, indépendante du filtre).
  const incomplete = doc.nodes.filter((n) => !completeness(n).complete).map((n) => n.id)
  const orphans = [...orphanPages(doc)]
  const cov = coverage(doc)

  return {
    warnings: {
      incomplete,
      orphans,
      orphanFeatures: cov.orphanFeatures,
      uncoveredPages: cov.uncoveredPages,
    },
    transversal: {
      context: doc.site.attrs.context,
      constraints: doc.site.attrs.constraints,
      services: doc.services,
      toc: pagesOrdered.map((p) => ({ id: p.id, name: p.attrs.name })),
    },
    pages,
  }
}

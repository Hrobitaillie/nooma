// Fiches de lecture agent (pivot agentique — cadrage/06-pivot-agentique/plan.md §3.2) : projections
// markdown COMPACTES du ProjectDoc, pensées budget de tokens. Trois niveaux de zoom :
//   N0  projectSummary(doc)                    — sommaire complet, une ligne par entité ;
//   N1  entityCard(doc, poignée)               — fiche d'UN élément : métadonnées + toutes ses
//       interconnexions (entrantes ET sortantes, en ids courts actionnables), SANS contenu riche ;
//   N2  entityCard(doc, poignée, {content:true}) — la fiche + le contenu markdown.
// Le principe : chaque fiche est un point de NAVIGATION. Tout id court affiché se résout par
// resolveRef (refs.ts) — l'agent découvre le graphe de proche en proche et ne charge jamais plus
// que l'élément dont il a besoin, au lieu d'avaler le document entier.
import type {
  ApiNote,
  BehaviorNote,
  BlockNode,
  FeatureNode,
  FlooowNode,
  ModuleNode,
  NodeIndex,
  PageNode,
  ProjectDoc,
  Service,
} from '@flooow/core/model/types'
import {
  isApiNote,
  isBehaviorNote,
  isBlock,
  isFeature,
  isModule,
  isPage,
} from '@flooow/core/model/types'
import { docToMarkdown, isEmptyDoc, type RichDoc } from '@flooow/core/model/richContent'
import { spatialOrder, verticalOrder } from '@flooow/core/domain/ordering'
import { resolveLot } from '@flooow/core/domain/lots'
import { coverage, featuresOfPage, featuresRealizedBy } from '@flooow/core/domain/realization'
import { orphanPages } from '@flooow/core/domain/reachability'
import { attentionGroups } from '@flooow/core/domain/attention'
import { deriveCatalog, type CatalogFeature } from '@flooow/core/domain/derive/catalog'
import { attachedNotes, pageOf } from '@flooow/core/domain/rollup'
import { fullRouteOf } from '@flooow/core/domain/routes'
import { nodeLabel, resolveRef, shortId } from './refs'

export interface CardOptions {
  /** Inclure le contenu riche (markdown complet) — niveau N2. Défaut : false (fiche seule). */
  content?: boolean
}

// ── Helpers de formatage ──────────────────────────────────────────────────────

function joinLines(lines: (string | null)[]): string {
  return lines.filter((l): l is string => l != null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** `Nom (id-court)` — la forme canonique d'une référence dans une fiche. */
function handleOf(name: string, id: string): string {
  return `${name} (${shortId(id)})`
}

/** Taille d'un contenu riche, sans le contenu : « vide » ou « N ligne(s) ». */
function contentSize(content: RichDoc): string {
  if (isEmptyDoc(content)) return 'vide'
  const n = docToMarkdown(content).split('\n').length
  return `${n} ligne${n > 1 ? 's' : ''}`
}

/** Section « ### Contenu » d'une fiche : le markdown complet, ou l'indication de taille. */
function contentSection(content: RichDoc, wanted: boolean): string {
  if (isEmptyDoc(content)) return 'Contenu : vide'
  if (!wanted) return `Contenu : ${contentSize(content)} — repasser avec content pour le lire`
  return `### Contenu\n\n${docToMarkdown(content)}`
}

function buildIndex(doc: ProjectDoc): NodeIndex {
  return new Map(doc.nodes.map((n) => [n.id, n]))
}

function featureLine(f: CatalogFeature): string {
  const code = f.code ? `${f.code} · ` : ''
  const estimate = f.estimate.trim() || 'à estimer'
  const orphan = f.orphan ? ' · ⚠ non réalisée' : ''
  return `- ${code}${handleOf(f.name, f.id)} · lot ${f.lot} · ${estimate}${orphan}`
}

// ── N0 : sommaire du projet ──────────────────────────────────────────────────

/**
 * Le point d'entrée de toute session agent : l'inventaire complet du projet en une ligne par
 * entité, avec les poignées (ids courts) permettant de zoomer via entityCard. Jamais de contenu.
 */
export function projectSummary(doc: ProjectDoc): string {
  const index = buildIndex(doc)
  const pages = spatialOrder(doc.nodes.filter(isPage))
  const blocks = doc.nodes.filter(isBlock)
  const features = doc.nodes.filter(isFeature)
  const modules = doc.nodes.filter(isModule)
  const notes = doc.nodes.filter((n) => n.type === 'note')
  const lines: (string | null)[] = []

  lines.push(`# ${doc.meta.name} — sommaire du projet`, '')
  lines.push(
    `${pages.length} pages · ${blocks.length} blocs · ${modules.length} modules · ` +
      `${features.length} fonctionnalités · ${notes.length} notes canvas · ` +
      `${doc.services.length} services`,
    '',
  )

  const context = doc.site.attrs.context.trim()
  if (context) lines.push(`Contexte : ${context.split('\n')[0]}`, '')

  const attention = attentionGroups(doc)
  if (attention.length) {
    lines.push('Points d’attention :')
    for (const g of attention) lines.push(`- ${g.title} : ${g.points.length}`)
    lines.push('')
  }

  if (pages.length) {
    lines.push('## Pages (ordre de lecture du canvas)', '')
    for (const p of pages) {
      const nBlocks = doc.nodes.filter((n) => isBlock(n) && n.parentId === p.id).length
      const nNotes = attachedNotes(p.id, index).length
      const route = ` · ${fullRouteOf(p.id, index)}`
      const home = doc.meta.homePageId === p.id ? ' · accueil' : ''
      const parts = [
        `${nBlocks} bloc${nBlocks > 1 ? 's' : ''}`,
        nNotes ? `${nNotes} note${nNotes > 1 ? 's' : ''}` : null,
      ].filter(Boolean)
      lines.push(`- ${handleOf(p.attrs.name || 'Sans titre', p.id)}${route}${home} — ${parts.join(' · ')}`)
    }
    lines.push('')
  }

  const catalog = deriveCatalog(doc)
  if (catalog.groups.length) {
    lines.push('## Fonctionnalités (par module)', '')
    for (const g of catalog.groups) {
      lines.push(
        g.moduleId ? `### ${handleOf(g.moduleName, g.moduleId)}` : `### ${g.moduleName}`,
      )
      for (const f of g.features) lines.push(featureLine(f))
      lines.push('')
    }
  }

  if (doc.services.length) {
    lines.push('## Services externes', '')
    for (const s of doc.services) {
      const n = s.endpoints.length
      lines.push(
        `- ${handleOf(s.name, s.id)} · risque ${s.risk} · ${n} endpoint${n > 1 ? 's' : ''} déclaré${n > 1 ? 's' : ''}`,
      )
    }
    lines.push('')
  }

  return joinLines(lines)
}

// ── N1/N2 : fiche d'une entité ───────────────────────────────────────────────

/**
 * La fiche d'UN élément, résolu par poignée (id complet, préfixe ≥ 4, code de fonctionnalité).
 * Toujours une chaîne markdown — y compris pour une poignée ambiguë ou introuvable (le message
 * est destiné à l'agent, qui doit pouvoir enchaîner sans parser d'erreur).
 */
export function entityCard(doc: ProjectDoc, handle: string, opts: CardOptions = {}): string {
  const res = resolveRef(doc, handle)
  if (res.status === 'notFound')
    return `Aucune entité pour « ${handle} ». Chercher par nom avec findEntities, ou repartir du sommaire (projectSummary).`
  if (res.status === 'ambiguous') {
    return joinLines([
      `Poignée « ${handle} » ambiguë — préciser parmi :`,
      ...res.matches.map((m) => `- [${m.kind}] ${handleOf(m.name, m.id)}`),
    ])
  }

  const ref = res.ref
  if (ref.kind === 'service') {
    const service = doc.services.find((s) => s.id === ref.id)!
    return serviceCard(doc, service)
  }
  const node = doc.nodes.find((n) => n.id === ref.id)!
  if (isPage(node)) return pageCard(doc, node, opts)
  if (isBlock(node)) return blockCard(doc, node, opts)
  if (isModule(node)) return moduleCard(doc, node)
  if (isFeature(node)) return featureCard(doc, node, opts)
  return canvasNoteCard(doc, node as BehaviorNote | ApiNote)
}

function featureCard(doc: ProjectDoc, node: FeatureNode, opts: CardOptions): string {
  const index = buildIndex(doc)
  const card = deriveCatalog(doc)
    .groups.flatMap((g) => g.features)
    .find((f) => f.id === node.id)!
  const parent = node.parentId ? index.get(node.parentId) : undefined
  const moduleRef =
    parent && isModule(parent)
      ? `module : ${handleOf(parent.attrs.name || 'Sans titre', parent.id)}`
      : 'transverse (sans module)'
  const refList = (items: { name: string; id: string; code?: string }[]): string =>
    items.length
      ? items.map((r) => handleOf(r.code ? `${r.code} ${r.name}` : r.name, r.id)).join(', ')
      : '—'

  const lines: (string | null)[] = [
    `## Fonctionnalité ${card.code ? `${card.code} — ` : ''}${card.name}`,
    '',
    `id ${shortId(card.id)} · ${moduleRef} · lot ${card.lot} · estimation : ${card.estimate.trim() || 'à estimer'}`,
    ...card.fields.map((f) => `- ${f.label} : ${f.value ?? '—'}`),
    '',
    'Liens :',
    `- dépend de : ${refList(card.dependsOn)}`,
    `- débloque : ${refList(card.unlocks)}`,
    `- réalisée par : ${refList(card.realizers.map((r) => ({ name: `${r.kind === 'page' ? 'page' : 'bloc'} ${r.name}`, id: r.id })))}${card.orphan ? ' ⚠ orpheline' : ''}`,
    card.endpoints.length
      ? `- endpoints : ${card.endpoints.map((e) => `${e.method} ${e.path} (${e.serviceName})`).join(', ')}`
      : null,
    '',
    contentSection(card.content, opts.content ?? false),
  ]
  return joinLines(lines)
}

function pageCard(doc: ProjectDoc, page: PageNode, opts: CardOptions): string {
  const index = buildIndex(doc)
  const blocks = verticalOrder(
    doc.nodes.filter((n): n is BlockNode => isBlock(n) && n.parentId === page.id),
  )
  const notes = attachedNotes(page.id, index)
  const navIn = doc.edges.filter((e) => e.type === 'navigatesTo' && e.target === page.id)
  const navOut = doc.edges.filter((e) => e.type === 'navigatesTo' && e.source === page.id)
  const navRefs = (ids: string[]): string =>
    ids
      .map((id) => index.get(id))
      .filter((n): n is FlooowNode => n != null)
      .map((n) => handleOf(nodeLabel(n), n.id))
      .join(', ') || '—'
  const covered = featuresOfPage(page.id, doc.edges, index)
  const warnings: string[] = []
  if (orphanPages(doc).has(page.id)) warnings.push('⚠ page non reliée à la navigation')
  if (coverage(doc).uncoveredPages.includes(page.id))
    warnings.push('⚠ ne réalise aucune fonctionnalité')

  const a = page.attrs
  const lines: (string | null)[] = [
    `## Page — ${a.name || 'Sans titre'}`,
    '',
    `id ${shortId(page.id)} · route ${fullRouteOf(page.id, index)} · lot ${resolveLot(page.id, index)}` +
      `${doc.meta.homePageId === page.id ? ' · accueil' : ''}` +
      `${a.roles?.length ? ` · rôles : ${a.roles.join(', ')}` : ''}`,
    a.description.trim() ? `Description : ${a.description.trim()}` : null,
    a.constraints.length ? `Contraintes : ${a.constraints.join(' · ')}` : null,
    a.logic.trim() ? `Logique : ${a.logic.trim()}` : null,
    a.notes.trim() ? `Notes : ${a.notes.trim()}` : null,
    '',
    blocks.length ? `Blocs (${blocks.length}) :` : 'Blocs : aucun',
    ...blocks.map(
      (b) =>
        `- ${handleOf(b.attrs.name || 'Sans titre', b.id)} · ${b.attrs.blockType} · contenu ${contentSize(b.attrs.content)}` +
        `${b.attrs.apiRefs.length ? ` · ${b.attrs.apiRefs.length} connexion${b.attrs.apiRefs.length > 1 ? 's' : ''} API` : ''}`,
    ),
    notes.length ? '' : null,
    notes.length ? 'Notes rattachées :' : null,
    ...notes.map((n) =>
      isBehaviorNote(n)
        ? `- [comportement] ${handleOf(n.attrs.name || 'Sans titre', n.id)}${n.attrs.hours != null ? ` · ${n.attrs.hours}h` : ''}${n.attrs.facet ? ` · ${n.attrs.facet}` : ''}`
        : `- [api] ${handleOf(nodeLabel(n), n.id)}`,
    ),
    '',
    `Navigation : vient de ${navRefs(navIn.map((e) => e.source))} · mène à ${navRefs(navOut.map((e) => e.target))}`,
    `Fonctionnalités couvertes : ${
      covered.map((f) => handleOf(`${f.attrs.code} ${f.attrs.name}`.trim(), f.id)).join(', ') || '—'
    }`,
    warnings.length ? warnings.join(' · ') : null,
  ]

  if (opts.content && blocks.some((b) => !isEmptyDoc(b.attrs.content))) {
    lines.push('', '### Contenu des blocs')
    for (const b of blocks) {
      if (isEmptyDoc(b.attrs.content)) continue
      lines.push('', `#### ${b.attrs.name || 'Sans titre'} (${shortId(b.id)})`, '', docToMarkdown(b.attrs.content))
    }
  }
  return joinLines(lines)
}

function blockCard(doc: ProjectDoc, block: BlockNode, opts: CardOptions): string {
  const index = buildIndex(doc)
  const page = pageOf(block.id, index)
  const notes = attachedNotes(block.id, index)
  const serviceName = (id: string): string => doc.services.find((s) => s.id === id)?.name ?? id
  const realized = featuresRealizedBy(block.id, doc.edges, index)

  return joinLines([
    `## Bloc — ${block.attrs.name || 'Sans titre'}`,
    '',
    `id ${shortId(block.id)} · type ${block.attrs.blockType} · lot ${resolveLot(block.id, index)}` +
      `${page ? ` · page : ${handleOf(page.attrs.name || 'Sans titre', page.id)}` : ' · ⚠ hors page'}`,
    block.attrs.apiRefs.length
      ? `Connexions API : ${block.attrs.apiRefs.map((r) => `${r.method} ${r.path} (${serviceName(r.serviceId)})`).join(', ')}`
      : null,
    notes.length
      ? `Notes rattachées : ${notes.map((n) => `[${n.kind === 'behavior' ? 'comportement' : 'api'}] ${handleOf(nodeLabel(n), n.id)}`).join(', ')}`
      : null,
    realized.length
      ? `Réalise : ${realized.map((f) => handleOf(`${f.attrs.code} ${f.attrs.name}`.trim(), f.id)).join(', ')}`
      : null,
    '',
    contentSection(block.attrs.content, opts.content ?? false),
  ])
}

function moduleCard(doc: ProjectDoc, mod: ModuleNode): string {
  const index = buildIndex(doc)
  const group = deriveCatalog(doc).groups.find((g) => g.moduleId === mod.id)
  const features = group?.features ?? []
  return joinLines([
    `## Module — ${mod.attrs.name || 'Sans titre'}`,
    '',
    `id ${shortId(mod.id)} · lot ${resolveLot(mod.id, index)}`,
    mod.attrs.description.trim() ? `Description : ${mod.attrs.description.trim()}` : null,
    mod.attrs.notes.trim() ? `Notes : ${mod.attrs.notes.trim()}` : null,
    '',
    features.length ? `Fonctionnalités (${features.length}) :` : 'Fonctionnalités : aucune',
    ...features.map(featureLine),
  ])
}

function serviceCard(doc: ProjectDoc, service: Service): string {
  const usage = doc.nodes.filter(
    (n): n is ApiNote => isApiNote(n) && n.attrs.serviceId === service.id,
  )
  const index = buildIndex(doc)
  const consumers = usage.map((n) => {
    const page = pageOf(n.attachedTo, index)
    const target = index.get(n.attachedTo)
    const where = target ? nodeLabel(target) : n.attachedTo
    return `- ${n.attrs.method} ${n.attrs.path} ← ${handleOf(where, n.attachedTo)}${page && page.id !== n.attachedTo ? ` (page ${page.attrs.name})` : ''}`
  })
  const blockRefs = doc.nodes.filter(
    (n): n is BlockNode => isBlock(n) && n.attrs.apiRefs.some((r) => r.serviceId === service.id),
  )
  for (const b of blockRefs) {
    for (const r of b.attrs.apiRefs) {
      if (r.serviceId !== service.id) continue
      consumers.push(`- ${r.method} ${r.path} ← bloc ${handleOf(b.attrs.name || 'Sans titre', b.id)}`)
    }
  }
  return joinLines([
    `## Service — ${service.name}`,
    '',
    `id ${shortId(service.id)} · risque ${service.risk}` +
      `${service.baseUrl.trim() ? ` · base : ${service.baseUrl.trim()}` : ''}` +
      `${service.auth.trim() ? ` · auth : ${service.auth.trim()}` : ''}`,
    service.notes.trim() ? `Notes : ${service.notes.trim()}` : null,
    '',
    service.endpoints.length
      ? `Endpoints déclarés :\n${service.endpoints.map((e) => `- ${e.method} ${e.path}${e.notes.trim() ? ` — ${e.notes.trim()}` : ''}`).join('\n')}`
      : 'Endpoints déclarés : aucun',
    '',
    consumers.length ? `Consommé par :\n${consumers.join('\n')}` : 'Consommé par : personne',
  ])
}

function canvasNoteCard(doc: ProjectDoc, note: BehaviorNote | ApiNote): string {
  const index = buildIndex(doc)
  const target = index.get(note.attachedTo)
  const page = pageOf(note.attachedTo, index)
  const attach = `rattachée à ${target ? handleOf(nodeLabel(target), target.id) : note.attachedTo}` +
    `${page && page.id !== note.attachedTo ? ` (page ${page.attrs.name})` : ''}`
  if (isBehaviorNote(note)) {
    const a = note.attrs
    return joinLines([
      `## Comportement — ${a.name || 'Sans titre'}`,
      '',
      `id ${shortId(note.id)} · ${attach} · lot ${resolveLot(note.id, index)}` +
        `${a.facet ? ` · ${a.facet}` : ''}${a.hours != null ? ` · ${a.hours}h` : ' · à chiffrer'}`,
      a.description.trim() ? `Description : ${a.description.trim()}` : null,
      a.trigger.trim() ? `Déclencheur : ${a.trigger.trim()}` : null,
      a.rules.trim() ? `Règles : ${a.rules.trim()}` : null,
      a.notes.trim() ? `Notes : ${a.notes.trim()}` : null,
    ])
  }
  const a = note.attrs
  const service = doc.services.find((s) => s.id === a.serviceId)
  return joinLines([
    `## Note API — ${a.method} ${a.path}`.trim(),
    '',
    `id ${shortId(note.id)} · ${attach}` +
      `${service ? ` · service : ${handleOf(service.name, service.id)}` : ` · ⚠ service inconnu (${a.serviceId})`}` +
      `${a.facet ? ` · ${a.facet}` : ''}`,
    a.notes.trim() ? `Notes : ${a.notes.trim()}` : null,
  ])
}

// Réexport pour que la couche appelante (CLI, ops serveur) n'ait qu'un point d'entrée.
export { findEntities, resolveRef, shortId, type EntityRef } from './refs'

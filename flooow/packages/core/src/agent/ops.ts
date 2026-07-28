// Vocabulaire d'opérations agent (pivot agentique — plan §3.1/3.2) : la SEULE façon pour un agent
// de modifier un projet. Chaque op est nommée, granulaire, résolue par poignées (refs.ts), et le
// lot entier est ATOMIQUE : applyOps travaille sur une copie, valide à la fin (zod strict +
// invariants), et jette AgentOpError à la moindre erreur — le document d'origine n'est jamais
// touché. L'agent ne manipule JAMAIS de positions : tout créé est auto-placé (l'humain réarrange
// au canvas), conformément à la décision « la géométrie reste un artefact humain ».
//
// Chaînage intra-lot : les ops de création acceptent un `id` optionnel (toute chaîne non vide,
// l'unicité est vérifiée par invariant) — un op suivant du même lot peut alors référencer
// l'entité par cette poignée. Sans `id`, un UUID est généré et rendu dans le rapport.
import type {
  BlockType,
  Comment,
  EdgeType,
  Facet,
  FlooowNode,
  Position,
  ProjectDoc,
  Risk,
} from '@flooow/core/model/types'
import { isBlock, isFeature, isModule, isPage } from '@flooow/core/model/types'
import {
  BLOCK_STEP,
  FEATURE_STEP,
  MODULE_COL_STEP,
  createBlock,
  createComment,
  createCommentReply,
  createEdge,
  createFeature,
  createModule,
  createPage,
  createService,
  genId,
} from '@flooow/core/model/factory'
import { markdownToDoc } from '@flooow/core/model/markdown'
import {
  docToPlainText,
  mergeApiNoteFields,
  mergeBehaviorNoteFields,
} from '@flooow/core/model/richContent'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { checkInvariants } from '@flooow/core/domain/invariants'
import { resolveRef, shortId } from './refs'

// Grille de placement des pages créées par l'agent : compacte, en rangées de 3 (le canvas rend
// les pages en autolayout vertical — leur hauteur est dynamique, on l'ESTIME pour poser la rangée
// suivante sous la plus haute de la rangée courante). L'humain réarrange librement ensuite.
const PAGE_GRID_COLS = 3
const PAGE_GRID_X_STEP = 340 // largeur de page (300) + gouttière
const PAGE_GRID_ROW_GAP = 60

/** Tags des ops de compat note → commentaire (mêmes couleurs que la migration v12→v13). */
const TAG_BEHAVIOR = { label: 'Comportement', color: '#f59e0b' }
const TAG_API = { label: 'API', color: '#0891b2' }
/** Auteur par défaut des commentaires écrits par un agent. */
const AGENT_AUTHOR = 'Claude'

// ── Le vocabulaire ────────────────────────────────────────────────────────────

export type AgentOp =
  | { op: 'create-page'; id?: string; name: string; parent?: string; slug?: string; roles?: string[]; description?: string; constraints?: string[]; logic?: string; notes?: string; lot?: number | null }
  | { op: 'create-block'; id?: string; page: string; name: string; blockType?: BlockType; content?: string; lot?: number | null }
  | { op: 'create-module'; id?: string; name: string; description?: string; notes?: string; lot?: number | null }
  | { op: 'create-feature'; id?: string; module?: string; code?: string; name: string; estimate?: string; content?: string; lot?: number | null }
  | { op: 'create-service'; id?: string; name: string; baseUrl?: string; auth?: string; risk?: Risk; notes?: string; endpoints?: { method: string; path: string; notes?: string }[] }
  // Compat v12 (notes disparues en v13) : `create-behavior` produit désormais un COMMENTAIRE tag
  // « Comportement » ; `create-api-note` une connexion inline (ou un commentaire tag « API » si la
  // cible page n'a aucun bloc). Mêmes conversions que la migration v12→v13.
  | { op: 'create-behavior'; id?: string; target: string; name: string; description?: string; facet?: Facet | null; trigger?: string; rules?: string; hours?: number | null; notes?: string }
  | { op: 'create-api-note'; id?: string; target: string; service: string; method: string; path: string; facet?: Facet | null; notes?: string }
  | { op: 'add-api-ref'; block: string; service: string; method: string; path: string }
  | { op: 'remove-api-ref'; block: string; method: string; path: string }
  // Commentaires (v13) : fils ancrés page/bloc, lisibles dans le panneau de l'app.
  | { op: 'create-comment'; id?: string; target: string; markdown: string; tag?: { label: string; color: string }; forClaude?: boolean; author?: string }
  | { op: 'reply-comment'; comment: string; markdown: string; author?: string }
  | { op: 'resolve-comment'; comment: string; resolved?: boolean }
  | { op: 'update'; target: string; set: Record<string, unknown> }
  | { op: 'set-content'; target: string; markdown: string }
  | { op: 'set-field'; feature: string; field: string; option: string | null }
  | { op: 'set-site'; context?: string; constraints?: string[]; notes?: string }
  | { op: 'set-home'; page: string }
  | { op: 'link'; type: EdgeType; source: string; target: string; notes?: string }
  | { op: 'unlink'; type: EdgeType; source: string; target: string }
  | { op: 'delete'; target: string }

export interface ApplyResult {
  doc: ProjectDoc
  /** Une ligne par op appliqué, avec les ids créés — c'est la réponse rendue à l'agent. */
  report: string[]
}

/** Erreur d'application : `index` = position de l'op fautif dans le lot (-1 = validation finale). */
export class AgentOpError extends Error {
  constructor(
    public index: number,
    message: string,
  ) {
    super(index >= 0 ? `ops[${index}] — ${message}` : message)
    this.name = 'AgentOpError'
  }
}

// ── Champs autorisés par `update` (tout le reste a un op dédié ou est interdit) ─

const UPDATABLE: Record<string, Set<string>> = {
  page: new Set(['name', 'slug', 'roles', 'description', 'constraints', 'logic', 'notes', 'lot']),
  block: new Set(['name', 'blockType', 'lot']),
  module: new Set(['name', 'description', 'notes', 'lot']),
  feature: new Set(['name', 'code', 'estimate', 'lot']),
  service: new Set(['name', 'baseUrl', 'auth', 'risk', 'notes', 'endpoints']),
}

// ── Placement automatique ─────────────────────────────────────────────────────

function below<T extends { position: Position }>(siblings: T[], step: number, x = 16): Position {
  if (!siblings.length) return { x, y: 0 }
  const maxY = Math.max(...siblings.map((s) => s.position.y))
  return { x: siblings[0]!.position.x, y: maxY + step }
}

/**
 * Hauteur ESTIMÉE d'une page (miroir de l'autolayout canvas : estimateBlockCard côté app).
 * Compte le REPLI de ligne (~38 caractères par ligne rendue à 276px/11px) — un simple
 * `split('\n').length` sous-estime les paragraphes longs et fait se chevaucher les rangées.
 * L'estimation reste un plancher (la mesure DOM peut dépasser), d'où la marge de 15 %.
 */
const PAGE_BLOCK_CHARS_PER_LINE = 38
function estimatePageHeight(doc: ProjectDoc, pageId: string): number {
  const blocks = doc.nodes.filter(isBlock).filter((b) => b.parentId === pageId)
  let h = 58 // en-tête + marge (CONTENT_TOP canvas)
  for (const b of blocks) {
    const text = docToPlainText(b.attrs.content).trim()
    const lines = text
      ? text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / PAGE_BLOCK_CHARS_PER_LINE)), 0)
      : 0
    let bh = 16 + 24 // pad haut + titre
    if (lines) bh += 12 + lines * 15
    if (b.attrs.apiRefs.length) bh += 12 + b.attrs.apiRefs.length * 24
    bh += 16 // pad bas
    h += Math.max(bh, 88) + 16 // + interstice entre blocs
  }
  return Math.max(Math.round((h + 12) * 1.15), 180)
}

/** Prochaine position de page : grille compacte — complète la rangée du bas, sinon rangée neuve. */
function nextPagePosition(doc: ProjectDoc): Position {
  const pages = doc.nodes.filter(isPage)
  if (!pages.length) return { x: 0, y: 0 }
  const maxY = Math.max(...pages.map((p) => p.position.y))
  const row = pages.filter((p) => Math.abs(p.position.y - maxY) < 1)
  if (row.length < PAGE_GRID_COLS)
    return { x: Math.max(...row.map((p) => p.position.x)) + PAGE_GRID_X_STEP, y: maxY }
  const rowH = Math.max(...row.map((p) => estimatePageHeight(doc, p.id)))
  return { x: Math.min(...row.map((p) => p.position.x)), y: maxY + rowH + PAGE_GRID_ROW_GAP }
}

// ── Application ───────────────────────────────────────────────────────────────

/**
 * Applique un lot d'ops sur une copie du document. Atomique : jette AgentOpError à la première
 * erreur (résolution, sémantique, ou validation finale zod + invariants) — rien n'est appliqué
 * à moitié. Renvoie le document validé et un rapport lisible (une ligne par op).
 */
export function applyOps(input: ProjectDoc, ops: AgentOp[]): ApplyResult {
  if (!Array.isArray(ops) || ops.length === 0) throw new AgentOpError(-1, 'Lot d’ops vide.')
  const doc: ProjectDoc = structuredClone(input)
  const report: string[] = []

  ops.forEach((op, i) => {
    const fail = (message: string): never => {
      throw new AgentOpError(i, message)
    }

    /** Résout une poignée vers un nœud du canvas (avec message d'erreur uniforme). */
    const node = (handle: string, label = 'cible'): FlooowNode => {
      const res = resolveRef(doc, handle)
      if (res.status === 'notFound') return fail(`${label} introuvable : « ${handle} ».`)
      if (res.status === 'ambiguous')
        return fail(
          `${label} ambiguë : « ${handle} » → ${res.matches.map((m) => `${m.name} (${shortId(m.id)})`).join(', ')}.`,
        )
      const found = doc.nodes.find((n) => n.id === res.ref.id)
      if (!found) return fail(`« ${handle} » n'est pas un élément du canvas (${res.ref.kind}).`)
      return found
    }

    /** Résout une poignée de COMMENTAIRE : id complet ou préfixe ≥ 4 (les fils ne sont pas dans
     *  le registre de refs — ils ne sont ni nœuds ni services). */
    const findComment = (handle: string): Comment => {
      const h = (handle ?? '').trim()
      if (h.length < 4) return fail(`poignée de commentaire trop courte : « ${handle} » (≥ 4 caractères).`)
      const matches = doc.comments.filter((c) => c.id === h || c.id.startsWith(h))
      if (matches.length === 0) return fail(`commentaire introuvable : « ${handle} ».`)
      if (matches.length > 1)
        return fail(`poignée de commentaire ambiguë : « ${handle} » → ${matches.map((c) => shortId(c.id)).join(', ')}.`)
      return matches[0] as Comment
    }

    const requireName = (name: unknown): string => {
      if (typeof name !== 'string' || !name.trim()) return fail('nom requis (chaîne non vide).')
      return name.trim()
    }

    const freshId = (wanted: string | undefined): string => {
      if (wanted === undefined) return genId()
      if (!wanted.trim()) return fail('id fourni vide.')
      if (resolveRef(doc, wanted).status === 'found') return fail(`id déjà pris : « ${wanted} ».`)
      return wanted
    }

    const added = (kind: string, name: string, id: string): void => {
      report.push(`+ ${kind} « ${name} » (${shortId(id)})`)
    }

    switch (op.op) {
      case 'create-page': {
        const name = requireName(op.name)
        // v12 : une page peut naître SOUS une autre. Le slug par défaut vient du nom (createPage),
        // et la route absolue se recompose à la lecture — l'agent n'a donc jamais à composer
        // « /parent/enfant » lui-même, ce qui était la principale source de routes incohérentes.
        let parentId: string | null = null
        if (op.parent !== undefined) {
          const parent = node(op.parent, 'page')
          if (!isPage(parent)) fail(`« ${op.parent} » n'est pas une page.`)
          parentId = parent.id
        }
        const page = createPage({
          id: freshId(op.id),
          name,
          parentId,
          slug: op.slug,
          position: nextPagePosition(doc),
          lot: op.lot ?? null,
          attrs: {
            name,
            roles: op.roles ?? [],
            description: op.description ?? '',
            constraints: op.constraints ?? [],
            logic: op.logic ?? '',
            notes: op.notes ?? '',
          },
        })
        doc.nodes.push(page)
        added('page', name, page.id)
        break
      }
      case 'create-block': {
        const name = requireName(op.name)
        const parent = node(op.page, 'page')
        if (!isPage(parent)) fail(`« ${op.page} » n'est pas une page.`)
        const siblings = doc.nodes.filter((n) => isBlock(n) && n.parentId === parent.id)
        const block = createBlock({
          id: freshId(op.id),
          name,
          parentId: parent.id,
          blockType: op.blockType,
          position: below(siblings, BLOCK_STEP),
          lot: op.lot ?? null,
          attrs: {
            name,
            blockType: op.blockType ?? 'free',
            content: markdownToDoc(op.content ?? ''),
            apiRefs: [],
            order: [],
          },
        })
        doc.nodes.push(block)
        added('bloc', name, block.id)
        break
      }
      case 'create-module': {
        const name = requireName(op.name)
        const modules = doc.nodes.filter(isModule)
        const x = modules.length ? Math.max(...modules.map((m) => m.position.x)) + MODULE_COL_STEP : 0
        const y = modules.length ? Math.min(...modules.map((m) => m.position.y)) : 0
        const mod = createModule({
          id: freshId(op.id),
          name,
          position: { x, y },
          lot: op.lot ?? null,
          attrs: { name, description: op.description ?? '', notes: op.notes ?? '' },
        })
        doc.nodes.push(mod)
        added('module', name, mod.id)
        break
      }
      case 'create-feature': {
        const name = requireName(op.name)
        let parentId: string | null = null
        if (op.module !== undefined) {
          const mod = node(op.module, 'module')
          if (!isModule(mod)) fail(`« ${op.module} » n'est pas un module.`)
          parentId = mod.id
        }
        const siblings = doc.nodes.filter((n) => isFeature(n) && n.parentId === parentId)
        const feature = createFeature({
          id: freshId(op.id),
          name,
          code: op.code ?? '',
          parentId,
          position: below(siblings, FEATURE_STEP),
          lot: op.lot ?? null,
          attrs: {
            code: op.code ?? '',
            name,
            content: markdownToDoc(op.content ?? ''),
            fieldValues: {},
            estimate: op.estimate ?? '',
          },
        })
        doc.nodes.push(feature)
        added(`fonctionnalité${op.code ? ` ${op.code}` : ''}`, name, feature.id)
        break
      }
      case 'create-service': {
        const name = requireName(op.name)
        const service = createService({
          id: freshId(op.id),
          name,
          baseUrl: op.baseUrl,
          auth: op.auth,
          risk: op.risk,
          notes: op.notes,
          endpoints: (op.endpoints ?? []).map((e) => ({ method: e.method, path: e.path, notes: e.notes ?? '' })),
        })
        doc.services.push(service)
        added('service', name, service.id)
        break
      }
      case 'create-behavior': {
        // Compat v12 : le « comportement » est un COMMENTAIRE depuis la v13 — même recomposition
        // que la migration (nom en tête, sections déclencheur/règles, heures fondues).
        const name = requireName(op.name)
        const target = node(op.target)
        if (!isPage(target) && !isBlock(target)) fail('un commentaire s’ancre sur une page ou un bloc.')
        const comment = createComment({
          id: freshId(op.id),
          anchor: { nodeId: target.id },
          tag: TAG_BEHAVIOR,
          body: mergeBehaviorNoteFields({
            name,
            description: op.description,
            facet: op.facet,
            trigger: op.trigger,
            rules: op.rules,
            hours: op.hours,
            notes: op.notes,
          }),
          author: AGENT_AUTHOR,
        })
        doc.comments.push(comment)
        added('commentaire comportement', name, comment.id)
        break
      }
      case 'create-api-note': {
        // Compat v12 : la connexion API vit INLINE dans le bloc depuis la v13. Cible bloc → le
        // bloc ; cible page → son premier bloc ; page sans bloc → commentaire tag « API » (repli
        // de la migration, rien ne se perd).
        const target = node(op.target)
        if (!isPage(target) && !isBlock(target)) fail('la cible doit être une page ou un bloc.')
        const res = resolveRef(doc, op.service)
        if (res.status !== 'found' || !doc.services.some((s) => s.id === res.ref.id))
          return fail(`service introuvable : « ${op.service} ».`)
        const block = isBlock(target)
          ? target
          : doc.nodes
              .filter(isBlock)
              .filter((b) => b.parentId === target.id)
              .sort((a, b) => a.position.y - b.position.y || (a.id < b.id ? -1 : 1))[0]
        if (block) {
          const apiRef = {
            id: freshId(op.id),
            serviceId: res.ref.id,
            method: op.method,
            path: op.path,
            ...(op.facet != null ? { facet: op.facet } : {}),
            ...(op.notes?.trim() ? { notes: op.notes } : {}),
          }
          block.attrs.apiRefs.push(apiRef)
          block.attrs.order.push(apiRef.id)
          report.push(`+ connexion ${op.method} ${op.path} sur bloc ${block.attrs.name} (${shortId(block.id)})`)
        } else {
          const serviceName = doc.services.find((s) => s.id === res.ref.id)?.name ?? ''
          const comment = createComment({
            id: freshId(op.id),
            anchor: { nodeId: target.id },
            tag: TAG_API,
            body: mergeApiNoteFields({
              method: op.method,
              path: op.path,
              serviceName,
              facet: op.facet,
              notes: op.notes,
            }),
            author: AGENT_AUTHOR,
          })
          doc.comments.push(comment)
          added('commentaire API', `${op.method} ${op.path}`, comment.id)
        }
        break
      }
      case 'create-comment': {
        const target = node(op.target)
        if (!isPage(target) && !isBlock(target)) fail('un commentaire s’ancre sur une page ou un bloc.')
        if (typeof op.markdown !== 'string' || !op.markdown.trim()) fail('markdown requis (corps du fil).')
        if (op.tag && (!op.tag.label?.trim() || !op.tag.color?.trim())) fail('tag invalide : { label, color } requis.')
        const comment = createComment({
          id: freshId(op.id),
          anchor: { nodeId: target.id },
          body: markdownToDoc(op.markdown),
          tag: op.tag,
          forClaude: op.forClaude,
          author: op.author?.trim() || AGENT_AUTHOR,
        })
        doc.comments.push(comment)
        added(`commentaire${comment.forClaude ? ' ✳' : ''}`, docToPlainText(comment.body).slice(0, 40), comment.id)
        break
      }
      case 'reply-comment': {
        const comment = findComment(op.comment)
        if (typeof op.markdown !== 'string' || !op.markdown.trim()) fail('markdown requis (corps de la réponse).')
        const reply = createCommentReply({
          body: markdownToDoc(op.markdown),
          author: op.author?.trim() || AGENT_AUTHOR,
        })
        comment.replies.push(reply)
        report.push(`+ réponse sur ${shortId(comment.id)} (${reply.author})`)
        break
      }
      case 'resolve-comment': {
        const comment = findComment(op.comment)
        comment.resolved = op.resolved ?? true
        report.push(`${comment.resolved ? '✓ résolu' : '↺ rouvert'} : commentaire ${shortId(comment.id)}`)
        break
      }
      case 'add-api-ref': {
        // La connexion API d'un BLOC est un attribut du bloc (v8, rendue dans sa carte) — c'est la
        // forme à préférer ; la note API ne sert qu'au niveau page ou en carte flottante.
        const block = node(op.block, 'bloc')
        if (!isBlock(block)) return fail(`« ${op.block} » n'est pas un bloc.`)
        const res = resolveRef(doc, op.service)
        if (res.status !== 'found' || !doc.services.some((s) => s.id === res.ref.id))
          return fail(`service introuvable : « ${op.service} ».`)
        const exists = block.attrs.apiRefs.some(
          (r) => r.serviceId === res.ref.id && r.method === op.method && r.path === op.path,
        )
        if (exists) {
          report.push(`= connexion ${op.method} ${op.path} déjà sur ${block.attrs.name}`)
          break
        }
        // `order` suit l'ajout : une connexion posée par un agent doit se ranger là où l'utilisateur
        // la verrait apparaître (en fin de liste), pas dépendre du repli « clé inconnue → à la fin ».
        const apiRef = { id: genId(), serviceId: res.ref.id, method: op.method, path: op.path }
        block.attrs.apiRefs.push(apiRef)
        block.attrs.order.push(apiRef.id)
        report.push(`+ connexion ${op.method} ${op.path} sur bloc ${block.attrs.name} (${shortId(block.id)})`)
        break
      }
      case 'remove-api-ref': {
        const block = node(op.block, 'bloc')
        if (!isBlock(block)) return fail(`« ${op.block} » n'est pas un bloc.`)
        const before = block.attrs.apiRefs.length
        block.attrs.apiRefs = block.attrs.apiRefs.filter(
          (r) => !(r.method === op.method && r.path === op.path),
        )
        if (block.attrs.apiRefs.length === before)
          return fail(`aucune connexion ${op.method} ${op.path} sur ce bloc.`)
        report.push(`- connexion ${op.method} ${op.path} du bloc ${block.attrs.name}`)
        break
      }
      case 'update': {
        const res = resolveRef(doc, op.target)
        if (res.status === 'notFound') fail(`cible introuvable : « ${op.target} ».`)
        if (res.status === 'ambiguous') fail(`cible ambiguë : « ${op.target} ».`)
        const ref = res.status === 'found' ? res.ref : null
        if (!ref) break
        if (typeof op.set !== 'object' || op.set === null || Array.isArray(op.set))
          fail('`set` doit être un objet { champ: valeur }.')

        const applySet = (kindKey: string, apply: (key: string, value: unknown) => void): void => {
          const allowed = UPDATABLE[kindKey]!
          for (const [key, value] of Object.entries(op.set)) {
            if (!allowed.has(key))
              fail(`champ « ${key} » non modifiable sur ${kindKey} (autorisés : ${[...allowed].join(', ')}).`)
            apply(key, value)
          }
        }

        if (ref.kind === 'service') {
          const service = doc.services.find((s) => s.id === ref.id)!
          applySet('service', (key, value) => {
            ;(service as unknown as Record<string, unknown>)[key] = value
          })
        } else {
          const target = doc.nodes.find((n) => n.id === ref.id)!
          const kindKey = target.type === 'feature' ? 'feature' : (target as { kind: string }).kind
          applySet(kindKey, (key, value) => {
            if (key === 'lot') target.lot = value as number | null
            else (target.attrs as unknown as Record<string, unknown>)[key] = value
          })
        }
        report.push(`~ ${ref.name} (${shortId(ref.id)}) : ${Object.keys(op.set).join(', ')}`)
        break
      }
      case 'set-content': {
        const res = resolveRef(doc, op.target)
        if (res.status !== 'found') return fail(`cible introuvable ou ambiguë : « ${op.target} ».`)
        const ref = res.ref
        const content = markdownToDoc(op.markdown ?? '')
        const target = doc.nodes.find((n) => n.id === ref.id)
        if (!target || (!isBlock(target) && !isFeature(target)))
          return fail('set-content ne s’applique qu’à un bloc ou une fonctionnalité.')
        target.attrs.content = content
        report.push(`✎ contenu de ${ref.name} (${shortId(ref.id)})`)
        break
      }
      case 'set-field': {
        const feature = node(op.feature, 'fonctionnalité')
        if (!isFeature(feature)) return fail(`« ${op.feature} » n'est pas une fonctionnalité.`)
        const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        const field = doc.featureFields.find(
          (f) => f.id === op.field || fold(f.label) === fold(op.field),
        )
        if (!field)
          return fail(
            `champ de projet introuvable : « ${op.field} » (existants : ${doc.featureFields.map((f) => `${f.id} « ${f.label} »`).join(', ')}).`,
          )
        if (op.option === null) {
          feature.attrs.fieldValues[field.id] = null
          report.push(`~ ${feature.attrs.name} : ${field.label} = aucune`)
          break
        }
        let option = doc.featureOptions.find(
          (o) => o.fieldId === field.id && fold(o.name) === fold(op.option as string),
        )
        if (!option) {
          option = { id: genId(), fieldId: field.id, name: op.option }
          doc.featureOptions.push(option)
        }
        feature.attrs.fieldValues[field.id] = option.id
        report.push(`~ ${feature.attrs.name} : ${field.label} = ${option.name}`)
        break
      }
      case 'set-site': {
        if (op.context !== undefined) doc.site.attrs.context = op.context
        if (op.constraints !== undefined) doc.site.attrs.constraints = op.constraints
        if (op.notes !== undefined) doc.site.attrs.notes = op.notes
        report.push('~ site (contexte transversal)')
        break
      }
      case 'set-home': {
        const page = node(op.page, 'page')
        if (!isPage(page)) return fail(`« ${op.page} » n'est pas une page.`)
        doc.meta.homePageId = page.id
        report.push(`~ page d'accueil : ${page.attrs.name} (${shortId(page.id)})`)
        break
      }
      case 'link': {
        const source = node(op.source, 'source')
        const target = node(op.target, 'cible')
        if (op.type === 'navigatesTo' && (!isPage(source) || !isPage(target)))
          fail('navigatesTo relie deux pages.')
        if (op.type === 'dependsOn' && (!isFeature(source) || !isFeature(target)))
          fail('dependsOn relie deux fonctionnalités (source dépend de cible).')
        if (op.type === 'realizedBy' && (!isFeature(source) || (!isPage(target) && !isBlock(target))))
          fail('realizedBy relie une fonctionnalité (source) à une page ou un bloc (cible).')
        const existing = doc.edges.find(
          (e) => e.type === op.type && e.source === source.id && e.target === target.id,
        )
        if (existing) {
          report.push(`= lien ${op.type} déjà présent (${shortId(source.id)} → ${shortId(target.id)})`)
          break
        }
        doc.edges.push(
          createEdge({ type: op.type, source: source.id, target: target.id, attrs: op.notes ? { notes: op.notes } : {} }),
        )
        report.push(`+ lien ${op.type} : ${shortId(source.id)} → ${shortId(target.id)}`)
        break
      }
      case 'unlink': {
        const source = node(op.source, 'source')
        const target = node(op.target, 'cible')
        const before = doc.edges.length
        doc.edges = doc.edges.filter(
          (e) => !(e.type === op.type && e.source === source.id && e.target === target.id),
        )
        if (doc.edges.length === before) fail(`aucun lien ${op.type} entre ces deux éléments.`)
        report.push(`- lien ${op.type} : ${shortId(source.id)} → ${shortId(target.id)}`)
        break
      }
      case 'delete': {
        const res = resolveRef(doc, op.target)
        if (res.status !== 'found') return fail(`cible introuvable ou ambiguë : « ${op.target} ».`)
        const ref = res.ref

        if (ref.kind === 'service') {
          const used = doc.nodes.some(
            (n) => isBlock(n) && n.attrs.apiRefs.some((r) => r.serviceId === ref.id),
          )
          if (used) fail(`service « ${ref.name} » encore référencé (connexions de bloc).`)
          doc.services = doc.services.filter((s) => s.id !== ref.id)
          report.push(`- service ${ref.name} (${shortId(ref.id)})`)
          break
        }
        const target = doc.nodes.find((n) => n.id === ref.id)!
        if (isModule(target) && doc.nodes.some((n) => isFeature(n) && n.parentId === target.id))
          fail(`le module « ${ref.name} » contient des fonctionnalités : les supprimer ou les déplacer d'abord.`)

        const doomed = new Set<string>([target.id])
        if (isPage(target)) {
          for (const n of doc.nodes) if (isBlock(n) && n.parentId === target.id) doomed.add(n.id)
        }

        doc.nodes = doc.nodes.filter((n) => !doomed.has(n.id))
        doc.edges = doc.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target))
        // Les commentaires ancrés sur un élément condamné partent avec lui (même cascade que l'app).
        doc.comments = doc.comments.filter((c) => !doomed.has(c.anchor.nodeId))
        if (doc.meta.homePageId && doomed.has(doc.meta.homePageId)) doc.meta.homePageId = null
        report.push(`- ${ref.name} (${shortId(ref.id)})${doomed.size > 1 ? ` +${doomed.size - 1} élément(s) liés` : ''}`)
        break
      }
      default:
        fail(`op inconnu : « ${(op as { op?: unknown }).op} ».`)
    }
  })

  // Validation finale : zod strict + invariants. Tout échec annule le lot entier.
  let validated: ProjectDoc
  try {
    validated = parseProjectDoc(doc)
  } catch (err) {
    throw new AgentOpError(-1, `document invalide après application : ${err instanceof Error ? err.message : String(err)}`)
  }
  const violations = checkInvariants(validated)
  if (violations.length)
    throw new AgentOpError(-1, `invariants violés : ${violations.map((v) => `${v.code} (${v.message})`).join(' ; ')}`)

  validated.meta.updatedAt = new Date().toISOString().slice(0, 10)
  return { doc: validated, report }
}

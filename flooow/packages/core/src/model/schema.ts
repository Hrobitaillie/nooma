// Validation zod — miroir STRICT des types de types.ts (format v2).
// `.strict()` partout : une clé inconnue = rejet (fichier d'une version future ou altéré).
// Discrimination : `type` (frame|note) puis `kind` (page|block / behavior|api) ; services validés.
import { z } from 'zod'
import type { ProjectDoc } from './types'
import { FEATURE_STATUSES } from './types'

// Limites de sécurité (securite.md) : chaînes ≤ 50 000 caractères, nodes ≤ 5 000.
export const MAX_STRING = 50_000
export const MAX_NODES = 5_000

const str = () => z.string().max(MAX_STRING)

const positionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict()

/**
 * Document riche (ProseMirror/Tiptap) : objet `{ type, content? }`, contenu détaillé libre.
 * Déclaré ICI et non près de la fonctionnalité : le bloc s'en sert aussi (v8) et il est défini plus
 * haut dans le fichier — un `const` n'étant pas hoisté, l'ordre de déclaration est contraignant.
 */
const richDocSchema = z.object({ type: z.string() }).passthrough()

export const facetSchema = z.enum(['front', 'back', 'fullstack'])
export const riskSchema = z.enum(['low', 'medium', 'high'])
export const frameKindSchema = z.enum(['page', 'block', 'module'])
export const noteKindSchema = z.enum(['behavior', 'api'])
export const blockTypeSchema = z.enum([
  'hero',
  'cta',
  'grid',
  'damier',
  'menu',
  'footer',
  'feature',
  'free',
])
export const edgeTypeSchema = z.enum(['navigatesTo', 'dependsOn', 'realizedBy'])
export const edgeRenderSchema = z.enum(['line', 'portal'])

const baseNodeShape = {
  id: str().min(1),
  parentId: str().nullable(),
  position: positionSchema,
  lot: z.number().int().nullable().optional(),
}

// ── Frames ───────────────────────────────────────────────────────────────────

const pageAttrsSchema = z
  .object({
    name: str(),
    slug: str(),
    roles: z.array(str()).optional(),
    description: str(),
    constraints: z.array(str()),
    logic: str(),
    notes: str(),
  })
  .strict()

export const pageNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal('frame'),
    kind: z.literal('page'),
    attrs: pageAttrsSchema,
  })
  .strict()

const apiRefSchema = z
  .object({
    id: str(),
    serviceId: str(),
    method: str(),
    path: str(),
    // Facette + annotation repris des notes API à la migration v13. Optionnels.
    facet: facetSchema.nullable().optional(),
    notes: str().optional(),
  })
  .strict()

const blockAttrsSchema = z
  .object({
    name: str(),
    blockType: blockTypeSchema,
    content: richDocSchema,
    apiRefs: z.array(apiRefSchema),
    order: z.array(str()),
  })
  .strict()

export const blockNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal('frame'),
    kind: z.literal('block'),
    attrs: blockAttrsSchema,
  })
  .strict()

const moduleAttrsSchema = z
  .object({
    name: str(),
    description: str(),
    notes: str(),
    // Taille minimale fixée à la main (poignée de resize) ; absente = auto.
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .strict()

export const moduleNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal('frame'),
    kind: z.literal('module'),
    attrs: moduleAttrsSchema,
  })
  .strict()

export const frameNodeSchema = z.discriminatedUnion('kind', [
  pageNodeSchema,
  blockNodeSchema,
  moduleNodeSchema,
])

// ── Notes ──────────────────────────────────────────────────────────────────────

const behaviorNoteAttrsSchema = z
  .object({
    name: str(),
    description: str(),
    facet: facetSchema.nullable(),
    trigger: str(),
    rules: str(),
    hours: z.number().nullable(),
    notes: str(),
  })
  .strict()

export const behaviorNoteSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal('note'),
    kind: z.literal('behavior'),
    attachedTo: str().min(1),
    attrs: behaviorNoteAttrsSchema,
  })
  .strict()

const apiNoteAttrsSchema = z
  .object({
    serviceId: str(),
    method: str(),
    path: str(),
    facet: facetSchema.nullable(),
    notes: str(),
  })
  .strict()

export const apiNoteSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal('note'),
    kind: z.literal('api'),
    attachedTo: str().min(1),
    attrs: apiNoteAttrsSchema,
  })
  .strict()

export const noteNodeSchema = z.discriminatedUnion('kind', [behaviorNoteSchema, apiNoteSchema])

// ── Fonctionnalité (couche fonctionnelle) ────────────────────────────────────

// Statuts du cycle de vie (v10) : source unique dans types.ts (enum fermé, comme les lots).
export const featureStatusSchema = z.enum(FEATURE_STATUSES)

const checklistItemSchema = z
  .object({
    id: str().min(1),
    label: str(),
    done: z.boolean(),
    phase: z.enum(['cadrage', 'dev']),
  })
  .strict()

const featureAttrsSchema = z
  .object({
    code: str(),
    name: str(),
    content: richDocSchema,
    // fieldId → optionId (null = aucune valeur). L'existence de l'option est vérifiée par les
    // invariants référentiels, pas ici : le schéma ne valide que la forme.
    fieldValues: z.record(str(), str().nullable()),
    estimate: str(),
    status: featureStatusSchema,
    checklist: z.array(checklistItemSchema),
  })
  .strict()

export const featureNodeSchema = z
  .object({
    ...baseNodeShape,
    type: z.literal('feature'),
    attrs: featureAttrsSchema,
  })
  .strict()

// Union de tête : discrimination sur `type` (frame|note|feature), puis sur `kind` dans chaque branche.
export const nodeSchema = z.union([frameNodeSchema, noteNodeSchema, featureNodeSchema])

// ── Services (registre) ────────────────────────────────────────────────────────

const serviceEndpointSchema = z
  .object({
    method: str(),
    path: str(),
    notes: str(),
  })
  .strict()

export const serviceSchema = z
  .object({
    id: str().min(1),
    name: str(),
    baseUrl: str(),
    auth: str(),
    risk: riskSchema,
    endpoints: z.array(serviceEndpointSchema),
    notes: str(),
  })
  .strict()

// ── Champs de fonctionnalité (listes d'options globales au projet, v7) ────────

export const featureFieldSchema = z
  .object({
    id: str().min(1),
    label: str(),
    order: z.number().finite(),
  })
  .strict()

export const featureOptionSchema = z
  .object({
    id: str().min(1),
    fieldId: str().min(1),
    name: str(),
  })
  .strict()

// ── Commentaires (v13) ─────────────────────────────────────────────────────────

const commentAnchorSchema = z
  .object({
    nodeId: str().min(1),
    range: z
      .object({
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
        text: str(),
      })
      .strict()
      .optional(),
  })
  .strict()

const commentTagSchema = z
  .object({
    label: str(),
    color: str(),
  })
  .strict()

const commentReplySchema = z
  .object({
    id: str().min(1),
    author: str(),
    createdAt: str(),
    body: richDocSchema,
  })
  .strict()

export const commentSchema = z
  .object({
    id: str().min(1),
    anchor: commentAnchorSchema,
    tag: commentTagSchema.optional(),
    body: richDocSchema,
    author: str(),
    createdAt: str(),
    resolved: z.boolean(),
    forClaude: z.boolean().optional(),
    replies: z.array(commentReplySchema),
  })
  .strict()

// ── Arêtes ─────────────────────────────────────────────────────────────────────

export const edgeSchema = z
  .object({
    id: str().min(1),
    type: edgeTypeSchema,
    source: str().min(1),
    target: str().min(1),
    attrs: z
      .object({
        notes: str().optional(),
        render: edgeRenderSchema.optional(),
        renderManual: z.boolean().optional(),
        portalPositions: z
          .object({ source: positionSchema, target: positionSchema })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()

export const siteAttrsSchema = z
  .object({
    context: str(),
    constraints: z.array(str()),
    notes: str(),
  })
  .strict()

export const metaSchema = z
  .object({
    name: str(),
    formatVersion: z.literal(13),
    createdAt: str(),
    updatedAt: str(),
    pricing: z
      .object({
        riskCoeff: z.number(),
        dailyRate: z.number().nullable(),
      })
      .strict(),
    homePageId: str().nullable(),
  })
  .strict()

export const projectDocSchema = z
  .object({
    meta: metaSchema,
    site: z.object({ attrs: siteAttrsSchema }).strict(),
    services: z.array(serviceSchema),
    featureFields: z.array(featureFieldSchema),
    featureOptions: z.array(featureOptionSchema),
    nodes: z.array(nodeSchema).max(MAX_NODES),
    edges: z.array(edgeSchema),
    comments: z.array(commentSchema).max(MAX_NODES),
  })
  .strict()

/**
 * Valide (forme uniquement) un document inconnu et le renvoie typé.
 * Les invariants référentiels sont vérifiés séparément (domain/invariants.ts).
 * Lance une ZodError avec chemin en cas d'échec.
 */
export function parseProjectDoc(input: unknown): ProjectDoc {
  return projectDocSchema.parse(input) as ProjectDoc
}

/** Variante non lançante. */
export function safeParseProjectDoc(input: unknown): z.SafeParseReturnType<unknown, ProjectDoc> {
  return projectDocSchema.safeParse(input) as z.SafeParseReturnType<unknown, ProjectDoc>
}

// Types du format projet Flooow — format v2 (voir cadrage/05-implementation/evolution-v2.md §1).
// Deux structures : un arbre de contenance (parentId, pages → blocs) et un registre de services
// (doc.services) + des notes rattachées (attachedTo) + quelques arêtes manuelles (edges).
// Ne pas diverger sans migration + bump de formatVersion.

import type { RichDoc } from './richContent'

export type NodeType = 'frame' | 'note' | 'feature'
export type FrameKind = 'page' | 'block' | 'module'
export type NoteKind = 'behavior' | 'api'
export type BlockType = 'hero' | 'cta' | 'grid' | 'damier' | 'menu' | 'footer' | 'feature' | 'free'
export type Facet = 'front' | 'back' | 'fullstack'
export type EdgeType = 'navigatesTo' | 'dependsOn' | 'realizedBy'
/**
 * Couche du canvas (decisions.md §15) : le mode Arborescence travaille la couche `structural`
 * (pages/blocs/notes), le mode Fonctionnalités la couche `functional` (modules/fonctionnalités).
 * Un seul fichier sous les deux ; le mode masque complètement l'autre couche.
 */
export type CanvasLayer = 'structural' | 'functional'
/** Mode de rendu d'une arête (evolution-v2.md §8, révisé) : tracé continu ou paire de pastilles « portail ». */
export type EdgeRender = 'line' | 'portal'
export type Risk = 'low' | 'medium' | 'high'

/** Liste ordonnée des types de blocs (source pour les sélecteurs UI). */
export const BLOCK_TYPES: BlockType[] = [
  'hero',
  'cta',
  'grid',
  'damier',
  'menu',
  'footer',
  'feature',
  'free',
]

/**
 * Version courante du format sérialisé.
 * v3 : couche fonctionnelle (module + feature).
 * v4 : contenu de fonctionnalité unifié en un document riche `content` (remplace description/implies/
 *      toConfirm/notes).
 * v5 : pages de notes (vue Notes en arbre, collection `notePages`).
 * v7 : le périmètre figé (enum `Perimeter`) devient une liste d'options éditable et globale au
 *      projet — collections `featureFields`/`featureOptions`, valeurs portées par
 *      `FeatureAttrs.fieldValues`.
 * v8 : contenu de bloc unifié en un document riche `content` (remplace description/constraints/
 *      notes, comme la v4 l'a fait pour la fonctionnalité) + connexions API portées par le bloc
 *      (`apiRefs`).
 * v9 : la collection `notePages` disparaît — le narratif vit désormais en fichiers markdown
 *      dans le docs/ du site du projet (publié par Portulan), hors du graphe.
 * v10 : cycle de vie de la fonctionnalité (cycle-de-vie-fonctionnalite.md) — `status` (enum fermé
 *      côté core, comme les lots) et `checklist` (items libres tagués par phase) sur FeatureAttrs.
 * v13 : commentaires façon Google Doc (plan-refonte-notes-commentaires.md) — collection
 *      `doc.comments` ancrée aux pages/blocs (ou à un passage de leur contenu riche), en
 *      remplacement des cartes de note flottantes. La migration convertit les notes comportement
 *      en commentaires (tag « Comportement ») et les notes API en connexions inline du bloc
 *      (`apiRefs`, qui gagnent `facet`/`notes` pour ne rien perdre) ; les nœuds `note`
 *      disparaissent des documents migrés (le type reste accepté le temps du chantier UI).
 */
export const CURRENT_FORMAT_VERSION = 13 as const

export interface SiteAttrs {
  context: string
  constraints: string[]
  notes: string
}

export interface ProjectMeta {
  name: string
  formatVersion: 13
  createdAt: string // ISO date
  updatedAt: string // ISO date
  pricing: { riskCoeff: number; dailyRate: number | null }
  homePageId: string | null // racine du parcours navigation (orphelines)
}

export interface Position {
  x: number
  y: number
}

// ── Registre de services (plus des nœuds du canvas) ──────────────────────────

export interface ServiceEndpoint {
  method: string
  path: string
  notes: string
}

export interface Service {
  id: string
  name: string
  baseUrl: string // « URL de base » — regroupe les endpoints dans la vue API
  auth: string
  risk: Risk
  endpoints: ServiceEndpoint[]
  notes: string
}

// ── Champs de fonctionnalité (listes d'options globales au projet, v7) ───────

/**
 * Un champ de fonctionnalité = un sélecteur affiché sur chaque carte, dont les OPTIONS et le
 * LIBELLÉ sont propres au projet et éditables par l'utilisateur (là où les lots restent, eux,
 * codés en dur — voir domain/lots.ts). Remplace l'ancien enum `Perimeter` figé (v6).
 *
 * Le projet est amorcé avec FIELD_PERIMETER et FIELD_BINDING (factory.createEmptyProject), mais
 * rien n'est spécial à leur sujet : la collection est ouverte, un 3ᵉ champ est une simple entrée.
 * `order` fixe l'ordre d'affichage sur la carte.
 */
export interface FeatureField {
  id: string
  label: string // libellé du sélecteur, renommable (ex. « Fonctionnalité attribué à : »)
  order: number
}

/**
 * Une option sélectionnable dans un champ. Référencée PAR ID depuis `FeatureAttrs.fieldValues`,
 * jamais par son nom : renommer une option ne doit pas délier les fonctionnalités.
 */
export interface FeatureOption {
  id: string
  fieldId: string // id du FeatureField parent
  name: string // ex. « Pilot'in », « Backoffice »
}

/** Champs amorcés à la création d'un projet (repris par la migration v6→v7). */
export const FIELD_PERIMETER = 'perimeter'
export const FIELD_BINDING = 'binding'

// ── Nœuds ────────────────────────────────────────────────────────────────────

export interface BaseNode {
  id: string // UUID v4 opaque et stable (généré par factory.genId), unique
  type: NodeType
  parentId: string | null // blocs : la page ; pages : la page parente (v12) ou null si racine d'arbre ; notes : null
  position: Position
  lot?: number | null // null/absent = hérité (voir lots.ts)
}

/**
 * Frame `page` — écran/route.
 *
 * v12 : les pages forment un ARBRE via `parentId` (null = racine d'un arbre ; un document peut en
 * porter plusieurs). Cet arbre est celui des URL — d'où `slug` plutôt que `route` : la page ne
 * stocke que son propre segment, la route absolue se recompose en remontant ses ancêtres
 * (`domain/routes.ts`). Voir ce fichier pour le raisonnement complet.
 *
 * La parenté est indépendante des arêtes `navigatesTo`, qui restent des LIENS de navigation
 * transverses (rendus en pointillés) et n'impliquent aucune hiérarchie.
 *
 * Seule la position d'une page RACINE est libre : elle ancre son arbre, et la déplacer translate
 * tout l'arbre. Pour les autres, `position.x` ne sert que de clé d'ordre entre frères — comme
 * `position.y` pour les blocs dans leur page.
 */
export interface PageAttrs {
  name: string
  /** Segment d'URL propre à la page, sans `/` (v12). Vide sur la page d'accueil d'un arbre. */
  slug: string
  roles?: string[]
  description: string
  constraints: string[]
  logic: string
  notes: string
}

export interface PageNode extends BaseNode {
  type: 'frame'
  kind: 'page'
  attrs: PageAttrs
}

/**
 * Référence à un endpoint consommé par un bloc (v8). Pointe le service PAR ID dans `doc.services` :
 * renommer un service ne doit pas délier les blocs.
 *
 * Fait doublon assumé avec la note `api` du canvas (`ApiNote`), qui reste le moyen d'accrocher une
 * connexion à une PAGE ou de la faire vivre comme une carte flottante déplaçable. Ici la connexion
 * est un attribut du bloc, sans existence propre : elle naît et meurt avec lui, et se rend dans sa
 * carte. Les deux alimentent la vue API (domain/derive/api.ts) et les exports.
 */
export interface ApiRef {
  /**
   * Identité propre de la connexion (v11). Ajoutée pour que `BlockAttrs.order` puisse la DÉSIGNER :
   * un rang dans `apiRefs` ne survit pas à une suppression (tous les suivants se décalent) et
   * l'ordre pointerait alors sur l'élément voisin. C'est la seule raison d'être de ce champ — une
   * connexion n'a toujours pas d'existence hors de son bloc.
   */
  id: string
  serviceId: string
  method: string
  path: string
  /**
   * Facette et annotation libre (v13) — repris des notes API du canvas lors de leur conversion en
   * connexion inline. Optionnels : une connexion créée à la main n'en a pas besoin, mais la
   * migration ne doit pas perdre ce que l'utilisateur avait écrit sur la carte de note.
   */
  facet?: Facet | null
  notes?: string
}

/** Frame `block` — bloc pleine largeur empilé dans une page. `parentId` = la page. */
export interface BlockAttrs {
  name: string
  blockType: BlockType
  /** Contenu libre (document riche Tiptap/ProseMirror) — v8, remplace description/constraints/notes. */
  content: RichDoc
  /** Connexions API du bloc. L'ordre d'AFFICHAGE est décidé par `order`, pas par ce tableau. */
  apiRefs: ApiRef[]
  /**
   * Ordre d'affichage des éléments de config du bloc (v11), toutes natures confondues : id de
   * connexion API (`ApiRef.id`) ou id de la fonctionnalité réalisée (arête `realizedBy`).
   *
   * Une liste de CLÉS et non les éléments eux-mêmes, parce que les deux natures ont déjà leur
   * source de vérité ailleurs — `apiRefs` ici, les arêtes dans le document — et qu'y recopier leur
   * contenu ferait deux endroits à tenir d'accord. Ce champ ne porte donc qu'une information que
   * personne d'autre ne détient : le rang.
   *
   * TOLÉRANT PAR CONSTRUCTION, dans les deux sens : une clé sans élément correspondant est ignorée
   * (fonctionnalité supprimée ailleurs), un élément absent de la liste s'affiche à la fin (arête
   * `realizedBy` créée depuis la fiche de la fonctionnalité, qui ne connaît pas ce champ). Aucun de
   * ces deux cas n'est une anomalie à réparer : c'est le fonctionnement normal d'un ordre qui
   * n'est pas la source de vérité de ce qu'il ordonne.
   */
  order: string[]
}

export interface BlockNode extends BaseNode {
  type: 'frame'
  kind: 'block'
  attrs: BlockAttrs
}

/**
 * Frame `module` (couche fonctionnelle) — regroupe des fonctionnalités, l'équivalent d'un fichier
 * de catalogue (ex. « Demande de devis »). `parentId` = null (racine fonctionnelle) pour l'instant ;
 * la nidification `domaine → module` est prévue plus tard (cadrage-par-fonctionnalite.md).
 */
export interface ModuleAttrs {
  name: string
  description: string
  notes: string
  /**
   * Taille MINIMALE fixée à la main (poignée de resize, coin bas-droit). Le module ne descend jamais
   * sous cette taille mais peut grandir au-delà si son contenu l'exige. `undefined` = auto (épouse le
   * contenu). Permet notamment d'élargir un module pour y poser des fonctionnalités côte à côte.
   */
  width?: number
  height?: number
}

export interface ModuleNode extends BaseNode {
  type: 'frame'
  kind: 'module'
  attrs: ModuleAttrs
}

export type FrameNode = PageNode | BlockNode | ModuleNode

/** Note `behavior` — carte flottante rattachée à UNE cible (`attachedTo` = page ou bloc). */
export interface BehaviorNoteAttrs {
  name: string
  description: string
  facet: Facet | null
  trigger: string
  rules: string
  hours: number | null
  notes: string
}

/** Note `api` — carte flottante rattachée à une cible, référence un service + un endpoint. */
export interface ApiNoteAttrs {
  serviceId: string
  method: string
  path: string
  facet: Facet | null
  notes: string
}

export interface BaseNoteNode extends BaseNode {
  type: 'note'
  attachedTo: string // id d'une page ou d'un bloc
}

export interface BehaviorNote extends BaseNoteNode {
  kind: 'behavior'
  attrs: BehaviorNoteAttrs
}

export interface ApiNote extends BaseNoteNode {
  kind: 'api'
  attrs: ApiNoteAttrs
}

export type NoteNode = BehaviorNote | ApiNote

// ── Fonctionnalité (couche fonctionnelle) ────────────────────────────────────

/**
 * Statut d'une fonctionnalité (cycle-de-vie-fonctionnalite.md, v10) — enum FERMÉ côté core, comme
 * les lots : le statut pilote de l'UI et des mécaniques (gate de bascule, arbre de déblocage), il
 * lui faut des clés connues du code. Ce n'est PAS un `featureField` (options libres sans sémantique).
 * Liste ordonnée pour l'affichage : famille cadrage puis famille dév. `reportee` et `ecartee` sont
 * des SORTIES de route (backlog / abandon), pas des étapes — elles restent en famille cadrage.
 * La logique dérivée (phase, seuil de déblocage) vit dans domain/lifecycle.ts.
 */
export const FEATURE_STATUSES = [
  'idee',
  'a-qualifier',
  'cadree',
  'estimee',
  'retenue',
  'reportee',
  'ecartee',
  'a-developper',
  'en-developpement',
  'en-recette',
  'validee',
  'en-production',
] as const
export type FeatureStatus = (typeof FEATURE_STATUSES)[number]

/**
 * Phase d'une fonctionnalité — TOUJOURS dérivée du statut (domain/lifecycle.ts : `phaseOf`),
 * jamais stockée sur le nœud. Le type sérialisé ne l'utilise que pour taguer les items de
 * checklist (dans quelle zone de suivi l'item s'affiche).
 */
export type LifecyclePhase = 'cadrage' | 'dev'

/**
 * Item de la checklist d'étapes d'une fonctionnalité (« Endpoints mappés », « Whitelist IP »…).
 * Propre à la fonctionnalité (pas un template global du projet), rédigé librement.
 */
export interface ChecklistItem {
  id: string // genId()
  label: string
  done: boolean
  phase: LifecyclePhase // détermine dans quelle zone de suivi (cadrage / dév) l'item s'affiche
}

/**
 * Nœud `feature` — l'atome de cadrage amont (cadrage-par-fonctionnalite.md). Indépendant de
 * l'arborescence des pages : `parentId` = un `module` (ou null). Porte l'estimation (decisions.md
 * §15 : l'estimation vit ici, pas sur la note). Se relie par `dependsOn` (dépend de) aux autres
 * fonctionnalités et par `realizedBy` (réalisé par) aux pages/blocs qui la réalisent.
 */
export interface FeatureAttrs {
  code: string // identité stable référençable (ex. « DEV-04 »)
  name: string // titre
  content: RichDoc // contenu libre (document riche Tiptap/ProseMirror) — v4, remplace description/implies/toConfirm/notes
  /**
   * Valeur retenue pour chaque champ du projet : `fieldId` → `optionId` (voir FeatureField).
   * Un champ absent de l'objet ou à `null` = aucune valeur choisie. Les ids d'options doivent
   * exister dans `doc.featureOptions` et appartenir au bon champ (voir domain/invariants.ts).
   */
  fieldValues: Record<string, string | null>
  estimate: string // charge, texte libre normalisé (ex. « 1j », « à estimer »)
  /** Statut du cycle de vie (v10). La phase (cadrage/dev) s'en dérive, jamais stockée. */
  status: FeatureStatus
  /** Checklist d'étapes propre à la fonctionnalité (v10). Ordre = ordre d'affichage. */
  checklist: ChecklistItem[]
}

export interface FeatureNode extends BaseNode {
  type: 'feature'
  parentId: string | null // id d'un module, ou null (racine fonctionnelle)
  attrs: FeatureAttrs
}

export type FlooowNode = PageNode | BlockNode | ModuleNode | BehaviorNote | ApiNote | FeatureNode

// ── Arêtes manuelles (réduites en v2) ────────────────────────────────────────

export interface EdgeAttrs {
  notes?: string
  /**
   * Mode de rendu de l'arête (evolution-v2.md §8, révisé). `'line'` (défaut) = tracé continu.
   * `'portal'` = paire de pastilles « off-page » aux deux extrémités au lieu d'un trait.
   * Purement VISUEL : ne change ni le comptage, ni l'arborescence dérivée de navigatesTo.
   */
  render?: EdgeRender
  /**
   * Verrou manuel du mode de rendu (evolution-v2.md §8). `true` quand l'utilisateur a choisi
   * explicitement ligne/portail (popover / clic droit) : la ré-évaluation AUTOMATIQUE (création,
   * déplacement) ne réécrit alors plus `render`. Absent/`false` = laissé à l'auto-détection.
   */
  renderManual?: boolean
  /**
   * Positions monde des deux nœuds portail (evolution-v2.md §8, révisé) quand `render:'portal'`.
   * `source` = pastille près de l'extrémité source, `target` = pastille près de la cible.
   * Auto-placées à la création, déplaçables ensuite ; recalculées à la volée si absentes.
   * Ignorées en rendu `line`.
   */
  portalPositions?: { source: Position; target: Position }
}

export interface FlooowEdge {
  id: string
  type: EdgeType
  source: string
  target: string
  attrs: EdgeAttrs
}

// ── Commentaires (v13, plan-refonte-notes-commentaires.md) ───────────────────

/**
 * Ancre d'un commentaire : TOUJOURS un élément du graphe (page ou bloc) — le commentaire flottant
 * « niveau document » n'existe pas (décision Hugo, 22/07). `range` précise optionnellement un
 * passage du contenu riche du bloc.
 */
export interface CommentAnchor {
  nodeId: string // id d'une page ou d'un bloc
  /**
   * Passage ancré dans le RichDoc du bloc : positions ProseMirror + copie du texte visé. Le texte
   * sert de repli : si le document a trop bougé pour que les offsets retombent sur lui (recherche
   * du texte aux alentours comprise), l'ancre se replie sur le bloc entier — un commentaire ne
   * devient jamais orphelin parce qu'on a réécrit une phrase.
   */
  range?: { from: number; to: number; text: string }
}

/** Tag custom d'un commentaire : libellé + couleur libres. Porté par le fil, pas les réponses. */
export interface CommentTag {
  label: string
  color: string // hex CSS (#rrggbb)
}

export interface CommentReply {
  id: string
  author: string // reprise de l'identité collab (displayName) ; '' = inconnue (migration)
  createdAt: string // ISO date
  body: RichDoc
}

/**
 * Un commentaire est un objet du DOCUMENT (partagé, versionné, collab), pas un artefact local.
 * `forClaude` adresse le fil à l'agent (skill cadrage / CLI flooow) — booléen dédié et non tag
 * réservé : indépendant du tag métier, et filtrable côté serveur sans convention de libellé.
 * RESTRICTION (Hugo, 22/07) : les fils `forClaude` ne sont visibles et créables que par les
 * membres Pilot'in (rôle collab `dev`/`marin`, jamais `client`) — filtrage à l'affichage ET à la
 * création, côté app et côté serveur de room.
 */
export interface Comment {
  id: string
  anchor: CommentAnchor
  tag?: CommentTag
  body: RichDoc
  author: string // '' = inconnue (commentaire issu de la migration v13)
  createdAt: string // ISO date
  resolved: boolean
  forClaude?: boolean
  replies: CommentReply[]
}

// ── Document ─────────────────────────────────────────────────────────────────

export interface ProjectDoc {
  meta: ProjectMeta
  site: { attrs: SiteAttrs }
  services: Service[]
  featureFields: FeatureField[]
  featureOptions: FeatureOption[]
  nodes: FlooowNode[]
  edges: FlooowEdge[]
  comments: Comment[]
}

// ── Index maintenus par le store (contrat des fonctions domain/) ─────────────

/** Index id → nœud (accès O(1), maintenu par stores/project). */
export type NodeIndex = Map<string, FlooowNode>
/** Index parentId → ids des enfants directs (clé `null` = enfants du site). */
export type ChildrenIndex = Map<string | null, string[]>
/** Index attachedTo → ids des notes rattachées à une cible. */
export type AttachedIndex = Map<string, string[]>
/** Index anchor.nodeId → commentaires ancrés sur l'élément (v13). */
export type CommentsIndex = Map<string, Comment[]>

// ── Helpers de discrimination ────────────────────────────────────────────────

export function isFrame(node: FlooowNode): node is FrameNode {
  return node.type === 'frame'
}
export function isNote(node: FlooowNode): node is NoteNode {
  return node.type === 'note'
}
export function isPage(node: FlooowNode): node is PageNode {
  return node.type === 'frame' && node.kind === 'page'
}
export function isBlock(node: FlooowNode): node is BlockNode {
  return node.type === 'frame' && node.kind === 'block'
}
export function isModule(node: FlooowNode): node is ModuleNode {
  return node.type === 'frame' && node.kind === 'module'
}
export function isFeature(node: FlooowNode): node is FeatureNode {
  return node.type === 'feature'
}
export function isBehaviorNote(node: FlooowNode): node is BehaviorNote {
  return node.type === 'note' && node.kind === 'behavior'
}
export function isApiNote(node: FlooowNode): node is ApiNote {
  return node.type === 'note' && node.kind === 'api'
}

/**
 * Couche d'un nœud (decisions.md §15). Modules et fonctionnalités = couche fonctionnelle ;
 * pages, blocs et notes = couche structurelle. Sert au filtrage du canvas par mode.
 */
export function layerOf(node: FlooowNode): CanvasLayer {
  return isModule(node) || isFeature(node) ? 'functional' : 'structural'
}

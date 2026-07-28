// Invariants du modèle v2 (evolution-v2.md §4 + décisions).
// Exécuté après chaque action (dev : throw), à l'ouverture (bloquant), avant écriture (garde-fou).
import type { FlooowNode, ProjectDoc } from '@flooow/core/model/types'
import { isApiNote, isBlock, isFeature, isModule, isNote, isPage } from '@flooow/core/model/types'
import { findDependsCycles } from '@flooow/core/domain/lifecycle'

/** Code stable de chaque type de violation (utilisé par les tests et les messages UI). */
export type ViolationCode =
  | 'DANGLING_EDGE' // arête vers un id inexistant
  | 'PARENT_CYCLE' // cycle dans parentId
  | 'DEPENDS_CYCLE' // cycle dans les arêtes dependsOn (deux cartes bloquées à vie)
  | 'PAGE_PARENT' // une page dont parentId ne pointe pas vers une page existante
  | 'BLOCK_PARENT' // un bloc n'a pas une page pour parent
  | 'NOTE_ATTACH' // note dont attachedTo ne pointe pas vers une page/bloc existant
  | 'BAD_SERVICE_REF' // note API dont serviceId n'existe pas dans le registre
  | 'NAVIGATES_NON_PAGE' // navigatesTo entre non-pages
  | 'DUPLICATE_ID' // id de nœud/service/arête non unique
  | 'BAD_HOME_PAGE' // homePageId ne pointe pas vers une page existante
  | 'NEGATIVE_HOURS' // hours < 0
  | 'BAD_LOT' // lot < 1
  | 'MODULE_PARENT' // un module a un parent (doit être racine de la couche fonctionnelle)
  | 'FEATURE_PARENT' // une fonctionnalité dont parentId ne pointe pas vers un module existant
  | 'REALIZES_TARGET' // realizedBy dont source n'est pas une fonctionnalité ou cible pas page/bloc
  | 'BAD_OPTION_FIELD' // option de fonctionnalité dont fieldId n'existe pas
  | 'BAD_OPTION_REF' // fieldValues pointant une option inexistante, ou rattachée à un autre champ
  | 'COMMENT_ANCHOR' // commentaire dont anchor.nodeId ne pointe pas vers une page/bloc existant

export interface Violation {
  code: ViolationCode
  message: string
  nodeId?: string
  edgeId?: string
  serviceId?: string
  fieldId?: string
  optionId?: string
  commentId?: string
}

/** Identifiant canonique d'un endpoint (rapprochement méthode+chemin). */
export function endpointId(method: string, path: string): string {
  return `${method} ${path}`.trim()
}

/**
 * Vérifie tous les invariants référentiels et renvoie la liste des violations (vide = document sain).
 */
export function checkInvariants(doc: ProjectDoc): Violation[] {
  const violations: Violation[] = []

  // Index par id. En cas de doublon, la Map garde la dernière occurrence.
  const index = new Map<string, FlooowNode>()
  const seenNodeIds = new Set<string>()
  for (const node of doc.nodes) {
    if (seenNodeIds.has(node.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id de nœud dupliqué : ${node.id}`,
        nodeId: node.id,
      })
    }
    seenNodeIds.add(node.id)
    index.set(node.id, node)
  }
  // Doublons d'id de service.
  const serviceIds = new Set<string>()
  for (const svc of doc.services) {
    if (serviceIds.has(svc.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id de service dupliqué : ${svc.id}`,
        serviceId: svc.id,
      })
    }
    serviceIds.add(svc.id)
  }
  // Champs de fonctionnalité : ids uniques, et options rattachées à un champ existant.
  const fieldIds = new Set<string>()
  for (const field of doc.featureFields) {
    if (fieldIds.has(field.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id de champ de fonctionnalité dupliqué : ${field.id}`,
        fieldId: field.id,
      })
    }
    fieldIds.add(field.id)
  }
  const optionsById = new Map<string, (typeof doc.featureOptions)[number]>()
  for (const option of doc.featureOptions) {
    if (optionsById.has(option.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id d'option dupliqué : ${option.id}`,
        optionId: option.id,
      })
    }
    optionsById.set(option.id, option)
    if (!fieldIds.has(option.fieldId)) {
      violations.push({
        code: 'BAD_OPTION_FIELD',
        message: `l'option ${option.id} référence un champ inconnu : ${option.fieldId}`,
        optionId: option.id,
        fieldId: option.fieldId,
      })
    }
  }

  // Doublons d'id d'arête.
  const seenEdgeIds = new Set<string>()
  for (const edge of doc.edges) {
    if (seenEdgeIds.has(edge.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id d'arête dupliqué : ${edge.id}`,
        edgeId: edge.id,
      })
    }
    seenEdgeIds.add(edge.id)
  }

  // Structure des nœuds : rattachements, lot, heures.
  for (const node of doc.nodes) {
    // PAGE_PARENT : depuis la v12 une page PEUT avoir une parente — mais seulement une PAGE. Un
    // parentId null reste la racine d'un arbre (un document en porte autant qu'il veut).
    // Les cycles sont couverts par PARENT_CYCLE, qui parcourt déjà tous les parentId sans
    // distinction de type.
    if (isPage(node) && node.parentId != null) {
      const parent = index.get(node.parentId)
      if (!parent || !isPage(parent)) {
        violations.push({
          code: 'PAGE_PARENT',
          message: `la page ${node.id} doit avoir une page pour parent`,
          nodeId: node.id,
        })
      }
    }
    // BLOCK_PARENT : un bloc a toujours une page pour parent.
    if (isBlock(node)) {
      const parent = node.parentId != null ? index.get(node.parentId) : undefined
      if (!parent || !isPage(parent)) {
        violations.push({
          code: 'BLOCK_PARENT',
          message: `le bloc ${node.id} doit avoir une page pour parent`,
          nodeId: node.id,
        })
      }
    }
    // MODULE_PARENT : un module est racine de la couche fonctionnelle (pas de parent pour l'instant).
    if (isModule(node) && node.parentId != null) {
      violations.push({
        code: 'MODULE_PARENT',
        message: `le module ${node.id} ne doit pas avoir de parent`,
        nodeId: node.id,
      })
    }
    // FEATURE_PARENT : une fonctionnalité se rattache à un module existant (ou reste racine, null).
    if (isFeature(node) && node.parentId != null) {
      const parent = index.get(node.parentId)
      if (!parent || !isModule(parent)) {
        violations.push({
          code: 'FEATURE_PARENT',
          message: `la fonctionnalité ${node.id} doit avoir un module pour parent`,
          nodeId: node.id,
        })
      }
    }
    // NOTE_ATTACH : une note se rattache à une page ou un bloc existant.
    if (isNote(node)) {
      const target = index.get(node.attachedTo)
      if (!target || !(isPage(target) || isBlock(target))) {
        violations.push({
          code: 'NOTE_ATTACH',
          message: `la note ${node.id} doit être rattachée à une page ou un bloc existant`,
          nodeId: node.id,
        })
      }
    }
    // BAD_SERVICE_REF : note API pointant un service absent du registre.
    if (isApiNote(node) && !serviceIds.has(node.attrs.serviceId)) {
      violations.push({
        code: 'BAD_SERVICE_REF',
        message: `la note API ${node.id} référence un service inconnu : ${node.attrs.serviceId}`,
        nodeId: node.id,
      })
    }
    // BAD_OPTION_REF : la valeur d'un champ doit désigner une option EXISTANTE et rattachée à CE
    // champ (un id valide mais emprunté à un autre champ afficherait un libellé hors-sujet).
    if (isFeature(node)) {
      for (const [fieldId, optionId] of Object.entries(node.attrs.fieldValues)) {
        if (optionId == null) continue
        const option = optionsById.get(optionId)
        if (!option) {
          violations.push({
            code: 'BAD_OPTION_REF',
            message: `la fonctionnalité ${node.id} référence une option inconnue : ${optionId}`,
            nodeId: node.id,
            fieldId,
            optionId,
          })
        } else if (option.fieldId !== fieldId) {
          violations.push({
            code: 'BAD_OPTION_REF',
            message: `la fonctionnalité ${node.id} range l'option ${optionId} sous « ${fieldId} », mais elle appartient à « ${option.fieldId} »`,
            nodeId: node.id,
            fieldId,
            optionId,
          })
        }
      }
    }
    // BAD_LOT : lot explicite < 1.
    if (node.lot != null && node.lot < 1) {
      violations.push({
        code: 'BAD_LOT',
        message: `lot invalide (< 1) sur ${node.id} : ${node.lot}`,
        nodeId: node.id,
      })
    }
    // NEGATIVE_HOURS : note comportement avec heures négatives.
    if (node.type === 'note' && node.kind === 'behavior' && node.attrs.hours != null && node.attrs.hours < 0) {
      violations.push({
        code: 'NEGATIVE_HOURS',
        message: `heures négatives sur ${node.id} : ${node.attrs.hours}`,
        nodeId: node.id,
      })
    }
  }

  // PARENT_CYCLE : remontée de parentId qui reboucle (frames).
  for (const node of doc.nodes) {
    const chain = new Set<string>([node.id])
    let parentId = node.parentId
    while (parentId != null) {
      if (chain.has(parentId)) {
        violations.push({
          code: 'PARENT_CYCLE',
          message: `cycle de parentId impliquant ${node.id}`,
          nodeId: node.id,
        })
        break
      }
      chain.add(parentId)
      const parent = index.get(parentId)
      if (!parent) break // parent inexistant : pas un cycle
      parentId = parent.parentId
    }
  }

  // Arêtes : liens fantômes, navigatesTo page↔page.
  for (const edge of doc.edges) {
    const source = index.get(edge.source)
    const target = index.get(edge.target)
    if (!source || !target) {
      violations.push({
        code: 'DANGLING_EDGE',
        message: `arête ${edge.id} référence un id inexistant (${edge.source} → ${edge.target})`,
        edgeId: edge.id,
      })
      continue // les vérifs suivantes exigent des extrémités existantes
    }
    if (edge.type === 'navigatesTo' && (!isPage(source) || !isPage(target))) {
      violations.push({
        code: 'NAVIGATES_NON_PAGE',
        message: `navigatesTo (${edge.id}) ne relie pas deux pages`,
        edgeId: edge.id,
      })
    }
    // REALIZES_TARGET : « réalisé par » relie une fonctionnalité (source) à une page/bloc (cible).
    if (edge.type === 'realizedBy' && (!isFeature(source) || !(isPage(target) || isBlock(target)))) {
      violations.push({
        code: 'REALIZES_TARGET',
        message: `realizedBy (${edge.id}) doit relier une fonctionnalité à une page ou un bloc`,
        edgeId: edge.id,
      })
    }
  }

  // DEPENDS_CYCLE : cycle dans le graphe dependsOn (cycle-de-vie-fonctionnalite.md) — des cartes
  // bloquées à vie dans l'arbre de déblocage. L'UI refuse l'arête à la création
  // (wouldCreateDependsCycle) ; l'invariant attrape les fichiers construits hors UI (agent,
  // migrations). Seules les arêtes aux deux extrémités existantes comptent (sinon DANGLING_EDGE).
  const dependsEdges = doc.edges.filter(
    (e) => e.type === 'dependsOn' && index.has(e.source) && index.has(e.target),
  )
  for (const cycle of findDependsCycles(dependsEdges)) {
    violations.push({
      code: 'DEPENDS_CYCLE',
      message: `cycle de dépendances : ${[...cycle, cycle[0]].join(' → ')}`,
      nodeId: cycle[0],
    })
  }

  // Commentaires (v13) : ids uniques, ancre vers une page/bloc existant. L'ancre est obligatoire
  // par modèle (pas de commentaire flottant) — un nodeId pendouillant signifie une cible supprimée
  // hors cascade ou un document construit hors UI.
  const seenCommentIds = new Set<string>()
  for (const comment of doc.comments ?? []) {
    if (seenCommentIds.has(comment.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id de commentaire dupliqué : ${comment.id}`,
        commentId: comment.id,
      })
    }
    seenCommentIds.add(comment.id)
    const target = index.get(comment.anchor.nodeId)
    if (!target || !(isPage(target) || isBlock(target))) {
      violations.push({
        code: 'COMMENT_ANCHOR',
        message: `le commentaire ${comment.id} doit être ancré sur une page ou un bloc existant`,
        commentId: comment.id,
        nodeId: comment.anchor.nodeId,
      })
    }
  }

  // BAD_HOME_PAGE : homePageId doit pointer vers une page existante (ou être null).
  const home = doc.meta.homePageId
  if (home != null) {
    const node = index.get(home)
    if (!node || !isPage(node)) {
      violations.push({
        code: 'BAD_HOME_PAGE',
        message: `homePageId « ${home} » ne pointe pas vers une page existante`,
      })
    }
  }

  return violations
}

/** Lance une erreur agrégée si des invariants sont violés (utilisé en dev après action / à l'ouverture). */
export function assertInvariants(doc: ProjectDoc): void {
  const violations = checkInvariants(doc)
  if (violations.length > 0) {
    throw new Error(
      `Invariants violés (${violations.length}) : ` +
        violations.map((v) => `${v.code} ${v.message}`).join(' | '),
    )
  }
}

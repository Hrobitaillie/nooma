// Catalogue et résolution des cibles du menu « # » (liens vers une fonctionnalité ou une page de
// l'arbo), partagés par l'extension Tiptap (refLinks.ts) et la navigation au clic.
// Le type 'note' (ex-pages de notes, retirées du modèle en v9) reste ACCEPTÉ en lecture pour les
// contenus existants : il se résout toujours en lien cassé (libellé de repli, clic inerte).
//
// ── Pourquoi l'id est la source de vérité, pas le libellé ─────────────────────────────────────────
// Le node ne stocke que `{ type, id, label }` où `label` est un SNAPSHOT de repli. Le libellé affiché
// est résolu à CHAQUE rendu depuis le store : renommer une note met à jour tous les liens qui la
// visent, sans passe de réécriture du contenu. La résolution se fait pendant le `generateHTML` du
// computed de RichContent, donc Vue track la lecture du store et le rendu se rafraîchit tout seul.
// `label` ne sert que quand la cible n'existe plus (supprimée, ou lien collé depuis un autre projet) :
// on affiche le dernier libellé connu en état « cassé » plutôt qu'un id opaque.
import { getActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import type { FeatureNode, PageNode } from '@flooow/core/model/types'

export type RefType = 'note' | 'feature' | 'page'

const REF_TYPES: readonly RefType[] = ['note', 'feature', 'page']

/** Garde de type : un `data-ref-type` vient du DOM (donc potentiellement forgé), jamais du code. */
export function isRefType(v: unknown): v is RefType {
  return typeof v === 'string' && (REF_TYPES as readonly string[]).includes(v)
}

export interface RefResolution {
  label: string
  /** false = cible introuvable → rendu en état « cassé », clic inerte. */
  exists: boolean
}

/** Une cible proposée dans le menu « # ». */
export interface RefTarget {
  type: RefType
  id: string
  label: string
  /** Texte de la pastille de tête (code fonctionnalité, ou libellé du type). */
  badge: string
  /** Contexte affiché à droite (chemin parent, route…). */
  hint: string
}

const TYPE_LABEL: Record<RefType, string> = {
  note: 'Note',
  feature: 'Fonctionnalité',
  page: 'Page',
}

/**
 * Accès défensif au store : `generateHTML` peut être appelé hors d'un contexte Pinia actif (tests,
 * rendu statique). Dans ce cas on ne résout pas et l'appelant retombe sur le snapshot `label`.
 */
function projectStore(): ReturnType<typeof useProjectStore> | null {
  if (!getActivePinia()) return null
  try {
    return useProjectStore()
  } catch {
    return null
  }
}

/** Toutes les cibles liables du projet courant, dans l'ordre d'affichage du menu. */
export function refTargets(): RefTarget[] {
  const store = projectStore()
  if (!store) return []
  const out: RefTarget[] = []

  for (const node of store.nodes.values()) {
    if (node.type === 'feature') {
      const f = node as FeatureNode
      const mod = f.parentId ? store.nodes.get(f.parentId) : null
      out.push({
        type: 'feature',
        id: f.id,
        label: f.attrs.name,
        badge: f.attrs.code,
        hint: mod && 'attrs' in mod && 'name' in mod.attrs ? String(mod.attrs.name) : 'Fonctionnalités',
      })
    } else if (node.type === 'frame' && node.kind === 'page') {
      const p = node as PageNode
      out.push({
        type: 'page',
        id: p.id,
        label: p.attrs.name,
        badge: 'Page',
        hint: store.routeOf(p.id),
      })
    }
  }

  return out
}

/** Résout le libellé courant d'une cible. `exists: false` si elle a disparu. */
export function resolveRef(type: RefType, id: string): RefResolution {
  const store = projectStore()
  if (!store) return { label: '', exists: false }

  // Legacy v8 : les pages de notes n'existent plus dans le modèle — lien cassé (repli sur snapshot).
  if (type === 'note') return { label: '', exists: false }

  const node = store.nodes.get(id)
  if (!node) return { label: '', exists: false }
  if (type === 'feature' && node.type === 'feature') {
    return { label: (node as FeatureNode).attrs.name, exists: true }
  }
  if (type === 'page' && node.type === 'frame' && node.kind === 'page') {
    return { label: (node as PageNode).attrs.name, exists: true }
  }
  // Id connu mais d'un autre type que celui stocké : la cible a été remplacée → lien cassé.
  return { label: '', exists: false }
}

/** Libellé du type, pour la pastille de tête du lien rendu. */
export function refTypeLabel(type: RefType): string {
  return TYPE_LABEL[type] ?? 'Lien'
}

// Éléments de config d'un bloc, DANS L'ORDRE — la lecture de `BlockAttrs.order` (v11).
//
// Vit à part parce que DEUX rendus en dépendent et doivent être d'accord au rang près : la liste du
// panneau de config (BlockConfigPanel), où l'on réorganise, et l'aperçu dans la carte du bloc
// (BlockNode), qui doit refléter la réorganisation. Les faire calculer chacun leur ordre, c'est
// s'exposer à ce qu'ils divergent au premier cas limite — et les cas limites sont ici la règle, pas
// l'exception (cf. la tolérance décrite sur `order` dans types.ts).
import type { ApiRef, BlockNode, FeatureNode } from '@flooow/core/model/types'

export type BlockElement =
  | { key: string; kind: 'api'; index: number; ref: ApiRef }
  | { key: string; kind: 'feature'; feature: FeatureNode }

/**
 * Assemble connexions API et fonctionnalités réalisées en UNE liste, rangée selon `attrs.order`.
 *
 * Deux écarts à l'ordre sont normaux et traités sans bruit :
 *   · une clé de `order` sans élément → ignorée (l'élément a été supprimé) ;
 *   · un élément absent de `order` → placé à la FIN, dans son ordre naturel. C'est le cas d'une
 *     arête `realizedBy` créée depuis la fiche de la fonctionnalité, qui ne touche pas au bloc.
 * L'alternative — réparer `order` à la lecture — écrirait dans le document au simple affichage
 * d'une carte, et ferait de chaque ouverture de projet une modification.
 *
 * @param features Fonctionnalités réalisées par ce bloc (`project.featuresOfTarget`), passées en
 *   paramètre : elles se lisent dans les ARÊTES, que le nœud bloc ne connaît pas.
 */
export function orderedBlockElements(block: BlockNode, features: FeatureNode[]): BlockElement[] {
  const items: BlockElement[] = [
    ...block.attrs.apiRefs.map(
      (ref, index): BlockElement => ({ key: ref.id, kind: 'api', index, ref }),
    ),
    ...features.map((feature): BlockElement => ({ key: feature.id, kind: 'feature', feature })),
  ]
  const rank = new Map(block.attrs.order.map((key, i) => [key, i]))
  // `Infinity` pour les inconnus (donc en fin), et un tri STABLE (garanti par la spec) pour qu'ils
  // gardent entre eux l'ordre naturel ci-dessus : connexions d'abord, puis fonctionnalités.
  return items
    .map((el, i) => ({ el, i, r: rank.get(el.key) ?? Infinity }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.el)
}

/**
 * Nouvel `order` après DÉPLACEMENT de l'élément de rang `from` au rang `to`. Renvoie la liste
 * COMPLÈTE des clés dans le nouvel ordre — donc aussi celles qui n'y figuraient pas encore, qui s'y
 * trouvent inscrites au passage. Réorganiser est le seul moment où l'on a le droit de normaliser
 * `order` : l'utilisateur est précisément en train de le définir.
 *
 * Un déplacement (retirer puis réinsérer) et non un échange deux à deux : glisser une ligne du haut
 * vers le bas doit faire remonter TOUTES celles qu'elle enjambe, alors qu'un échange n'en
 * déplacerait qu'une et laisserait les autres sur place.
 */
export function movedKeys(elements: BlockElement[], from: number, to: number): string[] {
  const keys = elements.map((e) => e.key)
  if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return keys
  const [moved] = keys.splice(from, 1)
  keys.splice(to, 0, moved as string)
  return keys
}

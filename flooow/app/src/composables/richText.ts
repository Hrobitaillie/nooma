// Configuration Tiptap partagée par l'éditeur (RichEditor) et le rendu lecture seule (RichContent).
// StarterKit fournit l'essentiel « Notion-like » avec ses règles de saisie : `## ` → titre, `- ` →
// liste, `1. ` → liste numérotée, `> ` → citation, `**gras**`, `*italique*`, `` `code` ``, etc.
// Les blocs métier CUSTOM (endpoint API, callout…) s'ajouteront ici comme extensions Node dédiées.
//
// ── Sûreté du HTML produit (RichContent fait un v-html dessus) ────────────────────────────────────
// Le schéma n'autorise AUCUN nœud HTML brut : la sortie ne contient que des balises connues. Deux
// marks portent malgré tout un attribut sensible, toutes deux bornées AU RENDU — donc y compris pour
// un document forgé, un collage externe ou un update Y.Doc d'un pair (aucun de ces chemins ne passe
// par la validation zod du fichier projet) :
//  - `link` → `href` : allowlist POSITIVE http/https/mailto ci-dessous. StarterKit v3 active Link
//    par défaut et son `renderHTML` vide l'href refusé ; l'option `protocols` ne fait qu'AJOUTER à
//    une liste par défaut large (ftp, tel, sms, xmpp…), d'où l'`isAllowedUri` explicite.
//  - `textStyle` → `color` : ramené à la palette bornée (TEXT_COLORS), sinon couleur par défaut.
// Les nodes `mention` et `refLink` ne font PAS exception : ils ne portent que des ids opaques, jamais
// d'URL — la cible est reconstruite côté app à partir du couple (type, id).
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import type { Extensions } from '@tiptap/core'
import { normalizeTextColor } from '@flooow/core/model/richContent'
import { SlashCommands } from './slashCommands'
import { Mention } from './mentions'
import { RefLink } from './refLinks'

/** Seuls protocoles de lien acceptés. Allowlist positive : tout le reste est refusé. */
export function isAllowedLinkUri(uri: unknown): boolean {
  return typeof uri === 'string' && /^(?:https?:\/\/|mailto:)/i.test(uri.trim())
}

/** Couleur bornée à TEXT_COLORS : une valeur hors palette ne produit aucun attribut `style`. */
const BoundedColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => normalizeTextColor(element.style.color),
            renderHTML: (attributes) => {
              const color = normalizeTextColor(attributes.color)
              return color ? { style: `color: ${color}` } : {}
            },
          },
        },
      },
    ]
  },
})

const starterKit = StarterKit.configure({
  link: {
    isAllowedUri: isAllowedLinkUri,
    // Édition : un clic doit placer le curseur, pas naviguer hors de l'app.
    openOnClick: false,
    HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
  },
})

/**
 * Extensions de rendu (lecture seule) — schéma seul, sans historique ni placeholder.
 * `Mention` et `RefLink` doivent en faire partie : le schéma de `generateHTML` s'en déduit, et un node
 * absent du schéma est silencieusement DROPPÉ au rendu (les liens disparaîtraient hors édition). Leurs
 * plugins de suggestion, eux, ne sont jamais instanciés ici — `getSchema` n'appelle pas
 * `addProseMirrorPlugins`.
 */
export const richExtensions: Extensions = [starterKit, TextStyle, BoundedColor, Mention, RefLink]

/**
 * Extensions d'édition — schéma + placeholder d'invite + les trois menus de saisie :
 * « / » blocs, « @ » mention d'un Pilot'In, « # » lien vers une note/fonctionnalité/page.
 */
export function richEditExtensions(placeholder: string): Extensions {
  return [
    starterKit,
    TextStyle,
    BoundedColor,
    Mention,
    RefLink,
    Placeholder.configure({ placeholder }),
    SlashCommands,
  ]
}

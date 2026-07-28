// Menu « # » : lien vers une note, une fonctionnalité ou une page de l'arbo, rendu en BOUTON inline
// (pas un simple lien souligné). Bâti sur @tiptap/suggestion, même mécanique de popup que « / ».
//
// ── Sûreté ────────────────────────────────────────────────────────────────────────────────────────
// Le node ne porte AUCUNE URL : seulement `refType` (énuméré) + `refId` (id opaque du projet). Le
// rendu ne produit donc jamais d'attribut navigable — l'invariant de richText.ts (« le schéma
// n'autorise aucun href arbitraire », qui justifie le v-html de RichContent) tient par construction,
// y compris pour un doc forgé ou un collage externe. La navigation est reconstruite côté app à partir
// du couple (type, id) via des routes internes connues ; un id forgé ne résout simplement rien.
import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { createSuggestionPopup, type PopupItem } from './suggestionPopup'
import { refTargets, resolveRef, refTypeLabel, isRefType, type RefType } from './richRefs'

/** Attribut porté par le node rendu, lu par la délégation de clic (cf useRefNavigation). */
export const REF_TYPE_ATTR = 'data-ref-type'
export const REF_ID_ATTR = 'data-ref-id'

interface RefItem extends PopupItem {
  type: RefType
  id: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    refLink: {
      insertRefLink: (attrs: { type: RefType; id: string; label: string }) => ReturnType
    }
  }
}

/** Clé DÉDIÉE : voir slashCommands.ts — sans elle, les trois menus partagent `suggestion$`. */
const REFLINK_PLUGIN_KEY = new PluginKey('flooowRefLink')

export const RefLink = Node.create({
  name: 'refLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      refType: {
        default: 'note',
        parseHTML: (el) => {
          const v = el.getAttribute(REF_TYPE_ATTR)
          return isRefType(v) ? v : 'note'
        },
        // Borné à la SÉRIALISATION aussi, pas seulement au parse : `renderHTML` reçoit les attrs du
        // JSON tels quels (doc forgé, update Y.Doc d'un pair), qui ne passent par aucun parseHTML.
        renderHTML: (attrs) => ({ [REF_TYPE_ATTR]: isRefType(attrs.refType) ? attrs.refType : 'note' }),
      },
      refId: {
        default: '',
        parseHTML: (el) => el.getAttribute(REF_ID_ATTR) ?? '',
        renderHTML: (attrs) => ({ [REF_ID_ATTR]: String(attrs.refId) }),
      },
      // Snapshot de repli : n'est affiché QUE si la cible n'existe plus (cf richRefs.ts).
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-ref-label') ?? '',
        renderHTML: (attrs) => ({ 'data-ref-label': String(attrs.label) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: `span[${REF_ID_ATTR}]` }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = isRefType(node.attrs.refType) ? node.attrs.refType : 'note'
    const id = String(node.attrs.refId ?? '')
    const snapshot = String(node.attrs.label ?? '')
    const resolved = resolveRef(type, id)
    const text = resolved.exists ? resolved.label : snapshot || 'Référence introuvable'

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: `ref-link ref-link--${type}${resolved.exists ? '' : ' ref-link--broken'}`,
        // Le titre porte l'info de type au survol ; en cassé, il explique l'état.
        title: resolved.exists ? refTypeLabel(type) : 'Cette référence n’existe plus dans le projet',
      }),
      ['span', { class: 'ref-link__badge' }, refTypeLabel(type)],
      text,
    ]
  },

  addCommands() {
    return {
      insertRefLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { refType: attrs.type, refId: attrs.id, label: attrs.label },
          }),
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: REFLINK_PLUGIN_KEY,
        char: '#',
        // Les titres de notes contiennent des espaces (« Parcours d'inscription ») : sans ça, le menu
        // se fermerait au premier mot et interdirait de filtrer sur un titre complet.
        allowSpaces: true,
        items: ({ query }: { query: string }): RefItem[] => {
          const q = query.trim().toLowerCase()
          const targets = refTargets()
          const matches = q
            ? targets.filter((t) => `${t.badge} ${t.label}`.toLowerCase().includes(q))
            : targets
          // Borne d'affichage : un gros projet a des centaines de cibles, la popup scrollerait sans fin.
          return matches.slice(0, 30).map((t) => ({
            type: t.type,
            id: t.id,
            label: t.label,
            hint: t.hint,
            badge: { text: t.badge, className: `slash-item__badge--${t.type}` },
          }))
        },
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: RefItem }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertRefLink({ type: props.type, id: props.id, label: props.label })
            .run()
        },
        render: createSuggestionPopup<RefItem>({
          emptyLabel: 'Aucune note, fonctionnalité ou page',
          pluginKey: REFLINK_PLUGIN_KEY,
        }),
      }),
    ]
  },
})

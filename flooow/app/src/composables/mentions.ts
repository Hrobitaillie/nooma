// Menu « @ » : mention d'un utilisateur Pilot'In (annuaire bao, rôles dev/marin).
// Bâti sur @tiptap/suggestion, même mécanique de popup que « / » et « # ».
//
// La mention est PUREMENT VISUELLE : elle n'assigne rien et ne notifie personne (il n'y a ni mail ni
// queue côté server/). Seule exception, les mentions de l'utilisateur connecté sont mises en évidence
// (.mention--self) pour repérer d'un coup d'œil ce qui le concerne — la session est déjà dans le
// store, ça ne coûte rien.
//
// ── Sûreté ────────────────────────────────────────────────────────────────────────────────────────
// Comme refLinks, le node ne porte qu'un id opaque + un snapshot de nom : aucun href, aucune adresse
// e-mail dans le HTML rendu (l'email reste côté annuaire, il ne fuite pas dans le document projet —
// qui est exportable). L'invariant v-html de richText.ts tient.
import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { getActivePinia } from 'pinia'
import { createSuggestionPopup, type PopupItem } from './suggestionPopup'
import { useDirectoryStore } from '@/stores/directory'
import { useSessionStore } from '@/stores/session'

export const MENTION_ID_ATTR = 'data-user-id'

interface MentionItem extends PopupItem {
  id: string
}

interface MentionResolution {
  name: string
  exists: boolean
  isSelf: boolean
}

/** Initiales pour la pastille, alignées sur le repli des bulles de présence (PresenceBubbles). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Résout une mention depuis l'annuaire. Défensif : `generateHTML` peut tourner hors contexte Pinia
 * (tests, rendu statique) → on retombe sur le snapshot de nom porté par le node.
 *
 * « Est-ce moi ? » se joue d'abord sur l'EMAIL : la mention porte l'UUID bao, alors que `session.id`
 * vaut le sujet injecté par AuthCrunch — rien ne garantit que les deux coïncident. L'email est le
 * seul champ que les deux sources ont en commun. La comparaison d'id reste, en second, pour le cas
 * où AuthCrunch injecterait justement l'UUID bao en sujet.
 */
function resolveMention(id: string): MentionResolution {
  if (!getActivePinia()) return { name: '', exists: false, isSelf: false }
  try {
    const user = useDirectoryStore().byId.get(id)
    const me = useSessionStore().identity
    const sameEmail =
      Boolean(me?.email) && Boolean(user?.email) && me!.email!.toLowerCase() === user!.email!.toLowerCase()
    return { name: user?.name ?? '', exists: Boolean(user), isSelf: sameEmail || me?.id === id }
  } catch {
    return { name: '', exists: false, isSelf: false }
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mention: {
      insertMention: (attrs: { id: string; label: string }) => ReturnType
    }
  }
}

/** Clé DÉDIÉE : voir slashCommands.ts — sans elle, les trois menus partagent `suggestion$`. */
const MENTION_PLUGIN_KEY = new PluginKey('flooowMention')

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      userId: {
        default: '',
        parseHTML: (el) => el.getAttribute(MENTION_ID_ATTR) ?? '',
        renderHTML: (attrs) => ({ [MENTION_ID_ATTR]: String(attrs.userId) }),
      },
      // Snapshot de repli : affiché si la personne a quitté l'annuaire (compte désactivé, départ).
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-user-label') ?? '',
        renderHTML: (attrs) => ({ 'data-user-label': String(attrs.label) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: `span[${MENTION_ID_ATTR}]` }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const id = String(node.attrs.userId ?? '')
    const snapshot = String(node.attrs.label ?? '')
    const { name, exists, isSelf } = resolveMention(id)
    const text = exists ? name : snapshot || 'Inconnu'

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: `mention${isSelf ? ' mention--self' : ''}${exists ? '' : ' mention--unknown'}`,
        title: exists ? text : `${text} — ne fait plus partie de l’annuaire`,
      }),
      `@${text}`,
    ]
  },

  addCommands() {
    return {
      insertMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name, attrs: { userId: attrs.id, label: attrs.label } },
            // Espace insécable de sortie : sans ça le curseur reste collé au node atomique et la
            // frappe suivante paraît « avalée » par la mention.
            { type: 'text', text: ' ' },
          ]),
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: MENTION_PLUGIN_KEY,
        char: '@',
        // Les noms ont un espace (« Chloé Gallego-Pelegrin ») : sans allowSpaces, impossible de
        // filtrer sur le nom de famille.
        allowSpaces: true,
        items: ({ query }: { query: string }): MentionItem[] => {
          if (!getActivePinia()) return []
          const store = useDirectoryStore()
          const q = query.trim().toLowerCase()
          const matches = q
            ? store.users.filter((u) => `${u.name} ${u.email ?? ''}`.toLowerCase().includes(q))
            : store.users
          return matches.slice(0, 20).map((u) => ({
            id: u.id,
            label: u.name,
            hint: u.role === 'marin' ? 'Marin' : 'Dev',
            badge: { text: initials(u.name), className: 'slash-item__badge--user' },
          }))
        },
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionItem }) => {
          editor.chain().focus().deleteRange(range).insertMention({ id: props.id, label: props.label }).run()
        },
        render: createSuggestionPopup<MentionItem>({
          emptyLabel: 'Aucun utilisateur',
          pluginKey: MENTION_PLUGIN_KEY,
        }),
      }),
    ]
  },
})

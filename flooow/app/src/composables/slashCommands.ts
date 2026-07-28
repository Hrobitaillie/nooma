// Menu « / » (slash commands) façon Notion pour RichEditor : taper / ouvre une popup de
// blocs à insérer (titres, listes, citation, code, séparateur), filtrée par la frappe
// (`/tit` → Titre…). Bâti sur @tiptap/suggestion ; la mécanique de popup (positionnement,
// navigation clavier, fermeture) est partagée avec les menus « @ » et « # » — cf suggestionPopup.ts.
import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { createSuggestionPopup, type PopupItem } from './suggestionPopup'

// Clé DÉDIÉE. Les trois menus (« / », « @ », « # ») instancient chacun un plugin Suggestion : sans clé
// explicite ils partagent la clé par défaut `suggestion$` et ProseMirror refuse le doublon au montage
// (« Adding different instances of a keyed plugin »). Elle sert aussi à `exitSuggestion`.
const SLASH_PLUGIN_KEY = new PluginKey('flooowSlashCommands')

interface SlashItem extends PopupItem {
  /** Mots-clés de filtrage supplémentaires (synonymes, syntaxe markdown). */
  keywords: string
  run: (editor: Editor, range: Range) => void
}

const ITEMS: SlashItem[] = [
  {
    label: 'Texte',
    hint: 'Paragraphe simple',
    keywords: 'paragraphe p normal',
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
  },
  {
    label: 'Titre',
    hint: 'Titre de section (##)',
    keywords: 'heading h2 section',
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
  },
  {
    label: 'Sous-titre',
    hint: 'Sous-section (###)',
    keywords: 'heading h3 sous section',
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
  },
  {
    label: 'Liste à puces',
    hint: 'Liste simple (-)',
    keywords: 'bullet liste puces ul',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    label: 'Liste numérotée',
    hint: 'Liste ordonnée (1.)',
    keywords: 'ordered numero ol',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    label: 'Citation',
    hint: 'Bloc de citation (>)',
    keywords: 'quote blockquote',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    label: 'Bloc de code',
    hint: 'Code multi-lignes (```)',
    keywords: 'code pre snippet',
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    label: 'Séparateur',
    hint: 'Ligne horizontale (---)',
    keywords: 'hr divider separateur ligne',
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
]

/** Extension Tiptap : branche la suggestion « / » sur l'éditeur. */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: SLASH_PLUGIN_KEY,
        char: '/',
        allowSpaces: false,
        items: ({ query }: { query: string }) => {
          const q = query.trim().toLowerCase()
          if (!q) return ITEMS
          return ITEMS.filter((i) => `${i.label} ${i.keywords}`.toLowerCase().includes(q))
        },
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.run(editor, range)
        },
        // Pas d'emptyLabel : sur « / » sans correspondance, l'utilisateur est en train d'écrire
        // du texte normal — un « Aucun résultat » flottant serait du bruit.
        render: createSuggestionPopup<SlashItem>({ pluginKey: SLASH_PLUGIN_KEY }),
      }),
    ]
  },
})

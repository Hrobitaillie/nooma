// Contenu riche d'une fonctionnalité : document ProseMirror/Tiptap sérialisé en JSON. Le modèle
// reste SANS dépendance à Tiptap (types structurels seulement) ; le rendu/édition vit dans les
// composants (RichContent.vue / RichEditor.vue). Helpers de construction (migration v3→v4) et
// d'extraction de texte brut (export Markdown, recherche, complétude).

/** Nœud d'un document riche (paragraphe, titre, texte, saut, liste…). */
export interface RichNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  content?: RichNode[]
  marks?: unknown[]
  [k: string]: unknown
}

/** Document riche racine (`type: 'doc'`). */
export interface RichDoc {
  type: string
  content?: RichNode[]
  [k: string]: unknown
}

/** Document vide (aucun contenu). */
export const EMPTY_DOC: RichDoc = { type: 'doc', content: [] }

// ── Couleur de texte (mark `textStyle`) ───────────────────────────────────────
// Palette BORNÉE : seule liste de couleurs qu'un document peut porter. Elle vit ici (modèle) et non
// dans theme/tokens.ts parce qu'elle est la référence du bornage au RENDU (richText.ts) : une valeur
// hors palette — document forgé, collage externe, update Y.Doc d'un pair — retombe sur la couleur
// par défaut au lieu d'être injectée telle quelle dans un attribut `style`.
// Teintes alignées sur LOT_COLORS (theme/tokens.ts) pour rester cohérent avec le canvas.

/** Une entrée de la palette. `value: null` = couleur par défaut (aucune mark). */
export interface TextColor {
  id: string
  label: string
  value: string | null
}

export const TEXT_COLORS: readonly TextColor[] = [
  { id: 'default', label: 'Défaut', value: null },
  { id: 'slate', label: 'Ardoise', value: '#64748b' },
  { id: 'blue', label: 'Bleu', value: '#2563eb' },
  { id: 'violet', label: 'Violet', value: '#7c3aed' },
  { id: 'cyan', label: 'Cyan', value: '#0891b2' },
  { id: 'emerald', label: 'Émeraude', value: '#059669' },
  { id: 'amber', label: 'Ambre', value: '#ca8a04' },
  { id: 'red', label: 'Rouge', value: '#dc2626' },
  { id: 'pink', label: 'Rose', value: '#db2777' },
]

const HEX_BY_VALUE = new Set(TEXT_COLORS.map((c) => c.value).filter((v): v is string => v !== null))

/** `rgb(100, 116, 139)` → `#64748b`. Le DOM renvoie du rgb() : nécessaire au collage. */
function rgbToHex(value: string): string | null {
  const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return null
  const hex = m
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex}`
}

/**
 * Ramène une couleur quelconque à la palette : renvoie le hex canonique, ou `null` si la valeur n'y
 * figure pas (→ couleur par défaut). Accepte le hex (toute casse) et le `rgb()` rendu par le DOM.
 */
export function normalizeTextColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().toLowerCase()
  if (!raw) return null
  const hex = raw.startsWith('#') ? raw : rgbToHex(raw)
  return hex && HEX_BY_VALUE.has(hex) ? hex : null
}

/** Vrai si le document n'a aucun texte exploitable. */
export function isEmptyDoc(doc: RichDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true
  return docToPlainText(doc).trim() === ''
}

/** Extrait le texte brut d'un document riche (blocs séparés par des sauts de ligne). */
export function docToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''
  const out: string[] = []
  const walk = (n: RichNode): void => {
    if (typeof n.text === 'string') out.push(n.text)
    if (n.type === 'hardBreak') out.push('\n')
    if (Array.isArray(n.content)) n.content.forEach(walk)
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem') out.push('\n')
  }
  doc.content.forEach(walk)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Texte inline d'un nœud, marks Markdown appliqués (gras/italique/souligné/code/lien).
 * Markdown n'a pas de souligné → `<u>` (toléré par CommonMark). La couleur (`textStyle`) n'a pas
 * d'équivalent : elle est volontairement PERDUE à l'export, le texte reste intact.
 */
function inlineToMarkdown(node: RichNode): string {
  if (node.type === 'hardBreak') return '\n'
  let t = node.text ?? ''
  if (Array.isArray(node.marks)) {
    for (const m of node.marks as { type?: string; attrs?: { href?: unknown } }[]) {
      if (m.type === 'bold') t = `**${t}**`
      else if (m.type === 'italic') t = `*${t}*`
      else if (m.type === 'underline') t = `<u>${t}</u>`
      else if (m.type === 'code') t = `\`${t}\``
      else if (m.type === 'link' && typeof m.attrs?.href === 'string') t = `[${t}](${m.attrs.href})`
    }
  }
  return t
}
function childrenToMarkdown(node: RichNode): string {
  return (node.content ?? []).map(inlineToMarkdown).join('')
}

/** Sérialise un document riche en Markdown (titres, paragraphes, listes, citations, code, marks). */
export function docToMarkdown(doc: RichDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''
  const lines: string[] = []
  const listItems = (list: RichNode, bullet: (i: number) => string): void => {
    ;(list.content ?? []).forEach((li, i) => {
      const text = (li.content ?? []).map(childrenToMarkdown).join(' ').trim()
      lines.push(`${bullet(i)}${text}`)
    })
    lines.push('')
  }
  for (const n of doc.content) {
    switch (n.type) {
      case 'heading':
        lines.push(`${'#'.repeat(Number(n.attrs?.level ?? 3))} ${childrenToMarkdown(n)}`, '')
        break
      case 'paragraph':
        lines.push(childrenToMarkdown(n), '')
        break
      case 'bulletList':
        listItems(n, () => '- ')
        break
      case 'orderedList':
        listItems(n, (i) => `${i + 1}. `)
        break
      case 'blockquote':
        ;(n.content ?? []).forEach((p) => lines.push(`> ${childrenToMarkdown(p)}`))
        lines.push('')
        break
      case 'codeBlock':
        lines.push('```', childrenToMarkdown(n), '```', '')
        break
      default:
        lines.push(childrenToMarkdown(n))
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Découpe un texte multi-lignes en nœuds inline (lignes séparées par des sauts durs). */
function inlineFromText(block: string): RichNode[] {
  const lines = block.split('\n')
  const nodes: RichNode[] = []
  lines.forEach((line, i) => {
    if (line) nodes.push({ type: 'text', text: line })
    if (i < lines.length - 1) nodes.push({ type: 'hardBreak' })
  })
  return nodes
}

/** Découpe un texte en paragraphes (blocs séparés par une ligne vide). */
function paragraphsFromText(text: string): RichNode[] {
  return text
    .split(/\n{2,}/)
    .map((block) => ({ type: 'paragraph', content: inlineFromText(block) }))
    .filter((p) => p.content.length > 0)
}

/** Titre de section niveau 3. */
function heading(text: string): RichNode {
  return { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] }
}

/**
 * Fusionne les anciens champs (Quoi / Implique / À confirmer / Notes) en UN document riche unique :
 * le « Quoi » ouvre le document (sans titre), les autres deviennent des sections titrées. Utilisé par
 * la migration v3→v4.
 */
export function mergeFeatureFields(fields: {
  description?: string
  implies?: string
  toConfirm?: string
  notes?: string
}): RichDoc {
  const content: RichNode[] = []
  if (fields.description?.trim()) content.push(...paragraphsFromText(fields.description))
  const section = (title: string, text?: string): void => {
    if (!text?.trim()) return
    content.push(heading(title))
    content.push(...paragraphsFromText(text))
  }
  section('Implique', fields.implies)
  section('À confirmer', fields.toConfirm)
  section('Notes', fields.notes)
  return { type: 'doc', content }
}

/** Liste à puces à partir de lignes (une puce par ligne non vide). */
function bulletListFromLines(lines: string[]): RichNode {
  return {
    type: 'bulletList',
    content: lines.map((line) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: inlineFromText(line) }],
    })),
  }
}

/**
 * Fusionne les anciens champs d'un BLOC (description / contraintes / notes) en UN document riche
 * unique : la description ouvre le document (sans titre), les contraintes deviennent une liste à
 * puces titrée, les notes une section titrée. Utilisé par la migration v6→v7.
 * Symétrique de `mergeFeatureFields` (v3→v4), à ceci près que `constraints` est un tableau et non
 * un texte libre : chaque entrée devient une puce, ce qui préserve le découpage saisi.
 */
export function mergeBlockFields(fields: {
  description?: string
  constraints?: string[]
  notes?: string
}): RichDoc {
  const content: RichNode[] = []
  if (fields.description?.trim()) content.push(...paragraphsFromText(fields.description))
  const kept = (fields.constraints ?? []).map((c) => c.trim()).filter(Boolean)
  if (kept.length > 0) {
    content.push(heading('Contraintes'))
    content.push(bulletListFromLines(kept))
  }
  if (fields.notes?.trim()) {
    content.push(heading('Notes'))
    content.push(...paragraphsFromText(fields.notes))
  }
  return { type: 'doc', content }
}

/** Paragraphe ouvrant en gras (titre d'un commentaire migré — pas un `heading`, trop lourd). */
function boldParagraph(text: string): RichNode {
  return { type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }
}

/**
 * Recompose une note COMPORTEMENT en corps de commentaire (migration v12→v13,
 * plan-refonte-notes-commentaires.md §Migration) : le nom ouvre le document (gras), puis la
 * description, puis les champs structurés en sections titrées. L'estimation `hours` est FONDUE ici
 * (décision Hugo, 22/07) : le modèle Comment ne porte pas de champ d'heures.
 */
export function mergeBehaviorNoteFields(fields: {
  name?: string
  description?: string
  facet?: string | null
  trigger?: string
  rules?: string
  hours?: number | null
  notes?: string
}): RichDoc {
  const content: RichNode[] = []
  if (fields.name?.trim()) content.push(boldParagraph(fields.name.trim()))
  if (fields.description?.trim()) content.push(...paragraphsFromText(fields.description))
  const section = (title: string, text?: string): void => {
    if (!text?.trim()) return
    content.push(heading(title))
    content.push(...paragraphsFromText(text))
  }
  section('Déclencheur', fields.trigger)
  section('Règles', fields.rules)
  const metaBits: string[] = []
  if (fields.hours != null) metaBits.push(`Estimation : ${fields.hours} h`)
  if (fields.facet) metaBits.push(`Facette : ${fields.facet}`)
  if (metaBits.length > 0) content.push(...paragraphsFromText(metaBits.join(' — ')))
  section('Notes', fields.notes)
  return { type: 'doc', content }
}

/**
 * Recompose une note API en corps de commentaire — le REPLI de la migration v12→v13, quand la
 * conversion en connexion inline (`apiRefs`) est impossible (cible sans bloc, service manquant) :
 * rien ne doit se perdre. L'endpoint ouvre le document, le reste suit en paragraphes.
 */
export function mergeApiNoteFields(fields: {
  method?: string
  path?: string
  serviceName?: string
  facet?: string | null
  notes?: string
}): RichDoc {
  const content: RichNode[] = []
  const endpoint = [fields.method?.trim(), fields.path?.trim()].filter(Boolean).join(' ')
  const opening = [endpoint, fields.serviceName?.trim()].filter(Boolean).join(' — ')
  if (opening) content.push(boldParagraph(opening))
  if (fields.facet) content.push(...paragraphsFromText(`Facette : ${fields.facet}`))
  if (fields.notes?.trim()) content.push(...paragraphsFromText(fields.notes))
  return { type: 'doc', content }
}

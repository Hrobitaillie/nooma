// markdown → RichDoc : le chemin RETOUR de docToMarkdown (richContent.ts), pour que l'agent écrive
// le contenu riche en markdown (pivot agentique, plan §3.3). Dialecte volontairement BORNÉ, miroir
// exact de ce que docToMarkdown sait émettre : titres #..######, paragraphes (lignes d'un même bloc
// = sauts durs), listes plates - / 1., citation >, bloc de code ```, et les marks gras/italique/
// code/lien/<u>. Pas de nesting de listes, pas de tableaux, pas d'images — ce que le dialecte ne
// connaît pas reste du texte brut (jamais d'erreur). La couleur n'a pas de syntaxe : perdue à
// l'export, inexprimable à l'import — symétrie assumée (richContent.ts §inlineToMarkdown).
import type { RichDoc, RichNode } from './richContent'

type Mark = { type: string; attrs?: Record<string, unknown> }

/** Ajoute une mark en DERNIER (docToMarkdown enveloppe dans l'ordre du tableau : la dernière
 *  mark est la plus externe — c'est ce qui rend le round-trip stable, ex. `**[x](y)**`). */
function pushMark(nodes: RichNode[], mark: Mark): RichNode[] {
  for (const n of nodes) {
    if (typeof n.text === 'string') n.marks = [...((n.marks as Mark[] | undefined) ?? []), mark]
  }
  return nodes
}

interface InlinePattern {
  re: RegExp
  toNodes: (m: RegExpMatchArray) => RichNode[]
}

// Ordre = priorité à index de match égal (le code protège son contenu, ** avant *).
const INLINE_PATTERNS: InlinePattern[] = [
  { re: /`([^`\n]+)`/, toNodes: (m) => [{ type: 'text', text: m[1]!, marks: [{ type: 'code' }] }] },
  { re: /<u>([\s\S]+?)<\/u>/, toNodes: (m) => pushMark(parseInline(m[1]!), { type: 'underline' }) },
  {
    re: /\[([^\]\n]+)\]\(([^)\s]+)\)/,
    toNodes: (m) => pushMark(parseInline(m[1]!), { type: 'link', attrs: { href: m[2]! } }),
  },
  { re: /\*\*([^*\n]+(?:\*[^*\n]+)*)\*\*/, toNodes: (m) => pushMark(parseInline(m[1]!), { type: 'bold' }) },
  { re: /\*([^*\n]+)\*/, toNodes: (m) => pushMark(parseInline(m[1]!), { type: 'italic' }) },
]

/** Texte inline (une ligne, sans saut) → nœuds text avec marks. */
function parseInline(text: string): RichNode[] {
  if (!text) return []
  let earliest: { index: number; pattern: InlinePattern; match: RegExpMatchArray } | null = null
  for (const pattern of INLINE_PATTERNS) {
    const match = pattern.re.exec(text)
    if (match && (earliest === null || match.index! < earliest.index)) {
      earliest = { index: match.index!, pattern, match }
    }
  }
  if (!earliest) return [{ type: 'text', text }]
  const { index, pattern, match } = earliest
  const out: RichNode[] = []
  if (index > 0) out.push({ type: 'text', text: text.slice(0, index) })
  out.push(...pattern.toNodes(match))
  out.push(...parseInline(text.slice(index + match[0].length)))
  return out
}

/** Lignes d'un même bloc → contenu inline avec sauts durs entre lignes. */
function inlineLines(lines: string[]): RichNode[] {
  const out: RichNode[] = []
  lines.forEach((line, i) => {
    out.push(...parseInline(line))
    if (i < lines.length - 1) out.push({ type: 'hardBreak' })
  })
  return out
}

function paragraph(lines: string[]): RichNode {
  return { type: 'paragraph', content: inlineLines(lines) }
}

function listItem(text: string): RichNode {
  return { type: 'listItem', content: [{ type: 'paragraph', content: parseInline(text) }] }
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const BULLET_RE = /^[-*]\s+(.*)$/
const ORDERED_RE = /^\d+[.)]\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const FENCE_RE = /^```/

/**
 * Parse un markdown du dialecte borné en RichDoc. Total : toute entrée produit un document
 * valide (l'inconnu devient paragraphe), une chaîne vide produit le document vide.
 */
export function markdownToDoc(markdown: string): RichDoc {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const content: RichNode[] = []
  let i = 0

  const collectWhile = (test: (line: string) => boolean): string[] => {
    const out: string[] = []
    while (i < lines.length && test(lines[i]!)) out.push(lines[i++]!)
    return out
  }

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i++
      continue
    }

    if (FENCE_RE.test(line)) {
      i++
      const code = collectWhile((l) => !FENCE_RE.test(l))
      if (i < lines.length) i++ // fence fermante
      const text = code.join('\n')
      content.push({ type: 'codeBlock', content: text ? [{ type: 'text', text }] : [] })
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      i++
      content.push({
        type: 'heading',
        attrs: { level: heading[1]!.length },
        content: parseInline(heading[2]!),
      })
      continue
    }

    if (BULLET_RE.test(line)) {
      const items = collectWhile((l) => BULLET_RE.test(l))
      content.push({ type: 'bulletList', content: items.map((l) => listItem(BULLET_RE.exec(l)![1]!)) })
      continue
    }

    if (ORDERED_RE.test(line)) {
      const items = collectWhile((l) => ORDERED_RE.test(l))
      content.push({
        type: 'orderedList',
        content: items.map((l) => listItem(ORDERED_RE.exec(l)![1]!)),
      })
      continue
    }

    if (QUOTE_RE.test(line)) {
      const quoted = collectWhile((l) => QUOTE_RE.test(l))
      content.push({
        type: 'blockquote',
        content: quoted.map((l) => ({ type: 'paragraph', content: parseInline(QUOTE_RE.exec(l)![1]!) })),
      })
      continue
    }

    // Paragraphe : lignes consécutives non vides et non spéciales, sauts durs entre elles.
    const isPlain = (l: string): boolean =>
      l.trim() !== '' &&
      !HEADING_RE.test(l) &&
      !BULLET_RE.test(l) &&
      !ORDERED_RE.test(l) &&
      !QUOTE_RE.test(l) &&
      !FENCE_RE.test(l)
    const block = collectWhile(isPlain)
    if (block.length) content.push(paragraph(block))
  }

  return { type: 'doc', content }
}

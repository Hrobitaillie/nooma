// markdown → RichDoc (chemin retour de docToMarkdown) : le contrat protégé est le ROUND-TRIP —
// tout markdown du dialecte borné doit survivre à md → doc → md à l'identique, et tout RichDoc
// du sous-ensemble borné doit survivre à doc → md → doc (à l'égalité de re-sérialisation près).
// C'est le risque technique n° 1 du pivot agentique (plan §3.3) : on le verrouille ici.
import { describe, it, expect } from 'vitest'
import { markdownToDoc } from '@flooow/core/model/markdown'
import { docToMarkdown, docToPlainText, isEmptyDoc } from '@flooow/core/model/richContent'

/** Round-trip canonique : md → doc → md doit rendre le md inchangé. */
function roundTrip(md: string): void {
  expect(docToMarkdown(markdownToDoc(md))).toBe(md)
}

describe('markdownToDoc — blocs', () => {
  it('chaîne vide → document vide', () => {
    expect(isEmptyDoc(markdownToDoc(''))).toBe(true)
    expect(isEmptyDoc(markdownToDoc('  \n\n'))).toBe(true)
  })

  it('titres, paragraphes, listes, citation, code — round-trip exact', () => {
    roundTrip(
      [
        '## Objectif',
        '',
        'Premier paragraphe.',
        '',
        '- une puce',
        '- une autre',
        '',
        '1. étape un',
        '2. étape deux',
        '',
        '> une citation',
        '',
        '```',
        'GET /devis',
        '```',
      ].join('\n'),
    )
  })

  it('les lignes consécutives d’un paragraphe deviennent des sauts durs (et reviennent)', () => {
    const doc = markdownToDoc('ligne un\nligne deux')
    expect(doc.content?.[0]?.type).toBe('paragraph')
    expect(doc.content?.[0]?.content?.some((n) => n.type === 'hardBreak')).toBe(true)
    roundTrip('ligne un\nligne deux')
  })

  it('ce que le dialecte ne connaît pas reste du texte brut, jamais une erreur', () => {
    const doc = markdownToDoc('| a | b |\n| - | - |')
    expect(docToPlainText(doc)).toContain('| a | b |')
  })
})

describe('markdownToDoc — marks inline', () => {
  it('gras, italique, code, lien, souligné — round-trip exact', () => {
    roundTrip('Du **gras**, de l’*italique*, du `code`, un [lien](https://ex.fr) et du <u>souligné</u>.')
  })

  it('marks imbriquées : lien dans gras et gras dans lien', () => {
    roundTrip('**[docs](https://ex.fr)** et [**fort**](https://ex.fr)')
  })

  it('les marks portent les bons types ProseMirror', () => {
    const doc = markdownToDoc('**gras** et [lien](https://ex.fr)')
    const nodes = doc.content?.[0]?.content ?? []
    expect((nodes[0]?.marks as { type: string }[])?.[0]?.type).toBe('bold')
    const link = nodes.find((n) => n.text === 'lien')
    expect((link?.marks as { type: string; attrs?: { href?: string } }[])?.[0]).toMatchObject({
      type: 'link',
      attrs: { href: 'https://ex.fr' },
    })
  })
})

describe('round-trip doc → md → doc', () => {
  it('un document construit dans le sous-ensemble borné se re-sérialise à l’identique', () => {
    const original = markdownToDoc(
      ['### Règles', '', 'Si **stock épuisé** : masquer le CTA.', '', '- cas `hors périmètre`', '- cas [documenté](https://spec.fr)'].join(
        '\n',
      ),
    )
    const md = docToMarkdown(original)
    expect(docToMarkdown(markdownToDoc(md))).toBe(md)
  })
})

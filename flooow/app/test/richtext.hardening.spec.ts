// Bornage des deux attributs sensibles du contenu riche. Ces invariants sont ce qui rend le v-html
// de RichContent défendable : ils s'appliquent AU RENDU, donc aussi à un document forgé, à un collage
// externe ou à un update Y.Doc d'un pair — aucun de ces chemins ne passe par la validation zod.
import { describe, it, expect } from 'vitest'
import { generateHTML } from '@tiptap/core'
import { normalizeTextColor, TEXT_COLORS } from '@flooow/core/model/richContent'
import { richExtensions, isAllowedLinkUri } from '@/composables/richText'

/** Document minimal : un paragraphe portant `marks` sur son texte. */
function docWithMarks(marks: unknown[]) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks }] }] }
}

describe('isAllowedLinkUri', () => {
  it('accepte http, https et mailto', () => {
    expect(isAllowedLinkUri('https://exemple.fr/a?b=1')).toBe(true)
    expect(isAllowedLinkUri('http://exemple.fr')).toBe(true)
    expect(isAllowedLinkUri('mailto:a@b.fr')).toBe(true)
    expect(isAllowedLinkUri('  https://exemple.fr  ')).toBe(true)
  })

  it('refuse tout le reste — allowlist positive, pas de denylist à contourner', () => {
    for (const uri of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      // Protocoles admis par DÉFAUT par Tiptap, que notre allowlist retire.
      'ftp://x.fr',
      'tel:+33100000000',
      'sms:+33100000000',
      '/relatif',
      '',
    ]) {
      expect(isAllowedLinkUri(uri), uri).toBe(false)
    }
  })
})

describe('normalizeTextColor', () => {
  it('accepte les couleurs de la palette, en hex comme en rgb() (le DOM renvoie du rgb)', () => {
    expect(normalizeTextColor('#7c3aed')).toBe('#7c3aed')
    expect(normalizeTextColor('#7C3AED')).toBe('#7c3aed')
    expect(normalizeTextColor('rgb(124, 58, 237)')).toBe('#7c3aed')
  })

  it('ramène à null toute couleur hors palette', () => {
    for (const v of ['#123456', 'red', 'rgb(1, 2, 3)', 'url(x)', '', null, undefined, 42]) {
      expect(normalizeTextColor(v)).toBeNull()
    }
  })

  it('couvre toute la palette exposée à l’UI', () => {
    for (const c of TEXT_COLORS.filter((c) => c.value)) {
      expect(normalizeTextColor(c.value)).toBe(c.value)
    }
  })
})

describe('rendu HTML (generateHTML → v-html de RichContent)', () => {
  it('rend un lien autorisé', () => {
    const html = generateHTML(docWithMarks([{ type: 'link', attrs: { href: 'https://exemple.fr' } }]) as never, richExtensions)
    expect(html).toContain('href="https://exemple.fr"')
  })

  it('vide le href d’un lien forgé au lieu de l’injecter', () => {
    const html = generateHTML(docWithMarks([{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]) as never, richExtensions)
    expect(html).not.toContain('javascript:')
  })

  it('ignore une couleur forgée hors palette', () => {
    const html = generateHTML(docWithMarks([{ type: 'textStyle', attrs: { color: 'red; position: fixed; inset: 0' } }]) as never, richExtensions)
    expect(html).not.toContain('position')
    expect(html).not.toContain('red')
  })

  it('conserve une couleur de la palette', () => {
    const html = generateHTML(docWithMarks([{ type: 'textStyle', attrs: { color: '#7c3aed' } }]) as never, richExtensions)
    // Le sérialiseur DOM normalise le hex en rgb() — c'est aussi ce que voit `parseHTML`, d'où le
    // support du rgb() dans normalizeTextColor.
    expect(html).toContain('color: rgb(124, 58, 237)')
  })
})

/** Document minimal portant un node inline atomique (mention / lien « # »). */
function docWithNode(node: Record<string, unknown>) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [node] }] }
}

// Ces nodes sont la 3e et 4e voie d'entrée de données non fiables dans le rendu (après href et
// color) : un doc forgé ou un update Y.Doc d'un pair peut y mettre n'importe quoi. Ils n'ajoutent
// aucun attribut navigable au schéma — c'est ce qui maintient l'invariant du v-html.
describe('rendu des mentions et liens « # »', () => {
  it('rend un lien « # » sans aucun href — la cible est un id opaque, pas une URL', () => {
    const html = generateHTML(
      docWithNode({ type: 'refLink', attrs: { refType: 'note', refId: 'abc', label: 'Parcours' } }) as never,
      richExtensions,
    )
    expect(html).toContain('data-ref-id="abc"')
    expect(html).toContain('data-ref-type="note"')
    expect(html).not.toContain('href')
  })

  it('échappe le libellé de repli d’un lien forgé au lieu de l’injecter', () => {
    const html = generateHTML(
      docWithNode({
        type: 'refLink',
        attrs: { refType: 'note', refId: 'x', label: '<img src=x onerror=alert(1)>' },
      }) as never,
      richExtensions,
    )
    // Le libellé est rendu comme TEXTE : il ressort échappé, pas comme une balise. (Il subsiste en
    // clair dans `data-ref-label`, sans effet : un `<` dans un attribut ne crée pas de balise — c'est
    // l'évasion d'attribut qui serait exploitable, cf. le test suivant.)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('ne laisse pas un libellé forgé s’échapper de son attribut', () => {
    // Le payload survit tel quel dans `data-ref-label` — c'est normal, `<`/`>` n'ont pas à être
    // échappés DANS un attribut. Ce qui compte est qu'on ne puisse pas en SORTIR : le guillemet doit
    // être encodé, sinon on injecte un attribut (`onmouseover=…`) et le v-html devient exploitable.
    const html = generateHTML(
      docWithNode({
        type: 'refLink',
        attrs: { refType: 'note', refId: 'x', label: '" onmouseover="alert(1)' },
      }) as never,
      richExtensions,
    )
    expect(html).not.toContain('onmouseover="alert(1)"')
    expect(html).toContain('&quot;')
  })

  it('ramène un type de lien forgé sur une valeur connue', () => {
    const html = generateHTML(
      docWithNode({ type: 'refLink', attrs: { refType: 'javascript:alert(1)', refId: 'x', label: 'L' } }) as never,
      richExtensions,
    )
    expect(html).not.toContain('javascript:')
    expect(html).toContain('data-ref-type="note"') // défaut de l'énuméré
  })

  it('rend une mention sans exposer d’e-mail dans le document', () => {
    const html = generateHTML(
      docWithNode({ type: 'mention', attrs: { userId: 'chloe@pilot-in.com', label: 'Chloé' } }) as never,
      richExtensions,
    )
    // L'id EST l'email (clé de l'annuaire), mais le texte rendu ne doit afficher que le nom : un
    // doc projet est exportable, il n'a pas à trimballer un carnet d'adresses en clair.
    expect(html).toContain('@Chloé')
    expect(html).not.toContain('>chloe@pilot-in.com<')
  })

  it('échappe le nom de repli d’une mention forgée', () => {
    const html = generateHTML(
      docWithNode({ type: 'mention', attrs: { userId: 'x', label: '<script>alert(1)</script>' } }) as never,
      richExtensions,
    )
    // Le nom affiché ressort en texte échappé. (`<script>` subsiste dans la valeur de
    // `data-user-label`, ce qui est sans effet : un `<` dans un attribut ne crée pas de balise.)
    expect(html).toContain('@&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('ne laisse pas un nom forgé s’échapper de son attribut', () => {
    const html = generateHTML(
      docWithNode({ type: 'mention', attrs: { userId: 'x', label: '" onmouseover="alert(1)' } }) as never,
      richExtensions,
    )
    expect(html).not.toContain('onmouseover="alert(1)"')
    expect(html).toContain('&quot;')
  })

  it('conserve les liens et mentions en LECTURE seule (nodes présents dans richExtensions)', () => {
    // Garde-fou de régression : un node absent du schéma de rendu serait silencieusement droppé —
    // les liens disparaîtraient de la carte et de Specs sans le moindre message.
    const html = generateHTML(
      docWithNode({ type: 'refLink', attrs: { refType: 'feature', refId: 'f1', label: 'Connexion' } }) as never,
      richExtensions,
    )
    expect(html).toContain('Connexion')
  })
})

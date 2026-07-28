// v11 → v12 : les pages deviennent un arbre (`parentId`) et ne stockent plus que leur segment
// (`slug`). La parenté est DÉDUITE des arêtes `navigatesTo`, sous double condition — une seule
// arête entrante ET un préfixe de route qui confirme.
//
// Ce qui est réellement en jeu ici, et que chaque cas ci-dessous protège : la migration ne doit
// JAMAIS changer la route effective d'une page. Se tromper de parent, c'est découper un slug sur un
// préfixe qui n'existe pas — et l'erreur se propage à toute la descendance.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { migrate } from '@flooow/core/model/migrations'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { isPage, type PageNode } from '@flooow/core/model/types'
import { fullRouteOf } from '@flooow/core/domain/routes'

interface RawPage {
  id: string
  route: string
}

/** Document v11 minimal : des pages et des arêtes `navigatesTo`. */
function v11(pages: RawPage[], nav: [string, string][] = []): unknown {
  return {
    meta: {
      name: 'T',
      formatVersion: 11,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      pricing: { riskCoeff: 1, dailyRate: null },
      homePageId: pages[0]?.id ?? null,
    },
    site: { attrs: { context: '', constraints: [], notes: '' } },
    services: [],
    featureFields: [],
    featureOptions: [],
    nodes: pages.map((p, i) => ({
      id: p.id,
      type: 'frame',
      kind: 'page',
      parentId: null,
      position: { x: i * 100, y: 0 },
      lot: null,
      attrs: {
        name: p.id,
        route: p.route,
        roles: [],
        description: 'd',
        constraints: [],
        logic: '',
        notes: '',
      },
    })),
    edges: nav.map(([source, target], i) => ({
      id: `e${i}`,
      type: 'navigatesTo',
      source,
      target,
      attrs: {},
    })),
  }
}

function pagesOf(doc: unknown): Map<string, PageNode> {
  const parsed = parseProjectDoc(migrate(doc))
  return new Map(parsed.nodes.filter(isPage).map((p) => [p.id, p]))
}

describe('migration v11 → v12 — dérivation de la parenté', () => {
  it('parente quand la navigation ET le préfixe de route sont d’accord', () => {
    const pages = pagesOf(
      v11(
        [
          { id: 'home', route: '/' },
          { id: 'cat', route: '/catalogue' },
          { id: 'fiche', route: '/catalogue/fiche' },
        ],
        [
          ['home', 'cat'],
          ['cat', 'fiche'],
        ],
      ),
    )
    expect(pages.get('cat')?.parentId).toBe('home')
    expect(pages.get('fiche')?.parentId).toBe('cat')
    expect(pages.get('cat')?.attrs.slug).toBe('catalogue')
    expect(pages.get('fiche')?.attrs.slug).toBe('fiche')
    expect(pages.get('home')?.attrs.slug).toBe('')
  })

  it('ne parente PAS quand le préfixe de route contredit la navigation', () => {
    // Le pied de page renvoie vers /contact depuis les mentions légales : c'est un lien, pas une
    // hiérarchie. Parenter ici fabriquerait le slug « ../contact ».
    const pages = pagesOf(
      v11(
        [
          { id: 'legal', route: '/mentions-legales' },
          { id: 'contact', route: '/contact' },
        ],
        [['legal', 'contact']],
      ),
    )
    expect(pages.get('contact')?.parentId).toBeNull()
    expect(pages.get('contact')?.attrs.slug).toBe('contact')
  })

  it('ne parente PAS une cible visée par plusieurs pages', () => {
    const pages = pagesOf(
      v11(
        [
          { id: 'cat', route: '/catalogue' },
          { id: 'promo', route: '/promo' },
          { id: 'fiche', route: '/catalogue/fiche' },
        ],
        [
          ['cat', 'fiche'],
          ['promo', 'fiche'],
        ],
      ),
    )
    expect(pages.get('fiche')?.parentId).toBeNull()
  })

  it('ne parente PAS un descendant indirect (le maillon intermédiaire manque)', () => {
    const pages = pagesOf(
      v11(
        [
          { id: 'cat', route: '/catalogue' },
          { id: 'variante', route: '/catalogue/fiche/variante' },
        ],
        [['cat', 'variante']],
      ),
    )
    expect(pages.get('variante')?.parentId).toBeNull()
    expect(pages.get('variante')?.attrs.slug).toBe('catalogue/fiche/variante')
  })

  it('conserve TOUTES les arêtes navigatesTo, y compris celles promues en parenté', () => {
    const doc = parseProjectDoc(
      migrate(
        v11(
          [
            { id: 'home', route: '/' },
            { id: 'cat', route: '/catalogue' },
          ],
          [['home', 'cat']],
        ),
      ),
    )
    expect(doc.edges.filter((e) => e.type === 'navigatesTo')).toHaveLength(1)
    expect(doc.nodes.filter(isPage).find((p) => p.id === 'cat')?.parentId).toBe('home')
  })

  it('une racine garde une route multi-segments verbatim, sans normalisation', () => {
    // `route` n'a jamais été contraint : des projets réels y stockent une URL externe. La
    // normaliser (« // » → « / ») corromprait la donnée.
    const pages = pagesOf(
      v11([
        { id: 'admin', route: '/admin/commandes' },
        { id: 'ext', route: 'https://exemple.fr' },
      ]),
    )
    expect(pages.get('admin')?.attrs.slug).toBe('admin/commandes')
    expect(pages.get('ext')?.attrs.slug).toBe('https://exemple.fr')
  })

  it('supprime la clé `route` (le schéma v12 est strict)', () => {
    const pages = pagesOf(v11([{ id: 'home', route: '/' }]))
    expect(pages.get('home')?.attrs).not.toHaveProperty('route')
  })
})

describe('migration v11 → v12 — les routes effectives ne bougent pas', () => {
  // Le seul test qui compte vraiment : sur de vrais projets, la route rendue après migration doit
  // être celle d'avant. Les deux fixtures ci-dessous couvrent les deux régimes — `demo` a des
  // routes hiérarchiques (donc de la parenté dérivée), `reference` a des routes plates (donc
  // aucune, malgré 39 arêtes de navigation formant pourtant un arbre : la topologie seule ne
  // suffit pas, et c'est exactement l'arbitrage voulu).
  for (const fixture of ['demo-project', 'reference-project', 'locasyst-project']) {
    it(`${fixture} — chaque route est préservée`, () => {
      const raw = JSON.parse(readFileSync(`fixtures/${fixture}.flooow.json`, 'utf8')) as {
        nodes: { id: string; kind?: string; attrs: { route?: string } }[]
      }

      const before = new Map<string, string>()
      for (const n of raw.nodes) {
        if (n.kind === 'page') before.set(n.id, n.attrs.route ?? '')
      }

      const doc = parseProjectDoc(migrate(raw))
      const index = new Map(doc.nodes.map((n) => [n.id, n]))

      for (const page of doc.nodes.filter(isPage)) {
        const was = before.get(page.id) ?? ''
        // Une route déjà absolue doit se retrouver identique. Les valeurs qui n'étaient pas des
        // chemins (URL externe, tiret cadratin) sont hors périmètre : le slug les conserve
        // verbatim, mais `fullRouteOf` les préfixe d'un « / » comme n'importe quel segment.
        if (!was.startsWith('/')) continue
        expect(fullRouteOf(page.id, index)).toBe(was.replace(/\/+$/, '') || '/')
      }
    })
  }
})

// Console d'essai des API externes (io/apiTester) : construction d'URL, application
// de l'auth par schéma, parsing des headers, snippet curl et persistance localStorage.
// Le contrat protégé : ce qui PART vers le tiers (URL + headers) est exactement ce que
// l'utilisateur a configuré — une auth mal appliquée ferait échouer tous les essais.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyAuth,
  buildCurl,
  emptyAuth,
  joinUrl,
  loadAuth,
  parseHeaderLines,
  prettyBody,
  saveAuth,
  type PreparedRequest,
} from '@/io/apiTester'

function req(over: Partial<PreparedRequest> = {}): PreparedRequest {
  return { method: 'GET', url: 'https://api.example.com/v2/things', headers: {}, body: null, ...over }
}

describe('joinUrl', () => {
  it('joint base et chemin sans doubler le slash', () => {
    expect(joinUrl('https://api.example.com/v2/', '/things')).toBe('https://api.example.com/v2/things')
    expect(joinUrl('https://api.example.com/v2', 'things')).toBe('https://api.example.com/v2/things')
  })

  it('préserve la query du chemin', () => {
    expect(joinUrl('https://api.example.com/v2/', '/yachts?inventory=raw&language=fr')).toBe(
      'https://api.example.com/v2/yachts?inventory=raw&language=fr',
    )
  })

  it('chemin déjà absolu → pris tel quel', () => {
    expect(joinUrl('https://api.example.com/v2/', 'https://autre.example.com/x')).toBe('https://autre.example.com/x')
  })

  it('base vide → chemin seul ; chemin vide → base seule', () => {
    expect(joinUrl('', '/things')).toBe('/things')
    expect(joinUrl('https://api.example.com/v2/', '')).toBe('https://api.example.com/v2/')
  })
})

describe('applyAuth', () => {
  it('none → requête inchangée', () => {
    const r = req()
    expect(applyAuth(r, emptyAuth())).toEqual(r)
  })

  it('bearer → header Authorization', () => {
    const out = applyAuth(req(), { scheme: 'bearer', name: '', value: 'tok-123' })
    expect(out.headers['Authorization']).toBe('Bearer tok-123')
  })

  it('basic → Authorization: Basic base64(id:mdp)', () => {
    const out = applyAuth(req(), { scheme: 'basic', name: 'alice', value: 's3cret' })
    expect(out.headers['Authorization']).toBe(`Basic ${btoa('alice:s3cret')}`)
  })

  it('header → nom personnalisé, repli X-Api-Key', () => {
    expect(applyAuth(req(), { scheme: 'header', name: 'X-Token', value: 'k' }).headers['X-Token']).toBe('k')
    expect(applyAuth(req(), { scheme: 'header', name: '', value: 'k' }).headers['X-Api-Key']).toBe('k')
  })

  it('query → paramètre ajouté, ? ou & selon l’URL, valeurs encodées', () => {
    expect(applyAuth(req(), { scheme: 'query', name: 'key', value: 'a b' }).url).toBe(
      'https://api.example.com/v2/things?key=a%20b',
    )
    expect(
      applyAuth(req({ url: 'https://api.example.com/v2/things?x=1' }), { scheme: 'query', name: 'key', value: 'v' })
        .url,
    ).toBe('https://api.example.com/v2/things?x=1&key=v')
  })

  it('valeur vide → rien d’appliqué (pas de header Authorization fantôme)', () => {
    expect(applyAuth(req(), { scheme: 'bearer', name: '', value: '' }).headers).toEqual({})
    expect(applyAuth(req(), { scheme: 'query', name: 'k', value: '' }).url).toBe(req().url)
  })

  it('ne mute pas la requête d’origine', () => {
    const r = req()
    applyAuth(r, { scheme: 'bearer', name: '', value: 'tok' })
    expect(r.headers).toEqual({})
  })
})

describe('parseHeaderLines', () => {
  it('une paire par ligne, espaces tolérés, lignes invalides ignorées', () => {
    expect(parseHeaderLines('Accept: application/json\n  X-Foo :  bar \nsans-deux-points\n: vide')).toEqual({
      Accept: 'application/json',
      'X-Foo': 'bar',
    })
  })
})

describe('buildCurl', () => {
  it('méthode, URL, headers et corps, apostrophes échappées', () => {
    const curl = buildCurl(
      req({
        method: 'POST',
        headers: { Authorization: "Bearer l'jeton" },
        body: '{"a":1}',
      }),
    )
    expect(curl).toContain("curl -X POST 'https://api.example.com/v2/things'")
    expect(curl).toContain(`-H 'Authorization: Bearer l'\\''jeton'`)
    expect(curl).toContain(`-d '{"a":1}'`)
  })
})

describe('persistance de l’auth (localStorage)', () => {
  beforeEach(() => localStorage.clear())

  it('round-trip save → load', () => {
    const auth = { scheme: 'header' as const, name: 'X-Key', value: 'v' }
    saveAuth('svc-1', auth)
    expect(loadAuth('svc-1')).toEqual(auth)
  })

  it('service inconnu ou entrée corrompue → auth vide', () => {
    expect(loadAuth('svc-inconnu')).toEqual(emptyAuth())
    localStorage.setItem('flooow.api-auth.svc-2', '{pas du json')
    expect(loadAuth('svc-2')).toEqual(emptyAuth())
    localStorage.setItem('flooow.api-auth.svc-3', JSON.stringify({ scheme: 'exotique', value: 'v' }))
    expect(loadAuth('svc-3')).toEqual(emptyAuth())
  })

  it('auth redevenue vide → entrée retirée du stockage', () => {
    saveAuth('svc-1', { scheme: 'bearer', name: '', value: 'tok' })
    saveAuth('svc-1', emptyAuth())
    expect(localStorage.getItem('flooow.api-auth.svc-1')).toBeNull()
  })
})

describe('prettyBody', () => {
  it('réindente le JSON, laisse le reste intact', () => {
    expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyBody('<html>pas du json</html>')).toBe('<html>pas du json</html>')
    expect(prettyBody('{cassé')).toBe('{cassé')
  })
})

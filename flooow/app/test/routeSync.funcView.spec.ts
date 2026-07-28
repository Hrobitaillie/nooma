import { describe, expect, it } from 'vitest'

import { resolveFuncView } from '../src/composables/useRouteSync'

const MODULES = ['mod-a', 'mod-b']

describe('resolveFuncView — vue par module portée par l’URL', () => {
  it('sans `view`, c’est le plan (seule la valeur non défaut s’écrit dans l’URL)', () => {
    expect(resolveFuncView(null, null, MODULES)).toEqual({ view: 'plan', module: null })
  })

  it('ignore un `module` resté seul dans l’URL', () => {
    expect(resolveFuncView(null, 'mod-a', MODULES)).toEqual({ view: 'plan', module: null })
  })

  it('rejette une valeur de `view` inconnue', () => {
    expect(resolveFuncView('lot', 'mod-a', MODULES)).toEqual({ view: 'plan', module: null })
  })

  it('accepte un module existant', () => {
    expect(resolveFuncView('module', 'mod-b', MODULES)).toEqual({ view: 'module', module: 'mod-b' })
  })

  it('retombe sur le plan pour un module inexistant (lien périmé, mauvais projet)', () => {
    expect(resolveFuncView('module', 'mod-fantome', MODULES)).toEqual({ view: 'plan', module: null })
  })

  it('retombe sur le plan pour une vue par module sans module désigné', () => {
    expect(resolveFuncView('module', null, MODULES)).toEqual({ view: 'plan', module: null })
  })

  it('ne conclut RIEN tant que le projet n’est pas chargé (aucun module connu)', () => {
    // Au montage, le document n'est pas encore arrivé par la session collab : tout id paraîtrait
    // invalide. La demande passe telle quelle, un watcher la révise au premier sync.
    expect(resolveFuncView('module', 'mod-a', [])).toEqual({ view: 'module', module: 'mod-a' })
  })
})

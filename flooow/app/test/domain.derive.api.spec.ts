import { describe, it, expect } from 'vitest'
import { deriveApi } from '@flooow/core/domain/derive/api'
import {
  createEmptyProject,
  createPage,
  createBlock,
  createApiNote,
  createService,
  createFeature,
  createEdge,
} from '@flooow/core/model/factory'
import type { FlooowEdge, FlooowNode, ProjectDoc, Service } from '@flooow/core/model/types'

function doc(nodes: FlooowNode[], services: Service[] = [], edges: FlooowEdge[] = []): ProjectDoc {
  return { ...createEmptyProject(), services, nodes, edges }
}

const page = createPage({ id: 'p', name: 'Panier' })
const block = createBlock({ id: 'blk', parentId: 'p', name: 'Paiement' })

const svcHigh = createService({
  id: 'pay',
  name: 'Paiement',
  baseUrl: 'https://pay.example/api',
  risk: 'high',
  endpoints: [
    { method: 'POST', path: '/pay', notes: '' },
    { method: 'GET', path: '/status', notes: '' },
  ],
})
const svcLow = createService({
  id: 'mail',
  name: 'Mailer',
  baseUrl: 'https://mail.example',
  risk: 'low',
  endpoints: [{ method: 'POST', path: '/send', notes: '' }],
})

// Note API POST /pay rattachée au bloc (page remontée = p).
const notePay = createApiNote({ id: 'n-pay', attachedTo: 'blk', serviceId: 'pay', method: 'POST', path: '/pay' })

const full = doc([page, block, notePay], [svcHigh, svcLow])

describe('deriveApi — par service', () => {
  it('services risk:high en tête, URL de base exposée', () => {
    const api = deriveApi(full)
    expect(api.byService.map((g) => g.service.id)).toEqual(['pay', 'mail'])
    expect(api.byService[0]!.baseUrl).toBe('https://pay.example/api')
  })

  it('endpoint référencé liste ses consommateurs avec page remontée via attachedTo', () => {
    const api = deriveApi(full)
    const payGroup = api.byService.find((g) => g.service.id === 'pay')!
    const usage = payGroup.endpoints.find((u) => u.path === '/pay')!
    expect(usage.method).toBe('POST')
    expect(usage.consumers).toHaveLength(1)
    expect(usage.consumers[0]).toMatchObject({
      noteId: 'n-pay',
      targetId: 'blk',
      targetName: 'Paiement',
      pageId: 'p',
      pageName: 'Panier',
    })
  })

  it('endpoints déclarés jamais référencés listés en unreferencedEndpoints', () => {
    const api = deriveApi(full)
    const payGroup = api.byService.find((g) => g.service.id === 'pay')!
    expect(payGroup.unreferencedEndpoints.map((e) => e.path)).toEqual(['/status'])
    const mailGroup = api.byService.find((g) => g.service.id === 'mail')!
    expect(mailGroup.unreferencedEndpoints.map((e) => e.path)).toEqual(['/send'])
    expect(mailGroup.endpoints).toEqual([])
  })

  it('plusieurs notes sur le même endpoint sont regroupées', () => {
    const note2 = createApiNote({ id: 'n-pay2', attachedTo: 'p', serviceId: 'pay', method: 'POST', path: '/pay' })
    const api = deriveApi(doc([page, block, notePay, note2], [svcHigh]))
    const usage = api.byService[0]!.endpoints.find((u) => u.path === '/pay')!
    expect(usage.consumers.map((c) => c.noteId).sort()).toEqual(['n-pay', 'n-pay2'])
  })
})

describe('deriveApi — fonctionnalités (pont realizedBy)', () => {
  const feat = createFeature({ id: 'f', code: 'PAY-01', name: 'Payer' })
  // La fonctionnalité réalise la page ; l'endpoint est posé sur le bloc de la page.
  const realizes = createEdge({ type: 'realizedBy', source: 'f', target: 'p' })

  it('un consommateur remonte les fonctionnalités réalisées via sa page', () => {
    const api = deriveApi(doc([page, block, notePay, feat], [svcHigh], [realizes]))
    const usage = api.byService[0]!.endpoints.find((u) => u.path === '/pay')!
    expect(usage.consumers[0]!.features).toEqual([{ id: 'f', code: 'PAY-01', name: 'Payer' }])
  })

  it('byFeature regroupe les endpoints consommés par fonctionnalité (dédupliqués)', () => {
    const api = deriveApi(doc([page, block, notePay, feat], [svcHigh], [realizes]))
    expect(api.byFeature.get('f')).toEqual([
      { serviceId: 'pay', serviceName: 'Paiement', method: 'POST', path: '/pay' },
    ])
  })

  it('sans lien realizedBy, aucun rattachement de fonctionnalité', () => {
    const api = deriveApi(doc([page, block, notePay, feat], [svcHigh]))
    expect(api.byService[0]!.endpoints[0]!.consumers[0]!.features).toEqual([])
    expect(api.byFeature.size).toBe(0)
  })
})

describe('deriveApi — vide', () => {
  it('registre vide → vue vide', () => {
    const api = deriveApi(doc([page]))
    expect(api.byService).toEqual([])
  })

  it('service sans note → groupe présent mais sans endpoint référencé', () => {
    const api = deriveApi(doc([page], [svcLow]))
    expect(api.byService.map((g) => g.service.id)).toEqual(['mail'])
    expect(api.byService[0]!.endpoints).toEqual([])
  })
})

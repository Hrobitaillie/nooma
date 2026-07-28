import { describe, it, expect } from 'vitest'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { migrate } from '@flooow/core/model/migrations'
import { checkInvariants } from '@flooow/core/domain/invariants'
import { BLOCK_TYPES } from '@flooow/core/model/types'
import demo from '../fixtures/demo-project.flooow.json'

describe('fixture démo — Portail client B2B', () => {
  it('passe le schéma zod v2 (.strict) après migration', () => {
    expect(() => parseProjectDoc(migrate(demo))).not.toThrow()
  })

  it("ne viole aucun invariant référentiel", () => {
    const doc = parseProjectDoc(migrate(demo))
    expect(checkInvariants(doc)).toEqual([])
  })

  it('montre chaque BlockType au moins une fois', () => {
    const doc = parseProjectDoc(migrate(demo))
    const used = new Set(
      doc.nodes
        .filter((n): n is Extract<typeof n, { kind: 'block' }> => n.type === 'frame' && n.kind === 'block')
        .map((b) => b.attrs.blockType),
    )
    for (const t of BLOCK_TYPES) expect(used.has(t), `type manquant : ${t}`).toBe(true)
  })

  it("expose un homePageId pointant vers une page existante", () => {
    const doc = parseProjectDoc(migrate(demo))
    const home = doc.nodes.find((n) => n.id === doc.meta.homePageId)
    expect(home?.type === 'frame' && home.kind === 'page').toBe(true)
  })
})

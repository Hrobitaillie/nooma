// Commentaires (v13) : actions du store — ancrage obligatoire, fils de réponses, résolution,
// tag custom, cascade à la suppression du nœud ancre, index par élément, undo/redo.
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { parseProjectDoc } from '@flooow/core/model/schema'
import type { RichDoc } from '@flooow/core/model/richContent'

beforeEach(() => {
  setActivePinia(createPinia())
})

function text(t: string): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }
}

describe('project store — commentaires', () => {
  it('addComment ancre sur une page ou un bloc et sérialise un document valide', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const id = p.addComment({ anchor: { nodeId: page }, body: text('à revoir'), author: 'Hugo' })
    expect(id).toBeTruthy()
    expect(p.comments).toHaveLength(1)
    expect(p.comments[0]!.author).toBe('Hugo')
    expect(p.comments[0]!.resolved).toBe(false)
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
  })

  it("refuse une ancre qui n'est pas une page/bloc existant", () => {
    const p = useProjectStore()
    expect(p.addComment({ anchor: { nodeId: 'fantome' } })).toBeNull()
    const mod = p.addModule({ name: 'M' })
    expect(p.addComment({ anchor: { nodeId: mod } })).toBeNull() // module : pas une cible
    expect(p.comments).toHaveLength(0)
  })

  it('accepte une ancre de passage (range) sur un bloc', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const block = p.addBlock(page, 'hero')
    const id = p.addComment({
      anchor: { nodeId: block, range: { from: 2, to: 10, text: 'passage' } },
    })
    expect(id).toBeTruthy()
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
  })

  it('replyToComment ajoute au fil ; resolveComment bascule ; setCommentTag pose et retire', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const id = p.addComment({ anchor: { nodeId: page }, author: 'Hugo' })!
    const replyId = p.replyToComment(id, text('vu'), 'Léa')
    expect(replyId).toBeTruthy()
    expect(p.comments[0]!.replies.map((r) => r.author)).toEqual(['Léa'])

    p.resolveComment(id)
    expect(p.comments[0]!.resolved).toBe(true)
    p.resolveComment(id, false)
    expect(p.comments[0]!.resolved).toBe(false)

    p.setCommentTag(id, { label: 'Wording', color: '#7c3aed' })
    expect(p.comments[0]!.tag).toEqual({ label: 'Wording', color: '#7c3aed' })
    p.setCommentTag(id, null)
    expect('tag' in p.comments[0]!).toBe(false)
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
  })

  it('supprimer le nœud ancre emporte ses commentaires (page → blocs compris)', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const block = p.addBlock(page, 'hero')
    const autre = p.addPage({ name: 'Autre' })
    p.addComment({ anchor: { nodeId: block } })
    p.addComment({ anchor: { nodeId: page } })
    const survivant = p.addComment({ anchor: { nodeId: autre } })
    p.removeNode(page)
    expect(p.comments.map((c) => c.id)).toEqual([survivant])
  })

  it('commentsOf / openCommentCountOf : index par élément, comptage page + blocs, résolus exclus', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const block = p.addBlock(page, 'hero')
    const c1 = p.addComment({ anchor: { nodeId: page } })!
    p.addComment({ anchor: { nodeId: block } })
    expect(p.commentsOf(page).map((c) => c.id)).toEqual([c1])
    expect(p.openCommentCountOf(page)).toBe(2) // la page ET son bloc
    p.resolveComment(c1)
    expect(p.openCommentCountOf(page)).toBe(1)
  })

  it('undo/redo couvre les mutations de commentaires (elles passent par commit)', () => {
    const p = useProjectStore()
    const h = useHistoryStore()
    const page = p.addPage({ name: 'P' })
    p.addComment({ anchor: { nodeId: page } })
    expect(p.comments).toHaveLength(1)
    h.undo()
    expect(p.comments).toHaveLength(0)
    h.redo()
    expect(p.comments).toHaveLength(1)
  })

  it('removeCommentReply ne retire que la réponse visée ; removeComment emporte le fil', () => {
    const p = useProjectStore()
    const page = p.addPage({ name: 'P' })
    const id = p.addComment({ anchor: { nodeId: page } })!
    const r1 = p.replyToComment(id, text('a'), 'X')!
    p.replyToComment(id, text('b'), 'Y')
    p.removeCommentReply(id, r1)
    expect(p.comments[0]!.replies.map((r) => r.author)).toEqual(['Y'])
    p.removeComment(id)
    expect(p.comments).toHaveLength(0)
  })
})

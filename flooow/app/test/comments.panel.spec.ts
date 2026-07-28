// CommentsPanel (v13) : les trois règles anti-étroitesse côté état (largeur bornée + mémoire
// locale), le pli (un seul fil actif), les filtres, le focus croisé, et les mutations accessibles
// depuis le panneau. Les composeurs RichEditor (Tiptap) ne sont pas exercés ici — trop lourds en
// jsdom — mais tout ce qui pilote la scène l'est.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CommentsPanel from '@/panels/CommentsPanel.vue'
import CommentComposer from '@/panels/CommentComposer.vue'
import RichEditor from '@/panels/RichEditor.vue'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
})

/** Projet minimal : une page + un bloc, identité qui peut écrire. */
function setup(): { project: ReturnType<typeof useProjectStore>; ui: ReturnType<typeof useUiStore>; page: string; block: string } {
  const project = useProjectStore()
  const ui = useUiStore()
  const session = useSessionStore()
  session.identity = {
    id: 'u1',
    name: 'Hugo',
    email: null,
    role: 'dev',
    avatar: null,
    canWrite: true,
    authenticated: true,
  }
  const page = project.addPage({ name: 'Accueil' })
  const block = project.addBlock(page, 'hero')
  return { project, ui, page, block }
}

// Le panneau monte des RichEditor (Tiptap) dans le fil actif : on les remplace par des stubs — le
// spec teste le panneau, pas l'éditeur.
const stubs = { RichEditor: true, RichContent: true }

describe('ui store — panneau de commentaires', () => {
  it('borne la largeur au plancher 320 px et au plafond 50 % écran, et la mémorise', () => {
    const ui = useUiStore()
    ui.setCommentsPanelWidth(100)
    expect(ui.commentsPanelWidth).toBe(320) // règle 1 : jamais sous le plancher
    ui.setCommentsPanelWidth(window.innerWidth) // au-delà du plafond
    expect(ui.commentsPanelWidth).toBeLessThanOrEqual(Math.max(window.innerWidth / 2, 320))
    ui.setCommentsPanelWidth(420)
    expect(window.localStorage.getItem('flooow:comments-panel:width')).toBe('420')
  })

  it('toggleCommentsPanel referme ET désactive le fil ; setActiveComment ouvre le panneau', () => {
    const ui = useUiStore()
    ui.setActiveComment('c1')
    expect(ui.commentsPanelOpen).toBe(true)
    expect(ui.activeCommentId).toBe('c1')
    ui.toggleCommentsPanel(false)
    expect(ui.activeCommentId).toBeNull()
  })
})

describe('CommentsPanel — liste, pli, filtres', () => {
  it('liste les fils, le fil ACTIF seul est déplié (les autres clampés en extrait)', async () => {
    const { project, ui, page, block } = setup()
    const c1 = project.addComment({ anchor: { nodeId: page }, author: 'Hugo' })!
    project.addComment({ anchor: { nodeId: block }, author: 'Léa' })
    ui.toggleCommentsPanel(true)
    const w = mount(CommentsPanel, { global: { stubs } })
    expect(w.findAll('article.thread')).toHaveLength(2)
    // Aucun fil actif : deux extraits riches clampés, aucun composer.
    expect(w.findAll('.excerpt')).toHaveLength(2)
    ui.setActiveComment(c1)
    await w.vm.$nextTick()
    expect(w.findAll('.excerpt')).toHaveLength(1) // seul l'inactif reste clampé
  })

  it('filtres : « Ouverts » exclut les résolus, « Résolus » l\'inverse, tag custom filtrable', async () => {
    const { project, page } = setup()
    const c1 = project.addComment({ anchor: { nodeId: page } })!
    project.addComment({ anchor: { nodeId: page }, tag: { label: 'Wording', color: '#7c3aed' } })
    project.resolveComment(c1)
    const w = mount(CommentsPanel, { global: { stubs } })
    expect(w.findAll('article.thread')).toHaveLength(1) // défaut « Ouverts »
    await w.find('button.chip:nth-child(2)').trigger('click') // « Résolus »
    expect(w.findAll('article.thread')).toHaveLength(1)
    const wording = w.findAll('button.chip').find((b) => b.text() === 'Wording')!
    await wording.trigger('click')
    expect(w.findAll('article.thread')).toHaveLength(1)
  })

  it('filtre « ✳ Claude » : seuls les fils forClaude', async () => {
    const { project, page } = setup()
    project.addComment({ anchor: { nodeId: page } })
    project.addComment({ anchor: { nodeId: page }, forClaude: true })
    const w = mount(CommentsPanel, { global: { stubs } })
    const claude = w.findAll('button.chip').find((b) => b.text().includes('Claude'))!
    await claude.trigger('click')
    expect(w.findAll('article.thread')).toHaveLength(1)
  })

  it("l'ancre affichée est « Page › Bloc », et « Élément supprimé » si la cible a disparu", () => {
    const { project, ui, page, block } = setup()
    project.addComment({ anchor: { nodeId: block } })
    const w = mount(CommentsPanel, { global: { stubs } })
    expect(w.text()).toContain('Accueil › ')
    // Suppression HORS cascade (suppression directe de la Map) : le fil reste, l'ancre est morte.
    project.nodes.delete(page)
    project.nodes.delete(block)
    void ui
    const w2 = mount(CommentsPanel, { global: { stubs } })
    expect(w2.text()).toContain('Élément supprimé')
  })
})

describe('CommentsPanel — focus croisé et actions', () => {
  it('cliquer un fil active le fil et centre son élément (focusNode)', async () => {
    const { project, ui, page } = setup()
    const c1 = project.addComment({ anchor: { nodeId: page } })!
    const w = mount(CommentsPanel, { global: { stubs } })
    const spy = vi.spyOn(ui, 'focusNode')
    await w.find('article.thread button').trigger('click')
    expect(ui.activeCommentId).toBe(c1)
    expect(spy).toHaveBeenCalledWith(page)
  })

  it("sélectionner un élément commenté sur le canvas active son premier fil OUVERT", async () => {
    const { project, ui, page, block } = setup()
    const resolved = project.addComment({ anchor: { nodeId: block } })!
    project.resolveComment(resolved)
    const open = project.addComment({ anchor: { nodeId: block } })!
    ui.toggleCommentsPanel(true)
    const w = mount(CommentsPanel, { global: { stubs } })
    ui.select(block)
    await w.vm.$nextTick()
    expect(ui.activeCommentId).toBe(open)
    void page
  })

  it('résoudre depuis le panneau bascule le fil (bouton du fil actif)', async () => {
    const { project, ui, page } = setup()
    const c1 = project.addComment({ anchor: { nodeId: page } })!
    ui.setActiveComment(c1)
    const w = mount(CommentsPanel, { global: { stubs } })
    const resolve = w.findAll('button').find((b) => b.text().includes('Résoudre'))!
    await resolve.trigger('click')
    expect(project.comments[0]!.resolved).toBe(true)
  })

  it('Échap referme le panneau', async () => {
    const { ui } = setup()
    ui.toggleCommentsPanel(true)
    mount(CommentsPanel, { attachTo: document.body, global: { stubs } })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ui.commentsPanelOpen).toBe(false)
  })
})

describe('CommentsPanel — restriction « pour Claude » (membres Pilot\'in)', () => {
  function setupWithClaudeThread(role: 'dev' | 'client') {
    const project = useProjectStore()
    const ui = useUiStore()
    const session = useSessionStore()
    // Le fil ✳ est créé par un MEMBRE (dev) — puis on bascule l'identité pour le test.
    session.identity = { id: 'u1', name: 'Hugo', email: null, role: 'dev', avatar: null, canWrite: true, authenticated: true }
    const page = project.addPage({ name: 'Accueil' })
    const claudeId = project.addComment({ anchor: { nodeId: page }, forClaude: true })!
    const normalId = project.addComment({ anchor: { nodeId: page } })!
    session.identity = {
      id: 'u2',
      name: role === 'client' ? 'Client' : 'Hugo',
      email: null,
      role,
      avatar: null,
      canWrite: role !== 'client',
      authenticated: true,
    }
    return { project, ui, page, claudeId, normalId }
  }

  it('un client ne voit NI les fils forClaude, NI le filtre ✳, NI leur compte', () => {
    const { project } = setupWithClaudeThread('client')
    expect(project.visibleComments.map((c) => c.forClaude ?? false)).toEqual([false])
    const w = mount(CommentsPanel, { global: { stubs } })
    expect(w.findAll('article.thread')).toHaveLength(1)
    expect(w.findAll('button.chip').some((b) => b.text().includes('Claude'))).toBe(false)
  })

  it('un membre voit les fils forClaude (badge ✳) et le filtre', () => {
    const { project } = setupWithClaudeThread('dev')
    expect(project.visibleComments).toHaveLength(2)
    const w = mount(CommentsPanel, { global: { stubs } })
    expect(w.findAll('article.thread')).toHaveLength(2)
    expect(w.findAll('button.chip').some((b) => b.text().includes('Claude'))).toBe(true)
  })

  it('un client ne peut pas créer un fil forClaude ni adresser un fil à Claude', () => {
    const { project, normalId } = setupWithClaudeThread('client')
    const page2 = project.addPage({ name: 'Autre' })
    expect(project.addComment({ anchor: { nodeId: page2 }, forClaude: true })).toBeNull()
    project.setCommentForClaude(normalId, true)
    expect(project.comments.find((c) => c.id === normalId)!.forClaude).toBeUndefined()
  })

  it('un membre peut adresser/désadresser un fil à Claude', () => {
    const { project, ui, normalId } = setupWithClaudeThread('dev')
    project.setCommentForClaude(normalId, true)
    expect(project.comments.find((c) => c.id === normalId)!.forClaude).toBe(true)
    project.setCommentForClaude(normalId, false)
    expect('forClaude' in project.comments.find((c) => c.id === normalId)!).toBe(false)
    void ui
  })

  it('le comptage du canvas (openCommentCountOf) exclut les fils forClaude pour un client', () => {
    const { project, page } = setupWithClaudeThread('client')
    expect(project.openCommentCountOf(page)).toBe(1) // pas 2
  })
})

describe('CommentComposer — popup de création ancrée (retours 22/07)', () => {
  it('affiche cible, passage visé, tag et les deux boutons pour un membre', () => {
    const { page } = setup()
    const w = mount(CommentComposer, {
      props: { nodeId: page, range: { from: 2, to: 10, text: 'un passage' } },
      global: { stubs },
    })
    expect(w.text()).toContain('Commenter « Accueil »')
    expect(w.text()).toContain('un passage')
    expect(w.find('input[list="composer-known-tags"]').exists()).toBe(true)
    const labels = w.findAll('footer button').map((b) => b.text())
    expect(labels).toContain('Commenter')
    expect(labels.some((l) => l.includes('Envoyer à Claude'))).toBe(true)
  })

  it('ne propose pas « Envoyer à Claude » à un rôle client', () => {
    const { page } = setup()
    const session = useSessionStore()
    session.identity = { ...session.identity!, role: 'client', canWrite: false }
    const w = mount(CommentComposer, { props: { nodeId: page }, global: { stubs } })
    expect(w.findAll('footer button').map((b) => b.text()).some((l) => l.includes('Claude'))).toBe(false)
  })

  it("fermer sans envoyer n'écrit rien dans le document", async () => {
    const { project, page } = setup()
    const w = mount(CommentComposer, { props: { nodeId: page }, global: { stubs } })
    await w.find('header button').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
    expect(project.comments).toHaveLength(0)
  })
})

describe('RichEditor — surlignage des passages commentés en ÉDITION (retours 22/07)', () => {
  it('décore la première occurrence du passage, et suit un changement de liste', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Avant le passage cité après.' }] },
      ],
    }
    const w = mount(RichEditor, {
      props: { modelValue: doc, variant: 'card' as const, highlights: ['passage cité'] },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 50)) // l'éditeur Tiptap se monte en asynchrone
    expect(w.element.querySelectorAll('.comment-hl')).toHaveLength(1)
    expect(w.element.querySelector('.comment-hl')?.textContent).toBe('passage cité')
    // Fil résolu → la liste se vide → le surlignage tombe.
    await w.setProps({ highlights: [] })
    await new Promise((r) => setTimeout(r, 20))
    expect(w.element.querySelectorAll('.comment-hl')).toHaveLength(0)
    w.unmount()
  })
})

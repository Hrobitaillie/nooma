import { describe, it, expect } from 'vitest'
import { reachablePages, orphanPages } from '@flooow/core/domain/reachability'
import { createEmptyProject, createPage, createEdge } from '@flooow/core/model/factory'
import type { FlooowEdge, FlooowNode, ProjectDoc } from '@flooow/core/model/types'

function doc(nodes: FlooowNode[], edges: FlooowEdge[], homePageId: string | null): ProjectDoc {
  const base = createEmptyProject()
  return { ...base, meta: { ...base.meta, homePageId }, nodes, edges }
}

const home = createPage({ id: 'home' })
const about = createPage({ id: 'about' })
const contact = createPage({ id: 'contact' })
const lost = createPage({ id: 'lost' })

function nav(source: string, target: string): FlooowEdge {
  return createEdge({ type: 'navigatesTo', source, target })
}

describe('reachability — reachablePages', () => {
  it('homePageId null → aucune page atteignable', () => {
    expect(reachablePages(doc([home, about], [], null)).size).toBe(0)
  })

  it('la home est atteignable depuis elle-même', () => {
    expect([...reachablePages(doc([home], [], 'home'))]).toEqual(['home'])
  })

  it('BFS suit les arêtes navigatesTo (chaîne transitive)', () => {
    const d = doc([home, about, contact], [nav('home', 'about'), nav('about', 'contact')], 'home')
    expect([...reachablePages(d)].sort()).toEqual(['about', 'contact', 'home'])
  })

  it('ignore les autres types d’arêtes', () => {
    const dep = createEdge({ type: 'dependsOn', source: 'home', target: 'about' })
    expect([...reachablePages(doc([home, about], [dep], 'home'))]).toEqual(['home'])
  })

  it('homePageId inexistant → ensemble vide', () => {
    expect(reachablePages(doc([about], [], 'ghost')).size).toBe(0)
  })

  it('résiste aux cycles de navigation', () => {
    const d = doc([home, about], [nav('home', 'about'), nav('about', 'home')], 'home')
    expect([...reachablePages(d)].sort()).toEqual(['about', 'home'])
  })
})

describe('reachability — orphanPages', () => {
  it('homePageId null → aucune orpheline signalée', () => {
    expect(orphanPages(doc([home, lost], [], null)).size).toBe(0)
  })

  it('pages non reliées à la navigation → orphelines', () => {
    const d = doc([home, about, lost], [nav('home', 'about')], 'home')
    expect([...orphanPages(d)]).toEqual(['lost'])
  })

  it('toutes reliées → aucune orpheline', () => {
    const d = doc([home, about], [nav('home', 'about')], 'home')
    expect(orphanPages(d).size).toBe(0)
  })

  it('la home n’est jamais orpheline', () => {
    const d = doc([home, lost], [], 'home')
    expect(orphanPages(d).has('home')).toBe(false)
    expect(orphanPages(d).has('lost')).toBe(true)
  })
})

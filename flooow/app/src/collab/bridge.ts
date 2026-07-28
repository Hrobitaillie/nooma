// Pont temps réel Y.Doc ⇄ store Pinia (jalon 6). Le Y.Doc (synchronisé par Hocuspocus)
// est la source de vérité PARTAGÉE ; le store en est la projection réactive locale.
//
// Anti-echo (le point délicat) :
//   • Y.Doc → store : `afterTransaction` ; on ignore les transactions d'origine LOCAL_ORIGIN
//     (ce sont NOS propres pushs). Sinon (seed serveur / édition d'un pair) → applyRemote.
//   • store → Y.Doc : watch(graphVersion, …, { flush:'sync' }) ; on diffe le ProjectDoc vers
//     le Y.Doc en transaction LOCAL_ORIGIN. `flush:'sync'` est OBLIGATOIRE : quand applyRemote
//     bump graphVersion, le watch doit s'exécuter SYNCHRONEMENT pendant que `applyingRemote`
//     est vrai → il saute le push (pas de renvoi vers le Y.Doc). Pas de boucle.
import { ref, watch, type Ref } from 'vue'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type { ProjectDoc } from '@flooow/core/model/types'
import { yDocToProjectDoc, applyDiffToYDoc, isYDocEmpty, LOCAL_ORIGIN } from '@flooow/core/collab/ydoc'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { useFeatureEditor } from '@/composables/useFeatureEditor'

/** Vrai tant qu'une session collab est active (éditeur d'un fichier serveur). */
const _active = ref(false)
export function isCollabActive(): boolean {
  return _active.value
}

// Session courante en singleton module : les composants profonds (FlowCanvas, nodes)
// y accèdent sans prop-drilling à travers le <component :is> dynamique d'EditorView.
let _current: CollabSession | null = null
export function currentCollab(): CollabSession | null {
  return _current
}

// ── Présence (awareness) ───────────────────────────────────────────────────────
export interface PresenceUser {
  id: string
  name: string
  email: string | null
  avatar: string | null
  color: string
}
/** Ce qui est réellement publié dans l'awareness : la couleur est dérivée à la lecture. */
type PublishedUser = Omit<PresenceUser, 'color'>
/** Vue courante d'un pair : mode d'app + couche canvas (les curseurs ne se montrent qu'à couche égale). */
export interface PeerView {
  mode: string
  layer: string
}
/** Contenu en cours d'édition par un pair (éditeur de fonctionnalité, champs des specs…). */
export interface PeerEditing {
  /** Id de la cible : id de nœud, ou clé synthétique (`site:context`…). */
  id: string
  /** Libellé humain pour les tooltips (« la fonctionnalité « Recherche » »…). */
  label: string
}
export interface Peer {
  /** clientID d'awareness : UNIQUE par connexion = par onglet (un user à 3 onglets = 3 pairs). */
  clientId: number
  isSelf: boolean
  user: PresenceUser
  /** Position du curseur en coordonnées MONDE du canvas (ou null). */
  cursor: { x: number; y: number } | null
  /** Ids des nœuds sélectionnés par ce pair sur le canvas. */
  selection: string[]
  view: PeerView | null
  editing: PeerEditing | null
}

// Couleur déterministe par CONNEXION (clientId awareness) : chaque onglet a la sienne,
// identique chez tous les clients (le clientId est partagé). Calculée à la lecture
// (refreshPeers), jamais publiée.
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#0ea5e9',
]
function colorForClient(clientId: number): string {
  return PALETTE[clientId % PALETTE.length] as string
}

export interface CollabSession {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  /** true quand la socket est connectée. */
  connected: Ref<boolean>
  /** true après la première synchro (état initial reçu du serveur). */
  synced: Ref<boolean>
  /** Pairs connectés (self inclus), une entrée par onglet. */
  peers: Ref<Peer[]>
  /** Publie la position du curseur local (coordonnées monde) ; null pour l'effacer. */
  setCursor: (pos: { x: number; y: number } | null) => void
  /** Publie les ids des nœuds sélectionnés localement (déjà branché sur le store ui). */
  setSelection: (ids: string[]) => void
  /** Publie le contenu en cours d'édition locale (null = plus d'édition). */
  setEditing: (editing: PeerEditing | null) => void
  destroy: () => void
}

/** URL du endpoint collab, même origin (wss:// derrière https, ws:// en local). */
function collabUrl(): string {
  return `${window.location.origin.replace(/^http/, 'ws')}/collab`
}

export function startCollab(folder: string, file: string): CollabSession {
  const project = useProjectStore()
  const session = useSessionStore()
  const ui = useUiStore()
  const ydoc = new Y.Doc()
  const connected = ref(false)
  const synced = ref(false)
  const peers = ref<Peer[]>([])

  let applyingRemote = false
  let lastSynced: ProjectDoc | null = null

  /** Reprojette l'état courant du Y.Doc dans le store (garde anti-echo actif). */
  function pullFromYDoc(): void {
    if (isYDocEmpty(ydoc)) return // rien à projeter (document pas encore seedé)
    applyingRemote = true
    try {
      const pd = yDocToProjectDoc(ydoc)
      project.applyRemote(pd)
      lastSynced = pd
    } finally {
      applyingRemote = false
    }
  }

  const provider = new HocuspocusProvider({
    url: collabUrl(),
    name: `${folder}/${file}`,
    document: ydoc,
    onStatus: ({ status }) => {
      connected.value = status === 'connected'
    },
    onSynced: () => {
      synced.value = true
      pullFromYDoc() // filet : s'assure que l'état initial est bien projeté
    },
    onDisconnect: () => {
      connected.value = false
    },
  })

  // Y.Doc → store : toute transaction non-locale (seed, édition distante).
  const onAfter = (tr: Y.Transaction): void => {
    if (tr.origin === LOCAL_ORIGIN) return
    pullFromYDoc()
  }
  ydoc.on('afterTransaction', onAfter)

  // store → Y.Doc : diff à chaque mutation locale. flush:'sync' impératif (cf. en-tête).
  const stopWatch = watch(
    () => project.graphVersion,
    () => {
      if (applyingRemote) {
        // Mutation provoquée par une projection distante → ne PAS re-pousser.
        lastSynced = project.serialize()
        return
      }
      const next = project.serialize()
      applyDiffToYDoc(ydoc, lastSynced, next, LOCAL_ORIGIN)
      lastSynced = next
      // Le changement est poussé dans le Y.Doc (synchro + persistance serveur) → « à jour ».
      project.markSaved()
    },
    { flush: 'sync' },
  )

  // ── Awareness : présence (self + pairs) et curseurs ──────────────────────────
  const awareness = provider.awareness as NonNullable<typeof provider.awareness>

  /**
   * Avatar Gravatar best-effort dérivé de l'email (SHA-256). `d=404` → si l'adresse n'a
   * pas de compte Gravatar, l'<img> échoue et PresenceBubbles retombe sur les initiales.
   * L'avatar AuthCrunch (claim Google `picture`), s'il arrive un jour en header, reste
   * PRIORITAIRE — celui-ci ne sert que de repli.
   */
  async function gravatarUrl(email: string): Promise<string> {
    const bytes = new TextEncoder().encode(email.trim().toLowerCase())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `https://gravatar.com/avatar/${hex}?d=404&s=64`
  }

  async function publishLocalUser(): Promise<void> {
    const idt = session.identity
    let avatar = idt?.avatar ?? null
    if (!avatar && idt?.email) avatar = await gravatarUrl(idt.email)
    const user: PublishedUser = {
      id: idt?.id ?? 'anonyme',
      name: idt?.name ?? 'Utilisateur',
      email: idt?.email ?? null,
      avatar,
    }
    awareness.setLocalStateField('user', user)
  }

  function refreshPeers(): void {
    const list: Peer[] = []
    awareness.getStates().forEach((state, clientId) => {
      const st = state as {
        user?: PublishedUser
        cursor?: { x: number; y: number } | null
        selection?: string[]
        view?: PeerView | null
        editing?: PeerEditing | null
      }
      if (!st.user) return
      list.push({
        clientId,
        isSelf: clientId === awareness.clientID,
        user: { ...st.user, color: colorForClient(clientId) },
        cursor: st.cursor ?? null,
        selection: st.selection ?? [],
        view: st.view ?? null,
        editing: st.editing ?? null,
      })
    })
    peers.value = list
  }

  // Publication asynchrone (hash Gravatar) : rafraîchit la liste locale une fois posée.
  void publishLocalUser().then(refreshPeers)
  // Si l'identité arrive après coup (session pas encore chargée), republie.
  const stopUserWatch = watch(() => session.identity, () => {
    void publishLocalUser().then(refreshPeers)
  })
  // Perf : les publications LOCALES à haute fréquence (curseur à ~30 Hz) ne doivent pas
  // reconstruire `peers` — personne ne consomme son propre curseur. On ignore donc les
  // changements ne touchant que self ; les publications locales qui comptent (user,
  // sélection, vue, édition) appellent refreshPeers() explicitement.
  const onAwarenessChange = (diff: { added: number[]; updated: number[]; removed: number[] }): void => {
    const changed = [...diff.added, ...diff.updated, ...diff.removed]
    if (changed.length === 1 && changed[0] === awareness.clientID) return
    refreshPeers()
  }
  awareness.on('change', onAwarenessChange)
  refreshPeers()

  function setCursor(pos: { x: number; y: number } | null): void {
    awareness.setLocalStateField('cursor', pos)
  }

  function setSelection(ids: string[]): void {
    awareness.setLocalStateField('selection', ids)
    refreshPeers()
  }

  function setEditing(editing: PeerEditing | null): void {
    awareness.setLocalStateField('editing', editing)
    refreshPeers()
  }

  // La sélection locale (store ui, source de vérité canvas) est publiée automatiquement.
  const stopSelectionWatch = watch(
    () => ui.selectedIds,
    (ids) => setSelection(ids),
    { immediate: true },
  )

  // La vue courante (mode + couche canvas) est publiée automatiquement : elle scope les
  // curseurs (couche égale seulement) et alimente les tooltips de présence.
  const stopViewWatch = watch(
    () => [ui.mode, ui.canvasLayer] as const,
    ([mode, layer]) => {
      awareness.setLocalStateField('view', { mode, layer } satisfies PeerView)
      refreshPeers()
    },
    { immediate: true },
  )

  // L'éditeur de fonctionnalité (Tiptap) est entièrement dérivé des stores → publication
  // automatique ici. Les éditions DOM (champs des specs) publient elles-mêmes via setEditing.
  const featureEditor = useFeatureEditor()
  const stopEditingWatch = watch(
    featureEditor.featureId,
    (id) => {
      if (!id) {
        setEditing(null)
        return
      }
      const n = project.nodeById(id) as { attrs?: { name?: string } } | undefined
      setEditing({ id, label: `« ${n?.attrs?.name || 'fonctionnalité'} »` })
    },
    { immediate: true },
  )

  _active.value = true

  function destroy(): void {
    stopWatch()
    stopUserWatch()
    stopSelectionWatch()
    stopViewWatch()
    stopEditingWatch()
    awareness.off('change', onAwarenessChange)
    awareness.setLocalState(null) // retire self de la présence des pairs
    ydoc.off('afterTransaction', onAfter)
    provider.destroy()
    ydoc.destroy()
    _active.value = false
    _current = null
  }

  const collab: CollabSession = {
    ydoc,
    provider,
    connected,
    synced,
    peers,
    setCursor,
    setSelection,
    setEditing,
    destroy,
  }
  _current = collab
  return collab
}

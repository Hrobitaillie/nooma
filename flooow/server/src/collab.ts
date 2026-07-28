// Temps réel Yjs via Hocuspocus, embarqué dans le serveur http Hono (partage le port).
// Une « room » = un fichier projet (documentName = "<dossier>/<fichier>").
//
//  - onLoadDocument  : seed le Y.Doc depuis le .flooow.json (1er ouvreur).
//  - onStoreDocument : Y.Doc → ProjectDoc → validation core → écriture atomique (debounce).
//  - onConnect       : lit les headers AuthCrunch → readOnly si rôle client.
//
// Le mapping Y.Doc ⇄ ProjectDoc vit dans @flooow/core (partagé avec le front).
import type { Server as HttpServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import type { Doc as YDoc } from 'yjs'
import { seedYDoc, yDocToProjectDoc } from '@flooow/core/collab/ydoc'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { migrate } from '@flooow/core/model/migrations'
import { checkInvariants } from '@flooow/core/domain/invariants'
import { readFileRaw, writeFile, HttpError } from './files.js'
import { identityFromHeaders, canWrite, type HeaderGetter } from './auth.js'

export const COLLAB_PATH = '/collab'

/**
 * Accès uniforme aux headers : selon le chemin, Hocuspocus fournit soit un `Headers`
 * WHATWG (.get), soit l'objet plain d'IncomingMessage (clés minuscules, valeurs
 * string | string[]). On supporte les deux.
 */
function headerGetter(h: unknown): HeaderGetter {
  if (h && typeof (h as Headers).get === 'function') return (n) => (h as Headers).get(n)
  const obj = (h ?? {}) as Record<string, string | string[] | undefined>
  return (n) => {
    const v = obj[n.toLowerCase()]
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  }
}

/** documentName = "<dossier>/<fichier>". Renvoie null si mal formé. */
function parseDocName(documentName: string): { folder: string; file: string } | null {
  const parts = documentName.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { folder: parts[0], file: parts[1] }
}

/** Instance partagée : le WS /collab ET les ops agent (agent.ts, via openDirectConnection)
 *  passent par elle — c'est ce qui garantit un chemin d'écriture UNIQUE vers le Y.Doc. */
export const hocuspocus = new Hocuspocus({
  quiet: true,
  // Persistance debouncée : au repos 1,5 s après la dernière frappe, au plus tard 5 s.
  debounce: 1500,
  maxDebounce: 5000,

  async onConnect({ requestHeaders, connectionConfig }) {
    const identity = identityFromHeaders(headerGetter(requestHeaders))
    if (!canWrite(identity)) connectionConfig.readOnly = true
    console.log(
      `[collab] connexion [${identity.id}/${identity.role}]${connectionConfig.readOnly ? ' (lecture seule)' : ''}`,
    )
  },

  async onLoadDocument({ documentName, document }) {
    const ref = parseDocName(documentName)
    if (!ref) {
      console.warn(`[collab] documentName invalide: "${documentName}"`)
      return document
    }
    try {
      const raw = await readFileRaw(ref.folder, ref.file)
      const pd = parseProjectDoc(migrate(JSON.parse(raw)))
      seedYDoc(document as unknown as YDoc, pd)
      console.log(`[collab] chargé ${documentName} (${pd.nodes.length} nœuds)`)
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        console.log(`[collab] ${documentName} inexistant → Y.Doc vide`)
      } else {
        console.warn(`[collab] échec chargement ${documentName}:`, err instanceof Error ? err.message : err)
      }
    }
    return document
  },

  async onStoreDocument({ documentName, document }) {
    const ref = parseDocName(documentName)
    if (!ref) return
    let pd
    try {
      pd = parseProjectDoc(migrate(yDocToProjectDoc(document as unknown as YDoc)))
    } catch (err) {
      // État transitoire invalide (édition concurrente) : on NE persiste PAS de fichier corrompu.
      console.warn(`[collab] ${documentName} non persisté (invalide):`, err instanceof Error ? err.message : err)
      return
    }
    const violations = checkInvariants(pd)
    if (violations.length > 0) {
      console.warn(`[collab] ${documentName} non persisté (${violations.length} invariant(s) violé(s))`)
      return
    }
    await writeFile(ref.folder, ref.file, pd)
    console.log(`[collab] persisté ${documentName}`)
  },
})

/**
 * Branche Hocuspocus sur l'upgrade WebSocket du serveur http, uniquement pour COLLAB_PATH.
 * Les autres upgrades (ex. HMR Vite, qui de toute façon ne transitent pas ici) sont fermés.
 */
export function attachCollab(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname !== COLLAB_PATH) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Hocuspocus v4 (crossws) ne câble PAS lui-même la réception : handleConnection
      // renvoie une ClientConnection dont on doit alimenter handleMessage/handleClose
      // (l'envoi, lui, passe par la socket fournie). Les types attendent un Request
      // WHATWG ; en embarqué c'est l'IncomingMessage node qui est exploité.
      const conn = hocuspocus.handleConnection(
        ws as unknown as Parameters<typeof hocuspocus.handleConnection>[0],
        request as unknown as Parameters<typeof hocuspocus.handleConnection>[1],
      )
      ws.on('message', (data: Buffer) => conn.handleMessage(new Uint8Array(data)))
      ws.on('close', (code: number, reason: Buffer) =>
        conn.handleClose({ code, reason: reason?.toString() ?? '' }),
      )
    })
  })
}

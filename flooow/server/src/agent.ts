// Ops agent → Y.Doc (pivot agentique, plan §3.1) : le SEUL chemin d'écriture d'un agent.
// openDirectConnection ouvre (ou rejoint) la room Hocuspocus du projet : room déjà ouverte →
// les clients voient la modification en direct ; room fermée → même code, onLoadDocument seed
// depuis le fichier et onStoreDocument persiste au disconnect. Jamais d'écriture fichier directe :
// c'est ce qui élimine le scénario d'écrasement silencieux (un fichier modifié sous une room
// ouverte serait réécrasé par onStoreDocument).
import type { Doc as YDoc } from 'yjs'
import { applyDiffToYDoc, isYDocEmpty, yDocToProjectDoc } from '@flooow/core/collab/ydoc'
import { AgentOpError, applyOps, type AgentOp } from '@flooow/core/agent/ops'
import { parseProjectDoc } from '@flooow/core/model/schema'
import { migrate } from '@flooow/core/model/migrations'
import { hocuspocus } from './collab.js'
import { HttpError } from './files.js'

/** Origine des transactions Yjs posées par un agent (distincte du LOCAL_ORIGIN du front). */
export const AGENT_ORIGIN = 'flooow-agent'

/**
 * Applique un lot d'ops sur le projet `<folder>/<file>` à travers sa room Yjs.
 * Atomique (applyOps valide zod + invariants avant toute écriture). Renvoie le rapport.
 */
export async function applyAgentOps(
  folder: string,
  file: string,
  ops: AgentOp[],
  actor: string,
): Promise<string[]> {
  const documentName = `${folder}/${file}`
  const connection = await hocuspocus.openDirectConnection(documentName, { agent: actor })
  try {
    const document = connection.document
    if (!document) throw new HttpError(500, 'no_document', 'Room injoignable.')
    const ydoc = document as unknown as YDoc
    if (isYDocEmpty(ydoc)) {
      throw new HttpError(404, 'not_found', `Projet introuvable ou vide : ${documentName}.`)
    }

    const prev = parseProjectDoc(migrate(yDocToProjectDoc(ydoc)))
    let result
    try {
      result = applyOps(prev, ops)
    } catch (err) {
      if (err instanceof AgentOpError) throw new HttpError(400, 'invalid_ops', err.message)
      throw err
    }

    await connection.transact((doc) => {
      applyDiffToYDoc(doc as unknown as YDoc, prev, result.doc, AGENT_ORIGIN)
    })
    console.log(`[agent] ${documentName} : ${ops.length} op(s) appliqué(s) par ${actor}`)
    return result.report
  } finally {
    await connection.disconnect()
  }
}

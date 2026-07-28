// Cycle de vie d'une fonctionnalité (cadrage/02-fonctionnalites/cycle-de-vie-fonctionnalite.md).
// Tout ici est DÉRIVÉ et pur : la phase vient du statut (jamais stockée), l'arbre de déblocage
// vient des statuts + arêtes `dependsOn` (rien de nouveau à stocker, aucune écriture automatique —
// débloquer ne change le statut de personne, l'arbre informe, la main reste humaine).
import type { FeatureStatus, LifecyclePhase } from '@flooow/core/model/types'
import { FEATURE_STATUSES } from '@flooow/core/model/types'

export { FEATURE_STATUSES }
export type { FeatureStatus, LifecyclePhase }

/** Libellés d'affichage des statuts (le code est la clé stable, le libellé est présentationnel). */
export const STATUS_LABELS: Record<FeatureStatus, string> = {
  idee: 'Idée',
  'a-qualifier': 'À qualifier',
  cadree: 'Cadrée',
  estimee: 'Estimée',
  retenue: 'Retenue',
  reportee: 'Reportée',
  ecartee: 'Écartée',
  'a-developper': 'À développer',
  'en-developpement': 'En développement',
  'en-recette': 'En recette',
  validee: 'Validée',
  'en-production': 'En production',
}

// ── Phase (dérivée, jamais stockée) ──────────────────────────────────────────

const DEV_STATUSES: ReadonlySet<FeatureStatus> = new Set([
  'a-developper',
  'en-developpement',
  'en-recette',
  'validee',
  'en-production',
])

/**
 * Sorties de route (backlog commercial / abandon). Pas des étapes : elles restent en famille
 * cadrage (une écartée n'a jamais de suivi de dév) et ne satisfont JAMAIS une dépendance.
 */
export const EXIT_STATUSES: ReadonlySet<FeatureStatus> = new Set(['reportee', 'ecartee'])

/**
 * Phase d'une fonctionnalité = la famille de son statut courant. C'est la décision structurante :
 * les sauts d'étapes sont natifs (la phase est une propriété du statut atteint, pas du chemin
 * parcouru) et le retour arrière est sans friction.
 */
export function phaseOf(status: FeatureStatus): LifecyclePhase {
  return DEV_STATUSES.has(status) ? 'dev' : 'cadrage'
}

/**
 * Le gate de bascule (souple) : tout changement de statut qui franchit la frontière cadrage → dev.
 * À ce franchissement, si la checklist cadrage est incomplète : confirmation, PAS blocage — c'est
 * l'appelant (UI) qui affiche la confirmation ; le core ne fait que détecter le franchissement.
 */
export function crossesToDev(from: FeatureStatus, to: FeatureStatus): boolean {
  return phaseOf(from) === 'cadrage' && phaseOf(to) === 'dev'
}

// ── Seuil de déblocage ───────────────────────────────────────────────────────

/**
 * Une dépendance est satisfaite dès ce statut atteint. Choix de départ : `en-developpement`
 * (en agence on commence souvent à intégrer pendant que la dépendance se finit) — la nuance
 * ferme/souple (voir FeatureUnlock.firm) affine visuellement.
 */
export const UNLOCK_THRESHOLD: FeatureStatus = 'en-developpement'

// Rampe de progression pour comparer « statut atteint » : la liste des statuts SANS les sorties
// de route, dans l'ordre du cycle. `reportee`/`ecartee` sont hors rampe (jamais satisfaites).
const PROGRESSION = FEATURE_STATUSES.filter((s) => !EXIT_STATUSES.has(s))
const RANK = new Map<FeatureStatus, number>(PROGRESSION.map((s, i) => [s, i]))

/** Statut terminal : la fonctionnalité est recettée ou livrée. */
export function isDone(status: FeatureStatus): boolean {
  return status === 'validee' || status === 'en-production'
}

/** Une dépendance dans ce statut satisfait-elle le seuil de déblocage ? */
export function satisfiesDependency(status: FeatureStatus): boolean {
  const rank = RANK.get(status)
  if (rank == null) return false // sortie de route : jamais satisfaite
  return rank >= (RANK.get(UNLOCK_THRESHOLD) as number)
}

// ── Arbre de déblocage (« arbre de compétence ») ─────────────────────────────

/** Arête de dépendance : `source` dépend de `target` (sens de l'arête `dependsOn`). */
export interface DependencyEdge {
  source: string
  target: string
}

export type UnlockKind = 'done' | 'unlocked' | 'blocked'

export interface FeatureUnlock {
  kind: UnlockKind
  /** Débloquée FERME (deps toutes terminées) vs SOUPLE (≥ 1 dep juste en cours) — cadenas plein/entrouvert. */
  firm: boolean
  /** « Prochain coup jouable » : débloquée ET encore `a-developper` → accent visuel le plus fort. */
  frontier: boolean
  /** Ids des dépendances sous le seuil (cadenas « 🔒 n »). Une dep encore en cadrage bloque aussi. */
  blockedBy: string[]
  /** Ids des dépendances sorties de route (`reportee`/`ecartee`) : badge ⚠ — incohérence de graphe à résoudre, pas une attente. */
  abandonedDeps: string[]
}

/**
 * Calcule l'état de déblocage de chaque fonctionnalité à partir des statuts et du graphe de
 * dépendances. Les arêtes dont une extrémité est inconnue de `statusById` (nœud non-fonctionnalité,
 * id fantôme) sont ignorées — les invariants s'en chargent.
 */
export function computeUnlocks(
  statusById: Map<string, FeatureStatus>,
  deps: DependencyEdge[],
): Map<string, FeatureUnlock> {
  // Adjacence : id → statuts/ids de ses dépendances (targets de ses arêtes dependsOn).
  const depsOf = new Map<string, string[]>()
  for (const { source, target } of deps) {
    if (!statusById.has(source) || !statusById.has(target)) continue
    const list = depsOf.get(source)
    if (list) list.push(target)
    else depsOf.set(source, [target])
  }

  const result = new Map<string, FeatureUnlock>()
  for (const [id, status] of statusById) {
    const targets = depsOf.get(id) ?? []
    const blockedBy: string[] = []
    const abandonedDeps: string[] = []
    let firm = true
    for (const depId of targets) {
      const depStatus = statusById.get(depId) as FeatureStatus
      if (EXIT_STATUSES.has(depStatus)) {
        abandonedDeps.push(depId)
      } else if (!satisfiesDependency(depStatus)) {
        blockedBy.push(depId)
      }
      if (!isDone(depStatus)) firm = false
    }
    const blocked = blockedBy.length > 0 || abandonedDeps.length > 0
    const kind: UnlockKind = isDone(status) ? 'done' : blocked ? 'blocked' : 'unlocked'
    result.set(id, {
      kind,
      firm: kind === 'unlocked' && firm,
      frontier: kind === 'unlocked' && status === 'a-developper',
      blockedBy,
      abandonedDeps,
    })
  }
  return result
}

// ── Cycles de dépendances (interdits) ────────────────────────────────────────
// `A dependsOn B dependsOn A` = deux cartes bloquées à vie. Refus à la création côté UI
// (wouldCreateDependsCycle) + invariant DEPENDS_CYCLE (findDependsCycles) pour attraper les
// fichiers construits hors UI (agent, migrations).

/**
 * Détecte les cycles du graphe `dependsOn`. Renvoie un cycle par composante fautive rencontrée
 * (liste d'ids dans l'ordre du cycle, premier = point d'entrée) — vide si le graphe est sain.
 */
export function findDependsCycles(deps: DependencyEdge[]): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const { source, target } of deps) {
    const list = adjacency.get(source)
    if (list) list.push(target)
    else adjacency.set(source, [target])
  }

  const cycles: string[][] = []
  // 0 = jamais visité, 1 = en cours (sur la pile), 2 = terminé (aucun cycle atteignable).
  const state = new Map<string, 0 | 1 | 2>()
  const path: string[] = []

  const visit = (id: string): void => {
    state.set(id, 1)
    path.push(id)
    for (const next of adjacency.get(id) ?? []) {
      const s = state.get(next) ?? 0
      if (s === 1) {
        // Arête arrière : le cycle est le segment du chemin depuis `next`.
        cycles.push(path.slice(path.indexOf(next)))
      } else if (s === 0) {
        visit(next)
      }
    }
    path.pop()
    state.set(id, 2)
  }

  for (const id of adjacency.keys()) {
    if ((state.get(id) ?? 0) === 0) visit(id)
  }
  return cycles
}

/**
 * L'ajout d'une arête `source dependsOn target` fermerait-il un cycle ? (À appeler AVANT la
 * création — feedback visuel au drop.) Oui ssi `target` dépend déjà, transitivement, de `source`.
 */
export function wouldCreateDependsCycle(
  deps: DependencyEdge[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true
  const adjacency = new Map<string, string[]>()
  for (const edge of deps) {
    const list = adjacency.get(edge.source)
    if (list) list.push(edge.target)
    else adjacency.set(edge.source, [edge.target])
  }
  const stack = [target]
  const seen = new Set<string>([target])
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (id === source) return true
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return false
}

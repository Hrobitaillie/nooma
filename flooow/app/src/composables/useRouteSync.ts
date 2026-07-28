// Synchronise la vue courante (mode, couche canvas) avec l'URL, dans les DEUX sens :
// une bascule dans l'app empile une entrée d'historique, retour/avant du navigateur rejoue la vue.
// Le store `ui` reste la source de vérité côté app ; l'URL en est la projection canonique.
//
// Pas de garde anti-boucle : `navigate` ne fait rien quand l'URL cible est déjà l'URL courante, donc
// chaque sens s'éteint de lui-même après un aller-retour.
//
// ── Fonctionnalité ouverte (`?feature=`) ─────────────────────────────────────────────────────────
// Elle est dans l'URL pour que les liens « # » vers une fonctionnalité soient adressables. Mais la
// contrainte d'origine tient toujours — un clic sur une carte ne doit pas empiler d'historique — donc
// `editorNodeId` a son PROPRE watcher en `replace` : ouvrir l'éditeur depuis une carte ne fait que
// refléter l'URL. Seule une navigation par lien empile, parce qu'elle change aussi mode/couche, dont
// le watcher est en `push`. Les deux se coalescent en une seule entrée : le push écrit l'URL sans
// `feature`, le replace y ajoute la query dans la foulée.
//
// ── Vue par module (`?view=module&module=`) ──────────────────────────────────────────────────────
// Même règle que `layer` : seule la valeur NON défaut s'écrit, donc `view` absent vaut « plan ».
// Ces deux query n'ont de sens que sur la couche fonctionnelle du canvas, et elles voyagent
// ENSEMBLE — une vue par module sans module désigné ne décrit aucune scène.
//
// Un `module` peut pointer dans le vide (lien périmé, module supprimé depuis, lien collé sur un
// autre projet). On ne peut PAS le valider au moment où l'URL est lue : le document arrive par la
// session collab, bien après le montage, donc à cet instant le projet n'a encore aucun module et
// tout id paraîtrait invalide. La demande est donc appliquée telle quelle, puis RÉVISÉE par un
// watcher dès que la liste des modules est connue — ce même watcher couvrant du même coup la
// suppression d'un module pendant qu'on le regarde.
//
// Hors périmètre volontaire : la sélection simple (⇧-clic, marquee) reste hors URL.
import { computed, nextTick, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useUiStore, type AppMode, type FuncView } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import type { CanvasLayer } from '@flooow/core/model/types'

const MODES: readonly AppMode[] = ['canvas', 'specs', 'api']

/**
 * Vue fonctionnelle demandée par l'URL, confrontée aux modules réellement présents.
 *
 * `knownModuleIds` vide = projet pas encore chargé : on ne peut rien réfuter, la demande passe
 * telle quelle (la révision viendra du watcher). Sinon, un module inconnu — ou une vue par module
 * sans module — retombe sur le plan, qui est toujours affichable.
 */
export function resolveFuncView(
  view: string | null,
  moduleId: string | null,
  knownModuleIds: readonly string[],
): { view: FuncView; module: string | null } {
  if (view !== 'module') return { view: 'plan', module: null }
  if (knownModuleIds.length === 0) return { view: 'module', module: moduleId }
  if (moduleId !== null && knownModuleIds.includes(moduleId)) {
    return { view: 'module', module: moduleId }
  }
  return { view: 'plan', module: null }
}

/** Premier scalaire non vide d'un param/query de route (`string[]` possible), sinon `null`. */
function param(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s !== '' ? s : null
}

export function useRouteSync(): void {
  const route = useRoute()
  const router = useRouter()
  const ui = useUiStore()
  const project = useProjectStore()

  /** La vue par module n'existe que là : couche fonctionnelle du canvas. */
  const inModuleView = (): boolean =>
    ui.mode === 'canvas' && ui.canvasLayer === 'functional' && ui.funcView === 'module'

  /** URL canonique de l'état d'interface courant. Les query tierces éventuelles sont préservées. */
  function target(): RouteLocationRaw {
    return {
      name: 'editor',
      params: { ...route.params, mode: ui.mode },
      query: {
        ...route.query,
        // `layer` n'a de sens que sur le canvas, et seule la couche NON défaut est écrite : sur une
        // URL canvas, `layer` absent vaut donc « structurelle » sans ambiguïté.
        layer: ui.mode === 'canvas' && ui.canvasLayer === 'functional' ? 'functional' : undefined,
        // Comme `layer`, `feature` n'a de sens que là où l'éditeur de fonctionnalité peut être
        // ouvert : couche fonctionnelle du canvas.
        feature:
          ui.mode === 'canvas' && ui.canvasLayer === 'functional' && ui.editorNodeId
            ? ui.editorNodeId
            : undefined,
        // Vue par module : `view` et `module` vont par paire, et seule la vue NON défaut s'écrit —
        // `view` absent vaut « plan », comme `layer` absent vaut « structurelle ».
        view: inModuleView() ? 'module' : undefined,
        module: inModuleView() && ui.funcModule ? ui.funcModule : undefined,
      },
    }
  }

  /** store → URL. No-op si l'URL est déjà la bonne (c'est ce qui coupe la boucle). */
  async function navigate(kind: 'push' | 'replace'): Promise<void> {
    if (route.name !== 'editor') return
    const to = target()
    if (router.resolve(to).fullPath === route.fullPath) return
    await router[kind](to)
  }

  const moduleIds = computed(() => project.modules.map((m) => m.id))

  /**
   * `true` le temps d'une correction automatique de la vue (module devenu introuvable) : la
   * correction se REMPLACE dans l'historique au lieu de s'y empiler. Sinon un lien périmé laisserait
   * dans l'historique une entrée vers lui-même, et « Précédent » y ramènerait en boucle.
   */
  let repairing = false

  /** URL → store, via les ACTIONS du store pour conserver leurs effets de bord (purge de sélection…). */
  function applyRoute(): void {
    if (route.name !== 'editor') return
    const raw = param(route.params.mode)
    const mode: AppMode = MODES.includes(raw as AppMode) ? (raw as AppMode) : 'canvas'
    if (mode === 'canvas') {
      const layer: CanvasLayer = param(route.query.layer) === 'functional' ? 'functional' : 'structural'
      ui.setCanvasLayer(layer)
      // APRÈS setCanvasLayer (qui remet le mode à `canvas`), et seulement sur la couche
      // fonctionnelle : sur la couche structurelle l'URL ne porte pas `view`, et forcer « plan »
      // ici ferait perdre le module en cours à chaque aller-retour entre couches.
      if (layer === 'functional') {
        const resolved = resolveFuncView(
          param(route.query.view),
          param(route.query.module),
          moduleIds.value,
        )
        ui.setFuncView(resolved.view)
        ui.setFuncModule(resolved.module)
      }
      // APRÈS setCanvasLayer, qui referme l'éditeur en changeant de couche.
      const feature = param(route.query.feature)
      if (feature && feature !== ui.editorNodeId) {
        // focusNode avant openEditor : il sélectionne le nœud, sans quoi on aurait un éditeur ouvert
        // sur une carte non sélectionnée (que le watch de sélection du store refermerait au clic
        // suivant). Gardé par l'inégalité : sans ça, toute autre navigation rejouerait le recentrage.
        ui.focusNode(feature)
        ui.openEditor(feature)
      } else if (!feature && ui.editorNodeId) {
        ui.closeEditor()
      }
    }
    ui.setMode(mode)
  }

  // Lien profond / rechargement : l'URL gagne. Puis canonicalisation SANS empiler (/p/a/b → /p/a/b/canvas).
  // Si `applyRoute` a modifié le store, le watcher ci-dessous verra une URL cible déjà courante → no-op.
  applyRoute()
  void navigate('replace')

  // Watchers posés dans le scope du composant → arrêtés au démontage. Le watcher de store est en
  // flush « pre » : plusieurs écritures d'un même tick (ex. setCanvasLayer + focusNode) sont
  // coalescées en UNE seule entrée d'historique.
  watch(() => route.fullPath, applyRoute)
  watch(
    () => [ui.mode, ui.canvasLayer, ui.funcView, ui.funcModule] as const,
    () => void navigate(repairing ? 'replace' : 'push'),
  )

  /**
   * Révision de la vue par module quand la liste des modules devient connue (premier sync collab)
   * ou change (module supprimé pendant qu'on le regarde). Liste vide = document pas encore arrivé :
   * on ne conclut rien, sans quoi tout lien profond vers un module serait cassé au montage.
   */
  watch(
    moduleIds,
    (ids) => {
      if (ui.funcView !== 'module' || ids.length === 0) return
      if (ui.funcModule !== null && ids.includes(ui.funcModule)) return
      repairing = true
      ui.setFuncView('plan')
      ui.setFuncModule(null)
      void nextTick(() => {
        repairing = false
      })
    },
    { immediate: true },
  )
  // `replace` : ouvrir/fermer l'éditeur depuis une carte reflète l'URL sans empiler d'historique.
  watch(() => ui.editorNodeId, () => void navigate('replace'))
}

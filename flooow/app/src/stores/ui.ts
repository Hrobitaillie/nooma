// État d'interface (non sérialisé dans le projet) : mode, sélection, panneaux, filtres, zoom.
// Voir architecture.md §Modes applicatifs.
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { CanvasLayer, Facet } from '@flooow/core/model/types'

export type AppMode = 'canvas' | 'specs' | 'api'

/**
 * Lentille de lecture du canvas (cycle-de-vie-fonctionnalite.md §mode dev), orthogonale à la
 * couche : `design` (défaut) = tout éditable ; `dev` = structure GELÉE (déplacements, créations,
 * suppressions, contenu riche, renommages), seules les métadonnées restent éditables (checklists,
 * statuts, estimations) et l'arbre de déblocage passe en rendu renforcé.
 */
export type CanvasMode = 'design' | 'dev'

/** Vue de la couche fonctionnelle : le plan entier, ou une page par module. */
export type FuncView = 'plan' | 'module'

export type PanelId =
  | 'modeSwitcher'
  | 'toolDock'
  | 'properties'
  | 'zoomBar'
  | 'search'

export interface FocusRequest {
  nodeId: string
  /** jeton incrémental : permet de re-déclencher un focus sur le même nœud. */
  token: number
}

const DEFAULT_PANELS: Record<PanelId, boolean> = {
  modeSwitcher: true,
  toolDock: true,
  properties: true,
  zoomBar: true,
  search: false,
}

export const useUiStore = defineStore('ui', () => {
  const mode = ref<AppMode>('canvas')
  /**
   * Couche active du canvas (decisions.md §15). Orthogonale à `mode` (canvas/specs/api) :
   * en `structural` on travaille pages/blocs/notes, en `functional` modules/fonctionnalités.
   * L'autre couche est complètement masquée. Défaut `structural` (comportement historique).
   */
  const canvasLayer = ref<CanvasLayer>('structural')
  /**
   * Couche fonctionnelle : comment rendre les liens « dépend de ».
   *  - `background` : tracés lignes DERRIÈRE les cartes → les longs liens inter-modules passent
   *    derrière les fonctionnalités (opaques), visibles seulement dans les gouttières.
   *  - `portal` : les liens LONGS deviennent des pastilles « portail » (aucun long tracé) ; les
   *    liens courts restent des lignes au premier plan.
   */
  const funcEdgeMode = ref<'background' | 'portal'>('background')
  /** Lentille design / dev du canvas (toggle bas d'écran, synchronisée à l'URL). */
  const canvasMode = ref<CanvasMode>('design')
  /**
   * Couche fonctionnelle : QUOI afficher.
   *  - `plan` (défaut) : tout le graphe, compartimenté par lot/module — la vue historique.
   *  - `module` : une seule page = un seul module, plus les cartes d'autres modules qui le touchent
   *    directement, posées en satellites au niveau de leur dépendance.
   * `plan` reste le défaut : c'est la vue qui répond à « où en est le projet », alors que la vue par
   * module répond à « que contient CE module » — une question qu'on ne se pose qu'après avoir choisi.
   */
  const funcView = ref<FuncView>('plan')
  /**
   * Module affiché en vue par module (ID, jamais le nom : un nom est renommable en direct sur le
   * canvas, un état indexé dessus se déferait au premier renommage — même raison que `moduleFilter`).
   * `null` = aucun module choisi ; c'est `setFuncView` qui en pose un à l'entrée dans le mode.
   */
  const funcModule = ref<string | null>(null)
  /**
   * Fonctionnalité dont on inspecte le blocage (survol du badge cadenas) : les arêtes `dependsOn`
   * qui partent d'elle vers ses bloqueuses s'allument. `null` = rien de surligné.
   */
  const depHighlight = ref<string | null>(null)
  /** Griser les fonctionnalités BLOQUÉES (prérequis pas encore débloqués) — couche fonctionnelle. */
  const dimBlocked = ref(true)
  /**
   * « Toujours afficher le contenu des cartes » : DÉSACTIVE le LOD (masquage du contenu et de la
   * grille sous zoom 0,35). Devenu tenable depuis la refonte canvas (couche GL + virtualisation —
   * essai validé par Hugo le 23/07) ; préférence PERSONNELLE et machine-dépendante, donc
   * localStorage et jamais le document partagé. Clé héritée du drapeau d'essai (`flooow:lod`).
   */
  const FULL_CARDS_KEY = 'flooow:lod'
  const fullCards = ref(false)
  try {
    fullCards.value = window.localStorage.getItem(FULL_CARDS_KEY) === '0'
  } catch {
    /* stockage indisponible : préférence non restaurée, valeur par défaut */
  }
  /**
   * « Animer les liens de dépendance » : la dérive des tiretés (sens du déblocage, zoom ≥ 0,8).
   * Décochable pour rendre du CPU — préférence PERSONNELLE, comme fullCards.
   */
  const ANIMATE_DEPS_KEY = 'flooow:anim-deps'
  const animateDeps = ref(true)
  try {
    animateDeps.value = window.localStorage.getItem(ANIMATE_DEPS_KEY) !== '0'
  } catch {
    /* stockage indisponible : préférence non restaurée, valeur par défaut */
  }
  /**
   * REGROUPEMENT de la couche fonctionnelle (maquette « Réglages d'affichage »). Les niveaux de
   * dépendance restent GLOBAUX quoi qu'il arrive : ces interrupteurs ne décident que des
   * compartiments dessinés derrière les cartes (lot ⊃ module). Les deux décochés = flux libre.
   */
  const groupByLot = ref(true)
  const groupByModule = ref(true)
  /** Aère la séparation entre lots (écarts de colonnes, ou trous dans la rangée en flux libre). */
  const spaceLots = ref(false)
  /**
   * Corps DÉPLIÉ de la carte « Réglages d'affichage ». Ne pilote PLUS sa visibilité : la carte est
   * désormais toujours montée en haut à droite de la couche fonctionnelle (le bouton engrenage de la
   * pilule a disparu — un réglage qu'on doit d'abord trouver derrière un bouton est un réglage qu'on
   * n'utilise pas). Seul son contenu se replie, via le chevron de son en-tête. D'où le renommage
   * `displaySettingsOpen` → `displaySettingsExpanded` : « open » laissait croire à une visibilité.
   * L'état reste dans le store (et non local au composant) pour survivre au démontage de la carte
   * quand on quitte la couche fonctionnelle ou qu'on ouvre l'éditeur plein hauteur.
   */
  const displaySettingsExpanded = ref(true)
  /**
   * Mode COMPACT (couche fonctionnelle) : n'afficher que la CHAÎNE d'une fonctionnalité — l'« ancre »,
   * ses prérequis (amont) et ce qu'elle débloque (aval). L'ensemble est FIGÉ sur l'ancre : changer la
   * sélection (pour éditer une autre carte de la chaîne) ne le recompose pas. `null` = compact inactif.
   */
  const compactAnchor = ref<string | null>(null)
  /**
   * Le mode compact est ARMÉ par son bouton, mais ne se referme sur une chaîne qu'au clic suivant sur
   * une carte : c'est ce clic qui désigne l'ancre. Deux états distincts, donc — armé (le bouton est
   * allumé, la scène est encore entière) et ancré (`compactAnchor`, la scène est réduite à la
   * chaîne). Les confondre faisait entrer en compact sur la sélection COURANTE dès qu'on armait,
   * c'est-à-dire sur une carte que l'utilisateur ne désignait pas — et « Vue complète » sortait d'un
   * mode dans lequel il n'avait jamais choisi d'entrer.
   */
  const compactArmed = ref(false)
  const compactOn = computed(() => compactAnchor.value != null)
  const selection = ref<Set<string>>(new Set())
  /**
   * Nœud en cours d'ÉDITION dans l'éditeur plein hauteur (fonctionnalité). Découplé de la sélection :
   * sélectionner une carte ne l'ouvre plus ; l'utilisateur clique « Éditer » sur la carte (openEditor).
   */
  const editorNodeId = ref<string | null>(null)
  const openPanels = ref<Record<PanelId, boolean>>({ ...DEFAULT_PANELS })
  /**
   * Filtre FACETTE (front/back/fullstack) — alimente `SpecsFilter.facet` du cœur, et RIEN D'AUTRE.
   * Il a longtemps grisé aussi les notes du canvas structurel ; ce second effet est tombé avec le
   * retrait de la FilterBar flottante, qui était son seul contrôle commun aux deux. Son unique
   * contrôle vit maintenant dans la vue Specs, et un filtre réglé dans le document qui aurait
   * continué à modifier le canvas serait un effet à distance impossible à diagnostiquer depuis le
   * canvas. Il reste dans ce store (et non local à SpecsView) pour survivre aux allers-retours
   * canvas ↔ specs, qui démontent la vue.
   * Ne PAS le rebrancher sur un composant de canvas sans lui donner d'abord un contrôle visible
   * dans cette couche — voir l'en-tête de NoteCard.vue.
   */
  const facetFilter = ref<Facet | null>(null)
  /**
   * Filtre lot. MONO-VALUÉ à dessein : ce n'est pas qu'un grisage de cartes, il alimente aussi
   * `SpecsFilter.lot` du cœur (`domain/derive/specs.ts`), dont le contrat est un lot unique et qui
   * sert aux specs, aux exports et à la CLI. Le passer en multi ici forcerait soit une rupture de ce
   * contrat cœur, soit deux sens différents de « filtre de lot » selon la vue. La section Filtres du
   * dropdown n'accepte donc qu'un badge de lot — voir `moduleFilter` pour la même contrainte.
   */
  const lotFilter = ref<number | null>(null)
  /**
   * Filtre module : les fonctionnalités d'un autre module tombent en opacité réduite, exactement
   * comme `lotFilter`. Stocke l'ID du module (et non son nom) : le nom est renommable en direct
   * depuis le canvas, un filtre indexé dessus se déferait tout seul au premier renommage.
   * Mono-valué par symétrie avec `lotFilter` — deux champs voisins du même panneau qui n'auraient
   * pas la même cardinalité seraient un piège d'interface.
   */
  const moduleFilter = ref<string | null>(null)
  const zoom = ref(1)
  const focusRequest = ref<FocusRequest | null>(null)

  // ── Panneau de commentaires (v13, plan-refonte-notes-commentaires.md) ─────
  /** Bornes de largeur du panneau : plancher 320 px (règle anti-étroitesse n°1), plafond 50 % de
   *  l'écran. Le plancher ne se négocie pas — sous 320 px c'est le mode overlay qui prend le
   *  relais, jamais un panneau plus étroit. */
  const COMMENTS_PANEL_MIN = 320
  const COMMENTS_PANEL_DEFAULT = 340
  /** Clé localStorage de la largeur : préférence PERSONNELLE, jamais dans le document partagé
   *  (même raison que viewportMemory.ts). Globale et non par projet — une largeur de lecture
   *  confortable ne dépend pas du projet ouvert. */
  const COMMENTS_PANEL_WIDTH_KEY = 'flooow:comments-panel:width'

  function clampCommentsPanelWidth(w: number): number {
    const max = Math.max(Math.floor(window.innerWidth / 2), COMMENTS_PANEL_MIN)
    return Math.min(Math.max(Math.round(w), COMMENTS_PANEL_MIN), max)
  }
  function readStoredPanelWidth(): number {
    try {
      const raw = Number(window.localStorage.getItem(COMMENTS_PANEL_WIDTH_KEY))
      return Number.isFinite(raw) && raw > 0 ? clampCommentsPanelWidth(raw) : COMMENTS_PANEL_DEFAULT
    } catch {
      return COMMENTS_PANEL_DEFAULT
    }
  }

  /** Panneau latéral de commentaires ouvert (toggle « 💬 n », Échap referme). */
  const commentsPanelOpen = ref(false)
  /** Largeur courante du panneau (px), déjà bornée. */
  const commentsPanelWidth = ref(readStoredPanelWidth())
  /** Fil ACTIF (seul déplié — règle anti-étroitesse n°3 : la densité vient du pli). */
  const activeCommentId = ref<string | null>(null)

  function toggleCommentsPanel(open?: boolean): void {
    commentsPanelOpen.value = open ?? !commentsPanelOpen.value
    if (!commentsPanelOpen.value) activeCommentId.value = null
  }
  function setCommentsPanelWidth(w: number): void {
    commentsPanelWidth.value = clampCommentsPanelWidth(w)
    try {
      window.localStorage.setItem(COMMENTS_PANEL_WIDTH_KEY, String(commentsPanelWidth.value))
    } catch {
      /* stockage plein ou interdit : la largeur vivra le temps de la session */
    }
  }
  /** Active un fil (le déplie seul) et ouvre le panneau si besoin. `null` = tout replier. */
  function setActiveComment(id: string | null): void {
    activeCommentId.value = id
    if (id != null) commentsPanelOpen.value = true
  }

  let focusToken = 0

  const selectedIds = computed<string[]>(() => [...selection.value])
  const selectedId = computed<string | null>(() => selectedIds.value[0] ?? null)
  const hasSelection = computed(() => selection.value.size > 0)

  function setMode(next: AppMode): void {
    mode.value = next
  }

  /**
   * Bascule la couche active du canvas. La sélection courante appartient à l'ancienne couche
   * (masquée après bascule) : on la vide pour éviter une sélection invisible. Repasse en vue canvas.
   */
  function setCanvasLayer(layer: CanvasLayer): void {
    if (canvasLayer.value === layer) return
    canvasLayer.value = layer
    selection.value = new Set()
    editorNodeId.value = null // l'éditeur appartient à la couche fonctionnelle : on le ferme
    mode.value = 'canvas'
  }

  /** Ouvre l'éditeur plein hauteur sur un nœud (déclenché par « Éditer » sur la carte). */
  function openEditor(id: string): void {
    editorNodeId.value = id
  }
  /** Ferme l'éditeur plein hauteur (bouton de fermeture). N'affecte pas la sélection. */
  function closeEditor(): void {
    editorNodeId.value = null
  }

  // Clic ailleurs = fermeture : dès que le nœud en cours d'édition n'est plus sélectionné
  // (canvas vide ou autre carte cliquée), on referme l'éditeur.
  watch(selection, (sel) => {
    if (editorNodeId.value && !sel.has(editorNodeId.value)) editorNodeId.value = null
  })

  function setFuncEdgeMode(m: 'background' | 'portal'): void {
    funcEdgeMode.value = m
  }

  /** Bascule design ↔ dev. En dev l'édition de contenu est gelée : on referme l'éditeur ouvert. */
  function setCanvasMode(m: CanvasMode): void {
    if (canvasMode.value === m) return
    canvasMode.value = m
    if (m === 'dev') editorNodeId.value = null
  }

  /** Change le module affiché en vue par module. */
  function setFuncModule(moduleId: string | null): void {
    funcModule.value = moduleId
  }

  /**
   * Bascule plan ↔ vue par module. `fallback` est le module à afficher si aucun n'est encore choisi
   * — l'appelant le fournit parce que c'est LUI qui connaît le projet : ce store ne dépend pas du
   * store projet, et l'y coupler pour cette seule ligne mettrait un store d'interface au courant du
   * document. Convention côté appelant (FuncControls) : le module de la sélection courante, sinon le
   * premier module du projet.
   */
  function setFuncView(next: FuncView, fallback?: string | null): void {
    funcView.value = next
    if (next === 'module' && !funcModule.value && fallback) funcModule.value = fallback
  }

  function setDepHighlight(id: string | null): void {
    depHighlight.value = id
  }

  function setDimBlocked(v: boolean): void {
    dimBlocked.value = v
  }

  function setFullCards(v: boolean): void {
    fullCards.value = v
    try {
      if (v) window.localStorage.setItem(FULL_CARDS_KEY, '0')
      else window.localStorage.removeItem(FULL_CARDS_KEY)
    } catch {
      /* stockage indisponible : préférence non persistée */
    }
  }

  function setAnimateDeps(v: boolean): void {
    animateDeps.value = v
    try {
      if (v) window.localStorage.removeItem(ANIMATE_DEPS_KEY)
      else window.localStorage.setItem(ANIMATE_DEPS_KEY, '0')
    } catch {
      /* stockage indisponible : préférence non persistée */
    }
  }

  function setGroupByLot(v: boolean): void {
    groupByLot.value = v
  }

  function setGroupByModule(v: boolean): void {
    groupByModule.value = v
  }

  function setSpaceLots(v: boolean): void {
    spaceLots.value = v
  }

  function setDisplaySettingsExpanded(v: boolean): void {
    displaySettingsExpanded.value = v
  }

  function toggleDisplaySettings(): void {
    displaySettingsExpanded.value = !displaySettingsExpanded.value
  }

  /**
   * Ancre le compact sur un nœud (le clic sur une carte, mode armé). Sans cible, retombe sur la
   * sélection courante. N'a d'effet qu'une fois : la chaîne est FIGÉE sur sa première ancre, cliquer
   * une autre carte de la chaîne l'édite sans recomposer la scène sous les doigts.
   */
  function enterCompact(id?: string): void {
    if (compactAnchor.value != null) return
    const anchor = id ?? selectedId.value
    if (anchor) compactAnchor.value = anchor
  }
  /**
   * Bouton « Vue complète » : rend la scène entière mais LAISSE le mode armé — cliquer une autre
   * carte re-isole aussitôt sa chaîne. C'est ce qui fait du compact une façon de PARCOURIR le plan
   * chaîne par chaîne ; seul le bouton Compact éteint le mode.
   */
  function exitCompact(): void {
    compactAnchor.value = null
  }
  /** Éteint le mode, ancré ou seulement armé (bouton Compact rappuyé). */
  function stopCompact(): void {
    compactAnchor.value = null
    compactArmed.value = false
  }
  /**
   * Bouton « Compact ». Arme le mode, et si l'appelant fournit déjà une ancre (une fonctionnalité
   * sélectionnée au moment du clic), s'y referme immédiatement : demander un second clic sur la
   * carte qu'on regarde déjà donnerait un bouton qui ne fait rien de visible. Sans ancre, le mode
   * reste armé et attend le clic qui la désignera. Rappuyer ÉTEINT le mode — c'est le seul geste qui
   * le fait, « Vue complète » se contentant de relâcher la chaîne courante.
   * L'ancre vient de l'appelant, seul à connaître le TYPE du nœud sélectionné — ce store ignore le
   * document (cf. `setFuncView`).
   */
  function toggleCompact(anchor?: string | null): void {
    if (compactArmed.value) {
      stopCompact()
      return
    }
    compactArmed.value = true
    if (anchor) compactAnchor.value = anchor
  }

  /** Sélectionne un nœud ; `additive` pour la multi-sélection (⇧/⌘-clic). */
  function select(id: string, additive = false): void {
    if (additive) {
      const next = new Set(selection.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selection.value = next
    } else {
      selection.value = new Set([id])
    }
  }

  function setSelection(ids: Iterable<string>): void {
    selection.value = new Set(ids)
  }

  function clearSelection(): void {
    selection.value = new Set()
  }

  function isSelected(id: string): boolean {
    return selection.value.has(id)
  }

  function togglePanel(panel: PanelId, open?: boolean): void {
    openPanels.value = {
      ...openPanels.value,
      [panel]: open ?? !openPanels.value[panel],
    }
  }

  function setFacetFilter(facet: Facet | null): void {
    facetFilter.value = facet
  }

  function setLotFilter(lot: number | null): void {
    lotFilter.value = lot
  }

  function setModuleFilter(moduleId: string | null): void {
    moduleFilter.value = moduleId
  }

  function setZoom(z: number): void {
    zoom.value = z
  }

  /** Demande au canvas de centrer/sélectionner un nœud (consommé par FlowCanvas via watch). */
  function focusNode(nodeId: string): void {
    focusToken += 1
    focusRequest.value = { nodeId, token: focusToken }
    select(nodeId)
    mode.value = 'canvas'
  }

  return {
    mode,
    canvasLayer,
    funcEdgeMode,
    canvasMode,
    funcView,
    funcModule,
    depHighlight,
    dimBlocked,
    fullCards,
    animateDeps,
    groupByLot,
    groupByModule,
    spaceLots,
    displaySettingsExpanded,
    compactAnchor,
    compactArmed,
    compactOn,
    selection,
    editorNodeId,
    openPanels,
    facetFilter,
    lotFilter,
    moduleFilter,
    zoom,
    focusRequest,
    commentsPanelOpen,
    commentsPanelWidth,
    activeCommentId,
    selectedIds,
    selectedId,
    hasSelection,
    setMode,
    setCanvasLayer,
    openEditor,
    closeEditor,
    setFuncEdgeMode,
    setCanvasMode,
    setFuncView,
    setFuncModule,
    setDepHighlight,
    setDimBlocked,
    setFullCards,
    setAnimateDeps,
    setGroupByLot,
    setGroupByModule,
    setSpaceLots,
    setDisplaySettingsExpanded,
    toggleDisplaySettings,
    enterCompact,
    exitCompact,
    stopCompact,
    toggleCompact,
    select,
    setSelection,
    clearSelection,
    isSelected,
    togglePanel,
    setFacetFilter,
    setLotFilter,
    setModuleFilter,
    setZoom,
    focusNode,
    toggleCommentsPanel,
    setCommentsPanelWidth,
    setActiveComment,
  }
})

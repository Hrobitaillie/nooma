# Plan — arbre de pages canvas : drag façon Octopus, lisibilité, navigation

> Rédigé le 22/07/2026 après observation du rendu réel (projet `exemples/locasyst-project`,
> vue `/canvas`, onglet Arborescence) et lecture du code. Destiné à une session Claude **sans
> contexte préalable** : tout le nécessaire est ici. Lire aussi le `CLAUDE.md` du dépôt
> (sessions concurrentes, réservation de fichiers dans `.claude/travaux-en-cours.json`).

## Précautions avant de commencer

- Un serveur de dev tourne en général déjà : vite sur `http://localhost:5173`, API sur `:3011`,
  données dans `data/` (gitignoré). La page d'observation :
  `http://localhost:5173/p/exemples/locasyst-project/canvas`.
- **La room est collaborative et persistée** : tout drop de drag, toute mutation du store écrit
  dans le `.graph.json` du projet ouvert (pont collab côté serveur). Pour observer un drag sans
  rien casser : simuler pointerdown + pointermove **sans jamais relâcher** (fermer le navigateur
  en plein drag = aucun drop, aucune mutation). Ne jamais éditer à la main le `.json` d'une room
  ouverte.
- Les tests du layout : `app/test/canvas.pageTree.spec.ts` (`pnpm -C app test`).

## Carte du code (état au commit `50347ca`)

| Rôle | Fichier | Points d'entrée |
|---|---|---|
| Layout dérivé de l'arbre | `app/src/canvas/pageTree.ts` | `pageTreeLayout()` l.73 ; constantes `TREE_*` l.19-30 (`TREE_PAD=60`, `TREE_GAP=140`, `TREE_RAIL_GAP=72`, `TREE_COL_GAP=48`, `TREE_INDENT=28`, `TREE_SIB_GAP=28`) |
| Branchement layout + edges + drag | `app/src/canvas/useCanvasSync.ts` | `PAGE_WIDTH=300`, `PAGE_HEADER_H=46`, `NAV_ANCHOR_Y=23` (l.84-99) ; `buildPageItems()` l.431 ; `pageRightExtras()` l.475 ; `prospectivePage()` l.2306 ; `applyPageDragPreview()` l.2370 ; `onNodeDrag` l.2415 ; `onNodeDragStop`/`dropPage` l.2356+2445 ; edges nav l.1727-1744, edges tree l.1780-1799, portails l.1435-1591 + l.1694-1718 ; `chooseRender()` l.595 ; `isTreeRedundantNav()` l.459 ; `EDGE_Z=2000` l.142 |
| Carte de page (handles, styles) | `app/src/canvas/nodes/PageFrame.vue` | handles nav l.147-160 (`top: NAV_ANCHOR_Y`), handles tree cachés l.167-196, conteneur/bordures l.77-84 |
| Arête de structure (rail orthogonal) | `app/src/canvas/edges/TreeEdge.vue` | `getSmoothStepPath`, stroke `#cbd5e1` 2px l.44 |
| Arête typée (nav, dependsOn…) | `app/src/canvas/edges/TypedEdge.vue` | table `STYLES` l.62-69, `getBezierPath` curvature 0.3 l.92 |
| Pastille portail | `app/src/canvas/nodes/PortalNode.vue` | tout le fichier |
| Popover convertir ligne/portail | `app/src/canvas/EdgeTypePopover.vue` | l.55-56 |
| Config Vue Flow, overlays | `app/src/canvas/FlowCanvas.vue` | empilement documenté l.371-395, `elevate-nodes-on-select=false` |
| Store (mutations au drop) | `app/src/stores/project.ts` | `moveNode`, `reparentPage`, `autoSetRenders` |

Principe en place : `position.x` d'une page n'est **qu'une clé d'ordre** ; toutes les
coordonnées sont dérivées par `pageTreeLayout()` à chaque lecture. La preview de drag rejoue ce
layout en mémoire (positions Vue Flow), le store n'est muté qu'au drop.

## Constats (observés à l'écran + mesurés)

1. **Drag chaotique.** La carte grabée suit librement le curseur, peut se superposer aux autres
   cartes, rien ne matérialise l'emplacement de dépôt ni sa validité. Ses pastilles portail
   restent orphelines à l'ancienne position pendant le drag.
2. **Clignotement au drag horizontal** (mesuré au Playwright) : sur un drag horizontal de
   420 px, **27 des 30 autres pages** ont changé de position ~4 fois chacune. Cause :
   `onNodeDrag` → `applyPageDragPreview()` → `pageTreeLayout()` **complet à chaque frame**, et la
   décision de `prospectivePage()` (parent/ordre) bascule d'un état à l'autre autour des seuils
   (`insertIndexAmong` à `r.x + r.w/2`, `ZONE=120`) → le layout entier fait des allers-retours.
   Aucune hystérésis, aucune transition.
3. **Ports non centrés.** Les handles nav sont ancrés à `top: 23px` (milieu du **header**, pas de
   la carte). Les arêtes d'arbre en profondeur ≥ 2 partent/arrivent sur des handles décalés à
   `left: 14px` (`tree-out-left`, `tree-in-top-left`). Les enfants d'une colonne sont alignés à
   gauche avec indentation (`TREE_INDENT`), la racine est centrée sur la largeur de l'arbre →
   visuellement rien ne tombe « au centre » de rien.
4. **Tracés et contours trop discrets.** Rail d'arbre `#cbd5e1` (slate-300) 2px, bordures de
   carte `border-slate-300`, header `slate-50/90`. Au fitView initial (dézoom fort), le canvas
   est **illisible** : cartes = rectangles blancs sans contour perceptible, aucun lien visible.
   (Précédent utile : le commit `82e4e9f` compense déjà la taille des libellés au dézoom sur les
   cadres lot/module — même logique applicable aux traits.)
5. **Portails envahissants.** Chaque `navigatesTo` long est rendu en deux pastilles grises
   (`PortalNode`) empilées à droite des cartes : textes tronqués, illisibles au dézoom, bande
   `extraRight` réservée qui élargit le layout, orphelines pendant le drag.
6. **Liens de navigation au premier plan.** Les arêtes `navigatesTo` (déjà en Bézier pointillé
   `#64748b`) ont `zIndex: EDGE_Z = 2000` → elles **traversent les cartes par-dessus** ; à
   l'écran, de longues lignes verticales barrent tout le canvas et coupent les cartes en deux.

## Cible (comportement Octopus voulu par Hugo)

- Au grab d'une page : un **fantôme** (la carte estompée) reste à l'emplacement actuel ; la
  carte grabée suit le curseur.
- Quand le curseur survole un emplacement **autorisé** : un **rectangle d'insertion** apparaît
  et **écarte les pages voisines** pour ouvrir le slot (animé, sans clignoter). Emplacement
  interdit → pas de slot, et au relâchement la page **revient au fantôme** (annulation).
- Au relâchement sur un slot : la page s'installe dans le slot, le layout se range.
- Navigation : **plus aucun portail** — toutes les `navigatesTo` sont des **courbes pointillées
  passant derrière les cartes**. Les liens de structure restent orthogonaux, pleins, et
  deviennent nettement plus lisibles.

## Plan de travail (ordre conseillé)

### Lot 1 — Navigation : virer les portails, courbes pointillées en arrière-plan

Le plus simple et il **simplifie le layout** pour la suite (la bande `extraRight` disparaît).

1. Dans `useCanvasSync.ts` : rendre toutes les arêtes de la couche structurelle en mode ligne —
   neutraliser `chooseRender()`/`reevaluateRenders()`/`autoSetRenders` pour `navigatesTo` (et
   décider du sort de `dependsOn` : mêmes pastilles aujourd'hui ; recommandation = même
   traitement, ligne systématique). Supprimer la génération des nœuds portail structurels
   (`portalNodesOf`, `computePortalLayout`, arêtes `portalTie` l.1694-1718). Attention : la
   couche **fonctionnelle** a ses propres portails (`funcPortalNodes` l.1171) — hors périmètre,
   ne pas les casser.
2. `pageRightExtras()` : ne plus réserver de bande à droite pour les pastilles (garder celle des
   notes si présente) → le layout se resserre.
3. zIndex des arêtes nav/dependsOn : passer de `EDGE_Z` à `1` (même plan que les liens
   fonctionnels « background », sous les cartes — empilement documenté dans `FlowCanvas.vue`
   l.371-395). Garder `EDGE_Z` pour ce qui doit rester lisible par-dessus (attach…), à vérifier
   à l'écran.
4. Style nav dans `TypedEdge.vue` : déjà Bézier + `dash '4 4'` — augmenter éventuellement la
   courbure (0.3 → ~0.5) et garder la flèche. Les extrémités restent sur les handles nav
   latéraux (voir Lot 3 pour leur position).
5. Nettoyage : `PortalNode.vue` (partie structurelle), options « Convertir en ligne/portail » de
   `EdgeTypePopover.vue`, `isTreeRedundantNav` reste (le masquage des nav parent↔enfant est un
   comportement voulu). Purger les attrs `render`/`renderManual` du modèle **seulement si** on
   assume une migration de format (voir CLAUDE.md « Format de projet » — sinon les ignorer au
   rendu et laisser le modèle tranquille : recommandé dans un premier temps).

### Lot 2 — Drag façon Octopus : fantôme, slot, zéro clignotement

Tout dans `useCanvasSync.ts` (+ un composant de slot si besoin).

1. **Stabiliser la décision** : mémoriser la dernière décision `{parentId, index}` de
   `prospectivePage()`. Ne rejouer le layout de preview **que quand cette décision change**
   (pas à chaque frame), avec une **hystérésis** : la nouvelle décision doit s'écarter du seuil
   d'au moins ~24 px (ou persister ~120 ms) avant d'être adoptée. C'est LA correction du
   clignotement mesuré (27/30 pages × 4 repositionnements par drag).
2. **Fantôme** : au `onNodeDragStart`, figer un clone visuel de la carte à sa position d'origine
   (nœud éphémère non interactif opacité ~0.35, ou renderer le vrai nœud estompé et faire
   suivre le curseur à un clone — choisir la voie la moins invasive avec Vue Flow ; il existe
   déjà un précédent d'overlay `drag-ghost` violet dans `FlowCanvas.vue` ~l.601).
3. **Slot d'insertion** : quand la décision prospective est valide, injecter dans
   `buildPageItems(override)` un **placeholder** aux dimensions de la carte draggée à l'index
   visé (au lieu de déplacer la carte draggée elle-même dans l'arbre) → les voisins s'écartent
   pour ouvrir le trou ; dessiner le rectangle du slot (pointillé, teinte sky) à cet
   emplacement. La carte draggée est retirée du layout pendant le drag (elle flotte au curseur,
   `zIndex` élevé, ombre portée).
4. **Transitions** : animer l'écartement (transition CSS `transform` ~150 ms sur les nœuds page
   **hors** carte draggée, activée seulement pendant un drag pour ne pas ralentir le reste).
5. **Drop** : décision valide → mutation store comme aujourd'hui (`moveNode`/`reparentPage`,
   une entrée d'historique). Pas de décision valide → aucune mutation, la carte réintègre le
   fantôme. Supprimer alors le repositionnement libre : la carte ne doit jamais « rester » où
   on la lâche.
6. Vérifier que le drag des notes (`applyNoteDragPreview`) et des blocs n'est pas impacté.

### Lot 3 — Centrage des ports et des pages

1. **Arêtes d'arbre** : partir du **centre bas du parent** et arriver au **centre haut de
   l'enfant** dans tous les cas — supprimer les variantes `tree-out-left`/`tree-in-top-left`
   (et la logique `deep` associée dans `TreeEdge.vue` + sélection des handles l.1789-1790), ou
   les repositionner pour qu'elles tombent sur les centres réels. Si le rail de gouttière des
   profondeurs ≥ 2 est conservé, faire coïncider le coude avec le centre de l'enfant.
2. **Layout** : centrer la (les) colonne(s) d'enfants sous le parent quand il n'y a qu'une
   colonne (cas majoritaire) ; à plusieurs colonnes, centrer le groupe de colonnes sous la
   racine. Ajuster `placeColumn`/`columnWidth` dans `pageTree.ts` + les tests
   `canvas.pageTree.spec.ts`. Décision UX si conflit : le rendu Octopus (pile centrée sous le
   parent) prime sur l'indentation façon explorateur.
3. **Handles nav** : décider de l'ancre — milieu vertical de la carte (`top: 50%`) plutôt que
   milieu du header (`NAV_ANCHOR_Y=23`). Avec les nav en arrière-plan (Lot 1), l'ancre au
   header perd sa raison d'être ; le centre de carte donne des courbes mieux réparties.
   Supprimer/adapter `NAV_ANCHOR_Y` partout (il sert aussi dans `prospectivePage` l.2312 comme
   ordonnée de référence du centre — remplacer par une vraie moitié de hauteur).

### Lot 4 — Contraste et lisibilité au dézoom

1. Rail d'arbre : `#cbd5e1` → slate-400 (`#94a3b8`) minimum, épaisseur 2.5-3.
2. Bordures de carte : `border-slate-300` → `border-slate-400` (garder sky en sélection) ;
   header un cran plus contrasté.
3. **Compensation au dézoom** : sous un seuil de zoom, épaissir les traits en `1/zoom` (même
   esprit que la compensation des libellés du commit `82e4e9f`) pour que structure et liens
   restent lisibles au fitView. Le zoom est accessible via `useVueFlow()` (`viewport.zoom`).
4. Vérifier à l'écran aux trois niveaux : fitView complet, arbre entier, carte seule.

### Vérification finale

- `pnpm -C app test` (mettre à jour `canvas.pageTree.spec.ts` pour le centrage + placeholder).
- Vérification visuelle sur `locasyst-project` : fitView lisible, drag d'une page enfant
  horizontalement **sans clignotement** (les autres pages ne bougent que quand le slot change),
  fantôme + slot visibles, drop hors zone = annulation, plus aucune pastille portail sur la
  couche structurelle, navigations en courbes pointillées **derrière** les cartes.
- Commits atomiques par lot, convention V3 (`fonc(canvas): …`), via le skill `git-commit`.

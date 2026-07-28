# Audit — refonte du canvas en WebGL (cible « façon Figma »)

Date : 23/07/2026. Base auditée : `app/src/canvas/**` (HEAD `fafb3f7`), rapports croisés de trois
passes d'exploration (architecture de rendu, diagnostic performance, inventaire fonctionnel).

## Résumé exécutif

1. **Le « canvas » actuel n'est pas un `<canvas>`** : c'est du rendu **100 % DOM/HTML + SVG** via
   Vue Flow. Le coût de performance vient de la rastérisation par le navigateur de centaines de
   cartes HTML riches (~4 500 éléments DOM intérieurs mesurés sur locasyst, jusqu'à ~570 nœuds sur
   la plus grosse fixture) et d'une synchronisation store→canvas qui **reconstruit tout le graphe à
   chaque changement**.
2. **Copier Figma à l'identique n'est pas la bonne cible.** Figma rend des *vecteurs et du texte*
   (moteur C++→WASM, scène propriétaire, rendu tuilé WebGL/WebGPU, texte par atlas de glyphes).
   Flooow rend des *formulaires interactifs* : inputs, selects, checklists, éditeur riche
   Tiptap/ProseMirror, contenteditable. Porter ces widgets en WebGL pur = réécrire un moteur de
   layout texte + un éditeur riche + l'accessibilité, pour un graphe qui plafonne à ~600 nœuds.
   C'est un chantier de plusieurs mois au bénéfice incertain.
3. **La cible recommandée est une architecture hybride, celle de Miro/Mural/tldraw** : un moteur
   WebGL (Pixi.js v8, backend WebGPU avec repli WebGL2) prend en charge tout ce qui coûte au
   pan/zoom — fond, arêtes, cadres, cartes en niveau de détail réduit, minimap — et le DOM ne sert
   plus qu'à **l'îlot d'édition** : la ou les cartes en cours d'édition, superposées en HTML au bon
   endroit. À zoom de travail, les cartes non éditées sont des textures WebGL ; le DOM monté se
   compte en unités, plus en centaines.
4. **Avant tout WebGL, deux corrections rapportent immédiatement** et restent nécessaires quelle
   que soit la suite : la synchronisation incrémentale (arrêter le `push()` intégral) et la
   virtualisation viewport. Elles réduisent le travail par frame d'un ordre de grandeur pour
   quelques jours d'effort, et l'hybride WebGL se construit par-dessus.

Plan proposé en 4 phases (§6) : mesures → assainissement de la sync → couche WebGL
(fond + arêtes + LOD + minimap) → cartes texturées avec îlots DOM d'édition.

---

## 1. État des lieux du rendu

### 1.1 Pile actuelle

- Une seule instance `<VueFlow>` : `app/src/canvas/FlowCanvas.vue` (752 l.),
  `@vue-flow/core@^1.42.1`. Minimap et Controls installés mais volontairement non utilisés.
- 6 types de nœuds custom, tous en HTML riche : `PageFrame` (242 l.), `BlockNode` (353 l.),
  `FeatureNode` (**886 l.**, le plus lourd), `ModuleFrame` (200 l.), `LotFrame` (95 l.),
  `PortalNode` (100 l.).
- 2 types d'arêtes SVG : `TypedEdge` (Bézier, 3 sous-types stylés) et `TreeEdge` (orthogonal,
  arêtes synthétiques de parenté).
- Layout **100 % maison et déterministe** (aucun dagre/elkjs) : `globalTree.ts` (639 l., couche
  fonctionnelle par niveaux de dépendance globaux), `pageTree.ts` (180 l., arbre « tidy » façon
  Octopus), `cardMetrics.ts` (hauteurs estimées + mesurées par ResizeObserver).
- Pont store→canvas : `useCanvasSync.ts` (**2 874 l.**), déclenché par un signal unique
  `store.graphVersion`.

Point structurant pour la refonte : **le modèle et le layout sont déjà découplés du rendu**. Seuls
`toFlowNodes`/`toFlowEdges`/`push()` et les 8 composants de nodes/edges dépendent de Vue Flow. Le
moteur de rendu est remplaçable sans toucher au cœur.

### 1.2 Volumétrie réelle

| Fixture | Nœuds | Arêtes | Poids |
|---|---|---|---|
| `reference-project.graph.json` | 573 | 39 | 261 Ko |
| `locasyst-project-save.graph.json` | 266 | 201 | 323 Ko |
| `locasyst-project.graph.json` | 205 | 203 | — |

Sur locasyst, le code mesure lui-même : **82 cartes visibles ≈ 4 500 éléments DOM intérieurs dont
~2 000 porteurs de texte** (commentaire `FlowCanvas.vue:113`). C'est l'ordre de grandeur à retenir :
quelques centaines de nœuds, pas des dizaines de milliers. Le problème n'est pas le *nombre*
d'objets (WebGL en avale des millions), c'est le *coût unitaire* d'une carte DOM.

## 2. Où part la performance (diagnostic)

Par gravité décroissante :

| # | Point chaud | Où | Nature |
|---|---|---|---|
| 1 | **Poids DOM par carte** : dizaines d'éléments chacune (Tiptap en lecture, selects, checklist, ports dynamiques…) ; tout le graphe est monté en permanence, re-rastérisé au pan/zoom | `FeatureNode.vue`, `BlockNode.vue` | Structurel — c'est la justification du WebGL |
| 2 | **`push()` intégral** : chaque mutation (`graphVersion`) refait le layout complet, `setNodes(toFlowNodes())` + `setEdges(toFlowEdges())`, et en couche fonctionnelle un 2ᵉ `toFlowEdges()` une frame plus tard | `useCanvasSync.ts:1448-1482` | Architectural — corrigeable sans WebGL |
| 3 | **~7 watchers déclenchent ce `push()`**, dont un `deep` sur la sélection : *cliquer une carte reconstruit tout le graphe fonctionnel* | `useCanvasSync.ts:1743-1750` | Architectural |
| 4 | **Boucle de re-mesure** : ResizeObserver par carte → `cardHeightsVersion` → re-layout complet (coalescé sur rAF, mais un `push()` entier par frame pendant une frappe qui agrandit une carte) | `useCanvasSync.ts:1774-1777` | Architectural |
| 5 | **Aucune virtualisation** : `only-render-visible-elements` de Vue Flow non utilisé ; les nœuds hors viewport restent montés | `FlowCanvas.vue:428-445` | Réglage — quasi gratuit |
| 6 | Collab : un changement distant = reconstruction complète du graphe (même chaîne que #2) | `bridge.ts` → `applyRemote` → `graphVersion` | Architectural |

Déjà bien traité — à conserver tel quel dans toute refonte, la connaissance est capitalisée dans de
longs commentaires mesurés :

- **LOD maison** sous zoom 0.35 : cartes vidées (`visibility:hidden`), coins carrés, fond et arêtes
  fonctionnelles retirés (`FlowCanvas.vue:99-245`, campagne chiffrée fps/ms).
- **Animation des arêtes** `stroke-dashoffset` suspendue sous zoom 0.8 (elle représentait 97 % du
  thread principal ; `TypedEdge.vue:50-81`).
- **Drag discipliné** : le store n'est muté qu'au drop ; le drag Octopus est amorti par hystérésis.
- **Commentaires et curseurs de présence sans coût par frame** (contour CSS contre-zoomé par
  variable ; curseurs téléportés dans le pane transformé).

Autrement dit : l'équipe a déjà poussé le DOM près de ses limites. Le LOD actuel est exactement ce
qu'un moteur WebGL fait nativement et sans couture — c'est le signe que le rendu a atteint le
plafond de sa technologie, et l'argument honnête *pour* la refonte.

### 2.1 Incident réel du 22/07/2026 (pièce au dossier)

Crash Chrome 150 constaté par Hugo pendant une session Flooow, sur MacBook Air M3 **8 Go** +
écran externe QHD. Le rapport macOS montre un `SIGABRT` volontaire du **processus navigateur
principal** (thread `ThreadPoolSingleThreadForegroundBlocking`, `abort_report_np`) — pas le
processus GPU ni le renderer. Ce n'est donc **pas** une preuve de sur-exploitation GPU par le
canvas ; le motif est celui d'un échec d'allocation (chemin OOM) ou d'un `CHECK` interne, dans un
contexte de pression sur les 8 Go de mémoire unifiée (raster + DOM + GPU puisent dans le même
pool sur Apple Silicon). L'onglet Flooow a pu y contribuer par son empreinte mémoire, sans qu'on
puisse l'isoler sur un seul rapport. Conséquences retenues :

- la **machine de référence basse** de la phase 0 est un Mac 8 Go avec écran externe ;
- la baseline doit mesurer l'**empreinte mémoire** (gestionnaire de tâches Chrome : renderer +
  mémoire GPU sur locasyst/reference-project), pas seulement les ms/frame ;
- en cas de nouveau crash : relever `chrome://crashes` — des morts du *GPU Helper* ou du
  *renderer* signeraient une page trop lourde, des morts répétées du navigateur principal la
  pression mémoire système.

## 3. Ce que fait réellement Figma — et ce qui est transposable

Pile Figma (publique via leurs articles d'ingénierie) :

- Moteur C++ compilé en **WASM** ; scène propriétaire, aucun DOM pour le document.
- Rendu **WebGL** (migration WebGPU en cours) **tuilé** : la scène est découpée en tuiles
  rastérisées en cache, seules les tuiles invalidées sont repeintes ; le pan/zoom recompose des
  tuiles déjà prêtes.
- **Texte propriétaire** : moteur de layout texte maison, glyphes rastérisés dans des atlas de
  textures ; l'édition de texte est re-implémentée de zéro (curseur, sélection, IME).
- L'UI applicative (panneaux, inspecteur) reste du DOM (React) ; seul le *document* est en GL.

Ce qui se transpose à Flooow : une scène rétenue hors DOM, le rendu par lots (batching) d'un seul
`<canvas>`, le culling/LOD natifs, le texte par atlas *pour l'affichage*, la séparation stricte
document-GL / chrome-DOM.

Ce qui ne se transpose **pas** : Figma n'a **aucun widget HTML dans son document**. Son contenu est
vectoriel et son édition de texte a coûté des années-ingénieur. Le contenu de Flooow est
l'inverse : des formulaires (selects, inputs, checklists) et du texte riche ProseMirror avec
décorations de commentaires, mentions, slash-commands. Reproduire *ça* en GL pur, c'est réécrire
Tiptap, le layout de texte riche, l'IME, l'accessibilité et le focus clavier. Aucun outil comparable
ne le fait : **Miro, Mural, tldraw rendent la scène en GL/canvas et basculent en HTML superposé
l'objet en cours d'édition**. C'est le modèle pertinent ici.

## 4. Les trois voies possibles

### Voie A — Assainir le DOM existant (sans WebGL)

Sync incrémentale (diff par id au lieu de `setNodes` intégral), retrait du watch `deep` sur la
sélection, `only-render-visible-elements` ou culling maison, `content-visibility: auto` +
`contain: strict` sur les cartes, mémoïsation du mapping.

- Gain : élimine les points #2-#5 ; le pan/zoom reste le coût du DOM mais sur le seul viewport.
- Coût : ~1-2 semaines. Risque faible.
- Limite : le plafond DOM demeure — 60 fps non garantis en dézoom moyen sur gros projet, chaque
  nouvelle fonctionnalité visuelle re-paie le prix. C'est un palier, pas une destination.

### Voie B — Hybride WebGL + îlots DOM (recommandée)

Un moteur GL rend **la scène** : fond, arêtes, cadres (lots/modules/pages), cartes sous forme de
« quads » texturés ou vectoriels selon le zoom, minimap (enfin possible à coût nul), fantômes et
guides de drag, curseurs de présence. Le DOM ne monte que des **îlots** : la carte sélectionnée /
en édition (Tiptap, selects, checklist) positionnée en `transform` au-dessus du canvas, et les
overlays écran existants (panneaux, menus, composer de commentaire) qui ne changent pas.

Trois niveaux de représentation d'une carte :

1. **Zoom < 0.35** (l'actuel LOD) : rectangle GL plat, couleur de statut/lot. Déjà spécifié par le
   LOD existant — il devient natif.
2. **Zoom de travail** : texture de la carte (rastérisée en `OffscreenCanvas`/atlas, ou texte SDF +
   primitives GL pour les badges/pastilles), invalidée seulement quand la donnée change — le
   pendant des tuiles Figma, à la granularité carte.
3. **Carte active** : îlot DOM réel, interactif, identique à aujourd'hui.

- Gain : pan/zoom = recomposition GPU pure quel que soit le projet ; le DOM passe de ~4 500
  éléments à quelques dizaines ; minimap et grosses scènes gratuites ; marge pour des années de
  fonctionnalités visuelles.
- Coût : ~6-10 semaines (détail §6). Risque moyen, **dégradable par étapes** (chaque phase livre
  seule).
- Techno : **Pixi.js v8** (WebGPU d'abord, repli WebGL2 automatique, batching, culling,
  `RenderTexture` pour les cartes, écosystème mûr). Alternative bas niveau (regl/twgl ou moteur
  maison) : à écarter — on re-paierait le batching, l'atlas texte et la gestion de contexte que
  Pixi donne, pour un contrôle dont on n'a pas besoin à cette échelle.

### Voie C — Full GL façon Figma (scène + texte + édition en GL, WASM éventuel)

- Gain marginal sur la voie B : réel seulement au-delà de ~10⁴-10⁵ objets ou pour du zoom
  typographique parfait — hors du domaine de Flooow (~600 nœuds max constatés).
- Coût : 6-12 mois, réécriture de l'édition riche, des décorations de commentaires, de l'IME, de
  l'accessibilité (le canvas est une boîte noire pour lecteurs d'écran : tout l'arbre a11y serait à
  émuler), du focus, des tooltips…
- Verdict : **non recommandée**. La voie B atteint le même ressenti utilisateur (pan/zoom GPU,
  60 fps) sans sacrifier Tiptap ni l'a11y.

## 5. Contraintes de la refonte (relevé exhaustif → annexe)

Les dépendances DOM structurantes qu'une couche GL doit contourner ou conserver :

1. **Vue Flow disparaît dans la voie B** : ses services encore utilisés (pan/zoom, lasso, drag,
   `project()`, handles/`getBoundingClientRect`) sont à réimplémenter côté moteur. C'est borné :
   la config actuelle a déjà désactivé la moitié de Vue Flow (zoom molette, pan drag, elevate…)
   et le layout est maison. Le lasso, le hit-testing et le drag deviennent du picking géométrique
   (plus fiable que `elementFromPoint`, utilisé aujourd'hui à `useCanvasSync.ts:2441`).
2. **ResizeObserver → hauteurs de cartes** : en GL, la hauteur d'une carte se *calcule* (layout
   texte mesurable hors DOM) au lieu de se *mesurer* — `cardMetrics.ts` a déjà la moitié
   estimative de ce chemin ; la boucle mesure→relayout disparaît avec sa classe de bugs.
3. **À conserver en DOM tel quel** : Tiptap/ProseMirror et ses décorations de commentaires (îlot),
   panneaux/menus/composer (overlays écran déjà positionnés par calcul viewport), panneau de
   commentaires, raccourcis (`useKeyboard.ts`), localStorage/clipboard.
4. **Hover/curseurs CSS → événements de picking** GL (hover states des boutons « + », badge
   Éditer, poignées) : à re-router, c'est le poste de détail le plus fourmillant de la migration.
5. **Collab** : curseurs et sélections de pairs deviennent des sprites GL (plus simple
   qu'aujourd'hui) ; le pont Yjs ne change pas, mais exige la sync incrémentale (phase 1) pour ne
   plus tout reconstruire à chaque transaction distante.
6. **A11y** : maintenir un arbre DOM léger *sémantique* (liste des nœuds, focusable, aria-label)
   en parallèle du canvas — pattern standard des canvas accessibles (ce que fait Excalidraw).

L'inventaire fonctionnel complet à iso-périmètre (interactions, édition inline, commentaires v13,
couches/caméras, visuels riches, collab, exports) est en annexe — c'est la check-list de recette de
la refonte.

## 6. Plan recommandé, par phases livrables

**Phase 0 — Mesurer (2-3 j).** Traces Performance sur locasyst + reference-project : pan, zoom,
frappe dans une carte, drag Octopus, changement distant collab. Chiffres de référence (ms/frame,
long tasks, **empreinte mémoire renderer/GPU** — cf. §2.1, machine de référence 8 Go) pour
objectiver chaque phase — les commentaires du code montrent que l'équipe sait déjà
le faire ; il s'agit de constituer la baseline officielle de la refonte.

**Phase 1 — Assainir la sync (1-2 sem).** Voie A : diff incrémental dans `useCanvasSync`,
suppression du `push()` sur sélection, virtualisation. Pré-requis de toute suite ; rapporte seul
l'essentiel des lenteurs *d'interaction* (clic, frappe, collab). Jalon : cliquer/taper ne
reconstruit plus rien.

**Phase 2 — Couche GL sous le DOM (2-3 sem).** Un `<canvas>` Pixi v8 sous le pane : fond, arêtes
(Bézier/orthogonales, styles TypedEdge/TreeEdge), cadres de lots, guides/fantômes de drag,
curseurs de présence, **minimap**. Les cartes restent DOM. Caméra unifiée (le moteur GL devient
maître du viewport, le pane DOM suit en `transform`). Jalon : plus aucun SVG, pan/zoom composite.

**Phase 3 — Cartes GL + îlots DOM (3-5 sem).** Cartes rendues en GL (textures invalidées à la
donnée, LOD 3 niveaux du §4-B), DOM réduit aux cartes actives. Retrait de Vue Flow. Picking,
hover, drag au moteur. Jalon : DOM ≤ quelques dizaines d'éléments quel que soit le projet, 60 fps
au pan sur reference-project.

**Décision explicite en fin de phase 1** : si la baseline montre que phases 1 + LOD suffisent aux
usages réels, les phases 2-3 restent au tiroir avec ce document comme spec. Les chiffres tranchent,
pas l'intuition.

Risques principaux : le rendu texte des cartes texturées (netteté au zoom → re-rasteriser par
palier de zoom, ou MSDF pour les titres) ; la fourmilière des hover/interactions à re-router
(phase 3, prévoir la moitié du temps de la phase) ; la co-existence de deux caméras pendant la
phase 2 (le pane DOM et le canvas GL doivent partager la même matrice, au pixel).

---

## Annexe — inventaire fonctionnel à iso-périmètre (check-list de recette)

- **Interactions** : sélection simple/⇧-multi/lasso partiel ; drag bloc (réordonner/reparenter),
  feature (rattacher/détacher), module (ordre) ; drag Octopus pages (fantôme + slot + hystérésis,
  zones frère/enfant/racine) ; pan molette + Espace ; raccourcis (`useKeyboard.ts` : undo/redo,
  save, outils V/P/B/C/L/M/F, 1/2/3, ⇧1, Suppr cascade) ; menus contextuels (ContextMenu,
  QuickCreateMenu, EdgeTypePopover).
- **Édition inline** : titres (input/textarea `useInlineEdit`) ; contenu riche Tiptap sur carte
  sélectionnée (barre flottante, menus `/` `@` `#`, commit débouncé 400 ms) ; champs structurés
  FeatureNode (lot, code, estimation, statut, checklist, champs de projet) ; création (double-clic
  fond/page/module, boutons « + » au survol, outils de placement, badge Éditer).
- **Commentaires v13** : anneau jaune contre-zoomé (fil sur élément entier), surlignage de passage
  (décorations ProseMirror par texte), compteur 💬, composer ancré suivant la carte, panneau
  latéral synchronisé bidirectionnel (focus croisé, filtres, tags, ✳ Claude), références
  `flooow://` copiables.
- **Couches/vues** : structural/functional exclusives ; funcView plan/module + ModuleRail ; mode
  compact (chaîne de dépendance) ; funcEdgeMode background/portal ; lentille design/dev ; caméra
  par scène (localStorage + mémoire de session, `viewportMemory.ts`) ; saut de fonctionnalité et
  focus croisés (`ui.focusNode`).
- **Visuels** : badges (lot, code, estimation, ⌀, incomplétude, statut, #n live, 🏠) ; anneaux
  (sélection, commentaire, pair collab) ; liseré de lot ; navs en filigrane (opacité 0.3/0.15) ;
  portails ; chaîne mise en avant + grisage ; zone de suivi (checklist + progression + gate) ;
  cadenas de blocage ; libellés contre-zoomés ; LOD < 0.35 ; marching ants de drag.
- **Collab** : rooms Hocuspocus, curseurs monde 30 Hz scoping par couche, facepile présence,
  sélection partagée (outline couleur pair), vue/édition publiées.
- **Exports** : Specs/API Markdown, PDF via `window.print()` — aucun export image du canvas
  aujourd'hui (une refonte GL l'offrirait presque gratuitement, bonus non demandé).
- **A11y/divers** : focus clavier, aria sur les docks, tooltips instantanés, hover généralisés,
  `prefers-reduced-motion` respecté.

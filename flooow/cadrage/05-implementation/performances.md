# Performances

## Budgets (mesurables, testés)

| Métrique | Budget | Condition |
|---|---|---|
| Pan/zoom canvas | 60 fps (pas de frame > 32 ms) | projet de référence : 40 pages, 120 sections, 300 comportements, 20 services |
| Frappe dans le panneau de propriétés | < 16 ms par frappe | aucune répercussion sur le canvas pendant la saisie |
| Drag d'une frame | 60 fps | recalcul d'ordre inclus |
| Ouverture d'un projet 5 Mo | < 1 s | parse + validation + montage canvas |
| Bascule de mode (canvas → specs) | < 200 ms | projet de référence |
| Autosave | imperceptible | jamais dans le chemin d'une interaction |

Un fichier `fixtures/reference-project.flooow.json` (généré par script, tailles ci-dessus) sert aux tests de perf et au smoke Playwright.

## Les trois pièges connus, et leur parade

### 1. Réactivité profonde sur le graphe
Le piège Vue classique : mettre 500 nœuds en `reactive` profond → chaque frappe déclenche des traversées de dépendances énormes.
- Le store garde les nœuds dans un `shallowRef<Map<string, FlooowNode>>` ; une mutation remplace **l'objet nœud** (immutable style) et bump la Map — pas de réactivité intra-objet.
- Les getters dérivés dépendent d'un compteur de version (`graphVersion++` à chaque mutation) plutôt que du contenu profond.
- Conséquence assumée : les composants nœud reçoivent leur donnée par prop et se re-rendent quand leur objet change de référence — c'est exactement le modèle de Vue Flow.

### 2. Store ↔ Vue Flow : mapping, pas partage
- Ne jamais donner les objets du store à Vue Flow par référence. `useCanvasSync.ts` **mappe** `FlooowNode → Node` (Vue Flow) et écoute les events (`onNodeDragStop`, `onConnect`, `onNodesChange`) pour retraduire en actions du store.
- Pendant un **drag**, Vue Flow gère la position seul (état interne) ; le store n'est mis à jour qu'au **drop** (une seule mutation, un seul patch d'undo, un seul autosave). Idem redimensionnement.
- Le badge d'ordre « #n » affiché pendant le drag lit la position live de Vue Flow, pas le store.

### 3. La saisie ne traverse pas le graphe
- Le PropertiesPanel édite un **buffer local** (copie des attrs du nœud sélectionné) ; commit vers le store au blur / à la validation, avec debounce 300 ms sur les champs texte.
- Résultat : taper dans « notes » ne re-rend ni le canvas ni les vues.

## Vues dérivées : lazy et bon marché

- `deriveSpecs` / `deriveApi` sont O(n) et ne tournent que si le mode correspondant est affiché (`computed` évalué à la demande + invalidation par `graphVersion`).
- `spatialOrder` est O(n log n) sur des dizaines d'éléments : recalcul à chaque affichage, pas de cache.
- SpecsView : si > 100 pages, virtualiser la liste (`vue-virtual-scroller`) — hors projet de référence, à ne faire que si mesuré nécessaire.

## Persistance hors du chemin critique

- Autosave : debounce 2 s après la dernière mutation, sérialisation via `structuredClone` puis `JSON.stringify` ; IndexedDB est asynchrone par nature. Si la sérialisation du projet de référence dépasse ~15 ms (à mesurer), la déplacer dans un Web Worker — ne pas le faire préventivement.
- Jamais d'autosave pendant un drag (le store ne mute qu'au drop, donc garanti par construction).

## À faire : culling des nœuds hors écran

Constat mesuré (projet locasyst, 99 nœuds, viewport 1536×960) : `only-render-visible-elements` n'est pas positionné sur `<VueFlow>` et son défaut est `false`. **Tous les nœuds sont montés et stylés en permanence**, soit ~4 400 éléments DOM sous les nœuds.

| zoom | nœuds à l'écran | hors écran |
| --- | --- | --- |
| 1 | 7 | **92** |
| 0,6 | 11 | 88 |
| 0,3 | 38 | 61 |
| 0,117 | 99 | **0** |

Le gain viserait le **zoom de travail** (~93 % des nœuds calculés pour rien à zoom 1), c'est-à-dire exactement le régime que le LOD ne couvre pas — les deux leviers sont complémentaires, pas redondants. Inutile en revanche au zoom LOD, où tout est déjà à l'écran.

**Ce n'est pas un flag à basculer.** `onlyRenderVisibleElements` démonte les nœuds hors écran, or l'autolayout dépend des hauteurs RÉELLES mesurées : `measuredHeightSig()` (`useCanvasSync.ts`) lit le registre alimenté par le `ResizeObserver` de `FeatureNode`, et `functionalLayout` / `blockStackOf` empilent les cartes sur ces hauteurs cumulées. Une carte démontée cesse d'être mesurée et retombe sur l'estimation de `cardMetrics` — c'est l'écart estimé/réel à l'origine du bug « le layout ne se réadapte pas » (864 px estimés contre 749 px réels sur SOC-01). Symptôme attendu : sauts de position au scroll, la hauteur d'une carte dépendant de sa visibilité.

Ordre à respecter le jour où on le fait :

1. rendre le registre de hauteurs **persistant** (conserver la dernière hauteur mesurée d'une carte démontée au lieu de l'oublier) — `useCanvasSync.ts` ;
2. activer `only-render-visible-elements` sur `<VueFlow>` ;
3. garde-fou : vérification de neutralité de layout **en scroll** (mêmes positions/hauteurs avec et sans culling), sur le modèle de la vérification déjà utilisée au franchissement du seuil LOD.

## Divers

- Icônes : sprite SVG local unique (pas de lib d'icônes composant-par-icône qui gonfle le bundle).
- Bundle cible : < 400 Ko gzippé (Vue Flow est la plus grosse part). `rollup-plugin-visualizer` en CI pour surveiller.
- `will-change: transform` sur le viewport du canvas uniquement ; pas de `backdrop-blur` sur des surfaces qui bougent à 60 fps (les panneaux flottants sont fixes → OK).
- Mesure continue : marqueurs `performance.mark/measure` autour de load/parse/derive/export, visibles en dev via un mini-overlay debug (`?perf=1`).

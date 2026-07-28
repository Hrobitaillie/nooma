# Architecture de l'application

> Doc d'implémentation destinée aux agents IA qui développent le MVP. Prérequis de lecture : [decisions.md](../01-vision/decisions.md), [frames-et-scopes.md](../02-fonctionnalites/frames-et-scopes.md), [modele-de-donnees.md](../03-technique/modele-de-donnees.md). En cas de conflit entre ce doc et les décisions actées, **les décisions priment**.

## Stack (actée, non négociable)

Vue 3 (Composition API, `<script setup>`) · TypeScript strict · Vite · **Vue Flow** (@vue-flow/core) · Pinia · Tailwind CSS. Aucun backend, aucune requête réseau à l'exécution (voir [securite.md](securite.md)). Cible : navigateurs Chromium récents (File System Access API), dégradation propre sur Firefox/Safari (download/upload).

## Principe directeur

> **Une seule source de vérité : le store `project` (le graphe). Tout le reste est dérivé.**

- Le canvas **édite** le graphe via les actions du store — jamais d'état métier local dans les composants.
- Les vues Specs / API / Chiffrage sont des **getters** (projections pures) — zéro duplication de données.
- La persistance sérialise le store ; l'undo/redo rejoue des patches sur le store.

## Arborescence source

```
src/
  main.ts                    # bootstrap : Pinia, app, gestion erreurs globales
  App.vue                    # shell : canvas plein écran + calque de panneaux flottants
  model/
    types.ts                 # types TS du format projet (miroir exact du schéma)
    schema.ts                # validation zod du format (load + import)
    factory.ts               # createPage(), createSection(), createBehavior()… valeurs par défaut
    migrations.ts            # registre { fromVersion: (doc) => doc } appliqué en chaîne
  stores/
    project.ts               # LE graphe : nodes, edges, meta, site + actions de mutation
    ui.ts                    # mode courant, sélection, panneaux ouverts, filtres facette/lot, zoom
    history.ts               # pile undo/redo (patches inverses), cap 100
  domain/                    # logique métier PURE (fonctions sans dépendance Vue — testable unitairement)
    ordering.ts              # ordre spatial haut→bas / gauche→droite avec tolérance de rangée
    lots.ts                  # resolveLot(nodeId) : héritage via parentId
    facets.ts                # filtrage par facette
    rollup.ts                # descendants d'une frame, agrégation
    reachability.ts          # pages orphelines (parcours navigatesTo depuis la home)
    completeness.ts          # champs obligatoires par type → score de complétude
    derive/
      specs.ts               # graphe → structure du cahier des specs
      api.ts                 # graphe → vue API (par service / par page)
      estimate.ts            # graphe → totaux heures par lot/page/facette (V2, poser l'interface)
    invariants.ts            # règles du modèle (cf. modele-de-donnees.md) vérifiées après chaque mutation en dev
  canvas/
    FlowCanvas.vue           # instance Vue Flow, mapping store ↔ nodes/edges Vue Flow
    nodes/PageFrame.vue      # frame page (conteneur)
    nodes/SectionFrame.vue   # frame section (enfant de page)
    nodes/BehaviorNode.vue
    nodes/ServiceNode.vue
    edges/TypedEdge.vue      # styles par type de lien
    useCanvasSync.ts         # synchronisation position/parent drag&drop → store
  panels/                    # UI flottante (voir interface.md)
    PanelLayer.vue           # calque overlay au-dessus du canvas
    ModeSwitcher.vue         # Canvas / Specs / API
    ToolDock.vue             # outils de création (gauche)
    PropertiesPanel.vue      # édition du nœud sélectionné (droite)
    FilterBar.vue            # facettes + lots
    StatusChip.vue           # état de sauvegarde
    ZoomBar.vue
  views/
    SpecsView.vue            # projection cahier des specs (lecture seule)
    ApiView.vue              # projection API (lecture seule)
  io/
    file.ts                  # ouvrir/sauver : FS Access API + fallback download/upload
    autosave.ts              # snapshot IndexedDB debounced + récupération au boot
    export/markdown.ts       # cahier des specs + contrat d'API en Markdown
    export/pdf.ts            # V1 — à partir du Markdown
  composables/
    useKeyboard.ts           # raccourcis globaux (voir interface.md)
```

## Flux de données

```
interaction canvas / panneau
        │  (action Pinia uniquement)
        ▼
stores/project  ──── history.record(patch, inversePatch)
        │
        ├── getters domain/* ──► FlowCanvas (nodes/edges), SpecsView, ApiView, FilterBar
        └── watch (debounce 2 s) ──► io/autosave (IndexedDB)
                    manuel (⌘S) ──► io/file (fichier .flooow.json)
```

Règles :
1. **Aucun composant ne mute `project` directement** — toujours une action nommée (`addFrame`, `moveNode`, `linkNodes`, `updateAttrs`, `assignLot`…). C'est ce qui rend l'undo/redo et les invariants possibles.
2. Les actions valident les invariants ([invariants.ts](logique-algorithmes.md)) ; en dev elles `throw`, en prod elles refusent la mutation et loggent.
3. `domain/` ne connaît ni Vue, ni Pinia : fonctions pures `(graph) => résultat`, couvertes par des tests unitaires Vitest.

## Modes applicatifs

L'app a un seul écran, trois modes exclusifs pilotés par `ui.mode` :

| Mode | Contenu central | Panneaux visibles |
|---|---|---|
| `canvas` | FlowCanvas | tous |
| `specs` | SpecsView | ModeSwitcher, FilterBar, StatusChip |
| `api` | ApiView | ModeSwitcher, FilterBar, StatusChip |

Le passage de mode ne recharge rien : les projections sont des computed, calculées à l'affichage (lazy).

## Conventions de code

- TS `strict: true`, pas de `any` non justifié ; ESLint (`@antfu/eslint-config` ou équivalent) + Prettier.
- Nommage : types du modèle préfixés (`FlooowNode`, `FlooowEdge`, `ProjectDoc`) pour ne jamais les confondre avec les types Vue Flow (`Node`, `Edge`).
- Les IDs sont des slugs lisibles générés par `factory.ts` (`page-tableau-de-bord`, suffixe `-2` en cas de collision).
- Tests : Vitest sur `domain/` et `model/` (couverture cible 90 % sur ces dossiers), un smoke test Playwright (créer page → section → comportement → vérifier la vue specs).

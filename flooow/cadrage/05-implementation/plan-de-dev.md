# Plan de développement — instructions aux agents IA

## Comment utiliser ce dossier

1. Lire dans l'ordre : [decisions.md](../01-vision/decisions.md) → [frames-et-scopes.md](../02-fonctionnalites/frames-et-scopes.md) → [modele-de-donnees.md](../03-technique/modele-de-donnees.md) → les 6 docs de `05-implementation/`.
2. **Hiérarchie normative** : décisions actées > docs d'implémentation > ton jugement. Si un doc d'implémentation contredit une décision, suivre la décision et signaler le conflit. Si un choix n'est spécifié nulle part, prendre l'option la plus simple et la **documenter dans le code** (pas de nouvelle dépendance sans justification — cf. [securite.md](securite.md) §4).
3. Ne pas implémenter au-delà du jalon en cours. Les items « V2 » (vue chiffrage, présets, PDF stylé, schéma extensible) ont leurs **interfaces** posées mais pas leurs implémentations.
4. Chaque jalon se termine par : tests verts, lint vert, critères d'acceptation vérifiés (idéalement via Playwright), démo possible.

## Mise en place (jalon M0)

- `pnpm create vite` (vue-ts) à la racine du repo dans `app/` ; le dossier `cadrage/` reste intact.
- Dépendances : `@vue-flow/core`, `pinia`, `zod`, `tailwindcss`. Dev : `vitest`, `@vue/test-utils`, `playwright`, ESLint+Prettier.
- Arborescence de [architecture.md](architecture.md), fichiers vides avec TODO. CI (si repo distant) : lint + tests + build + `pnpm audit`.
- **Critères** : `pnpm dev` affiche le shell (canvas vide + PanelLayer avec ModeSwitcher factice) ; `pnpm test` et `pnpm build` passent.

## M1 — Modèle & store (le socle, sans UI)

- `model/types.ts`, `model/schema.ts` (zod strict), `model/factory.ts`, `model/migrations.ts` (registre vide + mécanique).
- `stores/project.ts` : état, index `Map<id, node>` + index enfants, toutes les actions (`addFrame`, `addBehavior`, `addService`, `updateAttrs`, `moveNode`, `resizeNode`, `reparent`, `assignLot`, `removeNode` cascade, `addEdge`, `removeEdge`, `setHomePage`, `updateMeta`).
- `domain/` complet : ordering, lots, rollup, reachability, completeness, invariants, derive/specs, derive/api, derive/estimate (cf. [logique-algorithmes.md](logique-algorithmes.md)).
- `stores/history.ts` : patches inverses, coalescence, cap 100.
- **Critères** : couverture Vitest ≥ 90 % sur `domain/` et `model/` ; les cas limites d'`ordering` (rangées, égalités, déterminisme) et `lots` (héritage, override, ré-héritage) sont testés ; `checkInvariants` attrape chaque violation listée.

## M2 — Canvas

- `FlowCanvas.vue` + `useCanvasSync.ts` (mapping store↔Vue Flow, mutations au drop uniquement — cf. [performances.md](performances.md) §2).
- Nœuds custom : PageFrame (imbrication `parentNode`/`extent`), SectionFrame, BehaviorNode, ServiceNode ; TypedEdge (4 styles).
- Interactions : double-clic création, drag/resize, reparent section entre pages, connexion typée avec **validation à la connexion** (refuser `navigatesTo` hors page→page, etc.), suppression avec confirmation en cascade, badge d'ordre pendant le drag, pastilles incomplétude/orpheline.
- **Critères** : scénario Playwright « créer 2 pages, 1 section, la déplacer vers l'autre page, relier les pages, undo ×3, redo ×3 » sans erreur console ; drag fluide sur le projet de référence.

## M3 — Panneaux flottants & édition

- PanelLayer + FloatingPanel de base, puis ModeSwitcher, ToolDock, PropertiesPanel (buffer local + commit au blur, formulaires par type, lot avec provenance d'héritage, facette), FilterBar (estompage), ZoomBar, StatusChip, SearchPopover, useKeyboard (table d'[interface.md](interface.md)).
- **Critères** : tout est faisable au clavier ; la frappe dans les propriétés ne re-rend pas le canvas (vérifiable via l'overlay `?perf=1`) ; filtres facette/lot corrects.

## M4 — Vues dérivées

- SpecsView et ApiView consommant `derive/specs` et `derive/api` (mêmes structures que l'export), warnings en tête, filtres partagés, clic sur un élément → bascule canvas centré dessus.
- **Critères** : cohérence stricte vue ↔ export (même dérivateur) ; bascule de mode < 200 ms sur le projet de référence.

## M5 — Persistance

- `io/file.ts` (FS Access + fallback), `io/autosave.ts` (debounce, rotation 5, récupération au boot), `beforeunload`, pipeline complet de validation à l'ouverture ([securite.md](securite.md) §2), StatusChip branché.
- **Critères** : cycle ouvrir → éditer → ⌘S → rouvrir identique ; crash simulé (kill onglet) → récupération proposée et fonctionnelle ; fichier corrompu/hostile (fixtures dédiées : clé inconnue, cycle parentId, 6 000 nœuds, version 99) → refus propre avec message clair.

## M6 — Exports & finitions V0→V1

- `export/markdown.ts` : cahier des specs (transversal + pages ordonnées) et contrat d'API, avec échappement ([securite.md](securite.md) §1) ; en-tête daté + avertissement d'incomplétude. `export/pdf.ts` : impression navigateur stylée (`@media print` sur SpecsView) pour commencer — un vrai pipeline PDF attendra.
- Test réseau-zéro Playwright ([securite.md](securite.md) §3). CSP en place et app fonctionnelle avec.
- **Critères** : l'export Markdown du projet de référence est lisible et complet ; budgets de [performances.md](performances.md) tenus ; `pnpm build` sert un dossier statique autonome.

## Définition de « fini » (globale)

- Zéro erreur/warning console sur les parcours Playwright.
- `pnpm lint`, `pnpm test`, `pnpm build` verts ; bundle < 400 Ko gz.
- Les 6 docs de ce dossier restent exacts : **si l'implémentation dévie, mettre à jour le doc dans le même commit** — ce dossier est la référence des agents suivants.

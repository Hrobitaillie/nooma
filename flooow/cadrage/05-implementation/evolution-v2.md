# Évolution v2 — blocs, notes, connecteurs, API, interactions

> **Contrat des agents pour l'itération v2.** Priorité normative : [decisions.md](../01-vision/decisions.md) > ce doc > les autres docs d'implémentation (qui décrivent la v1). Là où ce doc contredit `donnees-json.md` / `noeuds-et-liens.md`, **ce doc fait foi** (format v2). Le reste (sécurité, perfs, principe « un graphe, plusieurs vues », UI flottante) reste valable.

Objectif : faire passer Flooow d'un canvas de nœuds génériques à un **outil de structuration de pages** — pages composées de blocs pleine largeur typés, annotées par des notes (comportements, appels API) reliées par proximité.

---

## 1. Modèle de données (format v2)

`meta.formatVersion = 2`. Deux structures : un **arbre de contenance** (`parentId`) et un **registre de services** + des **notes rattachées** (`attachedTo`) + quelques **arêtes manuelles** (`edges`).

### 1.1 Nœuds

```ts
type NodeType = 'frame' | 'note'
type FrameKind = 'page' | 'block'
type NoteKind  = 'behavior' | 'api'
type BlockType = 'hero' | 'cta' | 'grid' | 'damier' | 'menu' | 'footer' | 'feature' | 'free'
type Facet = 'front' | 'back' | 'fullstack'
```

**Frame `page`** — écran/route. Position x/y libre. Porte des **ports de navigation** (handles) pour `navigatesTo`.
`attrs`: `name, route?, roles[], description, constraints[], logic, notes`.

**Frame `block`** — bloc pleine largeur empilé dans une page. `parentId` = la page.
- **Pleine largeur, non redimensionnable** : la largeur d'un bloc = la largeur de contenu de sa page ; hauteur fixe par type (gabarit). On ne stocke PAS de `size` pour un bloc.
- **Ordre = position verticale** : les blocs s'empilent ; `position.y` détermine l'ordre (l'`x` est forcé au bord gauche de la page). Réordonner = glisser verticalement.
- `attrs`: `name, blockType, description, constraints[], notes`.
- Chaque `blockType` a un **mini-gabarit visuel** (wireframe schématique) affiché dans le nœud (ex. `grid` = 3 colonnes image+légende ; `damier` = 2 colonnes texte/image ; `hero` = grand bandeau ; `menu`/`footer` = barres ; `cta` = bouton centré ; `feature` = icône+texte ; `free` = vide).

**Note `behavior`** — carte flottante rattachée à UNE cible (`attachedTo` = id d'une page ou d'un bloc). Position x/y libre. Reliée par **connecteur de proximité** (voir §2).
`attrs`: `name, description, facet?, trigger, rules, hours?, notes`. `lot?` sur le nœud.

**Note `api`** — carte flottante rattachée à une cible (`attachedTo`). Référence un service du registre + un endpoint.
`attrs`: `serviceId, method, path, notes, facet?`. `lot?`.

### 1.2 Registre de services (plus des nœuds du canvas)

```ts
interface Service {
  id: string
  name: string
  baseUrl: string        // « URL de base » — regroupe les endpoints dans la vue API
  auth: string
  risk: 'low' | 'medium' | 'high'
  endpoints: { method: string; path: string; notes: string }[]
  notes: string
}
```
Stocké dans `doc.services: Service[]`. Une note API pointe un `serviceId` + (`method`,`path`). L'**autocomplétion** de saisie d'une note API propose les services et endpoints existants du registre (et permet d'en créer).

### 1.3 Arêtes manuelles (`edges`) — réduites

Seules relations à ports restantes :
- `navigatesTo` : **page → page uniquement** (ports de navigation).
- `triggers` : note comportement → note comportement.
- `dependsOn` : entre notes (ou page↔page) — dépendance générique.

Les anciennes arêtes `consumes` disparaissent : une consommation d'API est désormais une **note API** rattachée (`attachedTo`) + connecteur de proximité, pas une arête.

### 1.4 Document

```jsonc
{
  "meta": { "name","formatVersion":2,"createdAt","updatedAt","pricing","homePageId" },
  "site": { "attrs": { "context","constraints":[],"notes" } },
  "services": [ /* Service[] */ ],
  "nodes": [ /* frame(page|block) | note(behavior|api) */ ],
  "edges": [ /* navigatesTo | triggers | dependsOn */ ]
}
```

### 1.5 Migration v1 → v2 (`migrations[1]`)

Best-effort, couverte par des tests sur les fixtures v1 :
- frame `kind:'section'` → `kind:'block'`, `attrs.blockType='free'`.
- nœud `type:'behavior'` (v1, avec `parentId`) → `type:'note'`, `kind:'behavior'`, `attachedTo = parentId`, `parentId = null`, position conservée.
- nœud `type:'service'` (v1) → entrée du registre `services[]` (name/auth/risk/endpoints repris) ; retiré des nœuds.
- arête `consumes` → note `api` rattachée à la source, `serviceId` = ex-service cible, endpoint depuis `endpointRef` (parse « GET /x »), position proche de la source ; retirée des edges.
- arêtes `navigatesTo` conservées ; `triggers`/`dependsOn` conservées.
- `meta.formatVersion` → 2.

---

## 2. Canvas & rendu

- **Pages** : rectangles à en-tête (nom + route + badge lot + pastille incomplétude), ports de navigation gauche/droite. Contiennent la pile de blocs.
- **Blocs** : pleine largeur de la page, empilés verticalement, **non redimensionnables** ; affichent leur mini-gabarit visuel + nom (éditable inline). Glisser un bloc verticalement le réordonne (ordre = cahier). Glisser un bloc dans une autre page le reparente (comme les sections v1, restreint aux pages).
- **Notes (behavior/api)** : cartes flottantes compactes affichant leur **contenu** (nom + résumé : trigger/heures pour un comportement ; `METHOD /path` + service pour une API). **Éditables inline**. Reliées à `attachedTo` par un **connecteur automatique** : segment du bord de la note vers le **côté le plus proche** du rectangle cible (recalculé au déplacement). Pas de handle à tirer.
- **Focus & filtres d'opacité** :
  - Filtre type de note (`ui.noteFilter: 'behavior'|'api'|null`) : les notes hors-type tombent à opacité réduite (~.25).
  - À la sélection d'une page/bloc : ses notes rattachées (transitivement, bloc inclus) passent à 100 %, les autres notes s'estompent. Se combine avec le filtre facette/lot existant (estompage, jamais masquage).

---

## 3. Interactions rapides

- **Quick-create au lâcher d'un lien dans le vide** : tirer depuis un port de page (ou depuis une note) et relâcher sur le fond ouvre un **menu au curseur** proposant de créer + relier : « Page (naviguer vers) », « Bloc », « Note comportement », « Note API ». L'élément créé est pré-rattaché/relié à la source.
- **Menu contextuel (clic droit)** sur un élément : Supprimer (cascade + confirmation si enfants), Définir comme page d'accueil (page), Changer le type (bloc → sous-menu de `BlockType` ; note → behavior/api), Dupliquer (optionnel).
- **Édition inline** : double-clic sur le titre d'une page/bloc ou sur le contenu d'une note → champ éditable ; commit au blur/Entrée, annulation à Échap. N'ouvre pas le panneau ; le PropertiesPanel reste pour le détail.
- **Clic sur une arête** → petit popover pour **changer son type** parmi les types valides pour cette paire d'extrémités (ex. entre deux notes : triggers ↔ dependsOn), et supprimer l'arête.

---

## 4. Vues dérivées (mises à jour)

- **Specs** : page → ses **blocs** (ordre vertical) → pour chaque bloc, ses **notes** rattachées (comportements, appels API) + contraintes ; puis notes/contraintes propres à la page. Le `blockType` est indiqué.
- **API** : regroupée **par service** (URL de base en tête), listant sous chaque service tous les endpoints référencés par des notes API, et pour chaque endpoint les pages/blocs consommateurs (remonter `attachedTo`). Services `risk:high` en tête. Base de l'export contrat d'API.
- **Complétude** : page → name+route+description ; bloc → name+blockType ; note comportement → name+trigger ; note API → serviceId+method+path.
- **Ordre** : pages par ordre spatial (haut→bas, gauche→droite) ; blocs d'une page par `position.y` (pile) ; notes d'une cible par `position.y`.

---

## 5. Projet de démo

`app/fixtures/demo-project.flooow.json` : un projet métier réaliste et parlant (ex. **portail client B2B** : accueil avec hero/menu/features/footer, page catalogue avec blocs grille, page compte, etc.), valide contre le schéma v2, montrant chaque type de bloc, des notes comportement et API, plusieurs services avec URL de base. Chargeable via `io/demo.ts#loadDemoProject()` et une entrée de menu « Charger la démo » (menu fichier du StatusChip). **À maintenir à jour à chaque évolution** — c'est un critère de « fini ».

---

## 6. Découpage de build (agents)

1. **Modèle v2** (séquentiel) : types, schema zod v2, factory, migrations v1→v2, store (actions blocs/notes/services + `ui.noteFilter`), domaine (ordering pile de blocs, rollup via `attachedTo`+`parentId`, derive/specs & derive/api v2, completeness, invariants), tous les tests. Stubs des nouveaux composants (BlockNode, NoteCard, connecteurs, QuickCreateMenu, ContextMenu) et `io/demo.ts` pour rester vert.
2. **Canvas & interactions** : rendu blocs empilés + notes + connecteurs de proximité + ports nav ; quick-create, menu contextuel, édition inline, popover type d'arête, opacité focus/filtre.
3. **Panneaux** : PropertiesPanel par type (page/bloc/note behavior/note API avec autocomplétion service+endpoint), FilterBar (type de note + facette + lot), sélecteur de `BlockType`.
4. **Vue API & exports** : ApiView groupée par service/URL de base ; exports Markdown specs (blocs+notes) et contrat d'API.
5. **Démo** : fixture v2 réaliste + `io/demo.ts` + entrée de menu.
6. **Intégration & vérif** : build, tests, smoke Playwright (charger démo, empiler blocs, quick-create, menu contextuel, inline edit, type d'arête, vue API groupée, filtre notes), captures, punch-list honnête.

---

## 7. Navigation canvas (livré 2026-07-07)

Le clic gauche sert à la **sélection**, pas au pan (Vue Flow `panOnDrag=false`, `selectionKeyCode=true`, `selectionMode=Partial`). Déplacement du canvas : **Espace maintenu + drag** (`panActivationKeyCode='Space'`, curseur `grab`) ou **trackpad** (`panOnScroll=true` ; `zoomOnScroll=false`, pinch/ctrl+molette pour zoomer). `zoomOnDoubleClick=false` pour libérer le double-clic (création de page). Résultat : drag sur le fond = **rectangle de sélection multiple** ; drag sur un nœud = déplacement (du groupe si multi-sélection).

## 8. Portails = mode de rendu d'un lien (spec révisée 2026-07-07)

Problème : un lien dont le tracé direct **repart en arrière** ou **traverse une page/un élément** s'entremêle. Solution : le rendre en **portail** — deux pastilles de renvoi près de chaque extrémité (« off-page connector » des organigrammes) au lieu d'une longue ligne.

> **Décision clé** : un portail n'est **PAS un type de nœud**. C'est un **mode de rendu d'une arête**. Le modèle est donc bien plus simple qu'une paire de nœuds : une arête est soit `line`, soit `portal`. Aucune logique domaine spéciale — un portail reste l'arête `navigatesTo`/`triggers`/`dependsOn` qu'il est, comptée normalement dans les vues dérivées ; seul son **rendu** change.
>
> ⚠️ **Nettoyage** : une implémentation abandonnée « portail = nœud » est présente dans l'arbre (type `PortalNode`, `PortalAttrs`, garde `isPortal`, `domain/portals.ts`, `addPortalPair`, invariants/completeness de portail, panneaux à moitié migrés → build cassé). **La supprimer entièrement** avant d'implémenter ce qui suit.

**Modèle** — sur l'arête (`FlooowEdge.attrs`) :
- `render?: 'line' | 'portal'` (défaut `'line'`).
- Fonctionne pour **toute arête manuelle**, entre **n'importe quels éléments** : page↔page, page↔bloc, bloc↔bloc (les types d'arête restent `navigatesTo` page→page, `triggers` note→note, `dependsOn` générique ; un lien page↔bloc / bloc↔bloc est un `dependsOn`). Le rendu portail est **orthogonal** au type d'arête.

**Auto à la création seulement** (choix acté, détection CORRIGÉE 2026-07-08) : quand une arête est créée (onConnect / quick-create), le canvas décide `render` selon un **critère unique — le chevauchement**, jamais la direction :
- Les pages ont des poignées FIXES : `nav-source` à droite, `nav-target` à gauche → un lien part toujours du **bord droit de la source** vers le **bord gauche de la cible**.
- `portal` si ce segment (bord droit source → bord gauche cible, décalé de quelques px hors des bords) **traverse le rectangle d'UNE frame quelconque, source et cible INCLUSES** (un lien qui repart en arrière retraverse le corps de ses propres pages) ; sinon `line`.
- Exemples : droite-de-MonCompte → gauche-de-Commande (adjacentes) ne traverse rien → **ligne** ; droite-de-Commande → gauche-de-MonCompte retraverse Commande → **portail**.

**Ré-évaluation au déplacement (révisé 2026-07-08)** : le choix ligne/portail se refait aussi **au drop d'un déplacement de frame** — déplacer une page peut obstruer ou libérer le tracé d'arêtes (y compris entre deux autres pages), donc on ré-évalue **toutes** les arêtes manuelles. Uniquement au drop, jamais pendant le drag. (Le « à la création seulement » initial ne suffisait pas : après réorganisation les portails restaient périmés.)

**Verrou manuel** : `edge.attrs.renderManual?: boolean`. La bascule manuelle (popover d'arête clic/clic-droit, ou clic-droit sur un nœud portail : « convertir en portail/ligne », « supprimer ») pose `renderManual = true`. La ré-évaluation automatique — à la création ET au déplacement — **ignore** les arêtes verrouillées (l'utilisateur a choisi).

**Rendu portail — nœuds déplaçables reliés par un tracé** : un portail n'est PAS une pastille collée au bord. Chaque extrémité est un **petit nœud déplaçable** (pastille étiquetée par « l'autre bout » : côté source « → [nom cible] », côté cible « ← [nom source] »), **relié à son élément par un court tracé** — pour pouvoir réagencer le placement. Positions stockées dans `edge.attrs.portalPositions: { source:{x,y}, target:{x,y} }` (auto-placées à la création près de chaque extrémité ; déplaçables ensuite ; défaut calculé si absentes). Pas de long tracé entre les deux extrémités. Cliquer une pastille centre le canvas sur l'autre bout. Un portail n'a pas de waypoints. Vaut pour tout type d'arête (navigation ET dépendance).

**Vues dérivées / invariants** : rien de spécial — `render` est purement visuel ; les arêtes portail comptent comme leurs arêtes normales (l'arborescence via `navigatesTo` est inchangée). Pas de `domain/portals.ts`.

**Démo** : mettre la navigation Mon compte ↔ Commande (qui se croise) en `render:'portal'` pour illustrer.

## 9. Tracés de navigation ORTHOGONAUX automatiques (révisé 2026-07-08, remplace les waypoints)

Les **arêtes manuelles typées** (navigatesTo, triggers, dependsOn) sont tracées en **orthogonal automatique** (segments à angles droits) via le routeur natif de Vue Flow `getSmoothStepPath` — **plus de points d'inflexion** (les waypoints éditables ont été RETIRÉS : moins de manipulations, décision Hugo). `edge.attrs.waypoints` supprimé du modèle/schéma/store/tests.

**Code couleur des liens** (centralisé dans `theme/tokens.ts`) : **GRIS** = navigation (`navigatesTo` + portails : pastilles `PortalNode` + connecteurs `portalTie`) · **ORANGE** = note comportement (carte + connecteur + `triggers`) · **BLEU** = note API (carte + connecteur). Le connecteur d'une note reprend la couleur de la note.

**Connecteurs de proximité note→cible** : orthogonaux (H/V), les DEUX points (note ET cible) glissent le long de leur bord vers le recouvrement vertical/horizontal des deux rectangles → tracé **droit** dès qu'un recouvrement existe, sinon 2 virages à angles droits.

## 9bis. Auto-layout des notes (livré 2026-07-08)

Les notes s'empilent automatiquement, **alignées et à espacement égal**, sur un **côté** (gauche/droite/haut/bas) de leur page. On choisit le côté en **glissant** la note (au drop, le côté = le bord dont elle est le plus à l'extérieur). Regroupement par **cible** : les notes d'un **bloc** sont centrées sur ce bloc (face à leur composant), séparément des notes de la page. Positions calculées côté canvas (`computeNoteLayout`), pas de changement de modèle.

## 10. Découpage de build (portails + waypoints)

1. **Modèle & nettoyage** (séquentiel) : **SUPPRIMER** l'implémentation abandonnée « portail = nœud » (type `PortalNode`, `PortalAttrs`, `isPortal`, `domain/portals.ts`, `addPortalPair`, invariants/completeness de portail, refs dans panneaux) → build vert. Ajouter sur l'arête : `attrs.render:'line'|'portal'` (défaut line) + `attrs.waypoints?:{x,y}[]` (déjà partiellement là). Store : `setEdgeRender(edgeId, mode)` / `toggleEdgeRender(edgeId)` ; `setEdgeWaypoints`/add/move/remove. **Aucune** logique domaine portail (render est visuel). Tests.
2. **Canvas** : `TypedEdge` rend soit une **ligne** (avec waypoints : double-clic ajoute, poignées draggables, clic droit supprime), soit un **portail** (deux pastilles aux extrémités, clic = centrer l'autre bout). **Auto à la création** : dans `useCanvasSync` onConnect / quick-create, détecter chevauchement d'un nœud non-extrémité ou recul → `render:'portal'`, sinon `'line'` (helper géométrique côté canvas, utilise PAGE_WIDTH/pageHeight/positions). Bascule manuelle via popover d'arête + menu contextuel (« convertir en portail/ligne »).
3. **Intégration & démo & vérif** : build/lint/tests ; démo (Mon compte ↔ Commande en portail + un waypoint sur une nav restante) ; smoke Playwright (créer un lien qui recule → devient portail ; convertir ligne↔portail ; ajouter/déplacer un waypoint) ; captures ; punch-list.

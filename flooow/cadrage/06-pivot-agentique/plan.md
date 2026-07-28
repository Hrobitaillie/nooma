# Pivot agentique — plan d'évolution

> Issu de la restitution aux développeurs (juillet 2026). Constat partagé : Flooow est
> aujourd'hui un outil d'**édition**, alors que notre méthodo réelle est du **cadrage
> agentique** — on exprime les caractéristiques du projet à Claude, et c'est lui qui
> rédige et met à jour les documents de cadrage. L'app doit pivoter vers la
> **visualisation de données et le suivi de projet** ; l'écriture du cadrage passe par
> l'agent.

## 1. La cible

Trois rôles, trois responsabilités :

| Acteur | Responsabilité | Surface |
|---|---|---|
| **Claude** | Rédige et fait évoluer le cadrage : pages, blocs, fonctionnalités, contenus, liens, services | CLI/API d'opérations sur le projet |
| **L'app Flooow** | Visualise le graphe (canvas, specs, API, catalogue), suit l'avancement (états, métadonnées, points d'attention), permet la revue de ce que l'agent a produit | Vues en lecture + édition légère (états, métadonnées) |
| **L'humain** | Arbitre : valide, tranche les questions ouvertes, ajuste les métadonnées, réarrange le canvas | L'app + la conversation avec Claude |

La promesse d'origine (« un graphe, plusieurs vues », cf. [concept.md](../01-vision/concept.md))
ne change pas — c'est le **producteur** du graphe qui change : l'atelier de saisie manuelle
devient une conversation avec un agent qui écrit dans le graphe.

## 2. État des lieux — ce qui aide, ce qui bloque

Audit du code (juillet 2026, format v8 en cours de pose) :

**Ce qui aide fortement :**

- Tout le dérivé (specs, catalogue, API, attention, complétude, estimations) est
  **recalculé à la volée** depuis `ProjectDoc` — rien de calculé n'est persisté. La
  refonte du stockage n'a que des sources de vérité à répartir.
- `@flooow/core` est déjà découplé de l'UI : modèle zod strict, invariants globaux,
  migrations chaînées, dérivateurs purs. C'est la brique sur laquelle tout le pivot
  s'appuie.
- Le Y.Doc collab utilise déjà **une Y.Map par collection** avec merge par id
  (`packages/core/src/collab/ydoc.ts`) : la granularité CRDT existe.
- L'export Markdown existe (`app/src/io/export/markdown.ts`) et couvre specs, catalogue
  et API — bonne base pour les « lectures agent ».
- Le contrôle d'accès lecture/écriture existe (rôle `client` vs `dev`/`marin`).

**Ce qui bloque :**

1. **Un agent ne peut pas écrire dans un projet ouvert.** La persistance réelle passe
   par Yjs/Hocuspocus : le `.flooow.json` n'est lu qu'au *premier* ouvreur d'une room,
   il n'y a aucun watcher, et `onStoreDocument` réécrit le fichier depuis le Y.Doc
   (débounce ≤ 5 s). Une modification externe du fichier pendant qu'un client est
   connecté est **silencieusement écrasée**. C'est le verrou n° 1.
2. **Le monolithe JSON est illisible pour un agent.** Un projet réel fait 265–300 Ko
   (jusqu'à 573 nœuds dans un seul tableau `nodes`), le contenu riche est du JSON
   ProseMirror verbeux, et il faut tout charger pour lire quoi que ce soit.
3. **L'export Markdown est unidirectionnel.** `docToMarkdown` existe, le chemin retour
   (markdown → `RichDoc`) n'existe pas. Or c'est le format naturel d'écriture d'un agent.
4. **Aucun modèle d'état d'avancement.** Pas de statut, pas de progression, pas de
   journal, pas de notion de « produit par l'agent, à relire ». Le suivi actuel se
   résume à la complétude dérivée + estimations + risque + lots.
5. **L'UI est massivement orientée création** : canvas d'édition
   (`useCanvasSync.ts`, 115 Ko), stack TipTap complète (slash / mentions / refs),
   panneaux d'édition denses. La visualisation pure (`ApiView`, `RichContent`,
   `AttentionSidebar`) est minoritaire.

## 3. Architecture cible

### 3.1 Un seul chemin d'écriture : le serveur, via le Y.Doc

Toute écriture — humaine (app) ou agentique — converge vers le Y.Doc de la room, dont
le serveur persiste l'état. L'agent ne touche **jamais** les fichiers d'un projet
directement : il appelle une **API d'opérations**.

```
Claude ──► CLI `flooow` ──► API serveur ──► ops validées ──► Y.Doc ──► onStoreDocument ──► disque
Humain ──► app (store) ───► bridge Yjs ─────────────────────► Y.Doc ──► idem
```

- Hocuspocus fournit `openDirectConnection(docName)` côté serveur : le serveur peut
  ouvrir/muter une room **que des clients y soient connectés ou non**. Room ouverte →
  les clients voient la modification en direct (l'app se met à jour pendant que Claude
  travaille) ; room fermée → même code, persistance immédiate. Un seul chemin, zéro cas
  particulier, zéro conflit d'écrasement.
- Chaque op passe le pipeline existant : validation zod + `checkInvariants` avant
  application. Un agent ne peut pas produire un projet invalide.
- Chaque op porte un **acteur** (`user` | `agent` + session) → alimentera le journal
  (chantier C).
- Le PUT REST `/api/files/...` actuel (troisième writer non coordonné) est rabattu sur
  ce même chemin ou restreint à l'import/export.

### 3.2 L'API d'opérations (le vocabulaire de l'agent)

Des opérations **nommées et granulaires**, pas du « remplace le document » :

- **Lectures ciblées** en markdown compact, organisées en **trois niveaux de zoom**
  (✅ implémenté : `packages/core/src/agent/{refs,cards}.ts` + tests) :
  - **N0 — `projectSummary`** : le sommaire complet, une ligne par entité (pages avec
    compteurs de blocs/notes, fonctionnalités par module avec lot/estimation/alertes,
    services, arbre de notes), jamais de contenu. C'est le point d'entrée obligé d'une
    session : ~100 lignes même pour un gros projet, là où le monolithe JSON en fait
    l'équivalent de ~75 000 tokens.
  - **N1 — `entityCard <poignée>`** : la fiche d'UN élément — métadonnées + **toutes
    ses interconnexions dans les deux sens** (dépend de / débloque, réalisée par /
    réalise, navigation entrante/sortante, endpoints, notes rattachées, page parente),
    chacune sous forme `Nom (id-court)` actionnable. Le contenu riche n'apparaît qu'en
    **taille** (« Contenu : 12 lignes »).
  - **N2 — `entityCard <poignée> {content}`** : la fiche + le contenu markdown, pour
    UN seul élément à la fois (une page dépliée inclut le contenu de ses blocs).

  Le principe : **chaque fiche est un point de navigation, pas un extrait de dump.**
  L'agent voit d'un coup d'œil le voisinage d'un élément et ne « descend » que là où
  il en a besoin — le graphe se découvre de proche en proche, le contexte consommé est
  proportionnel à la tâche, pas à la taille du projet.

  Les **poignées** remplacent les UUID : id court (préfixe 8 caractères, résolution
  dès 4), code de fonctionnalité (`DEV-04`, insensible à la casse), ou recherche par
  nom (`findEntities`, insensible aux diacritiques, couvre noms/codes/routes/titres).
  Une poignée ambiguë renvoie la liste des candidats — jamais de choix silencieux.
- **Écritures** : create/update/delete par type d'entité (`page`, `block`, `module`,
  `feature`, `note-*`, `service`, `note-page`), `set-field` (valeurs de champs),
  `set-content` (contenu riche, **fourni en markdown**), `link`/`unlink`
  (`navigatesTo`, `dependsOn`, `realizedBy`), `set-estimate`, `set-lot`.
- **Positionnement automatique** : l'agent ne manipule jamais `x/y`. Toute création
  passe par un auto-placement (dans le frame parent, en grille sous le dernier
  élément) ; l'humain réarrange ensuite au canvas. La géométrie reste un artefact
  humain/visuel.

Exposition : une **CLI `flooow`** d'abord (utilisable immédiatement par Claude Code via
Bash, testable, scriptable), un wrapper **MCP** ensuite si le besoin d'un usage hors
Claude Code se confirme. ✅ Les lectures sont implémentées (`server/src/cli.ts`) :
`pnpm flooow ls | summary <dossier/fichier> | get <dossier/fichier> <poignée> [--content] |
find <dossier/fichier> <texte>`. Mesuré sur le projet locasyst réel (292 Ko de JSON) :
le sommaire tient en 160 lignes, une fiche en 10-25 lignes. Les écritures, elles,
attendent les ops serveur (§3.1) — la CLI ne modifiera jamais le fichier directement.

Accompagnement méthodo : un **skill `/cadrage`** (+ CLAUDE.md de projet) qui encode la
méthode — comment interroger le projet, quelles ops utiliser, comment poser des
questions ouvertes plutôt que d'inventer, comment découper en lots.

### 3.3 Markdown ↔ RichDoc : le chemin retour

Le contenu riche reste du `RichDoc` (JSON ProseMirror) **au runtime** — TipTap en a
besoin. Mais le format d'**échange et de stockage** devient le markdown :

- Écrire `markdownToDoc` (via `prosemirror-markdown` + sérialiseurs custom), miroir de
  `docToMarkdown` existant. Schéma volontairement borné : titres, listes, gras/italique/
  code, citation, bloc de code, liens.
- Syntaxes pour les extensions maison :
  refs internes `[#Nom](flooow://feature/<id>)`, mentions `[@Nom](flooow://user/<email>)`,
  couleurs via une syntaxe d'attribut (à trancher — la palette est déjà bornée à
  `TEXT_COLORS`).
- **Tests de round-trip** systématiques (`doc → md → doc` stable) sur les fixtures
  réelles : c'est le risque technique n° 1 du pivot, on le couvre dès le départ.

### 3.4 Le format paquet fragmenté (formatVersion 9)

Le `.flooow.json` monolithique devient un **dossier-paquet**, découpé selon les
frontières naturelles du modèle :

```
mon-projet.flooow/
  project.json                  # meta (formatVersion 9) + site — le manifeste, lu en premier
  registry.json                 # services, featureFields, featureOptions
  edges.json                    # navigatesTo, dependsOn, realizedBy (globaux : ils traversent les agrégats)
  pages/
    <slug>.<id8>.json           # agrégat page : la page + ses blocs + ses notes (attrs, positions)
  modules/
    <slug>.<id8>.json           # agrégat module : le module + ses features (métadonnées, sans contenu)
  content/
    blocks/<id8>.md             # contenu riche en markdown (frontmatter : id, type, parent)
    features/<id8>.md
  notes/
    tree.json                   # arbre notePages (id, parentId, rank, kind, titres)
    <slug>.<id8>.md             # contenu d'une page de notes
  derive/                       # GÉNÉRÉ à la sauvegarde, jamais source de vérité
    INDEX.md                    # sommaire : toutes les entités, ids, un point d'entrée agent
    specs.md · catalog.md · api.md
```

Principes :

- **Une entité = un endroit ; le dérivé est matérialisé mais jetable.** Le serveur
  reconstruit déjà le `ProjectDoc` complet à chaque `onStoreDocument` : il en profite
  pour régénérer `derive/`. On obtient gratuitement des **diffs git lisibles**
  (« qu'est-ce qui a changé fonctionnellement ? ») et un point d'entrée de lecture pour
  n'importe quel agent, même sans CLI.
- **Assemblage/éclatement dans le core** (`packages/core/src/model/package.ts`) :
  `assemblePackage(dir) → ProjectDoc` et `explodePackage(doc) → fichiers`. Validation
  zod par fragment + invariants globaux au réassemblage. Le reste du code
  (`seedYDoc`, store, dérivateurs) continue de voir un `ProjectDoc` complet — la
  fragmentation est une affaire de **couche disque**, pas de modèle.
- **Écriture atomique par paquet** : écriture dans un dossier temporaire + rename,
  comme l'actuel `atomicWrite` mais au niveau dossier.
- **Migration** : v9 = « le monolithe v8 éclaté ». Le loader accepte les deux formes
  (`.flooow.json` v≤8 → migre → propose la conversion en paquet ; paquet v9 natif).
  L'export/import `.flooow.json` monolithique est conservé comme **format d'échange**
  (envoi, sauvegarde, fixtures de test).
- ⚠️ Coordination : le working tree est en train de poser la v8 (autre session, voir
  `.claude/travaux-en-cours.json`). La v9 s'empile **après** que la v8 est committée.

Ce que la fragmentation apporte au problème de contexte : lire une page = un petit JSON
+ quelques `.md` ; lire le projet = `derive/INDEX.md`. Et elle ouvre une option
produit : **versionner chaque projet client dans son propre dépôt git**
(aujourd'hui `data/` est gitignoré) — historique de cadrage, revue par PR, rollback.

### 3.5 Le modèle de suivi

Tout est à créer ; on reste minimal et on s'appuie sur l'existant (attention,
complétude, lots, estimations) :

1. **Statut d'avancement** first-class sur la fonctionnalité (et potentiellement la
   page) : `à cadrer → à valider → validé → en cours → livré`. First-class (enum dans
   le modèle) et non simple `featureField`, parce que les vues de suivi ont besoin de
   sa sémantique (roll-ups de progression par lot/module, couleurs, filtres).
2. **Provenance & revue** : chaque entité/contenu porte `lastEditedBy`
   (`user` | `agent`) + un drapeau `needsReview` posé automatiquement quand l'agent
   écrit, levé quand un humain marque « relu ». C'est le contrat de confiance du
   cadrage agentique.
3. **Journal** : `journal.jsonl` dans le paquet (append-only : acteur, op, cible,
   résumé, horodatage), alimenté par la couche d'ops. Nourrit une vue Activité
   (« ce que Claude a changé depuis ta dernière visite ») et sert d'audit.
4. **Questions ouvertes** : une entité `question` (rattachée à un nœud ou globale,
   statut `ouverte`/`tranchée`, réponse). C'est le canal humain↔agent structurant :
   Claude **pose** au lieu d'inventer, l'humain tranche dans l'app, Claude reprend.
   Remplace avantageusement les « à confirmer » noyés dans le texte libre.

### 3.6 L'UI recentrée

| Surface | Devenir |
|---|---|
| **Canvas** | Conservé — c'est le différenciateur visuel — mais bascule en **navigation/lecture d'abord** : pan/zoom/focus, réarrangement spatial, sélection. La création passe par l'agent (auto-layout). L'édition riche inline dans les nœuds (BlockNode/FeatureNode) est candidate à la dépose — c'est le gros du poids de `useCanvasSync.ts`. |
| **Specs / API / Catalogue** | Renforcées : ce sont les vues du produit cible. `SpecsView` perd ses champs inline de contenu, garde les champs de suivi (estimations). |
| **Suivi** *(nouveau)* | Tableau de bord : progression par statut/lot/module, points d'attention existants, questions ouvertes, charge estimée. Réutilise `attention.ts`, `derive/estimate.ts`, `FilterBar`, `AttentionSidebar`. |
| **Activité** *(nouveau)* | Le journal : changements de l'agent, badges `needsReview`, marquage « relu ». L'onglet « Commentaires » réservé dans `AttentionSidebar` est un point d'accroche. |
| **PropertiesPanel** | Recentré métadonnées + états (statut, lot, estimation, champs) ; les gros textes libres passent en lecture avec « ouvrir dans l'éditeur » en secours. |
| **RichEditor + slash/mentions/refs** | Mis en retrait, pas supprimés d'emblée : retouche rapide et Notes restent utiles. `RichContent` (rendu) devient la pièce centrale et reste indispensable. |
| **Présence agent** | Claude apparaît comme un pair dans la room (awareness) : on **voit** l'agent travailler. Gratuit ou presque, puisque l'écriture passe par le Y.Doc. |

## 4. Phasage

L'ordre est dicté par les dépendances : la fragmentation seule ne débloque rien tant
que l'écriture concurrente n'est pas résolue ; la couche d'ops rend Claude opérationnel
dès la phase 1, même sur le monolithe actuel.

### Phase 1 — Claude peut écrire *(fondation, la plus forte valeur)*

- ✅ Ops serveur via `openDirectConnection` (un seul chemin d'écriture, validé zod +
  invariants) : `server/src/agent.ts` + route `POST /api/agent/:folder/:file/ops`.
- ✅ Vocabulaire d'ops atomique (`packages/core/src/agent/ops.ts`) : créations avec
  chaînage intra-lot (id fourni → référençable par l'op suivant), update par liste
  blanche de champs, set-content/set-field (option créée à la volée), liens typés
  vérifiés, suppressions en cascade (module plein / service référencé : refusés).
- ✅ CLI `flooow apply` (lot JSON via stdin ou fichier) + `flooow ops` (mémo du
  vocabulaire). Chemin nominal : la route serveur (room live) ; repli fichier direct
  uniquement si le serveur est éteint (aucune room ne peut alors exister).
- ✅ `markdownToDoc` (`packages/core/src/model/markdown.ts`) : dialecte borné miroir
  de `docToMarkdown`, round-trips testés. Couleurs/refs/mentions : plus tard (§3.3).
- ✅ Auto-placement des nœuds créés par l'agent (pages/blocs/fonctionnalités empilés,
  modules en colonne, notes décalées de leur cible) — jamais de position dans les ops.
- ⬜ Skill `/cadrage` + CLAUDE.md type pour les sessions de cadrage.
- ⬜ Provenance dans le rapport → journal (renvoyé au chantier C).

**Jalon : cadrer un vrai projet en dictant à Claude, l'app ouverte à côté qui se met à
jour en direct.** C'est la démo qui valide le pivot — l'équivalent du « déclic V0 » du
[MVP d'origine](../04-roadmap/mvp.md).

### Phase 2 — Stockage paquet v9

- `assemblePackage`/`explodePackage` dans le core, syntaxes refs/mentions/couleurs finalisées.
- Adaptation `server/src/files.ts` + `collab.ts` (onLoad assemble, onStore éclate + régénère `derive/`).
- Migration v8→v9, import/export monolithe conservé, fixtures converties.
- Option git par projet (décision produit à ce moment-là).

**Jalon : un projet réel vit en paquet fragmenté, diffs git lisibles, `derive/INDEX.md`
comme point d'entrée agent.**

### Phase 3 — Suivi

- Modèle : statut, provenance/`needsReview`, journal, questions ouvertes (bump v10 probable).
- Vues Suivi + Activité, badges de provenance, boucle questions↔réponses avec la CLI.

**Jalon : l'app sert au quotidien à suivre un projet que Claude fait avancer.**

### Phase 4 — UI recentrée *(continu, à partir de la phase 1)*

- Lecture par défaut, dépose progressive de l'édition riche inline du canvas,
  PropertiesPanel recentré, présence agent dans la room.

## 5. Décisions à trancher en équipe

| # | Question | Recommandation |
|---|---|---|
| 1 | CLI d'abord ou MCP d'abord ? | CLI (zéro infra, Claude Code natif) ; MCP en wrapper ensuite |
| 2 | Markdown = format canonique du contenu riche ? | Oui, avec round-trip testé ; RichDoc reste le format runtime |
| 3 | Granularité du paquet : par collection ou par agrégat ? | Par agrégat (page+blocs, module+features) + contenus `.md` séparés |
| 4 | Statut : first-class ou `featureField` ? | First-class (sémantique nécessaire aux roll-ups) |
| 5 | Un dépôt git par projet client ? | Option ouverte en phase 2 — fort potentiel (historique, PR de cadrage) |
| 6 | Sort de l'édition riche humaine ? | Conserver en retrait (Notes, retouches) ; ne supprimer que ce que l'usage réel abandonne |
| 7 | L'agent peut-il supprimer ? | Oui mais journalisé + `needsReview` ; pas de purge silencieuse |

## 6. Risques

- **Round-trip markdown ↔ RichDoc** : le risque technique n° 1 — couvert par tests de
  propriété dès la phase 1, schéma volontairement borné.
- **Conflits agent/humain sur la même entité** : le CRDT merge par entité en LWW. Règle
  de prudence : la CLI vérifie l'awareness de la room et refuse (ou avertit) quand un
  humain édite l'entité visée à cet instant.
- **L'agent lit tout quand même** : la fragmentation ne sert à rien si le skill ne
  guide pas vers `summary`/`INDEX.md` d'abord. La méthodo (skill) fait partie du
  chantier, pas de l'accompagnement.
- **Chantier v8 en cours** : la v9 s'empile après commit de la v8 ; vérifier la version
  réellement courante avant tout bump (règle du CLAUDE.md du dépôt).
- **Sur-modélisation du suivi** : commencer minimal (un statut, un journal, des
  questions) ; pas de workflow configurable tant que l'usage ne le réclame pas.

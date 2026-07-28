# Flooow multi-user & serveur — architecture cible

> Trace de décision (2026-07-09). Passage de l'app **local-first mono-user** à une
> app **hébergée, multi-user, temps réel** sur la machine bao, tout en continuant
> à travailler avec des fichiers `.flooow.json`.

## Besoin

1. Héberger flooow sur le serveur (bao), avec un **hub d'arrivée** et du **routing**.
2. Hub : **sidebar** à gauche = tous les dossiers de projets ; clic sur un dossier →
   le **main** liste les fichiers du projet ; ouvrir un fichier → on entre dans l'app.
3. **Multi-user** avec les users de l'**auth bao existante** (AuthCrunch, rôles
   `dev` / `marin` / `client`).
4. Voir les **curseurs** des autres users en temps réel.
5. **Bulle de présence** (haut-droite) listant les users connectés — **par onglet**
   (un user avec 3 onglets apparaît 3 fois).
6. Toujours fonctionner avec des **fichiers JSON**.

## Décisions arrêtées

| Sujet | Choix | Note |
|---|---|---|
| Collaboration | **Co-édition temps réel CRDT (Yjs)** | édition simultanée fusionnée façon Figma |
| Backend | **Node** (unifié) | ~~Laravel~~ écarté : partage le code TS front/back, Yjs natif |
| Droits | **Par rôle AuthCrunch** | `client` = lecture seule ; `dev`/`marin` = écriture |

### Pourquoi Node et pas Laravel

- La synchro Yjs parle un **protocole binaire dédié** (`y-protocols`), pas le
  protocole Pusher de Reverb. La faire transiter par Laravel/Reverb = relais
  custom fragile.
- **Aucune implémentation Yjs sérieuse en PHP** : impossible de matérialiser le
  Y.Doc fusionné → `.flooow.json` côté serveur de façon fiable.
- Le serveur temps réel Yjs standard est **Hocuspocus** (Node, écosystème Tiptap —
  or flooow utilise **déjà Tiptap**). Étant du Node, il **réutilise tel quel**
  `model/schema.ts`, `migrations.ts`, `invariants.ts` du front pour valider et
  écrire le JSON → **zéro doublon de validation**.

## Architecture cible

```
Caddy hôte (AuthCrunch, *.pilot-in.net)   ── injecte X-Token-User-* (user + rôle)
        │  reverse_proxy → :8080 du container
        ▼
Caddy DU CONTAINER (dev-flooow-web, :8080)
        │  import /srv/.caddy-upstream
        │  reverse_proxy host.containers.internal:<PORT>   (WS upgrade transparent)
        ▼
Serveur Node SUR L'HÔTE  (tsx, lancé depuis /srv/dev/flooow)
        ├─ REST  (Hono)   /api/folders, /api/files : list, create, rename, delete
        │                  droits par rôle ; identité lue dans les headers AuthCrunch
        └─ Hocuspocus     /collab  ── synchro Yjs (co-édition fusionnée)
                          ── awareness Yjs = curseurs + présence PAR ONGLET (gratuit)
                          ── onAuthenticate : applique le rôle (readOnly si client)
                          ── onStoreDocument (debounce) : Y.Doc → JSON → zod/migrations/
                             invariants → écriture atomique du .flooow.json
                          ── 1er open : seed le Y.Doc depuis le .flooow.json

Stockage : /srv/dev/flooow/data/<dossier>/<fichier>.flooow.json

Front (Vue) :
  vue-router   /                    Hub : sidebar dossiers + main = listing fichiers
               /p/:folder/:file     l'app actuelle (canvas / specs / api …)
  Pinia devient une PROJECTION réactive du Y.Doc ; undo/redo → Y.UndoManager
  awareness → calque curseurs + bulle présence (haut-droite)
  Tiptap → mode collaboratif (éditeur de fonctionnalité)
```

La bulle « users par onglet » et les curseurs tombent **directement** de
l'awareness Yjs (chaque onglet = 1 connexion = 1 entrée).

## Pattern container bao (référence : site `facturation`)

Constat vérifié sur la machine :

- **Aucun container bao n'a Node** (ni `static`, ni `piloblocks` — piloblocks n'a
  que PHP). Le **Node tourne sur l'HÔTE** (Node v22 + pnpm présents). C'est ainsi
  que Vite dev tourne pour tous les sites piloblocks.
- Un site **type `static`** = container `caddy:alpine` sur `:8080`. Le site
  `facturation` (full-stack Hono + Vite + SQLite) est de type `static` : son Caddy
  fait `import /srv/.caddy-upstream` → `reverse_proxy host.containers.internal:<port>`
  vers un process Node lancé sur l'hôte (`tsx`).
- Dev mode = `concurrently "vite --host 0.0.0.0 --port N" "tsx watch src/server"`,
  puis génération de `.caddy-upstream` + `caddy reload` dans le container.

**Conséquence pour flooow** : le site `dev/flooow` déjà créé en **`static` est le
bon type**. Rien à recréer. Ne PAS passer en piloblocks (installerait WP + DB
inutiles, et pas de Node en container de toute façon).

- **Vite dev mode** : oui, comme facturation.
- **WebSocket (Yjs)** : oui, `reverse_proxy` gère l'upgrade WS.
- **AuthCrunch** : déjà devant `flooow.d.pilot-in.net` (Caddy hôte). Les headers
  `X-Token-User-*` traversent les deux proxys → le Node les lit. Rien à configurer.
- Sécurité : le Node bind `0.0.0.0` (requis pour `host.containers.internal`) → le
  port brut ne doit PAS être joignable en contournant Caddy (sinon spoof de
  headers). Protéger au pare-feu hôte (seul le port public Caddy exposé).
- Supervision : chez facturation le Node est lancé à la main (`pnpm dev/start`,
  pas de systemd). Idem en dev ; un service `systemd --user` viendra si besoin de
  persistance hors session.

## Layout du repo (monorepo léger)

```
flooow/
  packages/core/   ← model + domain extraits du front (schema, migrations,
                     invariants, types, derive…) — pur TS, partagé front ⇄ serveur
  app/             ← front Vue (importe @flooow/core)
  server/          ← Node : Hono (REST) + Hocuspocus (Yjs)  — importe @flooow/core
  data/            ← les .flooow.json (<dossier>/<fichier>)
```

`packages/core` est faisable proprement : `app/src/model` et `app/src/domain`
sont **purs** (aucune dépendance Vue/Pinia/store), 43 fichiers consommateurs.

## Plan de dev par jalons

L'extraction `packages/core` n'est réellement nécessaire qu'au jalon Yjs (le
serveur valide alors le document). On la fait à ce moment-là pour front-loader
les incréments visibles.

1. **Serveur Node skeleton** — Hono, `/api/health`, `/api/whoami` (lecture headers
   AuthCrunch), lancé sur l'hôte. Ne touche pas encore au container.
2. **Câblage container** — `Caddyfile` du container → pattern `import
   /srv/.caddy-upstream` ; `.caddy-upstream` → host Node ; script `dev`
   (`concurrently` Vite + tsx). App servie sur le serveur, Vite dev OK. Figer ici
   les vrais noms de headers AuthCrunch.
3. **REST fichiers/dossiers** — `/api/folders`, `/api/files` (list/create/rename/
   delete + métadonnées), droits par rôle, écriture disque atomique.
4. **Hub + router (front)** — `vue-router`, route hub (sidebar dossiers + listing),
   route éditeur ; ouverture d'un fichier = `fetch` JSON → `project.load()` (l'I/O
   bascule de File System Access → API serveur). *Encore mono-éditeur.*
5. **Extraction `packages/core`** — model + domain hors du front, workspaces,
   tests verts. Débloque le partage front ⇄ serveur.
6. **Yjs : Y.Doc source de vérité, Pinia projection** — schéma Y.Doc miroir de
   `types.ts`, binding bidirectionnel, mutations en transactions Yjs, `history`
   store → `Y.UndoManager`. Persistance via Hocuspocus `onStoreDocument`
   (réutilise `@flooow/core`).
7. **Awareness : curseurs + bulle présence** — provider Hocuspocus, couleur/
   identité par user, 1 entrée par onglet, calque curseurs sur le canvas, bulle
   haut-droite.
8. **Tiptap collaboratif + finitions** — éditeur collab, `readOnly` effectif pour
   `client`, états connexion/reconnexion, tests.

## Avancement

- **Jalons 1–5 faits, vérifiés, commités.**
  1. Serveur Node skeleton (Hono, /api/health, /api/whoami).
  2. Câblage container + `pnpm dev` (Vite + Node hôte, pattern facturation).
  3. REST fichiers/dossiers (`server/`, droits par rôle, atomique, seed).
  4. Hub + router (`app/`, HubView/EditorView, load/save via API).
  5. Extraction `packages/core` (model+domain partagés app⇄serveur via `@flooow/core`).
- **Jalon 6 (Yjs co-édition) fait.**
  - 6a serveur : `packages/core/collab/ydoc.ts` (mapping Y.Doc⇄ProjectDoc partagé) +
    `server/collab.ts` (Hocuspocus sur `/collab`, room=`<dossier>/<fichier>`, seed
    depuis le fichier, persistance debouncée validée). **Workspace pnpm** →
    `yjs` singleton (store partagé) + `dedupe` Vite.
  - 6b front : `app/collab/bridge.ts` (pont Y.Doc⇄store, anti-echo afterTransaction +
    watch `flush:'sync'` + flag), `store.applyRemote()`, EditorView en co-édition
    (persistance auto serveur, gate sur 1er sync, indicateur temps réel).
- **Jalon 7 (présence) : FAIT.**
  - Bulles : `app/collab/PresenceBubbles.vue` + awareness dans le bridge (1 bulle
    par onglet, avatar ou initiales). **Fix majeur** `auth.ts` : rôles AuthCrunch
    namespacés (`pilotin/dev`) — un vrai dev était classé `client` (lecture
    seule) ; corrigé.
  - **Curseurs des pairs** : `app/collab/PresenceCursors.vue` (overlay dans
    `<VueFlow>`, projection monde→écran via viewport, flèche + nom teintés).
    Publication locale dans FlowCanvas (`pointermove` → `vf.project` →
    `setCursor`, throttle rAF ; `pointerleave`/unmount → curseur effacé).
  - **Sélection partagée** : le bridge publie `ui.selectedIds` dans l'awareness
    (`setSelection`, watch auto) ; FlowCanvas fournit `PEER_SELECTION_KEY`
    (map nodeId → couleurs des pairs) ; chaque node component (PageFrame,
    BlockNode, NoteCard, ModuleFrame, FeatureNode) applique un `outline` de la
    couleur du pair via `usePeerSelectionStyle` (`app/canvas/usePeerSelection.ts`).
  - **Couleur par connexion** : dérivée du `clientID` awareness À LA LECTURE
    (`refreshPeers`) — plus rien de publié ; 2 onglets d'un même user = 2 couleurs.
    Session collab exposée en singleton (`currentCollab()`) pour les composants
    profonds (canvas rendu via `<component :is>`).
  - Vérifié live (2 onglets headless) : curseur reçu à la bonne position monde,
    contour de sélection qui suit les changements, couleurs distinctes par onglet,
    curseur effacé au `pointerleave`. Typecheck + 225 tests verts.
  - **Passe 2 (retours d'usage)** :
    - *Perf/fluidité* : curseurs rendus DANS `.vue-flow__transformationpane`
      (Teleport, coords monde + contre-zoom 1/zoom) → le pan/zoom local ne
      recalcule plus rien (fini téléportations et saccades) ; publications
      locales self-only ignorées par `refreshPeers` ; throttle curseur 33 ms.
    - *Scoping par couche* : le bridge publie `view` (`ui.mode` + `ui.canvasLayer`) ;
      un curseur ne s'affiche que si le pair est sur la MÊME couche canvas.
    - *Présence d'édition* : champ awareness `editing` ({id, label}) — publié
      automatiquement pour l'éditeur de fonctionnalité (dérivé des stores, dans le
      bridge) et par les champs du cadre dans SpecsView (focusin/focusout).
      Affichage : badge ✎ + activité dans le tooltip des bulles (toutes vues,
      y compris specs/API), anneau + badge nommé sur la fiche/le champ édité
      dans SpecsView. Reste possible en suite : instrumenter les éditions inline
      du canvas (`useInlineEdit`) pour surligner aussi les lignes de la vue API.

- **Vue Notes (format v5) : FAIT.** Documents libres façon Notion (matière d'atelier,
  comptes rendus) — mode `notes` (touche 5), sidebar = arbre de pages (sous-pages
  illimitées, ordre manuel `rank`, renommage inline, déplacement ↑/↓), main = titre +
  Tiptap (`RichEditor`, commit débouncé/coalescé patron FeatureEditor).
  - Modèle : collection top-level `notePages` dans le ProjectDoc — **formatVersion 5**
    (migration 4→5 additive), schéma zod, invariants (`NOTEPAGE_PARENT`/`NOTEPAGE_CYCLE`),
    mapping Y.Doc (`ydoc.ts`, merge par page LWW comme les nodes). Serveur : rien à
    toucher (validation déléguée à core) — mais **redémarrer le serveur après un bump
    de format** (piège rencontré : cache de transpile tsx → l'ancien mapping persistait
    des `notePages` vides).
  - Fichiers : `app/views/NotesView.vue`, `app/panels/NoteTreeItem.vue` (récursif),
    store `project.ts` (CRUD `addNotePage`/`updateNotePage`/`moveNotePage`/
    `removeNotePage`), `ui.ts` (mode + `notePageId`).
  - Présence : « sur les notes » + « édite la note “X” » dans les bulles ; pastille
    couleur du pair sur la page éditée dans l'arbre.
  - Vérifié live (2 onglets) : arbre/titres/contenu synchronisés, persistance v5
    validée à travers un redémarrage serveur complet. Typecheck + 230 tests verts.
  - Le texte des notes merge en LWW par page (dernier écrit gagne sur la MÊME page) :
    le vrai CRDT texte arrive avec le jalon 8 (Tiptap collaboratif), les notes en
    profiteront au même titre que le contenu des fonctionnalités.

## À FAIRE (reprise)

1. **Jalon 8** : Tiptap collaboratif (éditeur de fonctionnalité en Y.XmlFragment) +
   finitions (états connexion/reconnexion, tests). Étendre aux pages de notes
   (même chantier : un Y.XmlFragment par page).

### Notes / dettes à traiter

- **Avatar Google** : le claim `picture` n'est PAS injecté par AuthCrunch
  actuellement (header absent → repli initiales). Pour l'avatar réel, ajouter côté
  **Caddy hôte** `inject header "X-Token-Picture" from picture` — c'est de la
  **config GLOBALE**, à valider avec le lead bao avant (ne pas toucher sans accord).
- **Undo collaboratif** : l'undo local (snapshot) est poussé au Y.Doc et peut
  écraser des éditions concurrentes de pairs. Passer à `Y.UndoManager` scindé par
  origine (undo = seulement ses propres ops).
- **Perf** : chaque mutation sérialise 2–3× + `JSON.stringify` par entité au diff ;
  à profiler sur gros graphe.
- **Rôle client** : seul le serveur bride (readOnly) + badge ; le verrouillage UI
  complet (empêcher les gestes d'écriture) reste à faire.
- **Prod build** : le `Caddyfile` du container devra un fallback SPA
  (`try_files … /index.html`) quand on servira le build (inutile en dev, Vite gère).

## État courant

- Repo git distant : `git@github.com:Pilot-in/flooow.git`.
- Site bao `dev/flooow` (type `static`, container `dev-flooow-web`) — conservé.
- `pnpm dev` sert l'app en dev sur `https://flooow.d.pilot-in.net` (Vite + Node hôte).
- Layout monorepo en place : `packages/core` (alias, sans workspace/linking — les
  deux consommateurs transpilent le TS source), `app/` (npm), `server/` (pnpm),
  `zod` à la racine.

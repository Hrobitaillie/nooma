# Baseline canvas — phase 0 de la refonte WebGL

Date : 23/07/2026. Spec : [audit-refonte-canvas-webgl.md](audit-refonte-canvas-webgl.md) (§6).
Runner : `app/scripts/perf/baseline-runner.js` — à rejouer **à l'identique** en fin de chaque
phase ; ce document est le point de comparaison officiel de toute la refonte.

## Deux référentiels de mesure

| | R1 — bao headless (ce document) | R2 — machine de référence basse |
|---|---|---|
| Machine | Serveur bao, 16 cœurs, 32 Go | MacBook Air M3 **8 Go** + écran QHD |
| Chrome | HeadlessChrome 151, viewport 1536×960 | Chrome de Hugo, fenêtre réelle |
| GPU | **SwiftShader (rastérisation logicielle)** | Apple M3 (mémoire unifiée) |
| Rôle | Chiffres **reproductibles**, comparaison inter-phases, automatisable | Ressenti réel + **empreinte mémoire** (§2.1 de l'audit : pression des 8 Go) |

Les chiffres R1 ne se comparent **qu'entre eux** (le raster logiciel gonfle le coût de peinture,
le CPU serveur écrase le coût script). La tendance et les rapports entre scénarios, eux, se
transposent. Le protocole R2 est en fin de document — à dérouler par Hugo, aucun chiffre R2 n'est
encore posé.

## Méthodologie (identique aux campagnes historiques de `FlowCanvas.vue`)

- Fixtures copiées dans `data/perf/` (`reference-project`, `locasyst-project-save`) — **jamais**
  les originales de `data/exemples/` : l'app écrit dans le projet ouvert. Recopier avant chaque
  campagne pour repartir d'un état propre.
- Pan/zoom **pilotés image par image** par `vf.setViewport` (accès à l'instance via les internals
  dev de Vue) : chaque image rAF applique un pas, on mesure le temps entre images. 180 images par
  campagne, aller-retour pour absorber la dérive.
- Sondes : durée entre rAF (avg/p50/p95/max, fps) + `PerformanceObserver` longtask (nombre, ms
  cumulées). Charge initiale : `chrome_perf` bao (métriques CDP : nœuds DOM, listeners, CPU
  renderer, TaskDuration).
- Piège appris : sur page **inactive**, le rAF headless ne bat pas — une mesure passive doit
  passer par un observer posé puis relevé, pas par une boucle rAF (elle timeoute).

## Résultats R1

### Volumétrie montée (ce que le DOM paie)

| Scène | Nœuds VF | Arêtes | Éléments dans cartes | dont texte | DOM total (els) | Listeners | Heap JS |
|---|---|---|---|---|---|---|---|
| reference structurel (zoom fit 0.1) | 160 | 39 | 2 784 | 866 | 7 658 | 4 958¹ | 41-52 Mo |
| locasyst structurel (fit 0.12) | 113 | 36 | 2 329 | 716 | 3 028 | — | 33 Mo |
| locasyst **fonctionnel** (fit 0.1) | 98 | 84 | **4 401** | 1 386 | 5 352 | 3 368¹ | 48 Mo |

¹ Relevés `chrome_perf` (Nodes CDP : 21 182 reference / 9 018 locasyst, en *nœuds* DOM, textes
compris). La couche fonctionnelle de reference-project monte **0 nœud** (fixture sans placement
fonctionnel) — les campagnes fonctionnelles se font sur locasyst, comme historiquement.

### Charge initiale (chrome_perf, settle 5 s)

| Fixture | Main thread (TaskDuration) | RecalcStyle cumulé | CPU renderer total | FMP |
|---|---|---|---|---|
| locasyst | 4,0 s | 0,97 s | 7,2 s | ~4,0 s |
| reference | **6,2 s** | 1,56 s | 10,2 s | — |

### Campagnes d'interaction

| Campagne | Scène | fps | avg ms | p95 ms | max ms | Tâches longues |
|---|---|---|---|---|---|---|
| Pan zoom 0,117 (LOD actif) | reference struct. | **60** | 16,7 | 16,7 | 16,8 | 0 |
| Pan zoom 0,117 (LOD actif) | locasyst fonc. | **60** | 16,7 | 16,8 | 16,8 | 0 |
| Pan zoom 0,4 (cartes pleines) | reference struct. | 36,1 | 27,7 | 33,4 | 49,9 | 0 |
| Pan zoom 0,4 (cartes pleines) | locasyst fonc. | 36,3 | 27,5 | 33,4 | 33,4 | 0 |
| Pan zoom 1 | reference struct. | 26,3 | 38,0 | 50,0 | 50,1 | 0 |
| Pan zoom 1 | locasyst fonc. | 32,4 | 30,8 | 33,4 | 50,0 | 0 |
| **Zoom continu 0,117↔1** | reference struct. | 18,7 | 53,6 | 83,3 | 100 | 51 (3,7 s) |
| **Zoom continu 0,117↔1** | locasyst fonc. | **11,5** | 86,7 | 116,7 | 183 | **180/180 (15,4 s)** |
| Clic sélection (page) | reference struct. | — | — | 66,7 | 150 | 3 (321 ms) |
| Clic sélection (feature) | locasyst fonc. | — | — | 250 | **250** | 3 (**716 ms**) |
| Re-clic carte déjà sélectionnée | les deux | 60 | 16,7 | 16,7 | 16,8 | 0 |
| Frappe titre (47 car., 80 ms/car.) | locasyst fonc. | 47,6 | 21,0 | 33,4 | 66,6 | 1 (51 ms) |
| 3 renames **collab distants** | locasyst fonc. (récepteur) | — | — | — | — | **0** (< 50 ms chacun) |

### Lecture — ce que la baseline établit

1. **Le LOD maison tient sa promesse** : 60 fps pleins au pan sous 0,35, zéro tâche longue, sur
   les deux fixtures. Le plancher du problème n'est pas là.
2. **Le pan à zoom de travail plafonne à 26-36 fps** sans jamais bloquer le main thread (0 tâche
   longue) : c'est du coût de **rastérisation pure** des cartes DOM — exactement le poste que la
   phase 2/3 (couche GL) attaque, et que la phase 1 n'améliorera pas. Chiffre à suivre en R2 : sur
   GPU matériel il peut être meilleur qu'ici (raster logiciel).
3. **Le zoom continu est l'interaction la plus dégradée** — le point le plus neuf de cette
   baseline : 11,5 fps en couche fonctionnelle avec **chaque image en tâche longue** (15,4 s de
   main thread bloqué sur 15,6 s). Contrairement au pan, le zoom invalide du style à chaque image
   (variable CSS de contre-zoom des libellés, seuils LOD, arêtes contre-zoomées) : c'est du
   **recalc de style généralisé par image**, pas du raster. La phase 1 doit le traiter (ou le
   démontrer intraitable en DOM → argument phase 2).
4. **Cliquer une carte bloque 0,3-0,7 s** (point chaud n°3 de l'audit, confirmé : le watch deep
   sur la sélection reconstruit tout). Max mesuré : image de 250 ms sur FeatureNode. Re-cliquer
   une carte déjà sélectionnée est gratuit — c'est bien la *reconstruction*, pas la sélection.
5. **La frappe tient ~48 fps** avec un push complet par frappe (p95 33 ms) : coûteux mais absorbé
   à 98 nœuds. Croît avec la taille du graphe (un push ≈ 30 ms ici) — à surveiller en R2.
6. **Un change distant collab coûte < 50 ms** (aucune tâche longue pour 3 renames) : la chaîne
   `applyRemote → graphVersion → push()` reconstruit tout mais reste sous le seuil à cette
   taille. Même remarque d'échelle que la frappe.
7. **Charge initiale : 4-6 s de main thread** avant interactivité réelle (FMP ~4 s sur locasyst),
   ~21 000 nœuds DOM et ~5 000 listeners montés sur reference-project. La virtualisation
   (phase 1) est le levier direct.

### Jalons chiffrés proposés (à valider aux mêmes campagnes R1)

| Phase | Jalon mesurable |
|---|---|
| 1 — sync | Clic sélection : **0 tâche longue** (aujourd'hui 321-716 ms). Frappe : p95 ≤ 17 ms. Zoom continu : tâches longues ÷ 10 minimum. Charge : main thread ÷ 2 via virtualisation. |
| 2 — GL scène | Pan zoom 0,4 et 1 : **60 fps** (le raster des arêtes/fond passe au GPU ; les cartes DOM restent le plafond). Zoom continu ≥ 30 fps. |
| 3 — cartes GL | Pan/zoom : 60 fps partout, DOM ≤ quelques dizaines d'éléments, heap et listeners effondrés. |

## Re-mesure R1 après phase 1 — commits du 23/07 (`ca8ff56`, `72a2a5a`, contre-zoom)

Mêmes campagnes, même environnement, sur locasyst fonctionnel. Trois chantiers livrés : clic sans
reconstruction (mise en avant par injection réactive + montage Tiptap différé à l'accalmie), push
incrémental (diff nœuds/arêtes par id, garde anti-« remove » du store, `toRaw` dans le
comparateur), contre-zoom décentralisé (les vars CSS quittent la racine — écrire une custom
property sur la racine invalidait les ~5 300 éléments par image, c'était TOUT le coût du zoom).

| Campagne | Baseline | Après phase 1 (cœur) |
|---|---|---|
| **Zoom continu 0,117↔1** | 86,7 ms/image, 11,5 fps, **180/180 tâches longues (15,4 s)** | **25,8 ms/image, 40,5 fps, 5 tâches longues (0,6 s)** — résidu : les 2 franchissements LOD par balayage |
| Clic sélection (feature) | 716 ms bloqués (reconstruction) | **0 push** ; résidu ~180 ms hors frame d'interaction (montage Tiptap différé) + ~200 ms au premier flip de chaîne (re-rendu des 81 cartes, ressort de la phase 3) |
| Frappe titre | 1 push complet par retour à la ligne | **0 push** (le coût restant par frappe est le layout document des ~5 300 éléments — phase 3) |
| Collab (renames distants) | reconstruction complète/transaction | 4 pushes incrémentaux 40-80 ms, 0 tâche longue |
| Pan 0,4 | 27,5 ms/image | 21,4 ms/image (FlowCanvas ne re-rend plus par image) |
| Pan 0,117 (LOD) | 16,7 ms (60 fps) | 16,7 ms (60 fps) — inchangé |
| Bascule de couche | — | comptes exacts, 0 warning, store intact (bug « remove → store » attrapé et corrigé pendant le chantier) |

Découverte en passant : **un éditeur Tiptap monté triple le coût du zoom** (250 ms/image mesurés
avec l'éditeur inline ouvert) — argument de plus pour l'îlot démontable de la phase 3.

Reste de la phase 1 : la **virtualisation** (`content-visibility: auto` + `contain-intrinsic-size:
auto`, cible : la charge initiale de 4-6 s de main thread). Non trivial : les cartes jamais vues se
mesurent à leur première apparition → re-layout progressif sous le pan ; à instrumenter avant de
trancher. Les jalons chiffrés du clic et du zoom sont atteints ou dépassés.

Limite d'outillage notée : `chrome_screenshot` (page éphémère) n'établit pas la connexion à la
room collab → pas de contrôle visuel automatisé des pages projet ; les vérifications sont DOM
(classes, vars inline, compteurs) et le protocole R2 reste le juge visuel.

## Non couvert en R1 (assumé)

- **Drag Octopus** : le geste synthétique échoue en headless (`setPointerCapture` exige un
  pointeur actif — erreur attrapée par l'app, drag jamais engagé). → protocole R2.
- **Empreinte mémoire renderer + GPU** : invisible depuis JS, et non représentative sous
  SwiftShader. → protocole R2, c'est même sa raison d'être (§2.1 de l'audit).
- **Zoom par molette réelle** (d3-zoom) : les campagnes pilotent `setViewport` comme
  historiquement ; le chemin d'événements réel ajoute le coût d3, non mesuré ici.

## Protocole R2 — MacBook Air M3 8 Go (à dérouler par Hugo, ~20 min)

Chrome, écran externe branché, projet `locasyst-project-save` **copié** (pas l'original), couche
fonctionnelle. Pour chaque étape, noter le ressenti + les chiffres :

1. **Mémoire au repos** — ⋮ > Plus d'outils > Gestionnaire de tâches : noter *Empreinte mémoire*
   de l'onglet Flooow + du *processus GPU*, projet chargé, après 1 min sans toucher.
2. **Pan** au trackpad ~10 s à zoom de travail (cartes lisibles) — DevTools > Performance
   activé : noter fps du frame chart + tâches longues, et refaire la lecture mémoire après.
3. **Zoom** continu trackpad (pinch) 0,1 → 1 → 0,1 sur ~10 s — même relevé. C'est le scénario
   le plus dégradé en R1 : si le Mac décroche quelque part, ce sera là.
4. **Clic** sur une fonctionnalité non sélectionnée : le gel est-il perceptible (>100 ms) ?
5. **Frappe** : renommer un titre en tapant vite ~30 caractères — les lettres suivent-elles ?
6. **Drag Octopus** : déplacer une page dans l'arbre ~10 s — fps DevTools + ressenti.
7. **Mémoire après séance** — relevé gestionnaire de tâches à nouveau (dérive ?). En cas de
   crash pendant le protocole : `chrome://crashes` immédiatement (cf. §2.1 de l'audit — qui est
   mort : navigateur, GPU Helper, renderer ?).
8. **Virtualisation (cartes `content-visibility`)** — R2 SEULEMENT : le Chrome headless bao ne
   saute aucun contenu (`content-visibility` inerte, y compris `hidden` — accessibilité forcée
   par l'outillage), la fonctionnalité n'est donc active que sur un vrai Chrome. À vérifier :
   (a) DevTools > Rendering > « Paint flashing » ou l'inspecteur : les cartes loin hors écran
   sont-elles bien sautées (`checkVisibility({contentVisibilityAuto:true})` = false en console) ;
   (b) pan rapide vers une zone jamais visitée : les cartes se remplissent-elles sans décalage
   de mise en page perceptible (leurs hauteurs passent de l'estimation à la mesure) ; (c) les
   arêtes vers des cartes jamais rendues restent accrochées aux bons ports ; (d) l'empreinte
   mémoire et la charge initiale (étapes 1-2) comparées à la session précédente.

Reporter les relevés dans ce fichier (section R2 à créer) — ils fixent la référence « machine
basse » que chaque phase doit améliorer, ou au minimum ne jamais dégrader.

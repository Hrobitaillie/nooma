# Cadrage par fonctionnalité (couche fonctionnelle)

> **Note de conception (proposition).** Cette fiche répond à un manque identifié en confrontant Flooow à un outil de cadrage réel, orienté fonctionnalités (le projet *locasyst-api*). Elle **étend** le modèle v2 ([evolution-v2.md](../05-implementation/evolution-v2.md)) sans le contredire : la structuration de pages/blocs reste la couche « conception ». Ce qui suit ajoute une couche « cadrage » en amont. Les points initialement marqués *(à décider)* sont désormais **tranchés** (voir la section « Décisions actées » en bas de fiche et [decisions.md](../01-vision/decisions.md) §15).

## Le constat : deux décompositions, pas une

Flooow (v1 comme v2) modélise le projet comme **site → page → bloc** : une décomposition **structurelle** (où, dans quel écran). Or un cadrage réel commence rarement là, pour une raison simple :

> **L'arborescence n'existe pas encore au moment du cadrage.** On sait *ce qu'il faut construire* (les fonctionnalités, leurs dépendances, leur coût) bien avant de savoir *sur quelles pages ça vivra*.

Un projet a donc **deux cartes complémentaires** :

| Carte | Question | Unité | Connue |
|---|---|---|---|
| **Fonctionnelle** | *Qu'est-ce qu'on construit ? À quel prix ? Dans quel ordre ?* | la **fonctionnalité** | **tôt** (dès l'atelier) |
| **Structurelle** | *Où ça apparaît dans le produit ?* | la **page / le bloc** | **tard** (une fois l'arbo posée) |

Flooow ne couvre aujourd'hui que la seconde. Le cadrage par fonctionnalité, c'est la première.

## Pourquoi le modèle page/bloc ne suffit pas en amont

Beaucoup de fonctionnalités **n'ont pas de page** — et n'en auront peut-être jamais :

- socle : accès API « site », backend/proxy, authentification, synchronisation (polling) ;
- transverses : emails transactionnels, intégrations (Brevo, PIM/DAM), codes promo ;
- back-office, exports PDF, webhooks…

Les rattacher de force à une page est faux (elles la débordent ou sont purement back). **La fonctionnalité est donc un objet de premier plan, indépendant de la hiérarchie des pages.** C'est exactement ce que fait locasyst-api : des fiches `[DEV-04]`, `[SOC-01]`… regroupées par **module** (00→08), pas par page.

## La proposition : une couche fonctionnelle sur le même canvas

Ajouter à Flooow une **hiérarchie parallèle**, sur le même graphe, à côté de la structurelle :

```
STRUCTURELLE (conception, tard) : site → page → bloc
FONCTIONNELLE (cadrage, tôt)     : domaine → module → fonctionnalité
                     │
                     └── pont : « réalisé par » (fonctionnalité → page/bloc)
```

- Une **frame `module`** (ex. « Demande de devis ») groupe des fonctionnalités — l'équivalent des fichiers `02-devis` de locasyst.
- Un **nœud `fonctionnalité`** est l'atome de cadrage : il porte l'estimation, le lot, le périmètre, et se relie aux autres par **dépendance** (le graphe que le canvas rend si bien, là où un document linéaire ne fait que le décrire).
- Le **pont** « réalisé par » relie une fonctionnalité à une ou plusieurs pages/blocs — **tracé plus tard**, quand l'arborescence émerge. Une fonctionnalité peut être réalisée par 0 page (pur back), 1 page, ou plusieurs.

C'est la promesse « un graphe, plusieurs vues » poussée à son terme : **un seul graphe porte les deux cartes**, et le pont permet de basculer de l'une à l'autre. On ne choisit pas entre « par fonctionnalité » et « par page » : on saisit par fonctionnalité, on projette par page.

## Le nœud « fonctionnalité » (repris de locasyst-api)

| Attribut | Rôle | Exemple |
|---|---|---|
| **Code** | Identité stable, référençable | `DEV-04` |
| **Titre** | | « Formulaire de demande de devis » |
| **Quoi** | Ce que ça recouvre | « collecte dates + mode de retrait, crée une location statut 0 » |
| **Implique** | Le concret technique (mapping API, contraintes) | `POST /api/tiers/{id}/location`, upload photos… |
| **Périmètre** | Qui réalise | `Site` / `Éditeur` / `Interne` / `Externe` |
| **Dépend de / Débloque** | Le graphe de dépendances | dépend de `DEV-02`, `SOC-02` ; débloque `PAY-01` |
| **Lot** | Phase de réalisation | `V1` / `V2` / `Moodboard`… |
| **Estimation** | Charge (voir plus bas) | `1j`, ou plusieurs options chiffrées |
| **À confirmer** | Les zones d'incertitude, **explicites** | « PGS autorise-t-il un statut 1 sans devis ? » |

Le champ **« À confirmer »** mérite d'être un attribut de premier plan : un bon cadrage rend visibles ses trous, il ne les masque pas.

## L'estimation vit sur la fonctionnalité, pas sur la page

Changement important de doctrine par rapport à la fiche [chiffrage](chiffrage.md) actuelle (qui chiffre comportements/sections) :

> **On estime le TRAVAIL (la fonctionnalité), pas l'endroit où il s'affiche (le bloc).** Le coût d'une page est alors **dérivé** : somme des fonctionnalités qu'elle réalise (roll-up via « réalisé par »).

Avantages : une fonctionnalité qui apparaît sur trois pages n'est pas comptée trois fois ; une fonctionnalité sans page (back) est quand même chiffrée ; le chiffrage est disponible **dès la phase amont**, avant toute page.

**Corollaire acté (2026-07-08)** : le comportement (note) **ne porte plus de chiffrage** (`hours` retiré pour l'instant) et redevient une pure annotation de conception. Attention à la séquence : tant que le nœud `fonctionnalité` n'est pas implémenté, le chiffrage actuel sur les comportements **reste en place** ; le retrait de `hours` est conditionné à l'arrivée de la couche fonctionnelle qui le remplace.

Mécaniques concrètes à reprendre de locasyst-api :

- **Unité normalisée** : `m` / `h` / `j`, avec `1 j = 7 h` (cohérent avec l'heure comme unité de Flooow). Le TJ s'applique en aval.
- **Options nommées, chiffrées séparément, chacune avec son lot** : permet de chiffrer « le socle + telle variante optionnelle » distinctement.
- **Trous rendus visibles** : une valeur `à estimer` est comptée 0 **mais listée** en reste-à-chiffrer (la vue devient une checklist).
- **Provision pour risque** : conserver le coefficient Flooow (fourchette basse/haute) — orthogonal aux lots.

## Les lots comme leviers de négociation

locasyst-api traite les lots non comme une étiquette figée mais comme un **total recomposable** :

- chaque fonctionnalité (et chaque option) est rattachée à un lot ;
- une page **Chiffrage** avec des **cases à cocher** inclut/exclut chaque lot du **total retenu** ;
- changer le lot d'un poste **recalcule tout en direct**.

C'est parfait pour un atelier : « ce lot-là, on le passe en V2 » → le devis se recompose sous les yeux du client. Flooow a déjà les lots dans son modèle ; il lui manque cette **vue chiffrage interactive avec toggles de lots**.

## Le phasage se dérive du graphe de dépendances

Là où locasyst décrit en prose « socle d'abord » (`SOC-01/02/03` conditionnent tout), Flooow peut **dériver** l'ordre des lots depuis les liens *dépend de* : une fonctionnalité ne peut pas être dans un lot antérieur à ses dépendances. Le graphe visuel + le tri topologique = un **phasage** proposé automatiquement, à ajuster à la main.

## Déroulé en deux phases (et le pont)

1. **Cadrage fonctionnel** *(amont, sans arborescence)* : sur le canvas, poser les **modules** et leurs **fonctionnalités**, tirer les **dépendances**, remplir estimation / lot / périmètre / à-confirmer. → sortent déjà : le **catalogue**, le **chiffrage**, le **phasage**, la **matrice de responsabilités**.
2. **Conception structurelle** *(aval)* : poser l'**arborescence** (pages) puis les **blocs** (le modèle v2 actuel). Tracer les liens **« réalisé par »** des fonctionnalités vers les pages/blocs.
3. **Réconciliation continue** : une vue **« couverture »** liste les fonctionnalités **non encore réalisées par une page** (orphelines) et les pages **sans fonctionnalité** — le pont devient une checklist de complétude.

## Les vues dérivées que ça produit

| Vue | Dérivée de | Disponible |
|---|---|---|
| **Catalogue** | fonctionnalités d'un module (table de synthèse) | phase 1 |
| **Chiffrage** | Σ estimations, ventilé par lot, toggles d'inclusion | phase 1 |
| **Phasage / roadmap** | tri topologique des lots via *dépend de* | phase 1 |
| **Responsabilités** | regroupement par périmètre (Site/Éditeur/…) | phase 1 |
| **Specs par page** | roll-up des fonctionnalités *réalisées par* chaque page | phase 2 |
| **Couverture** | fonctionnalités orphelines ↔ pages vides | phase 2 |

## Décisions actées (2026-07-08)

Les quatre points ci-dessous, initialement ouverts, sont tranchés. Report dans [decisions.md](../01-vision/decisions.md) §15.

1. **Fonctionnalité et comportement sont deux objets distincts**, reliés par « réalisé par ». La fonctionnalité est l'unité de cadrage (amont, chiffrable, hors arborescence) ; le comportement (note `attachedTo` une page ou un bloc) redevient une **annotation de conception** (`trigger`, `rules`, `facet`). Fusion écartée : cardinalités inconciliables (une fonctionnalité réalisée par 0..n blocs, un bloc portant n comportements) et fonctionnalité sans page (socle, transverses, back).
2. **L'estimation vit uniquement sur la fonctionnalité.** Le comportement **perd son chiffrage** (`hours` retiré pour l'instant). Le coût d'une page reste **dérivé** (roll-up via « réalisé par »). Ceci amende la doctrine de chiffrage sur les comportements ([decisions.md](../01-vision/decisions.md) §9).
3. **Le canvas bascule entre deux modes** (comme Figma bascule Design / Dev / Animation) : **mode Fonctionnalités** et **mode Arborescence**. Chaque mode change la palette de création et les interactions ; **l'autre couche est complètement masquée**. Un **seul fichier / un seul graphe** sous le capot (le mode est une lentille, pas un document séparé), ce qui permet à « réalisé par » d'être une vraie arête inter-couches. Le pont se crée via une **affordance dédiée** (sur une page : « réalise quelle(s) fonctionnalité(s) ? ») et se consulte dans la **vue « couverture »**.
4. **Pas de fonctionnalité d'import** retenue pour l'instant (ni MVP, ni parser `.mdx` dédié). En revanche, **à terme, une conversion one-shot de locasyst vers un fichier Flooow** comme exercice exploratoire, pour éprouver le nœud `fonctionnalité` sur des données réelles et voir le rendu du graphe. Un import ultérieur passerait par un **format tabulaire neutre** (`Code, Titre, Lot, Périmètre, Dépend de, Quoi, Implique, À confirmer, Estimation`), le `.mdx` locasyst n'en étant qu'un producteur, avec **auto-layout** (placement par module + tri topologique).

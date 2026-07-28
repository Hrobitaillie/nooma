# Décisions & arbitrages

Décisions actées le 2026-07-07. Les questions restantes sont en bas de page.

## 1. Deux phases d'usage

| Phase | Usage | Ce que ça implique |
|---|---|---|
| **Cadrage** | Modéliser le projet avec le client (atelier de co-construction), produire specs + chiffrage | Friction de saisie minimale, le canvas doit être présentable en atelier |
| **Réalisation** | Référence pour les devs et designers : fonctionnalités, liens entre éléments, contrats d'API | Vues de consultation efficaces (recherche, filtres), le fichier projet vit dans le repo |

L'outil reste le référentiel du **quoi** (ce qui a été convenu), pas du **comment** (le code). Pas de synchronisation avec le code : on assume la photo de cadrage, enrichie ponctuellement pendant la réalisation.

## 2. Outil interne uniquement

- C'est le **technicien** qui manipule l'outil, y compris en atelier de co-construction avec le client (projection).
- Le client reçoit des **exports PDF** quand nécessaire — l'export PDF devient donc un livrable de premier rang, pas un nice-to-have.
- Lecture seule client en ligne : éventuellement plus tard, **pas dans le MVP**.

## 3. Priorité des exports

1. **Cahier des spécifications** — le livrable central. Sections transversales + une section par page.
2. **Contrat d'API** — très utile aux devs, seconde priorité.
3. **Chiffrage** — en toute fin. Le modèle de données le prépare dès le départ, la vue/l'export viennent après.

## 4. Architecture de départ

- **Mono-utilisateur, local-first**, zéro backend.
- **Un projet = un fichier** : versionnable, déplaçable, traitable.
- **Champs fixes minimaux + champs libres** partout ; **présets de structure** comme voie médiane ; schéma extensible = V2+ (cf. [noeuds-et-liens.md](../02-fonctionnalites/noeuds-et-liens.md)).

## 5. Nom

**Flooow** (provisoirement définitif 🙂).

## 6. Structure hiérarchique : frames & scopes

Frames imbriquées **site → page → section** (profondeur confirmée pour le MVP, « composant » attendra) ; comportements, spécifications et relations s'accrochent à n'importe quelle frame. Facettes transversales **front / back / fullstack** en étiquettes sur les éléments — jamais en conteneurs. Détail : [frames-et-scopes.md](../02-fonctionnalites/frames-et-scopes.md).

## 7. Ordre du cahier des specs = ordre spatial du canvas

Pas de vue arborescence séparée (le canvas **est** la carte du site). Le sommaire du cahier suit l'ordre de lecture du canvas : **de haut en bas, puis de gauche à droite**, calculé sur l'origine top-left de chaque frame. Déplacer une frame recalcule sa position et met à jour l'ordre du document — organiser le canvas, c'est organiser le cahier. Même règle pour l'ordre des sections dans une page.

## 8. Stack technique

**Vue 3 + TypeScript + Vite + Vue Flow + Pinia + Tailwind CSS**, local-first sans backend. L'équipe (dev WordPress, orientation Vue) prime sur la maturité marginale de React Flow ; un éventuel backend futur pourra être en PHP. Détail et argumentaire : [stack.md](../03-technique/stack.md).

## 9. Chiffrage : lots, heures, coefficient de risque

Méthodo de l'équipe, reprise telle quelle ([chiffrage.md](../02-fonctionnalites/chiffrage.md)) :

- Les gros projets sont découpés en **lots** ; chaque fonctionnalité est marquée « lot 1 » (indispensable) ou lot ultérieur.
- Chiffrage **en heures** ; le taux journalier est appliqué en aval (paramètre projet optionnel pour afficher des €).
- Provision pour risque via **coefficient multiplicateur** (ex. ×1,25) → fourchette basse (heures saisies) / haute (× coeff).

## 10. Évolution v2 : blocs, notes, connecteurs de proximité (2026-07-07)

Décisions actées après la première V0. Modèle **format v2**, spec précise dans [evolution-v2.md](../05-implementation/evolution-v2.md) (contrat des agents).

- **Les sections deviennent des blocs.** Une page = **pile verticale ordonnée de blocs pleine largeur**, non redimensionnables (le but est de structurer une page, pas de maquetter). Chaque bloc porte un **type** : `hero`, `cta`, `grille` (3 colonnes image+texte), `damier` (2 colonnes texte/image alternées), `menu`, `footer`, `feature`, `libre`. L'ordre vertical des blocs = l'ordre dans le cahier des specs.
- **Comportements & API deviennent des notes.** Plus de liens à ports pour eux : ce sont des cartes flottantes **rattachées à une page ou un bloc** (`attachedTo`), reliées par un **connecteur automatique vers le côté le plus proche** de leur cible. Contenu visible sur le canvas, éditable inline.
  - Seule la **navigation page→page** garde des ports à relier manuellement.
  - Relations manuelles restantes (arêtes typées, clic pour changer le type) : `navigatesTo` (page→page), `triggers`/`dependsOn` (entre notes).
- **Filtres par type de note + focus.** Un bouton « ne voir que les notes API / comportement » (les autres en opacité réduite). À la sélection d'une page/bloc, ses notes passent à 100 %, le reste s'estompe.
- **API enrichie.** Les services ne sont plus des nœuds du canvas mais un **registre** (nom, **URL de base**, auth, risque, endpoints). Une note API référence un service + un endpoint ; la vue API **regroupe tous les endpoints d'une même API** sous son URL de base. **Autocomplétion** service + endpoint à la saisie.
- **Interactions rapides** : lâcher un lien dans le vide → **popup de création** (choisir le type d'élément à créer, pré-relié) ; **menu contextuel** (clic droit) → supprimer, définir comme page d'accueil, changer le type ; **édition inline** des titres et textes ; clic sur une arête → **changer son type**.

## 12. Navigation canvas : pan au clavier/trackpad, sélection au clic (livré 2026-07-07)

Le clic gauche est libéré pour la **sélection**, y compris **sélection multiple au lasso** (rectangle sur le fond) pour déplacer des groupes d'éléments. Le **déplacement du canvas** (pan) se fait avec **Espace maintenu + drag** ou au **trackpad** (défilement deux doigts). Détail technique : [evolution-v2.md](../05-implementation/evolution-v2.md) §7.

## 13. Portails = mode de rendu d'un lien (révisé, en construction)

Pour éviter les liens qui repartent en arrière ou traversent une page/un élément, un lien peut être **rendu en portail** : deux pastilles de renvoi au lieu d'un long tracé. **Décision** : le portail n'est **pas un nœud** mais un **mode de rendu d'une arête** (`edge.attrs.render: 'line' | 'portal'`), valable entre **n'importe quels éléments** (page↔page, page↔bloc, bloc↔bloc). **Automatisme = à la création ET au déplacement** (révisé 08/07/2026, le « création seulement » laissait des portails périmés après réorganisation) : le choix ligne/portail se (re)fait quand on crée un lien **et** au drop d'un déplacement d'élément, selon le **seul critère du chevauchement** du tracé direct (bord droit source → bord gauche cible, source/cible incluses). Une conversion **manuelle** pose un **verrou** (`renderManual`) que l'auto respecte. Spec : [evolution-v2.md](../05-implementation/evolution-v2.md) §8.

## 14. Tracés éditables (en construction)

On peut **ajouter des points d'inflexion** sur les arêtes manuelles (navigation, triggers, dépendances) et les repositionner pour **contourner des éléments**. Spec : [evolution-v2.md](../05-implementation/evolution-v2.md) §9.

## 11. Projet de démo

Un **projet de démonstration** réaliste (`app/fixtures/demo-project.flooow.json`) chargeable en un clic (« Charger la démo »), pour voir les fonctionnalités en action. **Maintenu à jour à chaque évolution** (fait partie de la définition de « fini » d'une itération).

## 15. Couche fonctionnelle : cadrage par fonctionnalité (2026-07-08)

Décisions issues de la fiche [cadrage-par-fonctionnalite.md](../02-fonctionnalites/cadrage-par-fonctionnalite.md), qui ajoute une couche de cadrage `domaine → module → fonctionnalité` **en amont** de la couche structurelle `site → page → bloc`.

**État (2026-07-08) : V0 livrée** au **format v3** (module + fonctionnalité, migration 2→3). Livré : bascule de couche Arborescence/Fonctionnalités (mode à la Figma, autre couche masquée), **module conteneur de ses fonctionnalités** (imbrication Vue Flow, auto-hauteur, comme page → blocs), création/édition/suppression, liens « dépend de » entre fonctionnalités, palette et raccourcis adaptés à la couche, persistance et invariants. **Éditeur de fonctionnalité en split pleine hauteur** (droite) façon Notion : au clic sur une fonctionnalité le canvas rétrécit et l'espace libéré devient une zone de contenu à champs invisibilisés. **Conversion one-shot locasyst livrée** : `scripts/generate-locasyst.ts` génère `fixtures/locasyst-project.flooow.json` (9 modules, 75 fonctionnalités, 75 liens « dépend de »), chargeable via le menu fichier (« Charger le cadrage locasyst »). **Routage des liens « dépend de »** : ports sur les 4 côtés, côté choisi par géométrie, **un lien = un port distinct** (figé) qui se place **face au nœud connecté** (offset aligné sur le centre de l'autre carte, résolution de collisions → tracés droits, pas de serpentin) + un port libre (interactif) par côté pour ajouter un lien. Flèche compacte. **Tous les tracés passent DERRIÈRE les cartes** (zIndex entre le fond du module et les cartes) : visibles dans les écarts, cachés là où ils croiseraient une carte. Bascule **Portail / Arrière-plan** pour les liens **inter-modules** : `portal` = pastilles compactes aux deux extrémités (clic = saut), `background` = ligne derrière les cartes. **Cartes à hauteur variable** affichant tous les champs (code, lot, estimation, titre, Quoi, Implique, À confirmer, Notes, périmètre), chacun tronqué en ellipsis (≤ 8 lignes) et masqué si vide. Action **« Réorganiser »** (barre fonctionnelle) : réaligne les modules en ligne propre puis recadre. **Différé** : l'affordance « réalisé par » + la vue « couverture » (le type d'arête `realizedBy` existe déjà dans le modèle mais sans UI), les vues dérivées fonctionnelles (catalogue / chiffrage / phasage), la nidification `domaine`, le retrait effectif de `hours` sur les notes (conservé tant qu'aucun remplaçant n'est branché), et le drag-réordonnancement des fonctionnalités entre modules.

- **Deux objets distincts.** La **fonctionnalité** (unité de cadrage : code, périmètre, dépend de / débloque, à confirmer, lot, estimation) et le **comportement** (note `attachedTo` une page ou un bloc) restent séparés, reliés par le pont **« réalisé par »**. Fusion écartée (cardinalités n:n, fonctionnalité sans page pour le socle / les transverses / le back).
- **Estimation sur la fonctionnalité uniquement.** Le comportement **perd son chiffrage** (`hours` retiré, à terme) et redevient une annotation. Le coût d'une page est **dérivé** par roll-up des fonctionnalités qu'elle réalise. **Amende la décision §9** (qui chiffrait les comportements). Séquencement : le retrait de `hours` est conditionné à l'implémentation de la couche fonctionnelle ; d'ici là, le chiffrage sur comportements reste en place.
- **Basculement de mode (à la Figma).** Le canvas a un **mode Fonctionnalités** et un **mode Arborescence** : chacun change la palette et les interactions, **l'autre couche est complètement masquée**. **Un seul fichier / un seul graphe** sous le capot ; le mode est une lentille. « réalisé par » se pose via une **affordance dédiée** et se consulte dans une **vue « couverture »**.
- **Import : non retenu pour l'instant.** Ni feature d'import, ni parser `.mdx`. Prévu **à terme** : une **conversion one-shot locasyst → Flooow** exploratoire (validation du modèle). Un import futur passerait par un **format tabulaire neutre**, jamais par les conventions codées en dur d'un projet client.

---

## Questions encore ouvertes

- Coefficient de risque : global au projet, ou renforcé sur les seuls éléments marqués risqués (ex. ×1,5 si `risk`) ?
- Postes hors-canvas dans le chiffrage (setup projet, recette, déploiement) : saisis directement dans la vue chiffrage ?
- Les pages/sections se chiffrent-elles elles-mêmes (intégration, gabarit) en plus de leurs comportements ?

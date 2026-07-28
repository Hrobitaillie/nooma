# Concept & vision

**Flooow** — outil interne de cadrage visuel pour projets web de solutions métier.

## Le problème

Cadrer un projet web de solution métier est difficile, même pour des développeurs expérimentés :

- Les besoins du client sont exprimés en vrac (mails, ateliers, appels) et jamais consolidés.
- L'arborescence du site, les comportements attendus et les contraintes techniques vivent dans des outils séparés (Figma, Notion, tableur, tête des devs).
- Les connexions API et les interdépendances entre écrans sont découvertes **pendant** le développement, pas avant — d'où les dépassements de charge.
- Le cahier des charges, quand il existe, est un document Word figé qui diverge immédiatement de la réalité.

## L'idée

Un **canvas** (façon Figma / Octopus.do) où l'on modélise le projet en frames imbriquées — **site → pages → sections** — en accrochant à chaque frame des comportements, des spécifications techniques, des contraintes, des connexions API et des relations entre éléments (voir [frames-et-scopes.md](../02-fonctionnalites/frames-et-scopes.md)).

## Deux phases d'usage

| Phase | Qui | Pour quoi |
|---|---|---|
| **Cadrage** | Le technicien, en atelier de co-construction avec le client | Modéliser, ne rien oublier, faire émerger les interdépendances, préparer le chiffrage |
| **Réalisation** | Devs & designers | Référence : quelles fonctionnalités, quels liens entre éléments, quels contrats d'API |

Outil purement interne : le client ne touche pas à l'outil, il reçoit des **exports PDF** quand nécessaire.

## L'insight central : un graphe, plusieurs vues

> **Le canvas n'est pas le produit. Le produit est un graphe de données unique ; le canvas, la vue « Spécifications techniques » et la vue « API » ne sont que des projections de ce même graphe.**

| Projection | Ce qu'elle montre | Comment elle est dérivée |
|---|---|---|
| **Canvas** | La carte spatiale : frames imbriquées, comportements, services, liens — **c'est aussi l'arborescence du site** | Vue d'édition principale du graphe |
| **Spécifications techniques** | Le cahier des specs : sommaire ordonné des pages, sections transversales + fiche par page (avec roll-up des sections) | Agrégation des attributs par frame |
| **API** | Tous les endpoints et services consommés, et par qui | Regroupement des liens « consomme » |
| **Chiffrage** *(plus tard)* | Estimations agrégées par lot / page / facette | Somme des heures saisies, fourchette basse/haute via coefficient de risque |

Tout ce qui est écrit dans le canvas alimente automatiquement les autres vues. On ne rédige jamais deux fois.

## La promesse

- **Pendant le cadrage** : réfléchir visuellement, décomposer chaque page en sections et fonctionnalités, faire émerger les interdépendances avant qu'elles ne coûtent cher.
- **À la fin du cadrage** : sortir un cahier des specs et un contrat d'API — le canvas sert à réfléchir, l'export sert à contractualiser.
- **Pendant la réalisation** : une source unique où dev et designer retrouvent le périmètre convenu.

Voir aussi : [positionnement.md](positionnement.md) · [decisions.md](decisions.md)

# Vues dérivées

Les vues sont des **projections en lecture** du graphe. On n'y rédige rien : tout vient du canvas, mis en forme automatiquement au fil de la saisie. Toutes sont **filtrables par facette** front/back ([frames-et-scopes.md](frames-et-scopes.md)).

## 1. Arborescence : c'est le canvas

Pas de vue arborescence séparée : **le canvas est déjà la carte du site** (frames pages + liens « navigue vers »). Faire une vue sitemap à côté serait redondant. Ce qui reste à dériver, c'est ce que le canvas ne donne pas :

- **Un ordre linéaire des pages** pour le sommaire du cahier des specs (un canvas est spatial, un document est séquentiel). Règle actée : **ordre de lecture spatial du canvas — de haut en bas, puis de gauche à droite**, calculé sur l'origine top-left de chaque frame et recalculé à chaque déplacement. Organiser le canvas, c'est organiser le cahier. Même règle pour l'ordre des sections dans une page.
- **La détection des pages orphelines** (non reliées à la navigation) → signalées directement sur le canvas, comme les éléments incomplets.
- Un éventuel **panneau latéral de navigation** (liste indentée cliquable pour centrer le canvas sur une page) — confort, pas une vue à part entière.

## 2. Spécifications techniques

La vue qui remplace le cahier des charges rédigé à la main. Structure du cahier — pas uniquement par page :

1. **Transversal (scope site)** : contexte, contraintes globales, services externes.
2. **Fiche par page**, avec **roll-up** : les éléments propres de la page + ceux de ses sections.

```
## Tableau de bord commandes  (/admin/commandes)
Accès : admin, gestionnaire

> Description de la page…

### Section — Listing commandes
- Contraintes : pagination serveur 50/p
- Recherche à facettes [fullstack] — déclencheur : saisie utilisateur — complexité M
  Règles : …
- Consomme : ERP Acme — GET /orders

### Comportements de la page
- Export CSV [back] — complexité S

### Contraintes de la page
- Temps réel sur le statut des commandes
```

- Indicateur de complétude par frame (champs obligatoires remplis ?) → tableau de bord du cadrage.
- Filtres : par facette front/back, par rôle d'accès, par complexité, par présence de risque.

## 3. Vue API

Regroupe tous les liens **« consomme »** :

- **Par service** : chaque service externe, ses endpoints utilisés, son auth, ses contraintes, et *quelles frames/comportements en dépendent*.
- **Par page** (vue inversée) : ce que chaque écran consomme, sections incluses.
- Met en évidence les services à **risque élevé** et les endpoints consommés par de nombreux nœuds (points de fragilité).
- Base de l'export contrat d'API (voir [exports.md](exports.md)).

## 4. Vue chiffrage (V2)

Agrégation des heures saisies sur les éléments, sous-totaux par lot / page / facette, fourchette basse/haute via le coefficient de risque — détaillée dans [chiffrage.md](chiffrage.md).

## 5. Autres vues candidates

- **Vue risques** : tous les nœuds marqués risqués + leurs dépendants transitifs.
- **Vue matrice de dépendances** : qui casse quoi si un service change.

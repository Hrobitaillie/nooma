# Flooow

Outil interne de cadrage visuel pour projets web de solutions métier : un canvas de frames imbriquées (site → pages → sections) et de nœuds typés (comportements, services/API) reliés par des liens typés, d'où sont dérivées automatiquement une arborescence, une vue « Spécifications techniques », une vue « API » et, plus tard, une vue « Chiffrage ».

> **Insight central** : le canvas n'est pas le produit — le produit est un graphe unique, dont canvas, specs et API ne sont que des projections.

Deux phases d'usage : le **cadrage** (atelier de co-construction, piloté par le technicien) puis la **réalisation** (référence pour devs et designers). Le client ne touche pas l'outil ; il reçoit des exports PDF.

## Ce dépôt

Pour l'instant : le **cadrage du projet lui-même** (démarche méta assumée 🙂).

```
cadrage/
  index.html            viewer : sidebar + rendu des fichiers markdown
  01-vision/            concept, positionnement, décisions & arbitrages
  02-fonctionnalites/   canvas, frames & scopes, nœuds & liens, vues dérivées, chiffrage, exports
  03-technique/         modèle de données, stack
  04-roadmap/           périmètre MVP
  05-implementation/    doc d'implémentation pour agents IA : architecture,
                        UI flottante, données JSON, algorithmes, sécurité,
                        performances, plan de dev par jalons
```

## Lire le cadrage

```bash
pnpm install   # une seule fois
pnpm start     # sert le dossier cadrage/ et affiche l'URL (http://localhost:3000)
```

Pour ajouter un document : créer le `.md` dans `cadrage/<catégorie>/` puis l'ajouter au manifeste `DOCS` en tête de `cadrage/index.html`.

# Positionnement & outils existants

## Panorama

| Outil | Force | Pourquoi ça ne suffit pas |
|---|---|---|
| **Octopus.do, FlowMapp, Relume** | Arborescence visuelle rapide, jolie | Les nœuds sont creux : pas de contraintes techniques, pas d'API, pas de logique. C'est du sitemap, pas du cadrage. |
| **Figma / FigJam, Whimsical, Miro** | Canvas libre, collaboration | Zéro structure : un post-it n'est pas de la donnée, c'est du dessin. Impossible d'en dériver une vue Specs ou API. |
| **Eraser.io, Structurizr (C4), IcePanel** | Ont compris « un modèle, plusieurs vues » | Niveau architecture logicielle (services, conteneurs), pas niveau fonctionnel d'un site métier (pages, comportements, parcours). Structurizr est code-first, pas canvas-first. |
| **Notion / Confluence** | Rédaction structurée, base de données | Aucune spatialité, aucune vision d'ensemble ; les interconnexions restent implicites. |
| **Jira / Linear** | Suivi d'exécution | Arrive trop tard : on y met des tickets, pas une compréhension du système. |

## Le créneau

Le niveau **« fonctionnel + technique » d'une solution métier web** : assez concret pour parler pages et comportements avec le client, assez structuré pour en sortir des spécifications et un contrat d'API.

Personne ne tient bien ce niveau-là aujourd'hui :

- Les outils de sitemap sont trop pauvres.
- Les outils de whiteboard sont trop libres.
- Les outils d'architecture sont trop bas niveau et pensés pour documenter l'existant, pas pour cadrer l'à-venir.

## Différenciateurs

1. **Nœuds riches** : chaque page/comportement porte des attributs structurés (contraintes, logique, endpoints, accès).
2. **Liens typés** : « navigue vers », « consomme », « déclenche », « dépend de » — c'est le typage qui rend les vues dérivées intelligentes.
3. **Vues générées** : specs techniques et vue API produites automatiquement au fil de la saisie.
4. **Export contractuel** : Markdown / PDF / OpenAPI à coller dans un devis ou un cahier des charges.

## Risque principal

Devenir un « deuxième backlog » que personne ne met à jour — le cimetière classique des outils de documentation. Parade : se positionner d'abord comme **outil de cadrage** (photo à l'instant T, valeur immédiate même si abandonné après kickoff), pas comme documentation vivante synchronisée au code — décision actée, voir [decisions.md](decisions.md).

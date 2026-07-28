# Le canvas

Vue d'édition principale du graphe. Façon Figma / Octopus.do : espace infini, pan & zoom, drag & drop, **frames imbriquées** (voir [frames-et-scopes.md](frames-et-scopes.md)).

## Interactions de base

- **Ajouter une page** : double-clic sur le canvas ou palette latérale → une frame page.
- **Ajouter une section** : poser une frame section *dans* une page ; réorganisation et déplacement entre pages par drag & drop.
- **Accrocher un élément** : comportement, contrainte, connexion API… déposé sur une frame (site, page ou section) — le niveau d'accroche définit son scope.
- **Relier deux nœuds** : tirer un lien depuis le port d'un nœud → choisir le type de lien ([noeuds-et-liens.md](noeuds-et-liens.md)).
- **Éditer** : clic → panneau latéral de propriétés (champs fixes + notes libres). Le canvas reste visible pendant l'édition.
- **Organiser** : sélection multiple ; l'agencement spatial des frames définit l'ordre du cahier des specs (haut → bas, gauche → droite) ; assigner un lot de réalisation à une frame (hérité par ses enfants), colorer/filtrer par lot pour discuter le périmètre en atelier.
- **Naviguer** : minimap, zoom-to-fit, recherche d'un nœud par nom.

## Représentation visuelle

- Chaque type de nœud a une forme/couleur distincte ; les frames sections sont visuellement contenues dans leur page.
- Les liens typés ont des styles distincts (trait plein = navigation, pointillé = consommation API, etc.).
- Badges sur les frames : nombre de comportements, contraintes, connexions API — pour repérer d'un coup d'œil où c'est dense/risqué.
- **Filtre par facette** front/back : n'afficher que la couche qui intéresse.
- Un élément incomplet (attributs obligatoires manquants) est signalé visuellement → le canvas devient une **checklist de cadrage**.
- Zoom sémantique (piste) : dézoomé, on voit le site en pages ; zoomé, le détail des sections apparaît.

## Principes UX

1. **Friction de saisie minimale** : poser l'ossature d'un projet en 10 minutes pendant un atelier de co-construction (c'est le technicien qui manipule, le client regarde), enrichir après.
2. **Le canvas reste une carte, pas un formulaire** : le détail vit dans le panneau de propriétés et les vues dérivées, pas dans les boîtes.
3. **Rien n'est perdu** : tout champ libre saisi finira dans l'export specs.

## Hors périmètre (explicitement)

- Le canvas ne fait **pas** de wireframe ni de maquette — Figma le fait mieux. On modélise le *système*, pas l'*écran*. (Les frames sections décomposent fonctionnellement une page, elles n'en dessinent pas la mise en page.)
- Pas de diagramme d'architecture infra (serveurs, conteneurs) — niveau C4 hors sujet.

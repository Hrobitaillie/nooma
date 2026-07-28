# Stack technique (actée)

Objectif MVP : **mono-utilisateur, local-first, zéro backend**. Toute la complexité doit aller dans le produit, pas dans l'infra.

Contexte équipe : développeurs WordPress, à l'aise en PHP, orientation Vue côté front. La stack suit l'équipe — l'outil est interne, la maintenabilité par l'équipe prime sur la maturité marginale d'une lib.

## Front

| Brique | Choix | Pourquoi |
|---|---|---|
| Framework | **Vue 3 + TypeScript + Vite** | Orientation naturelle de l'équipe ; TS indispensable vu le modèle de graphe |
| Canvas | **Vue Flow** | Port Vue 3 de la famille xyflow (même ADN que React Flow) : nœuds imbriqués parent/enfant (= nos frames page/section), liens typés, minimap, zoom/pan. Mûr et activement maintenu |
| État | **Pinia** | Le store standard Vue ; un store « graphe » central, les vues dérivées sont des getters |
| Rendu des vues dérivées | Composants Vue qui **projettent le store** | Aucune donnée dupliquée : specs, API, chiffrage = getters sur le graphe |
| Markdown (exports) | Génération par templates littéraux | Pas besoin de lib lourde |
| Styles | **Tailwind CSS** | Rapide pour une app outil dense (panneaux, tableaux, vues) |

## Pourquoi pas React, pourquoi pas PHP

- **React Flow** est un peu plus mûr que Vue Flow, mais l'écart ne justifie pas d'imposer React à une équipe Vue : le canvas est le cœur du produit, il sera modifié en permanence — il doit être dans la techno que l'équipe lit couramment. Vue Flow couvre tout ce dont le MVP a besoin (subflows/imbrication compris).
- **PHP** : inutile au MVP puisqu'il n'y a pas de backend. Si un backend arrive un jour (partage lecture seule, lien client), il pourra être en PHP/Laravel — pile dans les compétences de l'équipe. Le format projet JSON documenté rend ce futur backend trivial.

## Persistance

- **MVP** : fichier JSON — File System Access API (Chrome/Edge) avec fallback download/upload, + autosave IndexedDB pour ne rien perdre.
- Un projet = un fichier → versionnable en git, partageable par mail/Slack. Cohérent avec [modele-de-donnees.md](modele-de-donnees.md).
- **Plus tard seulement** : backend (PHP possible) pour le partage ; si collaboration temps réel un jour : Yjs/CRDT plutôt qu'un REST maison.

## Ce qu'on ne fait PAS au MVP

- ❌ Backend, comptes, auth
- ❌ Collaboration temps réel
- ❌ Base de données
- ❌ App desktop (Electron/Tauri) — le navigateur suffit ; Tauri reste une porte de sortie si File System API frustre

## Risques techniques identifiés

1. **Performance canvas** au-delà de ~200 nœuds → Vue Flow tient, mais éviter de re-render tout le graphe à chaque frappe (édition dans un state séparé, commit au blur).
2. **Undo/redo** : à concevoir dès le début (patchs immutables sur le store), très pénible à greffer après.
3. **Ordre spatial du cahier** : prévoir une tolérance de « rangée » sur le tri haut→bas / gauche→droite, sinon l'ordre bascule au moindre pixel de drag.
4. **Migrations de format** : `meta.formatVersion` dès le premier fichier sauvegardé.

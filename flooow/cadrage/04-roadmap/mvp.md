# Roadmap — MVP

## Objectif du MVP

> Cadrer **un vrai projet client de bout en bout** avec Flooow, et produire un cahier des specs (PDF) réellement envoyé au client ou utilisé au kickoff.

C'est le seul critère de succès. Pas de métriques vanité : soit l'export a servi, soit non.

## Périmètre V0 (prototype jetable, ~quelques jours)

- [ ] Canvas Vue Flow : frames **pages** contenant des frames **sections** (imbrication drag & drop)
- [ ] Nœuds comportement et service externe, accrochables à n'importe quelle frame
- [ ] Panneau de propriétés par type (champs fixes minimaux + notes, facette front/back sur les comportements)
- [ ] Liens typés (navigue vers, consomme, déclenche, dépend de)
- [ ] Vue Specs générée avec roll-up sections → page → site (lecture seule)
- [ ] Vue API générée (lecture seule)
- [ ] Sauvegarde/chargement JSON (download/upload suffit)

**But de la V0** : valider que la boucle « je saisis dans le canvas → je lis des specs propres » procure le déclic attendu. Si non, pivoter avant d'investir.

## Périmètre V1 (MVP utilisable en vrai)

- [ ] Sommaire ordonné des pages pour l'export (ordre spatial du canvas : haut → bas puis gauche → droite, sur l'origine top-left des frames) + signalement des pages orphelines sur le canvas
- [ ] Filtrage par facette front/back (canvas + vues)
- [ ] Indicateurs de complétude (éléments incomplets signalés)
- [ ] Export Markdown + **PDF** : cahier des specs (sections transversales + fiche par page) et contrat d'API
- [ ] Undo/redo
- [ ] Autosave IndexedDB + File System Access API
- [ ] Recherche de nœud, zoom-to-fit, minimap
- [ ] Champs heures + lot sur les éléments chiffrables, avec héritage du lot depuis la frame parente (saisie seulement — la vue chiffrage attendra)

## Plus tard (V2+, selon usage réel)

- Vue + export chiffrage (sous-totaux par lot / page / facette, abaque) — cf. [chiffrage.md](../02-fonctionnalites/chiffrage.md)
- Présets de structure (page CRUD, section listing…)
- Partage lecture seule en ligne (lien client)
- Export tickets (one-shot, sans synchro)
- Niveau « composant » sous les sections, si le besoin est prouvé
- Schéma extensible (champs définis par l'équipe)
- Collaboration temps réel (Yjs) — seulement si la douleur est prouvée

## Prochaines étapes concrètes

1. ~~Trancher les questions ouvertes~~ → fait, voir [decisions.md](../01-vision/decisions.md)
2. ~~Choisir un nom~~ → **Flooow**
3. ~~Rédiger la doc d'implémentation~~ → fait, voir [plan-de-dev.md](../05-implementation/plan-de-dev.md) et le dossier `05-implementation/`
4. Trancher les questions restantes de [chiffrage.md](../02-fonctionnalites/chiffrage.md) (rien de bloquant pour la V0)
5. Construire la V0 en suivant les jalons M0 → M6 du [plan de dev](../05-implementation/plan-de-dev.md), et la tester sur un projet passé (re-cadrer un projet déjà livré : on connaît la vérité terrain, on voit ce que l'outil aurait attrapé)

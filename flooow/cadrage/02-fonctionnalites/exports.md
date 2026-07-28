# Exports

> Le canvas sert à réfléchir, **l'export sert à contractualiser**. C'est le différenciateur principal face aux outils de whiteboard.

Priorités actées ([decisions.md](../01-vision/decisions.md)) : **1. cahier des specs · 2. contrat d'API · 3. chiffrage**. L'outil étant purement interne, le PDF envoyé au client est un livrable de premier rang.

## MVP

### 1. Cahier des spécifications (Markdown → PDF)
Le livrable central. Structure — pas uniquement par page :

1. **Sections transversales** : contexte du projet, contraintes globales (accrochées au scope site), services externes, sommaire/plan de navigation.
2. **Une section par page** : description, accès, ses sections (roll-up), comportements, connexions, contraintes.
3. **Annexe API**.

- **Markdown** d'abord : versionnable en git, diffable, collable dans Notion/Confluence.
- **PDF** dans la foulée (le client reçoit du PDF, pas du Markdown) : conversion pandoc/typst au début, mise en page soignée (page de garde, logo) dès que possible.
- Filtre par facette possible : un cahier « front » pour le designer, un « back » pour le dev API.

### 2. Contrat d'API (Markdown)
- La vue API par service : endpoints, auth, contraintes, consommateurs.
- Sert de base de discussion avec le prestataire / l'éditeur du système tiers **avant** de développer.

### Export / import du projet (JSON)
- Le graphe complet dans un fichier `.json` lisible : sauvegarde, versionning git, garantie de non-enfermement dès le premier jour. (C'est aussi le format de travail : un projet = un fichier.)

## V2 — selon les retours

| Export | Valeur | Note |
|---|---|---|
| **Chiffrage (CSV/tableur)** | Éléments + estimations, sous-totaux par lot/page/facette → devis | Priorité 3 actée ; pistes dans [chiffrage.md](chiffrage.md) |
| **OpenAPI (squelette)** | Pré-remplir le contrat d'interface | Seulement les endpoints déclarés ; pas de schémas de payload au début |
| **Tickets (Jira / Linear / GitHub)** | Un comportement = une user story | Attention au piège « deuxième backlog » : export one-shot, pas de synchro |

## Principes

1. **Toujours du texte d'abord** (Markdown/JSON) : c'est ce que des devs versionnent et diffent. Le PDF est une mise en forme du Markdown.
2. **Export = photo datée** : on n'essaie pas de synchroniser l'export avec le canvas après coup. Un export a une date, point.
3. **Aucune rédaction dans l'export** : si l'export est mauvais, c'est que la saisie dans le canvas est incomplète — et l'outil doit le montrer *avant* l'export (indicateurs de complétude).
4. **Le chiffrage ne sort jamais dans le cahier des specs** : vues et exports séparés (le cahier part chez le client).

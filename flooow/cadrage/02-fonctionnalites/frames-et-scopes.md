# Frames & scopes

Le besoin : décomposer chaque page en sections/fonctionnalités, accrocher comportements, spécifications et relations **au bon niveau**, et pouvoir raisonner « site entier », « cette page », « cette section » — mais aussi « tout le front » ou « tout le back ».

## Deux dimensions orthogonales

La clé de la modélisation : ne pas mélanger deux questions différentes.

| Dimension | Question à laquelle elle répond | Mécanisme |
|---|---|---|
| **Hiérarchie de contenance** (frames imbriquées) | *Où, dans quelle partie du produit ?* | site → page → section |
| **Facettes** (front / back) | *Dans quelle couche technique ?* | étiquette transversale sur les éléments |

### 1. La hiérarchie : des frames imbriquées

- Le projet est une frame racine implicite : le **site** (porte le contexte global, les contraintes générales).
- Une **page** est une frame principale posée sur le canvas.
- Une **section** est une frame posée *dans* une page (header, listing, formulaire, panneau de filtres…). Déplaçable d'une page à l'autre par drag & drop.
- Tout élément (comportement, spécification, contrainte, connexion API, relation) s'accroche à **n'importe quelle frame** — le niveau d'accroche définit son scope :
  - accroché au site → vaut partout (ex. « authentification SSO obligatoire »)
  - accroché à une page → vaut pour la page (ex. « accès admin uniquement »)
  - accroché à une section → vaut pour la section (ex. « le listing pagine par 50 »)

**Règle de roll-up** : la fiche specs d'une frame = ses éléments propres **+ l'agrégat de ses enfants**. La fiche d'une page inclut donc ses sections ; la vue site inclut tout.

### 2. Les facettes : front / back

Pourquoi pas des frames « front » et « back » ? Parce qu'une même page (et une même section) a presque toujours les deux — il faudrait tout dupliquer. La contenance dit *où*, la facette dit *quelle couche*.

- Chaque élément accroché porte une facette optionnelle : `front` | `back` | `fullstack` (défaut : non précisé).
- Le canvas et les vues dérivées sont **filtrables par facette** : « montre-moi tout le back du site », « le front de cette page ».
- Le cahier des specs peut proposer un sommaire croisé : par page *et* par facette.
- Utile plus tard pour le chiffrage : sous-totaux par profil (dev front / dev back).

## Sur le canvas

- Vue Flow (famille xyflow) gère nativement les nœuds parents/enfants : les frames sections vivent dans la frame page, se déplacent avec elle, et se réorganisent par drag & drop.
- Le lien « navigue vers » ne relie que des **pages**. Les liens « consomme », « déclenche », « dépend de » peuvent partir de n'importe quelle frame ou comportement.
- Zoom sémantique envisageable : dézoomer → les sections s'estompent, on voit le site en pages ; zoomer → le détail des sections apparaît.

## Invariants

1. Une section appartient à exactement une page ; une page appartient au site.
2. Profondeur MVP : site / page / section. Le niveau « composant » attendra une V2 si le besoin est prouvé.
3. `navigue vers` : uniquement page → page.
4. Pas de frame « front »/« back » : la facette est un attribut, jamais un conteneur.

## Présets de structure

Pour poser vite l'ossature en atelier : des templates de frames — « page CRUD » (listing + formulaire + détail), « page tableau de bord », « section listing filtrable »… livrés avec l'app, éventuellement définissables par l'équipe plus tard. Cf. [noeuds-et-liens.md](noeuds-et-liens.md).

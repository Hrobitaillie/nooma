# Nœuds & liens

> ⚠️ **v1.** Le modèle courant (v2) remplace les *sections* par des **blocs pleine largeur typés** et fait des comportements/API des **notes reliées par proximité** — voir [evolution-v2.md](../05-implementation/evolution-v2.md). Cette page décrit les fondations v1.

Le cœur du modèle : des **frames imbriquées** (site → page → section) et des **nœuds typés** portant des attributs structurés, reliés par des **liens typés**. C'est le typage qui permet de générer les vues dérivées. La logique d'imbrication et de scopes est détaillée dans [frames-et-scopes.md](frames-et-scopes.md).

## Types de nœuds (MVP)

### 🖼 Frame
Conteneur hiérarchique. Trois natures (`kind`) au MVP :

| Kind | Rôle | Attributs spécifiques |
|---|---|---|
| **site** (racine implicite) | Le projet entier | contexte, contraintes globales, stack imposée |
| **page** | Un écran / une route | route, accès/rôles |
| **section** | Une zone fonctionnelle d'une page (header, listing, formulaire…) | description fonctionnelle |

Attributs communs à toutes les frames : nom, description, contraintes techniques, logique métier, notes libres.

### ⚙️ Comportement
Une fonctionnalité / interaction, accrochée à **n'importe quelle frame** (site, page ou section) — le niveau d'accroche définit son scope.

| Attribut | Exemple |
|---|---|
| Nom, description | « recherche à facettes », « notification email à la validation » |
| Facette | `front` / `back` / `fullstack` |
| Déclencheur | action utilisateur, cron, webhook |
| Règles / logique | conditions, cas limites |
| Estimation | heures (fourchette haute via coefficient de risque — cf. [chiffrage](chiffrage.md)) |
| Lot | lot 1 (indispensable) / lot ultérieur — hérité de la frame parente par défaut |

### 🔌 Service externe / API
Un système tiers ou interne consommé (ERP, CRM, paiement, service maison).

| Attribut | Exemple |
|---|---|
| Nom, type | REST, SOAP, GraphQL, SFTP… |
| Endpoints utilisés | `GET /orders`, `POST /invoices` |
| Auth | OAuth2, clé API |
| Contraintes | rate limit, sandbox dispo ?, doc fiable ? |
| Risque | faible / moyen / élevé |

## Types de liens (MVP)

| Lien | De → vers | Alimente |
|---|---|---|
| *contenance* | implicite via l'imbrication des frames (pas un lien manuel) | le roll-up des vues specs & chiffrage |
| **navigue vers** | page → page uniquement | l'arborescence |
| **consomme** | frame ou comportement → service externe (+ endpoint précis) | la vue API |
| **déclenche** | comportement → comportement | la vue specs (chaînes d'effets) |
| **dépend de** | tout → tout | l'analyse de risque / ordre de dev |

## Champs fixes, champs libres, présets

Trois niveaux de flexibilité, du plus simple au plus ambitieux :

1. **MVP — champs fixes minimaux + notes libres partout.** ~5 champs structurés par type (ceux qui alimentent les vues dérivées), et un champ libre sur chaque élément pour tout le reste. Trop structurer tue la saisie ; pas assez structurer tue les vues dérivées.
2. **Présets de structure** : des templates prêts à poser — « page CRUD » (listing + formulaire + détail), « page tableau de bord », « section listing filtrable », liaisons types. Livrés avec l'app ; accélèrent l'atelier sans rien changer au modèle.
3. **Schéma extensible (V2+)** : la possibilité pour l'équipe de définir **ses propres champs structurés** (voire ses propres types de nœuds), stockés dans le fichier projet — à la manière des propriétés d'une base Notion. Ex. : ajouter un champ « RGPD » sur toutes les pages d'un projet santé, et ce champ apparaît dans le panneau de propriétés, les vues et les exports. Puissant, mais c'est un méta-modèle à concevoir : hors MVP. Les présets (niveau 2) couvrent 80 % du besoin d'adaptation entre projets.

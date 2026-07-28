# Chiffrage

Priorité 3 des exports, hors cœur de MVP — mais la méthodo est actée ([decisions.md](../01-vision/decisions.md#8-chiffrage--lots-heures-coefficient-de-risque)) et le modèle de données la prépare dès le départ.

## Méthodo actée

- **Découpage en lots** : les gros projets sont décomposés en lots de réalisation ; chaque fonctionnalité est marquée **lot 1** (indispensable) ou lot ultérieur. Le lot structure le devis et le planning.
- **Unité : l'heure.** Le taux journalier est appliqué en aval — l'outil totalise des heures ; un paramètre projet optionnel (TJ) peut afficher des € à côté.
- **Provision pour risque** : coefficient multiplicateur paramétrable (ex. **×1,25**) → chaque total existe en **fourchette basse** (heures saisies) et **haute** (× coeff).

## Principe directeur

> **Saisie au plus près de l'élément, agrégation dans une vue dédiée.**

- La **saisie** se fait dans le panneau de propriétés de chaque élément chiffrable (comportement, section, connexion API) : heures estimées + lot, remplis au fil du cadrage pendant qu'on a le contexte en tête.
- L'**agrégation** vit dans une vue à part — jamais dans la vue specs : le cahier des specs part chez le client, le chiffrage est interne.

## Mécanique des lots

- `lot` est un attribut de tout élément chiffrable.
- **Héritage par défaut** : un lot posé sur une frame (page ou section) s'applique à tous ses enfants, sauf override élément par élément. On marque une page entière « lot 2 », puis on repêche ses deux comportements indispensables en lot 1.
- Le canvas peut colorer/filtrer par lot → discussion périmètre avec le client en atelier (« ça, on le met en lot 2 »).

## La vue chiffrage (esquisse)

Tableau croisé de tous les éléments chiffrables, totaux en heures basse/haute :

| Axe de regroupement | Utilité |
|---|---|
| **Par lot** (principal) | Structure du devis et du planning |
| **Par page** | Roll-up des sections et comportements ([frames-et-scopes.md](frames-et-scopes.md)) |
| **Par facette front/back** | Sous-totaux par profil (dev front / dev back) → staffing |

- Les éléments **non chiffrés** sont listés en tête (reste-à-chiffrer) → la vue sert aussi de checklist.
- Les éléments marqués **risqués** sont signalés.
- Export : CSV/tableur ; conversion € via le TJ paramétré si renseigné.

## Questions restantes

1. Coefficient **global** au projet, ou renforcé sur les seuls éléments `risk` (ex. ×1,5) ? Les deux combinables ?
2. Postes hors-canvas (setup projet, recette, déploiement, gestion de projet) : saisis directement dans la vue chiffrage ?
3. Les pages/sections se chiffrent-elles **elles-mêmes** (intégration, gabarit) en plus de leurs comportements ?

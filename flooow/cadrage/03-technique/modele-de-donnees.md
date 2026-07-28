# Modèle de données

> ⚠️ Ce document décrit le **format v1**. Le modèle courant est le **format v2** (blocs, notes, connecteurs de proximité, registre de services) — voir [evolution-v2.md](../05-implementation/evolution-v2.md), qui fait foi. Cette page reste utile pour comprendre les fondations et la migration v1→v2.

Un projet = **un graphe sérialisé en un seul fichier JSON**, lisible, diffable, versionnable en git.

Deux structures superposées ([frames-et-scopes.md](../02-fonctionnalites/frames-et-scopes.md)) :
- un **arbre de contenance** via `parentId` (site → page → section, et éléments accrochés à leur frame) ;
- un **graphe de liens typés** via `edges` (navigation, consommation API, déclenchements, dépendances).

## Schéma (esquisse MVP)

```jsonc
{
  "meta": {
    "name": "Portail client Acme",
    "formatVersion": 1,
    "createdAt": "2026-07-07",
    "updatedAt": "2026-07-07",
    "pricing": {                             // paramètres de chiffrage du projet
      "riskCoeff": 1.25,                     // fourchette haute = heures × coeff
      "dailyRate": null                      // TJ optionnel, pour afficher des €
    }
  },

  "site": {                                  // frame racine implicite (scope site)
    "attrs": {
      "context": "…",
      "constraints": ["SSO obligatoire", "hébergement on-premise"],
      "notes": "…"
    }
  },

  "nodes": [
    {
      "id": "page_dashboard",
      "type": "frame",
      "kind": "page",                        // page | section
      "parentId": null,                      // null = enfant direct du site
      "position": { "x": 320, "y": 140 },    // origine top-left → ordre du cahier (haut→bas, gauche→droite)
      "lot": 2,                              // lot de réalisation — hérité par les enfants sauf override
      "attrs": {
        "name": "Tableau de bord commandes",
        "route": "/admin/commandes",
        "roles": ["admin", "gestionnaire"],
        "description": "…",
        "constraints": ["temps réel statut"],
        "logic": "…",
        "notes": "…"                         // champ libre, toujours présent
      }
    },
    {
      "id": "sec_listing",
      "type": "frame",
      "kind": "section",
      "parentId": "page_dashboard",          // section contenue dans la page
      "position": { "x": 20, "y": 80 },      // relatif à la frame parente
      "attrs": {
        "name": "Listing commandes",
        "description": "…",
        "constraints": ["pagination serveur 50/p"],
        "notes": "…"
      }
    },
    {
      "id": "bhv_search",
      "type": "behavior",
      "parentId": "sec_listing",             // accroché à la section → scope section
      "attrs": {
        "name": "Recherche à facettes",
        "facet": "fullstack",                // front | back | fullstack | null
        "trigger": "saisie utilisateur",
        "rules": "…",
        "hours": 6,                          // estimation en heures (chiffrage)
        "lot": 1,                            // override : indispensable, malgré la page en lot 2
        "notes": "…"
      }
    },
    {
      "id": "svc_erp",
      "type": "service",
      "parentId": null,                      // les services vivent hors hiérarchie
      "attrs": {
        "name": "ERP Acme",
        "kind": "REST",
        "auth": "OAuth2 client_credentials",
        "endpoints": [
          { "method": "GET", "path": "/orders", "notes": "pagination 100/p" }
        ],
        "risk": "medium",
        "constraints": ["rate limit 60/min", "pas de sandbox"]
      }
    }
  ],

  "edges": [
    {
      "id": "e1",
      "type": "consumes",      // navigatesTo | consumes | triggers | dependsOn
      "source": "bhv_search",
      "target": "svc_erp",
      "attrs": { "endpointRef": "GET /orders" }
    }
  ]
}
```

## Décisions & questions

- **La contenance n'est pas une arête** : `parentId` suffit, c'est un arbre. Les `edges` ne portent que les relations non hiérarchiques. (Vue Flow fonctionne exactement comme ça avec ses nœuds imbriqués.)
- **L'ordre du cahier n'est pas stocké** : il est dérivé des `position` (tri haut→bas puis gauche→droite sur l'origine top-left). Déplacer une frame réordonne le document.
- **`lot` s'hérite** : résolu en remontant `parentId` jusqu'à trouver une valeur ; override possible à tout niveau.
- **Séparer données et présentation ?** `position`/`lot` sont de la vue. Pour le MVP on garde tout dans un fichier ; si besoin plus tard : `project.json` (fond) + `layout.json` (forme) pour des diffs git propres.
- **IDs** : slugs lisibles plutôt qu'UUID → diffs et exports lisibles par un humain.
- **Validation** : un JSON Schema du format dès le MVP — sert à l'app (intégrité) et aux utilisateurs (format documenté, pas de lock-in).
- **Versioning du format** : `meta.formatVersion` + migrations simples dès le départ, sinon dette immédiate.
- **Extensibilité** : `attrs.notes` partout ; plus tard `attrs.custom: {}` puis schéma extensible (cf. [noeuds-et-liens.md](../02-fonctionnalites/noeuds-et-liens.md)).

## Invariants à garantir

1. Toute arête référence deux nœuds existants (pas de liens fantômes).
2. `parentId` forme un arbre : pas de cycle, profondeur max site → page → section.
3. Une section a toujours pour parent une page ; un comportement peut s'accrocher à toute frame (ou au site via `parentId: null` + type site à préciser).
4. `navigatesTo` : uniquement entre frames `kind: page`.
5. `endpointRef` d'une arête `consumes` doit exister dans les endpoints du service cible.
6. `facet` n'existe que sur les éléments accrochés (comportements, contraintes…), jamais sur les frames.

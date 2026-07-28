# Logique & algorithmes

Toutes ces fonctions vivent dans `src/domain/`, sont **pures** (`(doc | Map) => résultat`, aucune dépendance Vue/Pinia) et testées unitairement. Elles implémentent les règles actées dans [decisions.md](../01-vision/decisions.md) et [frames-et-scopes.md](../02-fonctionnalites/frames-et-scopes.md).

## 1. Ordre spatial (ordering.ts) — règle actée §7

L'ordre du cahier = lecture du canvas **haut → bas puis gauche → droite**, sur l'origine top-left des frames. Jamais stocké, toujours recalculé.

```ts
const ROW_TOLERANCE = 48 // px monde (≈ un demi en-tête de frame) — constante exportée, testée

export function spatialOrder(frames: FrameNode[]): FrameNode[] {
  // 1. tri primaire par y
  const byY = [...frames].sort((a, b) => a.position.y - b.position.y)
  // 2. clustering en rangées : nouvelle rangée quand y s'éloigne de la référence de la rangée
  const rows: FrameNode[][] = []
  for (const f of byY) {
    const row = rows.at(-1)
    if (row && f.position.y - row[0].position.y <= ROW_TOLERANCE) row.push(f)
    else rows.push([f])
  }
  // 3. tri de chaque rangée par x
  return rows.flatMap(row => row.sort((a, b) => a.position.x - b.position.x))
}
```

- **Tolérance de rangée** : deux frames décalées de < 48 px en Y sont « sur la même ligne » — l'ordre ne bascule pas au moindre pixel de drag (risque identifié dans [stack.md](../03-technique/stack.md)).
- Appliqué aux **pages** (positions absolues) et, indépendamment, aux **sections de chaque page** (positions relatives à la page).
- Complexité O(n log n), n ≤ quelques centaines → se recalcule à la volée à chaque affichage/export, pas de cache nécessaire. Le badge « #n » affiché pendant un drag ([interface.md](interface.md)) appelle cette même fonction.
- Cas limites testés : frames exactement alignées (tie-break par x puis par id pour un ordre **déterministe**), rangée en escalier (chaque frame à +49 px → chacune sa rangée), liste vide.

## 2. Héritage de lot (lots.ts) — règle actée §9

```ts
export function resolveLot(id: string, index: Map<string, FlooowNode>): number {
  let n = index.get(id)
  while (n) {
    if (n.lot != null) return n.lot
    n = n.parentId ? index.get(n.parentId) : undefined
  }
  return 1 // défaut projet : lot 1
}
```
Le panneau de propriétés affiche la valeur résolue avec sa provenance : « Lot 2 *(hérité de la page Tableau de bord)* » et un bouton « surcharger / ré-hériter » (`lot = null` pour ré-hériter).

## 3. Roll-up (rollup.ts)

`descendants(frameId)` : parcours de l'arbre `parentId` (index inversé `Map<parentId, children[]>` maintenu par le store). Utilisé par :
- la fiche specs d'une page = attrs de la page + sections (ordonnées spatialement) + comportements de chaque niveau ;
- les totaux chiffrage d'une frame = somme des `hours` résolus de ses descendants ;
- la suppression d'une frame = suppression en cascade (avec confirmation, cf. interface).

## 4. Pages orphelines (reachability.ts)

BFS sur les edges `navigatesTo` depuis `meta.homePageId`. Pages non atteintes → `orphans: Set<string>`, matérialisé sur le canvas (pastille « non reliée à la navigation »). Si `homePageId` est null : aucune orpheline signalée, mais un hint « définir la page d'accueil ».

## 5. Complétude (completeness.ts)

Champs obligatoires par type (constante exportée, la même qui pilote les astérisques du panneau de propriétés) :

| Type | Obligatoires |
|---|---|
| frame page | name, route, description |
| frame section | name, description |
| behavior | name, description, trigger |
| service | name, kind, auth, ≥ 1 endpoint |

`completeness(node) → { missing: string[], complete: boolean }` ; agrégé par frame pour la pastille canvas et le tableau de bord de complétude de la vue specs. **Aucun export n'est bloqué** par l'incomplétude — elle est signalée en tête de l'export (« 4 éléments incomplets »), c'est tout.

## 6. Dérivation du cahier des specs (derive/specs.ts)

```
deriveSpecs(doc, filter?) →
  { warnings: incomplets/orphelines,
    transversal: { context, constraints, services résumés, sommaire },   // scope site
    pages: [ { frame, sections: [ { frame, behaviors, consumes } ],     // ordre spatial
               behaviors propres, consumes propres, constraints } ] }
```
- `filter` optionnel `{ facet?, lot? }` : produit un cahier « front seulement » ou « lot 1 seulement ». Le filtre s'applique aux éléments accrochés, jamais aux frames (on garde la structure).
- La structure retournée est **agnostique du rendu** : consommée telle quelle par `SpecsView.vue` et par `export/markdown.ts` — un seul dérivateur, deux rendus.

## 7. Dérivation de la vue API (derive/api.ts)

Regroupe les edges `consumes` :
- **par service** : endpoints déclarés, lesquels sont réellement consommés (et par qui — remonter la chaîne `parentId` du consommateur jusqu'à sa page pour l'affichage), endpoints déclarés jamais consommés (hint), consommateurs sans `endpointRef` (hint) ;
- **par page** (inversée) : tout ce que la page et ses descendants consomment ;
- services `risk: high` mis en tête.

## 8. Chiffrage (derive/estimate.ts) — interface posée au MVP, vue en V2

`deriveEstimate(doc) → { byLot, byPage, byFacet, unestimated: nodes[] }`, chaque total en `{ low: Σ hours, high: Σ hours × meta.pricing.riskCoeff }`. Conversion € (si `dailyRate`) : `high/7h × TJ` — au rendu uniquement, jamais stockée.

## 9. Invariants (invariants.ts)

Fonction `checkInvariants(doc) → Violation[]` exécutée : après chaque action en dev (throw), à l'ouverture de fichier (bloquant), avant chaque écriture (garde-fou). Liste complète dans [modele-de-donnees.md](../03-technique/modele-de-donnees.md) ; ajouter : unicité des ids, une seule `homePageId` existante ou null, `hours ≥ 0`, `lot ≥ 1`.

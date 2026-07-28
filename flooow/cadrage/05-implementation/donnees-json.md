# Manipulation des données JSON

Un projet = un document JSON (`*.flooow.json`), format 1 défini dans [modele-de-donnees.md](../03-technique/modele-de-donnees.md). Ce doc spécifie types, validation, persistance, autosave, migrations et undo/redo.

## Types TypeScript (model/types.ts)

```ts
export type NodeType = 'frame' | 'behavior' | 'service'
export type FrameKind = 'page' | 'section'
export type Facet = 'front' | 'back' | 'fullstack'
export type EdgeType = 'navigatesTo' | 'consumes' | 'triggers' | 'dependsOn'
export type Risk = 'low' | 'medium' | 'high'

export interface ProjectDoc {
  meta: {
    name: string
    formatVersion: 1
    createdAt: string            // ISO date
    updatedAt: string
    pricing: { riskCoeff: number; dailyRate: number | null }
    homePageId: string | null    // racine du parcours navigation (orphelines)
  }
  site: { attrs: SiteAttrs }
  nodes: FlooowNode[]
  edges: FlooowEdge[]
}

export interface BaseNode {
  id: string                     // slug lisible, unique
  type: NodeType
  parentId: string | null        // null = rattaché au site
  position: { x: number; y: number }  // sections : relatif à la frame parente
  size?: { w: number; h: number }     // frames uniquement
  lot?: number | null            // null/absent = hérité (voir lots.ts)
}

export interface FrameNode extends BaseNode {
  type: 'frame'
  kind: FrameKind
  attrs: {
    name: string; description: string
    route?: string; roles?: string[]        // kind === 'page'
    constraints: string[]; logic: string; notes: string
  }
}
export interface BehaviorNode extends BaseNode {
  type: 'behavior'
  attrs: {
    name: string; description: string
    facet: Facet | null
    trigger: string; rules: string
    hours: number | null
    notes: string
  }
}
export interface ServiceNode extends BaseNode {
  type: 'service'
  attrs: {
    name: string; kind: string             // REST | SOAP | GraphQL | SFTP | …
    auth: string; risk: Risk
    endpoints: { method: string; path: string; notes: string }[]
    constraints: string[]; notes: string
  }
}
export type FlooowNode = FrameNode | BehaviorNode | ServiceNode

export interface FlooowEdge {
  id: string
  type: EdgeType
  source: string; target: string
  attrs: { endpointRef?: string; notes?: string }
}
```

## Validation (model/schema.ts)

- **Zod**, miroir strict des types ci-dessus (`z.discriminatedUnion` sur `type`). `schema.parse()` à **chaque chargement** (fichier ouvert, import, snapshot autosave) — jamais de `JSON.parse` nu injecté dans le store.
- `.strict()` sur tous les objets : une clé inconnue = rejet (fichier d'une version future ou altéré). Message d'erreur utilisateur clair, avec le chemin zod de l'erreur.
- Limites : fichier ≤ 20 Mo, `nodes.length` ≤ 5 000, chaînes ≤ 50 000 caractères (voir [securite.md](securite.md)).
- Après validation de forme, vérifier les **invariants référentiels** (`domain/invariants.ts`) : edges vers des ids existants, arbre `parentId` sans cycle, `kind` cohérents, `endpointRef` existant, `navigatesTo` entre pages uniquement. Erreurs bloquantes à l'ouverture.

## Cycle de persistance

```
ouverture ──► validate ──► migrate ──► store.load()
édition   ──► action Pinia ──► history.record()
          └─► watch debounce 2 s ──► autosave IndexedDB (snapshot + horodatage)
⌘S        ──► io/file.save() ──► FS Access API (handle mémorisé) ─ fallback download
fermeture ──► beforeunload si dirty → avertissement natif
```

### Fichier (io/file.ts)
- **File System Access API** : `showOpenFilePicker`/`showSaveFilePicker` (types `.flooow.json`), handle conservé dans IndexedDB pour rouvrir le dernier projet et réécrire sans re-picker (`queryPermission`/`requestPermission` sur geste utilisateur uniquement).
- **Fallback** (Firefox/Safari) : `<input type="file">` + download d'un Blob. Détection par capacité (`'showOpenFilePicker' in window`), pas par user-agent.
- Écriture **atomique côté app** : sérialiser → valider le résultat avec zod (garde-fou anti-corruption) → écrire. `meta.updatedAt` mis à jour à l'écriture.

### Autosave (io/autosave.ts)
- Snapshot JSON complet dans IndexedDB (clé = chemin/nom du projet), debounce 2 s après la dernière mutation, plus un flush sur `visibilitychange: hidden`.
- Au boot : si un snapshot est **plus récent** que le fichier ouvert → proposer « Récupérer la version non sauvegardée ? » (diff des `updatedAt`). Jamais d'écrasement silencieux dans les deux sens.
- Garder les 5 derniers snapshots (rotation) : filet de sécurité contre une corruption logique.

## Migrations (model/migrations.ts)

```ts
const migrations: Record<number, (doc: unknown) => unknown> = {
  // 1 → 2 : quand le format évoluera
}
export function migrate(doc: { meta: { formatVersion: number } }) {
  let v = doc.meta.formatVersion
  if (v > CURRENT) throw new UnsupportedVersionError(v)   // fichier d'une app plus récente
  while (v < CURRENT) { doc = migrations[v](doc); v++ }
  return doc
}
```
Chaque migration a son test unitaire avec un fixture du format N. La validation zod s'applique **après** migration.

## Undo / redo (stores/history.ts)

- Chaque action du store produit un couple **(patch, patch inverse)** — implémentation recommandée : mutations écrites en pur (`(doc) => doc'`) + calcul de patches JSON (RFC 6902) via une petite lib (`fast-json-patch`) ou à la main pour les ~10 actions du MVP (add/remove/update node, move, reparent, add/remove edge, update meta).
- Pile bornée à 100 entrées ; les actions **continues** (drag d'une frame, saisie dans un champ) sont coalescées : un seul patch par geste (enregistré au drop / au blur, pas à chaque pixel ou frappe).
- `⌘Z` applique le patch inverse via le même chemin que les actions normales (les invariants restent vérifiés).

## Règles de manipulation sûre

1. Jamais de mutation hors action Pinia ; jamais d'objet du store partagé par référence avec Vue Flow (mapping explicite, voir [performances.md](performances.md)).
2. Les clones se font par `structuredClone` (pas de spread profond artisanal).
3. Interdire les clés `__proto__`, `constructor`, `prototype` dans toute donnée importée (zod `.strict()` le garantit sur les objets connus ; refuser les `Record` libres dans le format).
4. Tout accès `nodes.find(...)` chaud passe par l'index `Map<id, node>` maintenu par le store.

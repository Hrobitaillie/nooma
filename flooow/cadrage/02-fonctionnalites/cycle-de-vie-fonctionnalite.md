# Cycle de vie d'une fonctionnalité (statuts, phases, suivi)

> **Note de conception (tranchée en séance, 2026-07-16).** Cette fiche prolonge le
> [cadrage par fonctionnalité](cadrage-par-fonctionnalite.md) : le nœud `fonctionnalité` existe
> (v3+), il porte code, contenu riche, champs, estimation et dépendances. Ce qui suit lui donne un
> **cycle de vie** — du brainstorming en atelier client jusqu'à la mise en production — et en tire
> trois mécaniques : la **zone de suivi** sur la carte, l'**arbre de déblocage** dérivé des
> dépendances, et le **mode dev** du canvas.

## Le besoin

Une fonctionnalité naît en atelier (idée brute), se qualifie, se chiffre, s'arbitre (retenue,
reportée, écartée), puis — si retenue — se développe, se recette, se valide, part en production.
Aujourd'hui rien dans le modèle ne porte cet état : on sait *ce qu'est* une fonctionnalité, pas
*où elle en est*. Trois usages concrets en découlent :

1. **En atelier / cadrage** : trier les idées, voir ce qui reste à qualifier ou à chiffrer,
   acter les arbitrages sans perdre les écartées (backlog commercial).
2. **En période de dev** : le développeur ouvre le canvas et voit **ce qu'il peut réellement
   développer maintenant** — pas ce qui est bloqué par une dépendance non prête, pas ce qui est
   déjà fini.
3. **En continu** : chaque fonctionnalité porte sa **checklist d'étapes** propre (« Endpoints
   mappés », « Whitelist IP hébergement »…), cochable, avec progression visible.

## Statut : premier plan, pas un champ utilisateur

Le statut **ne passe pas par `featureFields`**. Un champ utilisateur est une liste d'options
libres sans sémantique ; le statut, lui, pilote de l'UI (quelle zone de suivi s'affiche, quelles
options du select sont proposées) et des mécaniques (gate de bascule, arbre de déblocage). Il lui
faut des **clés connues du code** — même logique que les lots, codés en dur (`domain/lots.ts`).

La liste (fermée, ordonnée pour l'affichage) :

| Famille | Statut | Sens |
|---|---|---|
| **Cadrage** | `idee` | sortie brute d'atelier, non triée |
| | `a-qualifier` | piste sérieuse, questions ouvertes |
| | `cadree` | périmètre clair, contenu rédigé |
| | `estimee` | chiffrée (l'`estimate` est fiable) |
| | `retenue` | arbitrée : entre dans le devis / un lot |
| | `reportee` | *sortie de route* — hors périmètre initial, gardée pour une v2 |
| | `ecartee` | *sortie de route* — abandonnée, avec la trace du pourquoi |
| **Dév** | `a-developper` | planifiée, pas commencée |
| | `en-developpement` | |
| | `en-recette` | livrée en préprod, en attente de validation |
| | `validee` | recettée par le client |
| | `en-production` | livrée, close |

`reportee` et `ecartee` ne sont pas des étapes mais des **sorties** : elles restent dans la
famille cadrage (une écartée n'a jamais de suivi de dév) et n'entrent jamais dans l'arbre de
déblocage côté dev.

## La phase est DÉRIVÉE du statut, jamais stockée

C'est la décision structurante. Chaque statut appartient à une famille ; la **phase d'une
fonctionnalité = la famille de son statut courant**, calculée par un pur dérivé :

```ts
// packages/core/src/domain/lifecycle.ts (nouveau)
type Phase = 'cadrage' | 'dev'
function phaseOf(status: FeatureStatus): Phase
```

Conséquences :

- **Les sauts d'étapes sont natifs.** Passer directement de `idee` à `en-developpement` est
  permis : la phase est une propriété du statut atteint, pas du chemin parcouru. Aucun état
  intermédiaire stocké, donc aucune désynchronisation possible.
- **Le select de statut est libre** (tous les statuts proposés, groupés visuellement en deux
  sections « Cadrage » / « Dév » avec séparateur — le saut de phase est conscient, jamais
  accidentel, mais rien n'est interdit).
- **Le retour arrière est sans friction** : un cadrage rouvre souvent en cours de dev.

### Le gate de bascule (souple)

« Finaliser le cadrage » n'est pas un système à part : c'est **tout changement de statut qui
franchit la frontière** `phaseOf(ancien) === 'cadrage' && phaseOf(nouveau) === 'dev'`. À ce
franchissement, si la checklist cadrage est incomplète : **confirmation, pas blocage** —
« 2 étapes de cadrage non cochées — basculer quand même ? ». Un blocage dur serait contourné en
cochant à la va-vite, ce qui détruit la valeur de la checklist ; en agence on saute parfois une
étape en connaissance de cause, l'outil doit le tracer, pas l'interdire. Le gate s'applique
identiquement aux sauts (`idee` → `en-recette` déclenche la même confirmation — d'autant plus
utile que le saut est brutal).

### Module et projet : des vues agrégées, pas des mécanismes

La bascule de phase vit **à l'échelle de la fonctionnalité, et nulle part ailleurs**. En agile,
une partie du projet se développe pendant que l'autre se cadre ; un verrou au niveau module ou
projet contredirait ça. Le module affiche un agrégat (« 3/8 en dév ») ; une action de masse
« Passer en dév les fonctionnalités retenues » applique la même transition unitaire à la
sélection, avec récapitulatif de celles qui bloquent (checklist incomplète, pas `retenue`). La
cérémonie d'atelier est préservée sans verrou structurel.

## La zone de suivi sur la carte

Sous le corps de la carte, séparée par un **pointillé** (maquette validée — `image.png` à la
racine du dépôt, à intégrer aux specs Figma) :

```
┌──────────────────────────────────┐
│  DEV-04  Formulaire de devis     │
│  … corps de carte existant …     │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│  SUIVI DE DÉV.      [En recette ▾]│
│  ☑ Endpoints mappés              │
│  ☑ Authentification & clé        │
│  ☑ Whitelist IP hébergement      │
│  ☐ Tests multi-agence            │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░          4/5  │
└──────────────────────────────────┘
```

- Le **titre de zone** suit la phase dérivée : « Suivi de cadrage » ou « Suivi de dév. ». Au
  franchissement de frontière, la zone bascule — c'est la cérémonie à l'échelle micro.
- Le **select de statut** (pastille colorée) vit dans la zone.
- La **checklist est propre à la fonctionnalité** (pas un template global du projet) : items
  rédigés librement, chacun tagué `cadrage` ou `dev`. La zone n'affiche que les items de la
  phase courante. Barre de progression `cochés/total` sur la phase courante.
- Zone vide (aucun item de la phase) : afficher seulement titre + select, pas de barre.

*(Un amorçage d'items depuis un template projet est envisageable plus tard — hors périmètre ici :
on commence par la saisie libre, qui couvre le réel constaté : les items sont spécifiques à la
fonctionnalité.)*

## L'arbre de déblocage (« arbre de compétence »)

Les arêtes `dependsOn` existent déjà. L'arbre de déblocage est une **couche entièrement
dérivée** : statut + graphe de dépendances → état visuel. Rien de nouveau à stocker.

Trois états dérivés pour une fonctionnalité en phase dev :

| État | Condition | Rendu |
|---|---|---|
| **Terminée** | statut `validee` ou `en-production` | coche verte, carte légèrement estompée |
| **Débloquée** | toutes les `dependsOn` ont atteint le seuil | rendu normal ; si en plus `a-developper`, c'est la **frontière** (le « prochain coup jouable ») → accent visuel le plus fort |
| **Bloquée** | ≥ 1 dépendance sous le seuil | estompée/désaturée, badge cadenas « 🔒 n » ; survol/clic = surligner les arêtes `dependsOn` vers les bloqueuses (déjà tracées, il n'y a qu'à les allumer) |

Le **seuil de déblocage** est une constante unique dans `domain/lifecycle.ts` :

```ts
// une dépendance est satisfaite dès ce statut atteint
const UNLOCK_THRESHOLD: FeatureStatus = 'en-developpement'
```

Choix de départ : `en-developpement` (en agence on commence souvent à intégrer pendant que la
dépendance se finit). Nuance visuelle : **débloquée ferme** (deps toutes terminées) vs
**débloquée souple** (≥ 1 dep juste en cours) — cadenas plein vs entrouvert. Si la nuance fait
trop à l'usage, on retombera sur le seuil sec.

Règles :

- **Purement visuel, jamais d'écriture automatique.** Débloquer ne change le statut de personne ;
  l'arbre informe, la main reste humaine (cohérent avec le gate souple).
- **Une dépendance encore en cadrage bloque aussi** — et c'est voulu : ça rend visible sur le
  canvas ce que le retard de cadrage bloque côté dev.
- `reportee` / `ecartee` : une dépendance sortie de route ne sera jamais satisfaite → badge
  **⚠ dépendance écartée** (pas un simple cadenas) : c'est une incohérence de graphe à résoudre
  (retirer l'arête ou réarbitrer), pas une attente.

### Cycles de dépendances : interdits

`A dependsOn B dependsOn A` = deux cartes bloquées à vie. Décision : **bloquer à la création**
— tirer une arête `dependsOn` qui fermerait un cycle est refusé (feedback visuel au drop), et un
invariant `DEPENDS_CYCLE` s'ajoute dans `domain/invariants.ts` (qui ne vérifie aujourd'hui que
`PARENT_CYCLE`) pour attraper les fichiers construits hors UI (agent, migrations).

## Le mode dev du canvas

Un **toggle de vue en bas de l'écran, façon Figma** (Design / Dev), dans l'esprit de la décision
« le canvas bascule entre deux modes » ([cadrage-par-fonctionnalité](cadrage-par-fonctionnalite.md),
décision actée §3) — mais orthogonal à Fonctionnalités/Arborescence : c'est une **lentille de
lecture**, pas un changement de couche.

| | Mode design (défaut) | Mode dev |
|---|---|---|
| Déplacement / création / suppression de nœuds et d'arêtes | ✔ | ✘ (tout gel structurel) |
| Édition du contenu riche, renommages | ✔ | ✘ |
| **Checklists** (cocher, ajouter/retirer des items) | ✔ | ✔ |
| **Statuts** (select, avec gate) | ✔ | ✔ |
| **Estimations** | ✔ | ✔ |
| Arbre de déblocage (estompage, cadenas, frontière) | discret | **renforcé** : tout ce qui est encore en cadrage est aussi grisé |

En clair : le mode dev **gèle la structure et ouvre les métadonnées**. Le développeur ne peut pas
déplacer une carte par mégarde ni casser le graphe ; il coche, change des états, ajuste un
chiffrage. L'arbre de déblocage reste visible en mode design (discret : estompage + badge) pour
que l'info soit là sans friction, y compris en atelier.

## Modèle de données (cible : format v10)

Sur `FeatureAttrs` (`packages/core/src/model/types.ts`) :

```ts
status: FeatureStatus            // enum core, clés fermées (comme les lots)
checklist: ChecklistItem[]       // ordre = ordre d'affichage

interface ChecklistItem {
  id: string                     // genId()
  label: string
  done: boolean
  phase: 'cadrage' | 'dev'       // détermine dans quelle zone de suivi il s'affiche
}
```

Dans `packages/core/src/domain/lifecycle.ts` (nouveau, pur) : `FeatureStatus`, `phaseOf()`,
`UNLOCK_THRESHOLD`, calcul des états bloquée/débloquée/terminée, détection de cycle partagée avec
l'invariant.

Rappels d'implémentation (CLAUDE.md) :

- triptyque solidaire : bump `CURRENT_FORMAT_VERSION` (9 → 10 — vérifier la version réellement en
  cours au moment de coder, le working tree bouge) + migration `9 → 10` + miroir zod `.strict()` ;
- migration : `status` par défaut = `idee`, `checklist` = `[]`. **Cas particulier** : si un
  projet existant contient un `featureField` créé à la main dont le libellé ressemble à un statut
  (« Statut », « État »…), la migration ne tente PAS de conversion automatique (trop de formes
  possibles) — on le laisse en place, l'utilisateur le supprimera ; à reconsidérer si des
  projets réels en ont ;
- le mode design/dev est un état d'UI (store `ui`, probablement synchronisé à l'URL comme la vue
  courante), **pas** une donnée du `.graph.json`.

## Décisions actées (2026-07-16)

1. **Statut de premier plan** sur `FeatureAttrs`, enum fermé côté core — pas un `featureField`.
2. **Phase dérivée du statut** (`phaseOf`), jamais stockée ; sauts de statuts libres, le select
   propose tout (groupé par famille).
3. **Gate souple** au franchissement cadrage → dev : confirmation si checklist cadrage
   incomplète, jamais de blocage dur. La bascule vit à l'échelle de la **fonctionnalité** ;
   module et projet n'ont que des agrégats et des actions de masse.
4. **Checklist par fonctionnalité** (items libres, tagués par phase), affichée sous la carte dans
   une zone « Suivi de … » séparée par un pointillé, avec select de statut et barre de
   progression.
5. **Arbre de déblocage dérivé** de `dependsOn` : terminée / débloquée / bloquée, seuil
   `UNLOCK_THRESHOLD = 'en-developpement'`, purement visuel, aucune écriture automatique.
6. **Cycles `dependsOn` interdits** : refus à la création + invariant `DEPENDS_CYCLE`.
7. **Toggle design / dev en bas du canvas, façon Figma** : le mode dev gèle toute la structure et
   ne laisse éditables que les métadonnées (checklists, statuts, estimations) ; l'arbre de
   déblocage y passe en rendu renforcé.

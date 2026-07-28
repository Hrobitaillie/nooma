# Plan — refonte des notes : commentaires façon Google Doc (option D)

> Rédigé le 22/07/2026, après l'exploration UI validée par Hugo (artifact
> `https://claude.ai/code/artifact/51ae827c-33e3-4a81-b631-fd4e9fb04760`, onglet « D »).
> Destiné à une session Claude **sans contexte préalable** : tout le nécessaire est ici. Lire
> aussi le `CLAUDE.md` du dépôt (sessions concurrentes → réserver ses fichiers dans
> `.claude/travaux-en-cours.json` ; règles de format `.graph.json` — les trois gestes solidaires).

## Décision (Hugo, 22/07)

Les notes actuelles — cartes ambre flottantes posées à côté des pages, reliées par des
connecteurs — disparaissent du canvas. Elles gênent structurellement (emprise sur le layout,
écarts entre pages faussés — la bande `extraRight` a déjà été retirée) et polluent la lecture de
l'arbre. Le modèle retenu est celui de **Google Doc** :

- un **outil commentaire** (et, dans le texte riche d'un bloc, le **surlignage** d'un passage)
  accroche un commentaire à une page, un bloc, ou un passage précis ;
- l'élément commenté prend un **contour jaune** (ou un surlignage jaune pour un passage) — seule
  trace sur le canvas, épaisseur **contre-zoomée** pour rester lisible au fitView ;
- la lecture vit dans un **panneau latéral droit** togglable, **redimensionnable** (largeur
  mémorisée localement), listant les commentaires : fils de réponses, résolution, filtres ;
- un commentaire devient une **note** au sens plein : **tag custom + couleur custom + contenu
  wysiwyg simple** (gras, listes — l'éditeur des blocs, en réduit) ;
- cas d'usage clé à prévoir dès le modèle : le **commentaire « pour Claude »** (même esprit que
  portulan et l'app de doc de `/srv/dev/locasyst-api`) — une note adressée à l'agent sur un
  élément du cadrage, que le CLI/skill `cadrage` saura lister et consommer. **Restriction
  (Hugo, 22/07) : les commentaires Claude ne sont visibles et créables QUE pour les membres
  Pilot'in** — un client invité sur le cadrage ne doit ni les voir dans le panneau, ni voir
  l'outil pour en créer, ni les recevoir dans le document projeté côté client si le transport le
  permet (au minimum : filtrage à l'affichage ET à la création, côté app et côté serveur de room).

Les cartes de note **API disparaissent** en tant que telles : la connexion API se fait désormais
inline dans les blocs (cf. `apiRefs` dans `BlockNode.vue`). Voir « Migration » pour le sort des
données existantes.

## Anti-étroitesse du panneau (exigence explicite d'Hugo)

Le piège connu des sidebars de commentaires : finir en couloir où rien ne se lit. Trois règles,
toutes trois NON négociables :

1. **Plancher de largeur.** Défaut ~340 px ; resize de **320 px à ~50 % de l'écran** ; largeur
   mémorisée en `localStorage` (même mécanique personnelle que `viewportMemory.ts` — jamais dans
   le document partagé). Sous 320 px le panneau ne rétrécit pas : c'est la règle 2 qui s'applique.
2. **Docké, sinon par-dessus.** Écran large : panneau docké, le canvas se recadre (fitView
   compense, comme à la bascule de couche). Écran étroit (< ~1200 px) : panneau en **overlay**
   par-dessus le canvas, même largeur plancher. On ne compresse jamais les deux à la fois.
   Toggle unique « 💬 n » ; `Échap` referme.
3. **La densité vient du pli, pas de la largeur.** Seul le commentaire ACTIF est déplié (fil +
   composer) ; les autres clampés à 2 lignes. Filtres en tête (ouverts / résolus / ✳ Claude /
   tags custom). Focus croisé : clic sur un commentaire → centrage de l'élément ; clic sur un
   élément commenté → son fil s'active.

## Modèle cible (à valider avec Hugo AVANT d'écrire le code du core)

Proposition de forme — un commentaire est un objet du DOCUMENT (partagé, versionné, collab), pas
un artefact local :

```
Comment {
  id
  anchor: { nodeId }                    // page ou bloc
        | { nodeId, range }             // passage du contenu riche d'un bloc (ancre robuste à
                                        //   définir : offsets de texte + repli sur le bloc entier
                                        //   si le texte a trop bougé)
  tag?: { label: string, color: string }  // tag custom + couleur custom (le contour peut prendre
                                          //   la couleur du tag dominant)
  body: RichDoc                         // wysiwyg simple (le RichDoc des blocs, réduit : gras,
                                        //   italique, listes)
  author: string                        // reprise de l'identité collab
  createdAt
  resolved: boolean
  forClaude?: boolean                   // commentaire adressé à l'agent (ou tag réservé « claude »
                                        //   — trancher avec Hugo)
  replies: [{ id, author, createdAt, body }]
}
```

Points à trancher explicitement avec Hugo avant d'implémenter : `forClaude` booléen vs tag
réservé ; les réponses portent-elles un tag ; un commentaire non ancré (niveau document) est-il
permis ; que devient l'estimation `hours` des anciennes notes comportement (champ du commentaire,
ou abandon) ; et surtout **comment on sait qu'un utilisateur est « membre Pilot'in »** — il n'y a
aujourd'hui pas de notion de rôle dans l'identité collab du bridge : à introduire (rôle porté par
la session/le serveur de room, jamais déduit côté client seul), c'est le prérequis de la
restriction des commentaires Claude.

**Format de projet** : c'est une évolution du modèle → les trois gestes solidaires du CLAUDE.md
(bump `CURRENT_FORMAT_VERSION` + littéral `metaSchema`, migration N→N+1 dans `migrations.ts`,
miroir zod `.strict()` dans `schema.ts`). Vérifier la version RÉELLEMENT en cours dans le working
tree (il est en avance sur HEAD) et si des `.graph.json` sont déjà sauvés dedans avant de décider
« remanier la version courante » vs « empiler une nouvelle ».

## Migration des notes existantes

- **Note comportement** → commentaire ancré au même élément, tag `Comportement` (couleur ambre
  `#f59e0b`, l'actuelle), body = nom + trigger + heures recomposés en RichDoc.
- **Note API** → PAS un commentaire : convertir en **connexion API inline** du bloc de
  rattachement (le modèle des `apiRefs` existe déjà) quand la cible est un bloc ; si la cible est
  une page, l'accrocher à son premier bloc ou créer la connexion au niveau page selon ce que le
  modèle inline permet — à trancher sur pièce. En dernier recours (donnée incomplète) :
  commentaire tag `API` cyan pour ne rien perdre.
- La migration est **celle du format** (registre `migrations.ts`) : rien d'ad hoc, rejouable sur
  tout document ancien.

## Carte du code (état au 22/07, après la v13)

| Rôle | Fichier | Notes |
|---|---|---|
| Modèle des notes actuelles | `packages/core/src/model/types.ts` (`NoteNode`, `attachedTo`, kinds `behavior`/`api`) | + `schema.ts`, `migrations.ts` |
| Rendu carte de note | `app/src/canvas/nodes/NoteCard.vue` | à SUPPRIMER à terme |
| Layout des notes + connecteurs | `app/src/canvas/useCanvasSync.ts` : `computeNoteLayout`, `applyNoteDragPreview`, arêtes `attach` (l.~1490), `NOTE_W`/`SIDE_GAP`… | tout ce sous-système disparaît |
| Connecteur note → cible | `app/src/canvas/connectors/ProximityConnector.vue` | ne sert plus qu'aux notes |
| Compteur « ✎ n » page | `app/src/canvas/nodes/PageFrame.vue` (`noteCount`) | devient compteur de commentaires + contour jaune |
| Contour/LOD contre-zoomés | `FlowCanvas.vue` (`--flooow-label-scale`, LOD) ; `TreeEdge.vue` (épaisseur en 1/zoom) | même mécanique pour le contour jaune |
| Panneau ancré existant (modèle) | `FlowCanvas.vue` : `blockPanel` (BlockConfigPanel ancré à la carte) | précédent pour le panneau latéral |
| Préférences locales | `app/src/canvas/viewportMemory.ts` | modèle pour la largeur du panneau |
| Filtre de notes | `app/src/stores/ui.ts` (`noteFilter`) + Réglages d'affichage | à remplacer par les filtres du panneau |
| Vue Specs (listing notes) | `app/src/…` (chercher les usages de `store.notes`) | à brancher sur les commentaires |
| Skill agent | `.claude/skills/cadrage` + CLI flooow | consommation des commentaires « pour Claude » |

## Plan de travail (ordre conseillé)

### Lot 1 — Modèle : `Comment` dans le core (+ format, + migration)

Types, schéma zod strict, migration (comportement → commentaire ; API → inline/commentaire),
actions du store (`addComment`, `replyTo`, `resolveComment`, `setCommentTag`…), index par
`anchor.nodeId`. Rien côté UI. Tests : migration sur les fixtures (`locasyst`, `demo`) — ATTENTION
au piège connu : ne pas régénérer la fixture locasyst via `gen:locasyst` (script obsolète qui
l'écrase).

### Lot 2 — Canvas : contour jaune + retrait des cartes de note

1. Contour jaune (`#f59e0b`) sur les cartes page/bloc ayant ≥ 1 commentaire ouvert, épaisseur
   contre-zoomée en `1/zoom` sous zoom 1 (précédent : `TreeEdge.vue`) ; surlignage jaune des
   passages ancrés dans le RichContent des blocs. Distinct de la sélection (sky) et des anneaux
   de présence des pairs — vérifier les trois ensemble à l'écran.
2. Retirer du canvas : nœuds note, `computeNoteLayout`, arêtes `attach`, drag de note,
   `noteFilter` des Réglages. `NoteCard.vue` et `ProximityConnector.vue` suivent.
3. Compteur « ✎ n » de l'en-tête de page → nombre de commentaires ouverts (page + ses blocs).

### Lot 3 — Panneau latéral (les trois règles anti-étroitesse)

Composant `CommentsPanel` : toggle « 💬 n », docké/overlay selon la largeur d'écran, resize avec
plancher 320 px et mémoire locale, listing avec pli (actif déplié seul), filtres, fil de réponses,
composer RichEditor réduit, résolution, focus croisé (réutiliser `ui.focusNode`). L'outil
commentaire : bouton dans la barre d'outils gauche + entrée du menu contextuel des cartes ; le
surlignage dans un bloc sélectionné propose « Commenter » au relâchement de la sélection de texte.

### Lot 4 — Commentaires « pour Claude » (réservés aux membres Pilot'in)

Marqueur `forClaude` (ou tag réservé) + rendu dédié (avatar ✳). **Visibilité et création
restreintes aux membres Pilot'in** : prérequis = un rôle dans l'identité collab (porté par la
session/le serveur de room, cf. « points à trancher ») ; côté app, un non-membre ne voit ni ces
fils dans le panneau, ni l'option de création ; côté serveur, le filtrage est appliqué aussi (ne
pas se reposer sur le seul masquage client). Côté agent : le CLI flooow expose
`comments list --for-claude` (ou équivalent) et le skill `cadrage` apprend à les lire/traiter/
résoudre. S'inspirer de ce qui a été fait sur portulan et sur l'app de doc de
`/srv/dev/locasyst-api` (aller lire ces deux implémentations avant de coder).

### Vérification finale

- `pnpm -C app test` + tests core (migration).
- À l'écran sur locasyst (JAMAIS de mutation sur la room réelle — copier le `.graph.json` en
  `data/exemples/scratch-*.graph.json` et ouvrir la copie pour les gestes destructifs, technique
  validée le 22/07) : contour jaune lisible au fitView, panneau confortable aux trois largeurs
  (plancher, défaut, large), overlay sous 1200 px, focus croisé, résolution, migration des
  anciennes notes visible et complète — et, connecté avec une identité NON-membre, aucun
  commentaire Claude visible ni créable.
- Commits atomiques par lot, convention V3, via le skill `git-commit`.

# Flooow

Monorepo : `app/` (front Vue 3 + TS), `packages/core/` (modèle + domaine, sans dépendance UI),
`server/` (back).

## Sessions Claude concurrentes — à lire en premier

Plusieurs sessions Claude travaillent sur **le même working tree** en parallèle. Sans coordination
elles se réécrivent mutuellement : une session lit un fichier, réfléchit, puis écrit par-dessus le
travail qu'une autre a posé entre-temps.

Le registre des réservations est `.claude/travaux-en-cours.json` (non versionné : il décrit l'arbre
de travail vivant, pas l'historique). Un hook `PreToolUse` le fait respecter — voir
`.claude/hooks/verrou-fichiers.sh`, câblé dans `.claude/settings.json` : écrire dans un fichier
réservé par une autre session est **refusé**, pas seulement déconseillé.

Règles :

1. **En début de tâche** — ajouter ton entrée dans `sessions[]` : ton `session_id` RÉEL (le hook
   s'en sert pour t'autoriser tes propres réservations — un id bidon te bloquerait toi-même), la
   tâche en une ligne, et les fichiers dans `reserves`. Réserver large est pire qu'inutile :
   réserve ce que tu vas vraiment écrire. Les chemins sont relatifs à la racine du dépôt.
2. **En cours** — quand un fichier est posé (stable, plus retouché), le déplacer de `reserves` vers
   `poses`. Une autre session peut alors le reprendre.
3. **En fin de tâche** — retirer ton entrée entièrement.
4. **Entrée suspecte** — une entrée dont les fichiers n'ont plus bougé depuis longtemps vient
   probablement d'une session morte. Ne la retire jamais de ta propre initiative : demande à
   l'utilisateur.

Le hook laisse délibérément passer tout ce qui est douteux (registre absent, JSON cassé, `jq`
manquant) : un verrou qui se trompe est pire que pas de verrou, et il ne doit jamais pouvoir bloquer
le dépôt sur sa propre panne. Il ne couvre donc pas non plus les écritures hors `Edit`/`Write`
(un `sed -i` via Bash passe au travers).

Vérification qui ne dépend d'aucune convention, utile avant de toucher un fichier chaud :

```bash
ls -l --time-style=+%H:%M:%S <fichier>   # mtime dans la dernière minute = quelqu'un y est
```

## Format de projet

Un projet sauvé est un `.graph.json` (extension neutre, historiquement `.flooow.json`) portant
`meta.formatVersion`. Toute évolution du modèle
(`packages/core/src/model/types.ts`) impose trois choses solidaires, jamais l'une sans les autres :

1. bump de `CURRENT_FORMAT_VERSION` (`types.ts`) et du littéral dans `metaSchema` (`schema.ts`) ;
2. une migration `N → N+1` enregistrée dans le registre de `migrations.ts` ;
3. le miroir zod strict dans `schema.ts` (`.strict()` partout : une clé inconnue = rejet).

Attention : le working tree est en avance sur `HEAD` côté version de format. Vérifier la version
réellement en cours avant de bumper — et regarder si des `.graph.json` sont déjà sauvés dans cette
version, ce qui décide si elle peut encore être remaniée ou s'il faut en empiler une nouvelle.

## Couleurs

Les tokens de marque vivent dans `app/src/css/ds/_colors.css` (bloc `@theme` Tailwind v4) et sont
la reprise des variables du fichier Figma « Flooow-App-cadrage ». L'app utilise `slate-*` comme
rampe neutre courante ; la rampe `gray-*` du design system est **trouée** (400/500/800/900 absents
de Figma, ils retombent sur le gris Tailwind par défaut).

`--color-gray-200` est consommé par `app/src/css/base.css` comme couleur de bordure nue (shim de
compat Tailwind v3) : ce token pilote les bordures de toute l'app, pas seulement ce qui écrit
`gray-200`.

## Commentaires adressés à Claude (v13)

Les membres Pilot'in posent dans l'app des fils « ✳ pour Claude » sur les éléments d'un cadrage :
ce sont des **consignes à traiter**. Deux gestes, où que tu sois :

- **Relève de session** : `pnpm -s flooow comments <dossier>/<fichier> --for-claude` (depuis la
  racine du dépôt ; hors du dépôt : `pnpm -s -C /srv/dev/flooow flooow …`).
- **Référence collée** (`flooow://…#…`, copiée par le bouton 🔗 d'un fil, ou reçue dans un
  message) : `pnpm -s flooow comment <référence>` → le fil, la fiche de l'élément ancré, et le
  mode d'emploi exact. Le skill `/commentaire` fait ce tour complet.

Après traitement, **répondre ET résoudre dans un même lot d'ops** (`reply-comment` +
`resolve-comment`) — un fil traité sans réponse ni résolution est un travail invisible. Les
projets rangés chez leur site (`--site`) portent le même mode d'emploi dans `docs/AGENTS.md`,
posé par le scaffold pour les agents qui travaillent depuis le dépôt du site.

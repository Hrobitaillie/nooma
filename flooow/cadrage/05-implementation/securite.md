# Sécurisation de l'application

Contexte : app **local-first sans backend** — les données client (périmètres projets, contraintes, chiffrages) ne quittent jamais le navigateur. C'est la première mesure de sécurité, et une promesse à tenir strictement : **zéro requête réseau à l'exécution**.

## Modèle de menace

| Menace | Vecteur | Parade |
|---|---|---|
| XSS via contenu saisi | noms/notes affichés dans le canvas, les vues, les exports | §1 |
| Fichier projet malveillant | `.flooow.json` reçu d'un tiers (mail, repo) | §2 |
| Exfiltration de données client | dépendance compromise, CDN, télémétrie | §3, §4 |
| Perte/corruption de données | bug d'écriture, crash | §5 (et [donnees-json.md](donnees-json.md)) |
| Accès au poste / au serveur interne | hors du périmètre de l'app | §6 |

## 1. Rendu du contenu utilisateur (XSS)

- **Jamais de `v-html` sur du contenu utilisateur.** Tout texte saisi est rendu par interpolation Vue (échappement automatique). Règle ESLint `vue/no-v-html` en erreur.
- Si un rendu riche des notes (Markdown) est ajouté un jour : pipeline `marked → DOMPurify` obligatoire, config allowlist (pas de `<script>`, pas d'attributs `on*`, pas d'`<iframe>`).
- Les exports Markdown **échappent** les caractères de contrôle Markdown dans les valeurs utilisateur là où ils casseraient la structure (titres, tableaux). L'export HTML/PDF passe par le même DOMPurify.
- Les ids étant générés par `factory.ts` (slugification stricte `[a-z0-9-]`), aucun id utilisateur brut ne finit dans un attribut DOM.

## 2. Fichiers projets non fiables

Un `.flooow.json` peut venir de n'importe où. À l'ouverture et à l'import :

1. **Taille** : refuser > 20 Mo avant même le parse.
2. `JSON.parse` (jamais `eval`, jamais de `Function`).
3. **Validation zod `.strict()`** de tout le document ([donnees-json.md](donnees-json.md)) : clé inconnue = rejet ; pas de `Record` à clés libres dans le format → les clés `__proto__`/`constructor` ne peuvent pas s'introduire (protection anti prototype pollution).
4. Bornes : ≤ 5 000 nœuds, chaînes ≤ 50 000 caractères, `endpoints` ≤ 500/service — évite le DoS du canvas par fichier pathologique.
5. Invariants référentiels vérifiés ; échec = message clair, le document n'entre **jamais** partiellement dans le store.
6. `formatVersion` supérieure à celle supportée = refus explicite (pas de tentative de lecture).

Même pipeline pour les snapshots IndexedDB relus au boot (un autre onglet/extension a pu les altérer).

## 3. Réseau : zéro, vérifié

- **CSP en production** (meta tag dans `index.html` buildé, et en-tête si servie par un serveur) :
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`
  (`style-src 'unsafe-inline'` seulement si Vue Flow l'exige ; à tester, sinon le retirer.)
- **Aucun CDN à l'exécution** : polices, icônes et libs sont bundlées/auto-hébergées par Vite.
- Aucune télémétrie, aucun appel de mise à jour. Test Playwright dédié : intercepter toutes les requêtes pendant un parcours complet → seule l'origine de l'app est autorisée, tout le reste fait échouer le test.

## 4. Chaîne d'approvisionnement

- Dépendances **minimales** (ordre de grandeur : vue, vue-flow, pinia, zod, tailwind + dev tooling). Toute dépendance ajoutée doit être justifiée dans la PR.
- `pnpm-lock.yaml` commité ; versions exactes ; `pnpm audit` dans la CI (bloquant sur high/critical).
- Pas de scripts `postinstall` de dépendances non vérifiées (`pnpm` avec `ignore-scripts` par défaut si possible).

## 5. Intégrité des données

- Sérialisation → **re-validation zod → écriture** : on ne peut pas écrire un fichier invalide (garde anti-corruption).
- Autosave avec rotation (5 snapshots) + proposition de récupération non destructive au boot.
- `beforeunload` si modifications non sauvées.
- File System Access API : permissions demandées uniquement sur geste utilisateur ; l'app n'écrit que dans le fichier explicitement choisi (le handle mémorisé pointe ce fichier précis).

## 6. Déploiement interne (hors app, à documenter pour l'équipe)

L'app est un dossier statique. Si elle est servie sur un serveur interne plutôt qu'en local :
- HTTPS obligatoire (File System Access API et clipboard exigent un contexte sécurisé de toute façon) ;
- restriction d'accès au niveau du reverse proxy (VPN / SSO d'équipe) — l'app n'a **pas** d'auth applicative et ne doit pas prétendre en avoir ;
- en-têtes : CSP ci-dessus, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Rappel : les projets restent dans le navigateur/les fichiers de chacun — le serveur ne voit jamais les données.

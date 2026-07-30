# CLAUDE.md — App Plouma

> Règles de production pour toute session d'IA (vibe coding). Réf. doc `docs/06-architecture-technique.md` §7.
> Ce fichier fait autorité : en cas de doute, on ne devine pas, on demande une décision humaine.

## Contexte

- **Plouma** : app Flutter/Flame de lecture pour enfants de **5-7 ans (CP)**, apprentissage par le jeu (« stealth learning »).
- Stack **actée sous réserve du Test A** (proto sur tablette 2 Go = point de non-retour) : **Flutter + Flame + flutter_soloud + Drift**, état via `flutter_riverpod`.
- **100 % offline en v1** : aucune donnée ne quitte l'appareil, aucun backend, aucun compte.

## RÈGLES INVIOLABLES

Ce ne sont pas les yeux qui garantissent le code, ce sont les tests et la CI. Ces règles sont vérifiées par la CI et non négociables :

1. **Zéro SDK réseau / analytics / crash-reporting.** Pas de Firebase (même « Analytics désactivé »), Sentry, Crashlytics, AdMob, attribution, télémétrie. **Le moindre SDK qui téléphone — même inactif dans le binaire — casse la conformité Kids** (motif n°1 de rejet) et fait basculer RGPD/COPPA (doc 07 §2). L'audit des dépendances transitives bloque le merge.
2. **Zéro permission `INTERNET` sur Android en v1.** L'app ne PEUT PAS envoyer de données — c'est un argument d'audit et une exigence de conformité (doc 07 §2).
3. **Aucune nouvelle dépendance sans décision humaine explicite.** Versions **figées** (pas de `^`, pas de plage). Toute addition à `pubspec.yaml` passe par l'allowlist `tool/dependances_autorisees.txt` + validation humaine. L'IA a tendance à ajouter un package pour tout : on refuse par défaut.
4. **Jamais de WebView, jamais de deep link.** Risque technique (bridges JS) et de review Kids (doc 07 §2). La privacy policy s'ouvre dans le navigateur système, derrière le parental gate.
5. **Anti-dark-patterns (doc 03 §5).** Interdits : streak / compteur de série, timer / compte à rebours / urgence, vies / energy / mur de progression, récompense **annoncée à l'avance** (carotte), notification adressée à l'enfant, autoplay. **Plouma n'est JAMAIS triste, suppliante ou culpabilisante quand l'enfant s'en va** — elle dit au revoir joyeusement et se couche. Récompenses = surprises, informationnelles, tournées vers l'univers.
6. **Le son du graphème, jamais le nom de la lettre.** L'audio et les consignes disent le son (« [o] »), pas « la lettre O ». Toujours de **vraies lettres, vrais graphèmes, vrais mots français** — jamais de symboles de substitution (leçon du transfert, doc 03 §1).
7. **Règle « 100 % déchiffrable ».** Un niveau ne contient que des graphèmes déjà introduits pour le profil. C'est une **assertion testée du Directeur** (générateur constructif, réponse correcte présente et **unique** — attention au piège français « o » / « au »), pas un vœu pieux.
8. **Tout contenu pédagogique = données, jamais en dur dans le code.** Graphe de compétences, banques d'items, biomes vivent dans `/contenu` (racine du dépôt), en JSON/CSV versionnés et validés par les linters. Le code ne contient aucun mot, item ou règle pédagogique en dur.

## ZONES À REVUE HUMAINE OBLIGATOIRE

Petites par design, à **relire ligne à ligne à chaque modification** (doc 06 §7.2, doc 07) — ne jamais faire confiance au vibe coding seul dessus :

- **Parental gate + PIN** : opération en toutes lettres régénérée, cooldown après échecs (doc 07 §3).
- **Import de sauvegardes** : entrée non fiable, LA porte d'attaque d'une app offline — validation stricte (schéma, bornes, version) obligatoire (doc 07 §4).
- **Futur module d'achat** : état signé HMAC, vérification on-device (doc 07 §5).
- **`AndroidManifest.xml` / `Info.plist`** : permissions, `AD_ID` à retirer (souvent injecté par des SDK transitifs), `allowBackup`, composants `exported`.

## Architecture (doc 06 §2)

- **Le Directeur = bibliothèque Dart PURE, sans aucune UI/Flame** → `lib/directeur/`.
  - Signature : `generateLevel(profil, contenu, seed) → NiveauSpec`.
  - **Déterministe par seed** : même seed ⇒ même niveau. Seeds hiérarchiques par sous-système.
  - **Oracle de non-régression = le simulateur TypeScript** `/cadrage/simulateur` (racine du dépôt) : le portage Dart doit rester équivalent au simulateur. Tests par propriétés (« ∀ seed : solvable », « même seed ⇒ même niveau »).
- **Mécaniques = modules à interface unique** → `lib/mecaniques/`.
  - Signature : `play(NiveauSpec) → List<LearningEvent>`.
  - Chaque mécanique est isolée, régénérable indépendamment. Test du brocoli : si on peut remplacer les sons/lettres/mots sans changer le gameplay, la mécanique est ratée.
- **Données = event log append-only + projection (Drift)** → `lib/donnees/`.
  - `learning_events` (append-only, jamais de mutation) : exercice, compétence, succès/échec/aide, durée, timestamp, **seed**, version du contenu.
  - `skill_progress` = projection recalculable en rejouant le log.

## Commandes

```bash
flutter analyze                      # dans app/, doit être clean (la CI utilise --fatal-infos)
flutter test                         # dans app/
./tool/audit_dependances.sh          # dans app/, bloque tout package hors allowlist / réseau
npm run lint-contenu                 # à la RACINE du dépôt : valide /contenu
npm run sim                          # à la RACINE du dépôt : simulateur (oracle du Directeur)
```

## Conventions

- **Commits en français**, type `fonc(app): …` (`corr(app):`, `test(app):`, `doc(app):`, `refac(app):`).
- **Code et commentaires en français.**
- **Petites PR thématiques** : une branche par sujet, la CI valide, on merge. Historique lisible, tout réversible.
- **Versions figées** : Flame a des breaking changes fréquents ; pinner, lire le changelog de LA version utilisée, montées de version en tâche dédiée.

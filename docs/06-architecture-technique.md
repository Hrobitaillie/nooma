# 06 — Architecture technique

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Recherche technique juillet 2026, affirmations clés contre-vérifiées sur les sources officielles.

## 1. Choix de stack : **Flutter + Flame + flutter_soloud + Drift** ✅ (acté par Hugo le 30/07/2026, **sous réserve du Test A** — le proto sur tablette 2 Go reste le point de non-retour)

### 1.1 Le comparatif (résumé du raisonnement)

| Option | Verdict | Pourquoi |
|---|---|---|
| **Flutter + Flame** | ✅ **Recommandé** | Largement suffisant en perf pour notre profil ; meilleure UI « app » (menus, espace parent) ; Dart = transition douce depuis JS ; binaire léger ; **zéro SDK tiers par défaut** (dossier Kids propre) |
| Godot 4 | ❌ Éliminé (à regret) | Excellent moteur (MIT, éditeur, perf), MAIS **latence audio Android structurellement non résolue** (driver OpenSL ES, retards rapportés >0,5 s, PR Oboe toujours pas fusionnée en 2026 — [issue](https://github.com/godotengine/godot/issues/85442)). Rédhibitoire pour une app où le feedback sonore au toucher est central |
| Unity | ❌ | Surdimensionné, C# = courbe la plus raide depuis ton profil, vigilance kids supplémentaire (config « Child App », SDK Unity qui téléphonent), 1 800 licenciements en 2024 |
| React Native + Skia | ❌ | ~300 sprites max sur bas de gamme (issue ouverte depuis 2024) — inadapté à un jeu |
| Capacitor + Phaser (web) | 🔶 Plan B | Tu serais chez toi en JS, mais variance perf/audio énorme selon le WebView des tablettes bas de gamme ; et une WebView dégrade le dossier de review Kids |

Références clés : [benchmark multi-moteurs de Filip Hráček](https://filiph.net/text/benchmarking-flutter-flame-unity-godot.html) (Flame tient ~1 500-4 000 entités animées à 60 fps — un jeu éducatif en utilise quelques dizaines), [cookbook audio officiel Flutter recommandant flutter_soloud](https://docs.flutter.dev/cookbook/audio/soloud).

### 1.2 Ce que ça implique pour toi (profil WordPress/PHP + un peu de JS) 

- **Dart ressemble beaucoup à un JavaScript typé** — [guide officiel JS→Dart](https://dart.dev/resources/coming-from/js-to-dart). Transition en jours, pas en mois. C'est la marche la plus douce parmi les stacks crédibles.
- Flutter fait les **deux moitiés de l'app** avec un seul framework : le jeu (Flame) ET l'app classique (espace parent, réglages, onboarding) — là où Godot/Unity sont pénibles pour l'UI « app ».
- ⚠️ Flame n'a **pas d'éditeur de scène** : tout est code + données. Pour nous c'est neutre, voire positif : nos niveaux sont générés par le Directeur, pas posés à la main dans un éditeur.
- ⚠️ Flame a des breaking changes réguliers entre versions 1.x : figer les versions, lire le changelog à chaque montée. Projet vivant (1.38.0 en juillet 2026, ~97k téléchargements/semaine).
- ⚠️ flutter_soloud est **mono-mainteneur** (recommandé par Google, mais facteur bus) — plan B connu : FFI direct vers miniaudio, ou audioplayers en mode dégradé.

### 1.3 Le risque n°1 à lever en semaine 1 ⚠️

**Aucun benchmark Flame publié sur tablette Android bas de gamme.** Première tâche technique du projet (Test A de la roadmap) : prototype Impeller + gros atlas WebP + flutter_soloud **sur une vraie tablette à 2 Go de RAM** (en acheter une d'occasion ~60-80 € — c'est notre « machine de référence » pour toujours). Impeller est le renderer par défaut (iOS depuis 2023, Android API 29+ depuis fin 2024, fallback OpenGLES automatique) mais il reste des bugs par driver GPU (Adreno/Mali) — d'où le test réel.

## 2. Architecture applicative 🔶

```
┌─────────────────────────────────────────────────┐
│                    UI Flutter                    │
│  Onboarding · Carte-monde · Espace parent (PIN)  │
├─────────────────────────────────────────────────┤
│                 Moteur de jeu (Flame)            │
│   17+ mécaniques = modules qui reçoivent une     │
│   NiveauSpec et émettent des LearningEvents      │
├────────────────┬────────────────────────────────┤
│  LE DIRECTEUR  │        Services                 │
│  (lib pure     │  Audio (soloud) · Assets ·      │
│   sans UI)     │  Sauvegarde · Récompenses       │
├────────────────┴────────────────────────────────┤
│              Données locales (Drift/SQLite)      │
│   learning_events (append-only) · skill_progress │
│   · profils · inventaire récompenses             │
├─────────────────────────────────────────────────┤
│     Contenu (assets versionnés, lus seuls)       │
│  graphe de compétences · banques d'items · biomes│
│  · sprites/atlas · audio                         │
└─────────────────────────────────────────────────┘
```

Principes structurants :
- **Moteur de mini-jeux générique** ✅ (acté) : chaque mécanique implémente la même interface — `play(NiveauSpec) → List<LearningEvent>` — et partage le cycle consigne audio → interaction → feedback → récompense. C'est le cœur du code.
- **Le Directeur est une bibliothèque Dart pure** (aucune dépendance UI/Flame) : `generateLevel(profil, contenu, seed) → NiveauSpec`. Testable par simulation massive (voir §4).
- **Contenu = données, jamais du code** : graphe de compétences, banques d'items, définitions de biomes en JSON/CSV versionnés — l'orthophoniste peut les éditer (tableur → script d'import), des scripts de lint valident tout (audio manquant, image manquante, tag incohérent, mot contenant un graphème non introduit).

## 3. Données locales ⚠️ (l'état de l'art a changé — attention aux vieux tutos)

L'ancien plan disait « Hive/Isar ». **Les deux sont abandonnés** (Isar : dernière stable mi-2023, issue « Isar is dead » ; Hive original : ~2022 ; Realm : EOL sept. 2025). Le choix 2026 sans ambiguïté :

- **Drift (SQLite)** : très activement maintenu, ACID (robuste aux extinctions brutales de tablette — notre exigence d'interruptions ✅), requêtes/agrégats pour les stats parent, migrations versionnées, fichier unique exportable.
- **Modèle : event log + projection** :
  - `learning_events` (append-only) : exercice, compétence, succès/échec/aide, durée, timestamp, **seed du niveau**, version du contenu. Quelques Ko/Mo par an.
  - `skill_progress` (projection) : maîtrise par compétence, mise à jour transactionnelle.
  - Intérêt majeur : on peut **recalculer toute la progression après un changement d'algorithme** du Directeur (rejouer le log), déboguer n'importe quel parcours, et c'est prêt pour une future sync.
- **Transfert vers une nouvelle tablette (sans compte)** 🔶 :
  1. Filet automatique : Android Auto Backup (quota 25 Mo — largement assez) + iCloud Backup iOS. Zéro code.
  2. Chemin garanti : **export/import d'un fichier JSON versionné** depuis l'espace parent (AirDrop/Quick Share/mail) — cross-plateforme Android↔iPad.
  3. ⚠️ QR code : inadapté comme canal principal (2 953 octets max) — éventuellement pour un résumé.

## 4. Le Directeur : implémentation (synthèse — le design produit est dans doc 04)

> ✅ Actés le 30/07/2026 : **event log + projection** (§3) et **moyenne glissante pondérée + décroissance** comme modèle de maîtrise v1 (Elo/BKT = candidats v2, comparables en simulation grâce au log rejouable). La logique est prototypée et éprouvée dans le **simulateur** `/cadrage/simulateur` (TypeScript, zéro dépendance) ; le portage Dart après le Test A en fera la lib définitive, le simulateur servant d'oracle de non-régression.

- **Modèle de maîtrise recommandé : Elo éducatif** (Klinkenberg 2011, validé sur 3 648 enfants du même âge — Math Garden) : une note θ par enfant×compétence, une note β par item, appariement visant p(réussite) ≈ 0,75-0,85, mise à jour en une ligne. **~200 lignes de Dart, état en quelques Ko.** Avantage décisif pour nous : Elo **calibre automatiquement la difficulté réelle des items** — indispensable avec du contenu généré. (v1 peut démarrer avec la moyenne glissante du doc 04 et migrer vers Elo — le log d'événements permet de recalculer.)
- **Rappels espacés** : Leitner simplifié (J+1 → J+3 → J+7 → J+14), voir doc 02 §5.4.
- **Déterminisme** : `seed = splitmix64(hash(profil) ⊕ splitmix64(levelId))`, **seeds hiérarchiques par sous-système** (tirage des mots / layout / cosmétique séparés — un tirage en plus ne décale pas le reste). Logger `(seed, difficulté, template)` dans chaque `learning_event` → tout niveau rencontré est reproductible en debug.
- **Jamais de niveau impossible** : générateur **constructif** (chaque étape préserve l'invariant de solvabilité) plutôt que générer-puis-tester. Garde-fous en dur : réponse correcte présente et **unique** (⚠️ piège français : deux graphies valides pour un même son — « o » et « au » — le validateur doit le détecter), item jamais dupliqué dans un niveau, difficulté sans saut.
- **QA du généré** : l'espace (template × difficulté × plage de seeds) est fini → **énumération exhaustive en CI avec validateur automatique** + tests par propriétés (« ∀ seed : niveau solvable », « même seed ⇒ même niveau ») + simulation d'enfants virtuels (profils rapide/lent/irrégulier) vérifiant statistiquement le taux de réussite ~80 % et les temps de sortie de biome.

## 5. Achats et backend (v1 : aucun backend ✅)

- **v1 100 % offline confirmé** : c'est un avantage de conformité (doc 11), de vie privée (doc 07) et de simplicité.
- Quand le paiement arrive (Phase 4) : **pas besoin de backend maison**. Options par ordre de simplicité :
  - Achat unique lifetime : validation native StoreKit 2 (transactions JWS vérifiables sur l'appareil) + Play Billing (⚠️ **acknowledgement obligatoire sous 3 jours** sinon remboursement auto).
  - Abonnement : **RevenueCat en mode anonyme** (ID anonyme, `restorePurchases()` restaure les droits sur une nouvelle tablette via le compte de store — sans compte utilisateur ni backend à construire).
- Un vrai backend ne devient nécessaire que pour : sync multi-device temps réel, contenu serveur, comptes. À repousser tant que possible ; si un jour : compte **parent** uniquement, profil enfant pseudonyme, hébergement UE (voir doc 07 §6).

## 6. Pipeline assets (outillage précis) 🔶

- **Blender → sprites** : rendu headless `blender -b scene.blend -o //frames/#### -a` (Film→Transparent, PNG RGBA) → assemblage en atlas.
- **Packer : LibGDX TexturePacker (gratuit, CLI + GUI)** — produit le format `.atlas` lu par le package officiel `flame_texturepacker` (v5.1.2, maintenu). Alternative payante confort : TexturePacker 49,99 $ perpétuel avec preset Flame. ⚠️ free-tex-packer et ShoeBox sont en fin de vie — ne pas suivre les vieux tutos.
- **Format** : atlas **WebP lossless** (−26 % vs PNG, alpha intact). ⚠️ WebP lossy = franges sur les contours alpha des sprites — à réserver aux décors parallax. ⚠️ **WebP animé : décodé par Flutter mais sans contrôle de lecture** (ni pause ni frame arbitraire) — inutilisable en jeu, confirmer la décision sprite sheets ✅.
- **Padding ≥ 2 px** entre sprites dans l'atlas (texture bleeding).
- **Dev confort** : en debug, charger les sprites depuis le système de fichiers (supporté par flame_texturepacker) → itérer sur les rendus Blender sans rebuild.
- **Versionning des assets lourds** ⚠️ : GitHub LFS = 10 GiB gratuits (stockage + bande passante/mois) — suffisant pour les **sorties finales** (atlas). Les sources (.blend, séquences PNG intermédiaires) restent **hors Git** : régénérables par script, archivées sur un stockage type Backblaze B2 via rclone.

## 7. Développement assisté par IA (vibe coding) ✅ mode de production, 🔶 garde-fous

Décision : le code est **majoritairement vibe codé** (Claude Code & co). C'est réaliste pour ce projet — et notre architecture s'y prête particulièrement bien — à condition d'inverser la charge de la preuve : **ce ne sont pas les yeux qui garantissent le code, ce sont les tests et la CI.**

### 7.1 Pourquoi notre architecture est idéale pour ça

- **Le Directeur est une lib pure sans UI** : entrées/sorties JSON, déterministe par seed → l'IA peut l'écrire et le réécrire, la simulation de 10 000 enfants virtuels (§4) et les tests par propriétés jugent le résultat, pas toi.
- **Les mécaniques de mini-jeux partagent une interface unique** (`play(NiveauSpec) → events`) : chaque mécanique est un module isolé, régénérable indépendamment sans casser le reste.
- **Le contenu est de la donnée** validée par des linters — l'IA ne peut pas « casser la pédagogie » en touchant au code.

### 7.2 Les garde-fous (la CI est le vrai patron du projet)

1. **Tests d'abord** : chaque module a ses tests (générés avec le code, mais relus, eux) ; tests par propriétés sur le Directeur (« ∀ seed : solvable », « même seed ⇒ même niveau ») ; golden tests sur les écrans clés (une régression visuelle se voit en CI).
2. **Zones à revue humaine obligatoire** ⚠️ — petites par design, à relire ligne à ligne à chaque modification :
   - le **parental gate** et le PIN (doc 07 §3),
   - l'**import de sauvegardes** (entrée non fiable, doc 07 §4),
   - le futur **module d'achat** (doc 07 §5),
   - le manifest Android / Info.plist (permissions, `allowBackup`, AD_ID).
3. **Hygiène des dépendances** ⚠️ : l'IA a tendance à ajouter des packages pour tout — or notre règle « zéro SDK réseau » (doc 07 §2) est vitale (conformité Kids). **Toute nouvelle dépendance = décision humaine explicite** + le job CI d'audit des dépendances (transitifs inclus) bloque le merge si un package réseau/analytics apparaît.
4. **Versions figées** : Flame a des breaking changes fréquents et les IA génèrent volontiers des APIs d'anciennes versions — pinner les versions, fournir à l'IA la doc de LA version utilisée, montées de version en tâche dédiée.
5. **`CLAUDE.md` à la racine du repo** : conventions du projet, règles inviolables (zéro SDK réseau, règle des graphèmes doc 02 §2, anti-dark-patterns doc 03 §5), architecture, commandes de test — pour que chaque session d'IA reparte avec les bonnes contraintes.
6. **Petites PR thématiques** même en solo : une branche par sujet, la CI valide, on merge — l'historique reste lisible et tout est réversible.
7. Ce qui reste **artisanal (pas vibe codé)** : le game feel (timings, courbes d'animation, mix audio — ça se règle à la main sur la tablette), la DA Blender, et les décisions.

## 8. Ce qui change vs l'ancien plan (à acter)

| Ancien plan | Nouveau |
|---|---|
| « Flutter + Flame pressenti, à confirmer » | **Confirmé**, avec le détail : flutter_soloud (audio), Impeller vérifié sur device réel |
| « Hive/Isar » pour les données | **Drift (SQLite)** — Hive et Isar sont abandonnés |
| Riverpod « ou équivalent » | Riverpod confirmé 🔶 (standard 2026, bien documenté) |
| JSON de progression simple | **Event log + projection** (rejouabilité, debug, migration d'algorithme) |
| (rien) | Directeur = lib pure + seeds déterministes + QA par énumération/simulation |

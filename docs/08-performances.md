# 08 — Performances : budgets et règles

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Les budgets ci-dessous sont des **contraintes de conception** : ils se respectent à la création des assets, pas en optimisation tardive.

## 1. La machine de référence ⚠️

**Acheter dès maintenant une tablette Android bas de gamme à 2 Go de RAM** (~60-80 € d'occasion) : c'est la machine de validation de TOUT (Test A, chaque milestone). Le public réel des apps enfants joue majoritairement sur des tablettes d'entrée de gamme (souvent l'ancienne tablette familiale). Si c'est fluide là-dessus, c'est fluide partout. Tester aussi un iPad non récent si possible.

## 2. Taille de l'app

| Contrainte | Valeur (vérifiée juillet 2026) |
|---|---|
| Google Play : avertissement cellulaire (non bloquant) | 200 Mo |
| Google Play : module de base AAB max | 500 Mo (+ asset packs 1,5 Go) |
| iOS : « Ask if Over 200 MB » en cellulaire par défaut | 200 Mo |
| Impact conversion | +6 Mo d'APK ≈ −1 % d'installs (étude Google Play) |

**Budget Plouma v1 : ≤ 150-200 Mo compressés, tout embarqué** 🔶. Répartition indicative : ~90-120 Mo d'images/atlas, ~30-50 Mo d'audio, ~15 Mo de binaire.

⚠️ Livraison différée des biomes (si on dépasse un jour) : Play Asset Delivery n'a **pas de support Flutter officiel** (plugin communautaire à auditer), et **iOS On-Demand Resources est déprécié depuis WWDC 2025** (remplacé par Background Assets, sans support Flutter connu). En pratique : tout embarquer en v1 ; si besoin plus tard, téléchargement HTTPS maison. L'ancienne idée « mondes téléchargeables à la demande » du brief est donc **reportée** — raison de plus pour tenir le budget embarqué.

## 3. Mémoire GPU ⚠️ (la contrainte n°1, méconnue et vérifiée)

**WebP/PNG sont des formats *disque*. En RAM, toute image est décodée en RGBA 4 octets/pixel** :
- Un atlas 2048×2048 = **16 Mio de RAM** quoi qu'il pèse sur le disque.
- Un atlas 4096×4096 = 64 Mio.
- ⚠️ **Flutter/Flame ne supporte pas les textures compressées GPU** (ASTC/KTX2 — demande ouverte depuis des années), contrairement à Godot/Unity. On paie nos textures plein pot : c'est LE prix du choix Flutter, à gérer par la discipline.

**Budgets sur tablette 2-3 Go** : ~300-400 Mo de mémoire totale app, dont **~150-250 Mo de textures décodées** — soit ~10-15 atlas 2048² chargés simultanément. Règles :
- Atlas standard **2048×2048** (4096 = exception justifiée).
- Résolution des sprites calibrée sur les écrans réels des tablettes cibles (souvent 1280×800 !) — le « rendu à 2x » du brief se calcule par rapport à ça, pas par rapport à un écran retina de dev.
- **Chargement/déchargement par biome** : en jeu, seuls les atlas du biome courant + mascotte + UI sont en mémoire (`Images.clear()` au changement de biome, derrière l'animation de voyage).
- Réagir à `onTrimMemory`/pression mémoire (décharger ce qui est rechargeable).

## 4. Audio

- **Voix (consignes, Plouma)** : OGG Vorbis **mono, 32-64 kbps, 22-24 kHz** — 60 s ≈ 360 Ko à 48 kbps. Des centaines de consignes tiennent en quelques dizaines de Mo. Pas de stéréo pour de la voix, pas de 44,1 kHz.
- **SFX (feedbacks)** : courts, **préchargés et décodés en mémoire** (via flutter_soloud) pour une latence quasi nulle au tap — c'est le cœur du ressenti « réactif ».
- Boucles musicales : Vorbis stéréo ~96 kbps, 1 par biome, streamées (pas préchargées).
- ⚠️ Latence : flutter_soloud (miniaudio → AAudio) est notre choix précisément pour ça (doc 06 §1). Tester le ressenti tap→son sur la tablette de référence : cible perçue « instantané » (< ~50 ms).

## 5. Fluidité, batterie, thermique

- **30 fps suffisent** pour notre type de jeu (sprites 12-15 fps + UI douce) ≈ moitié de la consommation vs 60 fps. ⚠️ Flame n'a pas de cap FPS natif (vérifié) : implémenter un accumulateur dans la boucle, et surtout **`pauseEngine()` sur tout écran statique** et quand l'app perd le focus (`AppLifecycleState != resumed`).
- Une tablette qui chauffe dans les mains d'un enfant = parents inquiets + throttling. Le cap 30 fps + pause agressive règle l'essentiel.
- Particules et confettis clay : jolis mais bornés (pool d'objets, nombre max défini).

## 6. Temps de chargement (pour un enfant de 5 ans)

- Repères UX : 1 s = fluide, 10 s = abandon (NN/g) ; un enfant de 5 ans décroche bien avant 10 s.
- **Budget : < 2-3 s par transition, jamais d'écran figé** — toujours une animation + un son pendant les chargements (Plouma qui sautille). ⚠️ Extrapolation raisonnable, pas un chiffre d'étude enfant — à observer en vrai lors des tests Phase 2.
- Le préchargement du biome pendant la carte-monde rend les entrées en niveau instantanées.
- Démarrage à froid : Flutter est bon là-dessus (~0,75 s dans les benchmarks) ; garder le splash < 2 s sur la tablette de référence.

## 7. Robustesse ✅ (rappel, déjà acté)

- Sauvegarde d'état transactionnelle à chaque écran (Drift/SQLite : ACID — une extinction brutale ne corrompt rien).
- Reprise instantanée après interruption (appel, veille, batterie) : l'enfant retrouve exactement son niveau.
- Aucune dépendance réseau nulle part : pas de spinner qui attend un serveur, jamais.

## 8. Budget de production des assets (discipline Blender) 

Rappel des règles actées ✅ + chiffres :
- Cartes de biome ~2048 px par couche, 3-4 couches → ~4-8 Mo WebP par biome.
- Mascotte : sprite sheets à 2x la taille d'affichage réelle (~300-400 px affichés → rendus ~700-800 px), 12-15 fps, clips de 1-3 s → surveiller le total : ~15 clips × ~30 frames = ~450 frames de mascotte, à faire tenir dans 2-3 atlas 2048².
- Images-mots : 512×512 max par image (affichées ~300 px), WebP lossless → ~30-80 Ko pièce, 300 images ≈ 15-25 Mo.
- **Tableau de bord des poids en CI** 🔶 : un script qui affiche la taille par catégorie d'assets à chaque build — le dépassement de budget se voit la semaine où il arrive, pas au moment de la release.

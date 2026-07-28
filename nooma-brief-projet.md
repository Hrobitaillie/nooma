# Nooma — Brief projet

Application d'apprentissage du CP (lecture, phonologie) pour enfants de 5-7 ans, en autonomie, guidée par une mascotte.

## 1. Positionnement

Une appli-compagnon qui transforme les apprentissages du CP en **mini-jeux courts (2-4 min)**, guidés par une mascotte qui parle à l'enfant. L'enfant utilise l'app **seul, sans supervision directe**, ce qui impose :
- Zéro texte comme seule instruction — **audio systématique** (à 5-6 ans la lecture des consignes n'est pas acquise)
- Feedback immédiat et toujours bienveillant
- Jamais de sentiment d'échec bloquant

**Différenciation face à la concurrence (ex. Poppins)** : le créateur est développeur solo avec des compétences graphiques limitées (logos/graphisme simple, pas d'illustration) mais à l'aise sur **Blender**, et compte s'appuyer beaucoup sur l'IA générative. L'app ne rivalisera pas sur la richesse visuelle façon studio : la valeur perçue vient de la **cohérence, la douceur, le son et la qualité de l'interaction** — micro-feedbacks sonores soignés, animations réactives, transitions fluides, et une **direction artistique pâte à modeler unifiée** (voir section 10).

## 2. Cible et contexte d'usage

- **Âge** : 5-7 ans (niveau CP)
- **Usage** : enfant **seul, en autonomie totale**
- **Support prioritaire** : **tablette** (recommandé) — écran plus grand, zones tactiles plus confortables pour petits doigts imprécis, meilleure lisibilité, moins d'interruptions (appels/notifications) qu'un smartphone, usage "posé". Un mode smartphone dégradé/compatible peut être prévu mais n'est pas la priorité de conception.
- **Objectif pédagogique** : couvrir un parcours CP complet et équilibré (pas un seul axe isolé)

## 3. Les 4 piliers pédagogiques

1. **Conscience phonologique** — entendre, isoler, manipuler les sons (rimes, syllabes, sons d'attaque)
2. **Correspondance grapho-phonémique** — associer une lettre/un groupe de lettres à son son
3. **Décodage & lecture** — assembler des syllabes, lire des mots puis des phrases courtes
4. **Compréhension & vocabulaire** — donner du sens à ce qui est lu/entendu

> Seul le pilier **conscience phonologique** a été détaillé en mini-jeux à ce stade (voir ci-dessous). Les 3 autres piliers restent à concevoir en détail — étape à prévoir avec Claude Code ou en amont.

### Pilier 1 détaillé : Conscience phonologique

Base théorique : la conscience phonologique est un des meilleurs prédicteurs de la réussite en lecture. Le développement va des unités les plus grandes vers les plus petites :

1. **Syllabes** (le plus facile) — ex. découper "cha-peau" en 2 syllabes
2. **Rimes** — reconnaître que "chat" et "rat" se terminent pareil
3. **Phonèmes** (le plus dur, propre au CP vers 6-7 ans) — isoler le son /f/ dans "fleur"

**5 mini-jeux, classés par difficulté croissante (= progression dans l'app) :**

| # | Nom | Mécanique | Compétence |
|---|-----|-----------|------------|
| 1 | **Tape la syllabe** | Nooma prononce un mot, l'enfant tape sur l'écran à chaque syllabe entendue (comme taper dans les mains). Nooma tape en même temps pour montrer l'exemple au début. | Segmentation syllabique |
| 2 | **Trouve la rime** | 3 images à l'écran (ex : chat, vélo, rat), Nooma dit un mot ("bras"), l'enfant touche l'image qui rime. | Reconnaissance de rimes |
| 3 | **Qui commence pareil ?** | Plusieurs images, l'enfant regroupe celles qui commencent par le même son que celui prononcé par Nooma. | Son d'attaque |
| 4 | **La boîte à sons** | Un mot simple ("chat") est découpé visuellement en cases représentant chaque son (/ch/-/a/), l'enfant place des jetons/étoiles dans chaque case en répétant. | Segmentation phonémique |
| 5 | **Assemble les sons** | Nooma dit deux sons séparés ("f... eu"), l'enfant choisit le mot correspondant parmi 2-3 propositions ("feu", "fou", "faux"). | Fusion phonémique |

Un **prototype HTML jouable** a existé (écran d'accueil + mini-jeu "Trouve la rime") : `nooma-prototype.html` — fichier à retrouver ou à recréer (absent du dossier projet au 27/07/2026).

## 4. Structure d'usage

- **Session courte** : 5-10 min, un seul objectif à la fois
- **Fil rouge narratif** : la carte-monde du voyage de Nooma (voir section 5)
- **Difficulté adaptative discrète** : l'app ajuste sans jamais afficher "tu as échoué"
- **Récompenses** : autocollants virtuels, personnalisation de la mascotte — pas de scores anxiogènes

## 5. Carte-monde & gamification

### Fil narratif
**Nooma est une étoile tombée du ciel — la carte-monde, c'est son voyage sur Terre.** Chaque monde est une région (prairie, forêt, rivière, montagne, ciel nocturne…). En avançant, Nooma apprend à parler et à lire **en même temps que l'enfant**, ce qui justifie naturellement l'évolution de son langage (section 8).

### Structure façon "map Mario"
- **Carte globale pannable/zoomable** avec des mondes débloqués progressivement
- **Chaque monde** : un chemin avec **8-12 niveaux** (mini-jeux), déblocage séquentiel, mélange des 4 piliers, difficulté croissante alignée sur l'année de CP
- **Fin de monde** : pas de "boss" stressant, mais une **"grande aventure"** récapitulative qui débloque le monde suivant + une transformation/tenue de Nooma

### Récompenses (jamais anxiogènes)
- Pas d'étoiles de performance ni de notation : chaque niveau terminé donne un **autocollant en pâte à modeler** à coller dans un album
- **"Poussière d'étoile"** collectée au fil des niveaux pour customiser Nooma
- Nombre et thèmes définitifs des mondes : **à caler sur les périodes du programme de CP** (à trancher)

### Extensibilité
- **Un fichier JSON par monde** : coordonnées des niveaux sur l'image de la carte, ordre de déblocage, mini-jeu associé, thème
- Ajouter un monde = un dossier d'assets + un JSON, **zéro code**
- À terme : mondes téléchargeables à la demande pour garder l'app légère

## 6. Contraintes techniques (tablette / smartphone)

- Zones tactiles larges (doigts d'enfant, précision limitée)
- Orientation portrait, une seule action possible à l'écran à la fois
- Audio comme canal principal d'instruction (pas de dépendance à la lecture de texte)
- Sessions robustes aux interruptions (appel, batterie faible, mise en veille...)
- **Poids des assets** : la DA pré-rendue impose une discipline dès la création — WebP, résolutions raisonnées (~2048 px par carte), chargement à la demande

## 7. Espace parent

Même en usage autonome, prévoir un espace parent séparé :
- Accès protégé par **code PIN simple** (non accessible par l'enfant seul)
- Suivi de la progression pédagogique
- Suivi du temps d'écran

## 8. La mascotte : Nooma

### Concept
Une petite **étoile tombée du ciel**, curieuse de tout ce qui se passe sur Terre — en particulier fascinée par les sons et les mots des humains, qu'elle ne comprend pas encore bien au début. C'est une mascotte à **forme unique qui se transforme** selon l'exercice (note de musique, lettre vivante, nuage de syllabes, etc.) — l'enfant comprend intuitivement "l'étoile devient ce qu'on travaille". C'est le fil rouge pédagogique visuel de toute l'app.

### Apparence
- Étoile à **5 branches arrondies**
- Grands yeux ronds expressifs, joues roses
- Couleur or/jaune doré, **rendu pâte à modeler** (subsurface scattering, texture argile, subtiles empreintes de doigts — voir section 10)
- Petites particules d'étincelles autour d'elle

### Personnalité
- **Curieuse et maladroite** — elle découvre les choses en même temps que l'enfant, jamais une posture de "maîtresse qui sait tout"
- **Jamais impatiente** — elle papillonne, s'émerveille, ne juge jamais une erreur
- **Un peu rigolote/étourdie** — elle se trompe parfois volontairement pour dédramatiser, ce qui normalise l'erreur pour l'enfant
- **Affectueuse** — elle s'attache à l'enfant, l'appelle par un petit surnom ("mon petit humain", "mon ami/amie"...)

### Voix et langage — évolution sur l'année
Nooma parle un mélange de babillage ("gibberish", façon Animal Crossing / Pikmin / BabyBus — pas de vraies phrases enregistrées à chaque mise à jour) et de français, qui devient plus fluide au fil de la progression de l'enfant :
- **Début** : babillage doux + quelques mots français très clairs et bien articulés, redondants avec des sons/gestes
- **Milieu de parcours** : mélange de babillage et phrases courtes en français, de plus en plus fluides
- **Fin de parcours (fin CP)** : elle parle presque normalement, avec encore quelques "bl bl bl" d'excitation comme signature affective (pas comme béquille de compréhension)

Voix : **féminine, douce**.

### 3 tics signature (langage corporel/sonore reconnaissable)

| Tic | Déclencheur | Description |
|-----|-------------|--------------|
| **Éternuement d'étincelles** | Surprise / bonne réponse inattendue / niveau bonus débloqué | Petit "atchoum" lumineux qui projette 2-3 étoiles autour d'elle |
| **Hoquet du rire** | Grande joie / fin de niveau / juste avant-après la transformation en cœur | Petit "hic !" avec sursaut mignon qui adoucit l'intensité de la célébration |
| **Scintillement/vacillement** | Réflexion / temps d'attente / l'enfant hésite | Elle clignote doucement, comble les temps morts sans jamais faire sentir à l'enfant qu'il est "regardé en silence" |

### Séquence de réussite
Nooma s'excite → se transforme rapidement en 2-3 formes rigolotes (note de musique, petit nuage, spirale) → finit en forme de **cœur** → petit son de clochette/rire → phrase de félicitation chaleureuse.

### Séquence d'erreur / essai raté
**Jamais de son négatif.** Nooma fait un petit "hmm ?" curieux, penche la tête, encourage à réessayer, sans jamais donner l'impression que l'enfant a "perdu". Le babillage en cas d'échec reste toujours doux — à bannir : tout son qui pourrait sonner comme une moquerie (ex. un "ha ha" mal interprété).

### Animation — inventaire des clips (décision : sprite sheets Blender, voir section 10)
Nooma est riggée dans Blender (armature légère + shape keys) et chaque animation est rendue en séquence d'images → sprite sheet. L'inventaire est **fini** (~12-15 clips de 1 à 3 s) :

idle/scintillement, clignement, écoute, "hmm ?" d'erreur (tête penchée), célébration complète (transformations → cœur), éternuement d'étincelles, hoquet du rire, apparition, disparition, geste "montrer/pointer", tape-des-mains (jeu des syllabes), boucle "elle parle" (babillage).

**Règles de production :**
- Chaque clip **commence et finit sur la même pose neutre** → l'app enchaîne n'importe quels clips sans transition visible
- **12-15 fps** — suffisant, et le léger saccadé renforce l'esthétique stop-motion
- Babillage : boucle "elle parle" générique déclenchée avec l'audio — pas de lipsync (référence : Animal Crossing)
- Nooma affichée ~300-400 px à l'écran → rendu à 2x, poids maîtrisé
- **En réserve (pas v1)** : pupilles dessinées par l'app par-dessus le sprite pour un suivi du regard en temps réel (les pupilles sont des ronds sombres simples)

## 9. Univers visuel et sonore

### Visuel
- Univers **minimaliste et modulaire**, pas un monde très détaillé façon Poppins (contrainte de compétences + volonté de rester produisable en solo + IA)
- **Style pâte à modeler unifié** (voir section 10) : formes rondes et simples, matière argile chaleureuse, éclairage doux façon plateau de stop-motion
- Palette de **4-5 couleurs fixes** réutilisées partout (cohérence + rapidité de production)
- Quelques décors-scènes réutilisables (prairie, forêt, rivière, montagne, ciel nocturne) plutôt que des dizaines d'environnements uniques — ces décors **sont** les mondes de la carte (section 5)

### Sonore
- Registre "cocon rassurant" plutôt que "jeu vidéo excitant" : carillons, clochettes, sons de fée, "pop" doux
- Son signature court à chaque bonne réponse (clochette montante)
- Jamais de son d'erreur négatif — son neutre/encourageant
- Musique d'ambiance discrète en boucle, non répétitive
- Sons réalisables via banques de sons libres + génération IA audio (pas besoin de compositeur)

## 10. Direction artistique & pipeline de production

### Décision : DA 100 % pâte à modeler, pré-rendue dans Blender

**Décision (juillet 2026, remplace l'ancienne option "flat/glossy + Rive")** : toute l'app — carte-monde, mascotte, décors des mini-jeux, autocollants de récompense — est produite en **style pâte à modeler / claymation, pré-rendu dans Blender (Cycles)** et intégrée sous forme d'**images et sprite sheets 2D**. Une seule pipeline, un seul outil fort du créateur, une cohérence visuelle totale.

Le style peint/texturé façon **Arcane** reste écarté pour les mêmes raisons qu'avant (production studio, incohérences en animation, irréaliste en solo). Il reste éventuellement utilisable pour des visuels statiques ponctuels (écran de titre, icône), mais la DA clay est prioritaire même là, pour la cohérence.

### Pourquoi le pré-rendu (et pas un moteur 3D temps réel)
- La carte-monde n'a **pas besoin de 3D temps réel** : c'est une scène fixe avec pan/zoom et des points tactiles — pas de physique, pas de caméra libre
- Le rendu clay authentique (subsurface scattering, empreintes, imperfections) est **impossible en temps réel mobile** même avec Unity/UE5, mais **trivial en pré-calculé** avec Cycles
- Précédents éprouvés : Donkey Kong Country (3D pré-rendue affichée en 2D), Hidden Folks, Lumino City

### Pipeline carte-monde
1. **Une scène Blender par monde**, caméra fixe (orthographique ou légère plongée)
2. Rendu en **3-4 couches séparées** (fond / décor médian / éléments interactifs / premier plan) → léger décalage des couches au scroll dans l'app = **effet parallax** à coût quasi nul
3. Éléments animés du décor (drapeau, eau, Nooma qui sautille sur le chemin) : séquences d'images → **sprite sheets WebP, 12-15 fps**
4. **JSON par monde** pour les nœuds/niveaux (voir section 5 — extensibilité)
5. L'app affiche la carte comme une grande image pannable/zoomable avec zones tactiles superposées

### Pipeline mascotte
Rig Blender simple (armature + shape keys), ~12-15 clips finis, règle de la pose neutre — détail complet en section 8.

### Contrainte transverse : poids des assets
WebP systématique, cartes ~2048 px, rendus mascotte à 2x la taille d'affichage, chargement des mondes à la demande. À intégrer dès la création des rendus, pas après coup.

### Côté app (pressenti, à confirmer avec la stack)
- **Flutter + Flame** (moteur 2D léger) ou Flutter pur — un seul codebase pour carte, mini-jeux et espace parent
- Rive n'est **plus nécessaire pour la mascotte** (remplacé par les sprite sheets) ; reste une option pour des micro-animations d'UI pure si utile

### Prompt de génération d'image de référence (Midjourney/DALL-E/Ideogram) pour la mascotte

```
Cute kawaii star mascot character, 5-pointed rounded star shape,
handmade claymation style, soft plasticine clay texture with subtle fingerprints,
big round sparkling eyes with white highlight reflections,
small soft smile, rosy pink blush cheeks, warm golden yellow clay,
soft studio lighting, stop-motion aesthetic, subtle sparkle particles around it,
simple clean background, children's app mascot style,
adorable, friendly, centered composition,
no other characters, single character only
```

## 11. Nom du projet

**Nooma** — nom vérifié comme largement libre et sûr dans le créneau enfance/éducation (App Store / Google Play), après élimination de plusieurs pistes :
- ~~Luma~~ — déjà pris (appli d'étude + appli de suivi de sommeil bébé)
- ~~Lumy~~ — déjà pris par une appli de rencontres (risque de confusion inacceptable pour une app enfants)
- ~~Lumii~~ — déjà pris (retouche photo, appli beauté/développement personnel 14-24 ans)
- ~~Luumi~~ — déjà pris (réalité augmentée artistique, appli de colocation/couple)

Une vérification finale à l'INPI (dépôt de marque en France) reste recommandée avant tout engagement officiel.

## 12. Points encore à trancher (non décidés à ce stade)

- Détail des mini-jeux pour les 3 piliers restants (grapho-phonémique, décodage & lecture, compréhension & vocabulaire)
- **Nombre et thèmes définitifs des mondes** de la carte, calés sur les périodes du programme de CP
- Modèle économique (gratuit, freemium, achat unique, abonnement — non discuté)
- Stack technique de développement — **Flutter + Flame pressenti** (section 10), à confirmer
- Palette de couleurs définitive (codes couleurs précis)
- Détail du contenu de l'espace parent au-delà du suivi de progression/temps d'écran
- Retrouver ou recréer le prototype `nooma-prototype.html` (absent du dossier projet)

## 13. Fichiers de référence existants

- `nooma-brief-projet.md` — ce document (décisions actées, source de vérité)
- `docs/plan-projet.md` — plan projet détaillé : pédagogie complète (propositions piliers 2-4, mondes par période de CP), pipeline assets, architecture technique, roadmap de production par phases, risques
- `nooma-prototype.html` — prototype jouable (écran d'accueil + mini-jeu "Trouve la rime") — **à retrouver/recréer**

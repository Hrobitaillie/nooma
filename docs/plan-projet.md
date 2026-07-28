# Nooma — Plan projet détaillé

> **Statut du document** : plan de travail complet, rédigé le 27/07/2026.
> Ce qui vient du brief (`../nooma-brief-projet.md`) est **acté** ✅.
> Ce qui est nouveau ici est une **proposition à valider** 🔶 lors des prochaines sessions de cadrage.
> En cas de contradiction, le brief fait foi.

---

## 1. Vision

**Nooma** est une app tablette-first d'apprentissage du CP (lecture, phonologie) pour enfants de 5-7 ans en autonomie totale, guidée par Nooma, une petite étoile en pâte à modeler tombée du ciel qui apprend à parler et à lire en même temps que l'enfant.

**Proposition de valeur** : pas la richesse graphique d'un studio (Poppins), mais une expérience **cohérente, douce et soignée** — DA pâte à modeler unifiée, audio-first, feedbacks bienveillants, zéro friction, zéro anxiété.

**Modèle mental produit** : une carte-monde façon Mario (le voyage de Nooma sur Terre) → des mondes-régions → des chemins de mini-jeux courts (2-4 min) → des récompenses non-anxiogènes (autocollants, customisation de Nooma).

---

## 2. Décisions déjà actées ✅ (rappel)

| Domaine | Décision |
|---|---|
| Cible | 5-7 ans, CP, usage seul en autonomie, tablette prioritaire, portrait |
| Pédagogie | 4 piliers ; pilier 1 (conscience phonologique) détaillé en 5 mini-jeux |
| Consignes | 100 % audio, jamais de texte seul |
| Feedback | Jamais négatif ; difficulté adaptative invisible ; pas de scores |
| Mascotte | Étoile 5 branches, or doré, babillage→français évolutif, 3 tics signature |
| DA | **100 % pâte à modeler pré-rendue Blender (Cycles)**, intégrée en images/sprite sheets 2D |
| Carte-monde | Pannable/zoomable, mondes de 8-12 niveaux, "grande aventure" de fin de monde, JSON par monde |
| Animation mascotte | ~12-15 clips sprite sheets, pose neutre commune, 12-15 fps |
| App | Flutter + Flame pressenti (à confirmer, voir §7) |
| Nom | Nooma (vérification INPI recommandée avant engagement officiel) |

---

## 3. Conception pédagogique complète

### 3.1 Alignement sur l'année de CP (5 périodes) 🔶

L'année scolaire de CP se découpe en 5 périodes (~7 semaines chacune). Proposition de correspondance **période ↔ monde ↔ dominante pédagogique** :

| Période | Monde | Dominante | Contenu type |
|---|---|---|---|
| P1 (sept-oct) | 🌼 **La Prairie** | Conscience phonologique + premières lettres | Syllabes, rimes, voyelles a/e/i/o/u, premières consonnes (l, r, m, s) |
| P2 (nov-déc) | 🌲 **La Forêt** | Grapho-phonémique + fusion syllabique | Consonnes courantes (t, p, n, d, v, f…), syllabes CV (ba, lo, mi…), premiers mots simples |
| P3 (jan-fév) | 🌊 **La Rivière** | Décodage de mots + digraphes | ou, on, an, in, ch, oi… ; lecture de mots réguliers, premières phrases très courtes |
| P4 (mars-avr) | ⛰️ **La Montagne** | Graphèmes complexes + fluence | ain, eau, eil, gn, ph… ; lettres muettes, phrases complètes, vitesse de lecture |
| P5 (mai-juin) | 🌙 **Le Ciel nocturne** | Compréhension + lecture autonome | Petits textes de 2-4 phrases, questions de compréhension, vocabulaire riche |

**Arc narratif** 🔶 : Nooma tombe dans la Prairie (elle ne sait ni parler ni lire) et remonte progressivement vers son ciel — chaque monde la rapproche des étoiles. Au sommet du Ciel nocturne, elle **pourrait** repartir… mais choisit de rester avec l'enfant (fin affective, ouvre la porte au contenu CE1). Son langage suit exactement cette montée : babillage en Prairie → français quasi fluide au Ciel nocturne (cohérent avec le brief).

Chaque monde mélange les 4 piliers (avec sa dominante), car en CP tout progresse en parallèle — un monde n'est jamais "que" de la phono.

### 3.2 Pilier 1 — Conscience phonologique ✅ (acté au brief)

5 mini-jeux par difficulté croissante : **Tape la syllabe**, **Trouve la rime**, **Qui commence pareil ?**, **La boîte à sons**, **Assemble les sons** (détail dans le brief §3).

### 3.3 Pilier 2 — Correspondance grapho-phonémique 🔶

| # | Nom | Mécanique | Compétence |
|---|-----|-----------|------------|
| 1 | **La lettre qui chante** | Nooma montre une lettre en pâte à modeler qui "chante" son son ; l'enfant touche, parmi 3 images, celle qui commence par ce son. | Association graphème → phonème |
| 2 | **Attrape le son** | Des lettres flottent doucement à l'écran (bulles), Nooma prononce un son, l'enfant attrape la bonne lettre. Variante avancée : digraphes (ch, ou, on). | Reconnaissance rapide du graphème |
| 3 | **Les jumelles** | Jeu de paires (memory simplifié, 4-6 cartes) : associer majuscule ↔ minuscule, puis script ↔ cursive, puis graphème ↔ image-son. | Multi-représentations de la lettre |
| 4 | **La fabrique de syllabes** | Deux rouleaux (consonnes / voyelles) ; Nooma prononce une syllabe ("bo"), l'enfant fait tourner les rouleaux pour la composer, la syllabe "cuit" et sort de la fabrique. | Combinatoire consonne + voyelle |

### 3.4 Pilier 3 — Décodage & lecture 🔶

| # | Nom | Mécanique | Compétence |
|---|-----|-----------|------------|
| 1 | **Le train des syllabes** | Des wagons portent des syllabes ; Nooma prononce un mot ("lavabo"), l'enfant accroche les wagons dans l'ordre. Le train part quand le mot est complet. | Fusion syllabique → mot |
| 2 | **Lis et trouve** | Un mot écrit s'affiche (sans audio d'abord — c'est l'enfant qui lit) ; il touche l'image correspondante parmi 3. Aide progressive : après 2 essais, Nooma lit les syllabes une à une. | Lecture de mots réguliers |
| 3 | **La phrase mystère** | Une phrase courte s'affiche ("le chat dort") ; l'enfant choisit la bonne scène en pâte à modeler parmi 3. | Lecture de phrases |
| 4 | **Vrai ou rigolo ?** | L'enfant lit une phrase et décide si elle est vraie ou farfelue ("le poisson fait du vélo") — Nooma adore les phrases rigolotes et rit. | Fluence + accès au sens |

### 3.5 Pilier 4 — Compréhension & vocabulaire 🔶

| # | Nom | Mécanique | Compétence |
|---|-----|-----------|------------|
| 1 | **Les histoires de Nooma** | Nooma raconte une mini-histoire (30-60 s, illustrée) puis pose 1-2 questions ; l'enfant répond en touchant une image. En P5, l'histoire devient partiellement à lire. | Compréhension orale → écrite |
| 2 | **L'intrus** | 4 images d'un même thème + 1 intrus ("carotte, poireau, tomate… ballon ?") ; l'enfant chasse l'intrus. | Catégorisation, vocabulaire |
| 3 | **Qui fait quoi ?** | Nooma dit (puis affiche) une action ("il saute") ; l'enfant touche le personnage qui la fait parmi 3 scènes animées. | Sens des verbes, syntaxe simple |
| 4 | **Le sac à mots** | Chaque monde a un thème de vocabulaire (Prairie = animaux/nature, Rivière = eau/pêche…) ; l'enfant collectionne des mots-objets en pâte à modeler dans son sac, réactivés par petits quiz espacés. | Vocabulaire thématique, mémorisation espacée |

### 3.6 Volume de contenu et remplissage des mondes 🔶

- **17 mécaniques de mini-jeux** au total (5 + 4 + 4 + 4). Un "niveau" sur la carte = une mécanique + un lot de contenu (mots/sons/images du jour) + un palier de difficulté → les mécaniques se **réutilisent** de monde en monde avec du contenu neuf, c'est ce qui rend 5 mondes × 10 niveaux tenables en solo.
- ~10 niveaux par monde + 1 "grande aventure" = **~55 niveaux** pour l'année de CP.
- La grande aventure de fin de monde : un parcours scénarisé de 5-6 min qui enchaîne 3-4 mécaniques déjà connues avec le contenu du monde (aucune mécanique nouvelle = pas de charge cognitive en plus, juste de la fête).

### 3.7 Difficulté adaptative (invisible) ✅ principe acté, 🔶 mécanique

- Chaque niveau vise ~80 % de réussite. 2 erreurs sur le même item → Nooma donne un indice audio ; 3 erreurs → elle "fait le jeu avec" l'enfant (modelling), l'item est reprogrammé plus tard.
- Jamais de blocage : on ne peut pas "rater" un niveau, seulement le finir plus ou moins aidé.
- En interne : score de maîtrise par compétence (simple moyenne glissante), qui pilote le choix des items — jamais affiché à l'enfant.

---

## 4. Carte-monde & progression (design détaillé)

### 4.1 Écrans et navigation 🔶

```
Splash → Profil enfant (choix avatar/prénom audio) → Carte globale
Carte globale → zoom sur un monde → chemin de niveaux → mini-jeu → retour chemin
Coin de l'écran : maison de Nooma (album d'autocollants + customisation)
Coin discret : porte espace parent (PIN)
```

- Carte globale : les 5 mondes visibles dès le départ (les futurs sont "endormis" sous une brume douce — donner envie sans frustrer).
- Un seul niveau "suivant" actif à la fois (pas de choix paralysant) ; les niveaux terminés restent rejouables librement.
- Nooma est **physiquement sur la carte** : elle sautille de nœud en nœud quand l'enfant progresse (sprite sheet dédiée).

### 4.2 Économie de récompenses ✅ principes actés, 🔶 détail

| Récompense | Obtention | Usage |
|---|---|---|
| **Autocollant clay** | 1 par niveau terminé (unique, thème du monde) | Album à coller librement (activité calme) |
| **Poussière d'étoile** | Petites quantités en fin de niveau | Customisation de Nooma (chapeaux, écharpes, couleurs de joues…) |
| **Transformation de Nooma** | Fin de grande aventure | Nouvelle forme signature portée sur la carte |

Aucune monnaie achetable, aucun timer, aucune récompense conditionnée à la performance — uniquement à la **complétion**.

### 4.3 Format de données par monde ✅ principe acté, 🔶 schéma

```
assets/worlds/prairie/
  map_bg.webp  map_mid.webp  map_fg.webp     # couches parallax
  world.json                                  # méta + nœuds
  stickers/                                   # autocollants du monde

world.json (esquisse) :
{
  "id": "prairie", "ordre": 1, "periode_cp": 1,
  "niveaux": [
    { "id": "p1-01", "jeu": "tape-la-syllabe", "contenu": "lot-syllabes-01",
      "pos": {"x": 320, "y": 1480} },
    ...
    { "id": "p1-aventure", "type": "grande-aventure", "jeux": ["...(3-4 ids)"] }
  ]
}
```

Le **contenu pédagogique** (lots de mots, sons, images) vit dans des fichiers séparés des mondes → on peut enrichir/corriger le contenu sans toucher aux cartes.

---

## 5. Production des assets (pipeline Blender)

### 5.1 Inventaire des assets à produire 🔶

| Lot | Contenu | Volume estimé |
|---|---|---|
| Mascotte | Rig + 12-15 clips sprite sheets (liste au brief §8) + variantes customisation | 1 rig, ~15 clips |
| Cartes | 5 mondes × 3-4 couches + carte globale | ~20 rendus fixes |
| Éléments animés de carte | Drapeaux, eau, brume, Nooma qui sautille | ~10 petites sprite sheets |
| Décors mini-jeux | 1 fond réutilisable par monde (déclinaison de la carte) | 5-8 rendus |
| Objets de jeu | Lettres clay (alphabet + digraphes), jetons, wagons, rouleaux, bulles | ~60 petits rendus |
| Images-mots | Vocabulaire illustré (chat, vélo, fleur…) — le plus gros lot | 200-400 images |
| Autocollants | ~10 par monde | ~55 rendus |
| UI | Boutons, cadres, jauges — le moins possible, en clay aussi | ~20 éléments |

**Les images-mots sont le vrai chantier de volume.** Stratégie 🔶 : bibliothèque d'objets clay simples générés/modélisés en série avec un template Blender (même éclairage, même caméra, fond transparent), complétée par génération IA d'images style claymation pour les objets longs à modéliser — à tester tôt pour valider l'homogénéité.

### 5.2 Règles de production ✅ (actées, rappel)

- Cycles, éclairage doux type plateau stop-motion, identique pour tous les rendus (fichier .blend "studio" partagé)
- Sprite sheets WebP 12-15 fps ; clips mascotte bornés par la pose neutre
- Cartes ~2048 px ; mascotte rendue à 2x sa taille d'affichage
- Palette 4-5 couleurs fixes → à définir en codes hex, matériaux Blender partagés (voir backlog)

---

## 6. Audio

### 6.1 Voix 🔶

- **Consignes en français** : voix féminine douce ✅. Production : TTS de qualité (ex. ElevenLabs) pour itérer vite, avec option de réenregistrement humain avant release si le rendu manque de chaleur. Tout est fichier audio pré-généré embarqué — **jamais de TTS à la volée sur l'appareil** (qualité et latence non maîtrisées).
- **Babillage de Nooma** : banque de ~30-50 courts gazouillis classés par émotion (joie, curiosité, "hmm ?", excitation, dodo) — mixés aléatoirement pour ne jamais sembler répétitif. Production : voix pitchée + traitement, ou génération IA audio.
- **Prononciation des sons isolés** (/f/, /ch/…) : lot critique pour la pédagogie — à faire valider par un(e) enseignant(e) de CP (un son mal prononcé = un apprentissage faussé).

### 6.2 Sound design ✅ principes actés

Carillons/clochettes, son signature de réussite (clochette montante), jamais de son d'échec, musique d'ambiance discrète par monde (5 boucles). Sources : banques libres + génération IA.

---

## 7. Architecture technique

### 7.1 Stack 🔶 (pressenti au brief, détaillé ici — à confirmer)

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | **Flutter** | Un codebase iOS + Android, excellent pour UI custom, écosystème mature |
| Moteur de jeu | **Flame** | Sprites, sprite sheets, boucle de jeu — léger, suffisant, bien intégré Flutter |
| État | Riverpod (ou équivalent simple) | Solo dev : rester simple |
| Données locales | JSON assets + base locale légère (Hive/Isar) pour la progression | Pas de backend requis en v1 |
| Audio | flutter_soloud ou audioplayers | Latence faible pour les feedbacks |
| Backend | **Aucun en v1** — tout offline | Simplicité, RGPD, usage enfant sans réseau |
| Livraison assets | Embarqués v1 ; mondes en téléchargement différé si le poids l'exige plus tard | |

### 7.2 Principes structurants 🔶

- **Moteur de mini-jeux générique** : chaque mécanique est un module qui reçoit `(contenu, difficulté)` et émet `(résultats)` — les 17 mécaniques partagent le cycle consigne audio → interaction → feedback Nooma → récompense. C'est le cœur du code, à concevoir dès le prototype.
- **100 % offline**, progression locale, export/restauration simple (fichier) en v1.
- **Enfants & vie privée** : aucune donnée personnelle qui sort de l'appareil, pas de pub, pas de tracking tiers — cible conformité RGPD enfants / Google Family / Apple Kids dès la conception (catégorie Kids = contraintes de review strictes, à lire tôt).
- Robustesse aux interruptions ✅ : sauvegarde d'état à chaque écran, reprise instantanée.

### 7.3 Espace parent (v1 minimale) ✅ périmètre acté, 🔶 détail

- PIN 4 chiffres (+ question de secours), inaccessible à l'enfant
- Progression par pilier (jauges simples, langage clair non scolaire)
- Temps d'écran : durée par jour + option de limite douce (Nooma "va dormir" — c'est elle qui se fatigue, pas l'enfant qui est puni)
- Réglages : volume voix/musique, effacement du profil
- **v2+** : plusieurs profils enfants, conseils d'accompagnement par compétence

---

## 8. Roadmap de production 🔶

> Solo dev en parallèle d'autres activités — les phases sont séquencées par **risque décroissant** : on attaque d'abord ce qui peut invalider le projet.

### Phase 0 — Préproduction (en cours)
- [x] Brief produit, DA, mascotte, carte-monde, pipeline
- [ ] Finir le cadrage : valider les propositions 🔶 de ce plan (mini-jeux 2-4, mondes/périodes, stack)
- [ ] Palette de couleurs définitive (codes hex + matériaux Blender)
- [ ] Vérification INPI du nom
- **Sortie : brief + plan validés**

### Phase 1 — Preuves techniques (le "vertical slice" avant l'heure)
Objectif : lever les 3 risques majeurs **avant** de produire en masse.
- [ ] **Test A — le look** : rendre Nooma clay dans Blender (pose neutre + 2 clips : idle, célébration) et la carte Prairie en 3 couches → l'afficher dans une app Flutter/Flame avec parallax et sprite animée. *Risque levé : la pipeline Blender→mobile tient-elle visuellement et en poids ?*
- [ ] **Test B — le son** : générer 10 consignes TTS + 10 babillages → les faire écouter à des oreilles de parents. *Risque levé : la voix IA est-elle assez chaleureuse ?*
- [ ] **Test C — les images-mots** : produire 15 images-mots (template Blender + IA claymation) et vérifier l'homogénéité. *Risque levé : le lot de 200-400 images est-il produisible ?*
- **Sortie : go/no-go pipeline, ajustements DA**

### Phase 2 — Prototype jouable (remplace `nooma-prototype.html`)
- [ ] Moteur de mini-jeux générique (cycle consigne/interaction/feedback)
- [ ] 3 mécaniques complètes : Tape la syllabe, Trouve la rime, La lettre qui chante
- [ ] Carte Prairie navigable (5 niveaux), récompenses (autocollants), sauvegarde locale
- [ ] **Test avec 2-3 enfants réels de 5-6 ans** — le juge de paix (compréhension des consignes audio, autonomie réelle, envie d'y revenir)
- **Sortie : boucle de jeu validée par des enfants**

### Phase 3 — Monde 1 complet (Prairie)
- [ ] Les 10 niveaux + grande aventure, contenu pédagogique P1 complet
- [ ] Espace parent minimal, robustesse interruptions, onboarding enfant
- [ ] Beta fermée (TestFlight / Play interne) avec quelques familles
- **Sortie : un monde de qualité release**

### Phase 4 — Lancement v1
- [ ] Mondes 2-3 (Forêt, Rivière) — la moitié de l'année de CP au lancement, le reste en mises à jour (rythme scolaire réel : lancer à la rentrée avec P1-P3 couvre les besoins jusqu'à janvier)
- [ ] Conformité stores catégorie Kids, page store, icône (clay), captures
- [ ] Décision modèle économique **au plus tard ici** (voir §9)
- **Sortie : release publique (cible idéale : rentrée scolaire)**

### Phase 5 — Année complète et suite
- [ ] Mondes 4-5 (Montagne, Ciel nocturne) en mise à jour pendant l'année
- [ ] Customisation Nooma enrichie, album amélioré
- [ ] Piste CE1 (la fin narrative laisse la porte ouverte)

---

## 9. Modèle économique — options (non tranché ✅)

À décider au plus tard en Phase 4. Options par compatibilité avec le positionnement bienveillant :

1. **Achat unique** (~5-10 €) — le plus aligné "app enfant saine", pas de friction en jeu ; revenu plafonné.
2. **Freemium doux** — Monde 1 gratuit, déblocage unique du reste ; bon essai-avant-achat, la limite doit être racontée par la narration (jamais un mur frustrant pour l'enfant : c'est le **parent** qui débloque, depuis l'espace parent).
3. **Abonnement** (modèle Poppins) — récurrent, cohérent si du contenu arrive toute l'année ; pression de production continue pour un solo dev.

**Exclusions de principe** 🔶 : pub, achats in-app visibles par l'enfant, monnaies virtuelles achetables.

---

## 10. Risques principaux et parades

| Risque | Impact | Parade |
|---|---|---|
| Volume des images-mots (200-400) irréaliste en solo | Bloque le contenu | Test C en Phase 1 ; template Blender industrialisé ; IA claymation ; réduire le vocabulaire illustré au strict pédagogique |
| Voix TTS trop froide pour des enfants | Casse le "cocon" | Test B en Phase 1 ; budget réenregistrement humain en réserve |
| Poids de l'app (sprites + audio) | Rejet stores / téléchargements | Budget de poids par monde dès la Phase 1 ; WebP/OGG ; mondes différés |
| Consignes incomprises par un enfant seul | Échec du cœur produit | Test enfants dès la Phase 2 ; modelling systématique (Nooma montre d'abord) |
| Review stores catégorie Kids | Retard de lancement | Lire les guidelines Apple Kids / Google Famille dès la Phase 0 ; zéro tracking |
| Solo dev : tunnel de production trop long | Abandon | Phases courtes à sortie concrète ; mécaniques réutilisées ; lancer avec 3 mondes, pas 5 |
| Justesse pédagogique (prononciation, progression) | Perte de confiance parents | Relecture par un(e) enseignant(e) de CP avant la beta (Phase 3) |

---

## 11. Prochaines étapes immédiates

1. **Valider les 🔶 de ce plan** (mini-jeux piliers 2-4, mondes/périodes, arc narratif, stack Flutter+Flame, schéma de récompenses) — mettre à jour le brief au fil des validations
2. **Palette de couleurs** : définir les 4-5 codes hex + créer le .blend "studio" (éclairage + matériaux partagés)
3. **Lancer la Phase 1 – Test A** : première Nooma clay dans Blender + carte Prairie 3 couches → app Flutter de démonstration
4. Vérification INPI du nom Nooma

---

*Document lié : [`../nooma-brief-projet.md`](../nooma-brief-projet.md) (source de vérité des décisions actées).*

# 05 — Direction artistique, mascotte et audio

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Ce fichier synthétise et complète les sections 8-10 du brief (`../nooma-brief-projet.md`), qui reste la source de vérité.

## 1. DA : 100 % pâte à modeler pré-rendue ✅

Toute l'app — cartes, mascotte, décors, objets de jeu, autocollants, UI — est produite en **style claymation, pré-rendue dans Blender (Cycles)** et intégrée en **images et sprite sheets 2D**.

Pourquoi (rappel) :
- Une seule pipeline, un seul outil fort du fondateur (Blender), cohérence visuelle totale
- Le rendu clay authentique (subsurface scattering, empreintes de doigts) est impossible en temps réel mobile mais trivial en pré-calculé
- Précédents éprouvés : Donkey Kong Country, Hidden Folks, Lumino City

⚠️ La contrainte de poids des assets se gère **à la création** (WebP, résolutions raisonnées), pas après coup — budgets chiffrés dans [08-performances.md](08-performances.md).

## 2. Pourquoi le clay est un choix *pédagogiquement* juste 🔶

Au-delà de la faisabilité solo, ce style sert le produit :

- **Chaleur et sécurité affective** : la pâte à modeler évoque la main, le fait-main, l'imperfection assumée — cohérent avec « l'erreur est normale, Nooma aussi se trompe ».
- **Familiarité** : les 5-7 ans manipulent de la pâte à modeler à l'école — l'univers leur « appartient » déjà.
- **Lisibilité** : formes rondes, simples, peu de détails parasites — moins de charge cognitive visuelle pendant un exercice (important : l'attention doit rester sur le son et la tâche).
- **Différenciation** : aucune app concurrente du créneau n'a cette DA.

## 3. Couleur et joie ⚠️ (réponse à « il faut que ce soit coloré, amusant, joyeux »)

L'app doit être **colorée et joyeuse** sans devenir criarde ni surstimulante. Règles proposées 🔶 :

- **Palette maîtresse de 5 couleurs** (à définir en hex + matériaux Blender partagés) : un jaune doré (Nooma), un fond doux (crème/beige clay), 2 couleurs de monde (varient par biome), 1 couleur d'accent feedback (réussite).
- **Chaque biome a sa déclinaison** : la variété de couleurs vient du **changement de monde** (prairie verte tendre → rivière bleu lagon → volcan orangé…), pas de la saturation dans un même écran. C'est exactement le levier « waouh, c'est nouveau ! » au changement de biome (voir [04-progression-adaptative.md](04-progression-adaptative.md)).
- **La joie vient du mouvement et du son**, pas du nombre de couleurs : confettis clay à la réussite, rebonds, squash & stretch, clochettes. Un écran calme + des célébrations vives = contraste qui rend la fête plus forte.
- ⚠️ Éviter le piège des apps enfants « flashy » : saturation partout = fatigue visuelle + impression cheap + halo « bonbon publicitaire » qui inquiète les parents.

## 4. Mascotte Nooma ✅ (rappel condensé)

- Étoile 5 branches arrondies, or doré, grands yeux, joues roses, rendu clay
- **Curieuse, maladroite, jamais impatiente** — elle apprend avec l'enfant, se trompe volontairement parfois (normalise l'erreur)
- Langage : babillage (façon Animal Crossing) + français, **de plus en plus fluide au fil de la progression de l'enfant** — la mascotte est la jauge de progression incarnée
- 3 tics signature : éternuement d'étincelles, hoquet du rire, scintillement d'attente
- ~12-15 clips d'animation en sprite sheets, 12-15 fps, chaque clip borné par la même pose neutre
- Séquence de réussite : transformations rigolotes → cœur ; séquence d'erreur : « hmm ? » curieux, jamais de son négatif

🔶 **Ajout proposé — Nooma comme "skin system"** : la customisation (chapeaux, écharpes, couleurs de joues achetées en poussière d'étoile) et les **transformations de fin de biome** sont le principal levier de récompense long terme. Prévoir dès le rig Blender des **points d'accroche** (tête, cou) pour rendre les accessoires composables sans re-rendre tous les clips — sinon chaque accessoire multiplie les sprite sheets. ⚠️ À valider techniquement au Test A : accessoire rendu séparément et superposé dans l'app (même éclairage, même angle) vs re-rendu complet.

## 5. Audio ✅ principes, 🔶 production

L'audio est **le canal principal** de l'app (consignes, feedback, ambiance).

- **La voix de Nooma, c'est Florence** ✅ (nouveau, remplace le plan TTS) : voix féminine douce, incarnée, ET expertise orthophonique dans la même personne — la prononciation des phonèmes est juste *à la source*. C'est un différenciateur réel (chaleur impossible à égaler en TTS sur du contenu enfant) et une belle histoire à raconter.
  - ⚠️ **Les phonèmes isolés (/f/, /ch/…) restent le lot critique** : un son mal prononcé = un apprentissage faussé — Florence est exactement la bonne personne pour ça (les TTS échouent quasi systématiquement sur les phonèmes hors contexte).
  - **Organisation des enregistrements** 🔶 : sessions par **lots** (scripts préparés à l'avance : consignes, feedbacks, phonèmes, babillages), même pièce/même micro/même distance à chaque session (cohérence sonore), un bon micro USB (~100-150 €) + pièce meublée suffisent. Prévoir des **re-takes groupés** — le contenu évoluera.
  - Le **TTS reste l'outil d'itération** : pendant le dev, les nouvelles consignes passent en TTS temporaire, remplacées par la voix de Florence au lot d'enregistrement suivant. Rien de TTS ne part en release 🔶.
  - ⚠️ **Droits sur la voix** : la voix est un attribut de la personnalité — l'autorisation écrite de Florence (usage commercial, durée, supports) doit figurer dans la lettre de mission (doc 09 §5.2). Même entre amis, surtout entre amis.
  - **Babillage de Nooma** : gazouillis joués par Florence puis pitchés/traités (banque de 30-50, classés par émotion, mixés aléatoirement) — plus vivant que du généré.
- **Tout est pré-enregistré et embarqué** — jamais de TTS à la volée ✅.
- **Sound design** : cocon rassurant (carillons, clochettes, pops doux), son signature de réussite, jamais de son d'échec, une boucle musicale discrète par biome.
- 🔶 **Mix : prévoir 3 canaux réglables séparément dans l'espace parent** (voix / effets / musique) — certains enfants (notamment profils sensibles ou TSA) sont gênés par la musique de fond ; pouvoir la couper sans perdre les consignes est un vrai plus inclusif.

## 6. Pipeline de production (rappel + compléments)

1. **Fichier .blend « studio » partagé** : éclairage plateau stop-motion + matériaux clay de la palette — tous les rendus sortent du même studio → cohérence garantie.
2. **Cartes-mondes** : une scène par biome, caméra fixe, rendu en 3-4 couches (parallax), ~2048 px, WebP.
3. **Mascotte** : rig armature + shape keys, clips → séquences PNG → sprite sheets WebP.
4. **Images-mots (le gros chantier : 200-400 images)** : template Blender (turntable studio, fond transparent) + complément IA claymation si homogène — à valider au Test C.
5. **Autocollants, objets de jeu, UI** : mêmes studio et palette.

⚠️ **Gestion des fichiers lourds** : les .blend et rendus sources ne doivent pas gonfler le repo git de l'app — voir [06-architecture-technique.md](06-architecture-technique.md) (Git LFS ou repo assets séparé).

## 7. Accessibilité visuelle 🔶 (nouveau)

À intégrer dès la conception, coût quasi nul maintenant vs très cher après :

- **Daltonisme (~8 % des garçons)** : jamais une information portée *uniquement* par la couleur — toujours couleur + forme + position + son.
- **Contrastes** : texte et éléments interactifs conformes WCAG AA quand du texte apparaît (il y en a peu, mais les lettres/mots des exercices doivent être ultra-lisibles — police à valider, voir ci-dessous).
- **Police d'affichage des lettres/mots** ⚠️ : sujet pédagogique critique — le `a` typographique à double étage perturbe les lecteurs débutants qui apprennent le `ɑ` scripte. Choisir une police adaptée à l'apprentissage (ex. familles « école » : Andika, Belle Allure pour la cursive) — **à trancher avec l'orthophoniste**.
- **Gaucher/droitier** : zones tactiles symétriques, pas d'éléments cachés sous la main.
- Voir aussi European Accessibility Act dans [11-conformite-stores.md](11-conformite-stores.md).

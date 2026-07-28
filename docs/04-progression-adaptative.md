# 04 — Progression adaptative : niveaux infinis, biomes, rappels

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> **Statut : ce document formalise la nouvelle vision (juillet 2026) qui remplace le modèle « 5 mondes × 8-12 niveaux fixes » de l'ancien plan.** C'est le cœur différenciant du produit.

## 1. La vision en une phrase ✅ (exprimée par Hugo)

> Chaque niveau se construit automatiquement en fonction des données de l'enfant (ses faiblesses, ses forces). Quand il valide un module de compétences, il **change de biome/univers** — et dans chaque biome, il y a **une infinité de niveaux** tant que le module n'est pas validé. Des **niveaux surprises et périodiques** servent de rappels.

Conséquence produit majeure : **deux enfants n'ont jamais le même jeu.** Le chemin sur la carte se construit devant Nooma au fur et à mesure — littéralement : le sentier de pâte à modeler « pousse » devant elle.

## 2. Pourquoi c'est le bon modèle (et ses risques) 

**Pour** :
- Pédagogiquement, c'est du **mastery learning** : on ne quitte pas une compétence parce qu'on a fini les 10 niveaux prévus, on la quitte quand elle est *acquise*. C'est ce que font les meilleurs systèmes adaptatifs.
- Un enfant rapide ne s'ennuie jamais (il valide vite, change de biome vite) ; un enfant en difficulté n'est jamais humilié (il a « plein de niveaux » dans son biome, pas « il redouble le niveau 4 »).
- Côté production : on produit des **mécaniques + banques de contenu + biomes**, pas des niveaux un par un. 17 mécaniques × contenu généré = contenu virtuellement infini pour un coût de production borné.

⚠️ **Risques à garder en tête** :
1. **Monotonie** : « infini » généré peut devenir « répétitif ». Parade : règles de variété (§6.3), niveaux surprises (§7), et le fait que la *sortie* du biome dépend de la maîtrise — un enfant qui progresse normalement voit 8-15 niveaux par biome, pas 40.
2. **L'enfant coincé** : si un enfant stagne, l'infini devient un tapis roulant sans fin. Parade : détection de stagnation → Nooma change d'approche (autre mécanique travaillant la même compétence, modelling, redescente de difficulté), et **signal discret côté parent** (c'est exactement le genre de message que l'orthophoniste conseil saura formuler pour le parent).
3. **QA du généré** : un niveau généré peut être mauvais (mot ambigu, distracteurs trop proches). Parade : génération **contrainte par des templates validés à la main** + banques d'items relues par l'orthophoniste + seed déterministe pour reproduire tout niveau bugué (§8).
4. **Perte du sentiment de progression** : dans Mario, finir le niveau 8-4 est un but visible. Dans l'infini, il faut des **jalons artificiels forts** : c'est le rôle des biomes, des grandes aventures et de l'évolution du langage de Nooma.

## 3. Le modèle de compétences (la fondation) 🔶

Tout repose sur un **graphe de compétences** local (sur l'appareil), conçu avec l'orthophoniste.

### 3.1 Structure

```
Pilier (4)  →  Module (~12-16)  →  Compétence (~60-100)  →  Item (milliers)
```

Exemple concret :

```
Pilier 1 : Conscience phonologique
└── Module « Syllabes »
    ├── C1 : segmenter un mot de 2 syllabes        (items : lapin, bateau, château…)
    ├── C2 : segmenter un mot de 3+ syllabes       (items : lavabo, éléphant…)
    ├── C3 : fusionner des syllabes entendues
    └── C4 : supprimer/inverser une syllabe (avancé)
```

- Chaque **compétence** a : des prérequis (arêtes du graphe), un **score de maîtrise** (0→1), une date de dernière rencontre.
- Chaque **item** (mot, son, image, phrase) est tagué : compétences travaillées, difficulté intrinsèque (longueur, fréquence du mot, complexité syllabique CV/CVC, proximité des distracteurs), assets requis (image, audio).
- ⚠️ Le graphe et le tagging des items sont **le vrai travail pédagogique du projet** — c'est là que l'orthophoniste est irremplaçable. Le code, lui, est simple.

### 3.2 Score de maîtrise 🔶

Rester simple en v1 (on pourra sophistiquer après) :

- **Moyenne glissante pondérée** des dernières réponses par compétence (les récentes pèsent plus), pénalisée par l'aide reçue (réussite avec indice < réussite seule).
- **Décroissance temporelle** : la maîtrise « refroidit » avec le temps sans rencontre → c'est ce qui déclenche naturellement les rappels (§7).
- Compétence **validée** quand : maîtrise ≥ seuil (ex. 0,85) **et** ≥ N rencontres réparties sur ≥ 2 sessions (éviter la validation sur un coup de chance du jour).
- Module **validé** quand toutes ses compétences cœur le sont → **changement de biome** (§5).

Des modèles plus savants existent (Bayesian Knowledge Tracing, Elo, FSRS) — détaillés dans [02-pedagogie.md](02-pedagogie.md). La moyenne glissante + décroissance suffit largement en v1 et reste **explicable au parent** (« il maîtrise bien les syllabes, les sons complexes sont en cours »), ce qu'un modèle boîte noire ne permet pas.

## 4. L'équation d'un niveau ✅ principe, 🔶 détail

> **Niveau = Mécanique × Contenu × Difficulté × Habillage**, généré par le **Directeur** (le moteur adaptatif) au moment où l'enfant s'apprête à jouer.

Le Directeur compose chaque niveau ainsi :

1. **Objectif pédagogique** : choisir 1 compétence cible (la plus « rentable » : dans la zone proximale — ni acquise ni hors de portée) + 1-2 compétences en entretien (déjà vues, à consolider).
2. **Mécanique** : parmi les mécaniques compatibles avec la compétence cible (une matrice compétence ↔ mécaniques est définie à la main), en respectant les règles de variété (§6.3).
3. **Contenu** : tirer les items dans la banque selon la difficulté visée (mots connus vs nouveaux, distracteurs plus ou moins proches) — jamais 2 fois le même lot d'affilée.
4. **Difficulté de la mécanique** : nombre de choix (2→4), vitesse, présence du modelling de Nooma, niveau d'indiçage.
5. **Habillage** : thème du biome courant (les images, le décor, la musique) + micro-variation visuelle (position sur la carte, météo du décor…).

**Cible : ~80 % de réussite** sur chaque niveau (le « sweet spot » motivationnel documenté). Le Directeur ajuste la difficulté *entre* les niveaux et l'indiçage *pendant* le niveau — jamais d'échec bloquant : un niveau se finit toujours, plus ou moins aidé ✅.

## 5. Les biomes ✅ principe, 🔶 architecture

### 5.1 Ce qu'est un biome

Un **biome = un module de compétences incarné dans un univers visuel/sonore/narratif**. La Prairie « est » le module Syllabes ; la Rivière « est » le module Digraphes… L'enfant ne voit jamais « module » — il voit un monde.

- À l'intérieur : un **chemin qui se génère devant Nooma**, niveau après niveau, dans le décor du biome. Le chemin déjà parcouru reste visible et rejouable (le passé est fixe, seul l'avenir est généré) — l'enfant *voit* tout ce qu'il a accompli, littéralement le chemin parcouru.
- **Validation du module** → « grande aventure » de fin de biome (parcours scénarisé récapitulatif, jamais un examen) → cérémonie : transformation/tenue de Nooma, autocollant rare, et **voyage vers le biome suivant** (petite cinématique : Nooma passe la montagne, traverse la rivière…).
- Le langage de Nooma progresse **à chaque changement de biome** — c'est le jalon narratif qui rend la progression tangible.

### 5.2 Combien de biomes, quel ordre 🔶

Proposition : **~10-14 biomes** pour couvrir le CP (au lieu de 5 mondes fixes), car un biome = un module, et il y a plus de modules que de périodes scolaires. Exemples de chaîne (à construire avec l'orthophoniste, l'ordre suit le graphe de prérequis) :

> Prairie (syllabes) → Jardin (rimes) → Forêt (sons d'attaque/phonèmes) → Clairière des lettres (voyelles+premières consonnes) → Village (combinatoire CV) → Rivière (digraphes ou/on/an…) → Marais (sons proches f/v, ch/j…) → Colline (premiers mots) → Montagne (graphèmes complexes) → Grotte aux échos (fluence) → Vallée des histoires (phrases) → Ciel nocturne (compréhension/textes)…

- L'ordre n'est **pas strictement linéaire** : quand le graphe le permet, 2 biomes peuvent être ouverts en même temps (ex. un biome phono et un biome vocabulaire) → l'enfant choisit où aller aujourd'hui = **sentiment d'autonomie**, levier motivationnel majeur à cet âge, sans jamais créer de choix paralysant (2 options max).
- ⚠️ **Découplage du calendrier scolaire** : contrairement à l'ancien plan (1 monde = 1 période de CP), la progression est pilotée par la **maîtrise**, pas par le calendrier. Un enfant de grande section avancé ou de CE1 en consolidation y trouve sa place aussi — ça élargit la cible. Le programme CP reste la **colonne vertébrale du graphe**, pas le rythme imposé.

### 5.3 Coût de production ⚠️

Chaque biome coûte : 1 scène Blender (carte + couches parallax) + 1 déclinaison de palette + 1 boucle musicale + ~10 autocollants + habillages d'items. C'est le poste qui borne le nombre de biomes. Parade :
- Les biomes partagent les **mêmes mécaniques et la même structure** — seul l'habillage change.
- Lancement possible avec 4-5 biomes (couvrant les premiers modules), les suivants arrivent en mise à jour **avant** que les premiers enfants les atteignent (le rythme de maîtrise des enfants laisse des semaines de marge).
- Des « variations de biome » à bas coût (même scène, autre météo/heure : prairie au printemps / sous la neige) pour les enfants qui restent longtemps dans un module.

## 6. La carte et la boucle de jeu

### 6.1 La carte façon Mario, version générée 🔶

- **Carte globale** : le monde de Nooma vu de loin — les biomes traversés (finis, revisitables), le biome courant, et les suivants **sous la brume** (on devine des silhouettes → envie, pas de frustration).
- **Vue biome** : le chemin de nœuds. 1 seul niveau « suivant » actif ✅ (pas de choix paralysant), les anciens rejouables librement (rejouer = réviser sans le savoir, en mode « pour le plaisir » — les niveaux rejoués re-servent des items à consolider, discrètement).
- Le nœud suivant apparaît avec une **petite animation de pousse** (le chemin de pâte à modeler s'étire, un champignon-nœud sort du sol) — la carte est vivante, l'infini devient un émerveillement plutôt qu'une liste.
- 3-4 nœuds visibles devant (générés à l'avance) dont les **types sont lisibles** : nœud normal, nœud surprise (cadeau ?), nœud aventure — comme Candy Crush/Mario annoncent visuellement ce qui attend.

### 6.2 La session type (5-10 min) 🔶

Structure en « menu » calibrée par le Directeur :

1. **Accueil** (30 s) : Nooma fait la fête à l'enfant, petit rituel (elle dort ? on la réveille) — l'attachement, levier de rétention n°1 à cet âge.
2. **Échauffement** (1 niveau facile, compétence acquise) : succès garanti → confiance.
3. **Cœur** (1-2 niveaux dans la zone proximale) : là où on apprend.
4. **Dessert** (1 niveau plaisir : surprise, récolte, customisation, ou niveau « au choix ») : finir sur une note haute → envie de revenir.
5. **Clôture** : Nooma baille, se couche, dit à demain — **c'est elle qui se fatigue**, jamais l'enfant qui est coupé. (Limite de temps parentale racontée par la narration ✅.)

⚠️ La « difficulté en dents de scie » (dur → facile → dur) est documentée comme bien plus motivante qu'une pente continue — le Directeur doit l'implémenter *volontairement*, pas viser 80 % uniformément sur chaque niveau.

### 6.3 Règles de variété du Directeur 🔶 (anti-monotonie)

- Jamais 2 fois la même mécanique d'affilée ; pas plus de 2 fois la même mécanique par session.
- Alterner les **modalités** : un niveau « écouter », puis un « toucher/glisser », puis un « parler/taper le rythme ».
- Rotation des habillages d'items (les mêmes mots reviennent avec d'autres images/contextes).
- Chaque session contient **au moins une chose jamais vue** (un papillon nouveau sur la carte, un chapeau au loin, une phrase inédite de Nooma) — la nouveauté périodique est un moteur de curiosité peu coûteux (banque de micro-événements).

## 7. Niveaux surprises, périodiques et rappels ✅ principe, 🔶 design

C'est ta demande explicite — voici la typologie proposée :

| Type | Déclencheur | Contenu | Rôle caché |
|---|---|---|---|
| **Nœud cadeau** 🎁 | Aléatoire contrôlé (~1 niveau sur 6-8) | Mini-niveau très court, gain de poussière d'étoile, pas de nouvel apprentissage | Renforcement variable *éthique* : la surprise est toujours positive, jamais un « raté » |
| **Niveau écho** 🔔 | Une compétence « refroidit » (décroissance §3.2) | Niveau généré sur des compétences validées il y a longtemps, habillé « on retourne voir les amis de la Prairie ! » | **Répétition espacée déguisée** — le rappel est un voyage nostalgique, pas une révision |
| **Rêve de Nooma** 🌙 | Périodique (ex. 1re session de la semaine) | Niveau onirique (décor nuit/nuages) mélangeant des items de plusieurs biomes passés | Interleaving (mélange de compétences), documenté comme supérieur au blocage pour la rétention |
| **Visite surprise** 🦋 | Événement calendaire réel (saisons, Noël, printemps…) | Le biome courant se décore, un personnage secondaire passe, autocollants exclusifs temporaires-mais-récupérables | Rendez-vous, rétention saine — ⚠️ jamais de « tu as raté l'événement » : ce qui est manqué revient |
| **Défi de Nooma** ⭐ | Quand l'enfant est en réussite forte | Nooma propose (l'enfant peut refuser !) un niveau un cran au-dessus, présenté comme « on essaie un truc de grand ? » | Pousser le plafond sans risque : refuser est ok, échouer est ok (« on réessaiera, c'était pour rire ») |

⚠️ **Mises en garde éthiques** (détail dans [03-game-design.md](03-game-design.md)) :
- Le renforcement variable (récompenses aléatoires) est puissant et **dangereux** chez l'enfant — le garder **doux** : surprises fréquentes et modestes, jamais de « quasi-raté » (near-miss), jamais de compteur de série (streak) visible.
- Les événements périodiques ne doivent **jamais punir l'absence** (pas de FOMO). L'enfant malade une semaine retrouve tout, et Nooma lui dit qu'il lui a manqué — c'est tout.

## 8. Architecture technique du Directeur 🔶 (résumé — détail dans [06-architecture-technique.md](06-architecture-technique.md))

- **100 % local, déterministe, testable** : `generateLevel(profil, graphe, seed) → NiveauSpec`. Le seed est journalisé → tout niveau rencontré par un enfant est **reproductible** en debug (indispensable pour la QA du généré).
- Le Directeur est une **bibliothèque pure sans UI** (entrées : profil + banques ; sortie : spec JSON de niveau) → testable par simulation : on fait jouer 10 000 « enfants virtuels » (profils synthétiques : rapide, lent, irrégulier) et on vérifie statistiquement : jamais de niveau impossible, taux de réussite simulé ~80 %, temps de sortie de biome raisonnable, pas de boucle de répétition.
- **Garde-fous codés en dur** : difficulté ne saute jamais de plus d'un cran ; toujours ≥ 1 distracteur trivialement éliminable en difficulté basse ; item jamais représenté 2 fois dans le même niveau ; toute règle pédagogique de l'orthophoniste devient une assertion testée.
- Banques d'items **versionnées et relues** (fichiers JSON/CSV édités avec l'orthophoniste, validés par des scripts de lint : audio manquant, image manquante, tag incohérent).

## 9. Ce que ça change vs l'ancien plan (à acter) 🔶

| Ancien plan | Nouveau modèle |
|---|---|
| 5 mondes fixes calés sur les 5 périodes du CP | ~10-14 biomes calés sur les **modules de compétences**, rythme piloté par la maîtrise |
| 8-12 niveaux fixes par monde (~55 niveaux) | Niveaux **générés à l'infini** dans le biome jusqu'à validation du module |
| JSON par monde avec niveaux positionnés à la main | JSON par biome décrivant le **décor + les règles**, niveaux générés par le Directeur |
| Difficulté adaptative = choix des items | Difficulté adaptative = **tout le niveau** (mécanique, items, difficulté, indiçage) |
| (rien) | Niveaux surprises / échos / rêves / événements = système de rappel espacé déguisé |

**Ce qui ne change pas** ✅ : mécaniques de mini-jeux (elles restent la brique de base), DA clay, mascotte, audio-first, récompenses non-anxiogènes, grande aventure de fin de monde, espace parent.

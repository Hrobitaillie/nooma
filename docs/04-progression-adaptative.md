# 04 — Progression adaptative : niveaux infinis, biomes, rappels

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> **Statut : ce document formalise la nouvelle vision (juillet 2026) qui remplace le modèle « 5 mondes × 8-12 niveaux fixes » de l'ancien plan.** C'est le cœur différenciant du produit.
> ✅ **Modèle validé tel quel par Hugo le 30/07/2026** (journal doc 13) : ~10-14 biomes, découplage du calendrier, session-menu, typologie des 5 niveaux surprises. Les 🔶 restants sont des détails d'implémentation, à éprouver par le **simulateur du Directeur** (`/cadrage/simulateur`) puis à confirmer avec l'orthophoniste.

## 1. La vision en une phrase ✅ (exprimée par Hugo)

> Chaque niveau se construit automatiquement en fonction des données de l'enfant (ses faiblesses, ses forces). Quand il valide un module de compétences, il **change de biome/univers** — et dans chaque biome, il y a **une infinité de niveaux** tant que le module n'est pas validé. Des **niveaux surprises et périodiques** servent de rappels.

Conséquence produit majeure : **deux enfants n'ont jamais le même jeu.** Le chemin sur la carte se construit devant Plouma au fur et à mesure — littéralement : le sentier de pâte à modeler « pousse » devant elle.

## 2. Pourquoi c'est le bon modèle (et ses risques) 

**Pour** :
- Pédagogiquement, c'est du **mastery learning** : on ne quitte pas une compétence parce qu'on a fini les 10 niveaux prévus, on la quitte quand elle est *acquise*. C'est ce que font les meilleurs systèmes adaptatifs.
- Un enfant rapide ne s'ennuie jamais (il valide vite, change de biome vite) ; un enfant en difficulté n'est jamais humilié (il a « plein de niveaux » dans son biome, pas « il redouble le niveau 4 »).
- Côté production : on produit des **mécaniques + banques de contenu + biomes**, pas des niveaux un par un. 17 mécaniques × contenu généré = contenu virtuellement infini pour un coût de production borné.

⚠️ **Risques à garder en tête** :
1. **Monotonie** : « infini » généré peut devenir « répétitif ». Parade : règles de variété (§6.3), niveaux surprises (§7), et le fait que la *sortie* du biome dépend de la maîtrise. ⚠️ *Résultat de simulation (30/07/2026, `/cadrage/simulateur`) : l'estimation initiale « 8-15 niveaux par biome » est arithmétiquement intenable avec les règles de validation actées (maîtrise ≥ 0,85 + ≥ 6 rencontres par compétence sur ≥ 2 sessions, × ~4 compétences par module, + échauffements + confirmations) — la sortie typique simulée est de **~38-50 niveaux, soit 15-25 jours (2-3,5 semaines) par biome**. La durée-calendrier, elle, est exactement dans la cible (~12 biomes sur une année scolaire). À trancher : soit assumer ~40 niveaux/biome (les niveaux sont courts, 1-2 min), soit ne compter comme « nœuds du chemin » que les niveaux cœur, soit assouplir la validation — à caler avec l'orthophoniste.*
2. **L'enfant coincé** : si un enfant stagne, l'infini devient un tapis roulant sans fin. Parade : détection de stagnation → Plouma change d'approche (autre mécanique travaillant la même compétence, modelling, redescente de difficulté), et **signal discret côté parent** (c'est exactement le genre de message que l'orthophoniste conseil saura formuler pour le parent). *Concrètement : après ~2-3 niveaux consécutifs sous la cible sur une même compétence → bascule de mécanique et/ou redescente d'un cran ; après ~2-3 sessions sans progrès mesurable → message doux côté parent (ex. « en ce moment [prénom] travaille dur sur les sons complexes »). Seuils exacts à caler avec l'orthophoniste.*
3. **QA du généré** : un niveau généré peut être mauvais (mot ambigu, distracteurs trop proches). Parade : génération **contrainte par des templates validés à la main** + banques d'items relues par l'orthophoniste + seed déterministe pour reproduire tout niveau bugué (§8).
4. **Perte du sentiment de progression** : dans Mario, finir le niveau 8-4 est un but visible. Dans l'infini, il faut des **jalons artificiels forts** : c'est le rôle des biomes, des grandes aventures et de l'évolution du langage de Plouma. *Nuance (Hugo) : les biomes fournissent déjà ces jalons ; le risque vient surtout du **nombre de niveaux illimité tant que le module n'est pas validé** — d'où l'importance des jalons intermédiaires et de la grande aventure de fin de biome, détaillée au §5.4.*

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
- Module **validé** quand toutes ses compétences cœur le sont. Pour ne pas valider sur un coup de chance (réponse à une question de cadrage) : dès que les compétences cœur passent le seuil, le module entre en **pré-validation** → **2-3 niveaux de confirmation** répartis sur ≥ 2 sessions (qui mélangent les compétences du module) ; s'ils sont réussis → module **validé** → grande aventure (§5.4) puis **changement de biome** (§5). Sinon, retour en apprentissage ciblé sur la compétence qui a lâché.

Des modèles plus savants existent (Bayesian Knowledge Tracing, Elo, FSRS) — détaillés dans [02-pedagogie.md](02-pedagogie.md). La moyenne glissante + décroissance suffit largement en v1 et reste **explicable au parent** (« il maîtrise bien les syllabes, les sons complexes sont en cours »), ce qu'un modèle boîte noire ne permet pas.

> ✅ Principe validé (Hugo). ⏳ **À produire** : un doc technique dédié à l'algorithme du score de maîtrise (formule de pondération des réponses, décroissance temporelle, seuils de validation, pré-validation) avec pseudo-code et tests par propriétés — voir [06-architecture-technique.md](06-architecture-technique.md) §3-4.

## 4. L'équation d'un niveau ✅ principe, 🔶 détail

> **Niveau = Mécanique × Contenu × Difficulté × Habillage**, généré par le **Directeur** (le moteur adaptatif) au moment où l'enfant s'apprête à jouer.

Le Directeur compose chaque niveau ainsi :

1. **Objectif pédagogique** : choisir 1 compétence cible (la plus « rentable » : dans la zone proximale — ni acquise ni hors de portée) + 1-2 compétences en entretien (déjà vues, à consolider).
2. **Mécanique** : parmi les mécaniques compatibles avec la compétence cible (une matrice compétence ↔ mécaniques est définie à la main), en respectant les règles de variété (§6.3).
3. **Contenu** : tirer les items dans la banque selon la difficulté visée (mots connus vs nouveaux, distracteurs plus ou moins proches) — jamais 2 fois le même lot d'affilée.
4. **Difficulté de la mécanique** : nombre de choix (2→4), vitesse, présence du modelling de Plouma, niveau d'indiçage.
5. **Habillage** : thème du biome courant (les images, le décor, la musique) + micro-variation visuelle (position sur la carte, météo du décor…).

**Cible : ~80 % de réussite** sur chaque niveau (le « sweet spot » motivationnel documenté). Le Directeur ajuste la difficulté *entre* les niveaux et l'indiçage *pendant* le niveau — jamais d'échec bloquant : un niveau se finit toujours, plus ou moins aidé ✅.

## 5. Les biomes ✅ principe, 🔶 architecture

### 5.1 Ce qu'est un biome

Un **biome = un module de compétences incarné dans un univers visuel/sonore/narratif**. La Prairie « est » le module Syllabes ; la Rivière « est » le module Digraphes… L'enfant ne voit jamais « module » — il voit un monde.

- À l'intérieur : un **chemin qui se génère devant Plouma**, niveau après niveau, dans le décor du biome. Le chemin déjà parcouru reste visible et rejouable (le passé est fixe, seul l'avenir est généré) — l'enfant *voit* tout ce qu'il a accompli, littéralement le chemin parcouru.
- **Validation du module** → « grande aventure » de fin de biome (parcours scénarisé récapitulatif, jamais un examen) → cérémonie : transformation/tenue de Plouma, autocollant rare, et **voyage vers le biome suivant** (petite cinématique : Plouma passe la montagne, traverse la rivière… — ⚠️ *prod : cinématique optionnelle ; fallback à bas coût si la 3D est trop lourde à faire seul (fondu + « carte postale » légèrement animée, ou transition illustrée). Ce moment est détaillé au §5.4 ; mise en garde animations au §6.1.*).
- Le langage de Plouma progresse **à chaque changement de biome** — c'est le jalon narratif qui rend la progression tangible.

### 5.2 Combien de biomes, quel ordre 🔶

Proposition : **~10-14 biomes** pour couvrir le CP (au lieu de 5 mondes fixes), car un biome = un module, et il y a plus de modules que de périodes scolaires. Exemples de chaîne (à construire avec l'orthophoniste, l'ordre suit le graphe de prérequis) :

> Prairie (syllabes) → Jardin (rimes) → Forêt (sons d'attaque/phonèmes) → Clairière des lettres (voyelles+premières consonnes) → Village (combinatoire CV) → Rivière (digraphes ou/on/an…) → Marais (sons proches f/v, ch/j…) → Colline (premiers mots) → Montagne (graphèmes complexes) → Grotte aux échos (fluence) → Vallée des histoires (phrases) → Ciel nocturne (compréhension/textes)…

- L'ordre n'est **pas strictement linéaire** : quand le graphe le permet, 2 biomes peuvent être ouverts en même temps (ex. un biome phono et un biome vocabulaire) → l'enfant choisit où aller aujourd'hui = **sentiment d'autonomie**, levier motivationnel majeur à cet âge, sans jamais créer de choix paralysant (2 options max). ✅ *Validé (Hugo) — développe en plus la capacité de choix et l'autonomie de l'enfant, un bénéfice éducatif en soi.*
- ⚠️ **Découplage du calendrier scolaire** : contrairement à l'ancien plan (1 monde = 1 période de CP), la progression est pilotée par la **maîtrise**, pas par le calendrier. Un enfant de grande section avancé ou de CE1 en consolidation y trouve sa place aussi — ça élargit la cible. Le programme CP reste la **colonne vertébrale du graphe**, pas le rythme imposé.

### 5.3 Coût de production ⚠️

Chaque biome coûte : 1 scène Blender (carte + couches parallax) + 1 déclinaison de palette + 1 boucle musicale + ~10 autocollants + habillages d'items. C'est le poste qui borne le nombre de biomes. Parade :
- Les biomes partagent les **mêmes mécaniques et la même structure** — seul l'habillage change.
- Lancement possible avec 4-5 biomes (couvrant les premiers modules), les suivants arrivent en mise à jour **avant** que les premiers enfants les atteignent (le rythme de maîtrise des enfants laisse des semaines de marge).
- Des « variations de biome » à bas coût (même scène, autre météo/heure/**saison — été, printemps, automne, hiver** : prairie au printemps / sous la neige) pour les enfants qui restent longtemps dans un module.

> ✅ **Récompense par défaut = « fragments de langue », concrétisés en « dictionnaire de Plouma »** (acté 30/07/2026). Plutôt qu'accumuler des autocollants, l'enfant collecte des **fragments de la langue française** que **Plouma apprend en même temps que lui** : au fil des exercices, Plouma débloque des compréhensions de notre langage et un **dictionnaire se remplit** — lore fondateur : *Plouma vient sur Terre pour apprendre le français et progresse avec l'enfant* (cohérent avec l'évolution de son langage §5.1). Coût de prod quasi nul (éléments d'UI/typo, pas d'assets 3D par récompense), et ça renforce le lien affectif + le sens (« on apprend ensemble »). 🔶 Représentation UI du dictionnaire à designer. Autres récompenses (autocollants, tenues de Plouma) possibles plus tard. → répercuté dans [03-game-design.md](03-game-design.md) §2.2 ; reste [05-direction-artistique.md](05-direction-artistique.md).

### 5.4 La grande aventure de fin de biome 🔶

Le **jalon de progression fort** qui manque à un flux « infini » (§2, risque 4). Quand le module est validé (§3.2), au lieu d'un simple « niveau suivant », l'enfant vit un **parcours scénarisé récapitulatif** :

- **3-5 mini-tableaux enchaînés, sans échec possible**, qui rejouent en douceur les compétences du biome sous forme d'histoire (Plouma aide un habitant, franchit un obstacle…).
- Un **climax narratif** : Plouma traverse le biome une dernière fois et **débloque le passage vers le biome suivant** (montagne franchie, rivière traversée…).
- Une **récompense narrative** marquante : évolution du langage de Plouma, nouvelle tenue, fragment de langue « rare », entrée dans le nouveau décor.
- **Production maîtrisée** : réutilise les mécaniques et les assets déjà produits pour le biome — c'est un *enchaînement scénarisé* de niveaux existants, pas un nouveau moteur ni une cinématique lourde (cf. mise en garde animations §6.1).

C'est ce moment, répété à chaque biome, qui transforme « des niveaux à l'infini » en « une histoire qui avance ».

## 6. La carte et la boucle de jeu

### 6.1 La carte façon Mario, version générée 🔶

- **Carte globale** : le monde de Plouma vu de loin — les biomes traversés (finis, revisitables), le biome courant, et les suivants **sous la brume** (on devine des silhouettes → envie, pas de frustration). 🔶 *Piste d'UI (Hugo) : une **vue « lobby » scrollable** où chaque biome est une **tuile isométrique** ; on fait défiler pour entrevoir les biomes non débloqués (sous la brume), puis on entre dans un biome pour basculer sur sa vue-chemin.*
- **Vue biome** : le chemin de nœuds. 1 seul niveau « suivant » actif ✅ (pas de choix paralysant), les anciens rejouables librement (rejouer = réviser sans le savoir, en mode « pour le plaisir » — les niveaux rejoués re-servent des items à consolider, discrètement).
- Le nœud suivant apparaît avec une **petite animation de pousse** (le chemin de pâte à modeler s'étire, un champignon-nœud sort du sol) — la carte est vivante, l'infini devient un émerveillement plutôt qu'une liste. ⚠️ *prod : « nice-to-have », non bloquant ; fallback = apparition simple (fondu / léger scale). À ne tenter que si un tuto vidéo est trouvé, et en anticipant l'intégration technique (sprite sheet pré-rendue vs animation runtime dans Flame/Flutter).*
- 3-4 nœuds visibles devant (générés à l'avance) dont les **types sont lisibles** : nœud normal, nœud surprise (cadeau ?), nœud aventure — comme Candy Crush/Mario annoncent visuellement ce qui attend.

### 6.2 La session type (5-10 min) 🔶

Structure en « menu » calibrée par le Directeur :

1. **Accueil** (30 s) : Plouma fait la fête à l'enfant, petit rituel (elle dort ? on la réveille) — l'attachement, levier de rétention n°1 à cet âge.
2. **Échauffement** (1 niveau facile, compétence acquise) : succès garanti → confiance.
3. **Cœur** (1-2 niveaux dans la zone proximale) : là où on apprend.
4. **Dessert** (1 niveau plaisir : surprise, récolte, customisation, ou niveau « au choix ») : finir sur une note haute → envie de revenir.
5. **Clôture** : Plouma baille, se couche, dit à demain — **c'est elle qui se fatigue**, jamais l'enfant qui est coupé. (Limite de temps parentale racontée par la narration ✅.)

⚠️ La « difficulté en dents de scie » (dur → facile → dur) est documentée comme bien plus motivante qu'une pente continue — le Directeur doit l'implémenter *volontairement*, pas viser 80 % uniformément sur chaque niveau.

> 🔶 **Durée & fréquence** (question de cadrage) : une session vise **5-10 min** — calé sur la capacité d'attention à 5-7 ans (doctrine écrans Tisseron, doc 10). L'apprentissage vient de la **régularité**, pas de la durée : plusieurs sessions courtes valent mieux qu'une longue. L'app ne coupe pas autoritairement — elle donne une **fin naturelle** (Plouma se couche) ; le parent peut autoriser **1 à 2 sessions courtes par jour** (ex. matin/soir), soit ~10-20 min quotidiennes réparties. Un article parent expliquera « pourquoi court et répété » (doc 10 §blog).

### 6.3 Règles de variété du Directeur 🔶 (anti-monotonie)

- Jamais 2 fois la même mécanique d'affilée ; pas plus de 2 fois la même mécanique par session.
- Alterner les **modalités** : un niveau « écouter », puis un « toucher/glisser », puis un « parler/taper le rythme ».
- Rotation des habillages d'items (les mêmes mots reviennent avec d'autres images/contextes).
- Chaque session contient **au moins une chose jamais vue** (un papillon nouveau sur la carte, un chapeau au loin, une phrase inédite de Plouma) — la nouveauté périodique est un moteur de curiosité peu coûteux (banque de micro-événements).

## 7. Niveaux surprises, périodiques et rappels ✅ principe, 🔶 design

C'est ta demande explicite — voici la typologie proposée :

| Type | Déclencheur | Contenu | Rôle caché |
|---|---|---|---|
| **Nœud cadeau** 🎁 | Aléatoire contrôlé (~1 niveau sur 6-8) | Mini-niveau très court, gain de poussière d'étoile, pas de nouvel apprentissage | Renforcement variable *éthique* : la surprise est toujours positive, jamais un « raté » |
| **Niveau écho** 🔔 | Une compétence « refroidit » (décroissance §3.2) | Niveau généré sur des compétences validées il y a longtemps, habillé « on retourne voir les amis de la Prairie ! » | **Répétition espacée déguisée** — le rappel est un voyage nostalgique, pas une révision |
| **Rêve de Plouma** 🌙 | Périodique (ex. 1re session de la semaine) | Niveau onirique (décor nuit/nuages) mélangeant des items de plusieurs biomes passés | Interleaving (mélange de compétences), documenté comme supérieur au blocage pour la rétention |
| **Visite surprise** 🦋 | Événement calendaire réel (saisons, Noël, printemps…) | Le biome courant se décore, un personnage secondaire passe, autocollants exclusifs temporaires-mais-récupérables | Rendez-vous, rétention saine — ⚠️ jamais de « tu as raté l'événement » : ce qui est manqué revient |
| **Défi de Plouma** ⭐ | Quand l'enfant est en réussite forte | Plouma propose (l'enfant peut refuser !) un niveau un cran au-dessus, présenté comme « on essaie un truc de grand ? » | Pousser le plafond sans risque : refuser est ok, échouer est ok (« on réessaiera, c'était pour rire ») |

⚠️ **Mises en garde éthiques** (détail dans [03-game-design.md](03-game-design.md)) :
- Le renforcement variable (récompenses aléatoires) est puissant et **dangereux** chez l'enfant — le garder **doux** : surprises fréquentes et modestes, jamais de « quasi-raté » (near-miss), jamais de compteur de série (streak) visible.
- Les événements périodiques ne doivent **jamais punir l'absence** (pas de FOMO). L'enfant malade une semaine retrouve tout, et Plouma lui dit qu'il lui a manqué — c'est tout.

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

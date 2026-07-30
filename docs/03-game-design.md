# 03 — Game design : stealth learning, motivation, modes de jeu, éthique

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Document fondé sur une recherche sourcée (juillet 2026) — les URLs pointent vers les études et références citées.

## 1. Le principe fondateur : la mécanique EST la lecture

L'objectif « que l'enfant ne se rende pas compte qu'il apprend » a un nom en recherche : **intégration intrinsèque** ([Habgood & Ainsworth, 2011](https://shura.shu.ac.uk/3556/1/Habgood_Ainsworth_final.pdf)). Leurs résultats, obtenus avec de vrais enfants en assignation aléatoire :

- Le contenu d'apprentissage doit être livré **dans les moments les plus fun**, pas à côté (pas de « quiz entre deux niveaux »).
- Le contenu doit être **incarné dans la mécanique centrale** : dans leur jeu *Zombie Division*, l'attaque *est* une division. Résultat : meilleur apprentissage, et en libre choix les enfants ont joué **7× plus longtemps** à la version intégrée (75,7 min vs 10,3 min). Verbatim d'enfant : *« you don't really think you're doing that much »* — exactement l'effet recherché pour Plouma.
- ⚠️ Le contre-modèle a aussi un nom : **« chocolate-covered broccoli »** ([Bruckman, GDC 1999](https://www.academia.edu/2888989/Can_educational_be_fun)) — l'exercice scolaire enrobé d'un habillage de jeu. **Test du brocoli** à appliquer à chaque mini-jeu Plouma : *si on peut remplacer les sons/lettres/mots par autre chose sans changer le gameplay, le jeu est raté.*

**Application aux 17 mécaniques** : « Tape la syllabe » passe le test (taper le rythme *est* la segmentation). Un mini-jeu où on « gagne une course si on répond juste à une question » ne le passerait pas. Chaque nouvelle mécanique doit être auditée avec ce filtre — c'est le critère n°1 de design.

⚠️ **La leçon du transfert (cruciale)** : DragonBox (algèbre) est fun et efficace *dans le jeu*, mais [Long & Aleven 2017](https://dl.acm.org/doi/10.1145/3057889) (190 élèves) montrent que l'apprentissage en symboles-jeu **ne transfère pas** vers la notation réelle. Conséquence pour Plouma : **toujours des vraies lettres, des vrais graphèmes, des vrais mots français dans le gameplay** — jamais de symboles de substitution « rigolos » à la place des lettres. Avantage de la lecture sur les maths : le texte réel *peut* être directement l'objet manipulé.

**Nuance au stealth pur** ([Kapp](https://karlkapp.com/do-not-use-games-for-stealth-learning/)) : la recherche valide l'intégration mécanique, pas le secret total. Une **consolidation légère explicite** aide : en fin de niveau, Plouma reformule joyeusement ce qui a été réussi (« on a trouvé tous les mots qui chantent en -eau ! ») — 10 secondes, ton de célébration, pas de leçon.

## 2. Motivation des 5-7 ans : les 4 leviers scientifiques

### 2.1 Autodétermination (SDT) — autonomie, compétence, lien

- **Autonomie** : choix réels mais bornés — choisir entre 2 biomes ouverts, choisir son « dessert » de fin de session, personnaliser Plouma, refuser un défi. Jamais plus de 2-3 options (choix paralysant).
- **Compétence** : difficulté calibrée (~80 % de réussite) + feedback informatif immédiat.
- **Lien (relatedness)** : la relation avec Plouma — voir §2.3.

### 2.2 Récompenses : l'overjustification effect ⚠️

[Lepper, Greene & Nisbett 1973](https://www.heartofcharacter.org/wp-content/uploads/Undermining_Childrens_Intrinsic_Interest_with_Ext-1.pdf) (enfants de maternelle) : une récompense **promise à l'avance** détruit l'intérêt spontané pour une activité aimée (8,6 % de temps libre consacré au dessin vs 16,7 % contrôle) — mais la **même récompense donnée par surprise ne nuit pas** (18,1 %). Méta-analyse (128 études) : récompenses tangibles attendues d = −0,40 ; **éloge verbal d = +0,33**.

**Règles Plouma** ✅ (actées 30/07/2026) :
- **Interdit** : « finis ce niveau pour gagner X » — aucune récompense annoncée à l'avance.
- Les autocollants et la poussière d'étoile arrivent **en surprise**, à la complétion, jamais en carotte.
- Les récompenses sont **informationnelles** (jalons de maîtrise, souvenirs du voyage) pas transactionnelles.
- Idée à copier de Khan Academy Kids : des récompenses **dirigées vers l'univers** (là-bas, les étincelles remplissent un camion de cadeaux *pour les personnages*) — offrir des choses *à* Plouma et aux habitants des biomes plutôt qu'accumuler pour soi. ✅ Acté (30/07/2026) : l'enfant décore le monde, offre un chapeau à Plouma → générosité, pas consommation.
- ✅ **Récompense par défaut en v1 = « fragments de langue », concrétisés en « dictionnaire de Plouma »** (acté 30/07/2026, avec [04-progression-adaptative.md](04-progression-adaptative.md) §5.3). Au fil des exercices, **Plouma débloque des compréhensions de notre langage** et un **dictionnaire se remplit** : l'enfant collecte des fragments de la langue française que Plouma apprend en même temps que lui — lore : *Plouma vient sur Terre pour apprendre le français et progresse avec l'enfant*. C'est **informationnel** (un jalon d'apprentissage, pas une monnaie), donné **en surprise** (jamais annoncé), et cohérent avec l'évolution du langage de Plouma. 🔶 La **représentation** du dictionnaire (carnet de Plouma ? constellation ? objet du monde ?) reste à designer. Autocollants et tenues restent des récompenses **secondaires**, ajoutées plus tard.

### 2.3 L'effet mascotte (character effect) — le levier n°1 de Plouma

Corpus de Sandra Calvert (Georgetown) : chez les ~5 ans, plus la **relation parasociale** (attachement, confiance) avec un personnage est forte, plus l'apprentissage est rapide ; le **feedback contingent** (le personnage réagit vraiment aux réponses) augmente le transfert vers le monde réel ([Calvert et al. 2020, Child Development](https://pmc.ncbi.nlm.nih.gov/articles/PMC7818392/)). La relation se **construit avant** de porter l'apprentissage : présence répétée, petits rituels, personnalisation par l'enfant.

**Traduction produit** 🔶 :
- Les premières sessions investissent dans la **relation** (Plouma découvre l'enfant, apprend son prénom, joue) avant de monter en charge pédagogique.
- Le feedback de Plouma est toujours **contingent et spécifique** (elle réagit à ce que l'enfant a réellement fait, pas des phrases génériques aléatoires).
- La personnalisation de Plouma par l'enfant (customisation) n'est pas un gadget : c'est un **amplificateur documenté de l'apprentissage** ([Calvert, Richards & Kent 2014](https://www.sciencedirect.com/science/article/abs/pii/S0193397314000288)).

### 2.4 Le feedback : éloge du processus, jamais de la personne ⚠️

[Kamins & Dweck 1999](http://rpforschools.net/articles/Mindsets/Dweck%20&%20Kamins%201999%20Person%20vs%20process%20praise%20and%20criticism%20-%20Implications%20for%20contingent%20self%20worth%20and%20coping.pdf) (enfants de 5-6 ans, pile l'âge Plouma) : « tu es intelligent » crée de l'impuissance après échec ; « tu as trouvé une bonne façon de faire » construit la persévérance. Et l'éloge inflationniste sur tâche facile se retourne aussi.

**Règle d'écriture de tous les dialogues de Plouma** : féliciter le *comment* (« tu as bien écouté le début du mot ! »), jamais le *qui* (« tu es un champion »), et calibrer l'enthousiasme à la difficulté réelle. → À mettre dans la **charte d'écriture des dialogues** (livrable à créer avec l'orthophoniste).

## 3. Structure de progression : ce qu'on prend de Mario et Candy Crush

### 3.1 De Candy Crush (structure, pas monétisation)

Sources : [spécifications saga map](https://www.gamedeveloper.com/design/all-the-saga-map-specifications-you-should-know), [analyse données 6 800 joueurs](https://rstudio-pubs-static.s3.amazonaws.com/365533_07d8ce7115a04baeb7a2daefe4dd0d6c.html), [interview King](https://mobilegamer.biz/how-king-defines-a-good-candy-crush-saga-level-and-why-it-constantly-prunes-the-bad-ones/).

- **Zones de 15-25 niveaux** à identité visuelle propre → correspond bien à la taille cible d'un biome Plouma (8-15 niveaux typiques avant validation, cf. doc 04).
- **Difficulté en dents de scie (sawtooth)** : jamais deux niveaux exigeants d'affilée, une respiration facile après chaque défi. Le Directeur (doc 04 §6.2) l'implémente volontairement.
- **Pruning data-driven** : King mesure chaque niveau (temps, abandon) et corrige en continu ses niveaux les moins fun ; devise interne « *retention always wins* » — même leur niveau 65, rentable à court terme, a été adouci car il faisait fuir. Version éthique pour Plouma : télémétrie **anonyme et agrégée opt-in** (voir doc 07) pour repérer les mécaniques/items qui frustrent, et les corriger.
- ⚠️ **À ne surtout pas copier** : vies/energy, timers, « pinch levels » monétisés, near-miss. Et une différence structurelle : dans Candy Crush l'échec est attribué à la malchance du tirage ; dans un jeu de lecture, **l'enfant s'attribue l'échec** → la gestion de l'erreur doit être bien plus douce (d'où : pas d'échec possible, seulement plus ou moins d'aide ✅).

### 3.2 De Mario (le sentiment de lieu)

Sources : [analyse SMB3](https://www.gamedeveloper.com/design/super-mario-bros-3-level-design-lessons-part-3), [Super Mario World](https://www.mariowiki.com/Super_Mario_World).

- Chaque monde est **un lieu**, pas un menu : ennemis qui se promènent sur la carte, raccourcis, éléments qui bougent quand on progresse. → La carte Plouma est vivante : papillons, habitants, le chemin qui pousse.
- **Sorties secrètes et embranchements** (Super Mario World) : des secrets à découvrir nourrissent l'autonomie et l'exploration. 🔶 Version Plouma : de temps en temps, un **sentier caché** apparaît sur la carte (niveau bonus purement ludique, un souvenir à collectionner) — découvert, jamais annoncé.
- La **séquence de biomes** canonique (prairie → désert → eau → glace…) fonctionne comme jalon mémorable — validation directe du modèle « compétence validée = nouveau biome ».

### 3.3 Le contre-modèle vertueux

[Endless Alphabet](https://www.originatorkids.com/endless-alphabet/) : « no scores, no failure, no limits, no stress » — preuve qu'une app à succès peut n'avoir *aucune* pression. Plouma vise le milieu : la structure motivante de Mario/Candy Crush, l'innocuité d'Endless Alphabet.

## 4. Modes de jeu — recentrés le 30/07/2026 (✅ décisions, 🔶 restes à cadrer)

L'analyse des références (Khan Academy Kids, Duolingo ABC, Toca Boca, Sago Mini, LEGO Duplo World, Poio, Teach Your Monster to Read) fait émerger une double structure quasi universelle : **un chemin guidé adaptatif + un espace libre calme**. Décisions Hugo du 30/07/2026 :

| Mode | Description | Statut |
|---|---|---|
| **L'Aventure** ✅ | La carte-monde, les biomes, les niveaux générés (doc 04) | **Seul cœur de la v1** — l'apprentissage principal |
| **La maison de Plouma** 🔶 | Espace calme sans objectif : customisation de Plouma, décoration — le « coin Toca Boca » | **En attente** : pertinence à requestionner (ni actée ni rejetée) |
| **Les histoires** 🔶 | Mini-histoires audio-illustrées débloquées par la progression ; en fin d'année, l'enfant en lit des morceaux lui-même | **À cadrer** (contenu, coût de prod audio) — pas le cœur du besoin |
| **Jouer à deux** 🔶 v2 | Mini-jeux coopératifs parent-enfant — inspiration Overcooked : coopération joyeuse, pas compétition | Piste v2 à explorer : **split-screen/multi-touch sur le même écran vs « lobby » local** — ⚠️ toute variante réseau (LAN/Wi-Fi) serait incompatible avec zéro permission INTERNET (doc 07 §2) ; le même-écran reste la voie compatible |
| **Rendez-vous** ❌ | Cadeau hebdomadaire, événements saisonniers | **Retiré du périmètre pour l'instant** (décision 30/07/2026) — pourra revenir plus tard ; les « visites surprises » calendaires du Directeur (doc 04 §7) restent, elles, dans l'Aventure |

⚠️ **Pas de mode « quiz des parents », pas de daily quests, pas de streaks** : quasi absents des apps 4-8 ans respectées, et classés dark patterns pour ce public par la recherche récente ([étude 2026](https://www.sciencedirect.com/science/article/pii/S2212868926000024)).

**L'inspiration Overcooked** (posée par Hugo) : à cet âge le versus est à éviter, mais la **coopération à deux sur le même écran** (multi-touch) est faisable et rare sur le créneau — chacun tient un rôle (le parent tient la boîte, l'enfant y met les sons…). À garder pour la v2 comme moment parent-enfant premium.

## 5. Éthique : le référentiel anti-dark-patterns ⚠️

C'est un sujet de conformité autant que d'éthique — le détail réglementaire est dans [07-securite-vie-privee.md](07-securite-vie-privee.md) et [11-conformite-stores.md](11-conformite-stores.md).

L'ampleur du problème : [Radesky et al. 2022, JAMA](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2793493) — **98,8 % des enfants de 3-5 ans** exposés à au moins un design manipulateur dans leurs apps. Le pattern le plus répandu (70,6 % des enfants) : la **pression parasociale** — le personnage qui supplie ou pleure quand l'enfant veut partir.

**La règle absolue Plouma** : **Plouma n'est JAMAIS triste, suppliante ou culpabilisante quand l'enfant s'en va.** Elle dit au revoir joyeusement, baille, se couche. C'est l'exact inverse du pattern dominant du marché, c'est documenté comme nocif, et c'est cohérent avec la relation parasociale saine qui fait apprendre (§2.3). C'est aussi un **argument marketing** différenciant à assumer publiquement.

Checklist complète (issue des lignes directrices [DSA art. 28 de la Commission européenne, juillet 2025](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors), des [8 recommandations CNIL mineurs](https://www.cnil.fr/fr/la-cnil-publie-8-recommandations-pour-renforcer-la-protection-des-mineurs-en-ligne), du [ICO Children's Code standard 13](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/) et de [D4CR](https://childrensdesignguide.org/)) :

- ❌ Streaks, compteurs de série, « tu vas perdre ta flamme »
- ❌ Timers, comptes à rebours, urgence
- ❌ Autoplay, scroll infini, contenu éphémère
- ❌ Vies, energy, murs de progression monétisés
- ❌ Récompenses annoncées à l'avance (carotte)
- ❌ Notifications adressées à l'enfant (→ uniquement au parent, et opt-in)
- ❌ Mascotte triste/suppliante au départ
- ✅ Nudges pro-arrêt (fin de session célébrée, Plouma se couche) — explicitement encouragés par l'ICO
- ✅ Reprise sans aucune pénalité après absence (l'événement manqué revient)
- ✅ Transparence totale côté parent sur ce qui est appris

Rappel dissuasif : FTC c. Epic Games, **520 M$** d'amendes (COPPA + dark patterns) — le régulateur frappe désormais fort sur ce terrain.

## 6. Sessions et rétention saine

- **Durée cible : 10-15 min, fin explicite et célébrée.** Repères : OMS/AAP ~1 h d'écran de qualité par jour à cet âge ; règle française [3-6-9-12 de Tisseron](https://afpa.org/content/uploads/2017/06/3-6-9-12_tisseron.pdf) ; Teach Your Monster recommande 10-15 min/session. ⚠️ La règle « 2-3 min d'attention par année d'âge » circule partout mais n'a pas de source primaire solide — ne pas la citer dans la com.
- **Stopping points naturels** : la recherche sur les « stopping cues » montre que la fin d'une séquence est un point d'arrêt physiologique (que l'autoplay détruit — [étude](https://arxiv.org/html/2411.12083v2)). La structure session-menu (doc 04 §6.2) + « Plouma va dormir » = stopping cue intégré.
- **Détection de fatigue** 🔶 : dérive du taux d'erreur + latences vs la baseline de l'enfant → Plouma propose de finir. ⚠️ **Piège technique important** : le moteur adaptatif ne doit **pas interpréter la fatigue comme une lacune** (sinon il baisse la difficulté et fausse le profil) — les données de fin de session fatiguée pèsent moins dans le score de maîtrise (à implémenter dans le Directeur).
- **Rituel plutôt que streak** : ancrage à un moment de la journée choisi avec le parent (ex. après le goûter), reprise sans pénalité.

## 7. Les 10 principes de design Plouma (synthèse à afficher au mur)

1. La mécanique EST la lecture (test du brocoli sur chaque mini-jeu).
2. Toujours des vraies lettres et des vrais mots — jamais de symboles de substitution (leçon du transfert).
3. Stealth ≠ secret : Plouma célèbre *ce qui a été réussi* en 10 s de fin de niveau.
4. La relation avec Plouma se construit avant de porter l'apprentissage ; son feedback est contingent et spécifique.
5. Éloge du processus, jamais de la personne ; enthousiasme calibré à la difficulté.
6. Récompenses surprises, jamais promises ; tournées vers l'univers (offrir, décorer) plutôt qu'accumuler.
7. Biome = lieu et jalon ; sawtooth ; pruning des niveaux frustrants ; secrets découverts, jamais annoncés.
8. Aucune pression : pas de streak, timer, vie, FOMO, mascotte triste. Nudges pro-arrêt uniquement.
9. Sessions 10-15 min à fin célébrée ; c'est Plouma qui se fatigue, jamais l'enfant qui est puni.
10. Le parent voit tout (transparence), l'enfant ne voit jamais de métrique.

# 17 — Modes de jeu et mécaniques : le document de relecture

> ✅ = implémentée (le déroulé décrit le gameplay réel du code) · 📋 = spécifiée (principe acté, déroulé détaillé proposé ici, à valider) · 🔶 = à cadrer (mécanique actée dans la liste, mais dont le design reste ouvert)
> **Destinataires** : Hugo (relecture/ajustement), puis **Florence, orthophoniste conseil** (validation pédagogique). Aucune connaissance technique n'est nécessaire pour lire ce document.

## 1. Comment lire ce document

Chaque mécanique a une fiche d'une demi-page : ce que l'enfant voit/entend/fait, ce que règle la difficulté, comment on gère l'erreur, et son ancrage dans le programme officiel du CP. Les statuts ✅ / 📋 / 🔶 indiquent où on en est ; **chaque fiche se termine par un encadré « Questions pour la relecture »** : ce sont les choix à trancher — merci de les annoter directement (marge, commentaire, ou dans le viewer de cadrage).

Rappels transversaux valables pour TOUTES les mécaniques (détail docs [02](02-pedagogie.md) et [03](03-game-design.md)) :

- **Consignes 100 % audio** — jamais de texte comme seule instruction.
- **Le son du graphème, jamais le nom de la lettre** (/fff/, pas « èf »).
- **Règle « 100 % déchiffrable »** : aucun mot présenté ne contient un graphème non encore introduit pour cet enfant (sauf mots-outils marqués comme tels).
- **Jamais d'échec bloquant** : un niveau se finit toujours, plus ou moins aidé. L'erreur déclenche du **modelling** (Plouma montre), jamais un son/écran négatif.
- **Éloge du processus** (« tu as bien écouté le début du mot ! »), jamais de la personne.
- **Test du brocoli** (doc 03 §1) : si on peut remplacer les sons/lettres/mots par autre chose sans changer le gameplay, la mécanique est ratée. Chaque fiche explique en une ligne pourquoi elle passe le test.
- La **difficulté se règle en 4 crans (0 → 3)** par le Directeur (doc 04 §4) : nombre de choix, vitesse, présence du modelling préventif, niveau d'indiçage (mot écrit affiché ou non, découpage coloré…).

## 2. Les modes de jeu (état des décisions du 30/07/2026)

Source : [doc 03 §4](03-game-design.md). La recherche sur les meilleures apps 4-8 ans fait émerger une double structure : **un chemin guidé adaptatif + un espace libre calme**. Décisions actées :

| Mode | Statut | En une phrase |
|---|---|---|
| **L'Aventure** | ✅ **Seul cœur de la v1** | La carte-monde, les biomes, les niveaux générés — tout l'apprentissage passe par là (détail ci-dessous) |
| **La maison de Plouma** | ⏸ En attente | Espace calme sans objectif (customisation, décoration — le « coin Toca Boca ») ; pertinence à requestionner, ni actée ni rejetée |
| **Les histoires** | 🔶 À cadrer | Mini-histoires audio-illustrées débloquées par la progression ; en fin d'année l'enfant en lit des morceaux lui-même — contenu et coût de production audio à cadrer |
| **Jouer à deux (co-jeu parent)** | 🔶 v2 | Coopération joyeuse parent-enfant sur le même écran (inspiration Overcooked, multi-touch) — jamais de versus à cet âge |
| **Rendez-vous** | ❌ Retiré | Cadeau hebdomadaire / événements saisonniers : retiré du périmètre (30/07/2026) ; les « visites surprises » calendaires restent, elles, DANS l'Aventure |

### L'Aventure : la boucle complète

C'est le seul mode de la v1, et donc le cadre de toutes les mécaniques de ce document (détail : [doc 04](04-progression-adaptative.md)).

1. **La carte** : le monde de Plouma. Chaque **biome** (Prairie, Jardin, Forêt…) incarne un module de compétences — l'enfant ne voit jamais « module », il voit un monde. Le chemin de pâte à modeler **pousse devant Plouma**, niveau après niveau ; le chemin déjà parcouru reste visible et rejouable. Quand le module est validé : **grande aventure** de fin de biome (parcours scénarisé sans échec possible), puis voyage vers le biome suivant.
2. **La session (5-10 min), structurée en « menu »** (doc 04 §6.2) :
   - **Accueil** (30 s) : Plouma fait la fête à l'enfant, petit rituel (on la réveille ?).
   - **Échauffement** : 1 niveau facile sur une compétence acquise → succès garanti, confiance.
   - **Cœur** : 1-2 niveaux dans la zone proximale — là où on apprend.
   - **Dessert** : 1 niveau plaisir (surprise, récolte, niveau « au choix ») → finir sur une note haute.
   - **Clôture** : Plouma baille, se couche, dit à demain — **c'est elle qui se fatigue**, jamais l'enfant qui est coupé.
3. **Les niveaux surprises** qui s'intercalent sur le chemin (doc 04 §7) — chacun déguise un principe pédagogique :
   - 🎁 **Nœud cadeau** (~1 niveau sur 6-8, aléatoire contrôlé) : mini-niveau très court, surprise toujours positive, pas de nouvel apprentissage.
   - 🔔 **Niveau écho** : une compétence ancienne « refroidit » → « on retourne voir les amis de la Prairie ! » — c'est la **répétition espacée déguisée**.
   - 🌙 **Rêve de Plouma** (périodique) : niveau onirique mélangeant des items de plusieurs biomes passés — c'est l'**interleaving**.
   - 🦋 **Visite surprise** (calendrier réel : saisons, Noël…) : le biome se décore, un personnage passe — jamais de « tu as raté l'événement », ce qui est manqué revient.
   - ⭐ **Défi de Plouma** (quand l'enfant est en réussite forte) : un niveau un cran au-dessus, **refusable**, présenté comme « on essaie un truc de grand ? » — échouer est ok (« on réessaiera, c'était pour rire »).

## 3. Les 19 mécaniques — fiches de relecture

Liste canonique : [`contenu/mecaniques.json`](../contenu/mecaniques.json) (les 17 du brief + « dictée muette » + « machine à mots », actées le 30/07/2026). Compétences travaillées : d'après le [graphe de compétences](../contenu/graphe-competences.json) (12 modules, 47 compétences — en attente de ta relecture, Florence). Récapitulatif d'une ligne par mécanique : §5.

---

### Pilier 1 — Conscience phonologique

#### 3.1 Tape la syllabe — `tape-la-syllabe` ✅ implémentée

- **Modalité** : rythme (taper).
- **Déroulé réel (code actuel)** : Plouma dit le mot (« Écoute bien : … lapin ! Tape les syllabes ! »). L'enfant tape sur un **tambour de pâte à modeler** — une pastille colorée apparaît à chaque tap. **~1,2 s après le dernier tap**, validation automatique : réussite si le nombre de taps = le nombre de syllabes orales. Aux crans 0-1, le mot écrit s'affiche aussi, découpé en syllabes colorées, pendant l'écoute.
- **Compétences (graphe)** : segmenter un mot de 2 syllabes, de 3+ syllabes ; segmenter un mot court en phonèmes (niveau avancé).
- **Difficulté (crans 0-3)** : longueur du mot (2 → 3-4 syllabes) ; affichage du mot écrit découpé (crans 0-1) puis rien (crans 2-3) ; unité comptée (syllabes → phonèmes en fin de parcours).
- **Erreur** : Plouma dit « Regarde, je te montre » — elle prononce **syllabe par syllabe** pendant que le tambour pulse en rythme et que le découpage coloré s'affiche ; puis « À toi ! » et l'enfant refait (comptabilisé « réussi avec aide »).
- **Test du brocoli** : taper le rythme **EST** la segmentation — on ne peut pas remplacer les mots par autre chose sans casser le comptage.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il réalise des manipulations simples sur les syllabes et sur les phonèmes ».
- **❓ Questions pour la relecture**
  - Le délai de validation automatique de **1,2 s** après le dernier tap : bon compromis pour un enfant de 5-7 ans (assez long pour les lents, assez court pour ne pas casser le rythme) ?
  - Afficher le mot écrit découpé dès les crans 0-1 : conforme à ta pratique (la recherche dit que la conscience phonologique couplée aux lettres est plus efficace, doc 02 §1) ?
  - L'extension « taper les phonèmes » d'un mot court (pho-seg) te semble-t-elle jouable au tambour, ou faut-il la réserver à la boîte à sons ?

#### 3.2 La boîte à sons — `boite-a-sons` ✅ implémentée

- **Modalité** : toucher (jetons).
- **Déroulé réel (code actuel)** : Plouma dit le mot (et le répète aux crans 0-1). Une rangée de **4 à 6 jetons de pâte colorés** attend en bas (toujours **2 de plus que nécessaire**, pour que compter soit un vrai choix). L'enfant tape les jetons un par un : chaque jeton **saute dans la boîte** et Plouma prononce la syllabe correspondante (1er jeton = 1re syllabe…). Validation par le gros bouton « Fini ! » **ou automatiquement après 1,5 s d'inactivité**. Réussite = autant de jetons que de syllabes.
- **Compétences (graphe)** : la mécanique la plus polyvalente du pilier — segmentation 2 et 3+ syllabes, fusion de syllabes, suppression/inversion (avancé), détection et production de rimes, isoler le phonème d'attaque, fusionner/segmenter des phonèmes, **localiser un phonème (début/milieu/fin)** via des cases dans la boîte.
- **Difficulté (crans 0-3)** : longueur du mot ; mot écrit + découpage affichés (crans 0-1) ; unité (syllabe → phonème) ; variante localisation (la boîte a 3 cases : début / milieu / fin).
- **Erreur** : la boîte **se vide en douceur** (pas de bruit d'échec), Plouma montre — un jeton saute tout seul à chaque syllabe qu'elle prononce — puis l'enfant refait (« avec aide »).
- **Test du brocoli** : déposer **un jeton par syllabe** EST la segmentation ; le nombre attendu est le mot lui-même.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il discrimine les différents phonèmes de la langue » ; « manipulations simples sur les syllabes et sur les phonèmes (retrait, ajout, substitution, déplacements…) ».
- **❓ Questions pour la relecture**
  - La **validation auto après 1,5 s** d'inactivité (en plus du bouton « Fini ! ») : ok, ou faut-il exiger toujours le geste volontaire de l'enfant ?
  - Le **surplus de jetons** (toujours +2, rangée de 4-6) : suffisant pour que compter soit un vrai choix, sans surcharger ?
  - Quand l'enfant dépose un jeton, Plouma prononce la syllabe correspondante — mais **au-delà de la dernière syllabe, elle se tait** : est-ce un indice involontaire qui donne la réponse (l'enfant s'arrête quand ça ne « parle » plus) ? Faut-il un son neutre à la place ?

#### 3.3 L'intrus — `intrus-phonologique` 📋 spécifiée

- **Modalité** : écouter.
- **Déroulé proposé (à valider)** : 3-4 **images en pâte à modeler** s'affichent ; Plouma nomme chacune à voix haute (l'enfant peut re-taper une image pour réentendre). Consigne : « Trouve celui qui ne commence pas pareil ! » (ou : qui ne rime pas, qui n'a pas le même nombre de syllabes — selon la compétence cible). L'enfant touche l'intrus, qui fait une petite révérence comique s'il est trouvé.
- **Compétences (graphe)** : comparer la longueur syllabique de deux mots ; trouver l'intrus qui ne rime pas ; reconnaître une attaque commune.
- **Difficulté (crans 0-3)** : 3 → 4 images ; proximité phonologique de l'intrus (très différent → proche) ; ré-écoute automatique (crans 0-1) ou à la demande.
- **Erreur** : Plouma re-prononce les mots deux par deux **en étirant le son comparé** (« mmmmoto… mmmmaison… ») ; l'enfant réessaie avec un choix en moins.
- **Test du brocoli** : trouver l'intrus exige de comparer les **sons** des mots — impossible de réussir par l'image ou le contexte.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « savoir discriminer de manière auditive et savoir analyser les constituants des mots (conscience phonologique) ».
- **❓ Questions pour la relecture**
  - 3 ou 4 images par défaut au premier cran ?
  - Ta hiérarchie de difficulté entre les trois variantes (longueur syllabique / rime / attaque) correspond-elle à l'ordre du graphe (syllabes → rimes → attaques) ?
  - Le nommage automatique des images à l'ouverture suffit-il, ou faut-il forcer une ré-écoute complète avant de laisser répondre ?

#### 3.4 Les jumeaux presque pareils — `jumeaux-presque-pareils` 🔶 à cadrer

- **Modalité** : écouter.
- **Déroulé proposé (à valider — mécanique citée « à créer » dans doc 02 §4.1)** : deux personnages jumeaux en pâte à modeler tiennent chacun une image ; leurs noms forment une **paire minimale** (pain/bain, four/vous, poule/boule). Plouma prononce UN des deux mots ; l'enfant touche le bon jumeau. Aux niveaux avancés, les mots s'affichent aussi à l'écrit (paires écrites, dont les jumelles visuelles b/d).
- **Compétences (graphe)** : dire si deux mots riment ; **discriminer des paires minimales à l'oreille** ; distinguer les jumelles visuelles b/d, p/q ; lire des paires minimales écrites.
- **Difficulté (crans 0-3)** : distance de la paire (sons éloignés → paire minimale sourde/sonore f-v, p-b) ; oral seul → oral + écrit → écrit seul ; vitesse de prononciation naturelle.
- **Erreur** : Plouma prononce les deux mots **en exagérant l'articulation** du son qui change (gros plan sur sa bouche en pâte à modeler ?), puis refait écouter. Jamais de « non » — « écoute encore, ils se ressemblent beaucoup ces deux-là ! ».
- **Test du brocoli** : seule l'oreille (puis l'œil sur le graphème) permet de départager — c'est exactement l'exercice de discrimination.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il discrimine les différents phonèmes de la langue » ; le [guide « Pour enseigner la lecture et l'écriture au CP »](https://eduscol.education.gouv.fr/sites/default/files/document/guide-pour-enseigner-la-lecture-et-l-ecriture-au-cp-67854.pdf) insiste sur le traitement des confusions entre phonèmes proches.
- **❓ Questions pour la relecture** *(c'est LA mécanique où ton expertise de rééducation compte le plus)*
  - Quelles **paires minimales** prioritaires pour des CP tout-venant (vs patientèle) ? Ta liste ferait la banque d'items de référence.
  - Le gros plan articulatoire (voir la bouche) : utile ou gadget ? Faut-il plutôt un geste type Borel-Maisonny (piste doc 02 §4.2, non actée) ?
  - À quel moment confronter b/d à l'écrit sans induire la confusion (le graphe les sépare : b au Village, d au Marais, confrontation ensuite) ?

#### 3.5 La fabrique de syllabes — `fabrique-de-syllabes` 📋 spécifiée

- **Modalité** : glisser.
- **Déroulé proposé (à valider)** : une petite **machine de pâte à modeler** avec des entonnoirs. Plouma prononce des syllabes séparées (« la… pin ! ») ; des **bulles-syllabes sonores** flottent (on les tape pour les réentendre) ; l'enfant les **glisse dans la machine dans l'ordre**, tourne la manivelle → la machine « recrache » le mot entier, l'image apparaît. Variante avancée : glisser des graphèmes (l + a) pour fabriquer une syllabe lue.
- **Compétences (graphe)** : fusionner des syllabes entendues en un mot ; supprimer/inverser une syllabe (avancé) ; fusionner 2-3 phonèmes ; **lire une syllabe CV (l+a → la)**.
- **Difficulté (crans 0-3)** : 2 → 3-4 éléments à fusionner ; bulles sonores seules → bulles avec graphèmes écrits ; ordre donné → ordre à retrouver.
- **Erreur** : la machine fait un petit « pop » doux et rend les bulles ; Plouma re-prononce les morceaux dans l'ordre en les montrant, l'enfant refait.
- **Test du brocoli** : la fusion (assembler des sons pour produire un mot) est **littéralement le geste de jeu** — la manivelle ne fabrique que ce que l'enfant a assemblé.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il fusionne les graphèmes étudiés pour lire des syllabes et des mots » (versant oral : fusion syllabique/phonémique, prérequis explicite de la combinatoire).
- **❓ Questions pour la relecture**
  - La fusion orale (syllabes entendues) et la fusion écrite (graphèmes) doivent-elles rester **une seule mécanique** à deux étages, ou deux mécaniques distinctes pour l'enfant ?
  - Pour l'inversion de syllabes (« manteau » → « tomman »), le rendu sonore du mot inversé est dur à produire proprement — cette compétence a-t-elle sa place ici ou plutôt dans la boîte à sons ?

---

### Pilier 2 — Code grapho-phonémique & encodage

#### 3.6 Attrape le son — `attrape-le-son` 📋 spécifiée

- **Modalité** : écouter.
- **Déroulé proposé (à valider)** : Plouma annonce un son cible (« attrape le /ou/ ! »). Des mots **prononcés un par un** défilent, portés par des papillons/nuages clay ; quand l'enfant entend le son cible dans le mot, il l'attrape (tap). Aux crans avec écrit : ce sont des **graphèmes écrits** qui flottent, et l'enfant attrape celui qui fait le son prononcé par Plouma.
- **Compétences (graphe)** : reconnaître une attaque commune ; isoler le phonème d'attaque ; localiser un phonème ; **associer son ↔ lettre** (voyelles, consonnes continues, digraphes on/an/in/oi, graphies complexes au/eau/ai/eu/gn) ; repérer un graphème dans un mot entendu et écrit.
- **Difficulté (crans 0-3)** : nombre de leurres simultanés (2 → 4) ; leurres éloignés → proches (/ou/ vs /on/) ; rythme de défilement lent → naturel (jamais de chronomètre visible) ; position du son (attaque → milieu/fin).
- **Erreur** : le mot/graphème raté repasse tranquillement ; Plouma étire le son cible (« ouuuu, comme dans hibouuuu ») avant le nouveau passage.
- **Test du brocoli** : on n'attrape pas des objets, on attrape **un son** — la cible n'existe que par l'écoute (puis par le graphème).
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il distingue le nom d'une lettre ou d'un groupe de lettres du phonème qui lui correspond » ; « connaître les correspondances graphophonologiques ».
- **❓ Questions pour la relecture**
  - Le défilement introduit une **composante de vitesse** : acceptable si lente et sans chrono, ou à remplacer par une présentation statique (tout affiché, on choisit) ?
  - Faut-il que les leurres proches (paires confusables) soient interdits tant que la paire n'a pas été travaillée dans « Les jumeaux » ?

#### 3.7 La chasse au graphème — `chasse-au-grapheme` 📋 spécifiée

- **Modalité** : toucher.
- **Déroulé proposé (à valider)** : un **mot écrit en gros** (ou une mini-grille de lettres en pâte) ; Plouma donne un son (« trouve tout ce qui fait /ch/ ! »). L'enfant touche le(s) graphème(s) correspondants, qui s'illuminent et se détachent en relief. Variante « lettres muettes » : trouver les lettres grisées qui ne se prononcent pas. Variante « jumelles » : dans une grille de b et de d, toucher tous les b.
- **Compétences (graphe)** : associer son ↔ lettre (voyelles, continues, digraphes, graphies complexes) ; repérer un graphème connu dans un mot ; distinguer b/d, p/q ; repérer les lettres muettes ; accepter deux graphies d'un même son (o / au / eau).
- **Difficulté (crans 0-3)** : graphème isolé → dans un mot → dans une grille dense ; police et taille ; présence de graphèmes visuellement proches ; un seul → plusieurs exemplaires à trouver tous.
- **Erreur** : Plouma **prononce le mot en surlignant chaque graphème au fur et à mesure** (mise en correspondance œil-oreille), puis l'enfant refait.
- **Test du brocoli** : chercher une **forme écrite qui fait un son donné** est exactement la correspondance graphème-phonème — aucune substitution possible.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il nomme et discrimine visuellement les lettres et les graphèmes qu'elles forment quel que soit le type d'écriture utilisé ».
- **❓ Questions pour la relecture**
  - Faut-il proposer les 3 écritures (scripte / cursive / capitales) comme le demande le programme, et dans quel ordre d'introduction ?
  - La variante grille dense (type mots mêlés simplifiés) risque-t-elle de favoriser la reconnaissance purement visuelle sans passer par le son ? Garde-fou proposé : Plouma redit le son à chaque graphème trouvé.

#### 3.8 Le tri par son — `tri-par-son` 📋 spécifiée

- **Modalité** : glisser.
- **Déroulé proposé (à valider)** : **deux paniers** de pâte à modeler, chacun étiqueté par un son que Plouma prononce (et/ou par son graphème écrit) — par ex. /s/ et /z/. Des images arrivent une par une, Plouma nomme chacune ; l'enfant la glisse dans le bon panier. En fin de tri, Plouma récapitule joyeusement le contenu des paniers (« tous ceux-là chantent en /s/ ! »).
- **Compétences (graphe)** : comparer des longueurs syllabiques ; trier rimes/attaques ; associer son ↔ lettre ; discriminer des paires minimales ; **accepter deux graphies du même son** (panier /o/ qui accueille o, au, eau) ; catégoriser du vocabulaire (variante sémantique du pilier 4).
- **Difficulté (crans 0-3)** : proximité des deux sons (très différents → paire confusable) ; 4 → 8 items à trier ; images nommées automatiquement → à la demande ; ajout d'un 3e panier « ni l'un ni l'autre » (avancé).
- **Erreur** : l'item mal rangé **ressort du panier en rebondissant gentiment** ; Plouma re-prononce le mot en étirant le son, et propose de comparer avec un item déjà bien rangé.
- **Test du brocoli** : le critère de tri EST le son — les images sont interchangeables, les sons non.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « connaître la valeur sonore de certaines lettres (s – c – g) selon le contexte » et discrimination auditive des phonèmes.
- **❓ Questions pour la relecture**
  - Le panier « ni l'un ni l'autre » : utile pédagogiquement ou source de confusion à cet âge ?
  - Combien d'items par tri avant lassitude (proposition : 6) ?

#### 3.9 Trace la lettre — `trace-la-lettre` 🔶 à cadrer

- **Modalité** : tracer.
- **Déroulé proposé (à valider — le tracé guidé est resté 🔶 dans la décision du 30/07/2026)** : une lettre géante **creusée dans la pâte à modeler** ; une petite bille lumineuse montre le sens du tracé (point de départ, flèches) ; l'enfant **trace au doigt** dans le sillon pendant que Plouma fait le son de la lettre (jamais son nom). Réussite = tracé complet dans le bon sens, tolérance large. Pas de stylet en v1.
- **Compétences (graphe)** : tracer les lettres connues au doigt (module Premières lettres).
- **Difficulté (crans 0-3)** : sillon large → étroit ; bille-guide permanente → au départ seulement → absente ; lettre isolée → enchaînement de 2 lettres cursives.
- **Erreur** : si le doigt sort du sillon, la bille **revient au point de blocage** et pulse — pas de tracé « raté », juste un guide qui réapparaît.
- **Test du brocoli** : le geste EST la lettre — le tracé n'a de sens que parce que c'est un graphème (et le son est prononcé pendant le geste : boucle œil-main-oreille).
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download), partie « Copier » — « maîtriser les gestes de l'écriture cursive » ; le [guide CP](https://eduscol.education.gouv.fr/sites/default/files/document/guide-pour-enseigner-la-lecture-et-l-ecriture-au-cp-67854.pdf) consacre un chapitre entier à l'écriture (geste, copie, dictée).
- **❓ Questions pour la relecture**
  - Le tracé **au doigt sur tablette** est un pont vers l'écriture, pas de l'écriture manuscrite (ductus différent du crayon) : est-ce utile quand même en v1, ou vaut-il mieux le couper et renvoyer au papier (message côté parent) ?
  - Script ou cursive en premier sur tablette ?
  - Quelle tolérance de tracé sans créer de frustration (un enfant de 5 ans déborde beaucoup) ?

#### 3.10 La dictée muette — `dictee-muette` 📋 spécifiée (actée v1 le 30/07/2026)

- **Modalité** : composer.
- **Déroulé proposé (à valider)** : une **image** apparaît (un chat) — personne ne prononce le mot (dictée « muette » : c'est l'enfant qui doit l'évoquer intérieurement). En dessous, des **graphèmes mobiles en pâte à modeler** (les bons + des leurres). L'enfant les glisse dans les cases pour composer le mot. Chaque graphème posé fait entendre son son ; le mot complet est lu par Plouma en guise de vérification (« ch… a… chat ! »).
- **Compétences (graphe)** : composer une syllabe ou un mot entendu ; composer des mots avec digraphes (**le digraphe est UNE pièce**) ; encoder le bon son d'une paire minimale ; écrire des mots fréquents ; encoder avec la graphie attendue (au/eau).
- **Difficulté (crans 0-3)** : nombre de leurres (0 → 3) ; proximité des leurres (graphème quelconque → paire confusable) ; cases pré-dessinées (une par graphème) → ligne libre ; mot CV simple → mot avec digraphe/graphie complexe.
- **Erreur** : Plouma prononce le mot **lentement en tendant l'oreille de manière exagérée**, segmente (« chchch… a »), et fait scintiller le premier graphème correct ; l'enfant continue.
- **Test du brocoli** : composer le mot avec des graphèmes EST l'encodage — c'est le test ultime du code (doc 02 §3, erreur n°6 des apps concurrentes : aucune production).
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « en lien avec le décodage, il encode avec exactitude des syllabes et des mots réguliers dont les graphèmes ont été étudiés » ; l'encodage quotidien est une recommandation forte du [guide CP](https://eduscol.education.gouv.fr/sites/default/files/document/guide-pour-enseigner-la-lecture-et-l-ecriture-au-cp-67854.pdf).
- **❓ Questions pour la relecture**
  - La vraie dictée muette (Montessori) n'a **aucun son** ; ici chaque graphème posé sonne, et Plouma lit le résultat : est-ce une aide ou une dénaturation de l'exercice ?
  - Faut-il accepter les graphies phonologiquement plausibles mais orthographiquement fausses (« chat » écrit « cha ») avec un retour spécifique (« ça se lit pareil ! il manque juste la lettre muette ») plutôt qu'un simple modelling ?
  - Nombre de leurres au cran max : 3 suffisent ?

#### 3.11 La machine à mots — `machine-a-mots` 📋 spécifiée (actée v1 le 30/07/2026)

- **Modalité** : composer.
- **Déroulé proposé (à valider)** : **Plouma prononce un mot** (différence clé avec la dictée muette : ici on entend le modèle). L'enfant assemble les **graphèmes mobiles** — pas les lettres une à une : « ch » est une seule pièce de pâte — dans une machine qui, une fois le mot complet, s'anime et fait apparaître l'objet. Variante avancée : Plouma prononce une **phrase courte**, l'enfant remet des mots-étiquettes en ordre.
- **Compétences (graphe)** : composer une syllabe/un mot entendu ; mots avec digraphes ; encoder le bon son d'une paire ; écrire des mots fréquents ; encoder avec la graphie attendue ; **remettre une phrase en ordre**.
- **Difficulté (crans 0-3)** : syllabe → mot court → mot 2-3 syllabes ; leurres 0 → 3 et de plus en plus proches ; ré-écoute illimitée → limitée à la demande ; graphies concurrentes du même son en leurre (o/au/eau) au cran max.
- **Erreur** : Plouma **re-prononce le mot en le segmentant** et illumine la première pièce à poser ; l'enfant termine (« avec aide »).
- **Test du brocoli** : le mot prononcé se transforme en mot écrit **par les mains de l'enfant** — l'assemblage graphémique est le gameplay.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download), partie « Passer de l'oral à l'écrit » — « il connaît l'ensemble des correspondances graphophonologiques et les mobilise en situation de lecture et d'écriture ».
- **❓ Questions pour la relecture**
  - Dictée muette et machine à mots sont proches (image → composer vs audio → composer) : valides-tu la **distinction pédagogique** (évocation intérieure vs traitement de l'oral), ou faut-il les fusionner en une mécanique à deux modes ?
  - « ch » en une pièce : jusqu'où va-t-on (faut-il aussi « on », « eau », « ill » en pièces insécables — proposition : oui, tout graphème du graphe est une pièce) ?
  - La ré-écoute du mot doit-elle rester illimitée à tous les crans ?

---

### Pilier 3 — Décodage & fluence

#### 3.12 Les gammes de syllabes — `gammes-de-syllabes` 📋 spécifiée

- **Modalité** : lire.
- **Déroulé proposé (à valider)** : des syllabes écrites (ba, bo, bu…) apparaissent une à une sur des pierres du chemin ; **l'enfant lit la syllabe puis touche, parmi 2-4 propositions audio (haut-parleurs clay), celle qui dit ce qu'il a lu** — ou, plus direct : Plouma prononce une syllabe et l'enfant touche la syllabe écrite correspondante parmi 2-4. Chaque bonne pierre s'enfonce et fait avancer Plouma sur le chemin.
- **Compétences (graphe)** : lire une syllabe CV (l+a → la) ; automatiser la lecture de syllabes (gammes).
- **Difficulté (crans 0-3)** : structure CV → VC → CVC → CCV ; 2 → 4 propositions ; syllabes proches en leurre (ba/da au cran max, seulement après confrontation au Marais) ; cadence libre → soutenue (jamais de chrono visible).
- **Erreur** : Plouma **fusionne à voix haute en glissant son doigt** sous la syllabe (« lll…aaa… la ! »), l'enfant réessaie.
- **Test du brocoli** : la pierre ne s'enfonce que si la **syllabe lue** est reconnue — la combinatoire est le moteur du déplacement.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « établir les correspondances graphophonologiques ; combinatoire (produire des syllabes simples et complexes) » ; le [guide CP](https://eduscol.education.gouv.fr/sites/default/files/document/guide-pour-enseigner-la-lecture-et-l-ecriture-au-cp-67854.pdf) fait des gammes de syllabes un exercice quotidien recommandé.
- **❓ Questions pour la relecture**
  - Sans reconnaissance vocale (v2+), le sens « je lis puis je vérifie » passe par un appariement écrit↔audio : le montage te semble-t-il fidèle à l'exercice de gammes, ou trop détourné ?
  - Quelle dose de gammes par session avant l'effet « exercice scolaire » (proposition : mini-séries de 4-6 syllabes maximum, intégrées au déplacement sur le chemin) ?

#### 3.13 Les mots rigolos des étoiles — `mots-rigolos` 📋 spécifiée

- **Modalité** : lire.
- **Déroulé proposé (à valider)** : narrativement parfait : ce sont des mots de la **langue de Plouma** (pseudo-mots : « pilou », « vafi », « choupa »). Un habitant-étoile montre un mot écrit ; l'enfant le **décode** puis choisit parmi 3 prononciations proposées en audio celle qui correspond (les leurres diffèrent d'un phonème : « vafi » / « favi » / « vati »). Bonus rime : produire/reconnaître un mot-étoile qui rime.
- **Compétences (graphe)** : produire un mot qui rime ; lire des mots simples 100 % déchiffrables ; mots avec digraphes ; mots avec graphèmes complexes ; **décoder des pseudo-mots** (fluence).
- **Difficulté (crans 0-3)** : longueur (CV-CV → 3 syllabes, groupes consonantiques) ; leurres audio de plus en plus proches ; graphèmes récents inclus ou non.
- **Erreur** : Plouma décode **en surlignant graphème par graphème**, puis l'enfant réessaie sur le même mot.
- **Test du brocoli** : un pseudo-mot est **indevinable** — ni l'image ni le contexte ne peuvent aider, seul le décodage pur fonctionne. C'est l'anti-devinette absolu (doc 02 §3, erreur n°3).
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il décode avec exactitude les mots nouveaux ainsi que ceux dont le décodage n'a pas encore été automatisé » (le pseudo-mot est l'outil canonique d'évaluation du décodage, utilisé par les évaluations nationales CP).
- **❓ Questions pour la relecture**
  - Les pseudo-mots doivent rester **phonotactiquement français** (prononçables, plausibles) : valides-tu la génération contrainte à partir des graphèmes appris, avec ta relecture de la banque ?
  - Un enfant fragile peut-il être troublé par des mots « qui n'existent pas » ? L'habillage « langue des étoiles » suffit-il à ton avis ?
  - Ratio pseudo-mots / vrais mots dans une session (proposition : les mots rigolos restent une mécanique parmi d'autres, jamais deux fois de suite) ?

#### 3.14 Lecture flash — `lecture-flash` 📋 spécifiée

- **Modalité** : lire.
- **Déroulé proposé (à valider)** : une **luciole de pâte** éclaire brièvement un mot écrit (2 à 5 s selon le cran), puis il s'estompe ; 3 images (ou 3 mots écrits) apparaissent, l'enfant touche ce qu'il a lu. Utilisée en priorité pour les **mots-outils** (les, des, est, et, un, elle…) présentés comme des « mots-amis qu'on reconnaît du premier coup d'œil ».
- **Compétences (graphe)** : automatiser la lecture de syllabes ; **reconnaître les mots-outils par cœur** ; lire des mots fréquents ; lire un mot connu en moins de 2 s.
- **Difficulté (crans 0-3)** : durée d'affichage 5 s → 2 s (jamais de compte à rebours visible — la luciole s'éloigne, c'est tout) ; mot → groupe de 2 mots ; distracteurs visuellement proches (des/dans) au cran max.
- **Erreur** : le mot **revient sans limite de temps**, Plouma le lit en le montrant, puis nouvelle luciole sur le même mot plus tard dans le niveau (ré-exposition espacée).
- **Test du brocoli** : l'exposition brève force la **reconnaissance orthographique directe** — c'est le mécanisme même de la voie directe, pas un habillage.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il reconnaît directement les mots fréquents […] et les mots courants n'ayant pas de correspondance graphème/phonème régulières, les plus fréquents ».
- **❓ Questions pour la relecture**
  - Le flash (disparition du mot) est-il acceptable pour toi côté pression temporelle, sachant qu'il n'y a **aucune pénalité** et que le mot revient toujours ? (C'est la seule mécanique avec une contrainte de temps intrinsèque.)
  - 2 s en cran max : trop court pour un CP milieu d'année ?
  - Mots-outils uniquement, ou aussi mots fréquents réguliers déjà bien décodés ?

#### 3.15 Le karaoké — `karaoke` 📋 spécifiée

- **Modalité** : lire.
- **Déroulé proposé (à valider)** : une phrase ou un très court texte 100 % déchiffrable s'affiche ; **la voix le lit pendant que chaque mot s'illumine en rythme** (surlignage synchronisé). Puis « à toi ! » : le texte se rejoue **sans la voix**, l'enfant lit à son rythme en touchant chaque mot pour avancer le surlignage (un mot touché = confirmé lu ; re-taper longtemps = réentendre ce mot). 2-3 passages du même texte = lecture répétée.
- **Compétences (graphe)** : lecture répétée avec modèle audio (fluence).
- **Difficulté (crans 0-3)** : longueur du texte (1 phrase → 3-4 phrases) ; vitesse du modèle ; nombre de passages accompagnés avant le passage seul ; aide « colorisation syllabique » activable (syllabes en 2 couleurs alternées — l'aide transversale d'imprégnation syllabique, doc 02 §4.3).
- **Erreur** : pas d'« erreur » détectable sans micro — un mot longuement pressé est simplement **relu par la voix**, sans jugement ; le Directeur note les mots souvent réécoutés comme fragiles.
- **Test du brocoli** : suivre et rejouer le texte mot à mot EST la lecture accompagnée — l'illumination n'existe que portée par le texte.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — objectif de fluence explicite : « il lit un texte simple dans lequel le nombre de mots correctement lus par minute atteint au moins 50 mots » ; la lecture répétée avec modèle est la méthode de fluence la mieux documentée.
- **❓ Questions pour la relecture**
  - Sans reconnaissance vocale, la « lecture » de l'enfant n'est pas vérifiée (il peut taper sans lire) : acceptable en v1 comme exercice d'**exposition/entraînement** dont les données ne pèsent pas dans le score de maîtrise (règle doc 02 §5.2) ?
  - La colorisation syllabique : aide par défaut au début, ou uniquement à la demande ?
  - Faut-il proposer de « lire à un habitant » (lecture à voix haute libre, non évaluée, juste encouragée) pour préparer la reconnaissance vocale v2 ?

#### 3.16 Les chaînes de mots — `chaines-de-mots` 📋 spécifiée

- **Modalité** : lire.
- **Déroulé proposé (à valider)** : un mot de départ écrit (« bal ») ; l'enfant construit une chaîne où **un seul graphème change à chaque maillon** (bal → bol → bar…). Concrètement : le mot courant s'affiche, et 2-3 mots candidats sont proposés — l'enfant lit et choisit celui qui ne change **que d'un son** ; le maillon s'accroche à la chaîne de pâte, qui s'allonge. Plouma lit chaque maillon accroché.
- **Compétences (graphe)** : lire des mots avec digraphes ; mots fréquents ; mots avec graphèmes complexes ; **suivre une chaîne de mots** (fluence, précision du décodage).
- **Difficulté (crans 0-3)** : position du changement (attaque → voyelle → finale) ; candidats proches (bol/bal/dal) ; longueur de la chaîne ; changement d'une lettre → d'un graphème complexe (bau/beau exclu, graphies traitées au tri).
- **Erreur** : Plouma aligne le mot courant et le candidat choisi, **prononce les deux en surlignant ce qui diffère**, l'enfant réessaie.
- **Test du brocoli** : repérer *le* graphème qui change exige un décodage **précis lettre à lettre** — c'est un microscope à CGP, indevinable par l'image.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il décode avec exactitude » ; travail explicite de la précision des correspondances graphèmes-phonèmes.
- **❓ Questions pour la relecture**
  - Le choix parmi des candidats est-il fidèle à l'exercice des chaînes (habituellement en production) ? Alternative : remplacer soi-même le graphème (glisser la nouvelle pièce sur l'ancienne) — plus proche de l'encodage, plus coûteux en design.
  - Chaînes de vrais mots uniquement, ou pseudo-mots admis pour prolonger les chaînes (bal → bul ?) ?

---

### Pilier 4 — Compréhension & vocabulaire

#### 3.17 Mot-image — `mot-image` 📋 spécifiée

- **Modalité** : toucher.
- **Déroulé proposé (à valider)** : un **mot écrit** (jamais prononcé d'abord !) ; 3-4 images clay en dessous. L'enfant lit et touche l'image correspondante. Le cœur du réglage est la **proximité des distracteurs** : phonologique (poule/boule — force le décodage précis) ou sémantique (poule/canard — force l'accès au sens). C'est LE paramètre clé du Directeur (doc 02 §4.4). Sens inverse possible (une image, 3 mots écrits).
- **Compétences (graphe)** : lire des mots simples 100 % déchiffrables ; lire des paires minimales écrites ; mots-outils ; mots fréquents ; lettres muettes ; mots avec digraphes/graphèmes complexes ; **vocabulaire : apparier mot et sens**.
- **Difficulté (crans 0-3)** : 2 → 4 images ; distracteurs quelconques → sémantiques → phonologiques proches ; mot → sens inverse (image vers mots écrits, plus dur).
- **Erreur** : Plouma **décode le mot à voix haute graphème par graphème** en le surlignant, puis l'enfant repointe l'image — le décodage modèle est la correction.
- **Test du brocoli** : passe le test **à condition que les distracteurs soient calibrés** — avec des distracteurs éloignés, l'enfant devine par l'image (l'erreur n°3 des apps, doc 02 §3) ; avec des distracteurs phonologiques proches, seul le décodage précis départage. La banque d'items doit imposer des distracteurs proches dès le cran 1.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « identifier des mots de manière de plus en plus aisée » et vocabulaire (« il catégorise des mots selon différents critères »).
- **❓ Questions pour la relecture**
  - Valides-tu la règle « **jamais de distracteurs uniquement éloignés** au-delà du cran 0 » (anti-devinette) ?
  - Pour chaque item de la banque, il faudra tes **distracteurs recommandés** (doc 02 §8, livrable 3) : format ok pour toi (mot cible + 2 leurres phonologiques + 1 sémantique) ?
  - Le sens inverse (image → choisir parmi 3 mots écrits proches) te semble-t-il plus discriminant ? En faire le cran max ?

#### 3.18 Les consignes à exécuter — `consignes-a-executer` 📋 spécifiée

- **Modalité** : toucher.
- **Déroulé proposé (à valider)** : une petite scène clay (un arbre, des formes, des personnages) ; une **consigne écrite** apparaît (« touche le rond bleu sous l'arbre »). L'enfant lit et **agit directement dans la scène**. La consigne n'est jamais lue par la voix (sinon l'exercice disparaît) — mais l'enfant peut demander de l'aide, qui déclenche le modelling. Réussir = l'action attendue est faite ; la scène réagit (le rond bleu rigole).
- **Compétences (graphe)** : exécuter une consigne lue ; comprendre une histoire écoutée (variante orale en début de parcours) ; comprendre un très court texte lu seul.
- **Difficulté (crans 0-3)** : consigne de 3-4 mots → phrase avec relations spatiales (sur/sous/entre) → deux actions enchaînées ; nombre d'objets-leurres dans la scène ; syntaxe simple → relative courte.
- **Erreur** : Plouma lit la consigne à voix haute **en découpant les groupes de mots** (« touche… le rond bleu… sous l'arbre »), montre la zone du regard, l'enfant refait (« avec aide » — car la version lue à voix haute ne mesure plus la lecture).
- **Test du brocoli** : le texte est **le seul canal** vers l'action juste — la scène regorge de leurres, seule la lecture syntaxique complète permet d'agir juste.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « il mobilise le décodage des mots avec une aisance suffisante pour mettre en œuvre des stratégies de compréhension de ce qui a été lu (phrases et texte court fortement déchiffrables) ».
- **❓ Questions pour la relecture**
  - Le vocabulaire spatial (sur/sous/entre/à côté) et les structures syntaxiques : peux-tu prioriser celles qui posent réellement problème en CP ?
  - L'aide à la demande (bouton « Plouma, aide-moi ») dès le cran 0, ou seulement après une erreur ?
  - Les consignes doivent être 100 % déchiffrables : accepte-t-on quelques mots-outils non encore « officiellement » appris s'ils sont dans la banque par-cœur ?

#### 3.19 Phrase-image — `phrase-image` 📋 spécifiée

- **Modalité** : toucher.
- **Déroulé proposé (à valider)** : trois variantes sous le même toit :
  1. **Phrase → image** : une phrase écrite (« le chat dort sous la table »), 3 images proches (le chat dort SUR la table / le chien dort sous la table…) — l'enfant touche la bonne.
  2. **Vrai/faux** : une image + une phrase ; l'enfant donne la pancarte « c'est vrai ! » ou « c'est pas vrai ! » à Plouma.
  3. **Remise en ordre** : les mots d'une phrase en désordre sur des étiquettes clay ; l'enfant les glisse dans l'ordre ; Plouma lit le résultat (même s'il est rigolo : « dort le sous chat… hi hi, essaie encore ! »).
- **Compétences (graphe)** : lire et comprendre une phrase courte ; remettre une phrase en ordre ; comprendre une histoire écoutée (variante orale) ; comprendre un très court texte lu seul.
- **Difficulté (crans 0-3)** : images très contrastées → différant par UN détail encodé dans la phrase (le distracteur teste sur/sous, avant/après, singulier/pluriel) ; longueur de la phrase ; 3 → 4 propositions ; remise en ordre 3 → 5-6 étiquettes.
- **Erreur** : Plouma relit la phrase **en surlignant le groupe de mots décisif** (« sous la table… regarde bien où il dort ! »), l'enfant réessaie.
- **Test du brocoli** : les images ne diffèrent que par ce que **la phrase encode** — impossible de réussir sans lire ; et remettre les mots en ordre EST la syntaxe.
- **Ancrage CP** : [Attendus de fin de CP](https://eduscol.education.fr/document/13930/download) — « comprendre un texte et contrôler sa compréhension » ; « il comprend que la phrase est un groupe de mots ordonnés, porteur de sens. Il est attentif à l'ordre des mots ».
- **❓ Questions pour la relecture**
  - Trois variantes dans une mécanique : ok, ou faut-il en faire des mécaniques séparées aux yeux de l'enfant ?
  - En remise en ordre, la lecture à voix haute du résultat farfelu par Plouma (auto-correction par l'oreille) : bonne béquille ou court-circuit de la syntaxe écrite ?
  - Le vrai/faux est-il assez riche (50 % de hasard — ses données compteraient moins dans la maîtrise, règle doc 02 §5.2) ?

## 4. Ancrage au programme officiel du CP

### 4.1 Les textes de référence (liens vérifiés)

⚠️ **Point de vigilance sur les versions** : de **nouveaux programmes de français et de mathématiques pour le cycle 2** ont été publiés au BO du 31 octobre 2024 (arrêté du 22 octobre 2024) et sont **entrés en application à la rentrée 2025** — ce sont donc EUX qui sont en vigueur pour l'année scolaire du lancement de Plouma. Ils sont désormais **annualisés** (rédigés niveau par niveau : CP, CE1, CE2). Les « attendus de fin d'année » et « repères annuels de progression » publiés en 2019 restent en ligne sur éduscol ; ils datent du programme précédent mais couvrent les mêmes fondamentaux (le nouveau programme renforce encore la place du décodage/encodage systématique). **À re-vérifier avant toute communication externe** : si éduscol publie des attendus régénérés pour le programme 2024, les substituer.

| Référence | Lien | Ce qu'on y trouve | Statut de vérification |
|---|---|---|---|
| **Programme de français du cycle 2** (arrêté du 22/10/2024, BO n° 41 du 31/10/2024, applicable rentrée 2025) | [education.gouv.fr — BO](https://www.education.gouv.fr/bo/2024/Hebdo41/MENE2415135A) · [Légifrance — arrêté](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000050395251) | Le programme officiel en vigueur : lecture-écriture annualisée CP/CE1/CE2, étude systématique des CGP, encodage, fluence, compréhension | Existence confirmée par recherche (page officielle référencée partout) ; l'accès automatisé est bloqué par le site (403 anti-robot) — **à ouvrir à la main pour citation exacte** |
| **Attendus de fin d'année de CP — Français** (éduscol, 2019) | [PDF éduscol](https://eduscol.education.fr/document/13930/download) | 12 pages : « ce que sait faire l'élève » + exemples de réussite, par domaine (identifier des mots, comprendre, copier, écrire, oral…) — **la source des citations des fiches ci-dessus** | ✅ PDF téléchargé et lu intégralement le 04/08/2026 |
| **Guide « Pour enseigner la lecture et l'écriture au CP »** (le « guide orange », éduscol) | [PDF éduscol](https://eduscol.education.gouv.fr/sites/default/files/document/guide-pour-enseigner-la-lecture-et-l-ecriture-au-cp-67854.pdf) | 140 pages fondées sur l'état de la recherche : étude des CGP (tempo, ordre), syllabes/combinatoire, fluence, dictée et encodage quotidiens, compréhension | ✅ PDF téléchargé et vérifié le 04/08/2026 (même document que la référence du doc 02) |
| **Repères annuels de progression — Français cycle 2** (éduscol, 2019) | [PDF éduscol](https://eduscol.education.fr/document/13966/download) | 18 pages : la progression CP → CE1 → CE2 domaine par domaine (colonnes comparées) | ✅ PDF téléchargé et vérifié le 04/08/2026 |
| Page chapeau éduscol « Repères annuels de progression et attendus de fin d'année » | [éduscol](https://eduscol.education.fr/137/reperes-annuels-de-progression-et-attendus-de-fin-d-annee-du-cp-la-3e) | La page qui regroupe tous les PDF ci-dessus, du CP à la 3e | Existence confirmée par recherche ; accès automatisé bloqué (403 anti-robot) |

### 4.2 Ce que le programme demande, et comment Plouma y répond

Les attendus de fin de CP en lecture-écriture s'organisent autour de blocs que nos 4 piliers recouvrent exactement :

- **« Savoir discriminer de manière auditive et analyser les constituants des mots (conscience phonologique) »** → pilier 1 entier (tape la syllabe, boîte à sons, intrus, jumeaux, fabrique).
- **« Établir les correspondances graphophonologiques ; combinatoire » + « encoder avec exactitude des syllabes et des mots réguliers »** → pilier 2 (attrape le son, chasse au graphème, tri, tracé, dictée muette, machine à mots).
- **« Identifier des mots de manière de plus en plus aisée », « décoder avec exactitude les mots nouveaux », « reconnaître directement les mots fréquents », fluence (« au moins 50 mots par minute »)** → pilier 3 (gammes, mots rigolos, lecture flash, karaoké, chaînes).
- **« Comprendre un texte et contrôler sa compréhension » (phrases et textes courts fortement déchiffrables), vocabulaire** → pilier 4 (mot-image, consignes, phrase-image).

Deux attendus du CP restent **volontairement hors périmètre v1** de Plouma (honnêteté de cadrage) : l'**écriture cursive manuscrite** réelle (le tracé au doigt n'en est qu'un pont — voir fiche 3.9) et la **production de textes** (3-5 phrases) ; ainsi que la lecture à voix haute évaluée (reconnaissance vocale v2+). L'app **complète** la classe, elle ne la remplace pas (leçon Kalulu, doc 02 §3.7) — c'est aussi le message à porter côté parents.

## 5. Récapitulatif — une ligne par mécanique

| Mécanique (id) | Statut | Pilier | Modalité | Compétences (graphe) | Attendu CP principal |
|---|---|---|---|---|---|
| Tape la syllabe (`tape-la-syllabe`) | ✅ | Conscience phono | rythme | syl-seg2, syl-seg3, pho-seg | Manipuler syllabes et phonèmes |
| La boîte à sons (`boite-a-sons`) | ✅ | Conscience phono | toucher | syl-seg2/3, syl-fusion, syl-manip, rime-detect/prod, pho-attaque/fusion/seg/position | Discriminer et manipuler syllabes/phonèmes |
| L'intrus (`intrus-phonologique`) | 📋 | Conscience phono | écouter | syl-compare, rime-intrus, att-detect | Discrimination auditive des constituants des mots |
| Les jumeaux presque pareils (`jumeaux-presque-pareils`) | 🔶 | Conscience phono | écouter | rime-detect, prox-oreille/lettres/lecture | Discriminer les phonèmes (paires minimales) |
| La fabrique de syllabes (`fabrique-de-syllabes`) | 📋 | Conscience phono | glisser | syl-fusion, syl-manip, pho-fusion, cv-fusion | Fusionner (syllabes, phonèmes, combinatoire) |
| Attrape le son (`attrape-le-son`) | 📋 | Code & encodage | écouter | att-detect, pho-attaque/position, voy/cont/dig/cplx-son-lettre, lettre/dig-entendre | Correspondances graphème-phonème |
| La chasse au graphème (`chasse-au-grapheme`) | 📋 | Code & encodage | toucher | voy/cont/dig/cplx-son-lettre, lettre/dig-entendre, prox-lettres, mots-muettes, cplx-deux-graphies | Discriminer visuellement lettres et graphèmes |
| Le tri par son (`tri-par-son`) | 📋 | Code & encodage | glisser | syl-compare, rime-intrus, att-detect, voy/cont/dig/cplx-son-lettre, prox-oreille, cplx-deux-graphies, comp-vocab | Valeur sonore des lettres selon le contexte |
| Trace la lettre (`trace-la-lettre`) | 🔶 | Code & encodage | tracer | lettre-trace | Gestes de l'écriture (copier) |
| La dictée muette (`dictee-muette`) | 📋 | Code & encodage | composer | cv/dig/prox/mots/cplx-encodage | Encoder syllabes et mots réguliers |
| La machine à mots (`machine-a-mots`) | 📋 | Code & encodage | composer | cv/dig/prox/mots/cplx-encodage, phr-ordre | Passer de l'oral à l'écrit (CGP en écriture) |
| Les gammes de syllabes (`gammes-de-syllabes`) | 📋 | Décodage & fluence | lire | cv-fusion, cv-gammes | Combinatoire : produire/lire des syllabes |
| Les mots rigolos des étoiles (`mots-rigolos`) | 📋 | Décodage & fluence | lire | rime-prod, cv/dig/cplx-mots, flu-logatomes | Décoder avec exactitude les mots nouveaux |
| Lecture flash (`lecture-flash`) | 📋 | Décodage & fluence | lire | cv-gammes, mots-outils, mots-frequents, flu-flash | Reconnaître directement les mots fréquents |
| Le karaoké (`karaoke`) | 📋 | Décodage & fluence | lire | flu-repetee | Fluence (≥ 50 mots/min en fin de CP) |
| Les chaînes de mots (`chaines-de-mots`) | 📋 | Décodage & fluence | lire | dig-mots, mots-frequents, cplx-mots, flu-chaines | Précision du décodage (CGP) |
| Mot-image (`mot-image`) | 📋 | Compréhension & vocab | toucher | cv/dig/cplx-mots, prox-lecture, mots-outils/frequents/muettes, comp-vocab | Identifier des mots + vocabulaire |
| Les consignes à exécuter (`consignes-a-executer`) | 📋 | Compréhension & vocab | toucher | phr-consignes, comp-orale, comp-lue | Comprendre des phrases fortement déchiffrables |
| Phrase-image (`phrase-image`) | 📋 | Compréhension & vocab | toucher | phr-lecture, phr-ordre, comp-orale, comp-lue | Comprendre un texte ; ordre des mots de la phrase |

**Bilan** : 2 ✅ implémentées · 15 📋 spécifiées (déroulé proposé ici, à valider) · 2 🔶 à cadrer (jumeaux presque pareils, trace la lettre). Modalités bien réparties (règle de variété doc 04 §6.3) : écouter ×3, toucher ×5, glisser ×2, lire ×5, composer ×2, rythme ×1, tracer ×1.

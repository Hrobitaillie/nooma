# Graphe de compétences — v1 à relire

> ⚠️ **Document généré** par `npm run lint-contenu` depuis `contenu/graphe-competences.json` — ne pas éditer à la main.
> v1 produite par Hugo le 30/07/2026 — EN ATTENTE DE RELECTURE par l'orthophoniste conseil

Progression conforme docs/02 §2 : fréquence+consistance d'abord, consonnes continues avant occlusives, graphèmes complexes insécables, paires confusables séparées puis confrontées (b introduit au Village, d au Marais), mots-outils appris par cœur. Le son du graphème, jamais le nom de la lettre.

**12 modules (= biomes) · 47 compétences · 4 piliers.**

## 1. Syllabes — biome « Prairie » *(Conscience phonologique)*

Manipuler la syllabe orale : segmenter, fusionner, comparer, supprimer.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Segmenter un mot de 2 syllabes** `syl-seg2` | — | tape-la-syllabe, boite-a-sons | — | ● |
| **Segmenter un mot de 3 syllabes et plus** `syl-seg3` | `syl-seg2` | tape-la-syllabe, boite-a-sons | — | ● |
| **Fusionner des syllabes entendues en un mot** `syl-fusion` | `syl-seg2` | fabrique-de-syllabes, boite-a-sons | — | ● |
| **Comparer la longueur syllabique de deux mots** `syl-compare` | `syl-seg2` | intrus-phonologique, tri-par-son | — | ● |
| **Supprimer ou inverser une syllabe (avancé)** `syl-manip` | `syl-seg3`, `syl-fusion` | boite-a-sons, fabrique-de-syllabes | — | ●● |

## 2. Rimes & attaques — biome « Jardin » *(Conscience phonologique)*

Les unités intra-syllabiques : entendre ce qui se ressemble en fin et en début de mot.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Dire si deux mots riment** `rime-detect` | `syl-seg2` | boite-a-sons, jumeaux-presque-pareils | — | ● |
| **Trouver l'intrus qui ne rime pas** `rime-intrus` | `rime-detect` | intrus-phonologique, tri-par-son | — | ●● |
| **Produire un mot qui rime** `rime-prod` | `rime-detect` | boite-a-sons, mots-rigolos | — | ●● |
| **Reconnaître une attaque commune (mots qui commencent pareil)** `att-detect` | `syl-seg2` | intrus-phonologique, tri-par-son, attrape-le-son | — | ● |

## 3. Phonèmes — biome « Forêt » *(Conscience phonologique)*

Descendre au son : isoler, fusionner, segmenter, localiser les phonèmes.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Isoler le phonème d'attaque d'un mot** `pho-attaque` | `att-detect`, `syl-fusion` | attrape-le-son, boite-a-sons | — | ●● |
| **Fusionner 2-3 phonèmes entendus** `pho-fusion` | `pho-attaque` | fabrique-de-syllabes, boite-a-sons | — | ●● |
| **Segmenter un mot court en phonèmes** `pho-seg` | `pho-attaque` | boite-a-sons, tape-la-syllabe | — | ●● |
| **Localiser un phonème (début / milieu / fin)** `pho-position` | `pho-seg` | boite-a-sons, attrape-le-son | — | ●● |

## 4. Premières lettres — biome « Clairière des lettres » *(Code grapho-phonémique & encodage)*

Les premières correspondances graphème↔phonème : voyelles + consonnes continues (prononçables isolément) + « ch » et « ou » en unités insécables.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Associer son ↔ lettre : les voyelles a, i, o, u, é, e** `voy-son-lettre` | `pho-attaque` | attrape-le-son, chasse-au-grapheme, tri-par-son | a, i, o, u, é, e | ● |
| **Associer son ↔ lettre : les continues l, r, f, s, m, v + ch, ou** `cont-son-lettre` | `voy-son-lettre` | attrape-le-son, chasse-au-grapheme, tri-par-son | l, r, f, s, m, v, ch, ou | ●● |
| **Repérer un graphème connu dans un mot entendu et écrit** `lettre-entendre` | `cont-son-lettre` | chasse-au-grapheme, attrape-le-son | — | ●● |
| **Tracer les lettres connues au doigt** `lettre-trace` | `voy-son-lettre` | trace-la-lettre | — | ●● |

## 5. Combinatoire CV — biome « Village » *(Code grapho-phonémique & encodage)*

La fusion : consonne + voyelle = syllabe lue. Premières occlusives sourdes (p, t) et b — « d » volontairement repoussé au Marais (paires b/d séparées dans le temps).

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Lire une syllabe CV (l+a → la)** `cv-fusion` | `cont-son-lettre`, `pho-fusion` | gammes-de-syllabes, fabrique-de-syllabes | p, t, b | ●● |
| **Automatiser la lecture de syllabes (gammes)** `cv-gammes` | `cv-fusion` | gammes-de-syllabes, lecture-flash | — | ●● |
| **Lire des mots simples 100 % déchiffrables** `cv-mots` | `cv-gammes` | mot-image, mots-rigolos | — | ●● |
| **Composer une syllabe ou un mot entendu (encodage)** `cv-encodage` | `cv-fusion` | machine-a-mots, dictee-muette | — | ●● |

## 6. Digraphes — biome « Rivière » *(Code grapho-phonémique & encodage)*

Les sons à deux lettres, enseignés comme unités insécables : on, an/en, in, oi.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Associer son ↔ digraphe : on, an, en, in, oi** `dig-son-lettre` | `cv-fusion` | attrape-le-son, chasse-au-grapheme, tri-par-son | on, an, en, in, oi | ●● |
| **Repérer un digraphe dans un mot** `dig-entendre` | `dig-son-lettre` | chasse-au-grapheme, attrape-le-son | — | ●● |
| **Lire des mots avec digraphes** `dig-mots` | `dig-entendre`, `cv-mots` | mot-image, mots-rigolos, chaines-de-mots | — | ●●● |
| **Composer des mots avec digraphes (le digraphe est UNE pièce)** `dig-encodage` | `dig-mots`, `cv-encodage` | machine-a-mots, dictee-muette | — | ●●● |

## 7. Sons proches — biome « Marais » *(Conscience phonologique)*

Confrontation volontaire des paires confusables APRÈS acquisition séparée : f/v, s/z, ch/j, p/b, t/d — et la paire visuelle b/d. Introduit d, j, z.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Discriminer des paires minimales à l'oreille (pain/bain, four/vous)** `prox-oreille` | `pho-position` | jumeaux-presque-pareils, tri-par-son | d, j, z | ●●● |
| **Distinguer les jumelles visuelles b/d (et p/q)** `prox-lettres` | `prox-oreille`, `cv-fusion` | chasse-au-grapheme, jumeaux-presque-pareils | — | ●●● |
| **Lire des paires minimales écrites (poule/boule)** `prox-lecture` | `prox-lettres`, `cv-mots` | mot-image, jumeaux-presque-pareils | — | ●●● |
| **Encoder le bon son de la paire (dictée de paires)** `prox-encodage` | `prox-lecture` | dictee-muette, machine-a-mots | — | ●●● |

## 8. Premiers mots — biome « Colline » *(Décodage & fluence)*

Le lexique décolle : mots-outils appris par cœur (présentés comme tels), mots fréquents, nouvelles consonnes c, g, n.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Reconnaître les mots-outils par cœur (le, la, un, une, est, et…)** `mots-outils` | `cv-mots` | lecture-flash, mot-image | c, g, n, è | ●● |
| **Lire des mots fréquents déchiffrables** `mots-frequents` | `mots-outils`, `dig-mots` | mot-image, chaines-de-mots, lecture-flash | — | ●● |
| **Repérer les lettres muettes (grisées) dans un mot** `mots-muettes` | `mots-frequents` | chasse-au-grapheme, mot-image | — | ●● |
| **Écrire des mots fréquents (dictée muette)** `mots-encodage` | `mots-frequents`, `prox-encodage` | dictee-muette, machine-a-mots | — | ●●● |

## 9. Graphèmes complexes — biome « Montagne » *(Code grapho-phonémique & encodage)*

Plusieurs graphies pour un même son : au/eau, ai/è, eu, gn, er/ez, ill.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Associer son ↔ graphies complexes (au/eau, ai, eu, gn)** `cplx-son-lettre` | `dig-son-lettre` | attrape-le-son, chasse-au-grapheme, tri-par-son | au, eau, ai, eu, gn, er, ez, ill | ●●● |
| **Accepter deux graphies du même son (o / au / eau)** `cplx-deux-graphies` | `cplx-son-lettre` | tri-par-son, chasse-au-grapheme | — | ●●● |
| **Lire des mots avec graphèmes complexes** `cplx-mots` | `cplx-son-lettre`, `mots-frequents` | mot-image, mots-rigolos, chaines-de-mots | — | ●●● |
| **Encoder avec la graphie attendue** `cplx-encodage` | `cplx-mots` | dictee-muette, machine-a-mots | — | ●●● |

## 10. Fluence — biome « Grotte aux échos » *(Décodage & fluence)*

Automatiser : lecture flash, lecture répétée avec modèle, chaînes de mots, logatomes (la langue des étoiles !).

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Lire un mot connu en moins de 2 s** `flu-flash` | `mots-frequents` | lecture-flash | — | ●●● |
| **Décoder des pseudo-mots (mots rigolos des étoiles)** `flu-logatomes` | `cplx-mots` | mots-rigolos | — | ●●● |
| **Suivre une chaîne de mots (bal → bol → bar)** `flu-chaines` | `flu-flash` | chaines-de-mots | — | ●●● |
| **Lecture répétée avec modèle audio (karaoké)** `flu-repetee` | `flu-flash` | karaoke | — | ●●● |

## 11. Phrases — biome « Vallée des histoires » *(Compréhension & vocabulaire)*

De la suite de mots au sens : phrases 100 % déchiffrables, consignes à exécuter, remise en ordre.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Lire et comprendre une phrase courte (phrase → image)** `phr-lecture` | `flu-flash`, `mots-outils` | phrase-image | — | ●●● |
| **Exécuter une consigne lue (« touche le rond bleu sous l'arbre »)** `phr-consignes` | `phr-lecture` | consignes-a-executer | — | ●●● |
| **Remettre une phrase en ordre** `phr-ordre` | `phr-lecture` | phrase-image, machine-a-mots | — | ●●● |

## 12. Compréhension — biome « Ciel nocturne » *(Compréhension & vocabulaire)*

Comprendre au-delà du décodage : histoires écoutées, vocabulaire, premières lectures autonomes.

| Compétence | Prérequis | Mécaniques | Graphèmes introduits | Difficulté |
|---|---|---|---|---|
| **Comprendre une histoire écoutée (questions par l'image)** `comp-orale` | `phr-lecture` | phrase-image, consignes-a-executer | — | ●●● |
| **Vocabulaire : apparier mot et sens (distracteurs sémantiques)** `comp-vocab` | `comp-orale` | mot-image, tri-par-son | — | ●●● |
| **Comprendre un très court texte lu seul** `comp-lue` | `comp-orale`, `phr-consignes` | phrase-image, consignes-a-executer | — | ●●● |

## Banques d'items

- `banques/syllabes.csv` : **100 items**, dont 19 marqués « à vérifier » (découpage syllabique oral à arbitrer — e caduc).

*Progression des graphèmes cumulée (ordre d'introduction par module) :* a, i, o, u, é, e, l, r, f, s, m, v, ch, ou, p, t, b, on, an, en, in, oi, d, j, z, c, g, n, è, au, eau, ai, eu, gn, er, ez, ill.

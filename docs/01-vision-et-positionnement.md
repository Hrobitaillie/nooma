# 01 — Vision et positionnement

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde

## 1. Vision ✅

**Nooma** transforme l'apprentissage de la lecture (programme du CP) en un jeu d'aventure que l'enfant de 5-7 ans a *envie* de lancer — au point de ne pas se rendre compte qu'il apprend. L'app s'utilise **seul, en autonomie totale**, sur tablette, guidé par Nooma, une petite étoile en pâte à modeler tombée du ciel qui apprend à parler et à lire *en même temps que l'enfant*.

**Le test ultime du produit** : si on demande à l'enfant « tu fais quoi ? », il doit répondre « je joue avec Nooma », jamais « je fais mes exercices de lecture ».

## 2. L'équipe ✅

| Qui | Rôle | Apport |
|---|---|---|
| **Hugo** — développeur fullstack (WordPress/PHP, notions Laravel/Vue/React) | **Fondateur solo** : produit, dev, DA (Blender), pipeline assets, décisions | Toute la réalisation et la direction du projet |
| **Florence** — orthophoniste (amie proche) | **Conseil métier** — pas d'association, pas de parts, pas de co-direction | Conseils sur les exercices, la progression, les confusions réelles des enfants ; relecture/validation pédagogique |

Mode de production ✅ : le code sera **majoritairement écrit avec l'IA (vibe coding, Claude Code)** — c'est ce qui rend le périmètre tenable en solo. Contrepartie : une discipline de garde-fous (tests, CI, zones à revue humaine obligatoire) décrite dans [06-architecture-technique.md](06-architecture-technique.md) §7.

Le projet reste **solo** : Hugo décide et réalise tout. L'orthophoniste éclaire les choix pédagogiques en amont et relit ce qui est produit. Conséquences :

- La crédibilité pédagogique reste exploitable (« élaborée avec les conseils d'une orthophoniste ») **tant que la formulation reste factuelle** — voir [10-marketing-communication.md](10-marketing-communication.md).
- Le risque « justesse pédagogique » est fortement réduit par ses relectures — mais la **production** du contenu (banques d'items, consignes) reste sur les épaules de Hugo : à intégrer dans la charge (voir [12-roadmap.md](12-roadmap.md)).
- ⚠️ Même entre amis, un point juridique à régler simplement : si elle rédige ou corrige des contenus (listes de mots, progressions, formulations), ce sont des œuvres protégées qui **lui appartiennent par défaut** — prévoir une autorisation/cession écrite légère (voir [09-business-model.md](09-business-model.md) §5.3).

## 3. Positionnement ✅ (reformulé)

**« Le compagnon de lecture qui joue avec votre enfant »** — pas une app d'exercices, pas de l'école à la maison.

Trois promesses :

1. **Pour l'enfant** : un jeu coloré, doux et drôle, avec une amie (Nooma) qui grandit avec lui. Jamais d'échec, jamais de note, jamais de chrono anxiogène.
2. **Pour le parent** : un contenu sérieux (conçu par une orthophoniste, aligné programme CP), zéro pub, zéro tracking, données qui restent sur la tablette, temps d'écran maîtrisé.
3. **Différenciation produit** : là où la concurrence propose des parcours fixes, Nooma propose une **progression infinie générée pour chaque enfant** à partir de ses forces/faiblesses (voir [04-progression-adaptative.md](04-progression-adaptative.md)) — l'app « respire » avec l'enfant au lieu de dérouler un catalogue.

## 4. Différenciation face à la concurrence

> L'analyse concurrentielle détaillée (Poppins, Lalilo, GraphoLearn, Kaligo, Duolingo ABC, Khan Academy Kids, Teach Your Monster to Read…) est dans [02-pedagogie.md](02-pedagogie.md) §concurrence.

Nooma ne rivalisera pas sur la richesse visuelle d'un studio financé (Poppins). Sa valeur perçue vient de :

- **Cohérence et douceur** : une seule DA claymation unifiée, soignée, chaleureuse (voir [05-direction-artistique.md](05-direction-artistique.md))
- **Qualité d'interaction** : micro-feedbacks sonores, animations réactives, zéro friction
- **Audio-first réel** : conçu pour un enfant qui ne sait pas lire les consignes (beaucoup d'apps l'oublient)
- **Adaptativité réelle** : niveaux générés selon le profil de l'enfant, pas un parcours linéaire identique pour tous
- **Confiance** : conseils d'une orthophoniste + vie privée exemplaire (100 % offline v1)

## 5. Anti-objectifs ✅ (ce que Nooma ne sera jamais)

- Pas de publicité, pas d'achats visibles par l'enfant, pas de monnaie achetable
- Pas de mécaniques de pression : streaks punitifs, timers, vies limitées, FOMO
- Pas de « school-ification » : jamais de notes, de rouge, de « faux ! », de classements entre enfants
- Pas de réseau social, pas de chat, pas de contenu généré par d'autres utilisateurs
- Pas de collecte de données au-delà du strict nécessaire local

## 6. Le nom ⚠️ (statut : à re-décider)

**« Nooma » est abandonné** (recherche d'antériorité du 28/07/2026 : marque FR identique enregistrée en classes 41/42, nom saturé, domaines pris) — **le renommage est décidé**. Contraintes de Hugo : nom inventé, pas un prénom, pas de finale « -ou ». **Shortlist vérifiée : Zintille · Plouma · Brillune · Étinelle · Ploumelle** (détail et étapes dans [09-business-model.md](09-business-model.md) §5.4). « Nooma » reste le **nom de code interne** (repo, docs) tant que le nouveau nom n'est pas choisi et déposé — la mascotte sera renommée d'après le nom retenu.

## 7. Métriques de succès 🔶

À ce stade (pré-lancement), les seules métriques qui comptent, dans l'ordre :

1. **Test enfant réussi** : un enfant de 5-6 ans comprend les consignes audio seul, finit un niveau seul, et **demande à rejouer** le lendemain.
2. **Pipeline validée** : Blender → sprites → app, look et poids tenables (Test A/B/C, voir [12-roadmap.md](12-roadmap.md)).
3. Ensuite seulement : rétention J7/J30 des familles beta, conversion parent (selon business model retenu), progression pédagogique mesurée.

⚠️ **Mise en garde** : l'ordre est volontaire. Tant que le point 1 n'est pas prouvé avec de vrais enfants, aucune autre métrique n'a de sens — c'est le risque n°1 du projet (une app « en autonomie » où l'enfant décroche ou ne comprend pas la consigne est morte, quelle que soit sa qualité technique).

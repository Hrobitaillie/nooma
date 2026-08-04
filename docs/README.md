# Documentation projet Plouma

> **Plouma** — app tablette d'apprentissage de la lecture (CP, 5-7 ans, France), utilisée par l'enfant en autonomie, guidée par une mascotte étoile en pâte à modeler. Objectif n°1 : **l'enfant ne doit pas se rendre compte qu'il apprend.**

> 💡 **Cette doc se consulte aussi dans le viewer de cadrage** (sidebar, catalogue de fonctionnalités avec chiffrage interactif, commentaires, export PDF) : `npm start` à la racine du repo puis http://localhost:8090/cadrage/viewer/ — voir [`../cadrage/README.md`](../cadrage/README.md).

## Comment lire cette doc

- `../nooma-brief-projet.md` reste la **source de vérité des décisions actées** (DA, mascotte, piliers, nom).
- Chaque fichier ci-dessous marque clairement ce qui est **✅ acté**, **🔶 proposé (à valider ensemble)** et **⚠️ mise en garde**.
- L'ancien `plan-projet.md` a été décomposé dans ces fichiers et ne fait plus foi.

## Sommaire

| # | Fichier | Contenu |
|---|---|---|
| 01 | [vision-et-positionnement.md](01-vision-et-positionnement.md) | Vision, équipe, différenciation, concurrence, proposition de valeur |
| 02 | [pedagogie.md](02-pedagogie.md) | Science de la lecture, typologie complète des exercices, progression CP, rôle de l'orthophoniste |
| 03 | [game-design.md](03-game-design.md) | Boucles de jeu, carte-monde, modes de jeu, stealth learning, motivation, éthique |
| 04 | [progression-adaptative.md](04-progression-adaptative.md) | **Niveaux infinis générés**, modèle de compétences, biomes/univers, niveaux surprises et rappels espacés |
| 05 | [direction-artistique.md](05-direction-artistique.md) | DA pâte à modeler, pipeline Blender, audio, mascotte (synthèse + renvois au brief) |
| 06 | [architecture-technique.md](06-architecture-technique.md) | Choix de stack (comparatif), architecture app, données, moteur de mini-jeux |
| 07 | [securite-vie-privee.md](07-securite-vie-privee.md) | RGPD enfants, COPPA, sécurité app, PIN parent, minimisation des données |
| 08 | [performances.md](08-performances.md) | Budgets poids/mémoire/latence, tablettes bas de gamme, chargement, batterie |
| 09 | [business-model.md](09-business-model.md) | Options de monétisation, prix, marché, financements, structure juridique |
| 10 | [marketing-communication.md](10-marketing-communication.md) | ASO, stores, canaux d'acquisition, presse, rôle de l'orthophoniste dans la com |
| 11 | [conformite-stores.md](11-conformite-stores.md) | Apple Kids Category, Google Play Families, checklist de conformité |
| 12 | [roadmap.md](12-roadmap.md) | Phases de production, jalons, risques |
| 13 | [decisions.md](13-decisions.md) | Journal des décisions + questions ouvertes à trancher |
| 14 | [production-3d-blender.md](14-production-3d-blender.md) | Pipeline 3D complet : Clay Doh/Cycles, studio, modelage, rendu, automatisation → app |
| 15 | [production-cartes.md](15-production-cartes.md) | Cartes de biome de zéro à jouable : kit d'assets (dalles, décals, props, eau, chemin), atlas, JSON biome/motifs, cartographe Flame |
| 16 | [habillage-props.md](16-habillage-props.md) | Habillage des props de gameplay/UI : architecture « skin » avec fallback placeholder, inventaire des props, rendus Blender (caméra, couleur variable), branchement Flutter au fil de l'eau |
| 17 | [modes-et-mecaniques.md](17-modes-et-mecaniques.md) | **Document de relecture** : modes de jeu (décisions 30/07) + les 19 mécaniques en fiches (déroulé, difficulté, erreur, test du brocoli, ancrage programme CP) — à annoter par l'orthophoniste |
| 18 | [mise-en-ligne-et-studio.md](18-mise-en-ligne-et-studio.md) | **Plan de mise en ligne de l'outillage** (viewer, admin contenu) + **studio d'enregistrement** pour l'orthophoniste : phases, registre des lignes de texte, modèle lots → items → prises, pipeline audio → app, sécurité/RGPD (voix) |
| — | [ressources-youtube.md](ressources-youtube.md) | Mots-clés YouTube pour apprendre la pipeline Blender → app |

## Rappel des fondamentaux actés ✅

- Cible : 5-7 ans (CP), enfant **seul en autonomie**, tablette prioritaire, portrait
- Consignes **100 % audio**, jamais de texte comme seule instruction
- Feedback **jamais négatif**, pas de scores anxiogènes, difficulté adaptative invisible
- Mascotte **Plouma** : étoile dorée en pâte à modeler, babillage → français évolutif
- DA **100 % claymation pré-rendue Blender**, intégrée en sprites/images 2D
- **Fondateur solo** (développeur fullstack) épaulé par une **orthophoniste en conseil métier** (amie proche — pas d'association ni de parts)

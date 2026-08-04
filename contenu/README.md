# Contenu pédagogique (données versionnées)

Principe (doc 06 §2) : **le contenu est de la donnée, jamais du code**. Ce dossier est la
source de vérité pédagogique du projet — c'est lui que relit l'orthophoniste, lui que
consomme le simulateur aujourd'hui et l'app Flutter demain.

| Fichier | Rôle |
|---|---|
| `graphe-competences.json` | Le graphe v1 : 4 piliers → 12 modules (= biomes) → 47 compétences (prérequis, mécaniques, graphèmes introduits, difficulté) |
| `graphe-competences.md` | **Vue de relecture générée** (ne pas éditer) — lisible dans le viewer |
| `mecaniques.json` | Les 19 mécaniques actées (liste canonique référencée partout) |
| `banques/syllabes.csv` | Banque du module Syllabes : 100 mots imagés tagués (syllabes orales, découpage, attaque, fréquence, distracteurs) |
| *(dashboard)* | **Relecture et visualisation des banques** = vues natives de l’atelier : <http://localhost:8090/#/relecture> et <http://localhost:8090/#/banque> (en ligne : plouma.justhugo.fr) |
| `lint.mjs` | Validation : ids, prérequis (existence, ordre des modules, cycles), mécaniques, cohérence des banques — `npm run lint-contenu` |

## Processus de relecture (Florence)

1. Hugo produit/modifie les mots dans la vue **Relecture** de l'atelier (<http://localhost:8090/#/relecture>) ou directement dans les CSV (tableur, séparateur `;`). Toute création/modification passe le mot en statut `a-relire`.
2. `npm run lint-contenu` valide tout et régénère `graphe-competences.md`.
3. La relecture se fait dans le **mode correction** de l'admin : un mot à la fois, « ✓ c'est juste » (→ `valide`, ne réapparaît plus) ou « ✗ à corriger » (correction inline → `valide`). Les `aVerifier` passent en premier (découpages à arbitrer — e caduc : « ba-nane » vs « ba-na-ne » — convention actuelle : **syllabes orales**). Relire **par lots, pas au fil de l'eau** (doc 02 §7).
4. Re-lint → le simulateur tourne sur le contenu corrigé.

## Conventions

- **Le son du graphème, jamais le nom de la lettre** (Dehaene) — vaut pour tous les libellés.
- Graphèmes complexes = **unités insécables** (« ch » est UNE pièce dans la machine à mots).
- Paires confusables **séparées dans le temps puis confrontées** : b introduit au Village, d au Marais, confrontation b/d au Marais (module `sons-proches`).
- Un prérequis ne peut jamais pointer vers un module postérieur (vérifié par le lint).
- Mots-outils irréguliers appris par cœur et présentés comme tels (module `premiers-mots`).

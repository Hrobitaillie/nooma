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
| `lint.mjs` | Validation : ids, prérequis (existence, ordre des modules, cycles), mécaniques, cohérence des banques — `npm run lint-contenu` |

## Processus de relecture (Florence)

1. Hugo produit/modifie le JSON et les CSV (les CSV s'ouvrent dans un tableur, séparateur `;`).
2. `npm run lint-contenu` valide tout et régénère `graphe-competences.md`.
3. Florence relit la vue `.md` (ou le CSV en tableur) **par lots, pas au fil de l'eau** (doc 02 §7) ; la colonne `aVerifier` de la banque marque les découpages syllabiques à arbitrer (e caduc : « ba-nane » vs « ba-na-ne » — convention actuelle : **syllabes orales**).
4. Ses corrections reviennent dans les fichiers → re-lint → le simulateur tourne sur le graphe corrigé.

## Conventions

- **Le son du graphème, jamais le nom de la lettre** (Dehaene) — vaut pour tous les libellés.
- Graphèmes complexes = **unités insécables** (« ch » est UNE pièce dans la machine à mots).
- Paires confusables **séparées dans le temps puis confrontées** : b introduit au Village, d au Marais, confrontation b/d au Marais (module `sons-proches`).
- Un prérequis ne peut jamais pointer vers un module postérieur (vérifié par le lint).
- Mots-outils irréguliers appris par cœur et présentés comme tels (module `premiers-mots`).

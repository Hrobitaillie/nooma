# Simulateur du Directeur

Spéc exécutable du moteur adaptatif de Plouma (doc 04 §8, doc 06 §4) : des **enfants
virtuels** jouent contre le **Directeur** pour éprouver statistiquement les paramètres
pédagogiques pré-validés le 30/07/2026 — avant d'écrire une ligne de l'app.

```
npm run sim                                  # 500 enfants × 24 semaines
npm run sim -- --enfants 2000 --semaines 30 --seed nooma
```

Résultats : console + `out/results.json` → dashboard sur
<http://localhost:8090/#/simulateur> (vue native du dashboard de l’atelier, `npm start`).

## Ce qui est vérifié

1. **Taux de réussite ~80-85 %** (doc 02 §5.1) — global et par profil.
2. **Sortie de biome** : nombre de niveaux et de jours avant validation d'un module.
3. **Part de révision** (échos + rêves) ≈ 20-30 % (doc 02 §5.4).
4. **Garde-fous codés en dur** : jamais de saut de difficulté > 1 cran, jamais 2× la même
   mécanique d'affilée ni > 2×/session (docs 04 §4, §6.3) — doit rester à zéro.
5. **Pas de tapis roulant silencieux** : tout enfant coincé (> 60 niveaux dans un biome)
   déclenche un signal discret côté parent (doc 04 §2 risque 2).

## Architecture

```
core/     le Directeur pur, sans UI — c'est LUI qui sera porté en Dart
  params.ts     tous les paramètres ajustables (α, seuils, Leitner, mix…)
  graphe.ts     charge le vrai graphe depuis /contenu (12 modules, 47 compétences)
  maitrise.ts   moyenne glissante pondérée + décroissance + règles de validation
  directeur.ts  session-menu, zone proximale, échos/rêves/cadeaux/défis,
                pré-validation de module, stagnation
sim/      le banc d'essai — ne sera PAS porté
  enfants.ts    modèle latent (apprentissage, oubli, bruit) que le Directeur ne voit jamais
  run.ts        N enfants × M semaines → agrégats + verdicts
dashboard/  visualisation zéro-dépendance des résultats
```

Déterministe : même seed ⇒ même simulation (exigence de reproductibilité du doc 04 §8).
TypeScript exécuté par Node ≥ 22.6 (`--experimental-strip-types`), zéro dépendance.

## Rôle dans le projet

- Aujourd'hui : **régler les paramètres** de `core/params.ts` sur données simulées, puis
  faire arbitrer les valeurs par l'orthophoniste.
- Après le Test A : le `core/` est **porté en Dart** (lib pure du Directeur, doc 06 §4) ;
  ce simulateur devient l'**oracle de non-régression** — mêmes entrées, mêmes sorties
  attendues des deux côtés.

## Limites assumées

- Le graphe vient du vrai contenu (`/contenu`, v1 à relire par l'orthophoniste), mais le
  **modèle d'enfant est synthétique** : les chiffres absolus n'ont pas valeur de
  prédiction — seuls les ordres de grandeur et les comportements du moteur (adaptation,
  rappels, protections) sont significatifs.
- Les items ne sont pas modélisés individuellement (pas de banque de mots) : la règle
  « 100 % déchiffrable » est garantie par construction ici, elle sera une assertion testée
  côté Dart.

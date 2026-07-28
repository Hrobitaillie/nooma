# Cadrage Nooma — viewer et catalogue de fonctionnalités

Espace de cadrage du projet, fusion de deux outils Pilot'in :
le **viewer de documentation** de `locasyst-api` (MDX, commentaires,
estimations, export PDF) et l'approche **dossier de cadrage** de `flooow`
(docs en markdown, arbre de navigation). L'édition multi-sessions de flooow
n'a pas été reprise (assumé).

## Contenu

```
cadrage/
  viewer/       l'app de consultation (Preact + MDX + marked, zéro build, CDN)
  catalogue/    le catalogue de fonctionnalités Nooma (.mdx, IDs, lots, chiffrage)
  ../docs/      la documentation projet (.md) — servie par le même viewer
```

Deux espaces dans le viewer (boutons en haut de la sidebar) :

- **Catalogue** : la décomposition fonctionnelle de l'app (SOC/MAP/JEU/DIR/MAS/
  REC/MOD/PAR/AUD/CNT/LAN), avec estimation interactive par poste, lots de
  chiffrage (Prototype / V1 / V1.1 / V2+) et totaux ([chiffrage](catalogue/chiffrage.mdx)).
  Export PDF disponible.
- **Docs projet** : les 14 documents de `/docs` rendus tels quels (markdown).

## Lancer

Depuis la **racine du repo** (Node ≥ 18, aucune dépendance à installer) :

```bash
npm start
# → http://localhost:8090/cadrage/viewer/   (la racine / redirige aussi dessus)
```

Le serveur (`cadrage/server.mjs`, Node pur) sert les fichiers ET fait vivre les
endpoints `comments.php` / `estimations.php` (noms hérités du viewer locasyst,
mais c'est Node qui répond — PHP n'est pas requis). Annotations et chiffrage
sont persistés dans `viewer/comments.json` / `viewer/estimations.json`,
versionnés avec le repo. Port configurable : `PORT=3000 npm start`.

Alternatives équivalentes : `php -S localhost:8090` (les .php d'origine sont
conservés) ; ou n'importe quel serveur statique, mais alors commentaires et
estimations ne sont pas sauvegardés.

## Flooow (cadrage visuel) — aussi dans ce repo

L'app **Flooow** complète (canvas de frames/nœuds, vues Specs et API dérivées)
vit dans [`../flooow/`](../flooow/), avec un projet Nooma seedé
(`flooow/data/nooma/nooma-project.graph.json`, **versionné** — le reste de
`data/` est ignoré). Lancement, depuis la racine du repo :

```bash
npm run flooow
# → front : http://localhost:5173/  ·  API/Yjs : port 3011
```

Installation (une fois) : `npx pnpm@9 install` dans `flooow/` puis
`npm install` dans `flooow/app/`. Le script `flooow/scripts/dev-local.sh`
remplace le `dev.sh` d'origine (qui suppose l'infra podman/Caddy de Pilot'in).

Rôles complémentaires : **Flooow = le graphe visuel des écrans/comportements**
(arborescence, liens, specs) ; **le viewer ci-dessous = la référence texte**
(catalogue chiffrable, docs). Le graphe seed reprend les écrans du catalogue
(carte-monde, vue biome, mini-jeu, maison, espace parent…) — à faire vivre dans
Flooow directement.

## Fonctions du viewer

- **Commentaires** : bouton 💬 → sélectionner du texte → fil de commentaire
  ancré ; récap dans le panneau droit. Pratique pour les relectures de Florence.
- **Estimations** : cliquer la puce `Est.` d'un poste → saisir (`2j`, `3h`,
  options multiples avec lots) ; totaux par fichier et globaux automatiques.
- **PDF** : bouton d'export sur l'espace Catalogue (cover, sommaire, pagination).

## Maintenance

- Ajouter une page : créer le fichier dans `catalogue/` (`.mdx`) ou `../docs/`
  (`.md`), puis l'ajouter à l'arbre correspondant dans `viewer/tree.js`.
- Les `.orig` dans `viewer/` sont les fichiers d'origine (locasyst) avant
  adaptation — supprimables quand l'outil sera rodé.
- Le logo/les polices PDF sont hérités de Pilot'in (assets/) — à remplacer par
  la marque Nooma quand le nom sera déposé.

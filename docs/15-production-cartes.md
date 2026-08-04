# 15 — Production des cartes de biome : de zéro à la carte jouable

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Document de travail (Hugo). Décisions de la session de cadrage du 04/08/2026 : **caméra orthographique 3/4**, **terrain continu** (pas d'îlots flottants), **kit d'assets composés à la volée** dans l'app (pas de grande carte peinte), **motifs/chunks** enchaînés par un générateur seedé. Complète [14-production-3d-blender.md](14-production-3d-blender.md) (pipeline 3D général) et [05-direction-artistique.md](05-direction-artistique.md) §6 (décision caméra).

## 1. Vue d'ensemble : on produit des PIÈCES, l'app compose ✅

```
   BLENDER (studio_carte.blend)          OUTILLAGE                    APP (Flutter/Flame)
┌─────────────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────────┐
│ dalles de sol tuilables     │   │ LibGDX TexturePacker │   │  /contenu/biomes/prairie.json │
│ décals anti-répétition      │──▶│  PNG → pages 2048²   │──▶│        ▼                     │
│ props (arbres, rochers…)    │   │  → cwebp lossless    │   │  CARTOGRAPHE (lib pure)      │
│ eau (mares, ruisseaux)      │   │  → .atlas + .webp    │   │  spline seedée + motifs      │
│ segments de chemin          │   └──────────────────────┘   │  + semis déterministe        │
│ vie ambiante (sprite sheets)│                              │        ▼                     │
│ nœuds de niveau             │        flame_texturepacker   │  RENDU FLAME (couches 1→6,   │
└─────────────────────────────┘                              │  tri en Y, caméra, parallax) │
                                                             └──────────────────────────────┘
```

**Philosophie.** Le chemin est infini (généré par le Directeur, [04-progression-adaptative.md](04-progression-adaptative.md) §4-6), donc la carte doit être infinie aussi — impossible avec une carte peinte de taille fixe. On produit donc un **kit de pièces** rendues une fois pour toutes dans Blender, et l'app les **compose à la volée**, de façon **déterministe par seed** : infini à coût de production borné, cohérent avec toute l'architecture du projet (générateur seedé, contenu = données, doc 06 §2).

Les **6 couches** de composition (de l'arrière vers l'avant) :

1. **Sol** : dalles tuilables sans couture, posées en grille — la plaine herbeuse continue.
2. **Décals** : taches d'herbe sombre, fleurs, cailloux à bords fondus, semés par-dessus le sol pour casser la répétition.
3. **Eau** : mares et ruisseaux = props à berges fondues en alpha, posés comme du décor.
4. **Chemin** : généré au runtime le long d'une spline (trace de terre / dalles de pâte à modeler).
5. **Props triés en Y** : arbres, buissons, rochers, **nœuds de niveau** — le tri en Y donne la profondeur.
6. **Vie ambiante** : oiseaux, papillons animés (sprite sheets), par-dessus tout.

**L'étage anti-monotonie : les motifs (chunks)** ✅. Le générateur n'invente pas des dispositions : il **enchaîne des motifs composés à la main** (un bosquet autour d'une mare, une clairière à deux nœuds, un passage de ruisseau…), décrits en données avec leurs positions relatives, leurs emplacements de nœuds et leurs points d'entrée/sortie. Le procédural choisit et raccorde ; l'humain compose. C'est la même parade que « templates validés à la main » côté Directeur (doc 04 §2, risque 3).

**Références artistiques** (à garder ouvertes en modelant) :
- Les cartes de **Clash Quest** (Supercell, la réf assumée — mais nous en **sol continu**, pas en îlots) : les [assets extraits du jeu](https://github.com/Statscell/clash-quest-assets) (dossier `islands/` : regarder comment chaque île est un kit sol + props) et le studio [Ocellus](https://ocellusart.artstation.com/) qui a produit une partie de l'art du jeu.
- Les **saga maps** : le [Candy Crush Saga Map Art Overhaul de Kenneth Lim](https://kleeam.artstation.com/projects/L3lDBv) (comment un chemin de nœuds vit dans un décor) et les écrans de carte référencés dans la [Game UI Database](https://www.gameuidatabase.com/gameData.php?id=147).
- Le **fait-main assumé** : [Hidden Folks](https://hiddenfolks.com/press) (tout dessiné, scanné, composé en couches dans le moteur — exactement notre logique, en clay au lieu de l'encre ; [making-of dans Edge](https://adriaan.games/images/EdgeMagazine-Issue327-MakingOfHiddenFolks.pdf)) et [Lumino City](https://www.stateofplaygames.com/themakingofluminocity) (décors physiques photographiés puis intégrés — [conférence SIGGRAPH](https://history.siggraph.org/experience/keeping-it-real-the-making-of-lumino-city-by-fountain-and-whittaker/)).

## 2. Étape Blender : le studio carte et les familles d'assets

### 2.1 Le fichier `studio_carte.blend` 🔶 (dérivé du studio général, doc 14 §2)

Tout asset de carte sort de **la même caméra, la même lumière, la même échelle** — c'est la condition pour que des pièces rendues séparément se composent sans se trahir.

**Caméra `cam_carte` (orthographique 3/4)** ✅ décision, 🔶 chiffres :

| Réglage | Valeur proposée | Pourquoi |
|---|---|---|
| Type | **Orthographic** ([doc Blender : Cameras](https://docs.blender.org/manual/en/latest/render/cameras.html)) | Même angle de vue partout dans le cadre → le scroll est cohérent par construction (doc 05 §6) |
| Rotation | **X = 60°, Y = 0°, Z = 0°** | = inclinée de 30° au-dessus du sol (dans la fourchette 30-45° actée). Z = 0 (pas de lacet) : une dalle carrée se projette en **rectangle**, pas en losange → grille de sol triviale, props vus de face |
| Compression verticale | cos(60°) = **0,5** → ratio **2:1** | 1 m de profondeur au sol = 0,5 m à l'écran — le ratio classique des jeux 3/4, lisible et facile à raisonner |
| Échelle | **1 unité Blender = 1 m** ; **Orthographic Scale = largeur cadrée en m** | L'« Orthographic Scale » est la largeur de la vue en unités monde ([réf.](https://docs.blender.org/manual/en/latest/render/cameras.html)) |
| Densité | **128 px/m à l'horizontale** (donc 64 px/m au sol en vertical) | Calé sur les écrans réels des tablettes cibles (1280×800, doc 08 §3) avec marge de zoom ×1,5-2 |
| Film | **Transparent** pour tout asset ([doc Blender : Film](https://docs.blender.org/manual/en/latest/render/cycles/render_settings/film.html)), sortie PNG RGBA | Fond alpha propre, composition dans l'app |

⚠️ **La caméra ne bouge JAMAIS en rotation** — seulement en translation (recadrer un asset) et en Orthographic Scale (cadrer sa taille). Toute rotation différente = un asset qui « penche » par rapport aux autres, irrécupérable.

**Lumière** : la key light du studio (doc 14 §2), avec une **direction figée une fois pour toutes** — proposée 🔶 : venant du **haut-gauche** (convention lisible, les ombres partent en bas-droite). L'angle de la key détermine la direction de **toutes** les ombres au sol : deux assets éclairés différemment posés côte à côte se dénoncent immédiatement (piège n°2, §7).

**Aides intégrées au fichier** : une grille au sol de 1 m (overlay), un **gabarit de dalle 4×4 m**, et un plan « échelle humaine » (silhouette de Plouma ~0,6 m) pour caler la taille relative de chaque prop.

Tutos vérifiés pour ce setup : [Creating Orthographic Tiles in Blender (GameFromScratch)](https://gamefromscratch.com/creating-orthographic-tiles-in-blender/) et le classique [Isometric Tiles in Blender (Clint Bellanger)](https://clintbellanger.net/articles/isometric_tiles/) (pré-rendu de tuiles pour jeu 2D — notre cas exact, angle près).

### 2.2 Famille 1 — Dalles de sol tuilables (la fondation) 🔶

Objectif : **3-4 variantes** de dalle d'herbe de **4×4 m** (→ 512×256 px à l'écran) qui se raccordent **dans les deux axes, entre toutes les variantes**.

Méthode (« sculpter au centre d'une grille 3×3 ») :

1. Plane 4×4 m subdivisé, matériau clay herbe du studio (doc 14 §2), micro-displacement / sculpt léger pour le relief pâte à modeler.
2. Le relief et la texture doivent **se répéter sans couture** : utiliser des textures procédurales périodiques ou une texture image seamless, et vérifier que la géométrie sculptée « wrappe » (les bords opposés ont le même profil). Techniques et pièges : [How To Repeat A Texture Pattern Without Seams (Blender Base Camp)](https://www.blenderbasecamp.com/how-to-repeat-a-texture-pattern-on-the-objects-surface-without-seams/), [Better Tiling Textures (YouTube)](https://www.youtube.com/watch?v=3G8SuMFe7JI).
3. **Astuce clé** : instancier la dalle en **3×3** (modificateur Array X puis Y) et sculpter/ajuster **la tuile centrale en regardant les 9** — toute couture saute aux yeux pendant qu'on travaille, pas après.
4. **Cadrage exact** : caméra centrée sur la dalle centrale, Orthographic Scale = 4 (la largeur de la dalle), résolution de rendu **512×256**. Zéro marge : le bord du pixel = le bord de la dalle. C'est le point le plus délicat — un cadrage à ±1 px = couture visible en grille (§7).
5. **Variantes** : dupliquer la dalle validée et ne modifier que **l'intérieur** — les bandes de bord (~0,5 m) restent **identiques entre variantes**, condition pour poser les variantes en damier aléatoire.
6. **Test obligatoire** avant d'accepter une dalle : monter une grille **3×3 mélangeant les variantes** dans un éditeur d'image (ou un script ImageMagick `montage`) et scruter les raccords à 200 %.

⚠️ La dalle est rendue **sans ombre portée d'objet** (elle n'en a pas : elle est le sol). L'ombrage doux du relief (self-shadowing de la key) fait partie de la texture et se raccorde comme le reste.

### 2.3 Famille 2 — Décals anti-répétition 🔶

Des **plans posés à plat** sur le sol : plaques d'herbe plus sombre, parterres de fleurs, terre, cailloux épars. Rendus comme les dalles (même caméra) mais **cadrés avec marge** et surtout **à bords fondus en alpha** : le masque du matériau (texture noise ou vertex paint) fait mourir la matière en dégradé avant le bord du cadre — aucun bord dur, donc posables n'importe où sur n'importe quelle dalle. C'est **eux** qui cassent la répétition de la grille, pas la multiplication des variantes de dalles (levier bien plus économique). 4-6 décals de 2 tailles (~1-2 m et ~3-4 m) suffisent pour une v1.

### 2.4 Famille 3 — Props avec ombre au sol 🔶

Arbres, buissons, rochers, souches, champignons-nœuds… Les règles :

- **Un prop = un PNG transparent** qui embarque **son ombre portée au sol** : ajouter sous le prop un plan avec la propriété Cycles **Shadow Catcher** — le rendu ne contient que l'objet + son ombre en alpha, qui se composera sur n'importe quelle dalle. Ombre cohérente garantie puisque la key du studio ne bouge pas.
- **Ancre au sol** : par convention, le **point de contact au sol du prop est au centre-bas du cadre** (documenté dans le JSON par `ancre: [0.5, 0.94]` si l'ombre dépasse sous le pied). C'est cette ancre que le cartographe pose sur la carte et qui sert au tri en Y (§5).
- Tailles indicatives (128 px/m, doc 08 §8 en tête) : arbre ~3-4 m → **512-640 px de haut** ; buisson/rocher ~1 m → **~192-256 px** ; champignon-nœud ~1,2 m → **~256 px**.
- **Silhouette d'abord** (doc 14 §3) : un arbre doit rester un arbre en 150 px sur la tablette de référence.
- **Nœuds de niveau** : le champignon-nœud existe en **3 états** (à venir / actif / terminé). 🔶 Piste éco : un seul rendu neutre + teinte/glow appliqués dans l'app (`Paint.colorFilter`), à valider visuellement — sinon 3 rendus.

### 2.5 Famille 4 — Eau : mares et ruisseaux à berges fondues 🔶

Le terrain étant continu, l'eau est un **prop posé sur l'herbe**, pas un trou dans le sol :

- **Mare** = un plan d'eau clay (bleu lagon de la palette, doc 05 §3) entouré d'une **berge modelée** (bourrelet de terre/herbe) dont l'extérieur **meurt en alpha fondu** comme un décal — la mare se pose sur n'importe quelle dalle sans couture. Rendu avec marge, ~3-5 m.
- **Ruisseau** 🔶 (post-Test A) : segments droits + courbes à bords fondus latéraux, raccordables bout à bout comme le chemin.
- **Animation** : l'eau clay n'a pas besoin de vagues — un **scintillement** en sprite sheet de 4-8 frames (offset lent de la normal map du matériau entre frames, rendu du même cadre) suffit ; en v1 une mare **statique** est acceptable.

### 2.6 Famille 5 — Chemin (segments pour le runtime) 🔶

Le chemin est **généré dans l'app** le long d'une spline (§5.2) ; Blender ne produit que les pièces :

- **Dalles de pâte** (façon pas japonais) : 3-4 galettes rondes/ovales clay (~0,6-0,8 m → ~96-128 px), avec ombre au sol (shadow catcher). Le cartographe les égrène le long de la spline — une courbe se fait toute seule, **aucun segment courbe à produire**. C'est l'option recommandée : zéro problème de raccord.
- 🔶 Alternative « trace de terre continue » : bandes droites + courbes à bords fondus — plus de travail de raccord, à ne tenter que si les galettes déçoivent visuellement.
- Le **bout du chemin** (là où ça « pousse », doc 04 §6.1) : une pièce « fin de sentier » (terre qui s'effile) + à terme la sprite sheet de pousse (nice-to-have acté non bloquant).

### 2.7 Famille 6 — Vie ambiante animée 🔶

Oiseaux et papillons : sprite sheets courtes (6-12 frames, 12-15 fps, doc 05 §4), petits cadres (~96-128 px), 2-3 espèces par biome. Rendus au même angle et à la même lumière (un papillon éclairé d'ailleurs se voit aussi). Produits **en dernier** — c'est la cerise, pas le socle.

### 2.8 Rendu headless et conventions ✅ (rappel doc 14 §6)

Chaque famille se régénère **en une commande** ([doc Blender : Rendering from the Command Line](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html)) :

```bash
# une image (frame 1 = l'asset) :
blender -b sol_prairie.blend -o //out/sol_herbe_a_#### -f 1
# une sprite sheet (clip d'animation) :
blender -b oiseau_prairie.blend -o //out/oiseau_vol_#### -a
```

⚠️ Ordre des arguments : `-o` **avant** `-f`/`-a` (ils s'exécutent dans l'ordre). Nommage : `biome-prairie/sol_herbe_a`, `biome-prairie/prop_arbre_01`, `biome-prairie/chemin_galette_02`… (convention doc 14 §6 — les scripts et l'app s'y fient). Un `Makefile` par biome ; sources .blend hors Git, archivées B2 (doc 06 §6).

## 3. Étape atlas : TexturePacker → WebP → flame_texturepacker ✅ outillage, 🔶 réglages

### 3.1 Packing (LibGDX TexturePacker)

Outil acté (doc 06 §6) : [LibGDX TexturePacker](https://libgdx.com/wiki/tools/texture-packer) (gratuit, CLI). Invocation :

```bash
java -cp runnable-texturepacker.jar com.badlogic.gdx.tools.texturepacker.TexturePacker \
     rendus/biome-prairie assets/atlas biome-prairie
```

Réglages via `pack.json` dans le dossier d'entrée — les nôtres 🔶 :

```json
{
  "maxWidth": 2048, "maxHeight": 2048,
  "paddingX": 4, "paddingY": 4,
  "bleed": true,
  "filterMin": "Linear", "filterMag": "Linear",
  "stripWhitespaceX": true, "stripWhitespaceY": true
}
```

- `maxWidth/Height` **2048** : budget mémoire GPU (un atlas 2048² = 16 Mio décodés, doc 08 §3).
- `paddingX/Y` **4** (défaut 2) : marge anti-texture-bleeding, on prend large car la carte **zoome** (le bleeding apparaît au filtrage bilinéaire sous zoom).
- `bleed` : dilate les couleurs sous l'alpha — supprime les **halos sombres** sur les contours (le « fond transparent propre » de la checklist doc 14 §7).
- `stripWhitespace` : rogne le vide autour des props (l'`offset` est conservé dans le `.atlas`, la taille d'origine est restituée au chargement).

Sortie : des pages PNG + un fichier texte `.atlas` qui décrit chaque région (`xy`, `size`, `orig`, `offset`, `index` — les frames `_0001, _0002…` deviennent une animation indexée).

### 3.2 Conversion WebP

⚠️ TexturePacker sort du **PNG** ; l'étape WebP est à nous (doc 06 §6 : atlas WebP lossless) avec [cwebp](https://developers.google.com/speed/webp/docs/cwebp) :

```bash
cwebp -lossless biome-prairie.png -o biome-prairie.webp   # sprites : lossless obligatoire
cwebp -q 85 fond_parallax.png -o fond_parallax.webp       # décors pleine image sans alpha découpé
sed -i '' 's/\.png$/.webp/' biome-prairie.atlas            # le .atlas pointe vers la page webp
```

**Lossless pour tout atlas de sprites** (le lossy crée des franges sur les contours alpha — vérifié doc 06 §6) ; le **lossy ~q85** est réservé aux grandes images de fond sans découpe alpha (couches parallax lointaines). Le script de packing enchaîne les trois commandes + la vérif budgets (taille ≤ 2048², poids vs doc 08 §8).

### 3.3 Chargement dans l'app

Package officiel acté : [flame_texturepacker](https://pub.dev/packages/flame_texturepacker) (v5.1.2 vérifiée en ligne, activement maintenu) :

```dart
final atlas = await TexturePackerAtlas.load('atlas/biome-prairie.atlas');
final arbre = atlas.findSpriteByName('prop_arbre_01');
final vol   = atlas.getAnimation('oiseau_vol', stepTime: 1 / 12);
```

**Confort de dev** ✅ : `TexturePackerAtlas.load(..., fromStorage: true)` charge depuis le système de fichiers → on itère sur les rendus Blender **sans rebuild** de l'app (doc 06 §6). Déchargement par biome au changement de monde (`Images.clear()`, doc 08 §3).

## 4. Étape données : le JSON de biome et ses motifs 🔶

### 4.1 Où ça vit

Dans `/contenu` (le contenu est de la donnée, doc 06 §2) : `contenu/biomes/prairie.json`, validé par extension de `contenu/lint.mjs` (`npm run lint-contenu`). Le lint vérifie : module existant dans le graphe, sprites référencés présents dans le `.atlas`, motifs raccordables (au moins un point d'entrée ET de sortie chacun, largeurs compatibles), densités dans [0,1], palette en hex valide, ≥ 1 emplacement de nœud par motif « à nœud ».

### 4.2 Schéma proposé (exemple complet « Prairie »)

Unités : **mètres monde** (le cartographe convertit en px via `pxParMetre`). `y` croît vers le **haut de la carte** (sens de progression). Positions des motifs **relatives à leur point d'entrée**.

```jsonc
{
  "id": "biome-prairie",
  "module": "syllabes",                     // ← graphe-competences.json (la Prairie « est » le module Syllabes)
  "atlas": "atlas/biome-prairie.atlas",
  "pxParMetre": 128,                        // horizontal ; vertical sol = 64 (ratio 2:1)
  "palette": { "sol": "#8FBF6A", "eau": "#7EC8D8", "chemin": "#C9A176", "accent": "#F2C14E" },

  "sol": {
    "dalle": { "tailleM": 4, "variantes": ["sol_herbe_a", "sol_herbe_b", "sol_herbe_c"] },
    "decals": [
      { "sprite": "decal_herbe_sombre", "tailleM": 3.5, "densite": 0.35 },
      { "sprite": "decal_fleurs",       "tailleM": 1.5, "densite": 0.20 },
      { "sprite": "decal_terre",        "tailleM": 2.0, "densite": 0.10 }
    ]                                        // densite = probabilité d'apparition par cellule de semis (§5.3)
  },

  "chemin": {
    "style": "galettes",
    "sprites": ["chemin_galette_01", "chemin_galette_02", "chemin_galette_03"],
    "espacementM": 0.9, "jitterM": 0.12,     // écart le long de la spline + bruit de pose
    "largeurExclusionM": 1.6                 // couloir sans prop autour de la spline
  },

  "props": [
    { "id": "arbre",    "sprites": ["prop_arbre_01", "prop_arbre_02"], "ancre": [0.5, 0.94], "rayonM": 1.2, "densite": 0.30 },
    { "id": "buisson",  "sprites": ["prop_buisson_01"],                "ancre": [0.5, 0.90], "rayonM": 0.6, "densite": 0.40 },
    { "id": "rocher",   "sprites": ["prop_rocher_01"],                 "ancre": [0.5, 0.88], "rayonM": 0.5, "densite": 0.15 }
  ],
  "noeud": { "sprite": "prop_champignon", "ancre": [0.5, 0.92], "rayonM": 0.9 },

  "eau": [ { "id": "mare", "sprite": "eau_mare_01", "ancre": [0.5, 0.5], "rayonM": 2.2 } ],

  "vie": [
    { "sprite": "oiseau_vol",    "frames": 8,  "fps": 12, "frequenceParMin": 1.5 },
    { "sprite": "papillon_battement", "frames": 6, "fps": 12, "frequenceParMin": 3.0 }
  ],

  "regles": {
    "largeurCarteM": 10,                     // bande jouable ; le sol déborde d'1 écran de chaque côté
    "amplitudeSplineM": 2.5,                 // serpentement max du chemin autour de l'axe central
    "distanceEntreNoeudsM": [5, 8],
    "antiRepetition": { "memoireMotifs": 2, "memoireVariantesDalle": 1 }   // jamais 2 fois le même motif d'affilée (cf. doc 04 §6.3)
  },

  "motifs": [
    {
      "id": "clairiere-simple",              // le motif « pain quotidien » : un nœud dans l'herbe
      "poids": 3,                            // fréquence relative de tirage
      "hauteurM": 6,
      "entree": [0, 0], "sortie": [0.5, 6],  // points de raccord de la spline (x relatif à l'axe, y relatif au motif)
      "noeuds": [ { "pos": [0.5, 3] } ],
      "props": [
        { "id": "arbre",   "pos": [-3.5, 2] },
        { "id": "buisson", "pos": [2.8, 4.5] }
      ],
      "semisLibre": true                     // le cartographe complète par semis déterministe (§5.3)
    },
    {
      "id": "mare-aux-oiseaux",              // le motif « signature » : contourner la mare
      "poids": 1,
      "hauteurM": 9,
      "entree": [0.5, 0], "sortie": [-0.5, 9],
      "noeuds": [ { "pos": [-1.5, 5] } ],
      "eau":   [ { "id": "mare", "pos": [2, 4.5] } ],
      "props": [
        { "id": "arbre", "pos": [3.8, 6.5] }, { "id": "arbre", "pos": [-3.6, 7.5] },
        { "id": "rocher", "pos": [0.5, 2] }
      ],
      "semisLibre": false                    // composé main : pas de semis par-dessus
    },
    {
      "id": "bosquet-double",                // 2 nœuds rapprochés sous les arbres (session dense)
      "poids": 2,
      "hauteurM": 10,
      "entree": [-0.5, 0], "sortie": [0, 10],
      "noeuds": [ { "pos": [0, 3] }, { "pos": [0.8, 7.5] } ],
      "props": [
        { "id": "arbre", "pos": [-2.8, 1.5] }, { "id": "arbre", "pos": [3.2, 4] },
        { "id": "arbre", "pos": [-3.4, 8] },   { "id": "buisson", "pos": [1.8, 5.5] }
      ],
      "semisLibre": true
    }
  ]
}
```

⚠️ Ce schéma est le **contrat cartographe ↔ contenu** : toute évolution passe par le lint ET par une version (`"version": 1`) — le cartographe refuse un JSON d'une version inconnue.

## 5. Étape app : le module « cartographe » 🔶

### 5.1 Une lib pure, comme le Directeur

`carteChunk(biome, seedCarte, indexChunk) → ChunkSpec` : entrées = JSON de biome + seed + index du tronçon ; sortie = liste de poses `(sprite, x, y, couche)` + spline + ancres de nœuds. **Aucune dépendance Flame** → testable par propriétés (« même seed ⇒ même carte », « aucun prop dans le couloir du chemin », « nœuds espacés dans la fourchette »), exactement comme le Directeur (doc 06 §4). Seeds hiérarchiques (doc 06 §4) : `seedMotifs`, `seedSpline`, `seedSemis` séparés — ajouter un décal ne déplace pas les arbres.

### 5.2 La spline du chemin

- Le générateur enchaîne les **motifs** : tirage pondéré (`poids`) filtré par l'anti-répétition (`memoireMotifs`), puis **raccord sortie → entrée** (translation du motif suivant pour que son point d'entrée coïncide avec la sortie du précédent).
- Les points de contrôle = entrées/sorties + nœuds des motifs, avec un jitter borné (`amplitudeSplineM`). Interpolation en **spline de Catmull-Rom centripète** — passe par les points de contrôle (contrairement à Bézier) et **garantit ni boucle ni rebroussement** entre points ([Wikipedia : Centripetal Catmull–Rom spline](https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline)) : le sentier serpente, ne fait jamais de nœud.
- Les **galettes de chemin** sont égrenées par abscisse curviligne (`espacementM` + `jitterM`, variante tirée au seed).

### 5.3 Le semis de décor déterministe

Pour les zones `semisLibre` (et les décals partout) : semis en **grille jitterée** (une cellule de 2×2 m → tirage `densite` → pose au point jitteré de la cellule) — déterministe, trivial, suffisant en v1. 🔶 Si la grille se voit, passer au **Poisson-disc (algorithme de Bridson)** : distribution naturelle à distance minimale garantie, O(n), 20 lignes de code ([papier original](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf), [tutoriel pas à pas](https://sighack.com/post/poisson-disk-sampling-bridsons-algorithm)). Contraintes dans les deux cas : respecter `rayonM` (pas de chevauchement de pieds), le couloir d'exclusion du chemin, et une **zone dégagée autour de chaque nœud** (lisibilité du tap).

### 5.4 Rendu Flame : couches et tri en Y

Les 6 couches (§1) deviennent des `Component` enfants du `World`, ordonnés par [`priority`](https://docs.flame-engine.org/latest/flame/components/components.html) (plus haute = rendue au-dessus) :

| Couche | priority | Contenu |
|---|---|---|
| Sol (dalles) | 0 | `SpriteBatch`/rendu direct des dalles visibles |
| Décals | 10 | plans alpha posés |
| Eau | 20 | mares (sous les props : un arbre peut border la mare) |
| Chemin | 30 | galettes le long de la spline |
| Props + nœuds | 40 | **tri en Y** : à l'intérieur de la couche, `priority = y de l'ancre` (un objet plus bas à l'écran est devant) — pattern standard Flame via la priorité des enfants |
| Vie ambiante | 50 | oiseaux/papillons |

- Le sol/décals/chemin d'un tronçon sont **statiques** : les rendre une fois dans un `Picture`/snapshot réutilisé (l'équivalent Flame d'un `RepaintBoundary` Flutter — le `GameWidget` est de toute façon repeint seul) plutôt que re-composer 40 sprites par frame. À bencher au Test A — c'est peut-être inutile (40 sprites, Flame en tient des milliers, doc 06 §1).
- **Streaming par tronçon** : la carte est découpée en chunks d'un écran et demi ; on garde en vie `courant ± 1`, on détruit le reste (les specs sont régénérables par seed — rien à sauvegarder à part `seedCarte` et l'index atteint).
- **Caméra** : [`CameraComponent`](https://docs.flame-engine.org/latest/flame/camera.html) + `World` ; scroll vertical par `moveTo`/`follow` de l'ancre du prochain nœud, bornes par `setBounds` (le passé reste visitable, doc 04 §5.1).
- **Parallax** : le décor lointain (lisière d'arbres, collines, ciel) en [`ParallaxComponent`](https://docs.flame-engine.org/latest/flame/components/parallax_component.html) derrière le sol (couches à vitesses différenciées) — c'est la profondeur « vécue » (a) du doc 05 §6.
- **Moments signés** ✅ : entrée de biome et grande aventure = scènes complètes pré-rendues + travellings pré-rendus joués en cinématique (hors cartographe). 🔶 Piste bonus à bencher au Test A : rendu + **Z-pass** Cycles ([doc Blender : Passes](https://docs.blender.org/manual/en/3.6/render/layers/passes.html)) et léger basculement de perspective via [fragment shader Impeller](https://docs.flutter.dev/ui/design/graphics/fragment-shaders) (GLSL embarqué, `FragmentProgram.fromAsset`, sans dépendance).

### 5.5 Lien avec le Directeur ✅ principe

- **Un nœud = une session/niveau produit par le Directeur** (doc 04 §4-6). Le cartographe pose des **ancres typées** (normal / surprise / aventure — types annoncés visuellement, doc 04 §6.1) ; le Directeur remplit l'ancre au moment de jouer (`generateLevel(profil, contenu, seed)`).
- **Le chemin pousse quand une session se termine** : à la complétion, le cartographe matérialise le tronçon suivant (déjà généré en données — 3-4 nœuds d'avance visibles, doc 04 §6.1) avec l'animation de pousse (fallback : fondu).
- `seedCarte` est dérivé du profil + id de biome (même recette splitmix64 que le Directeur, doc 06 §4) → la carte d'un enfant est **reproductible en debug**, et le passé rejouable est stable pour toujours.

## 6. Checklist de production d'un biome + kit minimal Test A

### 6.1 Checklist complète (de zéro à jouable)

- [ ] **Palette** : décliner les 2 couleurs de monde (doc 05 §3) en matériaux clay nommés dans le studio
- [ ] Ouvrir `studio_carte.blend`, vérifier caméra (ortho, X=60°, Z=0), key light, grille gabarit
- [ ] **Dalles** : 3 variantes 4×4 m, test grille 3×3 mélangée à 200 % → aucune couture
- [ ] **Décals** : 4-6, bords 100 % fondus (test : posé sur chaque variante de dalle)
- [ ] **Props** : arbres ×2, buisson, rocher (+1-2 signatures du biome), ombre shadow catcher, ancre centre-bas, silhouette lisible à taille réelle sur la tablette de référence
- [ ] **Nœud** : champignon 3 états (ou 1 rendu + teinte validée)
- [ ] **Eau** : 1 mare à berges fondues (test sur chaque dalle)
- [ ] **Chemin** : 3 galettes + pièce « fin de sentier »
- [ ] **Vie** : 1 oiseau + 1 papillon en sprite sheets
- [ ] **Parallax** : 1-2 bandes de décor lointain (lossy autorisé)
- [ ] `make biome-prairie` : rendu headless → pack → cwebp → vérif budgets, sans erreur
- [ ] **JSON** : `contenu/biomes/<biome>.json` avec ≥ 3 motifs, `npm run lint-contenu` vert
- [ ] Chargement app (`fromStorage` en dev), carte générée sur 3 seeds différents : variété OK, aucun prop sur le chemin, nœuds tapables
- [ ] Poids total biome ≤ budget (~4-8 Mo WebP, doc 08 §8) ; atlas ≤ 2-3 pages 2048²
- [ ] Boucle musicale + ambiance sonore branchées (doc 05 §5)
- [ ] Scène « entrée de biome » pré-rendue (moment signé) — peut arriver après la carte

### 6.2 Le KIT MINIMAL du Test A ✅ périmètre, 🔶 critères

Le strict nécessaire pour valider la chaîne complète Blender → atlas → JSON → cartographe → Flame sur la tablette de référence :

| Pièce | Qté | Note |
|---|---|---|
| Dalle d'herbe tuilable | **1** | une seule variante — la répétition assumée, on teste la couture, pas la beauté |
| Décals | **2** | herbe sombre + fleurs |
| Arbre | **1** | avec ombre au sol |
| Buisson | **1** | |
| Mare | **1** | berges fondues, statique |
| Galettes de chemin | **3** | |
| Champignon-nœud | **1** | 1 état suffit |

**Critères de validation sur la tablette 2 Go** (machine de référence, doc 08 §1) :

- [ ] Scroll de la carte **30 fps stables** (cap 30 fps actif, doc 08 §5) sur ≥ 3 écrans de hauteur générés
- [ ] Mémoire totale app **< 400 Mo** pendant le scroll (atlas du kit = 1 page 2048² = 16 Mio décodés — large)
- [ ] **Zéro couture** visible entre dalles au zoom max
- [ ] **Zéro halo** sur les contours des props (bleed + lossless OK)
- [ ] Chargement du biome **< 2-3 s** (doc 08 §6)
- [ ] Même seed ⇒ même carte après kill/relance de l'app
- [ ] Tap sur le nœud fiable au premier essai (zone ≥ 48 px, doigts d'enfant)

Si ces cases cochent, la production des vrais biomes est **dérisquée** : tout le reste est de la quantité, pas de l'inconnu.

## 7. Pièges connus ⚠️

1. **Coutures de dalles** : causes classiques — cadrage caméra pas exactement sur le bord de la dalle (±1 px), filtrage bilinéaire qui échantillonne le pixel voisin dans l'atlas (→ `padding 4` + `bleed`, §3.1), ou positions de pose non entières (poser les dalles sur des **coordonnées entières en px** ; ne jamais poser une dalle à x = 511,5).
2. **Ombres incohérentes** : un prop rendu avec une autre key light (ou une rotation de caméra « juste pour cet asset ») se dénonce immédiatement une fois posé à côté des autres. La parade est organisationnelle : **on ne rend jamais hors du studio**, et toute retouche du studio = re-rendu global assumé (doc 14 §2).
3. **Échelles qui divergent** : un buisson rendu « un peu plus gros pour qu'on le voie » casse la profondeur ortho (en ortho, la taille EST la profondeur perçue). Le plan « échelle Plouma » du studio (§2.1) est là pour ça ; le lint peut vérifier la cohérence `rayonM` ↔ taille du sprite en px (±15 %).
4. **Poids des atlas** : le sol + props + vie d'un biome doivent tenir dans **2-3 pages 2048²** (~4-8 Mo WebP disque, 32-48 Mio décodés, budgets doc 08 §3 et §8). Les tueurs silencieux : sprite sheets d'eau trop longues (8 frames max), props rendus « à 2× au cas où », parallax en lossless. Le tableau de bord des poids en CI (doc 08 §8) attrape la dérive **la semaine où elle arrive**.
5. **Alpha premultiplié / halos** : un liseré sombre autour des sprites = couleurs non dilatées sous l'alpha. `bleed: true` au packing règle le cas général ; vérifier aussi que les PNG Blender sortent avec un alpha propre (checklist doc 14 §7).
6. **La grille qui se voit** : si l'œil accroche la répétition du sol malgré les décals — d'abord **plus de décals** (pas plus de dalles), ensuite mirror aléatoire des dalles 🔶 (uniquement si le relief clay est symétriquement crédible), en dernier recours une 4ᵉ variante.
7. **Le motif qui se voit** : avec 3 motifs, un enfant qui passe 40 niveaux dans un biome (doc 04 §2) reverra chaque motif ~15 fois. Parades par coût croissant : jitter de semis par instance (déjà gratuit, seedé), variantes de sprites par prop, puis **enrichir la banque de motifs** (5-8 par biome en cible) — c'est la vraie réponse, et elle est en données, pas en code.
8. **Tout précharger** : générer la carte entière d'un biome « pour voir » = mémoire qui explose avec le chemin infini. Le streaming par tronçon (§5.4) n'est pas une optimisation, c'est **le** design.

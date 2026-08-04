# 16 — Habillage des props : du placeholder CustomPaint au rendu clay Blender

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Document de travail (Hugo). Pendant du [15-production-cartes.md](15-production-cartes.md) : le doc 15 couvre **la carte** (dalles, décals, kit Flame) ; celui-ci couvre **les props de gameplay et d'UI** — jetons, boîte, tambour, nœuds, étoile Plouma… — c'est-à-dire tout ce qui est aujourd'hui un placeholder CustomPaint/dégradés ([05-direction-artistique.md](05-direction-artistique.md) : « placeholder assumé mais désirable ») et qui doit devenir, prop par prop, un rendu pâte à modeler sorti de Blender. Objectif : pouvoir livrer les rendus **au fil de l'eau**, un prop à la fois, **sans jamais casser l'app**.

## 1. Principe : le « skin » d'un prop ✅ principe, 🔶 code

### 1.1 L'idée en une phrase

Chaque prop garde **deux looks** : son painter placeholder actuel (toujours dans le code, jamais supprimé) et, quand il existe, un **asset pré-rendu** (`Image.asset` / `DecorationImage`, ou série d'images pour l'animé). Un petit registre d'habillage sait quels assets sont réellement embarqués dans le build ; si l'asset manque, le prop **retombe automatiquement sur son placeholder**. Résultat : on peut déposer un rendu Blender dans `assets/props/`, le déclarer, relancer — et rien d'autre ; les props pas encore rendus continuent de vivre en CustomPaint.

⚠️ **Ce qui est un asset et ce qui n'en est pas.** Un asset remplace un **look statique** (la bille, le panier, le tambour au repos). Les **mouvements restent du Flutter** : le saut du jeton vers la boîte est une interpolation de position, le pulse de la boîte et du tambour un `Transform.scale`, la sortie du sol du nœud un `elasticOut` — tout ça fonctionne à l'identique avec une image dedans. On ne rend en sprite sheet que ce qui **déforme la matière** (frappe du tambour qui s'écrase, battement d'ailes) — et encore, seulement si la version statique + transform déçoit.

### 1.2 Architecture Dart proposée 🔶

Trois pièces, ~80 lignes en tout, **zéro nouvelle dépendance** (règle inviolable n°3 du `app/CLAUDE.md`) :

1. **`HabillageProps`** : un catalogue construit au démarrage en lisant l'`AssetManifest` (API Flutter standard, `package:flutter/services.dart`) — il connaît la liste exacte des assets `assets/props/**` embarqués dans le build. Chercher un skin = un `Set.contains`, jamais de try/catch d'`Image.asset` qui échoue à l'affichage.
2. **`Habillage`** : un `InheritedWidget` posé au-dessus de `MaterialApp` qui expose le catalogue partout — y compris dans les mécaniques, qui sont des `StatefulWidget` purs sans Riverpod (on ne les couple pas à `ref` juste pour un skin ; le provider Riverpod reste possible côté écrans carte/lobby si on préfère, mais l'InheritedWidget couvre tout le monde).
3. **Un widget « habillable » par prop** (ex. `JetonProp`) : il demande son skin au catalogue ; s'il existe → `Image.asset`, sinon → le painter placeholder actuel, déplacé tel quel dans le widget.

**Convention de nommage des assets** ✅ (les scripts et le registre s'y fient) :

```
assets/props/<prop>/<prop>_<variante>.webp          # @1x (taille logique)
assets/props/<prop>/2.0x/<prop>_<variante>.webp     # @2x (résolution native Flutter)
assets/props/<prop>/3.0x/<prop>_<variante>.webp     # @3x
```

Exemples : `assets/props/jeton/jeton_corail.webp`, `assets/props/tambour/tambour_repos.webp`, `assets/props/noeud/noeud_actif_cadeau.webp`. Séries animées : suffixe `_01`, `_02`… (`assets/props/papillon/papillon_vol_01.webp`). Le `<prop>_` répété dans le nom de fichier n'est pas du zèle : un fichier isolé (dans un atlas, un mail, un dossier de rendus) reste identifiable.

### 1.3 Le code, en entier, sur le cas canonique : le jeton de la boîte à sons

Aujourd'hui le jeton est un `Container` cercle + `BoxShadow` (`app/lib/mecaniques/boite_a_sons.dart:400-409` pour la rangée, `:368-377` dans la boîte). Cible : une **bille de pâte rendue en 3D**. Voici les trois pièces (à créer dans `app/lib/ui/habillage_props.dart` le moment venu — ce doc ne modifie rien) :

```dart
// habillage_props.dart — registre d'habillage : quels rendus clay sont embarqués ?
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Catalogue des skins pré-rendus réellement présents dans le build.
/// Construit UNE FOIS au démarrage depuis l'AssetManifest : chercher un skin
/// est un simple Set.contains, et un asset manquant → fallback placeholder
/// silencieux (jamais d'exception d'Image.asset à l'écran).
class HabillageProps {
  final Set<String> _disponibles;
  const HabillageProps._(this._disponibles);

  /// Catalogue vide : tout le monde retombe sur les placeholders (tests, erreur de manifest).
  const HabillageProps.aucun() : _disponibles = const {};

  static Future<HabillageProps> charger() async {
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    return HabillageProps._(manifest
        .listAssets()
        .where((a) => a.startsWith('assets/props/'))
        .toSet());
  }

  /// Chemin de l'asset du skin, ou null si pas (encore) rendu → placeholder.
  String? chemin(String prop, String variante) {
    final c = 'assets/props/$prop/${prop}_$variante.webp';
    return _disponibles.contains(c) ? c : null;
  }
}

/// InheritedWidget qui expose le catalogue à toute l'app (mécaniques comprises,
/// sans les coupler à Riverpod).
class Habillage extends InheritedWidget {
  final HabillageProps props;
  const Habillage({super.key, required this.props, required super.child});

  static HabillageProps of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<Habillage>()?.props ??
      const HabillageProps.aucun();

  @override
  bool updateShouldNotify(Habillage old) => old.props != props;
}
```

Branchement au démarrage (dans `main.dart`, autour du `MaterialApp` existant) :

```dart
final habillage = await HabillageProps.charger(); // avant runApp, à côté des autres inits
runApp(ProviderScope(
  child: Habillage(props: habillage, child: const PloumaApp()),
));
```

Et le widget habillable, qui remplace le `Container` du jeton :

```dart
/// Un jeton clay : bille de pâte pré-rendue si le skin existe, cercle placeholder sinon.
/// [indexCouleur] suit ClayTheme.couleurSyllabe (cyclique sur 5 couleurs).
class JetonProp extends StatelessWidget {
  final int indexCouleur;
  final double taille;
  const JetonProp({super.key, required this.indexCouleur, this.taille = 52});

  /// Noms des variantes, alignés sur ClayTheme._syllabes (theme_clay.dart:51-57).
  static const _noms = ['corail', 'bleu', 'lavande', 'ambre', 'menthe'];

  @override
  Widget build(BuildContext context) {
    final String? skin =
        Habillage.of(context).chemin('jeton', _noms[indexCouleur % _noms.length]);
    if (skin != null) {
      return Image.asset(skin,
          width: taille, height: taille, filterQuality: FilterQuality.medium);
    }
    // Fallback : le placeholder actuel, à l'identique (boite_a_sons.dart:400-409).
    return Container(
      width: taille,
      height: taille,
      decoration: BoxDecoration(
        color: ClayTheme.couleurSyllabe(indexCouleur),
        shape: BoxShape.circle,
        boxShadow: ClayTheme.ombreClay,
      ),
    );
  }
}
```

Dans `_rangeeJetons()` et `_boiteWidget()`, le `Container` devient `JetonProp(indexCouleur: _couleursJetons[i])` — les `Key`, le `GestureDetector`, la logique de dépôt ne bougent pas d'une ligne. C'est le patron à répéter pour chaque prop : **un widget, deux looks, zéro changement de logique.**

## 2. Inventaire des props habillables

Inventaire fait sur le code réel (branche `main`, 08/2026). **Priorité 1 = les mécaniques** (ce que l'enfant regarde pendant l'exercice), **2 = la carte** (l'écran entre les sessions), **3 = décor/confort**. « painter conservé » = on garde le vectoriel (texte dynamique, path généré au runtime, ou remplacé à terme par le kit carte du doc 15).

| Prop | Fichier:ligne (placeholder actuel) | États / variantes | Type d'asset | Taille logique → rendu conseillé | Prio |
|---|---|---|---|---|---|
| **Jeton** (bille de pâte) | `boite_a_sons.dart:400` (rangée), `:368` (dans la boîte) | 5 couleurs (corail, bleu, lavande, ambre, menthe). Le **saut** vers la boîte = interpolation de position, pas un asset | 5 images fixes | 52 px (30 px en boîte, même asset réduit) → 52/104/156 px | **1** |
| **Boîte / panier** | `boite_a_sons.dart:344-360` | 1 seul rendu (panier vide) : les jetons dedans sont des `JetonProp` posés dessus, le **pulse** = `Transform.scale` | 1 image fixe (fond via `DecorationImage`) | 200×120 → jusqu'à 600×360 | **1** |
| **Bouton « Fini ! »** | `boite_a_sons.dart:424-431` | 2 : actif (vert) / inactif (pâle). Texte = `Text` Flutter par-dessus | 2 images fixes (ou nine-slice si la largeur doit varier) | ~340×60 → ×3 | **1** |
| **Tambour** | `tape_la_syllabe.dart:291-307` | repos / frappé (le pulse `Transform.scale` couvre déjà la frappe : commencer avec **repos seul**, l'état « frappé » écrasé en option si le scale déçoit) | 1-2 images fixes | 180 px → 180/360/540 | **1** |
| **Pastilles de taps** | `tape_la_syllabe.dart:316-325` | 5 couleurs — **même famille que le jeton** : réutiliser l'asset jeton réduit à 22 px | (réutilise jeton) | 22 px affichés | 1 |
| **Confettis** | `boite_a_sons.dart:488-508`, `tape_la_syllabe.dart:372-391` | particules animées procédurales | ⚠️ painter conservé (option : remplacer les cercles par 2-3 mini-billes image) | — | 3 |
| **Étiquettes syllabes** (mot découpé) | `boite_a_sons.dart:301-316`, `tape_la_syllabe.dart:247-262` | texte **dynamique** sur capsule colorée | painter conservé (texte). 🔶 plus tard : capsule clay en nine-slice sous le `Text` | — | 3 |
| **Boutons nombres [DEV]** | `fallback_dev.dart:172-186` | — | aucun : mécanique de repli [DEV], sera remplacée | — | — |
| **Étoile Plouma** | `theme_clay.dart:118-202` (utilisée `ecran_cadeau.dart:68`, `ecran_lobby.dart:102`, `ecran_carte.dart:408`) | 1 pose neutre pour commencer (le cadeau anime par `ScaleTransition`) ; à terme poses/expressions (doc 05, mascotte) | 1 image fixe, puis série de poses | 34-120 px selon usage → rendre pour le plus grand : 120/240/360 | **2** |
| **Nœud actif** (champignon) | `noeuds_carte.dart:187-323` | 3 types (normal ● / cadeau / rêve-lune, glyphes `noeuds_carte.dart:24-92` **intégrés au rendu**). Halo + pulse restent Flutter par-dessus | 3 images fixes | 92 px → ×3 | **2** |
| **Nœud joué** | `noeuds_carte.dart:95-136` | 3 types, aspect « enfoncé dans le sol » | 3 images fixes | 58 px → ×3 | **2** |
| **Nœud à venir** | `noeuds_carte.dart:139-184` | 🔶 réutiliser le rendu « joué » ou « actif » passé sous `Opacity` + brume Flutter (économie : 0 rendu dédié) — sinon 3 de plus | 0-3 images | 58 px | 2 |
| **Tuile biome (lobby)** | `ecran_lobby.dart:321-443` | 12 biomes × (courant / autre) — voir stratégie couleur §3.4 : **1 rendu neutre teinté**, pas 24 rendus | 1-2 images teintées | 280×150 → ×3 | 2 |
| **Bouton lobby** (grille) | `ecran_carte.dart:442-472` (icône `:475-498`) | 1 (le fond dégradé suit la palette biome → teinté) | 1 image | 48 px → ×3 | 3 |
| **Bouton retour (lobby)** | `ecran_lobby.dart:117-131` | 1 | painter conservé (simple icône Material) 🔶 | — | 3 |
| **Chemin (boudin)** | `chemin_clay.dart:77-167` | path généré au runtime (Bézier + progress de pousse) | ⚠️ painter conservé — remplacé à terme par les **galettes** du doc 15 §2.6, pas par une image ici | — | — |
| **Sol prairie** | `decor_prairie.dart:23-81` | — | painter conservé — devient les **dalles tuilables** doc 15 §2.2 | — | — |
| **Végétation** (buisson, fleur, champignon) | `decor_prairie.dart:126-220` | 3 types × teintes | 3 images fixes posées aux mêmes ancres (`BrinDecor` fournit déjà position/échelle/teinte) — ou attendre les props doc 15 §2.4 | 24-44 px → ×3 | 3 |
| **Papillons** | `decor_prairie.dart:223-273` | vol = sinusoïde Flutter (conservée) ; battement d'ailes = série 4-6 frames | série d'images | ~28 px → ×3 | 3 |
| **En-tête flottant carte** | `ecran_carte.dart:380-439` | verre dépoli `BackdropFilter` | painter/widget conservé (c'est de l'UI système, pas un objet clay) | — | — |

**Bilan** : 19 props inventoriés, dont **12 habillables par image** ; 7 restent volontairement en Flutter (texte dynamique, paths runtime, verre dépoli, ou territoire du doc 15). Le premier lot utile = **jeton + boîte + bouton Fini + tambour** : avec 9 fichiers d'images (5 jetons + 1 boîte + 2 boutons + 1 tambour), **les deux mécaniques jouables sont entièrement en vrai clay**.

## 3. Produire le rendu d'UN prop dans Blender

Tout ce qui suit se fait dans le **studio partagé** (doc 14 §2 : mêmes matériaux clay nommés, même key light haut-gauche que les cartes — c'est la condition de cohérence quand un prop d'UI et un prop de carte cohabitent à l'écran). Ne PAS relire ici le setup atlas/WebP : voir doc 15 §3.2 pour `cwebp`.

### 3.1 Caméra : PAS l'ortho carte 🔶

La caméra `cam_carte` (ortho 60°, doc 15 §2.1) sert aux objets **posés dans le monde**. Les props d'UI sont vus **de face ou en 3/4 léger**, comme l'enfant les voit à l'écran :

| Prop | Caméra conseillée | Pourquoi |
|---|---|---|
| Jeton, pastilles | face, très léger plongé (~10°) | c'est une bille dans une rangée d'UI, pas un objet au sol |
| Boîte/panier, tambour | 3/4 léger (~20-30° de plongé) | on doit voir « dedans »/« dessus » comme dans le placeholder actuel |
| Bouton Fini, tuile lobby, bouton lobby | face (0°) | éléments d'interface plats |
| Étoile Plouma | face | mascotte, lisibilité maximale |
| Nœuds du chemin | ⚠️ **exception : l'ortho carte** (doc 15 §2.1) | ils sont posés SUR la carte — un nœud rendu de face jurerait avec le sol 3/4. C'est le seul prop de cette liste qui se rend dans `studio_carte.blend` |
| Végétation, papillons | ortho carte | idem, monde de la carte |

🔶 Proposer un `studio_props.blend` dérivé du studio général : caméra **perspective focale longue (~85-135 mm) ou ortho de face** (l'ortho évite toute fuyante sur les boutons), key light **identique** au studio (haut-gauche), tourelle de 2-3 angles pré-réglés (face / 10° / 25°). Comme pour la carte : **on ne rend jamais hors du studio** (piège n°2 du doc 15 §7).

### 3.2 Cadrage, ombre, fond

- **Fond transparent** (Film > Transparent, sortie PNG RGBA — doc 15 §2.1), cadrage **serré sur l'objet + marge pour l'ombre** : l'ombre portée fait partie du cadre, jamais coupée.
- **Ombre portée : INTÉGRÉE au rendu** ✅ recommandé pour les props d'UI (plan Shadow Catcher sous l'objet, comme les props de carte doc 15 §2.4). Pourquoi : l'ombre clay douce EST la matière de la DA ; la re-fabriquer en `BoxShadow` Flutter sous une image donnerait deux langages d'ombre côte à côte. L'ombre séparée (2 fichiers) ne se justifie que si un prop doit projeter sur des fonds de luminosité très différente — aucun cas identifié en v1.
- Conséquence ⚠️ : le **centre optique** de l'image n'est pas son centre géométrique (l'ombre décale vers le bas-droite). Garder l'objet centré et laisser l'ombre vivre dans la marge ; si un prop est mal assis dans son cadre, noter une ancre comme pour les props carte (doc 15 §2.4).

### 3.3 Tailles de rendu : résolution × DPR ✅

Règle : **taille logique du widget × 3 = résolution du rendu maître**, puis on décline @2x/@1x par réduction (Blender rend le @3x ; `magick` ou `cwebp -resize` produisent les autres — jamais l'inverse, on n'agrandit pas). Les tailles logiques sont dans l'inventaire §2. Exemples :

```
jeton    : 52 logique  → rendu 156×156  → 3.0x/156, 2.0x/104, 1x/52
tambour  : 180 logique → rendu 540×540  → 3.0x/540, 2.0x/360, 1x/180
boîte    : 200×120     → rendu 600×360 (+ marge d'ombre)
```

⚠️ Rendre au @3x **exact**, pas « large au cas où » : c'est un des tueurs de budget identifiés doc 15 §7.4. Et pas en-dessous non plus : le clay **pixellise** vite (le grain de la pâte devient de la bouillie dès qu'on agrandit, §6).

Export : PNG Blender → `cwebp -lossless` (sprites avec alpha : lossless **obligatoire**, doc 15 §3.2) → dépôt dans `assets/props/…`. Les props d'UI ne passent PAS par TexturePacker en v1 (les mécaniques sont en Flutter pur, pas Flame — chaque prop est un fichier ; l'atlas redeviendra pertinent si un prop migre côté Flame, doc 15 §3).

### 3.4 Cas particulier : la couleur variable 🔶 recommandation

Deux familles de props sont colorés par le code : les **jetons/pastilles** (5 couleurs syllabes fixes, `theme_clay.dart:51-60`) et les props **teintés par biome** (nœuds, tuile lobby, bouton lobby — 12 palettes, `theme_clay.dart:82-99`). Trois stratégies :

1. **Un rendu par couleur.** Fidélité clay parfaite (la teinte joue dans les ombres, le subsurface, le reflet — une vraie boule de pâte bleue n'est pas une boule grise bleutée). Coût : n fichiers — trivial à automatiser (une passe headless par matériau, doc 15 §2.8).
2. **Rendu neutre teinté dans Flutter** (`Image.asset(color: …, colorBlendMode: BlendMode.modulate)` sur un rendu clay gris clair). Un seul fichier, mais `modulate` multiplie : les hautes lumières se salissent, les ombres virent au gris coloré — le clay perd son « lait ». Acceptable pour des teintes proches, risqué pour la palette vive des syllabes.
3. **Matériau neutre + masque de teinte** (2 images : base clay en niveaux de gris + masque alpha des zones à teinter, composées avec 2 `Image` superposées ou un `ShaderMask`). Le meilleur des deux, mais 2 fichiers + du code de composition par prop.

**Recommandation** ✅ :
- **Jetons (5 couleurs) : stratégie 1, un rendu par couleur.** C'est l'objet que l'enfant fixe pendant l'exercice, la couleur EST l'information pédagogique (1 jeton = 1 syllabe, couleurs distinctes), et 5 × ~15 Ko lossless est un non-coût. Aucune raison de dégrader.
- **Props à palette de biome (12 palettes) : stratégie 2 d'abord** — 12 rendus × 3 états de nœud × 3 types = 108 fichiers, ingérable ; on rend **neutre** (clay gris-crème clair) et on teinte par `modulate` avec `palette.dominante`. **Valider visuellement sur 3 biomes contrastés** (Prairie, Grotte, Ciel nocturne) ; si le clay se salit, escalader vers la stratégie 3 pour les nœuds seulement. C'est exactement la « piste éco » déjà notée pour le champignon-nœud au doc 15 §2.4 — même décision, à trancher une fois pour les deux docs.

## 4. Brancher dans Flutter — pas à pas sur jeton + boîte

Étape par étape, dans l'ordre où ça se passe vraiment :

**1. Déposer les fichiers** (convention §1.2) :

```
app/assets/props/jeton/jeton_corail.webp        (+ bleu, lavande, ambre, menthe)
app/assets/props/jeton/2.0x/…  app/assets/props/jeton/3.0x/…
app/assets/props/boite/boite_panier.webp        (+ 2.0x/, 3.0x/)
```

**2. Déclarer dans `pubspec.yaml`** — déclarer le **dossier** suffit, et Flutter résout les variantes `2.0x/`/`3.0x/` automatiquement selon le `devicePixelRatio` (mécanisme natif, rien à coder) :

```yaml
flutter:
  assets:
    - assets/props/jeton/
    - assets/props/boite/
```

⚠️ La déclaration de dossier n'est pas récursive : les sous-dossiers de résolution sont pris en charge, mais chaque nouveau dossier de prop s'ajoute ici. C'est le SEUL point de friction du « fil de l'eau » — l'oublier n'est pas grave : le registre ne voit pas l'asset, le placeholder reste affiché.

**3. Précharger** — sans ça, le premier jeton « pope » à l'écran en pleine session (décodage à la première frame). Au bon endroit : `EcranSession` (ou l'écran de chaque mécanique) précharge les skins de SES props avant de lancer l'exercice :

```dart
@override
void didChangeDependencies() {
  super.didChangeDependencies();
  final h = Habillage.of(context);
  for (final v in JetonProp._noms) {
    final c = h.chemin('jeton', v);
    if (c != null) precacheImage(AssetImage(c), context);
  }
  final boite = h.chemin('boite', 'panier');
  if (boite != null) precacheImage(AssetImage(boite), context);
}
```

**4. Remplacer le painter, garder le fallback** — comme au §1.3 : `JetonProp` remplace les deux `Container` cercle (`boite_a_sons.dart:400`, `:368`), la boîte garde son `Container` mais son `decoration` devient `DecorationImage(image: AssetImage(skin), fit: BoxFit.contain)` quand le skin existe, le dégradé actuel sinon. Le pulse (`_pulse`), les `Key` de test (`'jeton-$i'`, `'boite'`), le timer de validation : **inchangés**.

**5. Tester.** Deux niveaux :
- **Non-régression simple** (obligatoire) : les widget tests existants passent sans modification — ils ciblent les `Key`, pas le pixel. Ajouter un test « catalogue vide ⇒ le placeholder s'affiche » (pomper `Habillage(props: HabillageProps.aucun())` dans le pump) et « catalogue avec jeton ⇒ un `Image` est présent ».
- **Golden test** (conseillé, natif Flutter, zéro dépendance) : un golden par prop habillé, sur fond crème, `matchesGoldenFile('goldens/jeton_corail.png')`, mis à jour via `flutter test --update-goldens`. C'est le filet qui attrape « le rendu v2 a décalé l'ombre de 6 px » sans y passer des yeux.

**6. Les états animés (sprite « sheets »)** — les mécaniques sont en **Flutter pur, pas Flame** : pas besoin de l'atlas `flame_texturepacker` du doc 15 §3.3 ici. Une **série d'images** (`papillon_vol_01.webp` … `_06.webp`) pilotée par un `AnimationController` + `Image.asset(frames[i])` (toutes préchargées : le swap est gratuit), ou un `AnimatedSwitcher` pour 2 états (tambour repos/frappé), suffit largement à ce stade. Le jour où un prop migre sur la carte Flame (nœuds, papillons), il bascule dans l'atlas du biome et suit le doc 15 — la convention de nommage `_01/_02` est déjà compatible avec l'`index` du `.atlas`.

## 5. Checklist par prop + ordre de production

### 5.1 La checklist (à copier pour chaque prop)

- [ ] **Modéliser** dans le studio (matériaux clay nommés, échelle Plouma ~0,6 m en tête — doc 14 §2-3)
- [ ] **Caméra** : celle du tableau §3.1 (face/3-4 léger — ortho carte pour les props posés sur la carte)
- [ ] **Rendre** : fond transparent, ombre Shadow Catcher intégrée, cadrage serré + marge d'ombre, résolution = taille logique × 3
- [ ] **Décliner** @2x/@1x par réduction, `cwebp -lossless` (doc 15 §3.2)
- [ ] **Déposer** dans `assets/props/<prop>/` (+ `2.0x/`, `3.0x/`) selon la convention §1.2
- [ ] **Déclarer** le dossier dans `pubspec.yaml`
- [ ] **Précharger** dans l'écran qui l'affiche (`precacheImage`)
- [ ] **Brancher** : widget habillable, placeholder conservé en fallback, `Key` de test intactes
- [ ] **Vérifier** : `flutter analyze` + tests verts, golden mis à jour
- [ ] **Vérifier à l'œil** sur fond **crème** (`ClayTheme.creme`) ET sur les palettes de biomes contrastées (Prairie, Grotte, Ciel nocturne) — halos, teinte, cohérence d'ombre avec les placeholders voisins
- [ ] **Peser** : le prop entre dans le budget (doc 08 §8) — un prop d'UI lossless doit rester à quelques dizaines de Ko

### 5.2 Ordre de production conseillé ✅

1. **Jetons (×5) + boîte + bouton Fini** — la boîte à sons entière en clay : l'exemple canonique, et l'écran où l'enfant passe le plus de temps.
2. **Tambour** — la 2ᵉ mécanique jouable est couverte ; les pastilles de taps réutilisent les jetons.
3. **Nœuds du chemin** (actif d'abord, puis joué ; « à venir » réutilise si possible) — dans le studio CARTE, en validant au passage la stratégie de teinte §3.4 (décision partagée avec doc 15 §2.4).
4. **Étoile Plouma** — visible partout (en-tête, lobby, cadeau) : gros effet « ça y est, c'est la vraie DA » pour un seul rendu.
5. **Tuile lobby, bouton lobby** — l'écran biomes.
6. **Décor** (végétation, papillons) — en dernier : c'est la cerise, et une partie sera de toute façon absorbée par le kit carte du doc 15.

## 6. Pièges ⚠️

1. **Halos d'alpha sur fond coloré.** Un liseré sombre autour de la bille posée sur la prairie = couleurs non dilatées sous l'alpha (alpha premultiplied, même mécanique que doc 15 §7.5). Ici pas de TexturePacker pour faire `bleed: true` : vérifier que les PNG Blender sortent l'alpha propre (checklist doc 14 §7) et contrôler chaque prop **sur fond vif**, pas seulement sur crème — le halo est invisible sur fond clair.
2. **Échelle incohérente entre props.** Un tambour rendu « un peu gros pour être beau » à côté de jetons fins = deux mondes. Établir une **échelle commune px/cm de pâte** dans le studio props (proposé 🔶 : **1 cm de pâte = 6 px logiques**, soit le jeton = une bille de ~8-9 cm, le tambour ~30 cm) et la noter dans le `.blend` ; le gabarit « échelle Plouma » du studio (doc 15 §2.1) sert d'étalon.
3. **Le clay qui pixellise.** Le grain de pâte est une haute fréquence : rendu trop petit puis agrandi (même de 20 %), il devient du bruit flou. D'où la règle §3.3 : rendu maître = taille logique × 3, affichage jamais au-dessus de la taille logique, `FilterQuality.medium` au minimum sur les `Image`.
4. **Poids.** Chaque prop est petit, mais « au fil de l'eau » = personne ne regarde le total. Les budgets du doc 08 §8 s'appliquent : ajouter `assets/props/` au tableau de bord des poids en CI dès le premier asset — c'est la parade « la semaine où la dérive arrive » du doc 15 §7.4.
5. **Cohérence d'ombres avec les placeholders restants.** Pendant la transition, un jeton clay (ombre Blender bas-droite, douce, colorée) cohabite avec un bouton placeholder (`BoxShadow` `Offset(0, 8)` noire). Deux parades : rendre les props **par écran complet** (lot 1 = toute la boîte à sons, pas un jeton isolé pendant 3 semaines), et garder la key light du studio alignée sur la convention des ombres Flutter (haut-gauche → ombres bas-droite, déjà le cas : `ClayTheme.ombreClay` décale vers le bas).
6. **Le fallback qui masque un oubli.** C'est la force ET le piège du système : un asset mal nommé ou non déclaré ne casse rien — il ne s'affiche juste jamais. Un test debug trivial (lister `HabillageProps._disponibles` au démarrage en mode debug, ou un test qui vérifie que chaque dossier `assets/props/<prop>/` déposé est bien résolu par le registre) évite de livrer un rendu qui dort dans le binaire.

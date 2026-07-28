# 14 — Production 3D Blender → app (pipeline complet)

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Contexte acté : Hugo gère **toute la 3D** (bonnes bases Blender), avec l'addon **Clay Doh** pour le rendu pâte à modeler. Modèles volontairement simples — c'est compatible avec la DA (doc 05) qui mise sur formes rondes et lisibilité.

## 1. Cycles vs Eevee : la question est réglée ✅

Clay Doh rend mieux sous **Cycles** — et ça tombe bien :

- **Ça ne change strictement rien pour l'app.** Tout est pré-rendu en images/sprites (doc 05 §1) : le moteur de rendu n'existe que sur ton PC. L'app affiche des WebP, elle ne sait même pas que Blender existe.
- Le brief avait déjà acté **Cycles** : le rendu clay crédible (subsurface scattering, micro-imperfections, empreintes) est précisément ce que Cycles fait bien et Eevee approxime mal.
- Le seul coût est le **temps de rendu**, maîtrisable (§5) : nos images sont petites (sprites ~800 px, cartes ~2048 px), c'est très loin d'un rendu film.
- 🔶 Usage possible d'Eevee quand même : **prévisualisation** pendant le modelage/l'animation (viewport rapide), rendu final en Cycles.

⚠️ **À vérifier une fois (5 min)** : la licence de Clay Doh autorise l'usage **commercial** des rendus (c'est quasi toujours le cas pour les addons de matériaux — les rendus t'appartiennent — mais vérifier la page de vente/licence, et archiver une copie de la licence dans le repo assets).

## 2. Le fichier « studio » ✅ principe, 🔶 contenu (la fondation de la cohérence)

Un seul fichier `studio.blend` partagé, dont **tous** les assets héritent (via *Link/Append* ou *Asset Browser*) :

- **Éclairage plateau stop-motion** : key light douce (softbox large), fill discret, rim léger — identique pour tous les rendus. C'est LE secret de l'homogénéité entre une carte, un objet-mot et la mascotte.
- **Matériaux Clay Doh calés sur la palette** (doc 05 §3) : 5 matériaux nommés (`clay_nooma_gold`, `clay_bg_cream`, etc.) — on ne crée jamais un matériau à la volée, on instancie ceux du studio.
- **Caméras préréglées** : `cam_map` (orthographique ou légère plongée, pour les cartes), `cam_sprite` (face, pour mascotte/objets), `cam_item` (3/4 douce, pour les images-mots) — focales et cadrages figés.
- **Réglages de rendu enregistrés** (§5) + Film → Transparent pour tout ce qui n'est pas une carte.
- ⚠️ Toute retouche du studio (lumière, matériau) = **re-rendu potentiellement global**. Le studio se fige tôt (au Test A) et ne bouge plus qu'en connaissance de cause.

## 3. Modelage : règles pour des modèles simples qui rendent bien en clay 🔶

- **Formes rondes, silhouettes lisibles** : un objet-mot doit être identifiable par un enfant de 5 ans en 300 px — silhouette d'abord, détails jamais. Test : le rendu en aplat noir doit rester reconnaissable.
- Boîte à outils du « faux fait-main » : subsurf + sculpt léger (irrégularités volontaires), bevel généreux partout (l'argile n'a pas d'arête vive), micro-déformations asymétriques (rien de parfaitement symétrique — c'est ce qui « fait vrai »).
- Clay Doh apporte la matière (texture argile, empreintes) ; la **crédibilité vient de la forme** : un cube parfait avec un shader clay reste un cube parfait. Mieux vaut 2 min de sculpt brouillon que 20 min de réglage shader.
- **Low effort assumé** : pas de topologie propre requise (on ne déforme pas ces meshes, sauf Nooma) — sculpt + remesh suffit pour les objets statiques.
- Échelle réelle cohérente entre assets (le SSS de Cycles dépend de l'échelle ! un objet 10× trop grand aura une matière « morte ») — tout le monde à l'échelle du studio.

## 4. Les 4 chaînes de production

### 4.1 Mascotte Nooma (la seule 3D « animée sérieusement »)
- Rig : armature légère + shape keys pour le visage (détail brief §8) ; ~12-15 clips, **chaque clip commence et finit sur la pose neutre** ✅.
- Accessoires de customisation : **rendus séparément** sur les points d'accroche (doc 05 §4) et composés dans l'app — à valider au Test A (même éclairage/caméra, ça se superpose bien).
- Rendu à 2× la taille d'affichage réelle (doc 08 §8) : ~700-800 px.

### 4.2 Cartes de biomes
- 1 scène par biome, caméra `cam_map` fixe, rendu en **3-4 couches** via View Layers/collections (fond / médian / interactif / premier plan) → parallax dans l'app.
- ~2048 px par couche ; éléments animés du décor (drapeau, eau, brume) en petites sprite sheets séparées.

### 4.3 Images-mots (le chantier de volume : 200-400)
- Template `item_template.blend` lié au studio : même caméra, même lumière, fond transparent → **chaîne de montage** : ouvrir, modeler 10-20 min max, rendre, suivant.
- 🔶 Complément IA (images claymation générées) uniquement si l'homogénéité passe le Test C — sinon 100 % Blender en acceptant un vocabulaire illustré réduit au strict pédagogique.
- Sortie 512×512 (doc 08 §8).

### 4.4 Objets de jeu & UI
- Lettres/graphèmes en clay (alphabet + digraphes — ⚠️ police/formes des lettres à valider avec Florence, doc 05 §7), jetons, wagons, boutons.
- Les graphèmes complexes (ch, ou, an) sont **une seule pièce d'argile** — cohérent avec la pédagogie (unités insécables, doc 02 §2).

## 5. Réglages de rendu Cycles (temps maîtrisé) 🔶

- **GPU + OptiX/HIP**, denoising **OpenImageDenoise** activé → 64-128 samples suffisent largement pour du clay diffus/SSS à ces résolutions.
- **Persistent Data** activé (évite de re-synchroniser la scène entre frames d'un clip — gros gain sur les sprite sheets).
- Résolutions de sortie = les budgets du doc 08 §8, jamais plus (« au cas où » = ×4 de temps de rendu et de RAM app).
- Film → Transparent + sortie **PNG RGBA 8 bits** (le WebP arrive à l'étape packing ; garder les PNG comme intermédiaires régénérables).
- Ordre de grandeur attendu : une frame de sprite 800 px ≈ secondes, un clip de 30 frames ≈ minutes, une carte 2048 px ≈ minutes. Si un rendu prend des heures, un réglage est faux (samples, résolution ou SSS à l'échelle).

## 6. Automatisation : du .blend à l'atlas sans clic 🔶

Objectif : **régénérer n'importe quel asset en une commande** (indispensable en solo + vibe coding — le pipeline est du code comme le reste).

```
render :  blender -b nooma_mascotte.blend -o //out/idle_#### -a        # headless, par clip
pack   :  LibGDX TexturePacker (CLI) : PNG → atlas WebP lossless + .atlas   # doc 06 §6
verif  :  script : padding ≥2 px, taille atlas ≤2048², poids vs budget, noms conformes
```

- **Convention de nommage stricte** (les scripts et l'app s'y fient) : `nooma/idle_[frame]`, `biome-prairie/map_bg`, `items/chat`…
- Un `Makefile`/script par lot (mascotte, biome, items) ; la CI vérifie les budgets de poids (doc 08 §8).
- Sources .blend et PNG intermédiaires **hors Git** (archivés B2/rclone), seuls les atlas finaux en LFS (doc 06 §6).

## 7. Check-list qualité par asset (avant d'entrer dans l'app)

- [ ] Matériau/lumière : instancié du studio (pas de matériau local)
- [ ] Silhouette lisible à taille réelle d'affichage (test sur la tablette de référence)
- [ ] Clips mascotte : pose neutre en première ET dernière frame
- [ ] Fond transparent propre (pas de halo — vérifier le premultiplied alpha au packing)
- [ ] Résolution conforme au budget (doc 08 §8), pas de « 4K au cas où »
- [ ] Nommage conforme ; rendu reproductible par la commande du lot

## 8. Montée en compétence ciblée

Les ressources YouTube sont déjà listées dans [ressources-youtube.md](ressources-youtube.md) (chaîne clé : **Southern Shotty**, quasi exactement notre DA). Ordre d'apprentissage conseillé, aligné sur les risques : sprite sheets depuis Blender (§4 de la liste — valide le Test A) → rendu en couches/View Layers → rig simple armature + shape keys → le reste en avançant. Clay Doh réduit fortement la partie « shading » : ton apprentissage se concentre sur **formes, lumière (déjà dans le studio) et rig**.

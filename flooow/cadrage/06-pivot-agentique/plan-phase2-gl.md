# Phase 2 — couche GL sous le DOM (plan d'exécution)

Date : 23/07/2026. Spec parente : [audit-refonte-canvas-webgl.md](audit-refonte-canvas-webgl.md)
(§6, phase 2). Décision d'Hugo : go sans attendre les relevés R2 (la phase 1 est livrée et validée
à l'écran sur les gestes ; les jalons ci-dessous restent réversibles un à un).

## Cible et périmètre

Un `<canvas>` **Pixi v8** sous le pane Vue Flow prend tout ce qui coûte au pan/zoom **sauf les
cartes** (qui restent DOM jusqu'à la phase 3) : fond, arêtes (tous types), cadres de lots,
guides/fantômes de drag, curseurs de présence, minimap. Jalon de fin de phase (audit) : plus aucun
SVG dans le canvas, pan/zoom composité.

## Choix techniques posés

- **Pixi v8, backend `webgl`** d'abord (déterministe partout, SwiftShader compris) ; bascule
  `webgpu` à évaluer en fin de phase — l'API Pixi est identique.
- **Caméra : le DOM reste MAÎTRE en phase 2**, la couche GL suit `vf.viewport` (une transform de
  conteneur par changement). L'audit visait « GL maître » ; l'exigence réelle est *une seule
  matrice partagée au pixel*, et suivre est le sens sans risque tant que le DOM porte les cartes
  et toutes les interactions. L'inversion viendra avec le picking (phase 3).
- **Rendu à la demande** : pas de ticker permanent — un `invalidate()` coalescé sur rAF, déclenché
  par caméra ou scène. Une scène immobile ne coûte rien (batterie, et le rAF headless ne bat pas).
- **Drapeau de repli** : `localStorage['flooow:gl'] = '0'` coupe la couche et restaure le rendu
  DOM d'origine, jalon par jalon (le SVG remplacé reste dans le code derrière le même drapeau tant
  que la phase n'est pas close).
- **Coordonnées MONDE dans le conteneur `world`** : les modules de dessin travaillent en unités
  monde, la caméra est une transform unique — aucune conversion par objet.

## État (23/07 soir)

- Jalons **1 à 4 LIVRÉS** (`41099fd`, `ac4107e` + lissage `88db840`, `22683eb`, `74f123e`) —
  fond, toutes les arêtes (fonctionnelles ET structurelles : plus aucun tracé SVG peint), bacs de
  lot. Jalons 2-4 validés à l'œil par Hugo. En chemin : simplification polylignes (les composants
  échantillonnent leur `d` SVG — parité de routage par construction) et correctif du grisage
  (`6ff7965` : voile alpha au lieu de filter:grayscale — 65 couches de filtre par image en moins).
- Jalons **5 (fantômes/guides) et 6 (curseurs présence) DIFFÉRÉS À LA PHASE 3**, délibérément :
  ces overlays doivent s'afficher AU-DESSUS des cartes, or la couche GL est SOUS le DOM — les
  migrer exigerait un second canvas pour 1 à 3 éléments à l'écran (coût actuel nul). Quand les
  cartes passeront au GL (phase 3), le z-ordre s'unifie et ils suivront gratuitement.
- Jalon **7 (minimap) : EN ATTENTE D'UNE DÉCISION PRODUIT** — la minimap avait été retirée
  volontairement (« un seul îlot de navigation », fitView à la demande). La ré-introduire est un
  choix d'UX qui appartient à Hugo, pas à la migration.
- Chrome des cadres de MODULE : resté DOM (variantes vivantes — satellite en color-mix, sélection,
  présence — la duplication de couleurs en JS serait fragile pour ~12 rects) ; à réévaluer si les
  mesures GPU le désignent.
- **Re-mesure de clôture : sur machine réelle uniquement** — le Chrome headless bao rend le GL en
  logiciel (SwiftShader, ~40 ms/render) : ses chiffres inversent le verdict. Hugo signale des
  « soucis de perf » résiduels à investiguer sur GPU — c'est l'entrée de la prochaine session.

## Jalons (un commit chacun, dans l'ordre)

1. **Hôte + caméra + fond** — canvas plein pane sous Vue Flow, `world` synchronisé sur
   `vf.viewport`, grille de points en `TilingSprite` (parité : #cbd5e1, pas 24, r 1,4, masquée
   sous zoom 0,35). Remplace `<Background>`. Un quad GPU : le repeint plein écran du fond DOM
   (un tiers du budget de pan mesuré en phase 0) disparaît.
2. **Arêtes fonctionnelles** (`dependsOn`, 84 sur locasyst) — Bézier échantillonnées, tiretés par
   segments, couleurs par relation, estompage de chaîne (lecture directe de FUNC_HIGHLIGHT),
   flèches ; dérive des tiretés ≥ zoom 0,8 par phase de motif (coût GL nul). Remplace TypedEdge en
   couche fonctionnelle.
3. **Arêtes structurelles** — TreeEdge (orthogonales, colonne vertébrale Octopus) + navigation
   (pointillés contre-zoomés). Remplace TypedEdge/TreeEdge restants → **plus aucun SVG d'arête**.
4. **Cadres de lots** (bacs, liserés, fonds à 6 %) — LotFrame devient dessin GL ; le nœud DOM
   `lot-frame` disparaît.
5. **Guides, fantômes et slots de drag** — les SVG d'overlay (`drag-ghost`, `page-drag-*`,
   snap-guides) passent au GL (mêmes refs d'état, autre rendu).
6. **Curseurs de présence** en sprites GL (remplace les curseurs téléportés DOM).
7. **Minimap** — enfin possible à coût nul : rendu du `world` réduit dans un viewport secondaire,
   rectangle de caméra interactif.

Chaque jalon : parité visuelle d'abord, mesure au runner ensuite (pan 0,4/1, zoom continu), tests
verts, commit. La re-mesure complète de fin de phase se fait contre la baseline phase 0.

## Risques suivis

- **Netteté des tiretés/points à tout zoom** (textures vs géométrie) — trancher par l'œil d'Hugo.
- **Deux caméras pendant la phase** : le pane DOM et le `world` GL doivent partager la matrice au
  pixel près — tout écart se voit immédiatement (arête décollée de sa carte). Un seul point de
  vérité : `vf.viewport`, lu par les deux.
- **Z-order** : la couche est SOUS tout le DOM du pane — les arêtes GL passent donc derrière les
  cartes comme aujourd'hui (zIndex 1 < cartes 2), mais aussi derrière les fonds de module (0) :
  l'interleaving fin arrivera quand les cadres passeront au GL (jalon 4) ; d'ici là, écart visuel
  minime accepté (les tracés sont déjà cachés par les cartes).

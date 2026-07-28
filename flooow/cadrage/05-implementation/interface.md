# Interface — panneaux flottants façon Figma

Référence assumée : **Figma**. Le canvas occupe 100 % du viewport ; toute l'UI vit dans des **panneaux flottants par-dessus le board**. Aucune sidebar dockée, aucun header pleine largeur.

## Calque de panneaux (PanelLayer)

- Un seul overlay `position: fixed; inset: 0; pointer-events: none;` — chaque panneau réactive `pointer-events: auto`. Le canvas reste interactif partout ailleurs (pan/zoom sous et entre les panneaux).
- Étages z-index (tokens Tailwind) : `z-canvas: 0` · `z-panels: 40` · `z-popover: 50` (menus, selects) · `z-modal: 60` (dialogs, rare).
- Style commun `panel` : fond `bg-white/85 dark:bg-zinc-900/85` + `backdrop-blur-md`, bord `border border-black/8`, `rounded-xl`, ombre portée douce à deux niveaux. Un seul composant de base `FloatingPanel.vue` : tous les panneaux l'utilisent (cohérence + un seul endroit à styler).

## Inventaire des panneaux

```
┌──────────────────────────────────────────────────────────────┐
│              [ Canvas ◦ Specs ◦ API ]        ← ModeSwitcher  │
│                                                              │
│  ┌──┐                                          ┌──────────┐  │
│  │▢ │ ToolDock                                 │Properties│  │
│  │□ │ (gauche,                                 │Panel     │  │
│  │⚙ │  vertical)                               │(droite)  │  │
│  │🔌│                                          │          │  │
│  │↦ │                                          └──────────┘  │
│  └──┘                                                        │
│  [front|back|all] [lots ▾]  ← FilterBar                      │
│                                                              │
│  ┌────────┐                    ● Sauvegardé · 14:32          │
│  │minimap │  ⊖ 100% ⊕ ⛶       ← StatusChip (bas droite)     │
│  └────────┘  ← ZoomBar (bas gauche)                          │
└──────────────────────────────────────────────────────────────┘
```

| Panneau | Ancrage | Contenu & comportement |
|---|---|---|
| **ModeSwitcher** | haut centre | Pill 3 segments (Canvas / Specs / API). Raccourcis `1`/`2`/`3`. Toujours visible. |
| **ToolDock** | gauche centre, vertical | Outils : sélection `V`, frame page `P`, frame section `S`, comportement `B`, service `E`, lien `L`. Un outil actif à la fois (highlight). Après création d'un élément, retour auto à sélection (comme Figma), sauf si `⇧` maintenu (création en série). |
| **PropertiesPanel** | droite, hauteur ~80 %, largeur 320 px | Apparaît à la sélection (slide-in 150 ms), disparaît quand rien n'est sélectionné. Formulaire par type de nœud (champs fixes + notes). Repliable (`⌥.`). Sélection multiple → champs communs seulement (lot, facette). |
| **FilterBar** | haut gauche, sous le dock ou à côté | Chips facette `front / back / fullstack / tous` + menu lots (colorer par lot, filtrer un lot). Les filtres **estompent** (opacity .25) plutôt que masquent — on ne perd jamais la carte. |
| **ZoomBar** | bas gauche | − / % / + , zoom-to-fit `⇧1`, toggle minimap `⇧M`. |
| **StatusChip** | bas droite | `● Sauvegardé HH:MM` / `● Modifications non sauvées` / `⟳ Autosave…`. Clic = sauvegarder. |
| **SearchPopover** | `⌘K` | Recherche de nœud par nom → centre le canvas dessus et le sélectionne. |

En mode `specs`/`api`, seuls ModeSwitcher, FilterBar et StatusChip restent ; le contenu central devient un document scrollable (max-width 880 px, centré).

## Le canvas

- **Frames pages** : rectangles à en-tête (nom + route + badge lot coloré + compteurs ⚙/🔌 + pastille d'incomplétude). Redimensionnables. Le body de la frame est la zone de drop des sections.
- **Frames sections** : mêmes codes, plus discrets (bord fin, fond légèrement teinté), contenues dans la page (Vue Flow `parentNode` + `extent: 'parent'`).
- **Comportements / services** : cartes compactes ; les services vivent hors de toute frame, plutôt en périphérie.
- **Liens typés** : navigation = trait plein avec flèche ; `consomme` = pointillé ; `déclenche` = trait + éclair ; `dépend de` = tirets longs discrets. Légende dans le menu `?`.
- Drag & drop d'une section entre deux pages : autorisé, met à jour `parentId` ([logique-algorithmes.md](logique-algorithmes.md)).
- Double-clic sur le fond = créer une page à cet endroit ; double-clic dans une page = créer une section.

## Raccourcis clavier (useKeyboard)

| Touche | Action |
|---|---|
| `V P S B E L` | outils |
| `1 2 3` | modes Canvas / Specs / API |
| `⌘Z / ⇧⌘Z` | undo / redo |
| `⌘S` | sauvegarder le fichier |
| `⌘K` | recherche |
| `Suppr` | supprimer la sélection (avec ses enfants → dialog de confirmation si la frame a des enfants) |
| `⎋` | désélectionner / fermer popover / outil sélection |
| `⇧1` | zoom-to-fit |

Les raccourcis sont désactivés quand le focus est dans un champ de saisie.

## Micro-interactions & finitions

- Hover d'un nœud : élévation légère + poignées de lien visibles. Sélection : contour 2 px couleur accent.
- Le déplacement d'une frame affiche brièvement son **numéro d'ordre** recalculé (badge « #3 ») — rend visible la règle « position = ordre du cahier ».
- Transitions de panneaux : 150 ms ease-out, jamais plus (outil de travail, pas une démo).
- Thème clair par défaut, sombre en option (`prefers-color-scheme` + toggle dans le menu `?`). Tokens de couleur centralisés dans `tailwind.config` (accent, surfaces, 8 couleurs de lots).
- Accessibilité : tous les panneaux navigables au clavier, `aria-label` sur les boutons d'icônes, focus visible, contraste AA minimum.

## Ce que l'UI ne fait pas (MVP)

Pas de multi-onglets projets, pas de panneaux déplaçables/redimensionnables par l'utilisateur (positions fixes bien choisies), pas de mode présentation. À réévaluer après usage réel.

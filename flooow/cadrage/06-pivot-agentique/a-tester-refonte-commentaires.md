# À tester — refonte notes → commentaires (session du 22/07/2026)

> Pour la prochaine session. Tout est commité (10 commits, `5eee1ed` → `fafb3f7`), 491 tests
> verts, vérifié par l'agent à l'écran — mais pas encore par toi. Terrain d'essai sans risque :
> **`data/exemples/scratch-notes-v13.graph.json`** (copie jetable de locasyst, déjà mutée par les
> tests : 1 fil résolu + 1 fil ✳ `c-claude-test`). La room réelle locasyst n'a pas été touchée —
> elle migrera d'elle-même en v13 à sa première ouverture/sauvegarde.

## 1. Migration & canvas

- [ ] Ouvrir `exemples/locasyst-project` (la vraie) : les 12 notes comportement sont devenues des
      commentaires tag « Comportement », les 48 notes API des connexions inline dans les blocs
      (avec leurs annotations), **plus aucune carte ambre flottante** sur le canvas.
- [ ] Contour ambre contre-zoomé : lisible au fitView, distinct de la sélection (sky) et des
      anneaux de présence des pairs — vérifier les trois ensemble.
- [ ] Le filet gauche coloré des blocs a disparu (retiré à ta demande).
- [ ] Compteur « 💬 n » dans l'en-tête des pages (page + ses blocs, fils ouverts seulement).
- [ ] Un fil ancré sur un PASSAGE ne met pas d'anneau sur le bloc — seulement le surlignage
      jaune du texte cité, y compris PENDANT l'édition du bloc (décorations, suivent la frappe).

## 2. Panneau latéral (💬 n en topbar)

- [ ] Les 3 largeurs : plancher 320 px (le resize bute), défaut 340, large (max 50 % écran) ;
      la largeur survit à un rechargement (localStorage).
- [ ] Fenêtre < 1200 px → panneau en OVERLAY par-dessus le canvas (le canvas ne se compresse
      pas) ; ≥ 1200 px → docké, le canvas se recadre. Échap referme.
- [ ] Lisibilité (tes retours) : corps 13 px, auteur en tête de fil (rien pour Claude ni les
      fils migrés), extraits repliés RICHES (gras/listes visibles, clampés avec fondu), fils
      regroupés par élément avec en-tête d'ancre + compteur, tooltips instantanés.
- [ ] Focus croisé : clic sur un fil → l'élément se centre sur le canvas ; clic sur un élément
      commenté → son groupe s'allume et son fil remonte EN TÊTE de la sidebar (scroll animé).
- [ ] Fil actif bien marqué (fond ambre + anneau + ombre) ; répondre, résoudre/rouvrir, tag
      custom (libellé + couleur), supprimer fil/réponse, ✎ modifier le corps.

## 3. Création

- [ ] Outil 💬 (touche C) puis clic sur une page/un bloc → POPUP ancrée à côté de l'élément :
      message, tag (libellés existants proposés), « Commenter » / « ✳ Envoyer à Claude ».
      Fermer sans envoyer ne crée rien.
- [ ] Clic droit sur une carte → « 💬 Commenter » → même popup.
- [ ] Bloc sélectionné, sélection de texte → bouton 💬 dans la bulle → popup avec le passage
      rappelé ; après envoi, le passage est surligné dans le bloc.

## 4. Commentaires « pour Claude »

- [ ] En membre (toi) : filtre « ✳ Claude », toggle ✳ sur un fil, bouton violet dans la popup.
- [ ] En NON-membre (identité rôle `client`) : aucun fil ✳ visible (panneau, compteurs,
      contours), pas de filtre ✳, pas de bouton — et le GET REST du fichier ne les contient pas.
- [ ] Bouton 🔗 d'un fil → copie `flooow://exemples/scratch-notes-v13#c-claude-test` ; coller à
      un Claude frais (n'importe quel répertoire) : « traite ce commentaire <réf> » → il lit le
      fil + la fiche de l'élément (`flooow comment`), traite, répond, résout. Le skill
      `/commentaire` (dépôt flooow) fait pareil ; hors dépôt, `docs/AGENTS.md` (posé par
      `flooow create --site` pour les nouveaux projets) enseigne le protocole.
- [ ] CLI : `pnpm -s flooow comments exemples/scratch-notes-v13 --for-claude` / `--all` /
      `--tag API`.

## 5. Caméra par vue (ton dernier retour)

- [ ] Se déplacer en arbo → basculer Fonctionnalités → revenir : la caméra retombe EXACTEMENT
      où tu l'avais laissée dans chaque vue (et la 1re entrée en fonctionnel fait un vrai
      fitView — le bug « caméra liée » venait d'un fitView qui échouait en silence).
- [ ] Le saut vers une fonctionnalité liée depuis un bloc passe par le petit bouton ↗ (le texte
      ne se clique plus).

## En option (une ligne de sudo, si tu veux un binaire global)

```bash
sudo tee /usr/local/bin/flooow >/dev/null <<'EOF' && sudo chmod +x /usr/local/bin/flooow
#!/usr/bin/env bash
exec pnpm -s -C /srv/dev/flooow flooow "$@"
EOF
```

## Reste ouvert (pas bloquant, à planifier)

- Vue **Specs** et **export markdown** lisent encore les notes (mortes depuis la migration) — à
  brancher sur les commentaires ; `PropertiesPanel` garde des branches note mortes.
- Ancrage de passage = repérage par TEXTE (repli du modèle) — l'ancrage par offsets précis avec
  re-ancrage viendra si le besoin se présente.
- Le scratch `scratch-notes-v13.graph.json` est jetable : à supprimer quand tu as fini.

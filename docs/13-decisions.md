# 13 — Journal des décisions & questions ouvertes

> Ce fichier est le registre vivant : chaque session de cadrage le met à jour.
> ✅ acté · 🔶 proposé (en attente de validation) · ❌ rejeté · ⚠️ alerte à traiter

## Décisions actées ✅ (source de vérité : `../nooma-brief-projet.md` + ce journal)

| Date | Décision |
|---|---|
| ≤ 07/2026 | Cible 5-7 ans (CP), enfant autonome, tablette-first, portrait ; consignes 100 % audio ; feedback jamais négatif ; pas de scores |
| ≤ 07/2026 | Mascotte Plouma (étoile clay, babillage→français évolutif, 3 tics) ; DA 100 % claymation pré-rendue Blender ; sprite sheets 12-15 fps |
| ≤ 07/2026 | 4 piliers pédagogiques ; 17 mécaniques de mini-jeux (5+4+4+4) comme briques de base |
| 28/07/2026 | **Équipe = Hugo fondateur solo** (100 % capital et direction) ; **Florence**, amie orthophoniste, intervient en **conseil métier** (relecture pédagogique), sans parts ni co-direction — ⚠️ *si la collaboration s'approfondit, prévoir un avenant/doc formel pour l'intégrer réellement au projet (parts, co-direction) ; déclenché par Hugo* |
| 28/07/2026 | **Développement majoritairement vibe codé** (IA/Claude Code) — avec garde-fous : CI juge, zones à revue humaine obligatoire (gate/PIN, import, achats, manifests), zéro dépendance ajoutée sans décision humaine (doc 06 §7) |
| 28/07/2026 | **Hugo gère toute la 3D** (Blender + addon **Clay Doh**, rendu Cycles — sans impact app car tout est pré-rendu) — pipeline détaillé doc 14 |
| 28/07/2026 | **Florence prête sa voix à Plouma** (consignes, phonèmes, babillages) — remplace le plan TTS ; TTS = outil d'itération dev uniquement ; autorisation écrite voix à intégrer à la lettre de mission (docs 05 §5, 09 §5.2) |
| 28/07/2026 | **Outillage de cadrage** : viewer de doc (hérité de locasyst-api) + catalogue de fonctionnalités fusionnés dans `/cadrage` — 76 postes chiffrables (SOC/MAP/JEU/DIR/MAS/REC/MOD/PAR/AUD/CNT/LAN), lots Proto/V1/V1.1/V2, commentaires ancrés, export PDF (`npm start`). L'édition multi-sessions de flooow n'est pas reprise (assumé) |
| 28/07/2026 | **Flooow vendorisé dans `/flooow`** (snapshot du 28/07, hors node_modules/.git) avec un **graphe projet Plouma versionné** (`flooow/data/nooma/`, 10 écrans seedés depuis le catalogue) — `npm run flooow` (Vite 5173 + API 3011, script dev-local sans l'infra podman/Caddy). Flooow = graphe visuel ; catalogue = référence texte chiffrable |
| 07/2026 | **Progression infinie adaptative** : biome = module de compétences, niveaux générés par le Directeur jusqu'à validation, changement de biome à la maîtrise, niveaux surprises/rappels — remplace « 5 mondes × 8-12 niveaux fixes » (formalisé doc 04, à confirmer ci-dessous) |
| 07/2026 | Anti-dark-patterns comme principe produit ET argument public (doc 03 §5) — dont : Plouma jamais triste au départ de l'enfant |
| 29/07/2026 | **Nom retenu : « Plouma »** (remplace « Nooma », abandonné pour marque FR identique + saturation) — renommage de `/docs` effectué ; réservation `plouma.fr`/`plouma.app` + avis CPI + dépôt INPI restant à faire (doc 09 §5.4) |

## Propositions en attente de validation 🔶 (à trancher ensemble, par priorité)

### Urgence ⚠️
1. **Marque — nom retenu « Plouma »** (29/07/2026, remplace « Nooma » abandonné). L'ancien nom a été écarté : marque FR verbale identique FR5209947 (cl. 41/42 éducation/logiciels) + saturation mondiale + domaines pris (détail doc 09 §5.4). Renommage effectué dans `/docs` ; le code et le dépôt gardent « nooma » comme nom technique interne. **Restent à faire avant dépôt et com publique** : réserver `plouma.fr`/`plouma.app` (~30 €), test oral auprès d'enfants de 5 ans, avis CPI (coexistence avec **PLOUMANAC'H** cl. 41 à confirmer — risque jugé faible), dépôt INPI verbal + semi-figuratif (cl. 9+41+42). (doc 09 §5.4)
2. **Lettre de mission de l'orthophoniste conseil** (1 page, avec cession/autorisation écrite sur les contenus qu'elle rédige ou corrige). (doc 09 §5.2-5.3)

### Produit
3. Modèle biomes/infini détaillé (doc 04) : ~10-14 biomes, découplage du calendrier scolaire, session-menu (échauffement/cœur/dessert), typologie des 5 niveaux surprises.
4. Modes de jeu (doc 03 §4) : maison de Plouma, histoires, rendez-vous hebdo ; co-jeu parent v2.
5. Récompenses « tournées vers l'univers » (offrir à Plouma/aux habitants plutôt qu'accumuler) (doc 03 §2.2).
6. Ajout de mécaniques d'**encodage** (dictée muette, machine à mots) — manque identifié (doc 02 §4.5).
7. Surnom par défaut plutôt que vrai prénom (doc 07 §4).

### Pédagogie (avec l'orthophoniste)
8. Progression des graphèmes (doc 02 §2) et règle « 100 % déchiffrable ».
9. Paramètres du Directeur : cible 80-85 %, Leitner J+1/J+3/J+7/J+14, blocking→interleaving, mix 70-80/20-30 (doc 02 §5).
10. Police d'affichage des lettres (a simple vs double étage, cursive) (doc 05 §7).
11. Gestes Borel-Maisonny dans les mini-jeux : oui/non/comment (doc 02 §4.2).

### Technique
12. Stack **Flutter + Flame + flutter_soloud + Drift** (doc 06 §1) — recommandation ferme, à confirmer après Test A.
13. Event log + projection ; Elo vs moyenne glissante en v1 (doc 06 §3-4).
14. Absence totale de permission INTERNET en v1 (doc 07 §2) — à arbitrer vs paiement Phase 4.

### Business
15. Freemium : 2 biomes gratuits + abonnement ~59-79 €/an dans l'espace parent (doc 09 §3).
16. Kids Category Apple : oui (recommandé doc 11 §2).
17. Séquence financement : incubateur → Bourse French Tech + Édu-Up → CII (doc 09 §4).
18. Télémétrie : option 1 (aucune en v1) + option 3 (rapport manuel parent) (doc 07 §7).

## Rejeté ❌

| Date | Option | Raison |
|---|---|---|
| ≤ 07/2026 | Style peint façon Arcane | Production studio irréaliste en solo (brief §10) |
| ≤ 07/2026 | Rive pour la mascotte | Remplacé par sprite sheets Blender |
| 07/2026 | Godot 4 | Latence audio Android non résolue — rédhibitoire (doc 06 §1) |
| 07/2026 | Unity, React Native, Capacitor | Voir comparatif doc 06 §1 |
| 07/2026 | Hive / Isar | Abandonnés par leurs mainteneurs → Drift (doc 06 §3) |
| 07/2026 | Streaks, timers, vies, daily quests, récompenses annoncées, mascotte triste | Dark patterns enfants — interdits par principe et par les référentiels (doc 03 §5) |
| 07/2026 | Positionnement médical (« dys », « rééducation ») | Bascule en dispositif médical (CE, essais cliniques) — voie Poppins, hors de portée v1 (doc 10 §1) |
| 07/2026 | Mondes téléchargeables à la demande (idée du brief) | Play Asset Delivery sans support Flutter officiel, iOS ODR déprécié → tout embarqué ≤200 Mo (doc 08 §2) |

## Dette documentaire

- `../nooma-brief-projet.md` contient encore l'ancien modèle (5 mondes fixes, dev solo, Hive/Isar, mondes téléchargeables) → à mettre à jour après validation des points ci-dessus.
- `plan-projet.md` : décomposé dans cette doc, conservé en pointeur.
- Prototype `nooma-prototype.html` : toujours absent — remplacé de fait par le prototype Flutter de la Phase 2.

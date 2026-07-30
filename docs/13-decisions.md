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
| 30/07/2026 | **Modèle biomes/infini validé tel quel** (doc 04) : ~10-14 biomes (lancement 4-5), progression pilotée par la maîtrise et découplée du calendrier scolaire, session-menu 5-10 min (accueil → échauffement → cœur → dessert → clôture, 1-2 sessions/jour), typologie des 5 niveaux surprises (cadeau, écho, rêve, visite, défi) |
| 30/07/2026 | **Encodage en v1** : « dictée muette » et « machine à mots » entrent dans le réservoir (17 → 19 mécaniques) — comble le manque n°1 (doc 02 §4.5) |
| 30/07/2026 | **Récompense par défaut = fragments de langue, concrétisés en « dictionnaire de Plouma »** : au fil des exercices, Plouma débloque des compréhensions de notre langage → un dictionnaire se remplit (représentation UI à designer) + récompenses « tournées vers l'univers » (offrir plutôt qu'accumuler) (docs 03 §2.2, 04 §5.3) |
| 30/07/2026 | **Modes de jeu recentrés** : l'Aventure = seul cœur v1 ; maison de Plouma **en attente** (pertinence à requestionner) ; histoires **à cadrer** (pas le cœur du besoin) ; rendez-vous hebdo **retiré** pour l'instant ; co-jeu parent = piste v2 à explorer (split-screen même écran vs lobby local — ⚠️ toute variante réseau serait incompatible avec zéro permission INTERNET) (doc 03 §4) |
| 30/07/2026 | **Pédagogie pré-validée par Hugo, à confirmer par Florence** : progression des graphèmes + règle « 100 % déchiffrable » (doc 02 §2) ; paramètres du Directeur (cible 80-85 %, Leitner J+1/J+2-3/J+7/J+14, blocking→interleaving, mix 70-80/20-30) = **défauts du simulateur** ; police **Andika** par défaut (Belle Allure si cursive) (doc 05 §7) |
| 30/07/2026 | **Stack Flutter + Flame + flutter_soloud + Drift actée sous réserve du Test A** (proto Blender→Flutter fluide sur tablette 2 Go = point de non-retour) (doc 06 §1) |
| 30/07/2026 | **Event log append-only + projection** ; modèle de maîtrise v1 = **moyenne glissante pondérée + décroissance** (Elo/BKT = candidats v2, comparables en simulation) (doc 06 §3-4) |
| 30/07/2026 | **Zéro permission INTERNET sur Android en v1** — argument d'audit ; réévalué en Phase 4 (paiement) (doc 07 §2) |
| 30/07/2026 | **Vrai prénom par défaut** à la création du profil (renverse la proposition « surnom par défaut ») — le surnom reste une option. Conséquence : Plouma ne prononce pas le prénom libre (pas de TTS embarqué) → interpellations génériques enregistrées par Florence (doc 07 §4) |
| 30/07/2026 | **Freemium validé** : 2 biomes complets gratuits + abonnement ~59-79 €/an dans l'espace parent ; **Kids Category Apple : oui** (docs 09 §3, 11 §2) |
| 30/07/2026 | **Simulateur du Directeur** : construit en TypeScript zéro-dépendance dans `/cadrage/simulateur` (enfants virtuels, dashboard dans le viewer) ; portage Dart après le Test A, le simulateur servant d'oracle de non-régression |
| 30/07/2026 | **Graphe de compétences v1 + banque Syllabes v1 produits dans `/contenu`** (12 modules/biomes, 47 compétences, 100 mots tagués, lint `npm run lint-contenu`, vue de relecture `contenu/graphe-competences.md`) — **en attente de relecture par Florence**. Le simulateur tourne sur ce vrai graphe : sur 36 semaines simulées, profil rapide 12/12 modules, moyen 10/12, lent 8/12, en difficulté 4/12 — la différenciation par maîtrise fonctionne |
| 30/07/2026 | **Actions marque reportées à bien plus tard** (décision Hugo) : réservation domaines, test oral, avis CPI, dépôt INPI — à faire impérativement **avant toute com publique** (le garde-fou de la roadmap reste) |
| 30/07/2026 | **Cartes-mondes : caméra orthographique 3/4** (règle le problème de perspective au scroll — pas de « mauvais côté » des objets), profondeur par parallax de couches + zoom ; cinématiques = travellings pré-rendus ; pistes à bencher au Test A : shader de profondeur (Z-pass) et scrub de travelling. Cohérent avec le lobby en tuiles iso (docs 05 §6, 04 §6.1) |
| 30/07/2026 | **Socle Flutter posé** (`/app`, via sous-agents) : Flutter 3.44.8, deps actées épinglées, CLAUDE.md règles inviolables, audit dépendances bloquant, CI, rng/params/maitrise portés en Dart avec tests d'oracle croisé contre le simulateur |

## Propositions en attente de validation 🔶 (à trancher ensemble, par priorité)

### Urgence ⚠️
1. **Marque — nom retenu « Plouma »** (29/07/2026, remplace « Nooma » abandonné). L'ancien nom a été écarté : marque FR verbale identique FR5209947 (cl. 41/42 éducation/logiciels) + saturation mondiale + domaines pris (détail doc 09 §5.4). Renommage effectué dans `/docs` ; le code et le dépôt gardent « nooma » comme nom technique interne. **Restent à faire avant dépôt et com publique** : réserver `plouma.fr`/`plouma.app` (~30 €), test oral auprès d'enfants de 5 ans, avis CPI (coexistence avec **PLOUMANAC'H** cl. 41 à confirmer — risque jugé faible), dépôt INPI verbal + semi-figuratif (cl. 9+41+42). (doc 09 §5.4)
2. **Lettre de mission de l'orthophoniste conseil** (1 page, avec cession/autorisation écrite sur les contenus qu'elle rédige ou corrige). (doc 09 §5.2-5.3)

### Produit
3. **Maison de Plouma** : pertinence à requestionner (mise en attente le 30/07 — pas actée, pas rejetée) (doc 03 §4).
4. **Coin histoires** : à cadrer (contenu, coût de prod audio) — pas le cœur du besoin (doc 03 §4).
5. **Co-jeu parent (v2)** : arbitrer split-screen même écran vs lobby local (⚠️ réseau incompatible avec zéro INTERNET) (doc 03 §4).
6. **Représentation du « dictionnaire de Plouma »** : design UI/UX de la collection de fragments de langue à produire (docs 03 §2.2, 04 §5.3, 05).
7. **Sortie de biome : ~40 niveaux réels vs « 8-15 » attendus** (résultat du simulateur, 30/07) : assumer ~40 niveaux courts / ne compter que les niveaux cœur comme nœuds du chemin / assouplir la validation — la durée-calendrier (2-3,5 semaines/biome) est, elle, dans la cible (doc 04 §2).

### Pédagogie (avec l'orthophoniste)
8. Confirmation par Florence des pré-validations du 30/07 : progression des graphèmes + « 100 % déchiffrable », paramètres du Directeur, police Andika.
9. Gestes Borel-Maisonny dans les mini-jeux : oui/non/comment (doc 02 §4.2) — **reporté le 30/07**.

### Business
10. Séquence financement : incubateur → Bourse French Tech + Édu-Up → CII (doc 09 §4) — **reporté le 30/07** (à revoir à la création de la SASU).
11. Télémétrie : option 1 (aucune en v1) + option 3 (rapport manuel parent) (doc 07 §7) — **reporté le 30/07**.

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
| 30/07/2026 | Surnom par défaut au lieu du prénom | Hugo tranche pour le **vrai prénom par défaut** (attachement) ; le surnom devient une simple option (doc 07 §4) |
| 30/07/2026 | Mode « Rendez-vous » (cadeau hebdo, événements) | Retiré du périmètre pour l'instant — pourra revenir plus tard (doc 03 §4) |

## Dette documentaire

- `../nooma-brief-projet.md` contient encore l'ancien modèle (5 mondes fixes, dev solo, Hive/Isar, mondes téléchargeables) → à mettre à jour après validation des points ci-dessus.
- `plan-projet.md` : décomposé dans cette doc, conservé en pointeur.
- Prototype `nooma-prototype.html` : toujours absent — remplacé de fait par le prototype Flutter de la Phase 2.

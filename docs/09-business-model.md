# 09 — Business model, financement, structure juridique

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Recherche sourcée juillet 2026 — les prix/dispositifs évoluent vite, re-vérifier au moment des décisions.

## 1. Le marché

- EdTech mondial : 187-404 Md$ selon les périmètres ; segment apps éducatives enfants ~7-10 Md$, croissance 13-18 %/an.
- **France** : la filière EdTech pèse 1,6 Md€ (2023), mais le scolaire/parascolaire numérique ne fait que ~89 M€. Le vrai gisement est le **B2C famille** : le soutien scolaire parental pèse 2-3 Md€/an ([source](https://www.economiematin.fr/etat-des-lieux-marche-soutien-scolaire-france)).
- Conclusion : **vendre aux parents, pas aux écoles** (les écoles = crédibilité, pas revenu — voir §4).

## 2. Le paysage concurrentiel a changé ⚠️ (info majeure, juillet 2026)

**Poppins (ex-Mila) n'est plus un concurrent frontal.** Avis HAS favorable pour la prise en charge anticipée (PECAN) par l'Assurance Maladie : accès **sur prescription** (~août 2026), positionnement « thérapie digitale » pour enfants dys 7-11 ans, dispositif médical CE, essai clinique Pitié-Salpêtrière, ~20 M€ levés ([FNO](https://fno.fr/poppins-clinical-ce-quil-faut-retenir-de-lavis-de-la-has/)). Ses prix : 26-39 €/mois selon engagement.

Conséquences pour Plouma :
- Le créneau **« apprentissage grand public de la lecture CP, 5-7 ans »** est plus ouvert que prévu — Poppins monte en gamme médicale et laisse le terrain prévention/apprentissage.
- ⚠️ La **caution scientifique devient la norme du secteur** : « conçu avec une orthophoniste » est le minimum ; à terme, une étude d'efficacité (même modeste, avec une école partenaire) sera un différenciateur réel.
- La voie « remboursement/mutuelles » existe (marquage CE médical + essai clinique) mais c'est une **barrière très haute** — à exclure en v1, à garder comme option stratégique long terme si le produit pivote vers le soin.

Autres modèles observés : Lingokids ~60 $/an, Holy Owly 60-96 €/an, Bayam ~90 €/an, Duolingo ABC **gratuit** (produit d'image), Khan Academy Kids **gratuit** (nonprofit), Lalilo gratuit pour les profs (racheté par Renaissance), Kaligo ~199 €/classe/an, HappyNeuron Pro **8 000 orthophonistes abonnés à 49-59 €/mois**.

## 3. Recommandation de modèle 🔶

**Freemium doux → abonnement annuel famille, décidé et payé par le parent, invisible pour l'enfant.**

| Élément | Proposition | Justification |
|---|---|---|
| Gratuit | Les 2 premiers biomes complets (~2-4 semaines de jeu réel) | Essai réel, pas un teaser frustrant ; l'attachement à Plouma se construit avant le paywall |
| Payant | **Abonnement annuel ~59-79 €/an** (+ mensuel ~7,99 €/mois sans engagement, pour l'accessibilité) | Standard du marché (50-90 €/an) ; l'annuel domine en Education (59-66 % des abonnements — [RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps-2026-education/)) |
| Où on paie | **Uniquement dans l'espace parent** (derrière le PIN + parental gate) | L'enfant ne voit jamais ni prix ni mur ; la limite est racontée par la narration (« la suite du voyage se prépare ») |
| 1 abonnement | = tous les enfants du foyer (multi-profils) | Argument famille, aligné Poppins (2 enfants) |
| Essai | 7 jours sur le contenu payant | Standard du secteur (trials 5-9 jours dominants) |

⚠️ Réalités chiffrées à intégrer au business plan : conversion download→trial médiane ~6,5 % en Education (la plus faible de toutes les catégories), churn 1er renouvellement mensuel 15-40 %, LTV réalisée année 1 ~23 $/payeur. Traduction : **il faut un volume de téléchargements important ou un panier annuel solide** — d'où le plan annuel par défaut et un onboarding parent très soigné (c'est LE point de conversion).

**Exclusions définitives** ✅ : pub, achats visibles par l'enfant, monnaie achetable, vente de données. (C'est aussi une exigence de conformité stores — voir doc 11.)

**Pistes de revenus complémentaires (v2+)** 🔶 :
- **B2B orthophonistes** : licence pro (tableau de bord multi-patients, réglages fins) — marché solvable prouvé par HappyNeuron (49-59 €/mois). L'orthophoniste conseil connaît intimement ce marché. Piste sérieuse mais produit différent : ne pas la laisser diluer la v1 grand public.
- Comités d'entreprise, coffrets cadeaux (cartes d'abonnement), médiathèques.

## 4. Financements non dilutifs (France, état 2025-2026)

Cumul réaliste : **100-150 k€ non dilutifs** sur 18-24 mois si le dossier est bien mené.

| Dispositif | Montant | Condition clé |
|---|---|---|
| **Bourse French Tech** (Bpifrance) | Jusqu'à 50 k€ (70 % des dépenses) | Entreprise <1 an **ou** créateur accompagné par un incubateur → ⚠️ **intégrer un incubateur AVANT de créer la société** |
| **Édu-Up** (Éducation nationale) | Jusqu'à ~70 k€ (50 % du projet) | Ressources numériques éducatives ; priorités « savoirs fondamentaux » et « école inclusive » — **le dispositif le plus aligné avec Plouma**, l'orthophoniste est un atout dossier majeur |
| **Crédit d'Impôt Innovation** | 20 % des dépenses d'innovation (plafond 400 k€/an) | Dès le premier exercice ; prototypes de produits nouveaux |
| Aides régionales (ex. Innov'up IDF) | Jusqu'à 100 k€ (faisabilité) | Selon région |
| ACRE/ARCE | Exonérations + capital ARE | Si demandeur d'emploi au moment de la création |

Écosystème à activer : association **EdTech France** (veille des appels à projets), le **110 bis** (lab de l'Éducation nationale — réseau et légitimité), incubateurs généralistes.

**Séquence conseillée** : incubateur → Bourse French Tech + dossier Édu-Up en parallèle → création société → CII dès le 1er exercice.

## 5. Structure juridique 🔶

### 5.1 Forme : **SASU** (fondateur solo) ✅

Hugo reste seul au capital et à la direction ; l'orthophoniste intervient en conseil amical, sans parts ni mandat.

- **SASU** (SAS unipersonnelle) : mêmes atouts que la SAS (liberté statutaire, passage à plusieurs associés trivial plus tard, BSPCE possibles si un jour besoin), président assimilé salarié.
- Coût plancher de création ~250 € HT + rédaction des statuts.
- Alternative transitoire : rester en micro-entreprise/EI jusqu'aux premiers revenus est possible, mais ⚠. la **Bourse French Tech et Édu-Up supposent une société** (ou une création imminente encadrée par un incubateur) et le CII exige une société à l'IS — la SASU s'impose dès que les dossiers de financement démarrent.

### 5.2 Le rôle de l'orthophoniste conseil 🔶 (cadrer léger, mais cadrer)

Pas d'association, donc pas de pacte ni de vesting. Deux points restent utiles, même (surtout) entre amis :
- Une **lettre de mission / convention de conseil très simple** (1 page) : bénévole ou défrayée, périmètre (relecture pédagogique, conseils), confidentialité, le point IP ci-dessous, **et l'autorisation d'exploitation de sa voix** (Florence prête sa voix à la mascotte — usage commercial, durée, supports, mention de son nom oui/non). Ça protège l'amitié autant que le projet.
- Si un jour son implication grandit, tout reste ouvert (BSPCE, parts…) — mais c'est un choix futur, pas une ambiguïté présente.
- ✅ Une orthophoniste libérale conventionnée peut légalement conseiller une société tierce ; les limites déontologiques (pas de reco à sa patientèle) restent valables — voir [10-marketing-communication.md](10-marketing-communication.md) §2.

### 5.3 Propriété intellectuelle ⚠️

- **Le code écrit avant la création de la société t'appartient personnellement** — prévoir une cession écrite ou un apport en nature dans les statuts (dispense de commissaire aux apports si aucun apport >30 k€ et total <50 % du capital).
- ⚠️ **Tout contenu qu'elle rédige ou corrige** (listes de mots, progressions, formulations de consignes) est protégé par le droit d'auteur et **lui appartient par défaut**, amie ou pas : une cession/autorisation écrite (intégrée à la lettre de mission §5.2) évite toute ambiguïté future — c'est 3 lignes maintenant, un problème insoluble dans 3 ans.
- Preuve d'antériorité du code : dépôt APP (~415 €/an tarif startup) ou enveloppe Soleau INPI.

### 5.4 La marque ⚠️⚠️ VERDICT (recherche d'antériorité du 28/07/2026) : **ancien nom « Nooma » déconseillé — risque moyen-élevé → nom retenu « Plouma » (29/07/2026)**

Recherche menée sur TMview/EUIPO/data.inpi.fr, stores (iTunes API, Google Play) et domaines (RDAP). Constats :

1. **L'obstacle principal : une marque française verbale « Nooma » strictement identique** — [FR n° 5209947](https://data.inpi.fr/marques/FR5209947), déposée le 18/12/2025, **enregistrée le 10/04/2026** (titulaire : SAM SAS, Vertou), classes 35/38/**41/42**, dont les intitulés « **éducation ; formation** » et « **logiciels ; SaaS** ». En opposition INPI, la comparaison se fait sur les libellés, pas l'usage réel : signe identique + intitulés chevauchants = risque d'opposition réel. Le titulaire a déjà négocié un retrait partiel (probable coexistence avec Noom, Inc.) → il défend activement sa marque.
2. **Le nom est mondialement saturé** : ≥12 produits « Nooma » actifs (3 apps « Nooma » déjà sur l'App Store FR, studios fitness Noomalife avec marques US cl. 41, dépôts US 2026 en cl. 9/41 par Empathic Labs pour une app « Nooma », boisson, série vidéo, RH…). Même en l'emportant en France, la marque serait **faiblement défendable**.
3. **Aucun domaine clé disponible** : nooma.fr (conciergerie), nooma.app, nooma.io — tous pris.
4. Risque par territoire : **France/UE moyen-élevé** (marque identique récente en 41/42) ; **US élevé** (Noomalife cl. 41 enregistrée, Empathic Labs cl. 9/41 en examen).

**Décision : renommer** (Hugo, 28/07/2026), avec un **nom inventé, pas un prénom, sans finale en « -ou »** (trop « surnom »). La coexistence avec SAM SAS a été écartée (coût/délai incertains, ne règle ni les domaines ni les US).

> ✅ **Nom retenu : « Plouma »** (Hugo, 29/07/2026 — shortlist #2 ci-dessous). Seul risque notable identifié : coexistence avec **PLOUMANAC'H** (cl. 41, commune de Perros-Guirec) — jugé faible, **à confirmer par l'avis CPI**. Renommage effectué dans toute la doc `/docs` (le nom de code interne « Nooma » subsiste dans les chemins techniques et le nom du dépôt). **À faire avant dépôt** : réserver `plouma.fr`/`plouma.app`, test oral auprès d'enfants de 5 ans, avis CPI, dépôt INPI (cl. 9+41+42).

**Candidats vérifiés le 28/07/2026** (TMview tous offices via API + fichier prénoms INSEE 1900-2025 + iTunes Search API + RDAP AFNIC/Google Registry) — classement :

| Rang | Nom | État juridique | Domaines | Note |
|---|---|---|---|---|
| 1 | **Zintille** (contraction de « scintille ») | **0 marque tous offices**, 0 prénom, 0 app | .fr ✅ .app ✅ | Suggestif étoile sans être descriptif ; rime avec « gentille/brille » ; à faire vérifier vs marques SCINTILL* par CPI |
| 2 | **Plouma** (plume + babil « ploum ») | 0 marque exacte (seul PLOUMANAC'H, cl. 41 commune de Perros-Guirec — risque faible à évaluer) | .fr ✅ .app ✅ | Le plus « pâte à modeler » ; .com pris (boutique) |
| 3 | **Brillune** (brille + lune) | 1 marque coréenne cl. 25 sans effet UE | .fr ✅ .app ✅ | Céleste, doux ; mascotte = étoile pas lune |
| 4 | **Étinelle** (étincelle sans le cluster -nc-) | 0 exacte, ⚠️ « Retinelle » FR cl. 9 (2026) phonétiquement proche + distinctivité faible vs « étincelle » — arbitrage CPI | .fr ✅ .app ✅ | Peut remonter en tête si le CPI valide |
| 5 | **Ploumelle** | 0 marque, 0 prénom, 0 app | .fr ✅ .app ✅ | Vierge mais évocation étoile faible ; parenté lointaine avec « Plumette » (FR cl. 41, 2025) |

Écartés après vérification : Loupiote (nom commun, 17 marques dont cl. 9/41/42, domaines pris), Lumette (marque de boissons EM/US + évoque « allumette »), Ploumette (quasi-homophone de PLUMETTE FR cl. 41 2025), Plouna (quasi-homophone du prénom Louna), Stellune (marque US cl. 28 jouets 2026 + .fr/.app pris + sonne prénom), Babiline (collision d'univers avec les crèches Babilou, cl. 41), Ploumi (marque PLOUMI EM + .fr pris), tous les « -ou ».

**Prochaines étapes nommage** : (1) réserver **immédiatement** les .fr/.app du top 3 (~30 € — ces niches se remplissent : ploumi.fr pris en 05/2026, stellune.fr en 07/2026) ; (2) tester à l'oral Zintille/Plouma/Brillune avec des enfants de 5 ans (prononciation spontanée, mémorisation) ; (3) avis CPI sur le nom retenu (similarités phonétiques approfondies cl. 9/41/42 + 16/28, dénominations sociales/RCS) ; (4) dépôt INPI verbal + semi-figuratif (mascotte).

⚠️ Dans tous les cas : **avis de disponibilité par un Conseil en Propriété Industrielle (~500-1 000 €) avant de déposer le nom retenu** (les outils publics ne sont pas les registres officiels, et la recherche phonétique exhaustive n'a pas été faite). Puis dépôt INPI 270 € (classes 9+41+42) + réservation immédiate des domaines .fr/.app.

### 5.5 Séquence juridique complète conseillée

Recherche d'antériorité → décision marque → intégration incubateur → création **SASU** (statuts avec apport/cession du code) → lettre de mission orthophoniste (avec volet IP) → dépôt APP → dossiers de financement.

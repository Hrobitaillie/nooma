# 11 — Conformité stores (Apple Kids / Google Play Families)

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> État des règles : juillet 2026. Ces politiques bougent — re-vérifier avant chaque soumission.

## 1. Vue d'ensemble

Le choix **100 % offline / sans compte / sans pub / sans tracking** ✅ est un **super-pouvoir de conformité** : il neutralise l'essentiel du RGPD, de COPPA et des contraintes stores, et le label « Data Not Collected » devient un argument marketing. Mais 4 livrables restent incompressibles :

1. **Privacy policy hébergée** (exigée par les deux stores même à collecte nulle)
2. **Labels de confidentialité** : « Data Not Collected » (Apple) + Data safety form (Google)
3. **Parental gate sur tout lien sortant et tout achat** — y compris le bouton « Espace parents »
4. **Questionnaires d'âge** des deux stores (refonte 2025-2026)

## 2. Apple — Kids Category (guideline 1.3)

- **Choisir la Kids Category** 🔶 recommandé : review plus sévère, mais droit exclusif d'utiliser « pour enfants » dans les métadonnées (§2.3.8) + confiance parents + collections éditoriales Kids. Tranche d'âge : **6-8 ans**.
- Interdits : liens sortants, achats et « distractions » hors zone protégée par parental gate ; transmission de données personnelles/appareil à des tiers ; pub comportementale (en pratique : zéro pub, zéro analytics tiers).
- **Parental gate** : tâche « de niveau adulte ». ⚠️ Pour des **pré-lecteurs** (notre cible exacte), Apple recommande une consigne **vocale** (ex. « maintenez les deux boutons et résolvez 23 + 41 ») — un simple « appuyez 3 secondes » est régulièrement rejeté. Le gate ne remplace PAS le consentement parental RGPD/COPPA si un jour on collecte des données.
- ⚠️ **Motif n°1 de rejet : un SDK tiers détecté dans le binaire, même inactif** (Firebase Analytics, crash reporter embarqué par défaut par un framework). Auditer le binaire avant soumission (voir doc 07 §5).
- **Deadline** : questionnaire détaillé du nouveau système d'age ratings obligatoire (refonte iOS 26 : tranches 13+/16+/18+ ajoutées) — à remplir dès la création de la fiche.
- Compte développeur : 99 $/an, review typique 24-48 h mais prévoir des allers-retours pour une première app Kids.

## 3. Google Play — Families

- Déclaration **Target Audience and Content** : public cible enfants → **Families Policy Requirements** s'appliquent : pas de transmission AAID/IMEI/MAC, pas de localisation, **SDK tiers uniquement s'ils sont certifiés « Families »**, Data safety form + privacy policy obligatoires.
- **Badge « Teacher Approved »** : pas de candidature — panel d'enseignants (programme conçu avec Harvard/Georgetown) qui évalue valeur pédagogique, adéquation à l'âge, absence de mécaniques agressives. Objectif explicite pour Plouma : notre design anti-dark-patterns (doc 03 §5) est exactement leur grille.
- ⚠️ **Compte développeur personnel : obligation de test fermé — 12 testeurs pendant 14 jours — avant tout accès production.** À anticiper dans la roadmap beta (les familles beta de la Phase 3 servent à ça).
- Compte : 25 $ une fois ; vérification d'identité ; délais de review 7-21 jours pour un nouveau compte en catégorie sensible.
- Nouveautés 2025-2026 : politique « Age-Restricted Content and Functionality » (oct. 2025), Play Age Signals API en bêta — à surveiller, sans impact immédiat pour une app sans compte ni chat.

## 4. Réglementation applicable (résumé — détail dans doc 07)

| Texte | Impact sur Plouma v1 offline |
|---|---|
| RGPD (France : consentement parental < 15 ans) | Quasi neutralisé si rien ne quitte l'appareil ; réactivé par tout SDK/analytics/backend |
| COPPA (si distribution US) | Hors champ sans collecte ; un seul identifiant persistant collecté suffit à y entrer |
| DSA | Hors champ (pas de contenu utilisateur) ; ses lignes directrices « mineurs » (juill. 2025) restent notre référentiel design volontaire |
| Loi majorité numérique 2023, SREN | Hors champ (réseaux sociaux) |
| **European Accessibility Act** (depuis juin 2025) | Le tunnel d'achat in-app relève du e-commerce, mais **exemption micro-entreprise** (<10 salariés, ≤2 M€ CA) → exemptés au démarrage ; l'accessibilité reste stratégique (voir doc 05 §7) |
| Loi du 19/02/2024 (image des enfants) | Marketing : autorisation écrite des **deux** parents pour toute image d'enfant |
| Recommandation CNIL apps mobiles (2024-2025) | Campagne de contrôles en cours ciblant les SDK — notre zéro-SDK nous met hors de portée |

## 5. Checklist de soumission (à dérouler avant chaque release) 🔶

- [ ] Binaire audité : aucun SDK analytics/ads/crash non certifié (`flutter build` + inspection des dépendances natives)
- [ ] Privacy policy en ligne, à jour, liée dans les deux fiches
- [ ] Labels Apple « Data Not Collected » cohérents avec la réalité du binaire
- [ ] Data safety form Google cohérent
- [ ] Parental gate testé (vocal, pré-lecteur ne peut pas passer) sur : espace parent, achat, tout lien sortant
- [ ] Questionnaire d'âge Apple + déclaration public cible Google remplis
- [ ] Aucune mention « pour enfants » dans les métadonnées si on n'est PAS en Kids Category (et réciproquement : on y a droit si on y est)
- [ ] Captures/vidéos conformes (pas d'UI inventée)
- [ ] Test fermé Google 12 testeurs/14 jours validé (compte perso)
- [ ] Aucun vocabulaire médical (« dyslexie », « rééducation »…) dans les fiches store

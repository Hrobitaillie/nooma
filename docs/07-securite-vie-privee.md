# 07 — Sécurité et vie privée

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Une app pour enfants de 5-7 ans : la vie privée n'est pas une contrainte, c'est un pilier du produit et un argument commercial.

## 1. La position de principe ✅

**Aucune donnée ne quitte l'appareil en v1.** Pas de compte, pas de backend, pas d'analytics, pas de crash reporting tiers, pas de pub. Conséquences en cascade :

- RGPD : si rien ne sort de l'appareil, l'éditeur ne « traite » rien — obligations réduites à la minimisation, la sécurité by design et la privacy policy (due aux stores de toute façon).
- COPPA (US) : « collection » = transmission en ligne (16 CFR 312.2) → app sans réseau = hors champ, pas de consentement parental vérifiable requis.
- Stores : label Apple « **Data Not Collected** » et Data safety Google « No data collected » — légitimes et vérifiables.
- ⚠️ **Tout cela tient à un fil : le moindre SDK qui téléphone (même un crash reporter) fait tout basculer** — réintroduit RGPD, COPPA (règle durcie par la FTC en janvier 2025), et casse les labels. D'où la règle §2.

## 2. Règle d'or : zéro SDK réseau, zéro permission ⚠️

- **Zéro SDK tiers qui communique** : pas de Firebase (même Analytics « désactivé »), pas de Sentry/Crashlytics, pas d'attribution. Le motif n°1 de rejet en Kids Category est un **SDK détecté dans le binaire même inactif**. Audit des dépendances (transitive incluses) avant chaque release — à mettre en CI.
- **Zéro permission dangereuse** : pas de localisation (interdite par Google Families de toute façon), pas de micro/caméra en v1 (le jour où la lecture à voix haute arrive en v2+, le micro se traite avec un dossier béton : traitement 100 % local, jamais d'enregistrement conservé).
- 🔶 **Viser l'absence totale de permission INTERNET sur Android en v1** : techniquement possible pour une app 100 % offline, et c'est un argument d'audit massue (« l'app ne PEUT PAS envoyer de données »). ⚠️ À arbitrer : ça interdit aussi le paiement in-app et tout lien sortant → probablement tenable en beta, à réévaluer quand le paiement arrive (Phase 4).
- **Android** : `AD_ID` à retirer explicitement du manifest (souvent injecté par des SDK transitifs), `allowBackup` configuré finement (voir §4), aucun composant `exported` inutile.
- **Pas de WebView, aucune** ⚠️ : risque technique (bridges JS) et risque de review (contenu web non maîtrisé dans une app enfants). La privacy policy s'ouvre dans le navigateur système, derrière le parental gate.
- **Deep links : aucun en v1** (surface d'attaque et de confusion inutile).

## 3. Le parental gate et le PIN ⚠️ (plus subtil qu'il n'y paraît)

Notre cible (5-7 ans) sait : appuyer longtemps (par imitation), résoudre 2+3, reconnaître des chiffres. Un gate faible sera contourné ET rejeté par Apple.

**Design recommandé** 🔶 :
- **Opération écrite en toutes lettres** (« multiplie trois par quatre »), régénérée à chaque tentative — un enfant de CP ne lit pas « multiplie » couramment et ne connaît pas ses tables ; un parent répond en 2 s. C'est exactement la « adult-level task » qu'Apple attend, avec consigne adaptée aux pré-lecteurs.
- **Limite de tentatives + cooldown** (3 échecs → 5 min) — anti brute-force enfantin.
- Le **PIN 4 chiffres** de l'espace parent est complémentaire (confort du parent) mais ⚠️ contournable par observation — le gate à contenu régénéré protège les actions sensibles (achat, liens). PIN + cooldown pour l'espace parent, gate régénéré pour les achats/liens.
- Le gate protège : espace parent, tout lien sortant, tout achat. ⚠️ Rappel : le gate ne vaut **pas** consentement parental légal (si un jour on collecte des données, c'est un autre chantier).

## 4. Données locales : quel niveau de protection ?

- Contenu réel des données : progression pédagogique pseudonyme (prénom/surnom éventuel, événements d'apprentissage). **Pas de PII sensible.**
- Le **sandbox OS + chiffrement matériel** (iOS Data Protection, Android File-Based Encryption) **suffit** pour ces données — le chiffrement applicatif systématique (SQLCipher etc.) serait du théâtre de sécurité qui complique les backups. Référentiel : OWASP MASVS v2, **profil MAS-L1** (+ MAS-R partiel sur le futur module d'achat uniquement). MAS-L2 est surdimensionné pour notre cas.
- ⚠️ `EncryptedSharedPreferences` (Android) est **déprécié depuis avril 2025** — si un secret doit être stocké (clé HMAC d'achat), utiliser DataStore + Keystore/Tink. Ne pas suivre les vieux tutos.
- **Import de sauvegardes = entrée non fiable** ⚠️ : le fichier JSON d'export/import (doc 06 §3) doit être validé strictement (schéma, bornes, version) — c'est LA porte d'entrée d'attaque d'une app offline.
- Prénom de l'enfant 🔶 : proposer par défaut un **surnom choisi dans une liste** (« petit renard », « étoile filante »…) plutôt que le vrai prénom — zéro PII même locale, et c'est mignon. Le vrai prénom reste possible si le parent le saisit.

## 5. Intégrité des achats (Phase 4, pour mémoire)

Menace réelle : patch local (Lucky Patcher & co) et édition du flag premium dans le stockage. Mitigations proportionnées sans backend :
- StoreKit 2 : vérification JWS on-device ; Play Billing + **Play Integrity API** ; état d'achat signé HMAC (clé en Keystore/Keychain) ; `allowBackup=false` sur ce fichier précis.
- Objectif : rendre le piratage **non trivial**, pas impossible — ne pas sur-investir, ce n'est pas notre risque principal.

## 6. Si un backend arrive un jour (v2+, pour mémoire)

- Le compte appartient au **parent** (créé derrière gate + consentement parental vérifiable — France : consentement conjoint sous 15 ans, RGPD art. 8 / CNIL reco 4) ; l'enfant n'est qu'un **profil pseudonyme**.
- ⚠️ Auth « anonyme » ≠ anodine : UID persistant + adresse IP = identifiant persistant au sens COPPA.
- Hébergement UE, minimisation radicale (le modèle de maîtrise n'a pas besoin du prénom), chiffrement en transit et au repos, pas de données brutes d'événements si des agrégats suffisent.

## 7. Télémétrie produit : le dilemme à trancher 🔶

Le pruning data-driven des niveaux frustrants (doc 03 §3.1) demande des données d'usage — que notre position « zéro collecte » interdit. Options :

1. **v1 : aucune télémétrie** — le tuning vient des tests utilisateurs en présentiel (Phase 2-3) et des retours beta. Recommandé au lancement : simple, honnête, différenciant.
2. v2 : **télémétrie agrégée opt-in côté parent** (anonyme, sans identifiant, activée explicitement dans l'espace parent avec explication claire). Réintroduit du RGPD (léger) et fragilise le label « Data Not Collected » → à ne faire que si le besoin est prouvé.
3. Alternative zéro réseau : bouton « partager un rapport » dans l'espace parent (le parent envoie lui-même un fichier de diagnostic par mail s'il veut aider) — le parent est l'acteur, pas l'app.

**Recommandation : option 1 au lancement, option 3 en accompagnement, option 2 seulement si le produit vit et que le besoin est démontré.**

## 8. Checklist sécurité/vie privée par release

- [ ] Audit dépendances : aucun SDK réseau (transitifs inclus), AD_ID absent du manifest
- [ ] Aucune permission au-delà du strict nécessaire (idéalement : aucune)
- [ ] Pas de WebView, pas de deep link
- [ ] Parental gate : contenu régénéré + cooldown, testé avec un vrai enfant de 7 ans
- [ ] Import de sauvegarde : validation stricte du fichier (schéma + bornes + fuzzing basique)
- [ ] Labels stores conformes à la réalité du binaire
- [ ] Logs de debug purgés (aucune donnée enfant dans les logs release)
- [ ] Si achat : état signé HMAC, acknowledgement Play Billing < 3 jours

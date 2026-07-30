# 12 — Roadmap de production

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> Principe conservé de l'ancien plan : phases séquencées par **risque décroissant** — on attaque d'abord ce qui peut invalider le projet. Nouveauté : le Directeur (moteur adaptatif) entre tôt, car c'est désormais le cœur différenciant.

## Phase 0 — Cadrage & fondations (maintenant)

**Produit/juridique :**
- [x] Valider ensemble les propositions 🔶 de cette doc (modèle biomes/infini, modes de jeu, stack, business model) → **fait le 30/07/2026**, voir [13-decisions.md](13-decisions.md)
- [ ] ⚠️ **Actions marque « Plouma »** (domaines, test oral, avis CPI, dépôt INPI) — **reportées à bien plus tard (décision 30/07)**, mais toujours obligatoires **avant toute com publique**
- [ ] Lettre de mission de l'orthophoniste conseil (1 page : périmètre, confidentialité, IP des contenus relus/rédigés, autorisation voix) (doc 09 §5.2-5.3)
- [ ] Candidature incubateur — en pause (financement reporté le 30/07, doc 09 §4)

**Pédagogie (produite par Hugo, relue par l'orthophoniste conseil — démarre tout de suite, c'est le chemin critique) :**
- [x] Graphe de compétences v1 (12 modules, 47 compétences) — **produit le 30/07 dans `/contenu`, en attente de relecture Florence**
- [x] Progression des graphèmes — **pré-validée par Hugo le 30/07** (intégrée au graphe), à confirmer par Florence
- [x] Première banque d'items : module Syllabes — **100 mots tagués le 30/07 (`contenu/banques/syllabes.csv`)**, à relire par Florence
- [ ] Charte des consignes/feedbacks de Plouma (éloge du processus — doc 03 §2.4)

**Technique/DA :**
- [ ] Acheter la **tablette de référence** 2 Go (doc 08 §1)
- [ ] Palette 5 couleurs (hex) + fichier .blend « studio » partagé
- [x] Setup projet Flutter + CI + `CLAUDE.md` — **fait le 30/07** : `/app` (Flutter 3.44.8, deps actées épinglées, riverpod 2.6.1 en attendant une résolution 3.x), audit dépendances bloquant, CI analyze+test+lint contenu, premières briques du Directeur portées en Dart avec tests d'oracle croisé contre le simulateur. Reste : budget de poids en CI (au Test A)

**Sortie : décisions actées, marque sécurisée, graphe de compétences v1.**

## Phase 1 — Preuves techniques (les 4 tests tueurs de risque)

- [ ] **Test A — le look & la pipeline** ✅ (inchangé) : Plouma clay (pose neutre + idle + célébration) + carte Prairie 3 couches → app Flutter/Flame avec parallax + sprite animée + **flutter_soloud**, mesurée **sur la tablette de référence** (fps, RAM, latence tap→son, poids). *Risque levé : la pipeline Blender→mobile tient-elle ?*
- [ ] **Test B — le son** (mis à jour : **la voix de Plouma = Florence**) : session d'enregistrement test (10 consignes + 10 babillages + 5 phonèmes isolés, micro correct, doc 05 §5) → écoute par des parents et des enfants. *Risques levés : la voix enregistrée « maison » est-elle assez propre techniquement ? le processus d'enregistrement par lots est-il tenable pour Florence ?*
- [ ] **Test C — les images-mots** ✅ (inchangé) : 15 images (template Blender + IA claymation), vérifier l'homogénéité. *Risque levé : le lot de 200-400 images est-il produisible ?*
- [ ] **Test D — le Directeur** 🔶 (nouveau) : implémentation de la lib pure (moyenne glissante ou Elo, génération contrainte, seeds) + **simulation de 10 000 enfants virtuels** validant : ~80 % de réussite, jamais de niveau impossible, sortie de biome en 8-20 niveaux selon profil. *Risque levé : la génération infinie adaptative fonctionne-t-elle sur le papier ?* — 100 % testable sans UI, parallélisable avec A/B/C.

**Sortie : go/no-go pipeline + moteur. C'est ici qu'on pivote si ça casse, pas en Phase 3.**

## Phase 2 — Prototype jouable (le juge de paix)

- [ ] Moteur de mini-jeux générique (cycle consigne → interaction → feedback → récompense)
- [ ] 3 mécaniques complètes : Tape la syllabe, Trouve la rime, La lettre qui chante — **chacune passée au « test du brocoli »** (doc 03 §1)
- [ ] Directeur branché : les niveaux du proto sont **déjà générés** (pas scriptés à la main) — sinon on ne teste pas le vrai produit
- [ ] Carte Prairie navigable avec chemin qui pousse, récompenses surprises, sauvegarde Drift
- [ ] **Test avec 3-5 enfants réels de 5-6 ans** ⚠️ : consignes comprises seul ? autonomie réelle ? demande à rejouer le lendemain ? (métrique n°1 du projet — doc 01 §7)

**Sortie : boucle de jeu validée par des enfants. Tant que ce n'est pas vert, on ne produit pas en masse.**

## Phase 3 — Premier arc complet (3-4 biomes)

- [ ] Biomes 1-4 (≈ modules Syllabes → Rimes → Phonèmes → Premières lettres) avec banques d'items complètes
- [ ] Niveaux surprises : nœuds cadeaux + niveaux échos (rappel espacé) — les rêves/saisons peuvent attendre la v1.1
- [ ] Mécaniques d'encodage (dictée muette — le manque identifié doc 02 §4.5)
- [ ] Espace parent minimal (PIN + gate, progression par module en langage clair, réglages audio 3 canaux, limite douce « Plouma va dormir »)
- [ ] Maison de Plouma v1 (album + customisation basique)
- [ ] Onboarding enfant + robustesse interruptions
- [ ] **Beta fermée familles** — ⚠️ satisfait au passage l'obligation Google « 12 testeurs / 14 jours » (doc 11 §3)
- [ ] Dossiers Édu-Up + Bourse French Tech déposés (doc 09 §4)

**Sortie : un produit de qualité release sur son premier arc.**

## Phase 4 — Lancement v1 🎯 cible : une rentrée scolaire

- [ ] Biomes 5-7 (≈ combinatoire CV, premiers digraphes) — de quoi tenir les premiers mois d'un enfant rapide ; la suite arrive en mise à jour **avant** que les premiers enfants n'y arrivent (l'avantage du modèle infini : le biome courant ne s'épuise jamais — doc 04 §5.3)
- [ ] Business model branché : freemium (2 biomes gratuits), abonnement dans l'espace parent, RevenueCat anonyme (docs 09 + 06 §5)
- [ ] Conformité stores complète : checklist doc 11 §5, checklist sécurité doc 07 §8
- [ ] Page stores, site vitrine, press kit ; campagne App-enfant.fr + micro-influence (doc 10)
- [ ] Featuring Apple : nomination 3 semaines avant le lancement

**Sortie : release publique iOS + Android.**

## Phase 5 — Vie du produit

- [ ] Biomes suivants jusqu'à couvrir tout le CP (~10-14 biomes — doc 04 §5.2)
- [ ] Rêves de Plouma, visites saisonnières, sentiers cachés
- [ ] Mode histoires enrichi, customisation avancée
- [ ] Multi-profils (fratries)
- [ ] Pistes v2+ : co-jeu parent-enfant (Overcooked-like), lecture à voix haute (reconnaissance vocale), extension GS/CE1, licence pro orthophonistes (doc 09 §3)

## Les 7 risques majeurs (mise à jour)

| Risque | Parade | Phase |
|---|---|---|
| ⚠️ Marque « Plouma » indisponible | Recherche d'antériorité AVANT toute com | 0 |
| Enfant seul ne comprend pas / ne revient pas | Test enfants réels, métrique n°1 | 2 |
| Pipeline Blender→mobile (poids/RAM/look) | Test A sur tablette de référence | 1 |
| Génération adaptative répétitive ou cassée | Test D (simulation massive) + règles de variété | 1-2 |
| Volume images-mots (200-400) | Test C ; réduire au strict pédagogique | 1 |
| Tunnel solo trop long → abandon ⚠️ (aggravé : contenu pédagogique aussi à ta charge, l'orthophoniste ne fait que relire) | Phases courtes à sortie concrète ; lancement à 7 biomes, pas 14 ; produire le contenu en lots relus d'un coup | toutes |
| Conversion parent insuffisante (benchmark : ~6,5 % download→trial) | Onboarding parent soigné, plan annuel, canaux gratuits d'abord (ASO, presse, SEO) | 4 |

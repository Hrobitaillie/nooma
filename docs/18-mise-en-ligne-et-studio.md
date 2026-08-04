# 18 — Mise en ligne de l'outillage & studio d'enregistrement

> ✅ = acté · 🔶 = proposition à valider · ⚠️ = mise en garde
> **Plan d'architecte, pas d'implémentation** : phases actionnables, schémas de données concrets, arbitrages tranchés, décisions restantes en §9. Développe la vision du back-office audio posée en [05-direction-artistique.md](05-direction-artistique.md) §5.

**Objectif** : mettre l'outillage projet en ligne sur un sous-domaine pour que **Florence** (orthophoniste conseil, non-technicienne) accède à la doc (viewer), et pour construire le **studio d'enregistrement** où elle enregistre, depuis son navigateur, toutes les bandes audio de l'app. **Hugo** y gagne un admin de contenu accessible partout.

---

## 1. Vue d'ensemble & principes

### 1.1 Ce qui part en ligne / ce qui reste local

| En ligne | Reste local |
|---|---|
| **Viewer de doc** (`cadrage/viewer` + `/docs` + catalogue) — lecture + commentaires | **L'app Flutter** (`/app`) — dev local, rien à exposer |
| **Admin contenu** (banques de mots, puis JSON de `/contenu` en phase 4) | **flooow** (Vite + API dédiée, outil de cadrage ponctuel — l'exposer n'apporte rien à Florence) |
| **Studio d'enregistrement** (phases 2-3) + inventaire des lignes | **Simulateur** (dashboard lisible dans le viewer via ses sorties versionnées ; le `run.ts` reste local) |
| | **Blender / assets sources** (déjà hors périmètre serveur, cf. doc 05 §6) |

### 1.2 Qui accède à quoi

Deux comptes, **pas d'inscription**, tout derrière authentification (rien de public) :

| | Hugo (admin) | Florence (contributrice) |
|---|---|---|
| Viewer doc + commentaires | ✅ | ✅ (c'est son canal de relecture) |
| Admin banques / mode correction | ✅ | ✅ (le mode correction lui est destiné) |
| Studio : enregistrer, réécouter, proposer une prise | ✅ | ✅ |
| Studio : valider/écarter une prise, exporter le pack | ✅ | lecture (le choix se fait **à deux**, cf. §5.5) |
| Admin config app/jeux (phase 4) | ✅ | ❌ |

### 1.3 Le dépôt git reste la source de vérité du contenu — stratégie de retour ✅ à trancher formellement (§9-D2)

Aujourd'hui le serveur local écrit directement dans le working tree (`comments.json`, `banques/*.csv`) et Hugo committe à la main. En ligne, ce modèle casse : les modifs de Florence vivraient sur le serveur sans jamais revenir dans git.

**Recommandation 🔶 : le serveur committe et pousse automatiquement sur une branche dédiée.**

- Le serveur héberge un **clone du repo** (deploy key en lecture/écriture limitée à une branche).
- Chaque sauvegarde depuis l'admin/le viewer = écriture fichier + `git commit` (auteur = le compte authentifié, cf. §3.3) sur la branche **`serveur/contenu`**, push regroupé (debounce ~1 min).
- Hugo **merge par PR** vers `main` quand il veut : il garde la revue, rien ne se perd, l'historique dit *qui* a changé *quoi*.
- Rejetés : *export manuel* (friction, oublis garantis — c'est exactement ce que le studio veut éviter) ; *push direct sur `main`* (aucun filet, conflits avec le travail local de Hugo).

### 1.4 Les enregistrements audio : hors git ✅

Les prises (lourdes, binaires, à fort churn — plusieurs prises par ligne, re-takes) **ne vont ni dans le git principal ni en LFS** :

- LFS rejeté : quotas GitHub, coût, et l'historique des prises *écartées* n'a aucune valeur versionnée — c'est du stock, pas du code.
- **Stockage : disque serveur** (`data/studio/`, ~180 Go libres sur chappie, largement suffisant : 500 lignes × 4 prises × ~1 Mo ≈ 2 Go) + **sauvegarde externe quotidienne** (§8.4).
- **Exception — le pack exporté** : les prises *retenues*, converties et nommées canoniquement (§5.6), sont synchronisées vers `app/assets/` et **committées dans git** : c'est un artefact final, borné par le budget poids (doc 08), dont le build de l'app a besoin. Les métadonnées (registre, index des prises) sont du JSON léger et restent versionnées.

---

## 2. Réalité serveur (inspection **chappie** du 04/08/2026, lecture seule — cible actée par Hugo)

> ℹ️ Une première version de ce plan visait « pilodev » (infra de l'agence Pilot'in) ; Hugo a tranché : **la cible est chappie, son serveur personnel** — ce qui simplifie tout (gouvernance, RGPD, pérennité).

| Élément | Constat |
|---|---|
| OS / matériel | Ubuntu 22.04.5 LTS (IP 82.165.150.136, IONOS), 233 Go disque dont **180 Go libres** |
| Panneau | **Plesk Obsidian 18.0.79** : vhosts nginx→apache, MariaDB, DNS (named), Let's Encrypt, fail2ban |
| Domaines déjà servis | `justhugo.fr` (+ sous-domaines popcorn/sandbox/siteforge/jarvis), `tacotaf.com`, `satori-energie.fr` |
| Node | **v22.19.0** ✅ — des apps Node tournent déjà (jarvis dans un vhost, **flooow dans `/opt/flooow`** via tsx : le pattern « app Node hors vhost + proxy » existe donc déjà) |
| Process | pas de systemd unit vu pour flooow (process pnpm) — on fera PROPREMENT : unit systemd dédiée (§3.4) |
| Outils | git 2.43.5 ✅ ; **ffmpeg absent** ⚠️ → `apt install ffmpeg` (serveur root perso, trivial sur Ubuntu — §5.6) ; ni Caddy ni podman (et pas besoin) |

✅ **Gouvernance : aucune** — serveur personnel de Hugo, hébergeur IONOS (datacenters UE, à confirmer d'un clic dans l'espace client pour le RGPD §8.3). La voix de Florence reste sous la responsabilité directe de Hugo. L'ancienne décision D1 (pilodev vs VPS) est **résolue : tout vit sur chappie, studio compris**.

---

## 3. Phase 1 — mise en ligne sécurisée de l'existant

**But** : Florence lit la doc et utilise le mode correction depuis chez elle. Rien de plus, mais durci.

### 3.1 Sous-domaine + Plesk/nginx

- Sous-domaine : **`plouma.justhugo.fr`** ✅ (créé par Hugo dans Plesk le 04/08 — DNS auto, **certificat Let's Encrypt en un clic**, aucun contenu dans le docroot). ⚠️ Le plan recommandait un nom neutre sans « plouma » (marque reportée, §8.2) ; choix assumé par Hugo — risque faible car l'outil est derrière auth + noindex + zéro lien public, mais **ne jamais y mettre de page publique**, et re-évaluer le nom si le dépôt INPI traîne.
- Le proxy et le mur d'auth se posent dans Plesk → *Apache & nginx Settings* du sous-domaine → **directives nginx additionnelles** :

```nginx
# Fichier créé à la main : htpasswd -B -c /etc/nginx/plouma-atelier.htpasswd hugo (puis florence)
auth_basic "Atelier Plouma";
auth_basic_user_file /etc/nginx/plouma-atelier.htpasswd;
add_header X-Robots-Tag "noindex, nofollow" always;
limit_req zone=atelier burst=10 nodelay;      # zone déclarée côté conf nginx globale (POST)
location / {
	proxy_pass http://127.0.0.1:8090;
	proxy_set_header X-Utilisateur $remote_user;   # l'identité pour signer commits/prises
	client_max_body_size 25m;                       # les prises audio (§5)
}
```
*(+ cocher « désactiver le proxy vers Apache » : nginx sert seul le proxy.)*

### 3.2 Durcissement du serveur Node ⚠️ (obligatoire avant exposition)

État actuel de `cadrage/server.mjs` : endpoints d'écriture (`comments.php`, `estimations.php`, `/contenu/banques/save`) **sans auth, sans limite de taille, sans limite de débit**, et statique qui sert **tout le repo** (y compris `.git/` si présent, `app/`, `flooow/`). À corriger :

1. **Liste blanche des racines servies** : `cadrage/`, `docs/`, `contenu/` uniquement ; refus explicite de `.git`, dotfiles, `*.orig`.
2. **Limite de corps** sur tous les POST (ex. 2 Mo) + timeout de requête.
3. **Confiance d'identité** : le serveur écoute `127.0.0.1` uniquement et lit `X-Utilisateur` (posé par nginx après basic auth, `$remote_user`) — jamais de logique d'auth dans Node en phase 1, c'est nginx qui porte le mur.
4. Journal d'accès en écriture (append `data/journal.log` : date, utilisateur, endpoint, fichier) — c'est notre « audit trail » à coût nul.
5. Validation existante des banques (nom de fichier, en-tête CSV) conservée, complétée d'un **passage du lint** avant écriture quand c'est bon marché (§6 phase 4 pour la version complète).

### 3.3 Authentification : basic auth nginx par utilisateur ✅ recommandé

- **2 comptes** (`hugo`, `florence`), mots de passe forts générés, hash bcrypt (`htpasswd -B`). Pas d'inscription, pas de reset en ligne (Hugo régénère à la main si besoin).
- Pourquoi pas un login applicatif : du code d'auth à écrire et maintenir dans un serveur zéro-dépendance — pour 2 utilisateurs, basic auth sur HTTPS est **réel et suffisant**. On bascule vers un login applicatif seulement si le studio exige des sessions riches (pas le cas au design actuel).
- Ne PAS utiliser la « protection par mot de passe » Plesk (répertoires Apache) : elle ne couvre pas proprement un proxy nginx → les directives nginx du §3.1 font foi.
- Le nom d'utilisateur remonte via `X-Utilisateur` → signe les commentaires, les commits (§1.3) et les prises (§5.4).

### 3.4 Process & exploitation

- **systemd** : `plouma-atelier.service` → `node /opt/plouma-atelier/repo/serveur/serveur.mjs`, `Restart=on-failure`, `User` dédié non-root, `Environment=PORT=8090`. On s'installe dans `/opt` comme flooow (pattern existant sur chappie), mais AVEC une unit propre — flooow tourne aujourd'hui en process pnpm nu, à ne pas imiter (au passage : lui donner aussi une unit serait une bonne hygiène, hors périmètre).
- Déploiement : `git pull` du repo sur le serveur (le même clone que §1.3) + `systemctl restart atelier`. Un alias/script suffit, pas de CI de déploiement à ce stade.
- **Sauvegardes** dès la phase 1 : cf. §8.4.

**Sortie de phase 1** : Florence ouvre `https://plouma.justhugo.fr`, s'authentifie, lit le doc 17, annote dans le viewer, corrige des mots dans l'admin — et chaque écriture atterrit dans la branche `serveur/contenu`.

---

## 4. Phase 2 — le registre des lignes de texte

**But** : une source de vérité versionnée de **toutes les lignes que l'app prononcera**, avec état audio. C'est le « script » du studio et le socle de l'inventaire.

### 4.1 Nouveau fichier de contenu : `contenu/voix/lignes.json` 🔶

Conforme à la règle « le contenu est de la donnée » (doc 06 §2, `contenu/README.md`). Schéma :

```jsonc
{
  "version": 1,
  "lignes": [
    {
      "id": "consigne.boite-a-sons.intro",     // stable, jamais réutilisé — préfixe = type.contexte
      "texte": "Écoute bien le mot, puis tape une fois par syllabe.",
      "type": "consigne",                      // consigne | feedback | phoneme | babillage | mot | interpellation | histoire
      "contexte": "Mécanique boîte à sons — lancement du niveau",   // où l'enfant l'entend (écran/mécanique)
      "indication": "ton complice, débit lent", // note de jeu pour Florence (optionnel)
      "variables": [],                          // ex. ["prenom"] — cf. règle ci-dessous
      "priorite": 1,                            // 1 = bloque la v1 · 2 = important · 3 = confort
      "figee": false                            // true = texte validé, un changement invalide l'audio (cf. lint)
    }
  ]
}
```

- **Le statut audio ne vit PAS dans ce fichier** ✅ : il est **dérivé** des prises côté serveur (§5.4) et joint par `id` dans l'inventaire. Sinon on duplique un état dans git qui se périme à chaque prise. Le registre = le *texte* et sa métadonnée éditoriale ; le studio = l'*état sonore*.
- ⚠️ **Règle `{prenom}`** : conséquence directe de la décision du 30/07 (doc 07 §4 — pas de TTS, Plouma ne prononce pas le prénom libre) → **une ligne avec variable `prenom` est interdite d'audio** ; le lint la rejette sauf si une ligne jumelle « interpellation générique » existe (`interpellation.generique.*` : « petit chef », « mon étoile »…). Les surnoms de la liste fermée, eux, sont enregistrables un par un.
- Extension du lint (`contenu/lint.mjs`) : unicité/format des ids, types valides, variables vs type, présence des mots des banques (voir 4.2), détection des lignes `figee` dont le texte a changé (→ signale l'audio à refaire).

### 4.2 D'où viennent les lignes

| Source | Aujourd'hui | Action |
|---|---|---|
| Consignes/feedbacks des 19 mécaniques | ⚠️ **en dur dans le code Dart** (`app/lib/mecaniques/*.dart` : « Bravo, tu as bien compté les syllabes ! »…) | **Extraire vers le registre** : le Dart référence des `id`, un `voix.dire(Lignes.boiteASonsBravo)` résout via le contenu embarqué. Conforme « contenu = données », et prérequis absolu du studio. Générer un stub Dart depuis le registre (comme les banques dans `app/assets/contenu/`). |
| Mots des banques (`contenu/banques/*.csv`) | 100 mots syllabes.csv, banques à venir | **Génération automatique** d'une ligne `mot.<banque>.<mot>` par mot (le lint synchronise : mot ajouté → ligne ajoutée, mot supprimé → ligne orpheline signalée). Pas de saisie manuelle. |
| Phonèmes/graphèmes du graphe | `graphe-competences.json` (47 compétences, graphèmes introduits) | Génération `phoneme.<graphème>` — **priorité 1** (doc 05 §5 : lot critique). |
| Babillages | doc 05 §5 : banque de 30-50, classés par émotion | Saisie manuelle `babillage.<emotion>.<n>` (le « texte » décrit l'intention : « gazouillis interrogatif court »). |
| Interpellations génériques + surnoms | doc 07 §4 | Saisie manuelle. |
| Charte des consignes (à venir), histoires (à cadrer) | futures | S'ajouteront au registre — le schéma les couvre (`type`, `priorite`). |

Volume attendu v1 : **~300-500 lignes** (100+ mots, ~47 phonèmes, 19 mécaniques × 3-6 lignes, 30-50 babillages, divers).

### 4.3 Vue d'inventaire (dans l'admin en ligne)

Tableau filtrable (type, priorité, statut, mécanique) + compteurs en tête : « 412 lignes, 187 avec audio retenu, 40 en attente, 12 à refaire (texte modifié) ». C'est la page d'accueil de Hugo pour piloter l'avancement, et la source de la file d'attente de Florence (§5.2).

---

## 5. Phase 3 — le studio d'enregistrement

**But** : Florence enregistre depuis son navigateur, par sessions de ~20 min, sans jamais toucher un fichier.

### 5.1 Principes UX (côté Florence) — zéro friction

- Elle arrive → **sa file d'attente** l'attend, triée par priorité puis par lot homogène (tous les phonèmes ensemble, tous les « Bravo » ensemble — cohérence de ton, cf. doc 05 §5 « sessions par lots »).
- Un écran = une ligne : **le script affiché en très gros**, l'indication de jeu dessous, trois gestes : **Enregistrer** (espace), **Réécouter**, **Refaire**. « Envoyer & suivant » enchaîne. Compteur discret « 12/40 de la session ».
- Enregistrement **local d'abord** (MediaRecorder), envoi en tâche de fond → aucune attente réseau entre deux prises ; reprise d'envoi si coupure.
- **Contrôle qualité d'entrée de session** (constance micro, doc 05 §5) : au début de chaque session, une **ligne étalon** fixe (toujours la même phrase) + vu-mètre : niveau trop faible/fort ou périphérique différent du dernier enregistrement → alerte avant de commencer, pas après 40 prises. Rappel à l'écran : même pièce, même micro, même distance.
- Elle peut s'arrêter n'importe quand : la file est persistante, rien à « sauvegarder ».

### 5.2 File d'attente de traitement

Pas une table dédiée : la file est une **requête** sur l'inventaire — lignes sans prise retenue, ordonnées par `priorite`, groupées par type/lot, moins celles marquées « en pause » par Hugo. Hugo peut épingler un lot en tête (« cette semaine : les phonèmes »). Zéro état à synchroniser, impossible à désynchroniser.

### 5.3 Technique d'enregistrement 🔶 recommandations tranchées

- **Capture** : `MediaRecorder` sur `getUserMedia` (`echoCancellation:false, noiseSuppression:false, autoGainControl:false` — on veut le micro nu), 48 kHz. Format produit par le navigateur : **WebM/Opus** (Chrome/Firefox/Edge) ou **MP4/AAC** (Safari). **On stocke la prise source telle quelle** (c'est l'original, on ne transcode jamais deux fois) + Web Audio API pour le vu-mètre et la mesure de pic/RMS à l'envoi.
- ⚠️ Le studio impose HTTPS (getUserMedia) — couvert par la phase 1. Recommander à Florence **Chrome ou Firefox** (Opus > AAC à débit égal) sans l'exiger.
- **Format du pack app** : l'app utilise **flutter_soloud** (WAV/MP3/OGG Vorbis/FLAC — pas d'Opus). **Cible : OGG Vorbis mono ~q4, normalisation loudness EBU R128 (≈ -16 LUFS, true peak -1.5 dB), silence trimé** en tête/queue. Chemin : `source (webm/mp4) → ffmpeg → ogg` à l'export (§5.6). Un seul format embarqué pour tout (phonèmes compris) : simple, et le décodage SoLoud est négligeable sur des fichiers de 1-3 s.
- ffmpeg absent de chappie → **`apt install ffmpeg`** (Ubuntu, serveur perso root : trivial et sans risque) ; le serveur Node l'appelle en sous-processus à l'export.

### 5.4 Modèle de données des prises (serveur, hors git — cf. §1.4)

Fichiers plats JSON + audio, zéro base de données (2 utilisateurs, écritures rares — Node 22 `node:sqlite` reste l'issue de secours si besoin) :

```
data/studio/
  etat.json                    # index global, réécrit atomiquement (tmp+rename)
  audio/<ligne-id>/prise-003.webm
```

```jsonc
// etat.json — entrée par ligne du registre
{
  "consigne.boite-a-sons.intro": {
    "texteEnregistre": "Écoute bien le mot…",   // snapshot du texte au moment de la prise retenue
    "prises": [
      {
        "n": 3,                                  // numéro de prise, croissant, jamais réutilisé
        "fichier": "audio/consigne.boite-a-sons.intro/prise-003.webm",
        "mime": "audio/webm;codecs=opus",
        "date": "2026-09-12T14:03:11Z",
        "par": "florence",                       // X-Utilisateur
        "dureeMs": 2140,
        "picDb": -6.2, "rmsDb": -21.4,           // mesurés côté client à l'envoi
        "statut": "retenue",                     // proposee | retenue | ecartee
        "note": "v2 plus souriante"              // commentaire libre (Hugo ou Florence)
      }
    ]
  }
}
```

**Statut dérivé d'une ligne** (affiché dans l'inventaire) : `aucun` (0 prise) → `en-attente` (des `proposee`, pas de `retenue`) → `enregistre` (une `retenue`) → `a-refaire` (texte du registre ≠ `texteEnregistre`, ou re-take demandé = Hugo écarte la retenue avec note). Versionnage = les prises ne sont **jamais supprimées**, seulement écartées ; re-take = nouvelle prise sur la même ligne.

### 5.5 Écran de comparaison / choix à deux

Vue « arbitrage » d'une ligne : le script, la liste des prises avec lecture au clavier (1/2/3…), lecture A/B enchaînée, formes d'onde simples, notes. **Retenir** une prise écarte l'ancienne retenue (l'historique reste). Florence propose (elle peut marquer sa préférée d'une ⭐ en note), **Hugo retient** — « choix à deux » : chacun voit les notes de l'autre, l'outil ne force pas de tour de rôle. Un filtre « à arbitrer » (≥ 2 prises proposées) sert d'ordre du jour à leurs sessions communes.

### 5.6 Pipeline de la prise retenue → app

1. **Export** (bouton, Hugo) : pour chaque ligne avec prise retenue → ffmpeg (conversion OGG, normalisation R128, trim) → **nommage canonique `<ligne-id>.ogg`** (l'id du registre EST le nom de fichier : traçabilité totale) → `data/export/pack-voix/` + `manifest.json` (id → durée, hash, date de prise, version de pack).
2. **Sync vers l'app** : le pack est poussé sur la branche `serveur/contenu` dans `app/assets/contenu/voix/` (avec le manifest). Hugo merge, l'app embarque. Le manifest permet à l'app (et au lint) de vérifier : chaque ligne priorité 1 a son fichier, aucun fichier orphelin.
3. Le **TTS d'itération** (doc 05 §5) comble les trous en dev : le code Dart demande une ligne par id ; si l'ogg manque en debug → TTS local ; en release, le lint bloque si une ligne requise n'a pas d'audio. Rien de TTS ne part en release.

⚠️ **GO/NO-GO juridique** : la mise en prod du studio (première vraie session de Florence) est **conditionnée à l'autorisation écrite d'exploitation de sa voix** — voir §8.3.

---

## 6. Phase 4 — admin de configuration app/jeux

**But** : étendre l'admin (aujourd'hui : banques CSV) à l'édition **outillée et garde-fouée** des JSON de `/contenu`.

- **Périmètre recommandé 🔶** : `graphe-competences.json` (édition par formulaire : compétence, prérequis, graphèmes — pas d'éditeur JSON brut), `mecaniques.json`, les futurs JSON biomes/motifs (doc 15) et le registre des lignes (§4). Toujours via le même circuit : **lint bloquant avant sauvegarde** (`lint.mjs` devient le validateur serveur — il vérifie déjà ids, cycles, prérequis, cohérence banques), commit auto sur `serveur/contenu` (= historique et diff gratuits, pas de système de versions maison).
- **Ce qu'on ne met PAS en ligne** ⚠️ : les **paramètres du Directeur** (cible 80-85 %, fenêtres Leitner… — pré-validés le 30/07, oracle du simulateur) restent **en lecture seule** en ligne : les modifier sans re-simuler casse la boucle de validation (simulateur = oracle, doc 13). Édition locale + `npm run sim` uniquement. Idem pour tout ce qui touche au code (`app/`).
- L'admin reste un outil à deux : Florence y voit le graphe et les banques (relecture), Hugo édite la config.

---

## 7. Réorganisation du dépôt 🔶 recommandée

Séparer l'**outillage pérenne** (servira pendant toute la vie du projet : serveur, studio, admin) du **cadrage jetable** (viewer/catalogue, utiles mais figés). Cible :

```
serveur/                  # NOUVEAU — l'outil pérenne
  serveur.mjs             # évolution de cadrage/server.mjs (statique + API + auth header + git)
  api/                    # modules : banques, commentaires, studio, export
  studio/                 # front d'enregistrement + inventaire + arbitrage (même style zéro-build que le viewer)
  deploiement/            # directives nginx (snippet Plesk), plouma-atelier.service, script de déploiement, doc d'exploitation
cadrage/                  # inchangé (viewer, catalogue, simulateur) — servi par serveur/
contenu/
  voix/lignes.json        # NOUVEAU — le registre (§4)
  …
app/assets/contenu/voix/  # NOUVEAU — pack exporté + manifest (committé)
data/                     # serveur uniquement, GITIGNORÉ : audio des prises, etat.json, journal.log
```

**Migration** : (1) phase 1 = déplacer `server.mjs` → `serveur/serveur.mjs` en le durcissant (le `npm start` pointe dessus) ; (2) phases 2-3 ajoutent `api/` et `studio/` ; (3) `cadrage/` n'est plus jamais modifié que pour le contenu. Renoncer à déplacer viewer/admin existants : ils marchent, le coût de déplacement n'achète rien.

---

## 8. Sécurité & conformité

1. **Transport & exposition** : HTTPS partout (Let's Encrypt via Plesk), serveur Node jamais exposé directement (bind 127.0.0.1, proxy nginx), aucune écriture sans auth, rate-limit sur les POST, limite de taille de corps, liste blanche statique (§3.2).
2. **Discrétion** : pas de page publique, `X-Robots-Tag: noindex, nofollow` (directive nginx §3.1) + `robots.txt Disallow: /` en ceinture-bretelles, aucun lien depuis quoi que ce soit de public. ⚠️ Le sous-domaine choisi (`plouma.justhugo.fr`) expose le nom avant le dépôt INPI — assumé par Hugo (04/08) car derrière auth/noindex ; en contrepartie, discipline stricte : zéro contenu public sur ce vhost, zéro mention du sous-domaine dans une com.
3. **La voix de Florence = donnée personnelle (RGPD) + attribut de la personnalité** ⚠️ :
   - **L'autorisation écrite d'exploitation de la voix (lettre de mission, doc 09 §5.2) devient un prérequis BLOQUANT à la mise en prod du studio** — elle était « à faire », l'enregistrement en ligne systématique de centaines de prises la rend indispensable *avant* la première session. Contenu minimal : usage commercial dans l'app, durée, supports, mention du nom oui/non, **sort des enregistrements en cas de retrait** (les prises brutes sont supprimables ; le pack embarqué d'une version déjà publiée ne l'est pas rétroactivement — l'écrire noir sur blanc).
   - Hébergement **UE** requis : chappie = IONOS (datacenters UE, Allemagne — à confirmer d'un clic dans l'espace client). Flux directs sans intermédiaire (pas de CDN/tunnel). Droit d'accès/retrait : trivial (2 personnes, fichiers plats).
4. **Sauvegardes** : le seul irremplaçable est `data/` (les prises — la doc et le contenu sont dans git). **Quotidien** : archive incrémentale de `data/` (restic ou rsync) vers un stockage **hors chappie** (machine de Hugo ou bucket objet UE ; le backup manager Plesk peut compléter mais ne pas s'y fier seul). Après chaque session d'enregistrement : Hugo vérifie que la sauvegarde du jour est passée (le journal §3.2 l'affiche dans l'admin). Test de restauration une fois par trimestre.
5. **Données enfants : néant** ✅ confirmé — l'outillage ne manipule que du contenu éditorial et les comptes Hugo/Florence. Aucune donnée d'enfant n'existe côté serveur (l'app est offline, doc 07 §1) ; rien dans ce plan ne l'entame.

---

## 9. Récap : checklist, efforts, décisions

### 9.1 Checklist ordonnée (de zéro au premier lot enregistré)

1. ☑ Sous-domaine `plouma.justhugo.fr` créé dans Plesk (fait le 04/08) — activer le certificat Let's Encrypt
2. ☐ Créer `serveur/` (déplacement + durcissement §3.2 de server.mjs)
3. ☐ Clone du repo dans `/opt/plouma-atelier` sur chappie + deploy key limitée à `serveur/contenu` + commit/push auto
4. ☐ Directives nginx du sous-domaine (basic auth 2 comptes, rate-limit, proxy 8090) ; `plouma-atelier.service` systemd
5. ☐ Sauvegarde quotidienne de `data/` + test de restauration
6. ☐ **Recette avec Florence** : login, viewer, un commentaire, un mot corrigé — fin de phase 1
7. ☐ Registre `contenu/voix/lignes.json` + extension lint + génération mots/phonèmes (§4.2)
8. ☐ Extraction des textes en dur du Dart vers le registre (ids) — fin de phase 2 (inventaire en ligne)
9. ☐ **Lettre de mission signée, volet voix inclus** (§8.3) — GO/NO-GO
10. ☐ Achat du micro USB (~100-150 €, doc 05 §5) + choix de la pièce chez Florence
11. ☐ Studio : capture + file d'attente + envoi (§5.1-5.3), puis arbitrage (§5.5), puis export ffmpeg (§5.6)
12. ☐ Session étalon avec Florence (réglage niveaux, ligne étalon) → **premier lot : les phonèmes**
13. ☐ Premier export du pack → PR → app — la boucle complète a tourné
14. ☐ Phase 4 (admin config) quand le besoin réel se présente

### 9.2 Effort grossier (Hugo + vibe coding, jours pleins)

| Phase | Effort |
|---|---|
| 1 — mise en ligne durcie | **1-1,5 j** (durcissement 0,5 ; Plesk/nginx/systemd/git 0,5 ; recette 0,5) |
| 2 — registre + extraction Dart | **1,5-2 j** (schéma+lint 0,5 ; extraction Dart 0,5-1 ; inventaire 0,5) |
| 3 — studio | **4-6 j** (capture/UX 2 ; prises/arbitrage 1-1,5 ; export ffmpeg 1 ; polish sessions réelles 1) |
| 4 — admin config | **2-3 j** (formulaires graphe + garde-fous) |

### 9.3 Décisions restantes pour Hugo (avec recommandation)

| # | Décision | Recommandation |
|---|---|---|
| D1 | **Hébergement** | ✅ **Résolue (04/08) : chappie**, serveur personnel de Hugo (Plesk/IONOS) — toutes phases, studio compris ; aucune question de gouvernance tierce |
| D2 | **Retour git** : commit/push auto sur branche vs export manuel | **Branche `serveur/contenu` + PR** (§1.3) |
| D3 | **Audio & git** : LFS vs hors git | **Hors git** ; seul le pack exporté est committé dans `app/assets` (§1.4) |
| D4 | **Auth** : basic auth nginx vs login applicatif | **Basic auth nginx** (htpasswd bcrypt, directives Plesk), 2 comptes, header `X-Utilisateur` (§3.3) |
| D5 | **Formats audio** : source + pack | **Source WebM/Opus conservée telle quelle ; pack OGG Vorbis mono normalisé R128** (flutter_soloud ne lit pas l'Opus) (§5.3) |
| D6 | **Nom du sous-domaine** | ✅ **Résolue (04/08) : `plouma.justhugo.fr`** créé par Hugo — expose le nom avant l'INPI (assumé, mitigé par auth+noindex+zéro contenu public, §8.2) |
| D7 | **Lettre de mission + autorisation voix avant prod studio** | Non négociable — planifier la signature pendant la phase 2 pour ne pas bloquer la 3 (§8.3) |
| D8 | **Params du Directeur en ligne** | **Lecture seule** ; édition locale adossée au simulateur (§6) |
| D9 | **Stockage des prises** : JSON plats vs SQLite | **JSON plats** (2 utilisateurs, écriture atomique) ; `node:sqlite` si l'outil grossit (§5.4) |

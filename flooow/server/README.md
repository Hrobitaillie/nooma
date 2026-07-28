# @flooow/server

Serveur Node de Flooow : REST fichiers/dossiers (Hono) + temps réel Yjs
(Hocuspocus, à venir). Tourne **sur l'hôte** (pas dans le container), façon site
`facturation` — le Caddy du container `dev-flooow-web` reverse-proxy vers lui.

Voir `../cadrage/05-implementation/multi-user-serveur.md` pour l'architecture.

## Dév local

```bash
pnpm install
cp .env.example .env   # optionnel
pnpm dev               # tsx watch, http://0.0.0.0:3010
```

Sondes :

```bash
curl localhost:3010/api/health
curl localhost:3010/api/whoami          # → anonyme (hors Caddy)
curl -H 'X-Token-User-Name: valentin' -H 'X-Token-User-Roles: dev' \
     localhost:3010/api/whoami          # → identité simulée
```

## Auth

Aucune auth côté Node : l'identité vient des headers injectés par le **Caddy hôte
(AuthCrunch)**. Le serveur fait confiance aux headers — le port brut doit rester
derrière le pare-feu (seul le port public Caddy est exposé). Les noms exacts des
headers seront figés au câblage container.

#!/usr/bin/env bash
# Dév local flooow (façon site facturation) : pointe le Caddy DU CONTAINER vers le
# Vite de l'hôte, puis lance Vite (front) + Node (API/Yjs) en parallèle.
# N'agit QUE sur ce site (container dev-flooow-web). Aucune config globale touchée.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VITE_PORT="${VITE_PORT:-5173}"
API_PORT="${API_PORT:-3011}"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
CONTAINER="dev-flooow-web"

mkdir -p "$DATA_DIR"

# 1. Pointer le Caddy du container vers le Vite de l'hôte + reload à chaud.
printf 'reverse_proxy host.containers.internal:%s\n' "$VITE_PORT" > "$ROOT/.caddy-upstream"
if podman exec "$CONTAINER" caddy reload --config /etc/caddy/Caddyfile 2>/dev/null; then
  echo "[dev] Caddy container rechargé → Vite:$VITE_PORT"
else
  echo "[dev] ⚠ reload Caddy container impossible (container '$CONTAINER' démarré ?)"
fi

# 2. Vite (front) + Node (API/Yjs) en parallèle.
exec pnpm exec concurrently -k -n vite,api -c cyan,magenta \
  "VITE_PORT=$VITE_PORT API_PORT=$API_PORT pnpm -C app dev" \
  "PORT=$API_PORT DATA_DIR=$DATA_DIR pnpm -C server dev"

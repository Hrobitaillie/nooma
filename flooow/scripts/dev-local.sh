#!/usr/bin/env bash
# Dev local Flooow HORS infra Pilot'in (pas de podman/Caddy) :
# Vite (front, port 5173) + Node (API/Yjs, port 3011) en parallèle.
# Prérequis : `npx pnpm@9 install` à la racine flooow/ + `npm install` dans app/
# (fait une fois). Lancement conseillé : `npm run flooow` à la racine du repo nooma.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VITE_PORT="${VITE_PORT:-5173}"
API_PORT="${API_PORT:-3011}"
DATA_DIR="${DATA_DIR:-$ROOT/data}"

mkdir -p "$DATA_DIR"

exec npx -y pnpm@9 exec concurrently -k -n vite,api -c cyan,magenta \
  "VITE_PORT=$VITE_PORT API_PORT=$API_PORT npm --prefix app run dev" \
  "PORT=$API_PORT DATA_DIR=$DATA_DIR npx -y pnpm@9 -C server dev"

#!/usr/bin/env bash
# Synchronise le contenu pédagogique versionné (/contenu, racine du dépôt) vers les assets
# Flutter (app/assets/contenu/). Le contenu est la SEULE source de vérité (règle inviolable
# n°8) ; les assets copiés sont un artefact de build (dans le .gitignore de app/).
#
# À exécuter avant `flutter test` / `flutter run` et dans la CI (voir app-ci.yml).
# Usage : ./tool/sync_contenu.sh   (depuis app/, ou n'importe où : chemins résolus en absolu)

set -euo pipefail

# Racine du dépôt = parent de app/ (ce script vit dans app/tool/).
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
SRC="$REPO_DIR/contenu"
DEST="$APP_DIR/assets/contenu"

echo "Synchronisation du contenu : $SRC → $DEST"

rm -rf "$DEST"
mkdir -p "$DEST/banques" "$DEST/voix"

cp "$SRC/graphe-competences.json" "$DEST/graphe-competences.json"
cp "$SRC/mecaniques.json" "$DEST/mecaniques.json"
cp "$SRC"/banques/*.csv "$DEST/banques/"
cp "$SRC/voix/lignes.json" "$DEST/voix/lignes.json"

echo "Contenu synchronisé :"
ls -1 "$DEST" "$DEST/banques" "$DEST/voix"

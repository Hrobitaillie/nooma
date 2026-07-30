#!/usr/bin/env bash
#
# audit_dependances.sh — Audit d'hygiène des dépendances de l'app Plouma.
#
# Règle inviolable n°3 du CLAUDE.md : aucune dépendance (transitives INCLUSES) hors de
# l'allowlist. Objectif : empêcher qu'une session de vibe coding introduise un SDK réseau /
# analytics / crash-reporting qui casserait la conformité Kids (doc 07 §2).
#
# Comportement :
#   - Lit app/pubspec.lock (tous les packages, y compris transitifs).
#   - ÉCHEC IMMÉDIAT (exit 1) si un nom de package contient :
#       firebase, analytics, sentry, crashlytics, admob, ads
#   - Pour les autres : liste les paquets INCONNUS (absents de l'allowlist) et échoue
#     (exit 1) s'il y en a — en les listant clairement, sans planter.
#   - Succès (exit 0) si tout est couvert par l'allowlist.
#
# Usage : depuis app/  ->  ./tool/audit_dependances.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCK="${APP_DIR}/pubspec.lock"
ALLOWLIST="${SCRIPT_DIR}/dependances_autorisees.txt"

# Motifs interdits en dur (indépendants de l'allowlist).
INTERDITS_REGEX='firebase|analytics|sentry|crashlytics|admob|ads'

echo "== Audit des dépendances Plouma =="

if [[ ! -f "${LOCK}" ]]; then
  echo "ERREUR : ${LOCK} introuvable." >&2
  echo "        Lance d'abord 'flutter pub get' dans ${APP_DIR}." >&2
  exit 1
fi

if [[ ! -f "${ALLOWLIST}" ]]; then
  echo "ERREUR : allowlist introuvable : ${ALLOWLIST}" >&2
  exit 1
fi

# --- Extraction des noms de packages depuis pubspec.lock ---
# Dans un pubspec.lock, la section "packages:" liste chaque package comme une clé
# indentée de 2 espaces suivie de ':'. On s'arrête à la fin de cette section
# (toute ligne non indentée après "packages:", typiquement "sdks:").
packages="$(
  awk '
    /^packages:/ { in_pkgs = 1; next }
    in_pkgs && /^[^[:space:]]/ { in_pkgs = 0 }
    in_pkgs && /^  [A-Za-z0-9_]+:/ {
      line = $0
      sub(/^  /, "", line)
      sub(/:.*/, "", line)
      print line
    }
  ' "${LOCK}" | sort -u
)"

if [[ -z "${packages}" ]]; then
  echo "ERREUR : aucun package trouvé dans ${LOCK} (fichier vide ou mal formé ?)." >&2
  exit 1
fi

# --- 1) Vérification des motifs interdits (échec immédiat) ---
interdits_trouves="$(printf '%s\n' "${packages}" | grep -Ei "${INTERDITS_REGEX}" || true)"
if [[ -n "${interdits_trouves}" ]]; then
  echo "" >&2
  echo "ÉCHEC — SDK INTERDIT détecté (réseau/analytics/crash-reporting/pub) :" >&2
  printf '%s\n' "${interdits_trouves}" | sed 's/^/  ✗ /' >&2
  echo "" >&2
  echo "Ces catégories cassent la conformité Kids (doc 07 §2). Interdiction absolue." >&2
  exit 1
fi

# --- Chargement de l'allowlist (sans commentaires ni lignes vides) ---
allow="$(grep -Ev '^[[:space:]]*(#|$)' "${ALLOWLIST}" | sed 's/[[:space:]]*$//' | sort -u)"

# --- 2) Paquets inconnus (absents de l'allowlist) ---
inconnus="$(comm -23 <(printf '%s\n' "${packages}") <(printf '%s\n' "${allow}") || true)"

if [[ -n "${inconnus}" ]]; then
  echo "" >&2
  echo "ÉCHEC — paquet(s) hors allowlist (décision humaine requise) :" >&2
  printf '%s\n' "${inconnus}" | sed 's/^/  ? /' >&2
  echo "" >&2
  echo "Chaque nouvelle dépendance = décision humaine explicite (CLAUDE.md, règle n°3)." >&2
  echo "Si le paquet est légitime et ne communique pas, ajoute-le à :" >&2
  echo "  ${ALLOWLIST}" >&2
  exit 1
fi

count="$(printf '%s\n' "${packages}" | grep -c . || true)"
echo "OK — ${count} paquet(s), tous dans l'allowlist, aucun SDK interdit."
exit 0

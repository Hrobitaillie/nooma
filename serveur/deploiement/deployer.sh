#!/usr/bin/env bash
# Déploiement de l'atelier sur chappie (doc 18 §3.4) — à lancer SUR le serveur, en root :
#   bash /opt/plouma-atelier/repo/serveur/deploiement/deployer.sh
#
# Récupère le code de main SANS écraser les commits de contenu de la branche
# serveur/contenu (merge), puis redémarre le service.
set -euo pipefail

REPO=/opt/plouma-atelier/repo

cd "$REPO"
sudo -u plouma git fetch origin
sudo -u plouma git merge --no-edit origin/main
systemctl restart plouma-atelier
sleep 1
systemctl is-active plouma-atelier && curl -fsS -o /dev/null http://127.0.0.1:8090/cadrage/viewer/ \
  && echo "OK — atelier déployé et répondant."

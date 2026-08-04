Binaires web pour la base de données (Drift WASM)
=================================================

L'app utilise SQLite dans le navigateur via WebAssembly (donnees/ouverture_web.dart).
Deux fichiers statiques doivent être servis depuis ce dossier (app/web/) :

  - sqlite3.wasm     : moteur SQLite compilé en WebAssembly
  - drift_worker.js  : worker Drift (OPFS / IndexedDB)

Provenance EXACTE (release GitHub officielle drift 2.34.3 — versions synchronisées avec le
package `drift` épinglé dans pubspec.yaml : drift publie le sqlite3.wasm contre lequel il est
testé, ce qui évite tout décalage de version) :

  sqlite3.wasm
    https://github.com/simolus3/drift/releases/download/drift-2.34.3/sqlite3.wasm
    sha256 41cf968998241465d8b1dfffb1eb60dd10c35de5022a3647e14174ea3af84143

  drift_worker.js
    https://github.com/simolus3/drift/releases/download/drift-2.34.3/drift_worker.js
    sha256 4db0469de8ceabad8d5cd3d920614486ba587e100e39523f36f704a3aec5f26c

Ces fichiers ne communiquent avec aucun serveur : ils sont servis en local et le wasm tourne
dans un worker sandboxé. Si l'un d'eux est absent, l'app se rabat proprement sur une base EN
MÉMOIRE (avertissement dans la console, progression non sauvegardée) — voir ouverture_web.dart.

Pour les remettre à jour lors d'une montée de version de drift (tâche dédiée) :
  curl -sL -o app/web/sqlite3.wasm    <url sqlite3.wasm de la nouvelle release drift>
  curl -sL -o app/web/drift_worker.js <url drift_worker.js de la nouvelle release drift>
puis vérifier les sha256 et mettre à jour tool/dependances_autorisees.txt.

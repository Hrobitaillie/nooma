// Ouverture de la base sur le WEB — WasmDatabase (doc mission §4).
//
// Nécessite deux binaires servis depuis app/web/ (voir app/web/README-binaires-web.txt) :
//   - sqlite3.wasm    : moteur SQLite compilé en WebAssembly
//   - drift_worker.js : worker drift (OPFS / IndexedDB)
// Tous deux proviennent de la release GitHub officielle drift 2.34.3 (versions synchronisées
// avec le package drift épinglé). URLs exactes dans app/web/README-binaires-web.txt et dans
// tool/dependances_autorisees.txt (section « binaires web »).
//
// FALLBACK PROPRE : si le wasm ne charge pas (fichier absent, réseau bloqué…), WasmDatabase.open
// se rabat déjà automatiquement sur un stockage EN MÉMOIRE (persistance perdue au rechargement,
// mais l'app tourne). Si même l'ouverture échoue, on log un AVERTISSEMENT et on retombe sur une
// base en mémoire pure (LazyDatabase → WasmDatabase.opened in-memory).

import 'dart:developer' as developer;

import 'package:drift/drift.dart';
import 'package:drift/wasm.dart';
import 'package:sqlite3/wasm.dart' show WasmSqlite3;

/// Ouvre la base web (WASM). Renvoie un exécuteur paresseux : l'ouverture réelle (asynchrone,
/// chargement du wasm) est différée jusqu'à la première requête.
QueryExecutor ouvrirBaseLocale() {
  return LazyDatabase(() async {
    try {
      final resultat = await WasmDatabase.open(
        databaseName: 'plouma',
        sqlite3Uri: Uri.parse('sqlite3.wasm'),
        driftWorkerUri: Uri.parse('drift_worker.js'),
      );

      if (resultat.missingFeatures.isNotEmpty) {
        developer.log(
          'Base web : fonctionnalités navigateur manquantes '
          '(${resultat.missingFeatures.join(", ")}). Stockage possiblement non '
          'persistant.',
          name: 'plouma.donnees',
        );
      }

      return resultat.resolvedExecutor;
    } catch (e, st) {
      // Le wasm/worker n'a pas chargé : on ne bloque pas l'app. Base en mémoire (non
      // persistante) pour que la session courante fonctionne quand même.
      developer.log(
        'Base web : échec du chargement WASM ($e). Repli EN MÉMOIRE '
        '(la progression ne sera pas sauvegardée).',
        name: 'plouma.donnees',
        error: e,
        stackTrace: st,
      );
      return _baseEnMemoireWeb();
    }
  });
}

/// Base SQLite en mémoire pure sur le web (dernier recours). Charge le wasm sans worker ni
/// stockage — si le wasm lui-même est introuvable, l'exception remonte (rien ne peut alors
/// fonctionner côté SQL sur le web).
Future<QueryExecutor> _baseEnMemoireWeb() async {
  final sqlite3 = await WasmSqlite3.loadFromUrl(Uri.parse('sqlite3.wasm'));
  return WasmDatabase.inMemory(sqlite3);
}

// Ouverture de la base sur plateforme native (macOS / Android / iOS / Linux / Windows).
//
// Utilise drift_flutter (déjà épinglé, doc 06 §3) : fichier SQLite unique dans le répertoire
// applicatif. Aucun binaire à embarquer (sqlite3 est fourni par sqlite3_flutter_libs).

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

/// Ouvre le fichier SQLite `plouma` dans le répertoire de support de l'application.
QueryExecutor ouvrirBaseLocale() {
  return driftDatabase(name: 'plouma');
}

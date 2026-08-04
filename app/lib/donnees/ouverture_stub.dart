// Ouverture de la base — stub inatteignable (aucune plateforme réelle ne l'importe).
//
// Sélectionné uniquement si NI dart:io NI dart:js_interop ne sont disponibles, ce qui
// n'arrive sur aucune cible Flutter. Présent pour satisfaire l'import conditionnel.

import 'package:drift/drift.dart';

QueryExecutor ouvrirBaseLocale() {
  throw UnsupportedError(
    'Plateforme non supportée pour la base locale Plouma.',
  );
}

// Schéma Drift (SQLite) — event log append-only + projection (doc 06 §3).
//
// - `learning_events` : journal APPEND-ONLY, jamais muté. Chaque ligne = un exercice joué,
//   avec seed et version de contenu → tout parcours est reproductible et rejouable.
// - `skill_progress` : projection (maîtrise par compétence), RECALCULABLE en rejouant le log.
//   On peut donc changer l'algorithme du Directeur et recalculer toute la progression (doc 06 §3).
//
// Le code Dart généré (base.g.dart) est produit par build_runner :
//   dart run build_runner build --delete-conflicting-outputs

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'base.g.dart';

/// Journal append-only des exercices joués (doc 06 §3).
///
/// Aucune colonne n'est jamais mise à jour après insertion : on n'ajoute que des lignes.
class LearningEvents extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Identifiant de l'exercice / mécanique jouée.
  TextColumn get exercice => text()();

  /// Compétence pédagogique travaillée.
  TextColumn get competence => text()();

  /// Réussite de l'exercice.
  BoolColumn get succes => boolean()();

  /// Réussite obtenue avec une aide / un indice (pénalisée dans la maîtrise).
  BoolColumn get avecAide => boolean()();

  /// Durée de l'exercice, en millisecondes.
  IntColumn get dureeMs => integer()();

  /// Horodatage de l'événement (ms epoch).
  IntColumn get timestamp => integer()();

  /// Seed déterministe du niveau joué (reproductibilité, doc 06 §2).
  IntColumn get seed => integer()();

  /// Version du contenu pédagogique ayant généré le niveau (traçabilité).
  TextColumn get versionContenu => text()();
}

/// Projection : maîtrise courante par compétence (doc 06 §3).
///
/// Recalculable à tout moment en rejouant `learning_events`.
class SkillProgress extends Table {
  /// Compétence (clé primaire de la projection).
  TextColumn get competence => text()();

  /// Maîtrise courante 0..1 (moyenne glissante, cf. directeur/maitrise.dart).
  RealColumn get maitrise => real().withDefault(const Constant(0))();

  /// Nombre total de rencontres.
  IntColumn get rencontres => integer().withDefault(const Constant(0))();

  /// Compétence validée.
  BoolColumn get validee => boolean().withDefault(const Constant(false))();

  /// Boîte de Leitner courante (0..3) pour la répétition espacée.
  IntColumn get boiteLeitner => integer().withDefault(const Constant(0))();

  /// Jour du prochain rappel (écho) dû.
  RealColumn get prochainRappel => real().withDefault(const Constant(-1))();

  /// Dernier jour de rencontre (pour la décroissance temporelle).
  IntColumn get dernierJour => integer().withDefault(const Constant(-1))();

  @override
  Set<Column<Object>> get primaryKey => {competence};
}

@DriftDatabase(tables: [LearningEvents, SkillProgress])
class BaseLocale extends _$BaseLocale {
  BaseLocale([QueryExecutor? executor])
      : super(executor ?? _ouvrir());

  @override
  int get schemaVersion => 1;

  /// Ouvre la base locale (fichier SQLite unique dans le répertoire de l'app).
  static QueryExecutor _ouvrir() {
    return driftDatabase(name: 'plouma');
  }
}

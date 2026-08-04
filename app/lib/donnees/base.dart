// Schéma Drift (SQLite) — event log append-only + projection (doc 06 §3).
//
// - `learning_events` : journal APPEND-ONLY, jamais muté. Chaque ligne = un exercice joué,
//   avec seed et version de contenu → tout parcours est reproductible et rejouable.
// - `sessions` : une ligne par session terminée (numéro, jour logique, horodatage…). Le
//   couple (event log + sessions) suffit à RECONSTRUIRE l'état du Directeur par REJEU
//   (voir donnees/persistance.dart : recrée Directeur(graine) puis rejoue generateSession /
//   recevoirSession pour chaque session passée).
// - `ancre` : date d'ancrage (min des timestamps) — le jour logique 0. Stockée en dur pour
//   rester stable même si le premier event est un jour supprimé (reset dev).
// - `skill_progress` : projection (maîtrise par compétence), RECALCULABLE en rejouant le log.
//   On peut donc changer l'algorithme du Directeur et recalculer toute la progression (doc 06 §3).
//
// Le code Dart généré (base.g.dart) est produit par build_runner :
//   dart run build_runner build --delete-conflicting-outputs

import 'package:drift/drift.dart';

// Ouverture multi-plateforme (natif via drift_flutter, web via WasmDatabase) : isolée dans
// des fichiers conditionnels pour ne PAS importer dart:html/dart:io hors de leur plateforme.
import 'ouverture_stub.dart'
    if (dart.library.io) 'ouverture_native.dart'
    if (dart.library.js_interop) 'ouverture_web.dart';

part 'base.g.dart';

/// Journal append-only des exercices joués (doc 06 §3).
///
/// Aucune colonne n'est jamais mise à jour après insertion : on n'ajoute que des lignes.
class LearningEvents extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Numéro de session à laquelle appartient l'événement (clé de reconstruction : permet de
  /// regrouper les événements par session pour les réappairer aux specs regénérés).
  IntColumn get session => integer()();

  /// Position (0-based) du niveau dans la session (ordre des specs regénérés).
  IntColumn get niveau => integer()();

  /// Identifiant de l'exercice / mécanique jouée.
  TextColumn get exercice => text()();

  /// Compétence pédagogique travaillée.
  TextColumn get competence => text()();

  /// Réussite de l'exercice.
  BoolColumn get succes => boolean()();

  /// Réussite obtenue avec une aide / un indice (pénalisée dans la maîtrise).
  BoolColumn get avecAide => boolean()();

  /// Durée de l'exercice, en millisecondes (0 si non mesuré).
  IntColumn get dureeMs => integer()();

  /// Horodatage de l'événement (ms epoch).
  IntColumn get timestamp => integer()();

  /// Seed déterministe du niveau joué (reproductibilité, doc 06 §2).
  IntColumn get seed => integer()();

  /// Version du contenu pédagogique ayant généré le niveau (traçabilité).
  TextColumn get versionContenu => text()();
}

/// Métadonnées d'une session terminée (doc mission §1).
///
/// Le couple (learning_events + sessions) suffit à reconstruire l'état par rejeu : pour
/// chaque session on connaît (jourLogique, premiereDeLaSemaine) → generateSession est
/// regénérée à l'identique, et les événements de la session la remplissent.
class Sessions extends Table {
  /// Numéro de session (compteur monotone, clé primaire).
  IntColumn get numero => integer()();

  /// Jour logique (jours calendaires écoulés depuis l'ancre) au moment de la session.
  IntColumn get jourLogique => integer()();

  /// Vrai si c'est la première session d'une semaine calendaire depuis l'ancre.
  BoolColumn get premiereDeLaSemaine => boolean()();

  /// Horodatage réel de fin de session (ms epoch).
  IntColumn get timestamp => integer()();

  /// Graine du profil ayant piloté cette session (traçabilité + garde-fou de reconstruction).
  TextColumn get graine => text()();

  /// Version du contenu au moment de la session.
  TextColumn get versionContenu => text()();

  @override
  Set<Column<Object>> get primaryKey => {numero};
}

/// Ancre du jour logique (doc mission §5) : une seule ligne (id = 0).
///
/// timestamp = date du premier événement persisté. jour logique = jours calendaires écoulés
/// depuis cette ancre. Stockée explicitement pour rester stable et indépendante d'un min()
/// recalculé.
class Ancre extends Table {
  IntColumn get id => integer().withDefault(const Constant(0))();

  /// Horodatage d'ancrage (ms epoch) — le jour logique 0.
  IntColumn get timestamp => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
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

@DriftDatabase(tables: [LearningEvents, Sessions, Ancre, SkillProgress])
class BaseLocale extends _$BaseLocale {
  /// Ouvre la base : natif (drift_flutter) ou web (WASM) par défaut, ou sur un exécuteur
  /// fourni (tests : `BaseLocale(NativeDatabase.memory())`).
  // ignore: use_super_parameters
  BaseLocale([QueryExecutor? executor]) : super(executor ?? ouvrirBaseLocale());

  @override
  int get schemaVersion => 1;
}

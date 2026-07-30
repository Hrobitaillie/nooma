// Graphe de compétences — portage FIDÈLE de cadrage/simulateur/core/graphe.ts.
//
// Structure Pilier → Module (= biome) → Compétence (doc 04 §3.1). Le contenu pédagogique
// vit dans /contenu (JSON versionné, règle inviolable n°8) : cette lib reste PURE — elle
// NE lit AUCUN fichier. Elle reçoit le JSON DÉJÀ parsé (Map/List) et construit le graphe.
// Le chargement des assets est la responsabilité de la couche Flutter (services/contenu.dart).
//
// L'ordre des modules et des compétences est PRÉSERVÉ (tri par `ordre` croissant, puis ordre
// de déclaration des compétences) — l'oracle croisé en dépend.

/// Une compétence pédagogique atomique (un « nœud » du graphe).
class Competence {
  final String id;
  final String module;
  final List<String> prerequis; // ids de compétences
  final double difficulteIntrinseque; // 0..1 — les sons complexes sont plus durs

  const Competence({
    required this.id,
    required this.module,
    required this.prerequis,
    required this.difficulteIntrinseque,
  });
}

/// Un module = un biome. Toutes ses compétences sont « cœur » en simulation.
class Module {
  final String id;
  final String biome;
  final List<String> competences; // ids, dans l'ordre de déclaration
  final List<String> mecaniques; // union des mécaniques des compétences du module

  const Module({
    required this.id,
    required this.biome,
    required this.competences,
    required this.mecaniques,
  });
}

/// Le graphe complet, construit une fois depuis le JSON parsé, puis interrogé par le Directeur.
///
/// Équivalent des exports globaux de graphe.ts (COMPETENCES, MODULES, ORDRE_MODULES…),
/// mais encapsulé dans un objet immuable — pas d'état global dans une lib pure.
class Graphe {
  final List<Competence> competences;
  final List<Module> modules;
  final List<String> mecaniquesConnues;

  /// Ordre canonique des modules (par `ordre` croissant).
  final List<String> ordreModules;

  final Map<String, Competence> _competenceParId;
  final Map<String, Module> _moduleParId;

  Graphe._({
    required this.competences,
    required this.modules,
    required this.mecaniquesConnues,
  })  : ordreModules = modules.map((m) => m.id).toList(growable: false),
        _competenceParId = {for (final c in competences) c.id: c},
        _moduleParId = {for (final m in modules) m.id: m};

  /// Construit le graphe depuis le JSON DÉJÀ parsé.
  ///
  /// [grapheJson] = contenu de `contenu/graphe-competences.json` (objet avec `modules`).
  /// [mecaniquesJson] = contenu de `contenu/mecaniques.json` (objet avec `mecaniques`).
  /// Reproduit exactement la construction de graphe.ts : tri des modules par `ordre`,
  /// aplatissement des compétences, union (dédupliquée, ordre préservé) des mécaniques.
  factory Graphe.depuisJson(
    Map<String, dynamic> grapheJson,
    Map<String, dynamic> mecaniquesJson,
  ) {
    final List<Map<String, dynamic>> modulesJson =
        (grapheJson['modules'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .toList()
          ..sort((a, b) => (a['ordre'] as num).compareTo(b['ordre'] as num));

    final List<Competence> competences = [];
    final List<Module> modules = [];

    for (final m in modulesJson) {
      final String moduleId = m['id'] as String;
      final List<Map<String, dynamic>> compsJson =
          (m['competences'] as List<dynamic>).cast<Map<String, dynamic>>();

      final List<String> compIds = [];
      final List<String> mecaniquesModule = [];
      final Set<String> vues = <String>{};

      for (final c in compsJson) {
        final String compId = c['id'] as String;
        compIds.add(compId);
        competences.add(Competence(
          id: compId,
          module: moduleId,
          prerequis: (c['prerequis'] as List<dynamic>).cast<String>(),
          difficulteIntrinseque: (c['difficulte'] as num).toDouble(),
        ));
        for (final mec in (c['mecaniques'] as List<dynamic>).cast<String>()) {
          if (vues.add(mec)) mecaniquesModule.add(mec);
        }
      }

      modules.add(Module(
        id: moduleId,
        biome: m['biome'] as String,
        competences: compIds,
        mecaniques: mecaniquesModule,
      ));
    }

    final List<String> mecaniquesConnues =
        (mecaniquesJson['mecaniques'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .map((e) => e['id'] as String)
            .toList(growable: false);

    return Graphe._(
      competences: competences,
      modules: modules,
      mecaniquesConnues: mecaniquesConnues,
    );
  }

  List<Competence> competencesDe(String moduleId) =>
      competences.where((c) => c.module == moduleId).toList(growable: false);

  Competence getCompetence(String id) {
    final c = _competenceParId[id];
    if (c == null) throw StateError('compétence inconnue : $id');
    return c;
  }

  Module getModule(String id) {
    final m = _moduleParId[id];
    if (m == null) throw StateError('module inconnu : $id');
    return m;
  }
}

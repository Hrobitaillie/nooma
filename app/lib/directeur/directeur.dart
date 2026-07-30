// Le Directeur — moteur adaptatif pur, sans UI (doc 04 §4-8, doc 06 §4).
//
// Portage FIDÈLE de cadrage/simulateur/core/directeur.ts (oracle de non-régression).
// Il ne voit QUE les réponses de l'enfant (via les états de maîtrise), jamais son état
// latent. generateSession(jour, seed) → une session-menu ; recevoir les résultats met
// à jour la maîtrise, la pré-validation de module et le calendrier Leitner.
//
// Lib PURE : aucun import Flutter/Flame. Le graphe est reçu construit (Graphe), jamais lu
// depuis un fichier ici. Les tris qui décident d'un `[0]` sont STABLES (comme le sort V8,
// stable depuis ES2019) pour reproduire à l'identique les choix du simulateur TypeScript.

import 'dart:math' as math;

import 'graphe.dart';
import 'maitrise.dart';
import 'params.dart';
import 'rng.dart';

/// Type de niveau servi dans une session-menu.
enum TypeNiveau {
  echauffement,
  coeur,
  dessert,
  cadeau,
  echo,
  reve,
  defi,
  confirmation;

  /// Identifiant textuel identique à celui du simulateur (pour l'oracle croisé / journalisation).
  String get id => switch (this) {
        TypeNiveau.echauffement => 'echauffement',
        TypeNiveau.coeur => 'coeur',
        TypeNiveau.dessert => 'dessert',
        TypeNiveau.cadeau => 'cadeau',
        TypeNiveau.echo => 'echo',
        TypeNiveau.reve => 'reve',
        TypeNiveau.defi => 'defi',
        TypeNiveau.confirmation => 'confirmation',
      };
}

/// Une cible d'un niveau : la compétence travaillée et le cran servi (0..3).
class CibleNiveau {
  final String competence;
  final int difficulte;

  const CibleNiveau({required this.competence, required this.difficulte});
}

/// Un niveau généré par le Directeur, prêt à être joué par une mécanique.
class NiveauSpec {
  final TypeNiveau type;
  final String mecanique;

  /// Compétences travaillées, avec le cran de difficulté servi (0..3).
  final List<CibleNiveau> cibles;
  final int nbEssais;

  const NiveauSpec({
    required this.type,
    required this.mecanique,
    required this.cibles,
    required this.nbEssais,
  });
}

/// Résultat d'un essai unique (réussite au 1er coup, ou complétion avec aide).
class ResultatEssai {
  final String competence;
  final bool succes; // réussite au premier essai, sans aide
  final bool avecAide; // complété avec indiçage (jamais d'échec bloquant)

  const ResultatEssai({
    required this.competence,
    required this.succes,
    required this.avecAide,
  });
}

/// Résultats d'un niveau complet (le spec servi + les essais joués).
class ResultatNiveau {
  final NiveauSpec spec;
  final List<ResultatEssai> essais;

  const ResultatNiveau({required this.spec, required this.essais});
}

/// Type d'événement remonté par le Directeur (biome franchi, signal parent, stagnation…).
enum TypeEvenement {
  validationCompetence,
  preValidationModule,
  validationModule,
  changementBiome,
  interventionStagnation,
  signalParent,
  retourApprentissage;

  /// Identifiant textuel identique au simulateur (pour l'oracle croisé).
  String get id => switch (this) {
        TypeEvenement.validationCompetence => 'validation-competence',
        TypeEvenement.preValidationModule => 'pre-validation-module',
        TypeEvenement.validationModule => 'validation-module',
        TypeEvenement.changementBiome => 'changement-biome',
        TypeEvenement.interventionStagnation => 'intervention-stagnation',
        TypeEvenement.signalParent => 'signal-parent',
        TypeEvenement.retourApprentissage => 'retour-apprentissage',
      };
}

/// Un événement daté remonté par le Directeur.
class EvenementDirecteur {
  final TypeEvenement type;
  final String detail;
  final int jour;

  const EvenementDirecteur({
    required this.type,
    required this.detail,
    required this.jour,
  });
}

/// Une entrée de l'historique des biomes traversés.
class HistoriqueBiome {
  final String module;
  final int niveaux;
  final int jourEntree;
  final int jourSortie;

  const HistoriqueBiome({
    required this.module,
    required this.niveaux,
    required this.jourEntree,
    required this.jourSortie,
  });
}

/// Tri STABLE croissant par une clé numérique — reproduit `Array.prototype.sort` de V8
/// (stable depuis ES2019), là où `List.sort` de Dart ne garantit PAS la stabilité.
/// Les `[0]` pris après tri en dépendent : sans stabilité, l'oracle divergerait sur les
/// égalités. Ne mute pas l'entrée.
List<T> _triStable<T>(List<T> arr, num Function(T) cle) {
  final List<MapEntry<int, T>> indexes = [
    for (var i = 0; i < arr.length; i++) MapEntry(i, arr[i]),
  ];
  indexes.sort((a, b) {
    final int c = cle(a.value).compareTo(cle(b.value));
    return c != 0 ? c : a.key.compareTo(b.key);
  });
  return [for (final e in indexes) e.value];
}

/// Phase du Directeur pour le module courant.
enum PhaseDirecteur { apprentissage, confirmation }

/// Le Directeur : machine adaptative déterministe par seed.
class Directeur {
  final Graphe graphe;

  final Map<String, EtatCompetence> etats = {};
  int moduleIndex = 0;
  PhaseDirecteur phase = PhaseDirecteur.apprentissage;
  int confirmationsReussies = 0;
  final Set<int> confirmationsSessions = <int>{};
  int niveauxDansBiome = 0;
  final List<HistoriqueBiome> historiqueBiomes = [];
  int jourEntreeBiome = 0;
  final List<EvenementDirecteur> evenements = [];

  // Garde-fous mesurés par la simulation.
  int violationsSautDifficulte = 0;
  int violationsMecanique = 0;

  String _derniereMecanique = '';
  Map<String, int> _mecaniquesSession = {};
  int _sessionsSansProgres = 0;
  double _sommeMaitrisePrecedente = 0;
  bool _signalEnvoyePourBiome = false;
  List<int> _reussitesRecentes = [];
  final int _rngGraine;

  Directeur(this.graphe, String graine) : _rngGraine = hashString(graine) {
    // Insertion dans l'ordre canonique (ORDRE_MODULES × competencesDe) : l'itération
    // de `etats` (échos, rêves) dépend de cet ordre — Dart préserve l'ordre d'insertion.
    for (final m in graphe.ordreModules) {
      for (final c in graphe.competencesDe(m)) {
        etats[c.id] = etatInitial();
      }
    }
  }

  Module get moduleCourant => graphe.getModule(graphe.ordreModules[moduleIndex]);
  bool get termine => moduleIndex >= graphe.ordreModules.length;

  EtatCompetence etat(String compId) {
    final e = etats[compId];
    if (e == null) throw StateError('état manquant : $compId');
    return e;
  }

  /// Compétences du module courant dont les prérequis sont validés (ou hors module, acquis).
  List<String> _competencesOuvertes() {
    return moduleCourant.competences.where((id) {
      final c = graphe.getCompetence(id);
      return c.prerequis.every((p) =>
          etat(p).validee || !moduleCourant.competences.contains(p));
    }).toList();
  }

  /// Cible « la plus rentable » : dans la zone proximale — ni acquise, ni hors de portée.
  String _choisirCible(int jour) {
    final ouvertes =
        _competencesOuvertes().where((id) => !etat(id).validee).toList();
    if (ouvertes.isEmpty) return moduleCourant.competences[0];
    // Priorité : maîtrise effective la plus basse d'abord (tri stable, on prend [0]).
    return _triStable(ouvertes, (a) => maitriseEffective(etat(a), jour))[0];
  }

  /// Cran servi : suit la maîtrise, sans jamais sauter plus d'un cran (garde-fou en dur).
  int _difficultePour(String compId, int jour) {
    final e = etat(compId);
    final int visee = math.min(Params.crans - 1,
        (maitriseEffective(e, jour) * Params.crans).floor());
    int servie = visee;
    if ((visee - e.derniereDifficulte).abs() > Params.sautMaxDifficulte) {
      servie = e.derniereDifficulte +
          (visee - e.derniereDifficulte).sign * Params.sautMaxDifficulte;
    }
    if ((servie - e.derniereDifficulte).abs() > Params.sautMaxDifficulte &&
        e.rencontres > 0) {
      violationsSautDifficulte++;
    }
    e.derniereDifficulte = servie;
    return servie;
  }

  /// Mécanique compatible, jamais 2× d'affilée ni plus de 2× par session (doc 04 §6.3).
  String _choisirMecanique(Rng rng, Module module, {bool forcerChangement = false}) {
    final dispo = module.mecaniques
        .where((m) =>
            m != _derniereMecanique &&
            (_mecaniquesSession[m] ?? 0) < Params.maxMemeMecaniqueParSession)
        .toList();
    final String choix = dispo.isNotEmpty
        ? pick(rng, dispo)
        : (_firstOrNull(module.mecaniques, (m) => m != _derniereMecanique) ??
            module.mecaniques[0]);
    if (choix == _derniereMecanique && !forcerChangement) violationsMecanique++;
    _derniereMecanique = choix;
    _mecaniquesSession[choix] = (_mecaniquesSession[choix] ?? 0) + 1;
    return choix;
  }

  /// Échos dus : compétences validées dont le rappel Leitner est arrivé, ou refroidies.
  List<String> _echosDus(int jour) {
    final List<String> dus = [];
    for (final entry in etats.entries) {
      final e = entry.value;
      if (!e.validee) continue;
      if ((e.prochainRappel >= 0 && jour >= e.prochainRappel) ||
          maitriseEffective(e, jour) < Params.seuilEcho) {
        dus.add(entry.key);
      }
    }
    return _triStable(dus, (a) => maitriseEffective(etat(a), jour));
  }

  /// Compose la session-menu (doc 04 §6.2) : échauffement → cœur (1-2) → dessert.
  List<NiveauSpec> generateSession(
      int jour, int session, bool premiereDeLaSemaine) {
    final Rng rng = splitmix32(_rngGraine ^ hashString('s${session}j$jour'));
    _mecaniquesSession = {};
    final List<NiveauSpec> niveaux = [];
    final Module module = moduleCourant;
    final List<String> echos = _echosDus(jour);

    // 1. Échauffement : compétence la mieux maîtrisée, cran bas → succès garanti.
    final acquises = _triStable(
      module.competences.where((id) => etat(id).rencontres > 0).toList(),
      (id) => -maitriseEffective(etat(id), jour), // tri décroissant → négatif
    );
    final String compEchauffement =
        acquises.isNotEmpty ? acquises[0] : _choisirCible(jour);
    niveaux.add(NiveauSpec(
      type: TypeNiveau.echauffement,
      mecanique: _choisirMecanique(rng, module),
      cibles: [
        CibleNiveau(
          competence: compEchauffement,
          difficulte: math.max(0, etat(compEchauffement).derniereDifficulte - 1),
        ),
      ],
      nbEssais: 4,
    ));

    // 2. Cœur : phase confirmation (pré-validation du module) OU apprentissage proximal.
    if (phase == PhaseDirecteur.confirmation) {
      final melange = shuffleRng(rng, module.competences).take(3).toList();
      niveaux.add(NiveauSpec(
        type: TypeNiveau.confirmation,
        mecanique: _choisirMecanique(rng, module),
        cibles: melange
            .map((c) =>
                CibleNiveau(competence: c, difficulte: etat(c).derniereDifficulte))
            .toList(),
        nbEssais: 6,
      ));
    } else {
      final int nbCoeur = Params.niveauxCoeurMin +
          (rng() < 0.5 ? Params.niveauxCoeurMax - Params.niveauxCoeurMin : 0);
      for (int i = 0; i < nbCoeur; i++) {
        final String cible = _choisirCible(jour);
        final List<CibleNiveau> cibles = [
          CibleNiveau(competence: cible, difficulte: _difficultePour(cible, jour)),
        ];
        // Mix 70-80/20-30 : une compétence d'entretien glissée dans le niveau.
        if (echos.isNotEmpty && rng() < Params.partRevision * 2) {
          final String entretien = echos.removeAt(0);
          cibles.add(CibleNiveau(
              competence: entretien,
              difficulte: etat(entretien).derniereDifficulte));
        }
        niveaux.add(NiveauSpec(
          type: TypeNiveau.coeur,
          mecanique: _choisirMecanique(rng, module),
          cibles: cibles,
          nbEssais: 6,
        ));
      }
    }

    // 3. Rêve de Plouma (1re session de la semaine) : interleaving de biomes passés.
    if (premiereDeLaSemaine && moduleIndex > 0) {
      final List<String> passees = [
        for (final entry in etats.entries)
          if (entry.value.validee) entry.key,
      ];
      if (passees.length >= 2) {
        final choisies = shuffleRng(rng, passees).take(3).toList();
        niveaux.add(NiveauSpec(
          type: TypeNiveau.reve,
          mecanique: _choisirMecanique(rng, module),
          cibles: choisies
              .map((c) => CibleNiveau(
                  competence: c, difficulte: etat(c).derniereDifficulte))
              .toList(),
          nbEssais: 5,
        ));
      }
    }

    // 4. Dessert : écho déguisé si un rappel est dû, sinon cadeau ou niveau plaisir.
    if (echos.isNotEmpty) {
      final String echo = echos.removeAt(0);
      niveaux.add(NiveauSpec(
        type: TypeNiveau.echo,
        mecanique: _choisirMecanique(rng, module),
        cibles: [
          CibleNiveau(competence: echo, difficulte: etat(echo).derniereDifficulte),
        ],
        nbEssais: 4,
      ));
    } else if (rng() < Params.freqNoeudCadeau * niveaux.length) {
      niveaux.add(NiveauSpec(
        type: TypeNiveau.cadeau,
        mecanique: _choisirMecanique(rng, module),
        cibles: const [],
        nbEssais: 0,
      ));
    }

    // 5. Défi de Plouma : seulement en réussite forte, refusable (accepté côté enfant).
    final double tauxRecent = _reussitesRecentes.length >= 8
        ? _reussitesRecentes.reduce((a, b) => a + b) / _reussitesRecentes.length
        : 0;
    if (tauxRecent >= Params.seuilDefi &&
        phase == PhaseDirecteur.apprentissage &&
        rng() < 0.5) {
      final String cible = _choisirCible(jour);
      final e = etat(cible);
      niveaux.add(NiveauSpec(
        type: TypeNiveau.defi,
        mecanique: _choisirMecanique(rng, module),
        cibles: [
          CibleNiveau(
            competence: cible,
            difficulte: math.min(Params.crans - 1, e.derniereDifficulte + 1),
          ),
        ],
        nbEssais: 4,
      ));
    }

    return niveaux;
  }

  /// Ingère les résultats d'une session complète et fait avancer la machine.
  void recevoirSession(List<ResultatNiveau> resultats, int jour, int session) {
    bool progres = false;
    final double sommeMaitriseAvant = _sommeMaitrisePrecedente;

    for (final r in resultats) {
      final spec = r.spec;
      final essais = r.essais;
      if (spec.type == TypeNiveau.cadeau) {
        niveauxDansBiome++;
        continue;
      }
      final int sansAide = essais.where((e) => e.succes).length;
      final double taux = essais.isNotEmpty ? sansAide / essais.length : 1;
      _reussitesRecentes.addAll(essais.map((e) => e.succes ? 1 : 0));
      if (_reussitesRecentes.length > 30) {
        _reussitesRecentes =
            _reussitesRecentes.sublist(_reussitesRecentes.length - 30);
      }

      for (final essai in essais) {
        final e = etat(essai.competence);
        if (spec.type == TypeNiveau.echo || spec.type == TypeNiveau.reve) {
          appliquerEcho(e, essai.succes, jour);
          appliquerReponse(e, essai.succes, essai.avecAide, jour, session);
        } else {
          appliquerReponse(e, essai.succes, essai.avecAide, jour, session);
        }
      }
      if (spec.cibles
          .any((c) => moduleCourant.competences.contains(c.competence))) {
        niveauxDansBiome++;
      }

      // Stagnation : N niveaux consécutifs sous la cible sur la même compétence cible
      // → bascule de mécanique + redescente d'un cran (doc 04 §2 risque 2).
      final CibleNiveau? cible = spec.cibles.isNotEmpty ? spec.cibles[0] : null;
      if (cible != null &&
          (spec.type == TypeNiveau.coeur ||
              spec.type == TypeNiveau.confirmation)) {
        final e = etat(cible.competence);
        if (taux < Params.cibleReussiteMin) {
          e.sousCibleConsecutifs++;
          if (e.sousCibleConsecutifs >= Params.stagnationNiveaux) {
            e.derniereDifficulte = math.max(0, e.derniereDifficulte - 1);
            e.sousCibleConsecutifs = 0;
            evenements.add(EvenementDirecteur(
              type: TypeEvenement.interventionStagnation,
              detail: cible.competence,
              jour: jour,
            ));
          }
        } else {
          e.sousCibleConsecutifs = 0;
        }
      }

      // Pré-validation : niveaux de confirmation réussis / ratés (doc 04 §3.2).
      if (spec.type == TypeNiveau.confirmation) {
        if (taux >= Params.reussiteConfirmation) {
          confirmationsReussies++;
          confirmationsSessions.add(session);
        } else {
          final faible = _triStable(
              List<CibleNiveau>.of(spec.cibles),
              (c) => etat(c.competence).maitrise)[0];
          phase = PhaseDirecteur.apprentissage;
          confirmationsReussies = 0;
          confirmationsSessions.clear();
          etat(faible.competence).validee = false; // retour en apprentissage ciblé
          evenements.add(EvenementDirecteur(
            type: TypeEvenement.retourApprentissage,
            detail: faible.competence,
            jour: jour,
          ));
        }
      }
    }

    // Validations de compétences.
    for (final id in moduleCourant.competences) {
      final e = etat(id);
      if (estValidable(e)) {
        valider(e, jour);
        progres = true;
        evenements.add(EvenementDirecteur(
          type: TypeEvenement.validationCompetence,
          detail: id,
          jour: jour,
        ));
      }
    }

    // Toutes les compétences cœur validées → entrée en pré-validation.
    if (phase == PhaseDirecteur.apprentissage &&
        moduleCourant.competences.every((id) => etat(id).validee)) {
      phase = PhaseDirecteur.confirmation;
      confirmationsReussies = 0;
      confirmationsSessions.clear();
      evenements.add(EvenementDirecteur(
        type: TypeEvenement.preValidationModule,
        detail: moduleCourant.id,
        jour: jour,
      ));
    }

    // Pré-validation aboutie (2-3 niveaux de confirmation sur ≥ 2 sessions) → biome suivant.
    if (phase == PhaseDirecteur.confirmation &&
        confirmationsReussies >= Params.niveauxConfirmation &&
        confirmationsSessions.length >= Params.sessionsDistinctesMin) {
      evenements.add(EvenementDirecteur(
        type: TypeEvenement.validationModule,
        detail: moduleCourant.id,
        jour: jour,
      ));
      historiqueBiomes.add(HistoriqueBiome(
        module: moduleCourant.id,
        niveaux: niveauxDansBiome,
        jourEntree: jourEntreeBiome,
        jourSortie: jour,
      ));
      jourEntreeBiome = jour;
      _signalEnvoyePourBiome = false;
      moduleIndex++;
      phase = PhaseDirecteur.apprentissage;
      confirmationsReussies = 0;
      confirmationsSessions.clear();
      niveauxDansBiome = 0;
      if (!termine) {
        evenements.add(EvenementDirecteur(
          type: TypeEvenement.changementBiome,
          detail: moduleCourant.id,
          jour: jour,
        ));
      }
    }
    if (termine) return; // tout le graphe est validé : plus rien à piloter

    // Progrès mesurable = une validation OU la maîtrise cumulée du module qui monte.
    final double sommeMaitrise = termine
        ? 0
        : moduleCourant.competences
            .fold<double>(0, (a, id) => a + etat(id).maitrise);
    if (sommeMaitrise - sommeMaitriseAvant > 0.02) progres = true;
    _sommeMaitrisePrecedente = sommeMaitrise;

    // Signal discret côté parent après N sessions sans progrès mesurable (doc 04 §2).
    if (progres) {
      _sessionsSansProgres = 0;
    } else {
      _sessionsSansProgres++;
      if (_sessionsSansProgres >= Params.stagnationSessions) {
        evenements.add(EvenementDirecteur(
          type: TypeEvenement.signalParent,
          detail: moduleCourant.id,
          jour: jour,
        ));
        _sessionsSansProgres = 0;
      }
    }

    // Filet de secours : au-delà d'un volume anormal de niveaux dans un biome, on signale.
    if (!_signalEnvoyePourBiome && niveauxDansBiome >= 55) {
      evenements.add(EvenementDirecteur(
        type: TypeEvenement.signalParent,
        detail: moduleCourant.id,
        jour: jour,
      ));
      _signalEnvoyePourBiome = true;
    }
  }
}

/// Premier élément satisfaisant [test], ou null — équivalent de `Array.prototype.find`.
T? _firstOrNull<T>(List<T> arr, bool Function(T) test) {
  for (final e in arr) {
    if (test(e)) return e;
  }
  return null;
}

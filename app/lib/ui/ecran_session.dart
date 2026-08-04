// Écran de session — enchaîne les NiveauSpec d'une session-menu, un par un.
//
// Reçoit la liste de NiveauSpec (générée par le Directeur), affiche l'écran de mécanique
// adapté à chaque niveau, collecte les ResultatNiveau, puis rend le tout via onSessionTerminee.
// Le mapping type/mécanique → écran est fait ici (câblage, doc mission §6).

import 'package:flutter/material.dart';

import '../directeur/directeur.dart';
import '../mecaniques/ecran_cadeau.dart';
import '../mecaniques/fallback_dev.dart';
import '../mecaniques/tape_la_syllabe.dart';
import '../services/contenu.dart';
import '../services/voix.dart';

/// Enchaîne les niveaux d'une session et rend les résultats complets.
class EcranSession extends StatefulWidget {
  final List<NiveauSpec> niveaux;
  final List<ItemSyllabes> banque;
  final ServiceVoix voix;

  /// Appelé quand toute la session est jouée : liste des ResultatNiveau (1 par niveau).
  final void Function(List<ResultatNiveau> resultats) onSessionTerminee;

  const EcranSession({
    super.key,
    required this.niveaux,
    required this.banque,
    required this.voix,
    required this.onSessionTerminee,
  });

  @override
  State<EcranSession> createState() => _EcranSessionState();
}

class _EcranSessionState extends State<EcranSession> {
  int _index = 0;
  final _resultats = <ResultatNiveau>[];

  void _niveauTermine(List<ResultatEssai> essais) {
    _resultats.add(ResultatNiveau(spec: widget.niveaux[_index], essais: essais));
    if (_index + 1 >= widget.niveaux.length) {
      widget.onSessionTerminee(List.unmodifiable(_resultats));
      return;
    }
    setState(() => _index++);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.niveaux.isEmpty) {
      // Session vide (ne devrait pas arriver) : on termine immédiatement.
      WidgetsBinding.instance.addPostFrameCallback(
          (_) => widget.onSessionTerminee(const []));
      return const SizedBox.shrink();
    }
    final spec = widget.niveaux[_index];
    // La clé force un remontage propre du widget de mécanique à chaque niveau.
    final key = ValueKey('niveau-$_index');
    return _ecranPour(spec, key);
  }

  /// Sélectionne l'écran de mécanique pour un NiveauSpec (doc mission §4-5-6).
  Widget _ecranPour(NiveauSpec spec, Key key) {
    // 1. Niveau cadeau : petit écran surprise, aucun exercice.
    if (spec.type == TypeNiveau.cadeau) {
      return EcranCadeau(key: key, voix: widget.voix, onTermine: _niveauTermine);
    }
    // 2. Mécanique « Tape la syllabe » : la vraie mécanique de cette tranche.
    if (spec.mecanique == 'tape-la-syllabe') {
      return EcranTapeLaSyllabe(
        key: key,
        spec: spec,
        banque: widget.banque,
        voix: widget.voix,
        onTermine: _niveauTermine,
      );
    }
    // 3. Toute autre mécanique demandée par le Directeur : repli [DEV].
    return EcranFallbackDev(
      key: key,
      spec: spec,
      banque: widget.banque,
      voix: widget.voix,
      onTermine: _niveauTermine,
    );
  }
}

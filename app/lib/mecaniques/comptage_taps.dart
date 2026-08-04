// Comptage des taps de « Tape la syllabe » — logique PURE et testable.
//
// L'enfant tape sur le tambour au rythme des syllabes. On compte les taps ; après ~1,2 s
// sans nouveau tap, on valide. Réussite = nombre de taps == nombre de syllabes orales.
//
// Cette classe ne connaît ni l'UI ni le temps réel : elle reçoit les taps un par un et
// répond à « combien de taps ? » / « est-ce réussi pour N syllabes ? ». Le déclenchement de
// la validation après inactivité (le timer de 1,2 s) est géré par le widget.

/// Délai d'inactivité après le dernier tap avant validation automatique.
const Duration kDelaiValidationTaps = Duration(milliseconds: 1200);

/// Accumulateur de taps pour un essai de « Tape la syllabe ».
class CompteurTaps {
  int _taps = 0;

  /// Nombre de taps enregistrés depuis la remise à zéro.
  int get taps => _taps;

  /// Enregistre un tap sur le tambour.
  void taper() => _taps++;

  /// Remet le compteur à zéro (nouvel essai).
  void reinitialiser() => _taps = 0;

  /// Réussite : le nombre de taps correspond exactement aux syllabes orales attendues.
  bool reussitePour(int syllabesAttendues) => _taps == syllabesAttendues;
}

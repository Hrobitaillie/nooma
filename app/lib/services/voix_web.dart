// Implémentation web du service Voix — Web Speech API (DEV UNIQUEMENT).
//
// Utilise `package:web` (bindings js_interop officiels, déjà dans pubspec.lock / allowlist —
// AUCUN package ajouté). `window.speechSynthesis.speak(SpeechSynthesisUtterance)`.
// Voix fr-FR, débit lent (~0.85) adapté aux 5-7 ans.
//
// ⚠️ DEV ONLY : voir l'en-tête de voix.dart. Ce fichier n'est compilé QUE sur le web.

import 'dart:async';
import 'dart:js_interop';

// package:web est un transitif du SDK Flutter, DÉJÀ présent dans pubspec.lock et dans
// l'allowlist (tool/dependances_autorisees.txt). On l'utilise directement pour l'interop TTS
// (autorisé par la mission) SANS l'ajouter à pubspec.yaml (règle inviolable n°3 : aucune
// nouvelle dépendance directe). D'où l'ignore ciblé du lint `depend_on_referenced_packages`.
// ignore: depend_on_referenced_packages
import 'package:web/web.dart' as web;

import 'voix.dart';

/// Fabrique la voix web (appelée par creerServiceVoix quand kDebugMode && kIsWeb).
ServiceVoix creerVoixPlateforme() => _VoixWeb();

/// Débit lent : les 5-7 ans ont besoin d'entendre chaque syllabe distinctement (doc 02).
const double _debitLent = 0.85;

/// Langue cible des consignes et des mots.
const String _langue = 'fr-FR';

/// Synthèse vocale via l'API navigateur. Sélectionne une voix française si présente.
class _VoixWeb implements ServiceVoix {
  web.SpeechSynthesisVoice? _voixFr;
  bool _voixCherchee = false;

  /// Cherche (paresseusement) une voix fr-FR parmi celles du navigateur.
  ///
  /// getVoices() peut renvoyer une liste vide au tout premier appel (chargement asynchrone
  /// des voix) : on retente à chaque `dire` tant qu'on n'a rien trouvé.
  web.SpeechSynthesisVoice? _trouverVoixFr() {
    if (_voixFr != null) return _voixFr;
    final voix = web.window.speechSynthesis.getVoices().toDart;
    for (final v in voix) {
      if (v.lang.toLowerCase().startsWith('fr')) {
        _voixFr = v;
        break;
      }
    }
    _voixCherchee = voix.isNotEmpty;
    return _voixFr;
  }

  @override
  Future<void> dire(String texte) async {
    final t = texte.trim();
    if (t.isEmpty) return;

    // Ré-essayer la sélection de voix tant que la liste n'a pas été peuplée.
    if (!_voixCherchee || _voixFr == null) _trouverVoixFr();

    final utterance = web.SpeechSynthesisUtterance(t)
      ..lang = _langue
      ..rate = _debitLent
      ..pitch = 1.0
      ..volume = 1.0;
    final v = _voixFr;
    if (v != null) utterance.voice = v;

    final completer = Completer<void>();
    void terminer([web.Event? _]) {
      if (!completer.isCompleted) completer.complete();
    }

    utterance.onend = terminer.toJS;
    // onerror (voix indisponible, interruption) : on résout quand même pour ne pas bloquer
    // la boucle de jeu — le TTS n'est qu'un confort de dev.
    utterance.onerror = ((web.Event _) => terminer()).toJS;

    web.window.speechSynthesis.speak(utterance);

    // Filet de sécurité : certains navigateurs n'émettent pas onend de façon fiable.
    // On borne l'attente pour ne jamais figer l'enchaînement des consignes.
    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {},
    );
  }

  @override
  void couper() {
    web.window.speechSynthesis.cancel();
  }
}

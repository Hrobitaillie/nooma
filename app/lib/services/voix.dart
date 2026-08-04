// Service Voix — synthèse vocale DEV UNIQUEMENT (consignes + mots).
//
// ⚠️⚠️ RÈGLE : le TTS est l'OUTIL D'ITÉRATION, JAMAIS en release. Il permet de jouer la
// boucle sans attendre les enregistrements studio. En production, l'audio des consignes et
// des mots viendra d'ASSETS LOCAUX pré-enregistrés (voir services/audio.dart, doc 06 §1) —
// 100 % offline, aucune permission réseau. Ce service DOIT être retiré/désactivé avant tout
// build de release (garde-fou `kDebugMode` ci-dessous : no-op silencieux hors debug).
//
// ⚠️ Règle inviolable n°6 (CLAUDE.md) : l'audio dit le SON du graphème (« [o] »), jamais le
// NOM de la lettre. Les textes passés ici sont donc des MOTS et des consignes, pas des noms
// de lettres — la responsabilité du contenu reste à l'appelant.
//
// Interop web : on utilise `window.speechSynthesis` via `package:web` + `dart:js_interop`
// (déjà dans pubspec.lock, allowlist OK — AUCUN package ajouté). Sur les autres plateformes
// (et hors debug), l'implémentation est un no-op silencieux.

import 'package:flutter/foundation.dart'
    show kDebugMode, kIsWeb, defaultTargetPlatform, TargetPlatform;

import 'voix_web.dart' if (dart.library.io) 'voix_stub.dart' as impl;

/// Contrat du service de voix. Une seule méthode : dire un texte (consigne ou mot).
///
/// L'implémentation concrète dépend de la plateforme (web = Web Speech API ; autres = no-op).
abstract interface class ServiceVoix {
  /// Prononce [texte] en français, débit lent (adapté aux 5-7 ans).
  ///
  /// Le futur retourné se résout quand la synthèse est terminée (ou immédiatement en no-op),
  /// ce qui permet d'enchaîner « écoute… » puis le mot, ou de découper syllabe par syllabe.
  Future<void> dire(String texte);

  /// Interrompt toute synthèse en cours (ex. l'enfant change de niveau).
  void couper();
}

/// Fabrique le service de voix adapté à la plateforme courante.
///
/// - Web en debug → synthèse Web Speech API (DEV).
/// - Tout le reste (release, mobile, desktop, tests) → no-op silencieux.
ServiceVoix creerServiceVoix() {
  // Garde-fou release : le TTS ne s'active QUE en debug et QUE sur le web.
  if (kDebugMode && kIsWeb) {
    return impl.creerVoixPlateforme();
  }
  return const _VoixMuette();
}

/// Implémentation no-op : ne dit rien, résout immédiatement. Utilisée hors debug/web.
class _VoixMuette implements ServiceVoix {
  const _VoixMuette();

  @override
  Future<void> dire(String texte) async {
    // Silencieux par conception (release, mobile, tests). Aucun effet de bord.
  }

  @override
  void couper() {}
}

/// Vrai sur les plateformes où un TTS de dev pourrait exister (info de debug).
bool get voixDisponibleEnDev =>
    kDebugMode &&
    kIsWeb &&
    defaultTargetPlatform != TargetPlatform.fuchsia; // garde générique

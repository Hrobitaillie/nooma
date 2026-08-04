// Implémentation « non-web » du service Voix — no-op silencieux.
//
// Compilée sur les plateformes avec dart:io (mobile, desktop, tests). Aucune synthèse : en
// production, l'audio viendra d'assets locaux (services/audio.dart). Cf. en-tête de voix.dart.

import 'voix.dart';

/// Fabrique la voix « stub » (jamais réellement appelée car creerServiceVoix filtre déjà
/// sur kIsWeb, mais nécessaire pour que l'import conditionnel compile hors-web).
ServiceVoix creerVoixPlateforme() => const _VoixStub();

class _VoixStub implements ServiceVoix {
  const _VoixStub();

  @override
  Future<void> dire(String texte) async {}

  @override
  void couper() {}
}

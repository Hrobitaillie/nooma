// Point d'entrée de l'app Plouma.
//
// Carte Prairie → boucle de session → mécanique « Tape la syllabe ». L'état vit dans Riverpod
// (ProviderScope) et le profil est PERSISTÉ (event log Drift + projection, reconstruit au
// démarrage par rejeu — voir etat/session.dart + donnees/persistance.dart). Persiste sur
// macOS/desktop ET web (WASM). Cible de dev : `flutter run -d chrome`.

import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'etat/session.dart';
import 'ui/ecran_carte.dart';

void main() {
  runApp(const ProviderScope(child: PloumaApp()));
}

/// Racine de l'application.
class PloumaApp extends StatelessWidget {
  const PloumaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Plouma',
      debugShowCheckedModeBanner: false,
      // En debug uniquement : un bouton discret « recommencer » qui vide la base (utile pour
      // tester la persistance). Absent des builds de release.
      home: kDebugMode ? const _AvecResetDev(child: EcranCarte()) : const EcranCarte(),
    );
  }
}

/// Superpose un bouton de reset dev (kDebugMode) discret, en haut à gauche, hors de l'UI de jeu.
///
/// Vide la base (event log + projection + ancre) puis invalide les providers de session pour
/// forcer un profil neuf, sans redémarrer l'app. Vit dans main.dart (init), pas dans ui/.
class _AvecResetDev extends ConsumerWidget {
  final Widget child;
  const _AvecResetDev({required this.child});

  Future<void> _reset(WidgetRef ref) async {
    final notifier = ref.read(carteProvider.notifier);
    await notifier.reinitialiser();
    // Recharge la reconstruction (base désormais vide → profil neuf).
    ref.invalidate(directeurProvider);
    ref.invalidate(persistanceProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Stack(
      children: [
        child,
        Positioned(
          top: 40,
          left: 8,
          child: Opacity(
            opacity: 0.25,
            child: IconButton(
              tooltip: 'DEV : recommencer (vide la base)',
              icon: const Icon(Icons.refresh, size: 18),
              onPressed: () => _reset(ref),
            ),
          ),
        ),
      ],
    );
  }
}

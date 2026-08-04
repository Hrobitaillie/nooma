// Point d'entrée de l'app Plouma.
//
// Première tranche jouable : carte Prairie → boucle de session → mécanique « Tape la syllabe ».
// L'état vit dans Riverpod (ProviderScope). Cible de dev : `flutter run -d chrome`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'ui/ecran_carte.dart';

void main() {
  runApp(const ProviderScope(child: PloumaApp()));
}

/// Racine de l'application.
class PloumaApp extends StatelessWidget {
  const PloumaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Plouma',
      debugShowCheckedModeBanner: false,
      home: EcranCarte(),
    );
  }
}

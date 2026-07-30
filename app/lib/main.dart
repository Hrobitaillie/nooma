// Point d'entrée de l'app Plouma — socle technique minimal.
// Affiche uniquement l'écran d'accueil provisoire (fond crème). Aucune logique produit ici.

import 'package:flutter/material.dart';

import 'ui/ecran_socle.dart';

void main() {
  runApp(const PloumaApp());
}

/// Racine de l'application.
class PloumaApp extends StatelessWidget {
  const PloumaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Plouma',
      debugShowCheckedModeBanner: false,
      home: EcranSocle(),
    );
  }
}

// Écran minimal du socle technique. Aucune logique produit : sert uniquement à vérifier
// que l'app démarre. Fond crème #FAF7F2 (charte v1).

import 'package:flutter/material.dart';

/// Couleur de fond crème de l'app (charte v1).
const Color kCreme = Color(0xFFFAF7F2);

/// Écran d'accueil provisoire du socle technique.
class EcranSocle extends StatelessWidget {
  const EcranSocle({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: kCreme,
      body: Center(
        child: Text(
          'Plouma — socle technique',
          style: TextStyle(
            fontSize: 22,
            color: Color(0xFF3A342E),
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

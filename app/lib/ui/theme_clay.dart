// Thème visuel « pâte à modeler » (clay) de Plouma — placeholder assumé en attendant les
// rendus Blender (doc 05 direction artistique). Palette crème + verts tendres, ombres douces.
//
// Aucune dépendance : couleurs, ombres et helpers dessinés en Flutter pur.

import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Constantes de style clay partagées par la carte et les mécaniques.
abstract final class ClayTheme {
  /// Fond crème de l'app (charte v1).
  static const Color creme = Color(0xFFFAF7F2);

  /// Encre douce pour le texte.
  static const Color encre = Color(0xFF3A342E);

  /// Verts tendres du biome Prairie.
  static const Color vertClair = Color(0xFFBFE0A8);
  static const Color vert = Color(0xFF8FC873);
  static const Color vertFonce = Color(0xFF5E9E52);

  /// Doré de l'étoile Plouma.
  static const Color dore = Color(0xFFF2C14E);

  /// Palette des syllabes (couleurs distinctes, réutilisées cycliquement).
  static const List<Color> _syllabes = [
    Color(0xFFEF8A7A), // corail
    Color(0xFF6FB1D6), // bleu doux
    Color(0xFFB98AD6), // lavande
    Color(0xFFE8A94E), // ambre
    Color(0xFF6FC3A0), // menthe
  ];

  /// Couleur de la i-ème syllabe (cyclique).
  static Color couleurSyllabe(int i) => _syllabes[i % _syllabes.length];

  /// Ombre douce générique (cartes, pastilles).
  static const List<BoxShadow> ombreDouce = [
    BoxShadow(
      color: Color(0x1A000000),
      blurRadius: 8,
      offset: Offset(0, 3),
    ),
  ];

  /// Ombre plus marquée pour les gros objets clay (tambour, nœud actif).
  static const List<BoxShadow> ombreClay = [
    BoxShadow(
      color: Color(0x33000000),
      blurRadius: 16,
      offset: Offset(0, 8),
    ),
    BoxShadow(
      color: Color(0x22FFFFFF),
      blurRadius: 6,
      offset: Offset(0, -3),
    ),
  ];
}

/// Dessine une étoile Plouma dorée à 5 pointes (placeholder d'en-tête).
class EtoilePlouma extends StatelessWidget {
  final double taille;
  const EtoilePlouma({super.key, this.taille = 34});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.square(taille),
      painter: _EtoilePainter(),
    );
  }
}

class _EtoilePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final Offset centre = size.center(Offset.zero);
    final double rExt = size.width / 2;
    final double rInt = rExt * 0.44;
    final Path path = Path();
    for (int i = 0; i < 10; i++) {
      final double r = i.isEven ? rExt : rInt;
      final double angle = -math.pi / 2 + i * math.pi / 5;
      final Offset p =
          centre + Offset(r * math.cos(angle), r * math.sin(angle));
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    canvas.drawPath(
      path,
      Paint()
        ..color = ClayTheme.dore
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFFD9A63A)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_EtoilePainter oldDelegate) => false;
}

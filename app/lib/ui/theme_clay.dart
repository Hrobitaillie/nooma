// Thème visuel « pâte à modeler » (clay) de Plouma — placeholder assumé mais désirable, en
// attendant les rendus Blender (doc 05 direction artistique). Palette crème + verts tendres,
// ombres douces, formes rondes. Objectif : qu'on devine déjà la DA finale.
//
// Aucune dépendance : couleurs, ombres, rayons et helpers dessinés en Flutter pur.

import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Constantes de style clay partagées par la carte, le lobby et les mécaniques.
abstract final class ClayTheme {
  /// Fond crème de l'app (charte v1).
  static const Color creme = Color(0xFFFAF7F2);

  /// Crème un peu plus chaud, pour le ciel bas de la prairie.
  static const Color cremeChaud = Color(0xFFF6EFE2);

  /// Encre douce pour le texte.
  static const Color encre = Color(0xFF3A342E);

  /// Encre atténuée (sous-titres, légendes).
  static const Color encreDouce = Color(0xFF8A8178);

  /// Verts tendres du biome Prairie (rétro-compat + décor).
  static const Color vertClair = Color(0xFFBFE0A8);
  static const Color vert = Color(0xFF8FC873);
  static const Color vertFonce = Color(0xFF5E9E52);

  /// Terre / sentier de pâte à modeler (le « boudin »).
  static const Color terre = Color(0xFFE7C9A0);
  static const Color terreFonce = Color(0xFFCFA878);
  static const Color terreClaire = Color(0xFFF3DFBF);

  /// Doré de l'étoile Plouma + joues roses.
  static const Color dore = Color(0xFFF2C14E);
  static const Color doreFonce = Color(0xFFD9A63A);
  static const Color joue = Color(0xFFF39BA8);

  /// Voile de brume (biomes à venir) — crème froide translucide.
  static const Color brume = Color(0xCCEDEAE3);

  // ── Rayons standard ────────────────────────────────────────────────────────
  static const double rayonPetit = 12;
  static const double rayonMoyen = 20;
  static const double rayonGrand = 30;
  static const Radius radMoyen = Radius.circular(rayonMoyen);
  static const Radius radGrand = Radius.circular(rayonGrand);

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

  // ── Ombres clay réutilisables ────────────────────────────────────────────
  /// Ombre douce générique (cartes, pastilles).
  static const List<BoxShadow> ombreDouce = [
    BoxShadow(color: Color(0x1A000000), blurRadius: 8, offset: Offset(0, 3)),
  ];

  /// Ombre plus marquée pour les gros objets clay (tambour, nœud actif).
  static const List<BoxShadow> ombreClay = [
    BoxShadow(color: Color(0x33000000), blurRadius: 16, offset: Offset(0, 8)),
    BoxShadow(color: Color(0x22FFFFFF), blurRadius: 6, offset: Offset(0, -3)),
  ];

  /// Ombre « verre dépoli » pour l'en-tête flottant et les tuiles du lobby.
  static const List<BoxShadow> ombreFlottante = [
    BoxShadow(color: Color(0x22000000), blurRadius: 22, offset: Offset(0, 10)),
    BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 2)),
  ];

  // ── Palettes par biome (doc 04 §5.2 — 12 modules) ──────────────────────────
  /// Chaque biome a une couleur dominante ; l'ordre suit le graphe (ordre 1..12).
  static const List<BiomePalette> palettesBiomes = [
    BiomePalette('Prairie', Color(0xFF9CCB7A), Color(0xFF6FA84E), Color(0xFFE7F0D6)),
    BiomePalette('Jardin', Color(0xFFE8A6B8), Color(0xFFCE7F95), Color(0xFFF7E1E8)),
    BiomePalette('Forêt', Color(0xFF4E8C63), Color(0xFF356B48), Color(0xFFCFE3D5)),
    BiomePalette('Clairière', Color(0xFFE7D27A), Color(0xFFC9B152), Color(0xFFF6EFCD)),
    BiomePalette('Village', Color(0xFFD98A63), Color(0xFFB96A44), Color(0xFFF3DBCB)),
    BiomePalette('Rivière', Color(0xFF67B7C9), Color(0xFF4795A8), Color(0xFFD4EDF2)),
    BiomePalette('Marais', Color(0xFF7E9A5E), Color(0xFF5E7A42), Color(0xFFDDE4CB)),
    BiomePalette('Colline', Color(0xFFCBA35E), Color(0xFFAB8443), Color(0xFFF0E3C8)),
    BiomePalette('Montagne', Color(0xFF8C9BB0), Color(0xFF697A93), Color(0xFFDCE2EB)),
    BiomePalette('Grotte', Color(0xFF9377B8), Color(0xFF725699), Color(0xFFE1D7EE)),
    BiomePalette('Vallée', Color(0xFFE8887E), Color(0xFFCB675C), Color(0xFFF7DAD5)),
    BiomePalette('Ciel nocturne', Color(0xFF6C77B0), Color(0xFF4C568E), Color(0xFFD7DAEC)),
  ];

  /// Palette du i-ème biome (indexé sur l'ordre du graphe). Cyclique par sécurité.
  static BiomePalette paletteBiome(int i) =>
      palettesBiomes[i % palettesBiomes.length];
}

/// Palette d'un biome : la couleur dominante et ses déclinaisons clay.
///
/// [dominante] = teinte principale (tuile du lobby, sol du chemin).
/// [foncee] = version assombrie (ombres, contours doux).
/// [claire] = version pâle (halo, reflets, fond de tuile).
@immutable
class BiomePalette {
  final String nom;
  final Color dominante;
  final Color foncee;
  final Color claire;
  const BiomePalette(this.nom, this.dominante, this.foncee, this.claire);
}

/// Dessine une étoile Plouma dorée à 5 pointes ARRONDIES (branches en courbes, pas de
/// pointes acérées), joues roses et deux yeux — la mascotte-placeholder de l'en-tête.
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
    final Offset c = size.center(Offset.zero);
    final double rExt = size.width / 2 * 0.98;
    final double rInt = rExt * 0.52;

    // Path de l'étoile à branches arrondies : on relie les 10 sommets par des courbes
    // quadratiques dont le point de contrôle est décalé vers l'extérieur, ce qui gonfle
    // chaque branche comme un boudin de pâte à modeler (aucune pointe acérée).
    final List<Offset> sommets = [
      for (int i = 0; i < 10; i++)
        c +
            Offset(
              (i.isEven ? rExt : rInt) *
                  math.cos(-math.pi / 2 + i * math.pi / 5),
              (i.isEven ? rExt : rInt) *
                  math.sin(-math.pi / 2 + i * math.pi / 5),
            ),
    ];
    final Path path = Path()..moveTo(sommets[0].dx, sommets[0].dy);
    for (int i = 0; i < 10; i++) {
      final Offset courant = sommets[i];
      final Offset suivant = sommets[(i + 1) % 10];
      final Offset milieu = Offset.lerp(courant, suivant, 0.5)!;
      // Contrôle légèrement repoussé du centre → arrondi charnu.
      final Offset ctrl = c + (milieu - c) * 1.12;
      path.quadraticBezierTo(ctrl.dx, ctrl.dy, suivant.dx, suivant.dy);
    }
    path.close();

    // Remplissage en dégradé doré (haut clair → bas ambré).
    final Rect bounds = path.getBounds();
    canvas.drawPath(
      path,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFAD879), ClayTheme.dore],
        ).createShader(bounds),
    );
    // Contour doux ambré.
    canvas.drawPath(
      path,
      Paint()
        ..color = ClayTheme.doreFonce
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.width * 0.045
        ..strokeJoin = StrokeJoin.round,
    );

    // Joues roses.
    final double rJoue = size.width * 0.07;
    final Paint joue = Paint()..color = ClayTheme.joue.withValues(alpha: 0.75);
    canvas.drawCircle(c + Offset(-size.width * 0.15, size.height * 0.06), rJoue, joue);
    canvas.drawCircle(c + Offset(size.width * 0.15, size.height * 0.06), rJoue, joue);

    // Deux yeux (points d'encre) avec un petit reflet.
    final double rOeil = size.width * 0.055;
    final Paint oeil = Paint()..color = ClayTheme.encre;
    final Paint reflet = Paint()..color = Colors.white.withValues(alpha: 0.9);
    for (final dx in [-0.10, 0.10]) {
      final Offset o = c + Offset(size.width * dx, -size.height * 0.02);
      canvas.drawCircle(o, rOeil, oeil);
      canvas.drawCircle(o + Offset(-rOeil * 0.3, -rOeil * 0.3), rOeil * 0.35, reflet);
    }
  }

  @override
  bool shouldRepaint(_EtoilePainter oldDelegate) => false;
}

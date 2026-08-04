// Le chemin de pâte à modeler qui SERPENTE dans la prairie (doc 04 §6.1) — dessiné en
// CustomPaint pur (règle inviolable : aucune image bitmap).
//
// Le chemin est une suite de courbes de Bézier qui zigzaguent gauche-droite-gauche… de bas
// en haut. Il est tracé comme un boudin de pâte : trait très épais à bouts ronds, léger
// dégradé de haut en bas, ombre portée douce décalée (relief clay), et de petits cailloux
// pointillés le long du bord.
//
// [GeometrieChemin] calcule à la fois le Path (pour le peindre) ET les points d'ancrage des
// nœuds (échantillonnés SUR la courbe), pour que l'UI pose les nœuds exactement dessus.

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'theme_clay.dart';

/// Géométrie du chemin serpentant : le tracé + la position de chaque nœud dessus.
///
/// Convention d'espace : y croît vers le bas (comme Flutter). Le nœud d'index 0 est EN BAS
/// (le plus ancien / joué en premier), les suivants montent. L'appelant décide de la hauteur
/// totale en fonction du nombre de nœuds.
class GeometrieChemin {
  final Path trace;
  final List<Offset> ancres;
  final Size taille;

  const GeometrieChemin._(this.trace, this.ancres, this.taille);

  /// Espacement vertical standard entre deux nœuds (px).
  static const double pasVertical = 150;

  /// Marge en haut et en bas du chemin (px).
  static const double margeVerticale = 90;

  /// Amplitude horizontale du serpentin, en fraction de la largeur.
  static const double _amplitude = 0.30;

  /// Construit la géométrie pour [nbNoeuds] nœuds sur une [largeur] donnée.
  factory GeometrieChemin.construire({
    required int nbNoeuds,
    required double largeur,
  }) {
    final double hauteur =
        margeVerticale * 2 + math.max(0, nbNoeuds - 1) * pasVertical;
    final double cx = largeur / 2;
    final double amp = largeur * _amplitude;

    // Position de chaque nœud : y monte régulièrement, x alterne gauche/droite en douceur.
    final List<Offset> ancres = [];
    for (int i = 0; i < nbNoeuds; i++) {
      final double y = hauteur - margeVerticale - i * pasVertical;
      // Alternance sinusoïdale : chaque nœud bascule d'un côté puis de l'autre.
      final double x = cx + math.sin(i * math.pi / 2) * amp;
      ancres.add(Offset(x, y));
    }

    // Le tracé relie les ancres par des Bézier cubiques dont les tangentes sont verticales
    // (contrôles décalés verticalement), ce qui donne un serpentin fluide sans cassure.
    final Path trace = Path();
    if (ancres.isNotEmpty) {
      trace.moveTo(ancres.first.dx, ancres.first.dy);
      for (int i = 0; i < ancres.length - 1; i++) {
        final Offset a = ancres[i];
        final Offset b = ancres[i + 1];
        final double dy = (a.dy - b.dy) * 0.5; // b est au-dessus de a (dy > 0)
        trace.cubicTo(a.dx, a.dy - dy, b.dx, b.dy + dy, b.dx, b.dy);
      }
    }
    return GeometrieChemin._(trace, ancres, Size(largeur, hauteur));
  }
}

/// Peint le chemin-boudin. [progress] ∈ 0..1 permet d'animer la POUSSE du dernier segment :
/// à 1, tout le chemin est tracé ; en-dessous, la fin du tracé est masquée progressivement.
class CheminPainter extends CustomPainter {
  final Path trace;
  final BiomePalette palette;

  /// Fraction du chemin dessinée (0..1) — pour l'animation de pousse.
  final double progress;

  const CheminPainter({
    required this.trace,
    required this.palette,
    this.progress = 1.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // On ne dessine que la portion [0, progress] de la longueur totale (croissance).
    Path aTracer = trace;
    if (progress < 1.0) {
      aTracer = Path();
      for (final metric in trace.computeMetrics()) {
        aTracer.addPath(
          metric.extractPath(0, metric.length * progress.clamp(0, 1)),
          Offset.zero,
        );
      }
    }

    const double largeurBoudin = 34;

    // 1. Ombre portée douce, décalée (relief clay).
    canvas.drawPath(
      aTracer.shift(const Offset(3, 8)),
      Paint()
        ..color = const Color(0x22000000)
        ..style = PaintingStyle.stroke
        ..strokeWidth = largeurBoudin
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );

    // 2. Corps du boudin : dégradé terre (clair en haut → plus foncé en bas).
    final Rect bounds = trace.getBounds();
    canvas.drawPath(
      aTracer,
      Paint()
        ..shader = ui.Gradient.linear(
          bounds.topCenter,
          bounds.bottomCenter,
          [ClayTheme.terreClaire, ClayTheme.terre, ClayTheme.terreFonce],
          [0.0, 0.5, 1.0],
        )
        ..style = PaintingStyle.stroke
        ..strokeWidth = largeurBoudin
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // 3. Reflet spéculaire : un liseré clair légèrement décalé vers le haut du boudin.
    canvas.drawPath(
      aTracer.shift(const Offset(-2, -4)),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = largeurBoudin * 0.35
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // 4. Petits cailloux / pointillés le long du bord (pointillés clairs semés).
    final Paint caillou = Paint()..color = ClayTheme.terreClaire.withValues(alpha: 0.8);
    for (final metric in aTracer.computeMetrics()) {
      final double pas = 26;
      for (double d = pas / 2; d < metric.length; d += pas) {
        final tangent = metric.getTangentForOffset(d);
        if (tangent == null) continue;
        // Décale le caillou perpendiculairement au chemin, alterné d'un côté puis de l'autre.
        final Offset normal = Offset(-tangent.vector.dy, tangent.vector.dx);
        final double cote = ((d ~/ pas).isEven ? 1 : -1) * (largeurBoudin / 2 - 3);
        final Offset p = tangent.position + normal * cote;
        canvas.drawCircle(p, 2.4, caillou);
      }
    }
  }

  @override
  bool shouldRepaint(CheminPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.palette != palette ||
      oldDelegate.trace != trace;
}

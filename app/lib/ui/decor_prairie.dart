// Décor vivant de la prairie — couches organiques dessinées en CustomPaint pur (règle
// inviolable : AUCUNE image bitmap). Vue en ortho 3/4 (doc 05).
//
// Trois couches, du fond vers l'avant :
//   1. le sol : grandes plages de verts tendres aux formes de blobs arrondis (jamais de
//      rectangles), légère bande de « ciel » crème en haut ;
//   2. la végétation posée : buissons, fleurs, champignons clay disséminés — formes rondes,
//      ombre douce portée, reflet spéculaire discret ;
//   3. 1-2 papillons qui flottent lentement (sinusoïde), au-dessus de tout.
//
// Tout est déterministe (semé) pour rester stable au repaint et testable. La couleur de base
// suit la palette du biome courant (fournie par l'appelant).

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'theme_clay.dart';

/// Peint le SOL de la prairie : blobs de verts tendres empilés (couche de fond, lente au
/// parallax). Étale la couleur du biome ; hauteur = tout l'écran.
class SolPrairiePainter extends CustomPainter {
  final BiomePalette palette;
  const SolPrairiePainter(this.palette);

  @override
  void paint(Canvas canvas, Size size) {
    // Dégradé de base : ciel crème en haut → herbe claire → herbe dominante en bas.
    final Rect plein = Offset.zero & size;
    canvas.drawRect(
      plein,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            ClayTheme.cremeChaud,
            palette.claire,
            palette.dominante,
          ],
          stops: const [0.0, 0.22, 0.6],
        ).createShader(plein),
    );

    // Grandes plages d'herbe en blobs arrondis (formes organiques, pas de rectangles),
    // semées de façon déterministe le long de la hauteur.
    final rng = math.Random(7);
    final int bandes = (size.height / 220).ceil() + 2;
    for (int b = 0; b < bandes; b++) {
      final double y = size.height * 0.18 + b * 210.0;
      final Color teinte = Color.lerp(
        palette.claire,
        palette.dominante,
        0.35 + rng.nextDouble() * 0.5,
      )!;
      _blobHerbe(canvas, size, y, teinte, rng, alterne: b.isEven);
    }
  }

  /// Un large blob d'herbe : ligne de crête ondulée (courbes) refermée en bas.
  void _blobHerbe(Canvas canvas, Size size, double y, Color teinte,
      math.Random rng, {required bool alterne}) {
    final Path p = Path()..moveTo(-40, y);
    final int lobes = 5;
    final double pas = (size.width + 80) / lobes;
    for (int i = 0; i < lobes; i++) {
      final double x = -40 + pas * (i + 1);
      final double creux = y + (alterne ? 34 : -30) + rng.nextDouble() * 28 - 14;
      p.quadraticBezierTo(x - pas / 2, creux, x, y + rng.nextDouble() * 20 - 10);
    }
    p.lineTo(size.width + 40, size.height + 40);
    p.lineTo(-40, size.height + 40);
    p.close();
    canvas.drawPath(p, Paint()..color = teinte);
  }

  @override
  bool shouldRepaint(SolPrairiePainter oldDelegate) =>
      oldDelegate.palette != palette;
}

/// Un petit élément de décor posé (buisson, fleur ou champignon), avec sa position relative.
enum TypeDecor { buisson, fleur, champignon }

@immutable
class BrinDecor {
  final TypeDecor type;
  final double fx; // 0..1 en largeur
  final double fy; // 0..1 en hauteur
  final double echelle;
  final Color teinte;
  const BrinDecor(this.type, this.fx, this.fy, this.echelle, this.teinte);
}

/// Génère une liste déterministe de brins de décor, en ÉVITANT une bande centrale (le
/// chemin serpente au milieu — [demiLargeurChemin] en fraction de largeur autour de 0.5).
List<BrinDecor> semerDecor(
  BiomePalette palette, {
  int graine = 42,
  int densite = 22,
  double demiLargeurChemin = 0.16,
}) {
  final rng = math.Random(graine);
  final List<BrinDecor> brins = [];
  const accents = [ClayTheme.joue, ClayTheme.dore, Color(0xFFE7A0C4), Color(0xFFFFF3C4)];
  for (int i = 0; i < densite; i++) {
    final double fy = i / densite + rng.nextDouble() * (0.9 / densite);
    // Répartit à gauche OU à droite du couloir central.
    final bool gauche = rng.nextBool();
    final double marge = 0.06 + rng.nextDouble() * (0.5 - demiLargeurChemin - 0.08);
    final double fx = gauche ? marge : 1 - marge;
    final t = TypeDecor.values[rng.nextInt(TypeDecor.values.length)];
    final Color teinte = switch (t) {
      TypeDecor.buisson => Color.lerp(palette.dominante, palette.foncee, rng.nextDouble())!,
      TypeDecor.fleur => accents[rng.nextInt(accents.length)],
      TypeDecor.champignon => ClayTheme.joue,
    };
    brins.add(BrinDecor(t, fx, fy, 0.75 + rng.nextDouble() * 0.6, teinte));
  }
  return brins;
}

/// Peint les brins de décor (buissons, fleurs, champignons) façon pâte à modeler :
/// formes rondes, ombre douce portée, reflet spéculaire discret.
class VegetationPainter extends CustomPainter {
  final List<BrinDecor> brins;
  const VegetationPainter(this.brins);

  @override
  void paint(Canvas canvas, Size size) {
    for (final b in brins) {
      final Offset c = Offset(b.fx * size.width, b.fy * size.height);
      switch (b.type) {
        case TypeDecor.buisson:
          _buisson(canvas, c, 22 * b.echelle, b.teinte);
        case TypeDecor.fleur:
          _fleur(canvas, c, 12 * b.echelle, b.teinte);
        case TypeDecor.champignon:
          _champignon(canvas, c, 16 * b.echelle, b.teinte);
      }
    }
  }

  /// Ombre portée clay douce, décalée sous l'objet.
  void _ombre(Canvas canvas, Offset c, double r) {
    canvas.drawOval(
      Rect.fromCenter(center: c + Offset(2, r * 0.5), width: r * 2.1, height: r * 0.8),
      Paint()
        ..color = const Color(0x22000000)
        ..maskFilter = const ui.MaskFilter.blur(BlurStyle.normal, 5),
    );
  }

  /// Reflet spéculaire discret (petite tache claire en haut à gauche).
  void _reflet(Canvas canvas, Offset c, double r) {
    canvas.drawCircle(
      c + Offset(-r * 0.35, -r * 0.4),
      r * 0.28,
      Paint()..color = Colors.white.withValues(alpha: 0.35),
    );
  }

  void _buisson(Canvas canvas, Offset c, double r, Color teinte) {
    _ombre(canvas, c, r);
    // Amas de 3 boules.
    final Paint p = Paint()..color = teinte;
    canvas.drawCircle(c + Offset(-r * 0.6, 0), r * 0.7, p);
    canvas.drawCircle(c + Offset(r * 0.6, 0), r * 0.7, p);
    canvas.drawCircle(c + Offset(0, -r * 0.4), r * 0.85, p);
    _reflet(canvas, c + Offset(0, -r * 0.4), r * 0.85);
  }

  void _fleur(Canvas canvas, Offset c, double r, Color teinte) {
    _ombre(canvas, c, r);
    // Tige verte.
    canvas.drawLine(
      c,
      c + Offset(0, r * 1.4),
      Paint()
        ..color = ClayTheme.vertFonce
        ..strokeWidth = r * 0.3
        ..strokeCap = StrokeCap.round,
    );
    // 5 pétales ronds.
    final Paint p = Paint()..color = teinte;
    for (int i = 0; i < 5; i++) {
      final double a = -math.pi / 2 + i * 2 * math.pi / 5;
      canvas.drawCircle(c + Offset(math.cos(a) * r * 0.7, math.sin(a) * r * 0.7), r * 0.5, p);
    }
    // Cœur doré.
    canvas.drawCircle(c, r * 0.42, Paint()..color = ClayTheme.dore);
    _reflet(canvas, c, r * 0.5);
  }

  void _champignon(Canvas canvas, Offset c, double r, Color teinte) {
    _ombre(canvas, c, r);
    // Pied crème.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: c + Offset(0, r * 0.4), width: r * 0.7, height: r * 1.0),
        Radius.circular(r * 0.35),
      ),
      Paint()..color = ClayTheme.terreClaire,
    );
    // Chapeau bombé (demi-cercle arrondi).
    final Path chapeau = Path()
      ..addArc(Rect.fromCircle(center: c, radius: r), math.pi, math.pi);
    chapeau.close();
    canvas.drawPath(chapeau, Paint()..color = teinte);
    // Points blancs.
    final Paint pois = Paint()..color = Colors.white.withValues(alpha: 0.85);
    canvas.drawCircle(c + Offset(-r * 0.35, -r * 0.2), r * 0.14, pois);
    canvas.drawCircle(c + Offset(r * 0.3, -r * 0.1), r * 0.11, pois);
    _reflet(canvas, c + Offset(0, -r * 0.2), r * 0.6);
  }

  @override
  bool shouldRepaint(VegetationPainter oldDelegate) => oldDelegate.brins != brins;
}

/// Deux papillons qui flottent lentement (mouvement sinusoïdal). [t] ∈ 0..1 (phase animée).
class PapillonsPainter extends CustomPainter {
  final double t;
  final Color couleurA;
  final Color couleurB;
  const PapillonsPainter(this.t, {required this.couleurA, required this.couleurB});

  @override
  void paint(Canvas canvas, Size size) {
    _papillon(canvas, size, phase: t, ampX: 0.18, baseX: 0.30, baseY: 0.28,
        vitesse: 1.0, couleur: couleurA);
    _papillon(canvas, size, phase: t + 0.5, ampX: 0.14, baseX: 0.70, baseY: 0.55,
        vitesse: 1.4, couleur: couleurB);
  }

  void _papillon(Canvas canvas, Size size,
      {required double phase,
      required double ampX,
      required double baseX,
      required double baseY,
      required double vitesse,
      required Color couleur}) {
    final double a = phase * 2 * math.pi;
    final double x = (baseX + math.sin(a * vitesse) * ampX) * size.width;
    final double y = (baseY + math.sin(a * vitesse * 1.7) * 0.05) * size.height;
    final Offset c = Offset(x, y);
    // Battement d'ailes : l'ouverture varie vite.
    final double ouv = 0.6 + 0.4 * (0.5 + 0.5 * math.sin(a * 8));
    final Paint aile = Paint()..color = couleur.withValues(alpha: 0.9);
    final double r = 7.0;
    // Deux paires d'ailes rondes.
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.scale(ouv, 1);
    canvas.drawCircle(Offset(-r * 0.9, -r * 0.4), r, aile);
    canvas.drawCircle(Offset(r * 0.9, -r * 0.4), r, aile);
    canvas.drawCircle(Offset(-r * 0.8, r * 0.6), r * 0.8, aile);
    canvas.drawCircle(Offset(r * 0.8, r * 0.6), r * 0.8, aile);
    canvas.restore();
    // Corps.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: c, width: 3, height: 14),
        const Radius.circular(2),
      ),
      Paint()..color = ClayTheme.encre,
    );
  }

  @override
  bool shouldRepaint(PapillonsPainter oldDelegate) => oldDelegate.t != t;
}

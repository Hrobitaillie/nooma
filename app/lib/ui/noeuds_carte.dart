// Les nœuds posés SUR le chemin serpentant (doc 04 §6.1) — dessinés en CustomPaint pur.
//
// Trois états visuels :
//   • joué    → pastille pleine « enfoncée » dans le sol (ombre INTÉRIEURE, teinte sourde) ;
//   • actif   → grosse pastille bombée (champignon-nœud) avec pulsation douce + halo ;
//   • à venir → estompé dans une brume légère, mais le TYPE reste lisible
//               (normal ● / cadeau / rêve — glyphes CustomPaint, pas d'emoji).
//
// Le nœud actif SORT DU SOL à l'apparition (scale + fondu avec petit rebond élastique).

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../directeur/directeur.dart';
import 'theme_clay.dart';

/// Diamètre de base des différents nœuds.
const double kDiamNoeud = 58;
const double kDiamNoeudActif = 92;

/// Peint le glyphe du type d'un nœud (au centre) : cœur/normal, cadeau, rêve (lune).
/// Dessiné en courbes — aucune police emoji.
class GlypheType extends StatelessWidget {
  final TypeNiveau type;
  final double taille;
  final Color couleur;
  const GlypheType({
    super.key,
    required this.type,
    required this.taille,
    this.couleur = Colors.white,
  });

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size.square(taille),
        painter: _GlyphePainter(type, couleur),
      );
}

class _GlyphePainter extends CustomPainter {
  final TypeNiveau type;
  final Color couleur;
  const _GlyphePainter(this.type, this.couleur);

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.width / 2;
    final Paint p = Paint()..color = couleur;
    switch (type) {
      case TypeNiveau.cadeau:
        _cadeau(canvas, c, r, p);
      case TypeNiveau.reve:
        _lune(canvas, c, r, p);
      default:
        _pastille(canvas, c, r, p);
    }
  }

  /// Nœud normal : simple pastille ronde pleine (le « ● » du design).
  void _pastille(Canvas canvas, Offset c, double r, Paint p) {
    canvas.drawCircle(c, r * 0.5, p);
  }

  /// Cadeau : un petit paquet arrondi + ruban croisé.
  void _cadeau(Canvas canvas, Offset c, double r, Paint p) {
    final Rect boite = Rect.fromCenter(center: c + Offset(0, r * 0.15), width: r, height: r * 0.9);
    canvas.drawRRect(RRect.fromRectAndRadius(boite, Radius.circular(r * 0.18)), p);
    // Ruban.
    final Paint ruban = Paint()
      ..color = ClayTheme.joue
      ..strokeWidth = r * 0.16;
    canvas.drawLine(Offset(c.dx, boite.top), Offset(c.dx, boite.bottom), ruban);
    // Nœud du ruban (deux petites boucles).
    canvas.drawCircle(Offset(c.dx - r * 0.2, boite.top), r * 0.16, ruban);
    canvas.drawCircle(Offset(c.dx + r * 0.2, boite.top), r * 0.16, ruban);
  }

  /// Rêve : un croissant de lune (deux cercles décalés en soustraction).
  void _lune(Canvas canvas, Offset c, double r, Paint p) {
    final Path pleine = Path()..addOval(Rect.fromCircle(center: c, radius: r * 0.55));
    final Path creux = Path()
      ..addOval(Rect.fromCircle(center: c + Offset(r * 0.28, -r * 0.08), radius: r * 0.5));
    canvas.drawPath(Path.combine(PathOperation.difference, pleine, creux), p);
  }

  @override
  bool shouldRepaint(_GlyphePainter oldDelegate) =>
      oldDelegate.type != type || oldDelegate.couleur != couleur;
}

/// Nœud JOUÉ : pastille pleine enfoncée dans le sol (ombre intérieure, teinte sourde).
class NoeudJoue extends StatelessWidget {
  final TypeNiveau type;
  final BiomePalette palette;
  const NoeudJoue({super.key, required this.type, required this.palette});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size.square(kDiamNoeud),
      painter: _NoeudJouePainter(type, palette),
    );
  }
}

class _NoeudJouePainter extends CustomPainter {
  final TypeNiveau type;
  final BiomePalette palette;
  const _NoeudJouePainter(this.type, this.palette);

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.width / 2;
    // Creux dans le sol : anneau clair en bas (lumière rasante) + disque enfoncé.
    canvas.drawCircle(c + const Offset(0, 2), r,
        Paint()..color = Colors.white.withValues(alpha: 0.5));
    canvas.drawCircle(
      c,
      r * 0.92,
      Paint()
        ..shader = RadialGradient(
          colors: [palette.foncee, Color.lerp(palette.foncee, Colors.black, 0.18)!],
          center: const Alignment(0, -0.3),
        ).createShader(Rect.fromCircle(center: c, radius: r)),
    );
    // Glyphe sourd (coche implicite via teinte claire).
    _peindreGlyphe(canvas, size, type, Colors.white.withValues(alpha: 0.9));
  }

  @override
  bool shouldRepaint(_NoeudJouePainter oldDelegate) => false;
}

/// Nœud À VENIR : pastille estompée sous une brume légère, TYPE encore lisible.
class NoeudAVenir extends StatelessWidget {
  final TypeNiveau type;
  final BiomePalette palette;
  const NoeudAVenir({super.key, required this.type, required this.palette});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.55,
      child: CustomPaint(
        size: const Size.square(kDiamNoeud),
        painter: _NoeudAVenirPainter(type, palette),
      ),
    );
  }
}

class _NoeudAVenirPainter extends CustomPainter {
  final TypeNiveau type;
  final BiomePalette palette;
  const _NoeudAVenirPainter(this.type, this.palette);

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.width / 2;
    // Halo de brume autour.
    canvas.drawCircle(c, r * 1.1,
        Paint()..color = ClayTheme.brume.withValues(alpha: 0.6)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
    // Pastille pâle bombée.
    canvas.drawCircle(
      c,
      r * 0.82,
      Paint()
        ..shader = RadialGradient(
          colors: [palette.claire, palette.dominante],
          center: const Alignment(-0.3, -0.4),
        ).createShader(Rect.fromCircle(center: c, radius: r)),
    );
    _peindreGlyphe(canvas, size, type, Colors.white.withValues(alpha: 0.85));
  }

  @override
  bool shouldRepaint(_NoeudAVenirPainter oldDelegate) => false;
}

/// Nœud ACTIF : gros champignon-pastille bombé, halo, pulsation + rebond de sortie du sol.
class NoeudActif extends StatefulWidget {
  final TypeNiveau type;
  final BiomePalette palette;
  final VoidCallback? onTap;

  /// Vrai la première fois qu'il apparaît (déclenche la sortie du sol avec rebond).
  final bool sortDuSol;

  const NoeudActif({
    super.key,
    required this.type,
    required this.palette,
    this.onTap,
    this.sortDuSol = false,
  });

  @override
  State<NoeudActif> createState() => _NoeudActifState();
}

class _NoeudActifState extends State<NoeudActif> with TickerProviderStateMixin {
  late final AnimationController _pulse;
  late final AnimationController _sortie;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _sortie = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 640),
      value: widget.sortDuSol ? 0.0 : 1.0,
    );
    if (widget.sortDuSol) _sortie.forward();
  }

  @override
  void dispose() {
    _pulse.dispose();
    _sortie.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedBuilder(
        animation: Listenable.merge([_pulse, _sortie]),
        builder: (context, _) {
          // Sortie du sol : scale élastique + fondu.
          final double sortie = Curves.elasticOut.transform(_sortie.value);
          final double pulse = 1 + 0.05 * math.sin(_pulse.value * math.pi);
          return Opacity(
            opacity: _sortie.value.clamp(0, 1),
            child: Transform.scale(
              scale: sortie * pulse,
              alignment: Alignment.bottomCenter,
              child: CustomPaint(
                size: const Size.square(kDiamNoeudActif),
                painter: _NoeudActifPainter(
                  widget.type,
                  widget.palette,
                  halo: _pulse.value,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _NoeudActifPainter extends CustomPainter {
  final TypeNiveau type;
  final BiomePalette palette;
  final double halo; // 0..1
  const _NoeudActifPainter(this.type, this.palette, {required this.halo});

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.width / 2;

    // Halo pulsé (anneau doux qui respire).
    canvas.drawCircle(
      c,
      r * (0.9 + 0.18 * halo),
      Paint()
        ..color = palette.claire.withValues(alpha: 0.45 * (1 - halo * 0.5))
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );

    // Ombre portée douce.
    canvas.drawOval(
      Rect.fromCenter(center: c + Offset(2, r * 0.7), width: r * 1.7, height: r * 0.5),
      Paint()
        ..color = const Color(0x33000000)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
    );

    // Corps bombé (champignon-pastille) : dégradé radial, lumière en haut à gauche.
    canvas.drawCircle(
      c,
      r * 0.78,
      Paint()
        ..shader = RadialGradient(
          colors: [
            Color.lerp(palette.dominante, Colors.white, 0.35)!,
            palette.dominante,
            palette.foncee,
          ],
          stops: const [0.0, 0.6, 1.0],
          center: const Alignment(-0.35, -0.45),
          radius: 1.1,
        ).createShader(Rect.fromCircle(center: c, radius: r * 0.78)),
    );

    // Reflet spéculaire.
    canvas.drawCircle(
      c + Offset(-r * 0.28, -r * 0.32),
      r * 0.2,
      Paint()..color = Colors.white.withValues(alpha: 0.4),
    );

    // Glyphe du type au centre.
    _peindreGlyphe(canvas, size, type, Colors.white);
  }

  @override
  bool shouldRepaint(_NoeudActifPainter oldDelegate) => oldDelegate.halo != halo;
}

/// Peint le glyphe de type centré sur un nœud, à la bonne échelle.
void _peindreGlyphe(Canvas canvas, Size size, TypeNiveau type, Color couleur) {
  final Offset c = size.center(Offset.zero);
  final double d = size.width * 0.5;
  canvas.save();
  canvas.translate(c.dx - d / 2, c.dy - d / 2);
  _GlyphePainter(type, couleur).paint(canvas, Size.square(d));
  canvas.restore();
}

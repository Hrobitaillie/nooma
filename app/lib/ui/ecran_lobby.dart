// Vue biomes / lobby (doc 04 §6.1) — le monde de Plouma vu de loin.
//
// Liste scrollable verticale de tuiles pseudo-isométriques (losange extrudé, ombre portée),
// une par biome du graphe (les 12 modules). État de chaque tuile :
//   • biome courant  → tuile lumineuse, mini-aperçu du chemin, badge « en cours » ;
//   • biomes validés → tuile pleine + coche discrète ;
//   • biomes futurs  → SOUS LA BRUME (silhouette floutée/atténuée), on devine la couleur
//                      dominante, JAMAIS de cadenas anxiogène (pas de 🔒 : juste la brume).
//
// Tap sur le biome courant → retour carte. Tap sur un futur → petit wobble « pas encore ! »
// sans texte culpabilisant.
//
// LECTURE SEULE de l'état : on lit les modules et l'index courant via les providers existants
// (session.dart, graphe) — on ne modifie AUCUN fichier hors ui/.

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../directeur/graphe.dart';
import '../etat/session.dart';
import 'theme_clay.dart';

/// Données du lobby dérivées EN LECTURE SEULE : la liste des biomes + l'index du courant.
class DonneesLobby {
  final List<Module> modules;
  final int indexCourant;
  const DonneesLobby(this.modules, this.indexCourant);
}

/// Provider dérivé (lecture seule) du graphe + de l'index de module courant du Directeur.
final lobbyProvider = Provider<DonneesLobby?>((ref) {
  final etatDirecteur = ref.watch(directeurProvider).valueOrNull;
  if (etatDirecteur == null) return null;
  final directeur = etatDirecteur.directeur;
  return DonneesLobby(directeur.graphe.modules, directeur.moduleIndex);
});

/// Écran lobby : la carte-monde scrollable.
class EcranLobby extends ConsumerWidget {
  const EcranLobby({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final donnees = ref.watch(lobbyProvider);

    return Scaffold(
      backgroundColor: ClayTheme.creme,
      body: donnees == null
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: Column(
                children: [
                  _EnTeteLobby(onFermer: () => Navigator.of(context).maybePop()),
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                      itemCount: donnees.modules.length,
                      itemBuilder: (context, i) {
                        final module = donnees.modules[i];
                        final EtatBiome etat = i < donnees.indexCourant
                            ? EtatBiome.valide
                            : i == donnees.indexCourant
                                ? EtatBiome.courant
                                : EtatBiome.futur;
                        return TuileBiome(
                          key: ValueKey('tuile-biome-$i'),
                          nom: module.biome,
                          palette: ClayTheme.paletteBiome(i),
                          etat: etat,
                          // Décalage horizontal alterné : le monde serpente doucement.
                          alignement: i.isEven ? -0.35 : 0.35,
                          onTap: () {
                            if (etat == EtatBiome.courant) {
                              Navigator.of(context).maybePop();
                            }
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

/// En-tête du lobby : titre + bouton retour.
class _EnTeteLobby extends StatelessWidget {
  final VoidCallback onFermer;
  const _EnTeteLobby({required this.onFermer});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Row(
        children: [
          const EtoilePlouma(taille: 34),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Le monde de Plouma',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: ClayTheme.encre,
              ),
            ),
          ),
          Semantics(
            button: true,
            label: 'Revenir à la carte',
            child: GestureDetector(
              onTap: onFermer,
              child: Container(
                key: const Key('bouton-retour-carte'),
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(ClayTheme.rayonMoyen),
                  boxShadow: ClayTheme.ombreDouce,
                ),
                child: const Icon(Icons.close_rounded, color: ClayTheme.encreDouce),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// État visuel d'un biome dans le lobby.
enum EtatBiome { valide, courant, futur }

/// Une tuile pseudo-isométrique de biome.
class TuileBiome extends StatefulWidget {
  final String nom;
  final BiomePalette palette;
  final EtatBiome etat;
  final double alignement; // -1..1 décalage horizontal
  final VoidCallback onTap;

  const TuileBiome({
    super.key,
    required this.nom,
    required this.palette,
    required this.etat,
    required this.alignement,
    required this.onTap,
  });

  @override
  State<TuileBiome> createState() => _TuileBiomeState();
}

class _TuileBiomeState extends State<TuileBiome>
    with SingleTickerProviderStateMixin {
  late final AnimationController _wobble;

  @override
  void initState() {
    super.initState();
    _wobble = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
  }

  @override
  void dispose() {
    _wobble.dispose();
    super.dispose();
  }

  void _tap() {
    if (widget.etat == EtatBiome.futur) {
      // « Pas encore ! » : petit wobble, aucun texte culpabilisant.
      _wobble.forward(from: 0);
    }
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    final bool futur = widget.etat == EtatBiome.futur;
    Widget tuile = _TuileDessin(
      nom: widget.nom,
      palette: widget.palette,
      etat: widget.etat,
    );

    // Biome futur : sous la brume (flou + atténuation), on devine la couleur dominante.
    if (futur) {
      tuile = Opacity(
        opacity: 0.72,
        child: ImageFiltered(
          imageFilter: ui.ImageFilter.blur(sigmaX: 3.5, sigmaY: 3.5),
          child: tuile,
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Align(
        alignment: Alignment(widget.alignement * 0.5, 0),
        child: GestureDetector(
          onTap: _tap,
          child: AnimatedBuilder(
            animation: _wobble,
            builder: (context, child) {
              // Wobble : petite oscillation angulaire amortie (« pas encore ! »).
              final double a = _wobble.isAnimating
                  ? 0.06 * (1 - _wobble.value) * math.sin(_wobble.value * 3 * math.pi)
                  : 0.0;
              return Transform.rotate(angle: a, child: child);
            },
            child: SizedBox(width: 280, child: tuile),
          ),
        ),
      ),
    );
  }
}

/// Le dessin de la tuile (losange extrudé + décor) — séparé pour pouvoir le flouter en bloc.
class _TuileDessin extends StatelessWidget {
  final String nom;
  final BiomePalette palette;
  final EtatBiome etat;
  const _TuileDessin({
    required this.nom,
    required this.palette,
    required this.etat,
  });

  @override
  Widget build(BuildContext context) {
    final bool courant = etat == EtatBiome.courant;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 150,
          child: CustomPaint(
            painter: _TuileIsoPainter(palette: palette, courant: courant),
            child: Stack(
              children: [
                // Badge « en cours » (biome courant).
                if (courant)
                  Positioned(
                    top: 6,
                    right: 40,
                    child: _Badge(
                      texte: 'en cours',
                      couleur: palette.foncee,
                    ),
                  ),
                // Coche discrète (biome validé).
                if (etat == EtatBiome.valide)
                  const Positioned(
                    top: 8,
                    right: 44,
                    child: Icon(Icons.check_circle_rounded,
                        color: Colors.white, size: 26),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          nom,
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: courant ? palette.foncee : ClayTheme.encreDouce,
          ),
        ),
      ],
    );
  }
}

/// Petit badge arrondi (verre clair) pour « en cours ».
class _Badge extends StatelessWidget {
  final String texte;
  final Color couleur;
  const _Badge({required this.texte, required this.couleur});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(ClayTheme.rayonPetit),
        boxShadow: ClayTheme.ombreDouce,
      ),
      child: Text(
        texte,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: couleur,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

/// Peint une tuile pseudo-isométrique : un losange (dessus) extrudé en volume (côtés + ombre).
/// Le biome courant a un mini-aperçu du chemin serpentant dessus.
class _TuileIsoPainter extends CustomPainter {
  final BiomePalette palette;
  final bool courant;
  const _TuileIsoPainter({required this.palette, required this.courant});

  @override
  void paint(Canvas canvas, Size size) {
    final double w = size.width;
    final double h = size.height;
    final double cx = w / 2;
    // Losange (dessus de la tuile) : sommets haut/bas/gauche/droite.
    final double demiW = w * 0.42;
    final double demiH = h * 0.28;
    final double cy = h * 0.42;
    final Offset haut = Offset(cx, cy - demiH);
    final Offset bas = Offset(cx, cy + demiH);
    final Offset gauche = Offset(cx - demiW, cy);
    final Offset droite = Offset(cx + demiW, cy);
    final double extrusion = h * 0.28;

    // Ombre portée sous la tuile.
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, cy + demiH + extrusion * 0.6),
        width: demiW * 1.9,
        height: demiH * 0.8,
      ),
      Paint()
        ..color = const Color(0x22000000)
        ..maskFilter = const ui.MaskFilter.blur(BlurStyle.normal, 10),
    );

    // Faces latérales (extrusion) : gauche plus sombre, droite un peu moins.
    final Path faceG = Path()
      ..moveTo(gauche.dx, gauche.dy)
      ..lineTo(bas.dx, bas.dy)
      ..lineTo(bas.dx, bas.dy + extrusion)
      ..lineTo(gauche.dx, gauche.dy + extrusion)
      ..close();
    final Path faceD = Path()
      ..moveTo(droite.dx, droite.dy)
      ..lineTo(bas.dx, bas.dy)
      ..lineTo(bas.dx, bas.dy + extrusion)
      ..lineTo(droite.dx, droite.dy + extrusion)
      ..close();
    canvas.drawPath(faceG, Paint()..color = Color.lerp(palette.foncee, Colors.black, 0.22)!);
    canvas.drawPath(faceD, Paint()..color = palette.foncee);

    // Dessus : losange en dégradé (plus lumineux si biome courant).
    final Path dessus = Path()
      ..moveTo(haut.dx, haut.dy)
      ..lineTo(droite.dx, droite.dy)
      ..lineTo(bas.dx, bas.dy)
      ..lineTo(gauche.dx, gauche.dy)
      ..close();
    final Color hautClair = courant
        ? Color.lerp(palette.dominante, Colors.white, 0.35)!
        : palette.dominante;
    canvas.drawPath(
      dessus,
      Paint()
        ..shader = ui.Gradient.linear(
          haut,
          bas,
          [hautClair, palette.dominante],
        ),
    );

    // Liseré clair sur l'arête supérieure (reflet clay).
    canvas.drawLine(gauche, haut, _liseret());
    canvas.drawLine(haut, droite, _liseret());

    // Halo lumineux pour le biome courant.
    if (courant) {
      canvas.drawPath(
        dessus,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.18)
          ..maskFilter = const ui.MaskFilter.blur(BlurStyle.normal, 8),
      );
      _apercuChemin(canvas, dessus.getBounds(), palette);
    } else {
      // Petites bosses de décor (buissons) pour donner du relief aux tuiles.
      final Paint touffe = Paint()..color = Color.lerp(palette.dominante, palette.foncee, 0.4)!;
      canvas.drawCircle(Offset(cx - demiW * 0.4, cy + demiH * 0.1), 8, touffe);
      canvas.drawCircle(Offset(cx + demiW * 0.35, cy - demiH * 0.1), 6, touffe);
    }
  }

  Paint _liseret() => Paint()
    ..color = Colors.white.withValues(alpha: 0.4)
    ..strokeWidth = 2
    ..style = PaintingStyle.stroke;

  /// Mini-aperçu du chemin serpentant sur le dessus de la tuile courante.
  void _apercuChemin(Canvas canvas, Rect r, BiomePalette palette) {
    final Path chemin = Path()
      ..moveTo(r.center.dx - r.width * 0.12, r.bottom - r.height * 0.28)
      ..cubicTo(
        r.center.dx - r.width * 0.22, r.center.dy + r.height * 0.05,
        r.center.dx + r.width * 0.18, r.center.dy,
        r.center.dx + r.width * 0.02, r.top + r.height * 0.28,
      );
    canvas.drawPath(
      chemin,
      Paint()
        ..color = ClayTheme.terre
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7
        ..strokeCap = StrokeCap.round,
    );
    // Un petit nœud actif au bout.
    canvas.drawCircle(
      Offset(r.center.dx - r.width * 0.12, r.bottom - r.height * 0.28),
      6,
      Paint()..color = ClayTheme.dore,
    );
  }

  @override
  bool shouldRepaint(_TuileIsoPainter oldDelegate) =>
      oldDelegate.courant != courant || oldDelegate.palette != palette;
}

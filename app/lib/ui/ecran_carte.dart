// Carte Prairie — le chemin de pâte à modeler qui serpente dans la prairie, parcouru de bas
// en haut (doc 04 §6.1). Refonte visuelle « pâte à modeler » (doc 05, placeholder assumé mais
// désirable) : tout est dessiné en Flutter pur (CustomPaint/dégradés/ombres), AUCUNE image.
//
// Couches (du fond vers l'avant), avec léger parallax au scroll :
//   1. le sol de la prairie (blobs de verts tendres) ;
//   2. la végétation posée (buissons, fleurs, champignons clay) + papillons animés ;
//   3. le chemin-boudin serpentant, ses nœuds posés dessus, l'en-tête flottant.
//
// Nœuds : joués = pastilles enfoncées ; actif = gros champignon bombé qui pulse et SORT du sol
// (rebond) après une session ; à venir = estompés sous la brume, type lisible.
//
// En-tête flottant (verre dépoli/clay) : nom du biome, étoile Plouma, bouton « vue biomes ».

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../directeur/directeur.dart';
import '../etat/session.dart';
import 'chemin_clay.dart';
import 'decor_prairie.dart';
import 'ecran_lobby.dart';
import 'ecran_session.dart';
import 'noeuds_carte.dart';
import 'theme_clay.dart';

/// Écran principal : la carte du biome courant.
class EcranCarte extends ConsumerStatefulWidget {
  const EcranCarte({super.key});

  @override
  ConsumerState<EcranCarte> createState() => _EcranCarteState();
}

class _EcranCarteState extends ConsumerState<EcranCarte> {
  final _scroll = ScrollController();

  /// Décalage de scroll (0 en bas), pour le parallax du décor.
  double _offset = 0;

  /// Index du nœud actif qui vient de sortir du sol (pour animer sa pousse une seule fois).
  int? _noeudQuiPousse;

  /// Centrage initial du nœud actif : fait une seule fois, après le premier layout.
  bool _centrageInitialFait = false;

  /// Dernière géométrie calculée par le LayoutBuilder (pour centrer depuis _jouerSession).
  GeometrieChemin? _geo;
  double _hauteurBoite = 0;
  double _hauteurVue = 0;

  /// Offset de scroll (reverse: 0 = bas) qui place le nœud [index] au centre de l'écran.
  double _offsetPourCentrer(int index) {
    final geo = _geo;
    if (geo == null || index < 0 || index >= geo.ancres.length) return 0;
    // Le chemin est ancré en BAS de la boîte : distance du nœud au bas de la boîte.
    final double depuisBas = geo.taille.height - geo.ancres[index].dy;
    final double maxExt = math.max(0.0, _hauteurBoite - _hauteurVue);
    return (depuisBas - _hauteurVue / 2).clamp(0.0, maxExt);
  }

  /// Centre le nœud actif de l'état courant (jump au premier affichage, animé ensuite).
  void _centrerNoeudActif({required bool anime}) {
    final etat = ref.read(carteProvider);
    if (etat == null || !_scroll.hasClients) return;
    final int index = etat.noeuds.indexWhere((n) => n.statut == StatutNoeud.actif);
    final double cible = _offsetPourCentrer(index);
    if (anime) {
      _scroll.animateTo(
        cible,
        duration: const Duration(milliseconds: 750),
        curve: Curves.easeInOut,
      );
    } else {
      _scroll.jumpTo(cible);
    }
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (mounted) setState(() => _offset = _scroll.offset);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Palette du biome courant (indexée sur l'ordre du graphe via le Directeur, EN LECTURE).
  BiomePalette _paletteCourante() {
    final etatDirecteur = ref.read(directeurProvider).valueOrNull;
    final int idx = etatDirecteur?.directeur.moduleIndex ?? 0;
    return ClayTheme.paletteBiome(idx);
  }

  /// Tap sur le nœud actif : génère la session, la joue, ingère les résultats.
  Future<void> _jouerSession() async {
    final notifier = ref.read(carteProvider.notifier);
    final etat = ref.read(carteProvider);
    if (etat == null || etat.sessionEnCours) return;

    // ⚠️ syllabesProvider est un FutureProvider PARESSEUX : au premier tap il n'a même pas
    // commencé à charger — un read(...).valueOrNull renverrait null et la session se jouerait
    // sur une banque VIDE (tous les essais s'auto-complètent : écran qui « clignote »).
    // On attend donc le vrai chargement.
    final banque = await ref.read(syllabesProvider.future);
    if (!mounted) return;
    final voix = ref.read(serviceVoixProvider);

    final niveaux = notifier.genererProchaineSession();
    if (niveaux.isEmpty) return;

    notifier.demarrerSession();

    final resultats = await Navigator.of(context).push<List<ResultatNiveau>>(
      MaterialPageRoute(
        builder: (_) => EcranSession(
          niveaux: niveaux,
          banque: banque,
          voix: voix,
          onSessionTerminee: (r) => Navigator.of(context).pop(r),
        ),
      ),
    );

    if (!mounted) return;
    final avantJoues = etat.noeuds.where((n) => n.statut == StatutNoeud.joue).length;
    final evenements = notifier.terminerSession(resultats ?? const []);
    _remonterEvenements(evenements);

    // Le nœud qui devient actif (au-dessus de l'ancien) doit sortir du sol.
    setState(() => _noeudQuiPousse = avantJoues + 1);

    // Scroll doux : le chemin a poussé, on recentre le nouveau nœud actif à l'écran.
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (mounted) _centrerNoeudActif(anime: true);
  }

  /// Ouvre la vue biomes (lobby).
  void _ouvrirLobby() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const EcranLobby()),
    );
  }

  /// Remonte les événements du Directeur (biome franchi, signal parent…) — SnackBar/log.
  void _remonterEvenements(List<EvenementDirecteur> evenements) {
    if (evenements.isEmpty) return;
    final messager = ScaffoldMessenger.of(context);
    for (final e in evenements) {
      // ignore: avoid_print
      print('[Directeur] ${e.type.id} : ${e.detail} (jour ${e.jour})');
    }
    messager.showSnackBar(SnackBar(
      content: Text('Plouma : ${evenements.last.type.id}'),
      duration: const Duration(seconds: 2),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final etat = ref.watch(carteProvider);
    final palette = _paletteCourante();

    return Scaffold(
      backgroundColor: ClayTheme.creme,
      body: etat == null
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              // ⚠️ Tous les enfants sont Positioned : le Stack prend alors tout l'écran.
              // (Avec un enfant non-positionné — l'en-tête —, le Stack se dimensionnait
              // sur LUI (~86 px) et toutes les couches Positioned.fill s'écrasaient en
              // haut de l'écran, nœuds hors écran et scroll impossible.)
              children: [
                // Couches de décor fixes derrière le scroll (parallax appliqué à l'intérieur).
                Positioned.fill(
                  child: _DecorFond(palette: palette, offset: _offset),
                ),
                // Le chemin scrollable au premier plan.
                Positioned.fill(child: _chemin(etat, palette)),
                // En-tête flottant au-dessus de tout.
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SafeArea(
                    child: _EnTeteBiome(
                      biome: etat.biome,
                      palette: palette,
                      onLobby: _ouvrirLobby,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  /// Le chemin serpentant + les nœuds posés dessus, dans un scroll ancré en bas.
  ///
  /// La boîte scrollable fait AU MOINS la hauteur de l'écran et le chemin y est ancré en
  /// BAS : en début de partie (chemin court), le premier niveau est donc en bas de l'écran ;
  /// dès que le chemin dépasse l'écran, on scrolle, et le nœud actif est centré.
  Widget _chemin(EtatCarte etat, BiomePalette palette) {
    return LayoutBuilder(
      builder: (context, contraintes) {
        final double largeur = contraintes.maxWidth;
        final double hauteurVue = contraintes.maxHeight;
        final geo = GeometrieChemin.construire(
          nbNoeuds: etat.noeuds.length,
          largeur: largeur,
        );
        final double hauteurBoite = math.max(geo.taille.height, hauteurVue);
        // Ancrage bas : le haut du chemin dans la boîte.
        final double hautChemin = hauteurBoite - geo.taille.height;

        // Mémorise la géométrie pour le centrage (initial et après une session).
        _geo = geo;
        _hauteurBoite = hauteurBoite;
        _hauteurVue = hauteurVue;
        if (!_centrageInitialFait) {
          _centrageInitialFait = true;
          WidgetsBinding.instance.addPostFrameCallback(
            (_) => _centrerNoeudActif(anime: false),
          );
        }

        return SingleChildScrollView(
          controller: _scroll,
          reverse: true, // offset 0 = bas du chemin
          child: SizedBox(
            width: largeur,
            height: hauteurBoite,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Le tracé du chemin (une seule couche repeinte), ancré en bas de la boîte.
                Positioned(
                  left: 0,
                  top: hautChemin,
                  width: largeur,
                  height: geo.taille.height,
                  child: RepaintBoundary(
                    child: CustomPaint(
                      size: geo.taille,
                      painter: CheminPainter(trace: geo.trace, palette: palette),
                    ),
                  ),
                ),
                // Les nœuds, posés SUR les ancres de la courbe (décalées de l'ancrage bas).
                for (int i = 0; i < etat.noeuds.length; i++)
                  _positionnerNoeud(
                    etat.noeuds[i],
                    geo.ancres[i] + Offset(0, hautChemin),
                    palette,
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Place un nœud centré sur son ancre (échantillonnée sur la Bézier).
  Widget _positionnerNoeud(NoeudCarte n, Offset ancre, BiomePalette palette) {
    final bool actif = n.statut == StatutNoeud.actif;
    final double d = actif ? kDiamNoeudActif : kDiamNoeud;
    final Widget noeud = switch (n.statut) {
      StatutNoeud.actif => NoeudActif(
          type: n.type,
          palette: palette,
          onTap: _jouerSession,
          sortDuSol: _noeudQuiPousse == n.index,
        ),
      StatutNoeud.joue => NoeudJoue(type: n.type, palette: palette),
      StatutNoeud.aVenir => NoeudAVenir(type: n.type, palette: palette),
    };
    return Positioned(
      left: ancre.dx - d / 2,
      top: ancre.dy - d / 2,
      width: d,
      height: d,
      child: KeyedSubtree(
        key: ValueKey(actif ? 'noeud-actif' : 'noeud-${n.index}'),
        child: noeud,
      ),
    );
  }
}

/// Couches de fond (sol + végétation + papillons) avec un léger parallax au scroll.
class _DecorFond extends StatefulWidget {
  final BiomePalette palette;
  final double offset;
  const _DecorFond({required this.palette, required this.offset});

  @override
  State<_DecorFond> createState() => _DecorFondState();
}

class _DecorFondState extends State<_DecorFond>
    with SingleTickerProviderStateMixin {
  late final AnimationController _flotte;
  late final List<BrinDecor> _brins;

  @override
  void initState() {
    super.initState();
    _flotte = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 9),
    )..repeat();
    _brins = semerDecor(widget.palette);
  }

  @override
  void didUpdateWidget(_DecorFond old) {
    super.didUpdateWidget(old);
    if (old.palette != widget.palette) _brins = semerDecor(widget.palette);
  }

  @override
  void dispose() {
    _flotte.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Parallax : le sol bouge lentement, la végétation un peu plus (illusion de profondeur).
    return Stack(
      children: [
        // Couche 1 : le sol (parallax lent).
        Positioned.fill(
          child: Transform.translate(
            offset: Offset(0, widget.offset * 0.05),
            child: RepaintBoundary(
              child: CustomPaint(painter: SolPrairiePainter(widget.palette)),
            ),
          ),
        ),
        // Couche 2 : la végétation (parallax un peu plus marqué).
        Positioned.fill(
          child: Transform.translate(
            offset: Offset(0, widget.offset * 0.12),
            child: RepaintBoundary(
              child: CustomPaint(painter: VegetationPainter(_brins)),
            ),
          ),
        ),
        // Couche 3 : papillons animés (au-dessus du décor, sous le chemin).
        Positioned.fill(
          child: RepaintBoundary(
            child: AnimatedBuilder(
              animation: _flotte,
              builder: (context, _) => CustomPaint(
                painter: PapillonsPainter(
                  _flotte.value,
                  couleurA: ClayTheme.dore,
                  couleurB: ClayTheme.joue,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// En-tête flottant (verre dépoli/clay) : nom du biome, étoile Plouma, bouton vue biomes.
class _EnTeteBiome extends StatelessWidget {
  final String biome;
  final BiomePalette palette;
  final VoidCallback onLobby;
  const _EnTeteBiome({
    required this.biome,
    required this.palette,
    required this.onLobby,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(ClayTheme.rayonGrand),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(ClayTheme.rayonGrand),
              border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 1.2),
              boxShadow: ClayTheme.ombreFlottante,
            ),
            child: Row(
              children: [
                const EtoilePlouma(taille: 38),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        biome,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: palette.foncee,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const Text(
                        'On avance ensemble',
                        style: TextStyle(fontSize: 12, color: ClayTheme.encreDouce),
                      ),
                    ],
                  ),
                ),
                _BoutonLobby(palette: palette, onTap: onLobby),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Bouton « vue biomes » : petite grille/mappemonde clay dessinée en CustomPaint.
class _BoutonLobby extends StatelessWidget {
  final BiomePalette palette;
  final VoidCallback onTap;
  const _BoutonLobby({required this.palette, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Voir tous les biomes',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          key: const Key('bouton-lobby'),
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [palette.dominante, palette.foncee],
            ),
            borderRadius: BorderRadius.circular(ClayTheme.rayonMoyen),
            boxShadow: ClayTheme.ombreDouce,
          ),
          child: const CustomPaint(painter: _IconeGrillePainter()),
        ),
      ),
    );
  }
}

/// Icône « grille de mondes » : 4 tuiles arrondies.
class _IconeGrillePainter extends CustomPainter {
  const _IconeGrillePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Paint p = Paint()..color = Colors.white.withValues(alpha: 0.95);
    final double d = size.width * 0.28;
    final double g = size.width * 0.14;
    final double x0 = size.width / 2 - d - g / 2;
    final double y0 = size.height / 2 - d - g / 2;
    for (int i = 0; i < 2; i++) {
      for (int j = 0; j < 2; j++) {
        final Rect r = Rect.fromLTWH(x0 + i * (d + g), y0 + j * (d + g), d, d);
        canvas.drawRRect(
          RRect.fromRectAndRadius(r, Radius.circular(d * 0.28)),
          p,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_IconeGrillePainter oldDelegate) => false;
}

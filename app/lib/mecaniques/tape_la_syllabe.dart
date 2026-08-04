// Mécanique « Tape la syllabe » — taper le rythme EST la segmentation (doc 03 §1, test du
// brocoli : on ne peut pas remplacer les mots par autre chose sans casser le gameplay).
//
// Déroulé d'un essai :
//   1. tirer un ItemSyllabes correspondant à la compétence cible (tirage_items.dart) ;
//   2. Plouma DIT le mot (« Écoute bien : … lapin ! Tape les syllabes ! ») via le service
//      voix (dev). En difficulté 0-1, on affiche AUSSI le mot écrit / son découpage ;
//   3. l'enfant tape sur le tambour clay ; ~1,2 s après le dernier tap → validation ;
//   4. réussite (taps == syllabesOrales) → confettis + éloge du PROCESSUS ;
//      raté → JAMAIS de négatif : Plouma MONTRE (découpage coloré + prononciation syllabe par
//      syllabe, tambour qui pulse), l'enfant refait → complété AVEC AIDE (avecAide=true).
//
// Produit un ResultatEssai fidèle : succes = réussite au 1er coup sans aide ; avecAide sinon.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../directeur/directeur.dart';
import '../services/contenu.dart';
import '../services/voix.dart';
import '../ui/theme_clay.dart';
import 'comptage_taps.dart';
import 'mecanique_ecran.dart';
import 'tirage_items.dart';

/// Écran de la mécanique « Tape la syllabe » pour un NiveauSpec.
class EcranTapeLaSyllabe extends StatefulWidget {
  final NiveauSpec spec;
  final List<ItemSyllabes> banque;
  final ServiceVoix voix;
  final NiveauTermine onTermine;

  /// Hasard injectable (indice dans [0, max)). Par défaut : Random réel.
  final TirageIndice? tirage;

  const EcranTapeLaSyllabe({
    super.key,
    required this.spec,
    required this.banque,
    required this.voix,
    required this.onTermine,
    this.tirage,
  });

  @override
  State<EcranTapeLaSyllabe> createState() => _EcranTapeLaSyllabeState();
}

/// Phase visuelle de l'essai courant.
enum _Phase { ecoute, saisie, modelling, reussite }

class _EcranTapeLaSyllabeState extends State<EcranTapeLaSyllabe>
    with TickerProviderStateMixin {
  late final List<CibleNiveau> _cibles;
  late final TirageIndice _tirage;
  final _compteur = CompteurTaps();
  final _resultats = <ResultatEssai>[];

  int _essai = 0;
  String? _dernierMot;
  ItemSyllabes? _item;
  _Phase _phase = _Phase.ecoute;
  bool _aEuAide = false; // l'essai courant a-t-il nécessité l'aide (modelling) ?
  Timer? _timerValidation;

  // Pulsation du tambour (rythme du modelling + retour tactile).
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _cibles = repartirCibles(widget.spec);
    final rnd = math.Random(1234); // dev : graine fixe si aucun tirage injecté
    _tirage = widget.tirage ?? (max) => rnd.nextInt(max);
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
      lowerBound: 1.0,
      upperBound: 1.14,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _demarrerEssai());
  }

  @override
  void dispose() {
    _timerValidation?.cancel();
    _pulse.dispose();
    widget.voix.couper();
    super.dispose();
  }

  /// Compétence et difficulté de l'essai courant.
  CibleNiveau get _cible => _cibles[_essai];
  int get _difficulte => _cible.difficulte;

  /// En difficulté 0-1 : on montre le mot écrit pendant l'écoute (doc mission §4).
  bool get _afficherMotEcrit => _difficulte <= 1;

  Future<void> _demarrerEssai() async {
    _compteur.reinitialiser();
    _aEuAide = false;
    final item = tirerItem(widget.banque, _cible.competence, _tirage,
        dernierMot: _dernierMot);
    setState(() {
      _item = item;
      _phase = _Phase.ecoute;
    });
    if (item == null) {
      // Contenu vide : on n'a rien à faire jouer → essai « réussi » neutre, on avance.
      _enregistrer(succes: true, avecAide: false);
      _avancer();
      return;
    }
    _dernierMot = item.mot;
    await widget.voix.dire('Écoute bien : ${item.mot} !');
    await widget.voix.dire('Tape les syllabes !');
    if (!mounted) return;
    setState(() => _phase = _Phase.saisie);
  }

  void _onTap() {
    if (_phase != _Phase.saisie) return;
    _compteur.taper();
    _pulse.forward(from: 1.0).then((_) => _pulse.reverse());
    _timerValidation?.cancel();
    _timerValidation = Timer(kDelaiValidationTaps, _valider);
    setState(() {}); // rafraîchit l'indicateur de taps
  }

  void _valider() {
    final item = _item;
    if (item == null) return;
    final bool ok = _compteur.reussitePour(item.syllabesOrales);
    if (ok) {
      _reussir();
    } else {
      _montrer(item); // modelling — jamais de feedback négatif
    }
  }

  Future<void> _reussir() async {
    setState(() => _phase = _Phase.reussite);
    // Éloge du PROCESSUS, jamais de la personne (doc 03 §2.4).
    unawaited(widget.voix.dire('Bravo, tu as bien écouté le mot !'));
    _enregistrer(succes: !_aEuAide, avecAide: _aEuAide);
    await Future<void>.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;
    _avancer();
  }

  /// Modelling : Plouma MONTRE le découpage et prononce syllabe par syllabe, le tambour
  /// pulse en rythme. Aucun son/écran négatif. Puis l'enfant refait (avecAide).
  Future<void> _montrer(ItemSyllabes item) async {
    _aEuAide = true;
    setState(() => _phase = _Phase.modelling);
    final syllabes = item.decoupage.split('-');
    await widget.voix.dire('Regarde, je te montre.');
    for (final syl in syllabes) {
      if (!mounted) return;
      _pulse.forward(from: 1.0).then((_) => _pulse.reverse());
      await widget.voix.dire(syl);
      await Future<void>.delayed(const Duration(milliseconds: 260));
    }
    if (!mounted) return;
    await widget.voix.dire('À toi ! Tape les syllabes !');
    if (!mounted) return;
    _compteur.reinitialiser();
    setState(() => _phase = _Phase.saisie);
  }

  void _enregistrer({required bool succes, required bool avecAide}) {
    _resultats.add(ResultatEssai(
      competence: _cible.competence,
      succes: succes,
      avecAide: avecAide,
    ));
  }

  void _avancer() {
    if (_essai + 1 >= _cibles.length) {
      widget.onTermine(List.unmodifiable(_resultats));
      return;
    }
    setState(() => _essai++);
    _demarrerEssai();
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    return Scaffold(
      backgroundColor: ClayTheme.creme,
      body: SafeArea(
        child: Column(
          children: [
            _enTete(),
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _zoneMot(item),
                    const SizedBox(height: 28),
                    _consigne(),
                    const SizedBox(height: 28),
                    _tambour(),
                    const SizedBox(height: 20),
                    if (_phase == _Phase.reussite) const _Confettis(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _enTete() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          Text('Essai ${_essai + 1} / ${_cibles.length}',
              style: const TextStyle(color: ClayTheme.encre, fontSize: 16)),
          const Spacer(),
          Text(_cible.competence,
              style: TextStyle(
                  color: ClayTheme.encre.withValues(alpha: 0.4), fontSize: 13)),
        ],
      ),
    );
  }

  /// Le mot écrit avec syllabes colorées (en écoute si difficulté ≤ 1, toujours en modelling).
  Widget _zoneMot(ItemSyllabes? item) {
    if (item == null) return const SizedBox(height: 80);
    final bool montrerDecoupage =
        _phase == _Phase.modelling || (_afficherMotEcrit && _phase != _Phase.reussite);
    if (!montrerDecoupage) return const SizedBox(height: 80);
    final syllabes = item.decoupage.split('-');
    return Wrap(
      children: [
        for (int i = 0; i < syllabes.length; i++)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: ClayTheme.couleurSyllabe(i),
              borderRadius: BorderRadius.circular(16),
              boxShadow: ClayTheme.ombreDouce,
            ),
            child: Text(
              syllabes[i],
              style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w700,
                  color: Colors.white),
            ),
          ),
      ],
    );
  }

  Widget _consigne() {
    final String texte = switch (_phase) {
      _Phase.ecoute => 'Écoute bien…',
      _Phase.saisie => 'Tape les syllabes !',
      _Phase.modelling => 'Regarde, je te montre…',
      _Phase.reussite => 'Bravo, tu as bien écouté le mot !',
    };
    return Text(
      texte,
      style: const TextStyle(
          fontSize: 22, color: ClayTheme.encre, fontWeight: FontWeight.w600),
    );
  }

  Widget _tambour() {
    final int taps = _compteur.taps;
    return Column(
      children: [
        GestureDetector(
          onTap: _onTap,
          child: AnimatedBuilder(
            animation: _pulse,
            builder: (context, child) =>
                Transform.scale(scale: _pulse.value, child: child),
            child: Container(
              key: const Key('tambour'),
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  colors: [Color(0xFFE8B98A), Color(0xFFCF9463)],
                  center: Alignment(-0.3, -0.3),
                ),
                boxShadow: ClayTheme.ombreClay,
              ),
              child: const Center(
                child: Icon(Icons.music_note_rounded,
                    size: 54, color: Colors.white70),
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        // Retour visuel des taps : des pastilles clay qui apparaissent.
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (int i = 0; i < taps; i++)
              Container(
                key: ValueKey('tap-$i'),
                width: 22,
                height: 22,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: ClayTheme.couleurSyllabe(i),
                  shape: BoxShape.circle,
                  boxShadow: ClayTheme.ombreDouce,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Confettis simples (feedback de réussite, doc mission §4). Pas de package : peinture maison.
class _Confettis extends StatefulWidget {
  const _Confettis();

  @override
  State<_Confettis> createState() => _ConfettisState();
}

class _ConfettisState extends State<_Confettis>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1400))
      ..forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) => CustomPaint(
        size: const Size(240, 90),
        painter: _ConfettisPainter(_ctrl.value),
      ),
    );
  }
}

class _ConfettisPainter extends CustomPainter {
  final double t;
  _ConfettisPainter(this.t);

  @override
  void paint(Canvas canvas, Size size) {
    final rnd = math.Random(7);
    final paint = Paint();
    for (int i = 0; i < 18; i++) {
      final double x = rnd.nextDouble() * size.width;
      final double chute = t * (size.height + 20);
      final double y = (rnd.nextDouble() * 20) + chute * (0.6 + rnd.nextDouble());
      paint.color = ClayTheme.couleurSyllabe(i).withValues(alpha: 1 - t);
      canvas.drawCircle(Offset(x, y % size.height), 5, paint);
    }
  }

  @override
  bool shouldRepaint(_ConfettisPainter old) => old.t != t;
}

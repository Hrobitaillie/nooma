// Mécanique « La boîte à sons » — segmentation syllabique PAR JETONS (doc 03 §1, test du
// brocoli : déposer un jeton par syllabe EST la segmentation ; on ne peut pas remplacer les
// mots par autre chose sans casser le comptage).
//
// Déroulé d'un essai :
//   1. tirer un ItemSyllabes correspondant à la compétence cible (tirage_items.dart) ;
//   2. Plouma DIT le mot (« Écoute bien : … lapin ! »). En difficulté 0-1, on affiche AUSSI le
//      mot écrit / son découpage coloré pendant l'écoute ;
//   3. l'enfant tape les jetons clay de la rangée du bas, un par un : chaque jeton SAUTE dans la
//      boîte (petite trajectoire en arc) et Plouma prononce la syllabe correspondante (1er jeton
//      = 1re syllabe, etc. — la mécanique EST la segmentation) ;
//   4. validation quand l'enfant appuie sur le gros bouton « fini », ou auto après ~1,5 s
//      d'inactivité avec ≥1 jeton déposé ;
//   5. réussite (jetons déposés == syllabesOrales) → confettis + éloge du PROCESSUS ;
//      raté → JAMAIS de négatif : la boîte se vide en douceur, Plouma MONTRE (prononce syllabe
//      par syllabe, un jeton saute tout seul à chaque syllabe), l'enfant refait → AVEC AIDE.
//
// Produit un ResultatEssai fidèle : succes = réussite au 1er coup sans aide ; avecAide sinon.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../directeur/directeur.dart';
import '../services/contenu.dart';
import '../services/voix.dart';
import '../ui/theme_clay.dart';
import 'boite_a_sons_logique.dart';
import 'mecanique_ecran.dart';
import 'tirage_items.dart';

/// Écran de la mécanique « La boîte à sons » pour un NiveauSpec.
class EcranBoiteASons extends StatefulWidget {
  final NiveauSpec spec;
  final List<ItemSyllabes> banque;
  final ServiceVoix voix;
  final NiveauTermine onTermine;

  /// Hasard injectable (indice dans [0, max)). Par défaut : Random réel (graine fixe en dev).
  final TirageIndice? tirage;

  const EcranBoiteASons({
    super.key,
    required this.spec,
    required this.banque,
    required this.voix,
    required this.onTermine,
    this.tirage,
  });

  @override
  State<EcranBoiteASons> createState() => _EcranBoiteASonsState();
}

/// Phase visuelle de l'essai courant.
enum _Phase { ecoute, saisie, modelling, reussite }

class _EcranBoiteASonsState extends State<EcranBoiteASons>
    with TickerProviderStateMixin {
  late final List<CibleNiveau> _cibles;
  late final TirageIndice _tirage;
  final _boite = BoiteASons();
  final _resultats = <ResultatEssai>[];

  int _essai = 0;
  String? _dernierMot;
  ItemSyllabes? _item;
  _Phase _phase = _Phase.ecoute;
  bool _aEuAide = false; // l'essai courant a-t-il nécessité l'aide (modelling) ?
  Timer? _timerValidation;

  // Ordre coloré des jetons de la rangée (cosmétique, reproductible via _tirage).
  List<int> _couleursJetons = const [];
  // Indices des jetons déjà déposés dans la boîte (pour les retirer de la rangée).
  final Set<int> _deposes = {};

  // Pulsation de la boîte (retour tactile au dépôt + rythme du modelling).
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _cibles = repartirCibles(widget.spec);
    final rnd = math.Random(2718); // dev : graine fixe si aucun tirage injecté
    _tirage = widget.tirage ?? (max) => rnd.nextInt(max);
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
      lowerBound: 1.0,
      upperBound: 1.12,
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

  /// En difficulté 0-1 : on montre le mot écrit + son découpage pendant l'écoute (doc mission §1).
  bool get _afficherMotEcrit => _difficulte <= 1;

  Future<void> _demarrerEssai() async {
    _boite.reinitialiser();
    _deposes.clear();
    _aEuAide = false;
    final item = tirerItem(widget.banque, _cible.competence, _tirage,
        dernierMot: _dernierMot);
    setState(() {
      _item = item;
      _phase = _Phase.ecoute;
      _couleursJetons = item == null
          ? const []
          : ordreJetons(jetonsProposes(item.syllabesOrales), _tirage);
    });
    if (item == null) {
      // Contenu vide : rien à faire jouer → essai « réussi » neutre, on avance.
      _enregistrer(succes: true, avecAide: false);
      _avancer();
      return;
    }
    _dernierMot = item.mot;
    await widget.voix.dire('Écoute bien : ${item.mot} !');
    // En difficulté 0-1, on répète volontiers le mot (doc mission §1).
    if (_difficulte <= 1) {
      await widget.voix.dire('${item.mot}.');
    }
    await widget.voix.dire('Mets un jeton pour chaque bout du mot !');
    if (!mounted) return;
    setState(() => _phase = _Phase.saisie);
  }

  /// L'enfant tape le jeton d'indice [i] de la rangée → il saute dans la boîte, Plouma prononce
  /// la syllabe correspondante (1er jeton = 1re syllabe, etc.).
  Future<void> _deposerJeton(int i) async {
    if (_phase != _Phase.saisie) return;
    if (_deposes.contains(i)) return;
    final item = _item;
    if (item == null) return;

    final int rang = _boite.jetonsDeposes; // 0-based : quelle syllabe ce jeton représente
    _boite.deposer();
    _pulse.forward(from: 1.0).then((_) => _pulse.reverse());
    setState(() => _deposes.add(i));

    // Voix : la syllabe correspondante si on est encore dans le mot ; au-delà, on ne dit rien
    // (l'enfant a mis « trop » de jetons — pas de son négatif, juste pas de syllabe à associer).
    final syllabes = sequenceModelling(item.mot, item.decoupage);
    if (rang < syllabes.length) {
      unawaited(widget.voix.dire(syllabes[rang]));
    }

    // Validation automatique après inactivité (avec ≥1 jeton déposé).
    _timerValidation?.cancel();
    _timerValidation = Timer(kDelaiValidationJetons, _valider);
  }

  void _valider() {
    _timerValidation?.cancel();
    if (_phase != _Phase.saisie) return;
    final item = _item;
    if (item == null) return;
    if (_boite.jetonsDeposes == 0) return; // rien déposé : on ne valide pas (ni le bouton fini)
    if (_boite.reussitePour(item.syllabesOrales)) {
      _reussir();
    } else {
      _montrer(item); // modelling — jamais de feedback négatif
    }
  }

  Future<void> _reussir() async {
    setState(() => _phase = _Phase.reussite);
    // Éloge du PROCESSUS, jamais de la personne (doc 03 §2.4).
    unawaited(widget.voix.dire('Bravo, tu as bien compté les syllabes !'));
    _enregistrer(succes: !_aEuAide, avecAide: _aEuAide);
    await Future<void>.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;
    _avancer();
  }

  /// Modelling : la boîte se vide en douceur, puis Plouma MONTRE — elle prononce syllabe par
  /// syllabe et un jeton saute tout seul dans la boîte à chaque syllabe. Aucun son/écran
  /// négatif. Puis l'enfant refait (avecAide).
  Future<void> _montrer(ItemSyllabes item) async {
    _aEuAide = true;
    _timerValidation?.cancel();
    // La boîte se vide en douceur.
    setState(() {
      _phase = _Phase.modelling;
      _boite.reinitialiser();
      _deposes.clear();
    });
    await widget.voix.dire('Regarde, je te montre.');
    final syllabes = sequenceModelling(item.mot, item.decoupage);
    for (int k = 0; k < syllabes.length; k++) {
      if (!mounted) return;
      // Un jeton saute tout seul dans la boîte.
      setState(() {
        _boite.deposer();
        if (k < _couleursJetons.length) _deposes.add(k);
      });
      _pulse.forward(from: 1.0).then((_) => _pulse.reverse());
      await widget.voix.dire(syllabes[k]);
      await Future<void>.delayed(const Duration(milliseconds: 280));
    }
    if (!mounted) return;
    await widget.voix.dire('À toi ! Un jeton pour chaque bout.');
    if (!mounted) return;
    // On re-remplit la rangée : l'enfant refait tout seul.
    setState(() {
      _boite.reinitialiser();
      _deposes.clear();
      _phase = _Phase.saisie;
    });
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
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _zoneMot(item),
                  const SizedBox(height: 20),
                  _consigne(),
                  const SizedBox(height: 20),
                  _boiteWidget(),
                  const SizedBox(height: 14),
                  if (_phase == _Phase.reussite) const _Confettis(),
                ],
              ),
            ),
            _rangeeJetons(),
            _boutonFini(),
            const SizedBox(height: 12),
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
    final bool montrerDecoupage = _phase == _Phase.modelling ||
        (_afficherMotEcrit && _phase != _Phase.reussite);
    if (!montrerDecoupage) return const SizedBox(height: 80);
    final syllabes = sequenceModelling(item.mot, item.decoupage);
    return Wrap(
      alignment: WrapAlignment.center,
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
      _Phase.saisie => 'Un jeton pour chaque bout du mot !',
      _Phase.modelling => 'Regarde, je te montre…',
      _Phase.reussite => 'Bravo, tu as bien compté les syllabes !',
    };
    return Text(
      texte,
      textAlign: TextAlign.center,
      style: const TextStyle(
          fontSize: 22, color: ClayTheme.encre, fontWeight: FontWeight.w600),
    );
  }

  /// La boîte/panier au centre : elle grossit un peu à chaque dépôt (pulse) et affiche les
  /// jetons déjà tombés dedans.
  Widget _boiteWidget() {
    final int dedans = _boite.jetonsDeposes;
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) =>
          Transform.scale(scale: _pulse.value, child: child),
      child: Container(
        key: const Key('boite'),
        width: 200,
        height: 120,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFE7D3B3), Color(0xFFCBAE82)],
          ),
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(18),
            bottom: Radius.circular(30),
          ),
          boxShadow: ClayTheme.ombreClay,
        ),
        child: Wrap(
          alignment: WrapAlignment.center,
          runAlignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (int i = 0; i < dedans; i++)
              Container(
                key: ValueKey('dans-boite-$i'),
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: ClayTheme.couleurSyllabe(i),
                  shape: BoxShape.circle,
                  boxShadow: ClayTheme.ombreDouce,
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// La rangée de jetons disponibles en bas (billes de pâte colorées). L'enfant en tape un par
  /// syllabe ; un jeton déposé disparaît de la rangée (il est « dans la boîte »).
  Widget _rangeeJetons() {
    if (_item == null) return const SizedBox(height: 72);
    final bool actif = _phase == _Phase.saisie;
    return SizedBox(
      height: 72,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (int i = 0; i < _couleursJetons.length; i++)
            if (!_deposes.contains(i))
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: GestureDetector(
                  onTap: actif ? () => _deposerJeton(i) : null,
                  child: Container(
                    key: ValueKey('jeton-$i'),
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: ClayTheme.couleurSyllabe(_couleursJetons[i]),
                      shape: BoxShape.circle,
                      boxShadow: ClayTheme.ombreClay,
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  /// Gros bouton « fini » : valide quand l'enfant l'estime terminé (doc mission §1).
  Widget _boutonFini() {
    final bool actif = _phase == _Phase.saisie && _boite.jetonsDeposes > 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: GestureDetector(
        onTap: actif ? _valider : null,
        child: Container(
          key: const Key('bouton-fini'),
          height: 60,
          decoration: BoxDecoration(
            color: actif ? ClayTheme.vert : ClayTheme.vertClair,
            borderRadius: BorderRadius.circular(22),
            boxShadow: actif ? ClayTheme.ombreClay : ClayTheme.ombreDouce,
          ),
          alignment: Alignment.center,
          child: Text(
            'Fini !',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: actif
                  ? Colors.white
                  : ClayTheme.encre.withValues(alpha: 0.4),
            ),
          ),
        ),
      ),
    );
  }
}

/// Confettis simples (feedback de réussite). Pas de package : peinture maison (même esprit que
/// « Tape la syllabe » mais réécrit ici pour rester indépendant, propriété de ce fichier).
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
        size: const Size(240, 80),
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
    final rnd = math.Random(11);
    final paint = Paint();
    for (int i = 0; i < 18; i++) {
      final double x = rnd.nextDouble() * size.width;
      final double chute = t * (size.height + 20);
      final double y =
          (rnd.nextDouble() * 20) + chute * (0.6 + rnd.nextDouble());
      paint.color = ClayTheme.couleurSyllabe(i).withValues(alpha: 1 - t);
      canvas.drawCircle(Offset(x, y % size.height), 5, paint);
    }
  }

  @override
  bool shouldRepaint(_ConfettisPainter old) => old.t != t;
}

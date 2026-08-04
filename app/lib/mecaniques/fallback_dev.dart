// Mécanique de repli [DEV] — pour toute mécanique demandée par le Directeur mais pas encore
// implémentée (boite-a-sons, intrus-phonologique, fabrique-de-syllabes…).
//
// ⚠️ [DEV] : ce n'est PAS une vraie mécanique produit (elle ne passe pas forcément le test du
// brocoli) — juste un placeholder pour que la boucle de session soit jouable de bout en bout.
// Le mot est dit ; l'enfant choisit le nombre de syllabes parmi des boutons 1-4.
//
// Produit des ResultatEssai fidèles : succes au 1er coup sans aide ; sinon avecAide.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../directeur/directeur.dart';
import '../services/contenu.dart';
import '../services/voix.dart';
import '../ui/theme_clay.dart';
import 'mecanique_ecran.dart';
import 'tirage_items.dart';

/// Écran de repli générique [DEV] : « combien de syllabes ? ».
class EcranFallbackDev extends StatefulWidget {
  final NiveauSpec spec;
  final List<ItemSyllabes> banque;
  final ServiceVoix voix;
  final NiveauTermine onTermine;
  final TirageIndice? tirage;

  const EcranFallbackDev({
    super.key,
    required this.spec,
    required this.banque,
    required this.voix,
    required this.onTermine,
    this.tirage,
  });

  @override
  State<EcranFallbackDev> createState() => _EcranFallbackDevState();
}

class _EcranFallbackDevState extends State<EcranFallbackDev> {
  late final List<CibleNiveau> _cibles;
  late final TirageIndice _tirage;
  final _resultats = <ResultatEssai>[];

  int _essai = 0;
  String? _dernierMot;
  ItemSyllabes? _item;
  bool _aEuAide = false;

  @override
  void initState() {
    super.initState();
    _cibles = repartirCibles(widget.spec);
    final rnd = math.Random(4321);
    _tirage = widget.tirage ?? (max) => rnd.nextInt(max);
    WidgetsBinding.instance.addPostFrameCallback((_) => _demarrerEssai());
  }

  @override
  void dispose() {
    widget.voix.couper();
    super.dispose();
  }

  CibleNiveau get _cible => _cibles[_essai];

  Future<void> _demarrerEssai() async {
    _aEuAide = false;
    final item = tirerItem(widget.banque, _cible.competence, _tirage,
        dernierMot: _dernierMot);
    setState(() => _item = item);
    if (item == null) {
      _enregistrer(succes: true, avecAide: false);
      _avancer();
      return;
    }
    _dernierMot = item.mot;
    await widget.voix.dire('Combien de syllabes dans : ${item.mot} ?');
  }

  Future<void> _choisir(int nb) async {
    final item = _item;
    if (item == null) return;
    if (nb == item.syllabesOrales) {
      unawaited(widget.voix.dire('Oui, bien écouté !'));
      _enregistrer(succes: !_aEuAide, avecAide: _aEuAide);
      await Future<void>.delayed(const Duration(milliseconds: 700));
      if (!mounted) return;
      _avancer();
    } else {
      // Jamais de négatif : Plouma redonne le mot, syllabe par syllabe, et l'enfant refait.
      _aEuAide = true;
      final syllabes = item.decoupage.split('-');
      await widget.voix.dire('Écoute encore : ${syllabes.join(", ")}.');
      if (!mounted) return;
      setState(() {}); // reste sur le même item pour retenter (avecAide)
    }
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
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('[DEV] Combien de syllabes ?',
                  style: TextStyle(
                      fontSize: 22,
                      color: ClayTheme.encre,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text('Essai ${_essai + 1} / ${_cibles.length}  ·  ${_cible.competence}',
                  style: TextStyle(
                      color: ClayTheme.encre.withValues(alpha: 0.5),
                      fontSize: 13)),
              const SizedBox(height: 28),
              if (item != null)
                Text(item.mot,
                    style: const TextStyle(
                        fontSize: 40,
                        fontWeight: FontWeight.w700,
                        color: ClayTheme.encre)),
              const SizedBox(height: 32),
              Wrap(
                spacing: 14,
                children: [
                  for (int n = 1; n <= 4; n++)
                    _BoutonNombre(nombre: n, onTap: () => _choisir(n)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BoutonNombre extends StatelessWidget {
  final int nombre;
  final VoidCallback onTap;
  const _BoutonNombre({required this.nombre, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: ClayTheme.vertClair,
          borderRadius: BorderRadius.circular(20),
          boxShadow: ClayTheme.ombreDouce,
        ),
        alignment: Alignment.center,
        child: Text('$nombre',
            style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: ClayTheme.encre)),
      ),
    );
  }
}

// Niveau cadeau 🎁 — mini-écran de surprise (doc 04 §7 : « Nœud cadeau »).
//
// 3 secondes : une étoile + un son joyeux (via la voix « Oh, un cadeau ! »). AUCUN exercice.
// Renforcement variable ÉTHIQUE : la surprise est toujours positive, jamais annoncée à
// l'avance, jamais un « raté » (doc 03 §2.2, §5). Produit une liste d'essais VIDE (le
// Directeur traite le type cadeau à part : il incrémente juste le compteur de niveaux).

import 'dart:async';

import 'package:flutter/material.dart';

import '../directeur/directeur.dart';
import '../services/contenu.dart';
import '../services/voix.dart';
import '../ui/theme_clay.dart';
import 'mecanique_ecran.dart';

/// Écran cadeau : une étoile dorée, 3 s, puis retour. Pas d'exercice, pas de score.
class EcranCadeau extends StatefulWidget {
  final ServiceVoix voix;

  /// Registre des lignes de texte (doc 18 §4), résolu par id avec repli DUR. Défaut : vide.
  final RegistreVoix registre;

  final NiveauTermine onTermine;

  const EcranCadeau({
    super.key,
    required this.voix,
    this.registre = const RegistreVoix.vide(),
    required this.onTermine,
  });

  @override
  State<EcranCadeau> createState() => _EcranCadeauState();
}

class _EcranCadeauState extends State<EcranCadeau>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.voix.dire(widget.registre
          .resoudre('feedback-cadeau', repli: 'Oh, un cadeau !'));
    });
    // Cadeau = liste d'essais vide (aucune donnée d'apprentissage).
    _timer = Timer(const Duration(seconds: 3), () {
      if (mounted) widget.onTermine(const <ResultatEssai>[]);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    widget.voix.couper();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClayTheme.creme,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: Tween<double>(begin: 0.85, end: 1.15).animate(
                CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
              ),
              child: const EtoilePlouma(taille: 120),
            ),
            const SizedBox(height: 24),
            const Text('Oh, un cadeau !',
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: ClayTheme.encre)),
          ],
        ),
      ),
    );
  }
}

// Carte Prairie — le chemin vertical du biome, parcouru de bas en haut (doc 04 §6).
//
// Style « pâte à modeler » dessiné en Flutter (placeholder assumé, doc 05) : fond crème,
// verts tendres, ombres douces. Nœuds déjà joués (pastilles pleines, inactifs pour l'instant),
// nœud suivant actif (plus gros, pulsation), 2-3 nœuds à venir estompés dont le TYPE est
// lisible (normal ● / cadeau 🎁 / rêve 🌙). Quand une session se termine, le chemin pousse
// (nouveaux nœuds en fondu+scale, scroll doux vers le haut).
//
// En-tête discret : nom du biome + étoile Plouma placeholder (doré à 5 pointes).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../directeur/directeur.dart';
import '../etat/session.dart';
import 'ecran_session.dart';
import 'theme_clay.dart';

/// Écran principal : la carte du biome courant.
class EcranCarte extends ConsumerStatefulWidget {
  const EcranCarte({super.key});

  @override
  ConsumerState<EcranCarte> createState() => _EcranCarteState();
}

class _EcranCarteState extends ConsumerState<EcranCarte> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Tap sur le nœud actif : génère la session, la joue, ingère les résultats.
  Future<void> _jouerSession() async {
    final notifier = ref.read(carteProvider.notifier);
    final etat = ref.read(carteProvider);
    if (etat == null || etat.sessionEnCours) return;

    final banque = ref.read(syllabesProvider).valueOrNull ?? const [];
    final voix = ref.read(serviceVoixProvider);

    final niveaux = notifier.genererProchaineSession();
    if (niveaux.isEmpty) return;

    notifier.demarrerSession();

    // Ouvre l'écran de session (plein écran) et attend les résultats.
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
    // Ingestion + croissance du chemin.
    final evenements = notifier.terminerSession(resultats ?? const []);
    _remonterEvenements(evenements);

    // Scroll doux vers le haut : le chemin a poussé, on suit la pousse.
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (_scroll.hasClients) {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeInOut,
      );
    }
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

    return Scaffold(
      backgroundColor: ClayTheme.creme,
      body: SafeArea(
        child: etat == null
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  _EnTeteBiome(biome: etat.biome),
                  Expanded(child: _chemin(etat)),
                ],
              ),
      ),
    );
  }

  /// Le chemin vertical, parcouru de bas en haut : on inverse la liste pour que le nœud
  /// actif et les nœuds à venir soient EN HAUT, les joués EN BAS.
  Widget _chemin(EtatCarte etat) {
    final noeuds = etat.noeuds.reversed.toList();
    return SingleChildScrollView(
      controller: _scroll,
      reverse: true, // ancre le scroll en bas (là où se trouve le nœud actif au départ)
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            for (final n in noeuds)
              _NoeudChemin(
                noeud: n,
                onTap: n.statut == StatutNoeud.actif ? _jouerSession : null,
              ),
          ],
        ),
      ),
    );
  }
}

/// En-tête : nom du biome + étoile Plouma dorée.
class _EnTeteBiome extends StatelessWidget {
  final String biome;
  const _EnTeteBiome({required this.biome});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Row(
        children: [
          Text(
            biome,
            style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                color: ClayTheme.vertFonce),
          ),
          const Spacer(),
          const EtoilePlouma(taille: 34),
        ],
      ),
    );
  }
}

/// Un nœud du chemin + le segment de sentier qui le relie au suivant.
class _NoeudChemin extends StatelessWidget {
  final NoeudCarte noeud;
  final VoidCallback? onTap;

  const _NoeudChemin({required this.noeud, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Segment de sentier clay au-dessus du nœud (sauf tout en haut).
        Container(
          key: ValueKey('sentier-${noeud.index}'),
          width: 14,
          height: 44,
          decoration: BoxDecoration(
            color: ClayTheme.vertClair,
            borderRadius: BorderRadius.circular(7),
            boxShadow: ClayTheme.ombreDouce,
          ),
        ),
        switch (noeud.statut) {
          StatutNoeud.actif => _NoeudActif(noeud: noeud, onTap: onTap),
          StatutNoeud.joue => _NoeudSimple(noeud: noeud, opacite: 1),
          StatutNoeud.aVenir => _NoeudSimple(noeud: noeud, opacite: 0.4),
        },
      ],
    );
  }
}

/// Icône / glyphe selon le type du nœud (normal ● / cadeau 🎁 / rêve 🌙).
String _glyphePour(TypeNiveau type) => switch (type) {
      TypeNiveau.cadeau => '🎁',
      TypeNiveau.reve => '🌙',
      _ => '●',
    };

/// Nœud joué (plein) ou à venir (estompé) — non interactif dans cette tranche.
class _NoeudSimple extends StatelessWidget {
  final NoeudCarte noeud;
  final double opacite;
  const _NoeudSimple({required this.noeud, required this.opacite});

  @override
  Widget build(BuildContext context) {
    final bool joue = noeud.statut == StatutNoeud.joue;
    return Opacity(
      opacity: opacite,
      child: Container(
        key: ValueKey('noeud-${noeud.index}'),
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: joue ? ClayTheme.vert : ClayTheme.vertClair,
          shape: BoxShape.circle,
          boxShadow: ClayTheme.ombreDouce,
        ),
        alignment: Alignment.center,
        child: Text(_glyphePour(noeud.type),
            style: const TextStyle(fontSize: 20, color: Colors.white)),
      ),
    );
  }
}

/// Le nœud actif : plus gros, pulsation douce, tapable.
class _NoeudActif extends StatefulWidget {
  final NoeudCarte noeud;
  final VoidCallback? onTap;
  const _NoeudActif({required this.noeud, this.onTap});

  @override
  State<_NoeudActif> createState() => _NoeudActifState();
}

class _NoeudActifState extends State<_NoeudActif>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1100))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: ScaleTransition(
        scale: Tween<double>(begin: 1.0, end: 1.08).animate(
          CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
        ),
        child: Container(
          key: const Key('noeud-actif'),
          width: 84,
          height: 84,
          decoration: BoxDecoration(
            color: ClayTheme.vertFonce,
            shape: BoxShape.circle,
            boxShadow: ClayTheme.ombreClay,
          ),
          alignment: Alignment.center,
          child: const Icon(Icons.play_arrow_rounded,
              size: 44, color: Colors.white),
        ),
      ),
    );
  }
}

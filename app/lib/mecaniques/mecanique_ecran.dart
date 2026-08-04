// Contrat commun des ÉCRANS de mécanique (couche UI).
//
// Distinct de mecanique.dart (interface pure `play` héritée du socle) : ici on décrit un
// widget de mécanique qui joue UN NiveauSpec et rend `List<ResultatEssai>` via un callback.
// Le NiveauSpec utilisé est celui du Directeur (directeur.dart), pas le stub de mecanique.dart.
//
// C'est AUSSI le point de dispatch mécanique → écran : `ecranPourMecanique` associe l'id de
// mécanique demandé par le Directeur (spec.mecanique) au widget qui l'implémente réellement,
// avec repli [DEV] pour les mécaniques pas encore réalisées.

import 'package:flutter/widgets.dart';

import '../directeur/directeur.dart';
import '../services/contenu.dart';
import '../services/voix.dart';
import 'boite_a_sons.dart';
import 'fallback_dev.dart';
import 'tape_la_syllabe.dart';
import 'tirage_items.dart';

/// Répartit les [nbEssais] d'un niveau sur ses compétences cibles (cyclique).
///
/// Un niveau à 1 cible → tous les essais sur cette compétence. Un niveau à plusieurs cibles
/// (confirmation, rêve) → on alterne les compétences essai après essai. Si aucune cible
/// (ex. cadeau), retourne une liste vide.
List<CibleNiveau> repartirCibles(NiveauSpec spec) {
  if (spec.cibles.isEmpty) return const [];
  return [
    for (int i = 0; i < spec.nbEssais; i++)
      spec.cibles[i % spec.cibles.length],
  ];
}

/// Callback appelé quand un écran de mécanique a terminé son niveau.
typedef NiveauTermine = void Function(List<ResultatEssai> essais);

/// Sélectionne l'écran de mécanique pour un [spec] selon `spec.mecanique` (doc mission §2).
///
/// Les niveaux CADEAU (sans exercice) sont gérés en amont par l'écran de session : ici on ne
/// traite que les mécaniques d'exercice. Mécaniques réelles reconnues :
///   - `tape-la-syllabe` → EcranTapeLaSyllabe ;
///   - `boite-a-sons`    → EcranBoiteASons (segmentation par jetons) ;
///   - toute autre        → repli [DEV] EcranFallbackDev (« combien de syllabes ? »).
///
/// Le [tirage] optionnel injecte le hasard (déterminisme des tests) ; en production il est nul
/// et chaque écran retombe sur son Random de dev interne.
Widget ecranPourMecanique({
  Key? key,
  required NiveauSpec spec,
  required List<ItemSyllabes> banque,
  required ServiceVoix voix,
  required NiveauTermine onTermine,
  RegistreVoix registre = const RegistreVoix.vide(),
  TirageIndice? tirage,
}) {
  switch (spec.mecanique) {
    case 'tape-la-syllabe':
      return EcranTapeLaSyllabe(
        key: key,
        spec: spec,
        banque: banque,
        voix: voix,
        registre: registre,
        onTermine: onTermine,
        tirage: tirage,
      );
    case 'boite-a-sons':
      return EcranBoiteASons(
        key: key,
        spec: spec,
        banque: banque,
        voix: voix,
        registre: registre,
        onTermine: onTermine,
        tirage: tirage,
      );
    default:
      return EcranFallbackDev(
        key: key,
        spec: spec,
        banque: banque,
        voix: voix,
        registre: registre,
        onTermine: onTermine,
        tirage: tirage,
      );
  }
}

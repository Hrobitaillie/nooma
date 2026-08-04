// Contrat commun des ÉCRANS de mécanique (couche UI).
//
// Distinct de mecanique.dart (interface pure `play` héritée du socle) : ici on décrit un
// widget de mécanique qui joue UN NiveauSpec et rend `List<ResultatEssai>` via un callback.
// Le NiveauSpec utilisé est celui du Directeur (directeur.dart), pas le stub de mecanique.dart.

import '../directeur/directeur.dart';

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

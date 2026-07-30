// Modèle de maîtrise v1 (doc 04 §3.2, acté 30/07/2026) : moyenne glissante pondérée
// + décroissance temporelle + règles de validation.
//
// Portage FIDÈLE de cadrage/simulateur/core/maitrise.ts. Le Directeur ne voit QUE ces scores —
// jamais l'état latent de l'enfant (qui n'existe que dans le simulateur, sim/enfants.ts).
// Lib PURE : aucun import Flutter/Flame. Les tests d'oracle croisé verrouillent l'équivalence
// numérique avec le simulateur (tolérance 1e-12 sur les doubles).

import 'dart:math' as math;

import 'params.dart';

/// État de maîtrise d'une compétence pour un enfant.
///
/// Objet mutable, muté en place par les fonctions ci-dessous — comme dans le simulateur,
/// où les fonctions reçoivent l'état par référence et le modifient.
class EtatCompetence {
  double maitrise; // 0..1, moyenne glissante
  int rencontres;
  final Set<int> sessionsVues; // index de sessions où la compétence a été travaillée
  int dernierJour; // dernier jour de rencontre (pour la décroissance)
  bool validee;
  int jourValidation;
  int boiteLeitner; // 0..3 → prochains rappels J+1 / J+2-3 / J+7 / J+14
  double prochainRappel; // jour du prochain écho dû
  int derniereDifficulte; // dernier cran servi (garde-fou saut ≤ 1)
  int sousCibleConsecutifs; // détection de stagnation

  EtatCompetence({
    required this.maitrise,
    required this.rencontres,
    required this.sessionsVues,
    required this.dernierJour,
    required this.validee,
    required this.jourValidation,
    required this.boiteLeitner,
    required this.prochainRappel,
    required this.derniereDifficulte,
    required this.sousCibleConsecutifs,
  });
}

/// État de départ d'une compétence jamais rencontrée.
EtatCompetence etatInitial() {
  return EtatCompetence(
    maitrise: 0,
    rencontres: 0,
    sessionsVues: <int>{},
    dernierJour: -1,
    validee: false,
    jourValidation: -1,
    boiteLeitner: 0,
    prochainRappel: -1,
    derniereDifficulte: 0,
    sousCibleConsecutifs: 0,
  );
}

/// Maîtrise « refroidie » par le temps sans rencontre — sert au tri des échos.
double maitriseEffective(EtatCompetence etat, int jour) {
  if (etat.dernierJour < 0) return 0;
  final int jours = math.max(0, jour - etat.dernierJour);
  return etat.maitrise * math.exp(-Params.decroissanceParJour * jours);
}

/// Applique une réponse (moyenne glissante pondérée, aide pénalisée).
void appliquerReponse(
  EtatCompetence etat,
  bool succes,
  bool avecAide,
  int jour,
  int session,
) {
  final double score = succes ? (avecAide ? Params.scoreAvecAide : 1) : 0;
  // On repart de la maîtrise refroidie : une longue absence se paie, comme en vrai.
  final double base = maitriseEffective(etat, jour);
  etat.maitrise = base + Params.alphaMaitrise * (score - base);
  etat.rencontres += 1;
  etat.sessionsVues.add(session);
  etat.dernierJour = jour;
}

/// Compétence validable : maîtrise ≥ seuil ET ≥ N rencontres sur ≥ 2 sessions.
bool estValidable(EtatCompetence etat) {
  return !etat.validee &&
      etat.maitrise >= Params.seuilValidation &&
      etat.rencontres >= Params.rencontresMin &&
      etat.sessionsVues.length >= Params.sessionsDistinctesMin;
}

/// Marque la compétence comme validée et arme le premier écho (Leitner).
void valider(EtatCompetence etat, int jour) {
  etat.validee = true;
  etat.jourValidation = jour;
  etat.boiteLeitner = 0;
  etat.prochainRappel = jour + Params.leitnerJours[0];
}

/// Écho réussi → boîte suivante ; raté → retour boîte 0 (Leitner).
void appliquerEcho(EtatCompetence etat, bool succes, int jour) {
  if (succes) {
    etat.boiteLeitner =
        math.min(etat.boiteLeitner + 1, Params.leitnerJours.length - 1);
  } else {
    etat.boiteLeitner = 0;
  }
  etat.prochainRappel = jour + Params.leitnerJours[etat.boiteLeitner];
}

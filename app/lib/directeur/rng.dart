// RNG déterministe (splitmix32) — même seed ⇒ même simulation, exigence du doc 04 §8.
//
// Portage FIDÈLE de cadrage/simulateur/core/rng.ts (oracle de non-régression, doc 06 §4).
// En Dart, les entiers sont 64 bits (voire arbitraires en compilation web/JS) : on force
// donc l'arithmétique 32 bits non signée avec « & 0xFFFFFFFF » et un imul32 explicite pour
// reproduire EXACTEMENT les >>> et Math.imul de JavaScript. Les tests d'oracle croisé
// (test/directeur/rng_test.dart) verrouillent l'équivalence bit à bit avec le simulateur.

/// Générateur de doubles dans [0, 1). Un appel avance l'état interne.
typedef Rng = double Function();

const int _mask32 = 0xFFFFFFFF;

/// Multiplication 32 bits non signée, équivalent de `Math.imul` en JS.
int _imul32(int a, int b) {
  final int aLo = a & 0xFFFF;
  final int aHi = (a >> 16) & 0xFFFF;
  final int bLo = b & 0xFFFF;
  // (aLo*bLo) + (((aHi*bLo + aLo*bHi) << 16)) tronqué à 32 bits.
  final int lo = aLo * bLo;
  final int mid = ((aHi * bLo) + (aLo * ((b >> 16) & 0xFFFF))) & _mask32;
  return (lo + ((mid << 16) & _mask32)) & _mask32;
}

/// splitmix32 : même seed ⇒ même suite de tirages.
Rng splitmix32(int seed) {
  int s = seed & _mask32;
  return () {
    s = (s + 0x9e3779b9) & _mask32;
    int z = s;
    z = _imul32(z ^ (z >> 16), 0x21f0aaad);
    z = _imul32(z ^ (z >> 15), 0x735a2d97);
    z = z ^ (z >> 15);
    return (z & _mask32) / 4294967296;
  };
}

/// Hachage FNV-1a 32 bits d'une chaîne (utilisé pour dériver un seed d'un identifiant).
int hashString(String str) {
  int h = 2166136261;
  for (int i = 0; i < str.length; i++) {
    h ^= str.codeUnitAt(i);
    h = _imul32(h, 16777619);
  }
  return h & _mask32;
}

/// Tirage uniforme dans une liste non vide.
T pick<T>(Rng rng, List<T> arr) {
  return arr[(rng() * arr.length).floor()];
}

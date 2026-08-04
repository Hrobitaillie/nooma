// Vue « Documentation » — la SEULE vue qui reste une iframe (app à part : le viewer
// de cadrage). L'iframe est créée une fois puis conservée dans le module ; à chaque
// remontage on ré-attache le MÊME élément, donc l'état du viewer (position, onglet…)
// survit à un aller-retour vers une autre vue dans la même session de page.

export const titre = 'Documentation';

const URL_VIEWER = '/cadrage/viewer/';
let cadre = null;

export function monter(hote) {
  if (!cadre) {
    cadre = document.createElement('iframe');
    cadre.className = 'docs-cadre';
    cadre.title = 'Documentation projet';
    cadre.src = URL_VIEWER;
  }
  hote.innerHTML = '';
  hote.append(cadre); // ré-attache l'iframe existante : pas de rechargement
}

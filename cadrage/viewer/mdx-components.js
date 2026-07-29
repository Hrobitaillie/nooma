// Composants injectés dans le MDX rendu. Mêmes composants à l'écran et au PDF.
import { html } from 'htm/preact';
import { Est } from './src/estimations/Est.js?v=1785320225';
import { EstOptions } from './src/estimations/EstOptions.js?v=1785320225';
import { TotauxFichier } from './src/estimations/TotauxFichier.js?v=1785320225';
import { TotauxGlobaux } from './src/estimations/TotauxGlobaux.js?v=1785320225';
import { Lots } from './src/estimations/Lots.js?v=1785320225';
import { Lot } from './src/estimations/Lot.js?v=1785320225';
import { ContenuLots } from './src/estimations/ContenuLots.js?v=1785320225';

// Les tableaux markdown défilent horizontalement quand ils débordent.
function ScrollTable(props) {
  return html`<div class="table-scroll"><table ...${props} /></div>`;
}

export const mdxComponents = {
  table: ScrollTable,
  Est,
  EstOptions,
  TotauxFichier,
  TotauxGlobaux,
  Lots,
  Lot,
  ContenuLots,
};

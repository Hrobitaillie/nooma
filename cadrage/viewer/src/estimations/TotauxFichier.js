// Total des estimations du fichier courant. <TotauxFichier/>
// Réactif aux overrides ; VENTILÉ PAR LOT (V1 = lot par défaut).
import { html } from 'htm/preact';
import { useContext } from 'preact/hooks';
import { EstContext } from './provider.js?v=1785320225';
import { useStore } from '../store.js?v=1785320225';
import { fileRange, foldUnknownLots } from './data.js?v=1785320225';
import { fmtJBetween, fmtHBetween } from './format.js?v=1785320225';

export function TotauxFichier() {
  const { fileKey, data } = useContext(EstContext);
  const overrides = useStore((s) => s.estimations[fileKey]);
  const lots = useStore((s) => s.lots);
  const entry = fileKey ? data.files[fileKey] : null;
  if (!entry || !entry.entries.length) {
    return html`<p class="est-total est-total--empty">Aucune estimation sur cette page.</p>`;
  }
  const { byLot, nb, nbDone } = fileRange(entry.entries, overrides);
  const folded = foldUnknownLots(byLot, lots);
  const v1 = folded.v1 || { min: 0, max: 0, nb: 0 };
  const others = lots.filter((l) => l.id !== 'v1' && folded[l.id]);
  const ventile = others.length > 0;
  return html`<div>
    ${v1.nb > 0 || !ventile
      ? html`<p class="est-total">
          ${'Total du fichier' + (ventile ? ' (V1)' : '') + ' : '}<strong>${fmtJBetween(v1.min, v1.max)}</strong>
          <span class="est-total__h">${'/ ' + fmtHBetween(v1.min, v1.max)}</span>
          <span class="est-total__count">${' (' + nbDone + '/' + nb + ' poste' + (nb > 1 ? 's' : '') + ' estimé' + (nbDone > 1 ? 's' : '') + ')'}</span>
        </p>`
      : null}
    ${others.map(
      (l) => html`<p class="est-total est-total--lot" key=${l.id}>
        ${'Lot ' + l.label + ' : '}<strong>${fmtJBetween(folded[l.id].min, folded[l.id].max)}</strong>
        <span class="est-total__h">${'/ ' + fmtHBetween(folded[l.id].min, folded[l.id].max)}</span>
        <span class="est-total__count">${' (' + folded[l.id].nb + ' valeur' + (folded[l.id].nb > 1 ? 's' : '') + ')'}</span>
      </p>`
    )}
  </div>`;
}

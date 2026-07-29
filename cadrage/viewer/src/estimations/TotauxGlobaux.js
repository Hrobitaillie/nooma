// Tableau récapitulatif global : fourchette de temps par module (jours + heures),
// VENTILÉ PAR LOT (V1 = lot par défaut, toujours inclus). Le total est MODULABLE :
// une ligne cochable par lot permet de l'inclure ou non dans le « Total retenu ».
// <TotauxGlobaux/>
import { html } from 'htm/preact';
import { useContext, useState } from 'preact/hooks';
import { EstContext } from './provider.js?v=1785320225';
import { useStore } from '../store.js?v=1785320225';
import { fileRange, foldUnknownLots } from './data.js?v=1785320225';
import { DOCS_TREE, CATALOGUE_TREE } from '../../tree.js?v=1785320225';
import { fmtJBetween, fmtHBetween } from './format.js?v=1785320225';

function flatten(tree, space, trail = []) {
  const out = [];
  for (const node of tree) {
    if (node.type === 'page') out.push({ key: space + '/' + node.path, label: node.label });
    else if (node.children) out.push(...flatten(node.children, space, trail));
  }
  return out;
}

const GROUPS = [
  { space: 'catalogue', label: 'Catalogue de fonctionnalités', tree: CATALOGUE_TREE },
  { space: 'docs', label: 'Docs projet', tree: DOCS_TREE },
];

export function TotauxGlobaux() {
  const { data } = useContext(EstContext);
  const allOverrides = useStore((s) => s.estimations);
  const lots = useStore((s) => s.lots);
  // Lots cochés (inclus dans le « Total retenu »). V1 l'est toujours.
  const [included, setIncluded] = useState({});
  const toggle = (k) => setIncluded((s) => ({ ...s, [k]: !s[k] }));

  const lotLabel = (id) => (lots.find((l) => l.id === id) || { label: id }).label;

  const bodies = [];
  const grand = {}; // lotId -> {min,max} cumulés tous modules

  for (const { space, label: spaceLabel, tree } of GROUPS) {
    const pages = flatten(tree, space).filter((p) => data.files[p.key]);
    if (!pages.length) continue;
    let sMin = 0;
    let sMax = 0;
    const rows = pages.map((p) => {
      const { byLot } = fileRange(data.files[p.key].entries, allOverrides[p.key]);
      const folded = foldUnknownLots(byLot, lots);
      const v1 = folded.v1 || { min: 0, max: 0 };
      sMin += v1.min;
      sMax += v1.max;
      const extras = [];
      for (const l of lots) {
        if (l.id === 'v1' || !folded[l.id]) continue;
        const g = grand[l.id] || (grand[l.id] = { min: 0, max: 0 });
        g.min += folded[l.id].min;
        g.max += folded[l.id].max;
        extras.push(`${l.label} : ${fmtJBetween(folded[l.id].min, folded[l.id].max)}`);
      }
      // Page 100 % hors V1 (ex. module Moodboard) : ligne dédiée.
      if (!v1.max && !v1.min && extras.length) {
        return html`<tr class="est-table__option" key=${p.key}>
          <td>${p.label}</td>
          <td colspan="2">${extras.join(' · ') + ' '}<span class="est-table__optnote">${'(hors V1)'}</span></td>
        </tr>`;
      }
      return html`<tr key=${p.key}>
        <td>${p.label}${extras.length ? html`<span class="est-table__optnote">${' (+ ' + extras.join(' · ') + ')'}</span>` : ''}</td>
        <td>${fmtJBetween(v1.min, v1.max)}</td>
        <td>${fmtHBetween(v1.min, v1.max)}</td>
      </tr>`;
    });
    const gv1 = grand.v1 || (grand.v1 = { min: 0, max: 0 });
    gv1.min += sMin;
    gv1.max += sMax;
    bodies.push(html`<tbody class="est-table__group" key=${space}>
      <tr class="est-table__space"><th colspan="3">${spaceLabel}</th></tr>
      ${rows}
      <tr class="est-table__subtotal">
        <td>${'Sous-total ' + spaceLabel + ' (V1)'}</td>
        <td>${fmtJBetween(sMin, sMax)}</td>
        <td>${fmtHBetween(sMin, sMax)}</td>
      </tr>
    </tbody>`);
  }

  if (!bodies.length) {
    return html`<p class="est-total est-total--empty">Aucune estimation renseignée pour le moment.</p>`;
  }

  const v1Total = grand.v1 || { min: 0, max: 0 };
  const otherLots = lots.filter((l) => l.id !== 'v1' && grand[l.id]);

  let rMin = v1Total.min;
  let rMax = v1Total.max;
  for (const l of otherLots) {
    if (included[l.id]) {
      rMin += grand[l.id].min;
      rMax += grand[l.id].max;
    }
  }

  return html`<div class="table-scroll"><table class="est-table">
    <thead><tr><th>Module</th><th>Jours</th><th>Heures</th></tr></thead>
    ${bodies}
    <tfoot>
      <tr>
        <th>${'Total ' + lotLabel('v1')}</th>
        <th>${fmtJBetween(v1Total.min, v1Total.max)}</th>
        <th>${fmtHBetween(v1Total.min, v1Total.max)}</th>
      </tr>
      ${otherLots.map(
        (l) => html`<tr class="est-table__bucket" key=${l.id}>
          <th>
            <label class="est-table__bucket-toggle">
              <input type="checkbox" checked=${!!included[l.id]} onChange=${() => toggle(l.id)} />
              <span>${' Lot ' + l.label + ' '}</span><span class="est-table__optnote">(cocher pour inclure)</span>
            </label>
          </th>
          <th>${fmtJBetween(grand[l.id].min, grand[l.id].max)}</th>
          <th>${fmtHBetween(grand[l.id].min, grand[l.id].max)}</th>
        </tr>`
      )}
      ${otherLots.length
        ? html`<tr class="est-table__grand">
            <th>Total retenu</th>
            <th>${fmtJBetween(rMin, rMax)}</th>
            <th>${fmtHBetween(rMin, rMax)}</th>
          </tr>`
        : null}
    </tfoot>
  </table></div>`;
}

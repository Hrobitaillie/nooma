// Contenu détaillé de chaque LOT : un tableau par lot listant les postes et
// options qui lui sont affectés (module, poste, temps) + sous-total.
// <ContenuLots/> — page Chiffrage, sous le tableau récapitulatif.
import { html } from 'htm/preact';
import { useContext } from 'preact/hooks';
import { EstContext } from './provider.js?v=1785320225';
import { useStore } from '../store.js?v=1785320225';
import { optionsOf } from './data.js?v=1785320225';
import { parseEst } from './parseEst.js?v=1785320225';
import { fmtJ, fmtH, fmtJBetween, fmtHBetween } from './format.js?v=1785320225';
import { DOCS_TREE, CATALOGUE_TREE } from '../../tree.js?v=1785320225';

function flatten(tree, space) {
  const out = [];
  for (const node of tree) {
    if (node.type === 'page') out.push({ key: space + '/' + node.path, label: node.label });
    else if (node.children) out.push(...flatten(node.children, space));
  }
  return out;
}

const PAGES = [...flatten(CATALOGUE_TREE, 'catalogue'), ...flatten(DOCS_TREE, 'docs')];

export function ContenuLots() {
  const { data } = useContext(EstContext);
  const allOverrides = useStore((s) => s.estimations);
  const lots = useStore((s) => s.lots);

  // lotId -> [{module, code, title, optLabel, minutes, todo}]
  const byLot = {};
  for (const page of PAGES) {
    const entry = data.files[page.key];
    if (!entry) continue;
    const overrides = allOverrides[page.key];
    for (const e of entry.entries) {
      const opts = optionsOf(overrides ? overrides[e.code] : undefined, e.raw);
      for (const o of opts) {
        const p = parseEst(o.value);
        const lotId = o.lot || 'v1';
        (byLot[lotId] || (byLot[lotId] = [])).push({
          module: page.label,
          poste: page.key + '/' + e.code,
          code: e.code,
          title: (entry.titles && entry.titles[e.code]) || '',
          optLabel: o.label || '',
          minutes: Number.isFinite(p.minutes) ? p.minutes : 0,
          todo: !p.valid || p.todo,
        });
      }
    }
  }

  return html`<div class="lot-detail">
    ${lots.map((l) => {
      const items = byLot[l.id] || [];
      if (!items.length) return null;
      // Même méthode que le récap : plusieurs options d'un MÊME poste dans le
      // lot -> fourchette min–max ; le total du lot somme ces fourchettes.
      const perPoste = {};
      for (const it of items) {
        const b = perPoste[it.poste] || (perPoste[it.poste] = { min: Infinity, max: 0 });
        if (it.minutes < b.min) b.min = it.minutes;
        if (it.minutes > b.max) b.max = it.minutes;
      }
      let totalMin = 0;
      let totalMax = 0;
      for (const k of Object.keys(perPoste)) {
        totalMin += Number.isFinite(perPoste[k].min) ? perPoste[k].min : 0;
        totalMax += perPoste[k].max;
      }
      return html`<details class="lot-detail__block" key=${l.id} open=${l.id !== 'v1'}>
        <summary class="lot-detail__summary">
          <span class="lot-badge">${l.label}</span>
          <span class="lot-detail__meta">${items.length + ' poste' + (items.length > 1 ? 's' : '') + ' · ' + fmtJBetween(totalMin, totalMax) + ' / ' + fmtHBetween(totalMin, totalMax)}</span>
        </summary>
        <div class="table-scroll"><table class="est-table est-table--lot-detail">
          <thead><tr><th>Module</th><th>Poste</th><th>Jours</th><th>Heures</th></tr></thead>
          <tbody>
            ${items.map(
              (it, i) => html`<tr key=${l.id + '-' + it.code + '-' + i}>
                <td>${it.module}</td>
                <td>
                  <span class="lot-detail__code">${it.code}</span>
                  <span>${' ' + (it.title || '')}</span>
                  ${it.optLabel ? html`<span class="est-table__optnote">${' — ' + it.optLabel}</span>` : ''}
                </td>
                <td>${it.todo ? 'à estimer' : fmtJ(it.minutes)}</td>
                <td>${it.todo ? '—' : fmtH(it.minutes)}</td>
              </tr>`
            )}
          </tbody>
          <tfoot><tr>
            <th colspan="2">${'Total ' + l.label}</th>
            <th>${fmtJBetween(totalMin, totalMax)}</th>
            <th>${fmtHBetween(totalMin, totalMax)}</th>
          </tr></tfoot>
        </table></div>
      </details>`;
    })}
  </div>`;
}

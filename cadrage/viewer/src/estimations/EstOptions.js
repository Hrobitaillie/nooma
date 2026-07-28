// Affiche la liste des options d'une fonctionnalité (nom + détail + temps), pour
// les fonctionnalités « à options » (ex. seconde main).
// <EstOptions code="BOU-05" />  — lecture seule ; l'édition se fait via la puce.

import { html } from 'htm/preact';
import { useContext } from 'preact/hooks';
import { EstContext } from './provider.js?v=1';
import { useStore } from '../store.js?v=1';
import { optionsOf } from './data.js?v=1';
import { parseEst } from './parseEst.js?v=1';
import { fmtJ, fmtH } from './format.js?v=1';

export function EstOptions({ code, title }) {
  const { fileKey, data } = useContext(EstContext);
  const override = useStore((s) => (code && s.estimations[fileKey] ? s.estimations[fileKey][code] : undefined));
  const lots = useStore((s) => s.lots);

  let authored;
  if (code && data && data.files[fileKey]) {
    const e = data.files[fileKey].entries.find((x) => x.code === code);
    if (e) authored = e.raw;
  }
  const opts = optionsOf(override, authored);
  const multi = Array.isArray(override) && override.length > 1;
  if (!multi) return null; // rien à montrer tant qu'il n'y a pas plusieurs options

  return html`<div class="est-options">
    <div class="est-options__head">${title || 'Options'}</div>
    ${opts.map((o, i) => {
      const p = parseEst(o.value);
      const min = Number.isFinite(p.minutes) ? p.minutes : 0;
      const lotId = o.lot || 'v1';
      const lotLabel = lotId !== 'v1' ? (lots.find((l) => l.id === lotId) || { label: lotId }).label : null;
      return html`<div class="est-options__item">
        <div class="est-options__top">
          <span class="est-options__label">${o.label || 'Option ' + (i + 1)}${lotLabel
            ? html`<span class="est-chip__option-badge est-options__lot">${lotLabel}</span>`
            : ''}</span>
          <span class="est-options__price">${fmtJ(min)} · ${fmtH(min)}</span>
        </div>
        ${o.detail ? html`<p class="est-options__detail">${o.detail}</p>` : null}
      </div>`;
    })}
  </div>`;
}

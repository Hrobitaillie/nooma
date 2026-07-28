// Badge/sélecteur du LOT d'une fonctionnalité. <Lot code="CAT-16"/>
// Affiche le lot réel du poste (source : estimations.json), connecté au reste :
//  - poste à valeur simple -> sélecteur inline (changer le lot ici = partout) ;
//  - poste à plusieurs options -> badges des lots des options (édition via la
//    puce d'estimation, chaque option portant son propre lot).
import { html } from 'htm/preact';
import { useContext } from 'preact/hooks';
import { EstContext } from './provider.js?v=1';
import { useStore, setEstimation, addLot } from '../store.js?v=1';
import { optionsOf } from './data.js?v=1';

const NEW_LOT = '__new__';

export function Lot({ code }) {
  const { fileKey, data } = useContext(EstContext);
  const override = useStore((s) => (code && s.estimations[fileKey] ? s.estimations[fileKey][code] : undefined));
  const lots = useStore((s) => s.lots);

  // Valeur .mdx de secours (comme la puce <Est/>).
  let authored;
  if (code && data && data.files[fileKey]) {
    const e = data.files[fileKey].entries.find((x) => x.code === code);
    if (e) authored = e.raw;
  }
  const opts = optionsOf(override, authored);
  const labelOf = (id) => (lots.find((l) => l.id === id) || { label: id }).label;

  // Plusieurs options -> un badge par lot distinct (lecture ; édition via la puce).
  if (opts.length > 1) {
    const ids = [...new Set(opts.map((o) => o.lot || 'v1'))];
    return html`<span class="lot-badges" title="Lots des options — modifiables via la puce d'estimation">
      ${ids.map((id) => html`<span key=${id} class="lot-badge lot-badge--ro">${labelOf(id)}</span>`)}
    </span>`;
  }

  // Valeur simple -> sélecteur direct.
  const cur = opts.length ? opts[0].lot || 'v1' : 'v1';
  function onChange(e) {
    let id = e.currentTarget.value;
    if (id === NEW_LOT) {
      const name = window.prompt('Nom du nouveau lot (ex. V2, Options…)');
      id = name ? addLot(name) : null;
      if (!id) {
        e.currentTarget.value = cur;
        return;
      }
    }
    const base = opts.length ? opts[0] : { label: '', detail: '', value: '' };
    setEstimation(fileKey, code, [
      { label: base.label || '', detail: base.detail || '', value: String(base.value || '').trim(), lot: id },
    ]);
  }
  return html`<select class="lot-badge lot-badge--select" value=${cur} onChange=${onChange} title="Lot de cette fonctionnalité — modifie le chiffrage">
    ${lots.map((l) => html`<option value=${l.id}>${l.label}</option>`)}
    <option value=${NEW_LOT}>+ Nouveau lot…</option>
  </select>`;
}

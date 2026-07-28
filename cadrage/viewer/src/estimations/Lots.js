// Gestionnaire des LOTS de chiffrage. <Lots/>
// Les lots (V1, V2, Options…) sont des entités créables/renommables/supprimables,
// persistées dans estimations.json (clé __lots). V1 est le lot par défaut,
// verrouillé. Chaque estimation / option est rattachée à un lot via l'éditeur
// de puce <Est/> ; supprimer un lot fait retomber ses affectations en V1.
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { useStore, addLot, renameLot, deleteLot } from '../store.js?v=1';
import { optionsOf } from './data.js?v=1';

// Nombre de valeurs (postes simples + options) actuellement rattachées au lot.
function countUses(lotId, estimations) {
  let n = 0;
  for (const fileKey of Object.keys(estimations)) {
    for (const code of Object.keys(estimations[fileKey])) {
      for (const o of optionsOf(estimations[fileKey][code], null)) {
        if ((o.lot || 'v1') === lotId) n += 1;
      }
    }
  }
  return n;
}

export function Lots() {
  const lots = useStore((s) => s.lots);
  const estimations = useStore((s) => s.estimations);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null); // id du lot en cours de renommage

  function submitNew(e) {
    e.preventDefault();
    if (addLot(draft)) setDraft('');
  }
  function remove(l) {
    const uses = countUses(l.id, estimations);
    const msg = uses
      ? `Supprimer le lot « ${l.label} » ? ${uses} affectation${uses > 1 ? 's' : ''} retombera${uses > 1 ? 'ont' : ''} en V1.`
      : `Supprimer le lot « ${l.label} » ?`;
    if (window.confirm(msg)) deleteLot(l.id);
  }

  return html`<div class="lots">
    <div class="lots__head">Lots de chiffrage</div>
    <ul class="lots__list">
      ${lots.map((l) => {
        const uses = countUses(l.id, estimations);
        return html`<li class="lots__item" key=${l.id}>
          ${editing === l.id
            ? html`<input
                class="lots__rename"
                value=${l.label}
                autoFocus
                onBlur=${(e) => {
                  renameLot(l.id, e.currentTarget.value);
                  setEditing(null);
                }}
                onKeyDown=${(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />`
            : html`<span class="lots__label" title="Cliquer pour renommer" onClick=${() => setEditing(l.id)}>
                ${l.label}
              </span>`}
          <span class="lots__count">${uses ? uses + ' affectation' + (uses > 1 ? 's' : '') : '—'}</span>
          ${l.id === 'v1'
            ? html`<span class="lots__default">défaut</span>`
            : html`<button type="button" class="lots__del" title="Supprimer ce lot" onClick=${() => remove(l)}>✕</button>`}
        </li>`;
      })}
    </ul>
    <form class="lots__add" onSubmit=${submitNew}>
      <input
        placeholder="Nouveau lot (ex. V2, Options…)"
        value=${draft}
        onInput=${(e) => setDraft(e.currentTarget.value)}
      />
      <button type="submit">Ajouter</button>
    </form>
  </div>`;
}

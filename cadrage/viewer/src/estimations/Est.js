// Champ d'estimation « charté » inline et ÉDITABLE. <Est value="2h" code="CAT-01"/>
// Une fonctionnalité peut avoir UNE valeur simple OU PLUSIEURS options (label +
// temps) -> la puce affiche alors une fourchette « min – max ». Chaque valeur /
// option est rattachée à un LOT de chiffrage (v1 par défaut) — sélecteur dans
// l'éditeur, création de lot à la volée. Le choix est un « override » stocké
// dans estimations.json (string, {value, lot} ou tableau d'options).
// Sans `code`, la puce n'est pas éditable.

import { html } from 'htm/preact';
import { useContext, useState, useRef, useEffect } from 'preact/hooks';
import { EstContext } from './provider.js?v=1785320225';
import { useStore, setEstimation, addLot } from '../store.js?v=1785320225';
import { parseEst } from './parseEst.js?v=1785320225';
import { fmtChip, fmtChipRange } from './format.js?v=1785320225';
import { optionsOf, codeRange } from './data.js?v=1785320225';

// Valeurs proposées pour le sélecteur de temps.
const PRESETS = [
  { v: '', label: 'à estimer' },
  { v: '30m', label: '30 min' },
  { v: '1h', label: '1 h' },
  { v: '2h', label: '2 h' },
  { v: '3h', label: '3 h' },
  { v: '4h', label: '4 h' },
  { v: '0,5j', label: '0,5 J' },
  { v: '1j', label: '1 J' },
  { v: '1,5j', label: '1,5 J' },
  { v: '2j', label: '2 J' },
  { v: '3j', label: '3 J' },
  { v: '5j', label: '5 J' },
  { v: '8j', label: '8 J' },
  { v: '10j', label: '10 J' },
];

const NEW_LOT = '__new__';

// Ancre CSS unique par instance (l'API Anchor résout un nom partagé vers la
// dernière ancre du document, pas la plus proche).
let anchorSeq = 0;

function normVal(v) {
  const p = parseEst(v);
  return p.valid && !p.todo ? String(v).trim() : '';
}

export function Est({ value, code }) {
  const { fileKey, data } = useContext(EstContext);
  const override = useStore((s) => (code && s.estimations[fileKey] ? s.estimations[fileKey][code] : undefined));
  const lots = useStore((s) => s.lots);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null); // copie de travail de l'éditeur
  const wrapRef = useRef(null);
  const editorRef = useRef(null);
  const anchorName = useRef('--est-a' + ++anchorSeq).current;

  // Valeur .mdx de secours (puce de tableau sans `value` -> valeur de la fiche).
  let authored;
  if (value == null && code && data && data.files[fileKey]) {
    const e = data.files[fileKey].entries.find((x) => x.code === code);
    if (e) authored = e.raw;
  }
  const fallback = value != null ? value : authored;
  const range = codeRange(override, fallback);

  // Fallback de positionnement pour les navigateurs SANS CSS Anchor API
  // (le CSS gère le cas supporté) : rabat l'éditeur à droite / au-dessus de la
  // puce s'il déborderait du viewport.
  const hasAnchorApi =
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('anchor-name: --a') && CSS.supports('position-area: block-end');
  useEffect(() => {
    if (!open || hasAnchorApi) return undefined;
    const el = editorRef.current;
    if (!el) return undefined;
    function place() {
      el.style.left = '0px';
      el.style.right = 'auto';
      el.style.top = 'calc(100% + 4px)';
      el.style.bottom = 'auto';
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      if (r.right > vw - 8) {
        el.style.left = 'auto';
        el.style.right = '0px';
      }
      if (r.bottom > vh - 8 && r.height + 8 < (wrapRef.current ? wrapRef.current.getBoundingClientRect().top : vh)) {
        el.style.top = 'auto';
        el.style.bottom = 'calc(100% + 4px)';
      }
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, hasAnchorApi]);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openEditor() {
    const opts = optionsOf(override, fallback);
    setRows(
      opts.length
        ? opts.map((o) => ({ label: o.label || '', detail: o.detail || '', value: normVal(o.value), lot: o.lot || 'v1' }))
        : [{ label: '', detail: '', value: '', lot: 'v1' }]
    );
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setRows(null);
  }
  function apply(next) {
    setRows(next);
    setEstimation(fileKey, code, next); // le store normalise (string / {value,lot} / options / vide)
  }
  // Sélection d'un lot sur la ligne i ; « + Nouveau lot… » le crée à la volée.
  function pickLot(i, v) {
    let lotId = v;
    if (v === NEW_LOT) {
      const name = window.prompt('Nom du nouveau lot (ex. V2, Options…)');
      lotId = name ? addLot(name) : null;
      if (!lotId) return;
    }
    apply(rows.map((x, j) => (j === i ? { ...x, lot: lotId } : x)));
  }

  // --- Puce (fermée) ---
  let cls = 'est-chip';
  let label;
  if (range.count > 1) {
    cls += ' est-chip--range';
    label = fmtChipRange(range.min, range.max);
  } else {
    const single = optionsOf(override, fallback)[0];
    const p = parseEst(single ? single.value : fallback);
    if (!p.valid) {
      cls += ' est-chip--error';
      label = String(single ? single.value : fallback);
    } else if (p.todo) {
      cls += ' est-chip--todo';
      label = 'à estimer';
    } else {
      label = fmtChip(p.minutes);
    }
  }
  if (code) cls += ' est-chip--editable';
  // Badge de lot : toutes les valeurs du poste dans un même lot ≠ v1.
  const chipLots = Object.keys(range.byLot || {});
  const chipLotId = chipLots.length === 1 && chipLots[0] !== 'v1' ? chipLots[0] : null;
  const chipLotLabel = chipLotId ? (lots.find((l) => l.id === chipLotId) || { label: chipLotId }).label : null;
  if (chipLotLabel) cls += ' est-chip--lot';

  const chip = html`<span
    class=${cls}
    style=${code ? 'anchor-name: ' + anchorName : undefined}
    data-min=${range.min}
    data-max=${range.max}
    data-code=${code || undefined}
    title=${code ? 'Cliquer pour estimer / ajouter des options' : label}
    onClick=${code ? () => (open ? close() : openEditor()) : undefined}
  >${label}${range.count > 1 ? html`<span class="est-chip__opts">${range.count} opt.</span>` : ''}${chipLotLabel
    ? html`<span class="est-chip__option-badge">${chipLotLabel}</span>`
    : ''}</span>`;

  if (!code) return chip;

  // Vue SIMPLE (une seule valeur, sans libellé/détail) : juste le temps + le lot.
  // La vue AVANCÉE (cartes d'options nommées) n'apparaît qu'à partir de 2 lignes
  // — le bouton « + Ajouter une option » fait la bascule.
  const simple = rows && rows.length === 1 && !rows[0].label && !rows[0].detail;
  const addOption = () => apply(rows.concat({ label: '', detail: '', value: '', lot: 'v1' }));

  return html`<span class="est-wrap" ref=${wrapRef}>
    ${chip}
    ${open && rows
      ? html`<div class=${'est-editor' + (simple ? '' : ' est-editor--multi')} ref=${editorRef} style=${'position-anchor: ' + anchorName}>
          <div class="est-editor__head">Estimation ${code}</div>
          ${simple
            ? html`<div class="est-opt-row est-opt-row--simple">
                <select
                  class="est-opt-val"
                  value=${rows[0].value}
                  onChange=${(e) => apply([{ ...rows[0], value: e.currentTarget.value }])}
                >
                  ${PRESETS.map((pp) => html`<option value=${pp.v}>${pp.label}</option>`)}
                </select>
                <select
                  class="est-opt-lot"
                  title="Lot de chiffrage"
                  value=${rows[0].lot || 'v1'}
                  onChange=${(e) => pickLot(0, e.currentTarget.value)}
                >
                  ${lots.map((l) => html`<option value=${l.id}>${l.label}</option>`)}
                  <option value=${NEW_LOT}>+ Nouveau lot…</option>
                </select>
              </div>`
            : rows.map(
                (r, i) => html`<div class="est-opt-card">
                  <div class="est-opt-row">
                    <input
                      class="est-opt-label"
                      placeholder="Nom de l’option"
                      value=${r.label}
                      onInput=${(e) => apply(rows.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)))}
                    />
                    <select
                      class="est-opt-val"
                      value=${r.value}
                      onChange=${(e) => apply(rows.map((x, j) => (j === i ? { ...x, value: e.currentTarget.value } : x)))}
                    >
                      ${PRESETS.map((pp) => html`<option value=${pp.v}>${pp.label}</option>`)}
                    </select>
                    <select
                      class="est-opt-lot"
                      title="Lot de chiffrage de cette option"
                      value=${r.lot || 'v1'}
                      onChange=${(e) => pickLot(i, e.currentTarget.value)}
                    >
                      ${lots.map((l) => html`<option value=${l.id}>${l.label}</option>`)}
                      <option value=${NEW_LOT}>+ Nouveau lot…</option>
                    </select>
                    <button
                      type="button"
                      class="est-opt-del"
                      title="Retirer cette option"
                      onClick=${() => apply(rows.filter((_, j) => j !== i))}
                    >✕</button>
                  </div>
                  <input
                    class="est-opt-detail"
                    placeholder="Détail : ce que couvre cette option"
                    value=${r.detail}
                    onInput=${(e) => apply(rows.map((x, j) => (j === i ? { ...x, detail: e.currentTarget.value } : x)))}
                  />
                </div>`
              )}
          <button type="button" class="est-opt-add" onClick=${addOption}>
            + Ajouter une option
          </button>
        </div>`
      : null}
  </span>`;
}

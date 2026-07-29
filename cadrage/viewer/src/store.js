// Store applicatif minimal (pub/sub) — pas de dépendance externe.
// Détient l'état des commentaires, du mode commentaire et de la localisation
// courante. La persistance se fait vers l'endpoint local /__api/comments.

import { useState, useEffect } from 'preact/hooks';

// Endpoints PHP locaux (même dossier viewer/), servent et écrivent les JSON.
const COMMENTS_URL = 'comments.php';
const EST_URL = 'estimations.php';

let state = {
  location: { space: 'catalogue', path: 'README.mdx' },
  renderNonce: 0, // incrémenté après chaque rendu MDX -> re-localisation des surlignages
  comments: [], // tous les commentaires (tous fichiers)
  loaded: false,
  commentMode: false,
  activeId: null,
  draft: null, // { anchor, rect } d'un nouveau commentaire en cours
  saveState: 'idle', // 'idle' | 'saving' | 'error'
  statuses: {}, // id -> 'resolved' | 'orphan' (runtime, après re-localisation)
  diffTarget: null, // id du commentaire traité dont on affiche la diff dans le corps (null = doc normale)
  diffScrollIdx: null, // motif (index de change) ciblé pour le défilement au prochain rendu de révision
  estimations: {}, // overrides saisis dans l'UI : fileKey -> { code: "valeur" }
  lots: [{ id: 'v1', label: 'V1' }], // registre des lots de chiffrage (v1 = défaut, réservé)
  estSaveState: 'idle',
  recapOverride: null, // null = auto (ouvert si commentaires/mode actif) ; true/false = forcé
};

const subs = new Set();

function emit() {
  for (const f of subs) f(state);
}

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  emit();
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// --- Hook Preact ----------------------------------------------------------
export function useStore(selector = (s) => s) {
  const [v, setV] = useState(() => selector(state));
  useEffect(() => subscribe((s) => setV(selector(s))), []);
  return v;
}

// --- Identifiants ---------------------------------------------------------
let seq = 0;
export function newId() {
  seq += 1;
  return 'c_' + Date.now().toString(36) + '_' + seq.toString(36);
}

// --- Sélecteurs -----------------------------------------------------------
function sameFile(a, b) {
  // Compare sans extension : 01-catalogue.md ≡ 01-catalogue.mdx
  const strip = (p) => p.replace(/\.mdx?$/, '');
  return strip(a) === strip(b);
}

export function commentsForCurrentPage(s = state) {
  const { space, path } = s.location;
  return s.comments.filter((c) => c.space === space && sameFile(c.file, path));
}

// --- Persistance ----------------------------------------------------------
let saveTimer = null;

export async function loadComments() {
  try {
    const res = await fetch(COMMENTS_URL, { cache: 'no-store' });
    const data = res.ok ? await res.json() : { comments: [] };
    setState({ comments: Array.isArray(data.comments) ? data.comments : [], loaded: true });
  } catch (e) {
    setState({ comments: [], loaded: true });
  }
}

function scheduleSave() {
  setState({ saveState: 'saving' });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 300);
}

export async function persistNow() {
  clearTimeout(saveTimer);
  const payload = {
    version: 1,
    // On ne persiste pas le champ runtime `status`.
    comments: state.comments.map(({ status, ...c }) => c),
  };
  try {
    const res = await fetch(COMMENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setState({ saveState: res.ok ? 'idle' : 'error' });
  } catch (e) {
    setState({ saveState: 'error' });
  }
}

// --- Mutations ------------------------------------------------------------
export function addComment(comment) {
  setState((s) => ({ comments: s.comments.concat(comment), activeId: comment.id }));
  scheduleSave();
}

export function updateComment(id, patch) {
  setState((s) => ({
    comments: s.comments.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)),
  }));
  scheduleSave();
}

export function deleteComment(id) {
  setState((s) => ({
    comments: s.comments.filter((c) => c.id !== id),
    activeId: s.activeId === id ? null : s.activeId,
    diffTarget: s.diffTarget === id ? null : s.diffTarget,
  }));
  scheduleSave();
}

// Suppression groupée (ex. « tout effacer » de l'onglet Traités) : une seule
// écriture, et on retombe sur la doc normale si la cible de révision est effacée.
export function deleteComments(ids) {
  const set = new Set(ids);
  setState((s) => ({
    comments: s.comments.filter((c) => !set.has(c.id)),
    activeId: set.has(s.activeId) ? null : s.activeId,
    diffTarget: set.has(s.diffTarget) ? null : s.diffTarget,
  }));
  scheduleSave();
}

export function retrySave() {
  persistNow();
}

export function setStatuses(statuses) {
  setState({ statuses });
}

export function setCommentMode(on) {
  setState({ commentMode: on, draft: null });
}

export function setDraft(draft) {
  setState({ draft });
}

export function setActive(id) {
  setState({ activeId: id });
}

// Affichage de la diff d'un sujet traité par Claude dans le corps de la page.
// null = on rend la doc normale. La diff vit sur le commentaire (champ `changes`)
// et disparaît donc avec lui à la suppression.
export function setDiffTarget(id) {
  setState({ diffTarget: id });
}

// Index du motif (change) vers lequel le prochain rendu de révision doit défiler
// (null = premier changement). Consommé par render() puis remis à null.
export function setDiffScroll(idx) {
  setState({ diffScrollIdx: idx });
}

// Un « sujet traité par Claude » = commentaire résolu qui portait une instruction
// pour Claude (forClaude) OU qui a des modifications enregistrées.
export function treatedComments(s = state) {
  return s.comments.filter((c) => c.resolved && (c.forClaude || (Array.isArray(c.changes) && c.changes.length)));
}

export function setLocation(space, path) {
  // Nouvelle page -> le panneau récap repasse en mode auto (fermé si vide).
  setState({ location: { space, path }, recapOverride: null });
}

export function setRecapOverride(v) {
  setState({ recapOverride: v });
}

export function bumpRender() {
  setState((s) => ({ renderNonce: s.renderNonce + 1 }));
}

// --- Estimations (overrides saisis dans l'UI) -----------------------------
let estTimer = null;

// Le fichier estimations.json porte les overrides (fileKey -> { code: valeur })
// ET le registre des lots sous la clé réservée `__lots`.
const DEFAULT_LOTS = [{ id: 'v1', label: 'V1' }];

// Filet de sécurité : v1 toujours présent, et tout lot encore RÉFÉRENCÉ par une
// affectation mais absent du registre (écrasement concurrent, vieux client…)
// est réintégré au lieu de retomber silencieusement en v1.
function normalizeLots(raw, estimations) {
  const lots = (Array.isArray(raw) ? raw : []).filter((l) => l && l.id && l.label);
  if (!lots.some((l) => l.id === 'v1')) lots.unshift({ id: 'v1', label: 'V1' });
  const known = new Set(lots.map((l) => l.id));
  for (const fileKey of Object.keys(estimations || {})) {
    for (const code of Object.keys(estimations[fileKey])) {
      const v = estimations[fileKey][code];
      const entries = Array.isArray(v) ? v : [v];
      for (const o of entries) {
        const id = o && typeof o === 'object' ? o.lot : null;
        if (id && !known.has(id)) {
          known.add(id);
          lots.push({ id, label: id.toUpperCase() });
        }
      }
    }
  }
  return lots;
}

export async function loadEstimations() {
  try {
    const res = await fetch(EST_URL, { cache: 'no-store' });
    const data = res.ok ? await res.json() : {};
    const { __lots, ...estimations } = data && typeof data === 'object' ? data : {};
    setState({ estimations, lots: normalizeLots(__lots, estimations) });
  } catch (e) {
    setState({ estimations: {}, lots: DEFAULT_LOTS });
  }
}

export function getEstimation(fileKey, code) {
  const f = state.estimations[fileKey];
  return f ? f[code] : undefined;
}

// value : string ("1j", lu comme v1) OU tableau d'options
// [{label, value, detail?, lot?}]. Chaque valeur est rattachée à un LOT,
// toujours EXPLICITE à la persistance (v1 par défaut). Normalisation :
//  - tableau vidé -> supprime ;
//  - 1 option sans libellé/détail -> objet {value, lot} ;
//  - sinon tableau d'options.
export function setEstimation(fileKey, code, value) {
  if (!code) return;
  setState((s) => {
    const est = { ...s.estimations };
    const file = { ...(est[fileKey] || {}) };
    let v = value;
    if (Array.isArray(v)) {
      const opts = v
        .filter((o) => o && ((o.value || '').trim() !== '' || ((o.lot || '').trim() && o.lot !== 'v1')))
        .map((o) => {
          const opt = { label: (o.label || '').trim(), value: (o.value || '').trim() };
          const detail = (o.detail || '').trim();
          if (detail) opt.detail = detail;
          opt.lot = (o.lot || '').trim() || 'v1';
          return opt;
        });
      if (opts.length === 0) v = '';
      else if (opts.length === 1 && !opts[0].label && !opts[0].detail) {
        v = { value: opts[0].value, lot: opts[0].lot };
      } else v = opts;
    } else {
      v = (v || '').trim();
    }
    if (v === '') delete file[code];
    else file[code] = v;
    if (Object.keys(file).length === 0) delete est[fileKey];
    else est[fileKey] = file;
    return { estimations: est };
  });
  scheduleEstSave();
}

// --- Lots de chiffrage -----------------------------------------------------
function slugifyLot(label) {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'lot'
  );
}

// Crée un lot et renvoie son id (réutilise l'existant à libellé identique).
export function addLot(label) {
  const lab = (label || '').trim();
  if (!lab) return null;
  const existing = state.lots.find((l) => l.label.toLowerCase() === lab.toLowerCase());
  if (existing) return existing.id;
  let id = slugifyLot(lab);
  while (state.lots.some((l) => l.id === id)) id += '-2';
  setState((s) => ({ lots: s.lots.concat({ id, label: lab }) }));
  scheduleEstSave();
  return id;
}

export function renameLot(id, label) {
  const lab = (label || '').trim();
  if (!lab) return;
  setState((s) => ({ lots: s.lots.map((l) => (l.id === id ? { ...l, label: lab } : l)) }));
  scheduleEstSave();
}

// v1 est réservé (bucket par défaut) : non supprimable. Supprimer un lot
// RÉAFFECTE en v1 toutes les valeurs qui le référençaient (sinon le filet de
// normalizeLots le réintégrerait au prochain chargement).
export function deleteLot(id) {
  if (id === 'v1') return;
  setState((s) => {
    const est = {};
    for (const fileKey of Object.keys(s.estimations)) {
      const file = {};
      for (const code of Object.keys(s.estimations[fileKey])) {
        const v = s.estimations[fileKey][code];
        if (Array.isArray(v)) {
          file[code] = v.map((o) => (o && o.lot === id ? { ...o, lot: 'v1' } : o));
        } else if (v && typeof v === 'object' && v.lot === id) {
          file[code] = { ...v, lot: 'v1' };
        } else {
          file[code] = v;
        }
      }
      est[fileKey] = file;
    }
    return { estimations: est, lots: s.lots.filter((l) => l.id !== id) };
  });
  scheduleEstSave();
}

function scheduleEstSave() {
  setState({ estSaveState: 'saving' });
  clearTimeout(estTimer);
  estTimer = setTimeout(persistEstimations, 300);
}

export async function persistEstimations() {
  clearTimeout(estTimer);
  try {
    const res = await fetch(EST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ __lots: state.lots, ...state.estimations }),
    });
    setState({ estSaveState: res.ok ? 'idle' : 'error' });
  } catch (e) {
    setState({ estSaveState: 'error' });
  }
}

// Atelier Plouma — routeur par hash + montage/démontage des vues natives.
// Zéro build, zéro dépendance, ES modules. Chaque vue exporte { titre, monter(hote) }
// et, optionnellement, demonter(). L'état des vues (ex. file de relecture) vit dans
// le module de la vue lui-même — il survit donc à un aller-retour dans la même page.

import * as tableau from '/accueil/vues/tableau.js';
import * as relecture from '/accueil/vues/relecture.js';
import * as banque from '/accueil/vues/banque.js';
import * as simulateur from '/accueil/vues/simulateur.js';
import * as docs from '/accueil/vues/docs.js';

// ─────────────────────────── Utilitaires partagés ───────────────────────────
export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

/** Échappement HTML pour l'injection sûre dans innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** fetch JSON avec cache désactivé ; lève sur !ok. */
export async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** fetch texte avec cache désactivé ; lève sur !ok. */
export async function fetchTexte(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

/** Date relative « il y a 2 h ». */
export function relatif(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function dureeHumaine(sec) {
  if (sec == null) return '—';
  const j = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (j > 0) return `${j} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${sec} s`;
}

export const nomFichier = (f) => (f ? String(f).split('/').pop() : '');

/** Colorise un découpage « la-pin » en syllabes bicolores (classes .syl-a / .syl-b). */
export function coloreSyllabes(decoupage, sep = '') {
  const morceaux = String(decoupage ?? '').split('-');
  const html = morceaux.map((s, i) => `<span class="syl-${i % 2 ? 'b' : 'a'}">${esc(s)}</span>`);
  if (!sep) return html.join('');
  return html.join(`<span class="syl-sep">${sep}</span>`);
}

// ─────────────────────────────── Routeur ────────────────────────────────────
const ROUTES = {
  '#/': tableau,
  '#/docs': docs,
  '#/relecture': relecture,
  '#/banque': banque,
  '#/simulateur': simulateur,
};

const hote = document.getElementById('vue');
let vueActive = null;

function routeCourante() {
  return ROUTES[location.hash] ? location.hash : '#/';
}

async function router() {
  const route = routeCourante();
  const vue = ROUTES[route];

  // Nav active
  $$('.nav-item[data-route]').forEach((n) =>
    n.classList.toggle('actif', n.dataset.route === route));

  // Démontage de la vue précédente (si différente).
  if (vueActive && vueActive !== vue && typeof vueActive.demonter === 'function') {
    try { vueActive.demonter(hote); } catch (e) { console.error('[démontage]', e); }
  }

  // La vue docs veut occuper toute la hauteur (iframe) ; les autres non.
  hote.classList.toggle('pleine-hauteur', route === '#/docs');

  // Titre de page par vue.
  document.title = (vue.titre ? vue.titre + ' — ' : '') + 'Atelier Plouma';

  vueActive = vue;
  try {
    await vue.monter(hote);
  } catch (e) {
    console.error('[montage vue]', e);
    hote.innerHTML = `<div class="banniere-err" style="grid-column:auto">Impossible d'afficher cette vue (${esc(e.message)}).</div>`;
  }
}

window.addEventListener('hashchange', router);
router();

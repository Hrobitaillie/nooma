// Vue « Banque de mots » — port natif de contenu/banques/index.html.
// Grille des mots du module Syllabes, filtres (nb syllabes, attaque, à vérifier,
// validés/à relire, recherche texte), navigation entre distracteurs (scroll +
// surlignage). Lecture seule ; source : /contenu/banques/syllabes.csv.

import { $, esc, fetchTexte, coloreSyllabes } from '/accueil/app.js';

export const titre = 'Banque de mots';

const FICHIER = '/contenu/banques/syllabes.csv';

let items = [];
const etat = { syllabes: null, attaque: null, aVerifier: false, statut: null, texte: '' };

function parseCsv(brut) {
  const lignes = brut.trim().split('\n');
  const cles = lignes[0].split(';');
  return lignes.slice(1).map((l) =>
    Object.fromEntries(l.split(';').map((v, i) => [cles[i], v ?? ''])));
}

const GABARIT = `
  <div class="topbar">
    <div>
      <h1>Banque de mots</h1>
      <div class="fil">Module Syllabes — découpage en syllabes orales (colorisation bicolore). Lecture seule ; source <code>contenu/banques/syllabes.csv</code>.</div>
    </div>
    <div class="actions">
      <a class="btn primaire" href="#/relecture">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Relire / administrer
      </a>
    </div>
  </div>
  <div id="err-zone"></div>
  <div class="filtres" id="filtres">
    <input type="search" id="recherche" placeholder="Chercher un mot…">
  </div>
  <div class="stats-banque" id="stats"></div>
  <div class="grille-mots" id="grille"></div>`;

function carte(it) {
  const syls = coloreSyllabes(it.decoupage, '·');
  const dis = it.distracteursProches
    ? `<div class="distracteurs">≈ ${it.distracteursProches.split('|').filter(Boolean)
        .map((d) => `<a data-mot="${esc(d)}">${esc(d)}</a>`).join(', ')}</div>` : '';
  const etoiles = '★'.repeat(Math.max(0, 4 - Number(it.frequence || 0)));
  return `<div class="mot-carte" id="mot-${esc(it.mot)}">
    ${it.aVerifier === 'oui' ? '<span class="badge-verif">à vérifier</span>' : ''}
    <div class="decoupage">${syls}</div>
    <div class="infos">${esc(it.syllabesOrales)} syll. · attaque /${esc(it.phonemeAttaque)}/ · fréq. ${etoiles}${it.statut === 'valide' ? ' · <span class="relu">✓ relu</span>' : ''}</div>
    ${dis}</div>`;
}

function rendre() {
  const filtres = $('#filtres');
  for (const b of filtres.querySelectorAll('.puce')) b.maj?.();
  const visibles = items.filter((it) =>
    (!etat.syllabes || it.syllabesOrales === etat.syllabes)
    && (!etat.attaque || it.phonemeAttaque === etat.attaque)
    && (!etat.aVerifier || it.aVerifier === 'oui')
    && (!etat.statut || it.statut === etat.statut)
    && (!etat.texte || it.mot.toLowerCase().includes(etat.texte)));
  $('#grille').innerHTML = visibles.map(carte).join('');
  const nAV = visibles.filter((i) => i.aVerifier === 'oui').length;
  $('#stats').textContent =
    `${visibles.length} mot(s) affiché(s) sur ${items.length} — dont ${nAV} à vérifier (e caduc)`;
  for (const a of document.querySelectorAll('.mot-carte .distracteurs a')) {
    a.onclick = () => {
      const cible = document.getElementById(`mot-${a.dataset.mot}`);
      if (!cible) return;
      cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cible.classList.add('cible');
      setTimeout(() => cible.classList.remove('cible'), 1600);
    };
  }
}

function construireFiltres() {
  const filtres = $('#filtres');
  const puce = (label, get, set) => {
    const b = document.createElement('button');
    b.className = 'puce';
    b.textContent = label;
    b.onclick = () => { set(); rendre(); };
    b.maj = () => b.classList.toggle('actif', get());
    filtres.append(b);
    return b;
  };
  for (const n of ['1', '2', '3', '4']) {
    puce(`${n} syll.`, () => etat.syllabes === n,
      () => { etat.syllabes = etat.syllabes === n ? null : n; });
  }
  const attaques = [...new Set(items.map((i) => i.phonemeAttaque))].filter(Boolean).sort();
  const sel = document.createElement('select');
  sel.className = 'puce';
  sel.innerHTML = '<option value="">attaque : toutes</option>'
    + attaques.map((a) => `<option>${esc(a)}</option>`).join('');
  sel.onchange = () => { etat.attaque = sel.value || null; rendre(); };
  filtres.append(sel);
  puce('⚠️ à vérifier', () => etat.aVerifier, () => { etat.aVerifier = !etat.aVerifier; });
  puce('✓ validés', () => etat.statut === 'valide',
    () => { etat.statut = etat.statut === 'valide' ? null : 'valide'; });
  puce('à relire', () => etat.statut === 'a-relire',
    () => { etat.statut = etat.statut === 'a-relire' ? null : 'a-relire'; });
  $('#recherche').oninput = (e) => { etat.texte = e.target.value.toLowerCase(); rendre(); };
}

export async function monter(hote) {
  hote.innerHTML = GABARIT;
  try {
    items = parseCsv(await fetchTexte(FICHIER));
  } catch (e) {
    $('#err-zone').innerHTML = `<div class="banniere-err" style="grid-column:auto">Impossible de charger la banque (${esc(e.message)}).</div>`;
    return;
  }
  construireFiltres();
  rendre();
}

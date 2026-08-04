// Vue « Relecture des mots » — port natif de contenu/banques/admin.html (deux modes).
//
//   • Mode correction : un mot à la fois, découpage syllabique bicolore, « C'est juste »
//     / « À corriger » (formulaire inline) / « Passer ». Les « à vérifier » passent en
//     tête de file, barre de progression, sauvegarde auto via POST /contenu/banques/save.
//     Un mot validé ne réapparaît plus ; toute modification repasse le mot en « à relire ».
//   • Mode édition : table + recherche, fiche modale, création, suppression (avec
//     nettoyage des distracteurs qui pointaient sur le mot supprimé).
//
// Format CSV : 9 colonnes séparées par « ; ». syllabesOrales est dérivé du découpage.
// Compétences cochées depuis le graphe de compétences (module Syllabes).
//
// État PRÉSERVÉ entre navigations : items chargés une fois + file de correction en cours
// vivent en portée module — un aller-retour vers le tableau de bord ne perd pas la session.

import { $, esc, fetchTexte, fetchJson, coloreSyllabes } from '/accueil/app.js';

export const titre = 'Relecture des mots';

const FICHIER = 'syllabes.csv';
const URL_CSV = '/contenu/banques/syllabes.csv';
const URL_GRAPHE = '/contenu/graphe-competences.json';
const URL_SAVE = '/contenu/banques/save';
const CLES = ['mot', 'syllabesOrales', 'decoupage', 'phonemeAttaque', 'frequence', 'competences', 'distracteursProches', 'aVerifier', 'statut'];

// ── État module (survit aux allers-retours) ─────────────────
let charge = false;
let fileInitialisee = false; // la file de correction a-t-elle déjà été construite ?
let items = [];
let competencesSyllabes = [];
let fileCorrection = [];
let modeCorrection = true; // onglet actif mémorisé

// Références DOM du montage courant (réinitialisées à chaque monter()).
let elVueCorrection, elVueEdition, elEtat, dlg;

// ── Chargement des données (une seule fois) ─────────────────
async function chargerDonnees() {
  if (charge) return;
  const [csvBrut, graphe] = await Promise.all([
    fetchTexte(URL_CSV),
    fetchJson(URL_GRAPHE),
  ]);
  competencesSyllabes = graphe.modules
    .flatMap((m) => m.competences.map((c) => ({ id: c.id, nom: c.nom, module: m.nom })))
    .filter((c) => c.module === 'Syllabes');
  items = csvBrut.trim().split('\n').slice(1)
    .map((l) => Object.fromEntries(l.split(';').map((v, i) => [CLES[i], v ?? ''])));
  charge = true;
}

// ── Sauvegarde ──────────────────────────────────────────────
async function sauver() {
  const csv = [CLES.join(';'), ...items.map((it) =>
    CLES.map((k) => (it[k] ?? '').replaceAll(';', ',')).join(';'))].join('\n');
  if (elEtat) { elEtat.textContent = 'sauvegarde…'; elEtat.classList.remove('erreur'); }
  try {
    const r = await fetch(URL_SAVE, { method: 'POST', body: JSON.stringify({ fichier: FICHIER, csv }) });
    if (!(await r.json()).ok) throw new Error();
    if (elEtat) elEtat.textContent = `✓ sauvegardé — ${nbValides()}/${items.length} validés`;
  } catch {
    if (elEtat) { elEtat.textContent = '⚠️ échec de sauvegarde (serveur lancé ?)'; elEtat.classList.add('erreur'); }
  }
}
const nbValides = () => items.filter((i) => i.statut === 'valide').length;

// ── Formulaire d'item (partagé correction + édition) ────────
function formulaire(it, estNouveau = false) {
  const comps = new Set((it.competences ?? '').split('|').filter(Boolean));
  return `<form class="item">
    <label>mot<input name="mot" value="${esc(it.mot ?? '')}" required ${estNouveau ? '' : 'readonly'}></label>
    <label>découpage (tirets, ex. la-pin)<input name="decoupage" value="${esc(it.decoupage ?? '')}" required></label>
    <label>phonème d'attaque<input name="phonemeAttaque" value="${esc(it.phonemeAttaque ?? '')}" required></label>
    <label>fréquence<select name="frequence">
      ${[1, 2, 3].map((f) => `<option value="${f}" ${String(f) === it.frequence ? 'selected' : ''}>${f} — ${['très fréquent', 'fréquent', 'plus rare'][f - 1]}</option>`).join('')}
    </select></label>
    <label>à vérifier (e caduc…)<select name="aVerifier">
      <option value="non" ${it.aVerifier === 'non' ? 'selected' : ''}>non</option>
      <option value="oui" ${it.aVerifier === 'oui' ? 'selected' : ''}>oui</option>
    </select></label>
    <label class="large">distracteurs proches (séparés par |)<input name="distracteursProches" value="${esc(it.distracteursProches ?? '')}"></label>
    <fieldset><legend>compétences travaillées</legend>
      ${competencesSyllabes.map((c) =>
        `<label><input type="checkbox" name="comp" value="${esc(c.id)}" ${comps.has(c.id) ? 'checked' : ''}>${esc(c.nom)}</label>`).join('')}
    </fieldset>
  </form>`;
}

function lireFormulaire(racine, it) {
  const f = racine.querySelector('form.item');
  if (!f.reportValidity()) return null;
  const d = new FormData(f);
  const maj = { ...it };
  for (const k of ['mot', 'decoupage', 'phonemeAttaque', 'frequence', 'aVerifier', 'distracteursProches']) {
    maj[k] = String(d.get(k) ?? '').trim();
  }
  maj.competences = [...f.querySelectorAll('input[name=comp]:checked')].map((c) => c.value).join('|');
  maj.syllabesOrales = String(maj.decoupage.split('-').length); // dérivé du découpage
  return maj;
}

// ── Mode correction : un mot à la fois ──────────────────────
function demarrerCorrection() {
  // à vérifier d'abord, puis le reste ; les « valide » ne réapparaissent jamais.
  fileCorrection = items.filter((i) => i.statut !== 'valide')
    .sort((a, b) => (b.aVerifier === 'oui') - (a.aVerifier === 'oui'));
  fileInitialisee = true;
  rendreCorrection();
}

function rendreCorrection() {
  if (!elVueCorrection) return;
  const total = items.length;
  const faits = total - fileCorrection.length;
  if (fileCorrection.length === 0) {
    elVueCorrection.innerHTML = `<div class="carte fini"><span class="emoji">🎉</span>
      Tout est relu : ${total}/${total} mots validés.<br>
      <small>Les nouveaux mots ou les mots modifiés en édition reviendront ici.</small></div>`;
    return;
  }
  const it = fileCorrection[0];
  elVueCorrection.innerHTML = `
    <div class="progression"><div style="width:${total ? (faits / total) * 100 : 0}%"></div></div>
    <div class="carte carte-mot">
      <div class="grand-mot">${coloreSyllabes(it.decoupage)}</div>
      <div class="fiche-infos">${esc(it.syllabesOrales)} syllabe(s) · attaque /${esc(it.phonemeAttaque)}/ · fréq. ${esc(it.frequence)}
        ${it.aVerifier === 'oui' ? ' · <span class="av-warn">⚠️ découpage à vérifier</span>' : ''}<br>
        <small>compétences : ${esc(it.competences.split('|').filter(Boolean).join(', ') || '—')} · distracteurs : ${esc(it.distracteursProches.split('|').filter(Boolean).join(', ') || '—')}</small>
      </div>
      <div class="boutons">
        <button class="action btn-ok" id="btn-juste">✓ C'est juste</button>
        <button class="action btn-ko" id="btn-faux">✗ À corriger</button>
        <button class="action btn-neutre" id="btn-passer">Passer</button>
      </div>
      <div id="zone-correction" hidden>
        ${formulaire(it)}
        <div class="boutons"><button class="action btn-principal" id="btn-corriger">💾 Corriger et valider</button></div>
      </div>
      <p class="compteur-restant">${faits} relu(s) · ${fileCorrection.length} restant(s)</p>
    </div>`;

  const suivant = () => { fileCorrection.shift(); rendreCorrection(); };
  $('#btn-juste', elVueCorrection).onclick = () => { it.statut = 'valide'; it.aVerifier = 'non'; sauver(); suivant(); };
  $('#btn-passer', elVueCorrection).onclick = () => { fileCorrection.push(fileCorrection.shift()); rendreCorrection(); };
  $('#btn-faux', elVueCorrection).onclick = () => { $('#zone-correction', elVueCorrection).hidden = false; };
  $('#btn-corriger', elVueCorrection).onclick = (e) => {
    e.preventDefault();
    const maj = lireFormulaire(elVueCorrection, it);
    if (!maj) return;
    Object.assign(it, maj, { statut: 'valide', aVerifier: 'non' });
    sauver(); suivant();
  };
}

// ── Mode édition : liste + fiche ────────────────────────────
let filtreTexte = '';

function rendreEdition() {
  if (!elVueEdition) return;
  const visibles = items.filter((i) => !filtreTexte || i.mot.toLowerCase().includes(filtreTexte));
  elVueEdition.innerHTML = `
    <div class="barre-edition">
      <input type="search" id="ed-recherche" placeholder="Chercher…" value="${esc(filtreTexte)}">
      <button class="btn primaire" id="ed-nouveau">＋ Nouveau mot</button>
    </div>
    <table class="table-mots"><thead><tr><th>mot</th><th>découpage</th><th>syll.</th><th>attaque</th><th>fréq.</th><th>statut</th><th></th></tr></thead>
    <tbody>${visibles.map((it) => `<tr data-mot="${esc(it.mot)}">
      <td><b>${esc(it.mot)}</b></td><td>${coloreSyllabes(it.decoupage)}</td><td>${esc(it.syllabesOrales)}</td>
      <td>/${esc(it.phonemeAttaque)}/</td><td>${esc(it.frequence)}</td>
      <td><span class="tag ${it.statut === 'valide' ? 'valide' : 'a-relire'}">${it.statut === 'valide' ? '✓ validé' : 'à relire'}</span></td>
      <td><button class="btn danger btn-suppr" data-mot="${esc(it.mot)}" style="padding:4px 10px">🗑</button></td>
    </tr>`).join('')}</tbody></table>`;

  $('#ed-recherche', elVueEdition).oninput = (e) => { filtreTexte = e.target.value.toLowerCase(); rendreEdition(); };
  $('#ed-nouveau', elVueEdition).onclick = () => ouvrirFiche(null);
  for (const tr of elVueEdition.querySelectorAll('tbody tr')) {
    tr.onclick = (e) => {
      if (e.target.closest('.btn-suppr')) return;
      ouvrirFiche(items.find((i) => i.mot === tr.dataset.mot));
    };
  }
  for (const b of elVueEdition.querySelectorAll('.btn-suppr')) {
    b.onclick = () => {
      if (!confirm(`Supprimer « ${b.dataset.mot} » ?`)) return;
      items = items.filter((i) => i.mot !== b.dataset.mot);
      for (const i of items) { // nettoyer les distracteurs qui pointaient dessus
        i.distracteursProches = i.distracteursProches.split('|').filter((d) => d && d !== b.dataset.mot).join('|');
      }
      sauver(); rendreEdition();
    };
  }
}

function ouvrirFiche(it) {
  const estNouveau = it === null;
  const base = it ?? { frequence: '2', aVerifier: 'non', competences: '', distracteursProches: '' };
  $('#dlg-contenu', dlg).innerHTML = `
    <h3>${estNouveau ? 'Nouveau mot' : `Modifier « ${esc(base.mot)} »`}</h3>
    ${formulaire(base, estNouveau)}
    <div class="boutons">
      <button class="action btn-principal" id="dlg-ok">💾 Enregistrer (repasse « à relire »)</button>
      <button class="action btn-neutre" id="dlg-annuler">Annuler</button>
    </div>`;
  dlg.showModal();
  $('#dlg-annuler', dlg).onclick = () => dlg.close();
  $('#dlg-ok', dlg).onclick = (e) => {
    e.preventDefault();
    const maj = lireFormulaire(dlg, base);
    if (!maj) return;
    if (estNouveau && items.some((i) => i.mot === maj.mot)) { alert('Ce mot existe déjà.'); return; }
    maj.statut = 'a-relire'; // toute création/modification repasse en relecture
    if (estNouveau) items.push(maj); else Object.assign(it, maj);
    dlg.close(); sauver(); rendreEdition(); demarrerCorrection();
  };
}

// ── Onglets ─────────────────────────────────────────────────
function basculer(correction) {
  modeCorrection = correction;
  $('#ong-correction').classList.toggle('actif', correction);
  $('#ong-edition').classList.toggle('actif', !correction);
  elVueCorrection.hidden = !correction;
  elVueEdition.hidden = correction;
  if (correction) rendreCorrection(); else rendreEdition();
}

// ── Montage de la vue ───────────────────────────────────────
const GABARIT = `
  <div class="topbar">
    <div>
      <h1>Relecture des mots</h1>
      <div class="fil">Module Syllabes — validation par l'orthophoniste. Sauvegarde automatique à chaque décision.</div>
    </div>
    <div class="actions">
      <span class="etat-sauvegarde" id="etat-sauvegarde"></span>
    </div>
  </div>
  <div id="err-zone"></div>
  <div class="onglets">
    <button id="ong-correction" class="actif">✅ Mode correction</button>
    <button id="ong-edition">📝 Mode édition</button>
  </div>
  <section id="vue-correction"></section>
  <section id="vue-edition" hidden></section>
  <dialog class="fiche" id="dlg"><div id="dlg-contenu"></div></dialog>`;

export async function monter(hote) {
  hote.innerHTML = GABARIT;
  elVueCorrection = $('#vue-correction', hote);
  elVueEdition = $('#vue-edition', hote);
  elEtat = $('#etat-sauvegarde', hote);
  dlg = $('#dlg', hote);

  $('#ong-correction', hote).onclick = () => basculer(true);
  $('#ong-edition', hote).onclick = () => basculer(false);

  try {
    await chargerDonnees();
  } catch (e) {
    $('#err-zone', hote).innerHTML = `<div class="banniere-err" style="grid-column:auto">Impossible de charger les données (${esc(e.message)}).</div>`;
    return;
  }

  elEtat.textContent = `${nbValides()}/${items.length} validés`;

  // Première visite : construit la file. Retour ultérieur : on RÉUTILISE la file en cours
  // (état préservé, y compris l'ordre après « Passer » et le mot courant).
  if (!fileInitialisee) demarrerCorrection();

  basculer(modeCorrection);
}

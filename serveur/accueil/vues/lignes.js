// Vue « Lignes de texte » — inventaire de TOUTES les lignes que l'app prononcera (doc 18 §4).
//
// Deux sources agrégées côté client :
//   1. le REGISTRE versionné (contenu/voix/lignes.json) — consignes, feedbacks, rituels… ;
//   2. les lignes DÉRIVÉES : chaque mot des banques (contenu/banques/*.csv) = une ligne
//      implicite « mot-<mot> » (le registre ne les duplique pas, doc 18 §4.2).
//
// Statut audio : aujourd'hui tout est « aucun » (le studio n'existe pas encore). La vue est
// STRUCTURÉE pour recevoir demain l'état réel du studio via /api/studio/etat (jointure par id) :
// la colonne existe, le compteur « avec audio » aussi ; en attendant on affiche « studio à venir ».

import { $, $$, esc, fetchJson, fetchTexte } from '/accueil/app.js';

export const titre = 'Lignes de texte';

// Banques connues à agréger (mêmes fichiers que le lint/serveur). On tente, on ignore les absentes.
const BANQUES = ['syllabes'];

const GABARIT = `
  <div class="topbar">
    <div>
      <h1>Lignes de texte</h1>
      <div class="fil">Inventaire des lignes que Plouma prononcera — registre versionné + mots dérivés des banques. Socle du studio d'enregistrement (doc 18 §4).</div>
    </div>
    <div class="actions">
      <span class="maj" id="lg-maj">—</span>
      <button class="btn" id="lg-recharger" type="button">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Recharger
      </button>
    </div>
  </div>

  <div id="lg-err"></div>

  <section class="kpis" id="lg-kpis">
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Total des lignes</div>
      <div class="k-val sq" id="lg-total">0</div>
      <div class="k-sous" id="lg-total-sous">—</div>
    </div>
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> Avec audio</div>
      <div class="k-val sq" id="lg-audio">0</div>
      <div class="k-sous" id="lg-audio-sous">retenues pour le pack</div>
    </div>
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Sans audio</div>
      <div class="k-val sq" id="lg-sans">0</div>
      <div class="k-sous" id="lg-sans-sous">à enregistrer</div>
    </div>
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Prévues</div>
      <div class="k-val sq" id="lg-prevu">0</div>
      <div class="k-sous">au registre, à venir</div>
    </div>
  </section>

  <section class="grille">
    <article class="carte pleine">
      <div class="c-tete">
        <h2><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Inventaire</h2>
        <span class="lien" id="lg-compte" style="color:var(--doux)">—</span>
      </div>

      <div class="lg-filtres">
        <input type="search" id="lg-q" class="lg-recherche" placeholder="Rechercher un id ou un texte…" autocomplete="off">
        <select id="lg-type" class="lg-select"></select>
        <select id="lg-audio-f" class="lg-select">
          <option value="">Audio : tous</option>
          <option value="aucun">Sans audio</option>
          <option value="proposee">Prise(s) proposée(s)</option>
          <option value="enregistre">Retenue ✓</option>
        </select>
      </div>

      <div class="lg-note-studio" id="lg-note">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>Le statut audio est joint depuis le studio (<code>/api/studio/etat</code>) : <b>aucun</b> = à enregistrer, <b>proposée</b> = prise(s) en attente d'arbitrage, <b>retenue ✓</b> = validée pour le pack. Enregistrez et arbitrez dans le <a href="#/studio">Studio</a>.</span>
      </div>

      <div class="lg-table-hote"><div class="vide">Chargement…</div></div>
    </article>
  </section>`;

// ── État de la vue (survit à un aller-retour dans la même page) ─────────────
let lignes = [];        // toutes les lignes agrégées (registre + dérivées)
let filtres = { q: '', type: '', audio: '' };

/** Découpe une ligne CSV « ; » simple. */
function champs(l) { return l.split(';'); }

/** Statut audio d'une ligne, dérivé de l'index du studio (/api/studio/etat). */
function statutAudio(etat, id) {
  const e = etat && etat.lignes && etat.lignes[id];
  const prises = e && Array.isArray(e.prises) ? e.prises : [];
  if (prises.length === 0) return 'aucun';
  if (prises.some((p) => p.statut === 'retenue')) return 'retenue';
  return 'proposee';
}

/** Charge le registre voix + les banques + l'état studio, et construit la liste unifiée. */
async function agreger() {
  const out = [];

  // 0. État du studio (source du statut audio réel) — tolérant à l'absence.
  let etat = { lignes: {} };
  try { etat = await fetchJson('/api/studio/etat'); } catch { etat = { lignes: {} }; }
  if (!etat.lignes) etat.lignes = {};

  // 1. Registre versionné.
  let registre = null;
  try { registre = await fetchJson('/contenu/voix/lignes.json'); } catch { registre = null; }
  const regList = registre && Array.isArray(registre.lignes) ? registre.lignes : [];
  for (const l of regList) {
    if (!l || !l.id) continue;
    const id = String(l.id);
    out.push({
      id,
      texte: String(l.texte ?? ''),
      type: l.type || 'inconnu',
      source: 'registre',
      contexte: l.contexte || l.ecran || '',
      priorite: Number(l.priorite ?? 3),
      statut: l.statut || 'actif',
      audio: statutAudio(etat, id),
    });
  }

  // 2. Lignes dérivées : un « mot-<mot> » par mot de chaque banque.
  for (const nom of BANQUES) {
    let csv = null;
    try { csv = await fetchTexte(`/contenu/banques/${nom}.csv`); } catch { continue; }
    const li = csv.split(/\r?\n/).filter((x) => x.trim() !== '');
    if (li.length < 2) continue;
    const entete = champs(li[0]);
    const iMot = entete.indexOf('mot');
    if (iMot < 0) continue;
    for (let k = 1; k < li.length; k++) {
      const mot = (champs(li[k])[iMot] || '').trim();
      if (!mot) continue;
      const id = `mot-${mot}`;
      out.push({
        id,
        texte: mot,
        type: 'mot',
        source: `banque:${nom}`,
        contexte: `Banque « ${nom} » — mot prononcé`,
        priorite: 2,
        statut: 'actif',
        audio: statutAudio(etat, id),
      });
    }
  }

  return out;
}

// ── Compteurs & filtres ─────────────────────────────────────
function compteurs(liste) {
  const total = liste.length;
  const avecAudio = liste.filter((l) => l.audio === 'retenue').length;
  const proposee = liste.filter((l) => l.audio === 'proposee').length;
  const prevu = liste.filter((l) => l.statut === 'prevu').length;
  return { total, avecAudio, proposee, sansAudio: total - avecAudio - proposee, prevu };
}

function appliquerFiltres() {
  const q = filtres.q.trim().toLowerCase();
  return lignes.filter((l) => {
    if (filtres.type && l.type !== filtres.type) return false;
    if (filtres.audio === 'aucun' && l.audio !== 'aucun') return false;
    if (filtres.audio === 'proposee' && l.audio !== 'proposee') return false;
    if (filtres.audio === 'enregistre' && l.audio !== 'retenue') return false;
    if (q && !(l.id.toLowerCase().includes(q) || l.texte.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => a.priorite - b.priorite || a.id.localeCompare(b.id));
}

const BADGE_AUDIO = {
  aucun: '<span class="lg-audio aucun">aucun</span>',
  proposee: '<span class="lg-audio prop">proposée</span>',
  retenue: '<span class="lg-audio ok">retenue ✓</span>',
};

function rendreTable() {
  const visibles = appliquerFiltres();
  const hote = $('.lg-table-hote');
  $('#lg-compte').textContent = `${visibles.length} / ${lignes.length} lignes`;
  if (visibles.length === 0) {
    hote.innerHTML = `<div class="vide">Aucune ligne ne correspond aux filtres.</div>`;
    return;
  }
  hote.innerHTML = `<table class="lg-table">
    <thead><tr><th>ID</th><th>Texte</th><th>Type</th><th>Source</th><th class="c">Prio</th><th class="c">Audio</th></tr></thead>
    <tbody>${visibles.map((l) => `
      <tr>
        <td class="lg-id">${esc(l.id)}${l.statut === 'prevu' ? ' <span class="lg-prevu-tag">prévu</span>' : ''}</td>
        <td class="lg-texte">${esc(l.texte)}</td>
        <td><span class="lg-type t-${esc(l.type)}">${esc(l.type)}</span></td>
        <td class="lg-source" title="${esc(l.contexte)}">${esc(l.source)}</td>
        <td class="c">${esc(l.priorite)}</td>
        <td class="c">${BADGE_AUDIO[l.audio] || BADGE_AUDIO.aucun}</td>
      </tr>`).join('')}</tbody>
  </table>`;
}

function rendreKpis() {
  const c = compteurs(lignes);
  const registre = lignes.filter((l) => l.source === 'registre').length;
  const derivees = lignes.length - registre;
  // Renseigne une valeur KPI et retire le squelette (.sq force color:transparent).
  const val = (sel, v) => { const el = $(sel); if (el) { el.textContent = v; el.classList.remove('sq'); } };
  val('#lg-total', c.total);
  $('#lg-total-sous').textContent = `${registre} au registre · ${derivees} dérivées`;
  val('#lg-audio', c.avecAudio);
  val('#lg-sans', c.sansAudio);
  const sousSans = $('#lg-sans-sous');
  if (sousSans) sousSans.textContent = c.proposee ? `à enregistrer · ${c.proposee} proposée(s)` : 'à enregistrer';
  val('#lg-prevu', c.prevu);
}

function remplirTypes() {
  const types = [...new Set(lignes.map((l) => l.type))].sort();
  const sel = $('#lg-type');
  sel.innerHTML = `<option value="">Type : tous</option>` +
    types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
}

// ── Chargement ──────────────────────────────────────────────
let enCours = false;
async function charger() {
  if (enCours) return;
  enCours = true;
  const bouton = $('#lg-recharger');
  if (bouton) bouton.classList.add('tourne');
  try {
    lignes = await agreger();
    $('#lg-err').innerHTML = '';
    remplirTypes();
    rendreKpis();
    rendreTable();
    const maj = $('#lg-maj');
    if (maj) maj.textContent = 'Actualisé ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    const z = $('#lg-err');
    if (z) z.innerHTML = `<div class="grille"><div class="banniere-err">Impossible de charger l'inventaire (${esc(e.message)}).</div></div>`;
  } finally {
    if (bouton) bouton.classList.remove('tourne');
    enCours = false;
  }
}

export function monter(hote) {
  hote.innerHTML = GABARIT;
  // Restaure les filtres dans les champs (survie d'un aller-retour).
  $('#lg-q').value = filtres.q;
  $('#lg-recharger').addEventListener('click', charger);
  $('#lg-q').addEventListener('input', (e) => { filtres.q = e.target.value; rendreTable(); });
  $('#lg-type').addEventListener('change', (e) => { filtres.type = e.target.value; rendreTable(); });
  $('#lg-audio-f').addEventListener('change', (e) => { filtres.audio = e.target.value; rendreTable(); });
  charger();
}

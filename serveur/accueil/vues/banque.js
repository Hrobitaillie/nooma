// Vue « Banque de mots » — port natif de contenu/banques/index.html.
// Grille des mots du module Syllabes, filtres (nb syllabes, attaque, à vérifier,
// validés/à relire, recherche texte), navigation entre distracteurs (scroll +
// surlignage). CRUD : ajout/édition/suppression de mots, découpage syllabique
// défini À LA CRÉATION (aperçu des syllabes nouvelles à enregistrer) ;
// sauvegarde par /contenu/banques/save (CSV complet, commit auto).

import { $, $$, esc, fetchTexte, fetchJson, coloreSyllabes } from '/accueil/app.js';

export const titre = 'Banque de mots';

const FICHIER = '/contenu/banques/syllabes.csv';
const ENTETE = ['mot', 'syllabesOrales', 'decoupage', 'phonemeAttaque', 'frequence',
  'competences', 'distracteursProches', 'aVerifier', 'statut'];
// Attaques à plusieurs lettres, pour la suggestion (éditable dans le formulaire).
const DIGRAPHES = ['eau', 'ch', 'ph', 'gn', 'qu', 'ou', 'on', 'an', 'en', 'in', 'un', 'oi', 'au', 'ai'];

let items = [];
let competencesValides = new Set(); // ids du graphe (lint refuse les inconnues)
const etat = { syllabes: null, attaque: null, aVerifier: false, statut: null, texte: '' };

function parseCsv(brut) {
  const lignes = brut.trim().split('\n');
  const cles = lignes[0].split(';');
  return lignes.slice(1).map((l) =>
    Object.fromEntries(l.split(';').map((v, i) => [cles[i], v ?? ''])));
}

// ── Sauvegarde (CSV complet reconstruit → endpoint existant) ─────────────────
function champPropre(v) { return String(v ?? '').replace(/[;\r\n]/g, ' ').trim(); }
function construireCsv() {
  return [ENTETE.join(';'),
    ...items.map((it) => ENTETE.map((c) => champPropre(it[c])).join(';'))].join('\n') + '\n';
}
async function sauverBanque() {
  const r = await fetch('/contenu/banques/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fichier: 'syllabes.csv', csv: construireCsv() }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
}

// Syllabes déjà couvertes par la banque (découpages), en excluant un mot.
function syllabesCouvertes(saufMot) {
  const s = new Set();
  for (const it of items) {
    if (it.mot === saufMot) continue;
    for (const b of String(it.decoupage || '').split('-')) if (b.trim()) s.add(b.trim());
  }
  return s;
}

const GABARIT = `
  <div class="topbar">
    <div>
      <h1>Banque de mots</h1>
      <div class="fil">Module Syllabes — découpage en syllabes orales (colorisation bicolore). Source <code>contenu/banques/syllabes.csv</code>, commit auto à chaque sauvegarde.</div>
    </div>
    <div class="actions">
      <button class="btn primaire" id="bq-ajouter" type="button">＋ Ajouter un mot</button>
      <a class="btn" href="#/relecture">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Relire / administrer
      </a>
    </div>
  </div>
  <div id="err-zone"></div>
  <div id="bq-form-hote"></div>
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
    <div class="mot-actions">
      <button class="btn mini bq-edit" data-mot="${esc(it.mot)}" title="Modifier">✎</button>
      <button class="btn mini danger bq-del" data-mot="${esc(it.mot)}" title="Supprimer">🗑</button>
    </div>
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
  for (const b of $$('.bq-edit')) {
    b.onclick = () => {
      const it = items.find((x) => x.mot === b.dataset.mot);
      if (it) ouvrirFormulaireMot(it);
    };
  }
  for (const b of $$('.bq-del')) b.onclick = () => supprimerMot(b.dataset.mot);
}

// ── CRUD ────────────────────────────────────────────────────────────────────
function fermerFormulaireMot() {
  const h = $('#bq-form-hote');
  if (h) h.innerHTML = '';
}

function suggererAttaque(mot) {
  for (const d of DIGRAPHES) if (mot.startsWith(d)) return d;
  return mot.slice(0, 1);
}

function ouvrirFormulaireMot(it) {
  const h = $('#bq-form-hote');
  if (!h) return;
  const est = !!it;
  const versListe = (v) => String(v || '').split('|').filter(Boolean).join(', ');
  h.innerHTML = `<div class="lg-form">
    <h3>${est ? `Modifier « ${esc(it.mot)} »` : 'Nouveau mot'}</h3>
    <div class="lg-form-grille">
      <label>Mot
        <input id="bqf-mot" value="${est ? esc(it.mot) : ''}" ${est ? 'disabled' : ''} autocomplete="off" placeholder="lapin">
      </label>
      <label>Découpage en syllabes ORALES (tirets)
        <input id="bqf-dec" value="${est ? esc(it.decoupage) : ''}" autocomplete="off" placeholder="la-pin">
      </label>
      <label>Attaque (phonème entendu en premier)
        <input id="bqf-attaque" value="${est ? esc(it.phonemeAttaque) : ''}" autocomplete="off" placeholder="l">
      </label>
      <label>Fréquence (1 = mot très courant)
        <select id="bqf-freq">${[1, 2, 3].map((f) => `<option ${Number(est ? it.frequence : 2) === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
      </label>
      <label class="lg-form-large">Compétences liées (virgules — ids du graphe)
        <input id="bqf-comp" value="${est ? esc(versListe(it.competences)) : 'syl-compare'}" autocomplete="off">
      </label>
      <label class="lg-form-large">Mots proches à confondre (distracteurs, virgules)
        <input id="bqf-dis" value="${est ? esc(versListe(it.distracteursProches)) : ''}" autocomplete="off" placeholder="sapin">
      </label>
      <label class="lg-form-case"><input type="checkbox" id="bqf-verif" ${est && it.aVerifier === 'oui' ? 'checked' : ''}> découpage à vérifier (e caduc)</label>
      <label>Statut
        <select id="bqf-statut">${['a-relire', 'valide'].map((s) => `<option ${((est ? it.statut : 'a-relire') === s) ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </label>
    </div>
    <div class="lg-form-note" id="bqf-note"></div>
    <div class="lg-form-actions">
      <button class="btn primaire" id="bqf-envoyer" type="button">${est ? 'Enregistrer les modifications' : 'Ajouter à la banque'}</button>
      <button class="btn" id="bqf-annuler" type="button">Annuler</button>
      <span class="lg-form-erreur" id="bqf-erreur"></span>
    </div>
  </div>`;

  let decLibre = !est, attaqueLibre = !est;
  const majApercu = () => {
    const mot = $('#bqf-mot').value.trim().toLowerCase();
    if (decLibre) $('#bqf-dec').value = mot;
    if (attaqueLibre) $('#bqf-attaque').value = suggererAttaque(mot);
    const segments = $('#bqf-dec').value.trim().toLowerCase().split('-').map((s) => s.trim()).filter(Boolean);
    const couvertes = syllabesCouvertes(est ? it.mot : null);
    const nouvelles = segments.filter((s) => !couvertes.has(s));
    const deja = segments.filter((s) => couvertes.has(s));
    $('#bqf-note').innerHTML = segments.length === 0 ? 'Découpez le mot avec des tirets : la-pin.'
      : `<b>${segments.length}</b> syllabe(s) orale(s)`
        + (nouvelles.length ? ` · <b>${nouvelles.length} nouvelle(s) à enregistrer</b> : ${nouvelles.map(esc).join(', ')}` : '')
        + (deja.length ? ` · déjà couvertes : ${deja.map(esc).join(', ')}` : '')
        + (segments.join('') !== mot ? ' · ⚠️ le découpage recollé ne redonne pas le mot' : '');
  };
  $('#bqf-mot').addEventListener('input', majApercu);
  $('#bqf-dec').addEventListener('input', () => { decLibre = false; majApercu(); });
  $('#bqf-attaque').addEventListener('input', () => { attaqueLibre = false; });
  majApercu();

  $('#bqf-annuler').onclick = fermerFormulaireMot;
  $('#bqf-envoyer').onclick = async () => {
    const bouton = $('#bqf-envoyer');
    const erreurZone = $('#bqf-erreur');
    erreurZone.textContent = '';
    const echec = (msg) => { erreurZone.textContent = '⚠️ ' + msg; bouton.disabled = false; };

    const mot = (est ? it.mot : $('#bqf-mot').value).trim().toLowerCase().normalize('NFC');
    const decoupage = $('#bqf-dec').value.trim().toLowerCase().normalize('NFC').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const segments = decoupage.split('-').filter(Boolean);
    const enListe = (v) => v.split(/[,|]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const competences = enListe($('#bqf-comp').value);
    const distracteurs = enListe($('#bqf-dis').value).map((d) => d.normalize('NFC'));

    if (!/^[a-zàâäçéèêëîïôöùûüÿœæ-]{2,40}$/.test(mot)) { echec('mot invalide (lettres minuscules)'); return; }
    if (!est && items.some((x) => x.mot === mot)) { echec('ce mot est déjà dans la banque'); return; }
    if (segments.length === 0) { echec('découpage requis (tirets entre syllabes)'); return; }
    if (competencesValides.size) {
      const inconnues = competences.filter((c) => !competencesValides.has(c));
      if (inconnues.length) { echec(`compétence(s) inconnue(s) du graphe : ${inconnues.join(', ')}`); return; }
    }
    const absents = distracteurs.filter((d) => d !== mot && !items.some((x) => x.mot === d));
    if (absents.length) { echec(`distracteur(s) absent(s) de la banque : ${absents.join(', ')}`); return; }
    if (segments.join('') !== mot
      && !confirm('Le découpage recollé ne redonne pas le mot — c’est voulu (découpage oral) ?')) return;

    bouton.disabled = true;
    const propre = {
      mot,
      syllabesOrales: String(segments.length),
      decoupage,
      phonemeAttaque: $('#bqf-attaque').value.trim().toLowerCase() || suggererAttaque(mot),
      frequence: $('#bqf-freq').value,
      competences: competences.join('|'),
      distracteursProches: distracteurs.join('|'),
      aVerifier: $('#bqf-verif').checked ? 'oui' : 'non',
      statut: $('#bqf-statut').value,
    };
    const sauvegarde = items.map((x) => ({ ...x }));
    if (est) items[items.findIndex((x) => x.mot === it.mot)] = propre;
    else items.push(propre);
    try {
      await sauverBanque();
      fermerFormulaireMot();
      rendre();
    } catch (e) {
      items = sauvegarde;
      echec('sauvegarde impossible : ' + e.message);
    }
  };
}

async function supprimerMot(mot) {
  const referents = items.filter((x) => x.mot !== mot
    && String(x.distracteursProches || '').split('|').includes(mot)).map((x) => x.mot);
  const avert = referents.length ? `\n⚠️ Il est distracteur de : ${referents.join(', ')} (référence retirée).` : '';
  if (!confirm(`Supprimer « ${mot} » de la banque ?${avert}`)) return;
  const sauvegarde = items.map((x) => ({ ...x }));
  items = items.filter((x) => x.mot !== mot);
  for (const x of items) {
    x.distracteursProches = String(x.distracteursProches || '')
      .split('|').filter((d) => d && d !== mot).join('|');
  }
  try {
    await sauverBanque();
    rendre();
  } catch (e) {
    items = sauvegarde;
    alert('Suppression impossible : ' + e.message);
  }
}

function construireFiltres() {
  const filtres = $('#filtres');
  // Idempotent : ne garde que la recherche avant de reconstruire.
  for (const el of [...filtres.children]) if (el.id !== 'recherche') el.remove();
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
  // Ids de compétences du graphe (validation des formulaires) — tolérant à l'absence.
  try {
    const graphe = await fetchJson('/contenu/graphe-competences.json');
    competencesValides = new Set((graphe.modules || [])
      .flatMap((m) => m.competences || []).map((c) => c.id).filter(Boolean));
  } catch { competencesValides = new Set(); }
  $('#bq-ajouter').onclick = () => ouvrirFormulaireMot(null);
  construireFiltres();
  rendre();
}

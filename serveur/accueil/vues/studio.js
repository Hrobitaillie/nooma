// Vue « Studio d'enregistrement » (doc 18 §5) — l'UX de Florence + l'arbitrage de Hugo.
//
// Trois modes dans une même vue (onglets) :
//   • File d'attente : lignes SANS prise retenue, triées priorité puis type, compteur restant
//     + progression de session (« N enregistrées aujourd'hui »).
//   • Enregistrement : une ligne plein cadre, texte en TRÈS gros (variables interpolées par un
//     exemple), getUserMedia micro NU + MediaRecorder + vu-mètre AnalyserNode temps réel,
//     boutons ● Enregistrer / ■ Stop / ▶ Réécouter / ↻ Refaire / ✓ Envoyer / Passer, espace = rec/stop.
//   • Arbitrage (Hugo) : par ligne, toutes les prises avec lecteur, Retenir / Écarter / note,
//     badge de la retenue, bouton « Exporter le pack » (POST /api/studio/export + rapport).
//
// Sources de la liste unifiée = mêmes que la vue lignes : registre versionné + mots des banques
// + phonèmes dérivés du graphe ; jointes par id à /api/studio/etat pour le statut audio réel.

import { $, $$, esc, fetchJson, fetchTexte } from '/accueil/app.js';

export const titre = 'Studio d\'enregistrement';

const BANQUES = ['syllabes'];
// Exemples d'interpolation des variables (Florence enregistre la phrase avec un mot d'exemple).
const EXEMPLES = { mot: 'lapin', syllabes: 'la, pin', prenom: 'mon étoile' };

// ── État module (survit aux allers-retours) ─────────────────
let lignes = [];            // liste unifiée { id, texte, type, contexte, indication, priorite, variables, statut }
let etatStudio = { lignes: {} };
let mode = 'file';          // file | enreg | arbitrage
let indexEnreg = 0;         // position dans la file d'enregistrement
let sessionCompte = 0;      // prises envoyées durant cette session (mémoire module)
let arbitrageId = null;     // ligne ouverte en arbitrage

// État micro/enregistrement (vit hors DOM, nettoyé au démontage/refaire).
let flux = null, recorder = null, morceaux = [], blobPrise = null, mimePrise = '';
let audioCtx = null, analyser = null, rafVu = 0, dateDebut = 0, picMax = 0;

// ────────────────────────── Agrégation des lignes ──────────────────────────
function champs(l) { return l.split(';'); }

async function agreger() {
  const out = [];
  let registre = null;
  try { registre = await fetchJson('/contenu/voix/lignes.json'); } catch { registre = null; }
  for (const l of (registre && registre.lignes) || []) {
    if (!l || !l.id) continue;
    out.push({
      id: String(l.id), texte: String(l.texte ?? ''), type: l.type || 'inconnu',
      contexte: l.contexte || l.ecran || '', indication: l.indication || '',
      variables: Array.isArray(l.variables) ? l.variables : [],
      priorite: Number(l.priorite ?? 3), statut: l.statut || 'actif', source: 'registre',
    });
  }
  // Mots dérivés des banques.
  for (const nom of BANQUES) {
    let csv = null;
    try { csv = await fetchTexte(`/contenu/banques/${nom}.csv`); } catch { continue; }
    const li = csv.split(/\r?\n/).filter((x) => x.trim() !== '');
    if (li.length < 2) continue;
    const iMot = champs(li[0]).indexOf('mot');
    if (iMot < 0) continue;
    for (let k = 1; k < li.length; k++) {
      const mot = (champs(li[k])[iMot] || '').trim();
      if (!mot) continue;
      out.push({
        id: `mot-${mot}`, texte: mot, type: 'mot', contexte: `Banque « ${nom} » — mot prononcé`,
        indication: 'articulé, naturel', variables: [], priorite: 2, statut: 'actif', source: `banque:${nom}`,
      });
    }
  }
  // Phonèmes dérivés du graphe (id « phoneme-<graphème> », priorité 1 — lot critique).
  try {
    const graphe = await fetchJson('/contenu/graphe-competences.json');
    const vus = new Set();
    for (const m of graphe.modules || []) {
      for (const c of m.competences || []) {
        for (const g of c.graphemesIntroduits || []) {
          if (vus.has(g)) continue; vus.add(g);
          out.push({
            id: `phoneme-${g}`, texte: g, type: 'phoneme',
            contexte: `Graphème « ${g} » — son isolé (pas le nom de la lettre)`,
            indication: 'dire le SON du graphème, jamais le nom de la lettre', variables: [],
            priorite: 1, statut: 'actif', source: 'graphe',
          });
        }
      }
    }
  } catch { /* graphe absent → pas de phonèmes */ }
  return out;
}

// Statut audio dérivé pour une ligne (à partir de etatStudio).
function prisesDe(id) {
  const e = etatStudio.lignes && etatStudio.lignes[id];
  return (e && Array.isArray(e.prises)) ? e.prises : [];
}
function statutAudio(id) {
  const p = prisesDe(id);
  if (p.length === 0) return 'aucun';
  if (p.some((x) => x.statut === 'retenue')) return 'retenue';
  return 'proposee';
}

// Ordre de type pour la file : phonèmes/consignes d'abord, mots ensuite.
const RANG_TYPE = { phoneme: 0, consigne: 1, feedback: 2, interpellation: 3, babillage: 4, histoire: 5, mot: 6 };
function fileAttente() {
  return lignes
    .filter((l) => l.statut !== 'prevu' && statutAudio(l.id) !== 'retenue')
    .sort((a, b) => a.priorite - b.priorite
      || (RANG_TYPE[a.type] ?? 9) - (RANG_TYPE[b.type] ?? 9)
      || a.id.localeCompare(b.id));
}

// Interpole les variables par un exemple pour l'affichage (le texte réel garde {mot}).
function texteAvecExemplesHTML(l) {
  // Rend le texte échappé, puis remplace ‹…› par de l'italique visible.
  let html = esc(l.texte);
  for (const v of l.variables || []) {
    const ex = EXEMPLES[v] || v;
    html = html.replaceAll(esc(`{${v}}`), `<em class="st-var">${esc(ex)}</em>`);
  }
  return html;
}

// ─────────────────────────────── Gabarit ───────────────────────────────────
const GABARIT = `
  <div class="topbar">
    <div>
      <h1>Studio d'enregistrement</h1>
      <div class="fil">Enregistrez la voix de Plouma ligne par ligne. Chrome ou Firefox conseillés (micro requis).</div>
    </div>
    <div class="actions">
      <span class="maj" id="st-maj">—</span>
      <button class="btn" id="st-recharger" type="button">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Recharger
      </button>
    </div>
  </div>
  <div id="st-err"></div>
  <div class="onglets">
    <button id="st-ong-file" class="actif">🎙 File d'attente</button>
    <button id="st-ong-arbitrage">⚖️ Arbitrage</button>
  </div>
  <section id="st-zone"><div class="vide">Chargement…</div></section>`;

// ─────────────────────────── Mode : file d'attente ─────────────────────────
function rendreFile() {
  const zone = $('#st-zone');
  const file = fileAttente();
  const total = lignes.filter((l) => l.statut !== 'prevu').length;
  const retenues = lignes.filter((l) => statutAudio(l.id) === 'retenue').length;

  if (file.length === 0) {
    zone.innerHTML = `<div class="st-fini"><span class="st-emoji">🎉</span>
      <div>Tout est enregistré et retenu — ${retenues}/${total} lignes.</div>
      <small>Les nouvelles lignes ou celles dont l'audio est écarté reviendront ici.</small></div>`;
    return;
  }

  const apercu = file.slice(0, 40);
  zone.innerHTML = `
    <section class="kpis st-kpis">
      <div class="kpi"><div class="k-tete">File d'attente</div><div class="k-val">${file.length}</div><div class="k-sous">ligne(s) à enregistrer</div></div>
      <div class="kpi"><div class="k-tete">Retenues</div><div class="k-val">${retenues} <small>/ ${total}</small></div><div class="k-sous">audio validé</div></div>
      <div class="kpi"><div class="k-tete">Cette session</div><div class="k-val">${sessionCompte}</div><div class="k-sous">enregistrée(s) aujourd'hui</div></div>
      <div class="kpi"><div class="k-tete">Prochaine</div><div class="k-val" style="font-size:15px;line-height:1.3">${esc((file[0].texte || '').slice(0, 32))}</div><div class="k-sous">${esc(file[0].type)}</div></div>
    </section>
    <div class="st-lancer">
      <button class="btn primaire st-gros" id="st-demarrer">
        <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>
        Enregistrer la suite (${file.length})
      </button>
      <span class="st-hint">La file est triée : priorité 1, puis phonèmes et consignes, les mots ensuite.</span>
    </div>
    <table class="lg-table st-liste">
      <thead><tr><th>Ordre</th><th>Texte</th><th>Type</th><th class="c">Prio</th><th class="c">Prises</th><th></th></tr></thead>
      <tbody>${apercu.map((l, i) => {
        const p = prisesDe(l.id);
        const badge = p.length === 0 ? '<span class="lg-audio aucun">aucune</span>'
          : `<span class="lg-audio prop">${p.length} proposée(s)</span>`;
        return `<tr>
          <td class="c">${i + 1}</td>
          <td class="lg-texte">${texteAvecExemplesHTML(l)}<div class="st-id">${esc(l.id)}</div></td>
          <td><span class="lg-type t-${esc(l.type)}">${esc(l.type)}</span></td>
          <td class="c">${l.priorite}</td>
          <td class="c">${badge}</td>
          <td class="c"><button class="btn st-rec-ligne" data-id="${esc(l.id)}">Enregistrer</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    ${file.length > apercu.length ? `<div class="st-hint" style="margin-top:10px">… et ${file.length - apercu.length} de plus.</div>` : ''}`;

  $('#st-demarrer').onclick = () => { indexEnreg = 0; ouvrirEnreg(file[0].id); };
  for (const b of $$('.st-rec-ligne')) {
    b.onclick = () => {
      const f = fileAttente();
      indexEnreg = Math.max(0, f.findIndex((l) => l.id === b.dataset.id));
      ouvrirEnreg(b.dataset.id);
    };
  }
}

// ─────────────────────────── Mode : enregistrement ─────────────────────────
function ligneParId(id) { return lignes.find((l) => l.id === id) || null; }

function ouvrirEnreg(id) {
  mode = 'enreg';
  arretMicro();
  blobPrise = null;
  rendreEnreg(id);
}

function rendreEnreg(id) {
  const zone = $('#st-zone');
  const l = ligneParId(id);
  if (!l) { mode = 'file'; rendreFile(); return; }
  const file = fileAttente();
  const pos = Math.max(0, file.findIndex((x) => x.id === id));
  const p = prisesDe(id);

  const varNote = (l.variables && l.variables.length)
    ? `<div class="st-var-note">⚠️ Cette ligne contient une variable. Dites la phrase avec le mot d'exemple montré en italique — l'app remplacera par le vrai mot à l'usage. <b>Enregistrez le texte tel qu'affiché.</b></div>`
    : '';

  zone.innerHTML = `
    <div class="st-enreg">
      <div class="st-enreg-tete">
        <button class="btn" id="st-retour">← File</button>
        <span class="st-compteur">${pos + 1} / ${file.length} de la file · <b>${sessionCompte}</b> envoyée(s) cette session</span>
      </div>
      <div class="st-carte-ligne">
        <span class="lg-type t-${esc(l.type)}">${esc(l.type)}</span>
        <div class="st-grand-texte">${texteAvecExemplesHTML(l)}</div>
        ${varNote}
        ${l.indication ? `<div class="st-indication">🎭 ${esc(l.indication)}</div>` : ''}
        <div class="st-contexte">${esc(l.contexte)}</div>
        <div class="st-idligne">${esc(l.id)}</div>
      </div>

      <div class="st-vu" id="st-vu"><div class="st-vu-barre" id="st-vu-barre"></div></div>
      <div class="st-etat-micro" id="st-etat">Prêt. Appuyez sur <b>Enregistrer</b> (ou la barre d'espace).</div>

      <div class="st-boutons" id="st-boutons"></div>
      <audio id="st-audio" controls hidden style="width:100%;margin-top:14px"></audio>

      ${p.length ? `<div class="st-prises-existantes">${p.length} prise(s) déjà enregistrée(s) pour cette ligne — à départager en arbitrage.</div>` : ''}
    </div>`;

  $('#st-retour').onclick = () => { arretMicro(); mode = 'file'; rendreFile(); };
  rendreBoutonsEnreg('pret', l);
}

function rendreBoutonsEnreg(phase, l) {
  const b = $('#st-boutons');
  if (!b) return;
  const gros = (id, cls, txt) => `<button class="action ${cls} st-b" id="${id}">${txt}</button>`;
  if (phase === 'pret' || phase === 'rejoue') {
    // Aucune prise capturée : Enregistrer + Passer.
    b.innerHTML = gros('st-rec', 'btn-ok', '● Enregistrer')
      + (blobPrise ? gros('st-reecouter', 'btn-neutre', '▶ Réécouter') + gros('st-refaire', 'btn-neutre', '↻ Refaire') + gros('st-envoyer', 'btn-principal', '✓ Envoyer') : '')
      + gros('st-passer', 'btn-neutre', 'Passer →');
  } else if (phase === 'enregistre') {
    b.innerHTML = gros('st-stop', 'btn-ko', '■ Stop');
  } else if (phase === 'capture') {
    b.innerHTML = gros('st-reecouter', 'btn-neutre', '▶ Réécouter')
      + gros('st-refaire', 'btn-neutre', '↻ Refaire')
      + gros('st-envoyer', 'btn-principal', '✓ Envoyer & suivant')
      + gros('st-passer', 'btn-neutre', 'Passer →');
  }
  cablerBoutons(l);
}

function cablerBoutons(l) {
  const rec = $('#st-rec'); if (rec) rec.onclick = () => demarrerCapture(l);
  const stop = $('#st-stop'); if (stop) stop.onclick = () => arreterCapture(l);
  const re = $('#st-reecouter'); if (re) re.onclick = () => { const a = $('#st-audio'); if (a && !a.hidden) a.play(); };
  const rf = $('#st-refaire'); if (rf) rf.onclick = () => { blobPrise = null; const a = $('#st-audio'); if (a) { a.hidden = true; a.removeAttribute('src'); } setEtat('Reprise. Appuyez sur Enregistrer.'); rendreBoutonsEnreg('pret', l); };
  const env = $('#st-envoyer'); if (env) env.onclick = () => envoyer(l);
  const pa = $('#st-passer'); if (pa) pa.onclick = () => suivant(l.id);
}

function setEtat(txt, err = false) {
  const e = $('#st-etat');
  if (e) { e.innerHTML = txt; e.classList.toggle('err', err); }
}

// getUserMedia micro NU → MediaRecorder + vu-mètre AnalyserNode.
async function demarrerCapture(l) {
  try {
    if (!flux) {
      flux = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    }
  } catch (e) {
    setEtat(`🎤 Micro indisponible : <b>${esc(e.name || 'refus')}</b>. Autorisez le micro dans la barre d'adresse (icône cadenas), vérifiez qu'aucune autre appli ne l'utilise, puis réessayez.`, true);
    return;
  }
  // Choix du mime supporté.
  mimePrise = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  try {
    recorder = new MediaRecorder(flux, mimePrise ? { mimeType: mimePrise } : undefined);
  } catch {
    recorder = new MediaRecorder(flux);
  }
  morceaux = [];
  picMax = 0;
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) morceaux.push(ev.data); };
  recorder.onstop = () => {
    blobPrise = new Blob(morceaux, { type: (recorder && recorder.mimeType) || mimePrise || 'audio/webm' });
    mimePrise = blobPrise.type;
    const a = $('#st-audio');
    if (a) { a.src = URL.createObjectURL(blobPrise); a.hidden = false; }
    setEtat(`✓ Prise capturée (${(blobPrise.size / 1024).toFixed(0)} Ko). Réécoutez, puis Envoyez ou Refaites.`);
    rendreBoutonsEnreg('capture', l);
  };
  dateDebut = Date.now();
  recorder.start();
  demarrerVuMetre();
  setEtat('🔴 Enregistrement… parlez, puis <b>Stop</b> (ou espace).');
  rendreBoutonsEnreg('enregistre', l);
}

function arreterCapture() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  arretVuMetre();
}

function demarrerVuMetre() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(flux);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const barre = $('#st-vu-barre');
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let max = 0;
      for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > max) max = v; }
      if (max > picMax) picMax = max;
      if (barre) {
        barre.style.width = Math.min(100, max * 130).toFixed(0) + '%';
        barre.style.background = max > 0.92 ? 'var(--rouge)' : max > 0.5 ? 'var(--vert)' : 'var(--accent)';
      }
      rafVu = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* pas de Web Audio → pas de vu-mètre, l'enregistrement marche quand même */ }
}
function arretVuMetre() {
  if (rafVu) cancelAnimationFrame(rafVu); rafVu = 0;
  const barre = $('#st-vu-barre'); if (barre) barre.style.width = '0%';
}

// Coupe micro + audio context (démontage, refaire complet).
function arretMicro() {
  arretVuMetre();
  try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* rien */ }
  recorder = null;
  if (flux) { for (const t of flux.getTracks()) t.stop(); flux = null; }
  if (audioCtx) { try { audioCtx.close(); } catch { /* rien */ } audioCtx = null; }
  analyser = null;
}

async function envoyer(l) {
  if (!blobPrise) return;
  const env = $('#st-envoyer'); if (env) { env.disabled = true; env.textContent = 'Envoi…'; }
  const dureeMs = Math.max(0, Date.now() - dateDebut);
  const picDb = picMax > 0 ? (20 * Math.log10(picMax)).toFixed(1) : '';
  const qs = new URLSearchParams({ ligne: l.id, dureeMs: String(dureeMs) });
  if (picDb) qs.set('picDb', picDb);
  try {
    const r = await fetch(`/api/studio/prise?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': mimePrise || 'audio/webm' },
      body: blobPrise,
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
    sessionCompte++;
    // Met à jour l'état local (évite un rechargement complet).
    const e = etatStudio.lignes[l.id] || (etatStudio.lignes[l.id] = { prises: [] });
    e.prises.push(data.prise);
    blobPrise = null;
    suivant(l.id);
  } catch (e) {
    setEtat(`⚠️ Envoi échoué : ${esc(e.message)}. La prise est conservée, réessayez.`, true);
    if (env) { env.disabled = false; env.textContent = '✓ Envoyer & suivant'; }
  }
}

// Passe à la ligne suivante de la file (recalculée), ou revient à la file si terminé.
function suivant(idCourant) {
  arretVuMetre();
  blobPrise = null;
  const file = fileAttente();
  // La ligne courante peut avoir quitté la file (si elle vient d'être retenue) ; on prend
  // la suivante par position d'origine.
  let prochaine = file.find((l) => l.id !== idCourant);
  // Cherche la première ligne d'ordre > la courante si elle est encore là.
  const idx = file.findIndex((l) => l.id === idCourant);
  if (idx >= 0 && idx + 1 < file.length) prochaine = file[idx + 1];
  else if (idx >= 0) prochaine = file[idx]; // reste sur place (dernière) → recharge la même
  if (!prochaine) { mode = 'file'; rendreFile(); return; }
  ouvrirEnreg(prochaine.id);
}

// ─────────────────────────── Mode : arbitrage ──────────────────────────────
function lignesAvecPrises() {
  return lignes
    .filter((l) => prisesDe(l.id).length > 0)
    .sort((a, b) => {
      // « À arbitrer » (≥2 proposées, pas de retenue) d'abord.
      const sa = statutAudio(a.id), sb = statutAudio(b.id);
      const arbA = (sa !== 'retenue' && prisesDe(a.id).length >= 2) ? 0 : 1;
      const arbB = (sb !== 'retenue' && prisesDe(b.id).length >= 2) ? 0 : 1;
      return arbA - arbB || a.priorite - b.priorite || a.id.localeCompare(b.id);
    });
}

function rendreArbitrage() {
  const zone = $('#st-zone');
  const avec = lignesAvecPrises();
  const aArbitrer = avec.filter((l) => statutAudio(l.id) !== 'retenue' && prisesDe(l.id).length >= 2).length;
  const retenues = avec.filter((l) => statutAudio(l.id) === 'retenue').length;

  zone.innerHTML = `
    <div class="st-arb-tete">
      <div class="st-arb-stats">
        <span><b>${avec.length}</b> ligne(s) avec prises</span>
        <span><b>${retenues}</b> retenue(s)</span>
        <span class="${aArbitrer ? 'st-warn' : ''}"><b>${aArbitrer}</b> à arbitrer</span>
      </div>
      <button class="btn vert" id="st-export">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exporter le pack
      </button>
    </div>
    <div id="st-export-rapport"></div>
    ${avec.length === 0 ? `<div class="vide">Aucune prise pour l'instant. Enregistrez depuis la file d'attente.</div>`
      : `<div class="st-arb-liste">${avec.map((l) => carteArbitrage(l)).join('')}</div>`}`;

  $('#st-export').onclick = exporterPack;
  cablerArbitrage();
}

function carteArbitrage(l) {
  const p = prisesDe(l.id);
  const badge = statutAudio(l.id) === 'retenue' ? '<span class="lg-audio ok">✓ retenue</span>'
    : (p.length >= 2 ? '<span class="lg-audio warn">à arbitrer</span>' : '<span class="lg-audio prop">proposée</span>');
  return `<article class="st-arb-carte">
    <div class="st-arb-ligne-tete">
      <div>
        <span class="lg-type t-${esc(l.type)}">${esc(l.type)}</span>
        <span class="st-arb-texte">${texteAvecExemplesHTML(l)}</span>
      </div>
      <div>${badge}<span class="st-id">${esc(l.id)}</span></div>
    </div>
    <div class="st-prises">${p.map((pr) => carteRise(l.id, pr)).join('')}</div>
  </article>`;
}

function carteRise(ligneId, pr) {
  const cls = pr.statut === 'retenue' ? 'retenue' : pr.statut === 'ecartee' ? 'ecartee' : 'proposee';
  const meta = [
    pr.utilisateur ? `par ${esc(pr.utilisateur)}` : '',
    pr.dureeMs ? `${(pr.dureeMs / 1000).toFixed(1)} s` : '',
    pr.picDb != null && pr.picDb !== '' ? `pic ${esc(pr.picDb)} dB` : '',
    pr.taille ? `${(pr.taille / 1024).toFixed(0)} Ko` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="st-prise ${cls}" data-ligne="${esc(ligneId)}" data-prise="${esc(pr.id)}">
    <div class="st-prise-tete">
      <b>${esc(pr.id)}</b>
      <span class="st-prise-statut ${cls}">${pr.statut}</span>
    </div>
    <audio controls preload="none" src="/api/studio/audio/${esc(ligneId)}/${esc(pr.id)}"></audio>
    <div class="st-prise-meta">${esc(meta)}</div>
    <input class="st-prise-note" data-prise="${esc(pr.id)}" placeholder="note (choix à deux)…" value="${esc(pr.note || '')}">
    <div class="st-prise-actions">
      ${pr.statut !== 'retenue' ? `<button class="btn vert st-retenir" data-prise="${esc(pr.id)}">✓ Retenir</button>` : `<button class="btn st-reproposer" data-prise="${esc(pr.id)}">↩ Reproposer</button>`}
      ${pr.statut !== 'ecartee' ? `<button class="btn danger st-ecarter" data-prise="${esc(pr.id)}">✗ Écarter</button>` : `<button class="btn danger st-supprimer" data-prise="${esc(pr.id)}">🗑 Supprimer</button>`}
    </div>
  </div>`;
}

async function statutPrise(priseId, statut) {
  const note = ($(`.st-prise-note[data-prise="${cssEsc(priseId)}"]`) || {}).value || '';
  const r = await fetch(`/api/studio/prise/${encodeURIComponent(priseId)}/statut`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statut, note }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) { alert('Échec : ' + (data.error || r.status)); return; }
  await rechargerEtat();
  rendreArbitrage();
}
async function supprimerPrise(priseId) {
  if (!confirm('Supprimer définitivement cette prise écartée ?')) return;
  const r = await fetch(`/api/studio/prise/${encodeURIComponent(priseId)}`, { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) { alert('Échec : ' + (data.error || r.status)); return; }
  await rechargerEtat();
  rendreArbitrage();
}
const cssEsc = (s) => String(s).replace(/["\\]/g, '\\$&');

function cablerArbitrage() {
  for (const b of $$('.st-retenir')) b.onclick = () => statutPrise(b.dataset.prise, 'retenue');
  for (const b of $$('.st-ecarter')) b.onclick = () => statutPrise(b.dataset.prise, 'ecartee');
  for (const b of $$('.st-reproposer')) b.onclick = () => statutPrise(b.dataset.prise, 'proposee');
  for (const b of $$('.st-supprimer')) b.onclick = () => supprimerPrise(b.dataset.prise);
}

async function exporterPack() {
  const btn = $('#st-export'); const rap = $('#st-export-rapport');
  if (btn) { btn.disabled = true; btn.classList.add('tourne'); }
  if (rap) rap.innerHTML = `<div class="st-rapport">Export en cours (ffmpeg)…</div>`;
  try {
    const r = await fetch('/api/studio/export', { method: 'POST' });
    const d = await r.json();
    if (rap) {
      if (d.ffmpeg === false) {
        rap.innerHTML = `<div class="st-rapport err">⚠️ ${esc(d.message)} (${d.candidats} ligne(s) prête(s), 0 convertie).</div>`;
      } else {
        const ech = (d.echecs || []).length;
        rap.innerHTML = `<div class="st-rapport ${ech ? 'partiel' : 'ok'}">
          ✓ ${d.convertis} / ${d.candidats} converties${ech ? ` · ${ech} échec(s)` : ''}. Pack committé (${esc(d.manifest || 'manifest.json')}).
          ${ech ? `<ul>${d.echecs.map((e) => `<li>${esc(e.ligneId)} — ${esc(e.erreur)}</li>`).join('')}</ul>` : ''}</div>`;
      }
    }
  } catch (e) {
    if (rap) rap.innerHTML = `<div class="st-rapport err">Export impossible : ${esc(e.message)}.</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('tourne'); }
  }
}

// ─────────────────────────── Chargement / onglets ──────────────────────────
async function rechargerEtat() {
  try { etatStudio = await fetchJson('/api/studio/etat'); }
  catch { etatStudio = { lignes: {} }; }
  if (!etatStudio.lignes) etatStudio.lignes = {};
}

let enCours = false;
async function charger() {
  if (enCours) return; enCours = true;
  const b = $('#st-recharger'); if (b) b.classList.add('tourne');
  try {
    lignes = await agreger();
    await rechargerEtat();
    $('#st-err').innerHTML = '';
    rendreMode();
    const maj = $('#st-maj'); if (maj) maj.textContent = 'Actualisé ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    const z = $('#st-err'); if (z) z.innerHTML = `<div class="grille"><div class="banniere-err">Impossible de charger le studio (${esc(e.message)}).</div></div>`;
  } finally {
    if (b) b.classList.remove('tourne'); enCours = false;
  }
}

function rendreMode() {
  $('#st-ong-file').classList.toggle('actif', mode !== 'arbitrage');
  $('#st-ong-arbitrage').classList.toggle('actif', mode === 'arbitrage');
  if (mode === 'arbitrage') rendreArbitrage();
  else if (mode === 'enreg') { const f = fileAttente(); if (f.length) rendreEnreg(f[Math.min(indexEnreg, f.length - 1)].id); else rendreFile(); }
  else rendreFile();
}

// Raccourci clavier : espace = enregistrer / stop (en mode enregistrement uniquement).
function onKey(e) {
  if (mode !== 'enreg') return;
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    if (recorder && recorder.state === 'recording') arreterCapture();
    else if (!blobPrise) { const rec = $('#st-rec'); if (rec) rec.click(); }
  }
}

export function monter(hote) {
  hote.innerHTML = GABARIT;
  $('#st-recharger').addEventListener('click', charger);
  $('#st-ong-file').onclick = () => { if (mode === 'arbitrage') { mode = 'file'; } rendreMode(); };
  $('#st-ong-arbitrage').onclick = () => { arretMicro(); mode = 'arbitrage'; rendreMode(); };
  document.addEventListener('keydown', onKey);
  charger();
}

export function demonter() {
  arretMicro();
  document.removeEventListener('keydown', onKey);
}

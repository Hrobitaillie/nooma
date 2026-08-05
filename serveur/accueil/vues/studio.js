// Vue « Studio d'enregistrement » (doc 18 §5) — l'UX de Florence + l'arbitrage de Hugo.
//
// Quatre modes dans une même vue (onglets) :
//   • File d'attente : lignes SANS prise retenue, triées priorité puis type, compteur restant
//     + progression de session (« N enregistrées aujourd'hui »).
//   • Test micro (§5, contrôle qualité d'entrée de session) : choix du périphérique,
//     LIGNE ÉTALON fixe, verdict pic/RMS, comparaison au dernier étalon (niveau + micro),
//     historique réécoutable. Rappel : même pièce, même micro, même distance.
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

// La PHRASE ÉTALON — NE JAMAIS LA CHANGER : elle sert à comparer les sessions entre elles.
const PHRASE_ETALON = 'Bonjour, je suis Plouma ! Écoute bien : le lapin lit un livre, et la petite poule picore. On y va ?';

// ── État module (survit aux allers-retours) ─────────────────
let lignes = [];            // liste unifiée { id, texte, type, contexte, indication, priorite, variables, statut }
let etatStudio = { lignes: {} };
let etalonSessions = [];    // historique /api/studio/etalon (croissant)
let mode = 'file';          // file | etalon | enreg | arbitrage
let indexEnreg = 0;         // position dans la file d'enregistrement
let sessionCompte = 0;      // prises envoyées durant cette session (mémoire module)
let arbitrageId = null;     // ligne ouverte en arbitrage

// Périphérique d'entrée choisi ({ deviceId, label }), mémorisé par navigateur.
let periph = null;
try { periph = JSON.parse(localStorage.getItem('plouma-studio-micro') || 'null'); } catch { periph = null; }

// État micro/enregistrement (vit hors DOM, nettoyé au démontage/refaire).
let flux = null, recorder = null, morceaux = [], blobPrise = null, mimePrise = '';
let audioCtx = null, analyser = null, rafVu = 0, dateDebut = 0, picMax = 0;
let sommeCarres = 0, nMesures = 0; // accumulateur RMS (moyennes de carrés par frame du vu-mètre)

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
    <button id="st-ong-etalon">🎚 Test micro</button>
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
    ${etalonDuJour() ? '' : `<div class="st-banner-etalon">🎚 <b>Test micro pas encore fait aujourd'hui.</b>
      Même pièce, même micro, même distance — enregistrez la ligne étalon avant d'enchaîner les prises.
      <button class="btn" id="st-aller-etalon" type="button">Faire le test micro</button></div>`}
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

  const versEtalon = $('#st-aller-etalon');
  if (versEtalon) versEtalon.onclick = () => { mode = 'etalon'; rendreMode(); };
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
        <span class="st-compteur">${pos + 1} / ${file.length} de la file · <b>${sessionCompte}</b> envoyée(s) cette session · 🎤 ${esc((periph && periph.label) || 'micro par défaut')}</span>
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

// getUserMedia micro NU (périphérique mémorisé si choisi) → true si le flux est prêt.
async function obtenirFlux() {
  if (flux) return true;
  const nu = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: (periph && periph.deviceId) ? { ...nu, deviceId: { exact: periph.deviceId } } : nu,
    });
    return true;
  } catch (e) {
    // Le micro mémorisé a pu disparaître (débranché) → on retente en micro par défaut.
    if (periph && periph.deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ audio: nu });
        setEtat('⚠️ Micro mémorisé introuvable — micro par défaut utilisé. Vérifiez le branchement.', true);
        return true;
      } catch { /* tombe dans le message générique */ }
    }
    setEtat(`🎤 Micro indisponible : <b>${esc(e.name || 'refus')}</b>. Autorisez le micro dans la barre d'adresse (icône cadenas), vérifiez qu'aucune autre appli ne l'utilise, puis réessayez.`, true);
    return false;
  }
}

// MediaRecorder générique : capture + vu-mètre, onFin() appelée quand le blob est prêt.
function demarrerRecorder(onFin) {
  mimePrise = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  try {
    recorder = new MediaRecorder(flux, mimePrise ? { mimeType: mimePrise } : undefined);
  } catch {
    recorder = new MediaRecorder(flux);
  }
  morceaux = [];
  picMax = 0; sommeCarres = 0; nMesures = 0;
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) morceaux.push(ev.data); };
  recorder.onstop = () => {
    blobPrise = new Blob(morceaux, { type: (recorder && recorder.mimeType) || mimePrise || 'audio/webm' });
    mimePrise = blobPrise.type;
    const a = $('#st-audio');
    if (a) { a.src = URL.createObjectURL(blobPrise); a.hidden = false; }
    onFin();
  };
  dateDebut = Date.now();
  recorder.start();
  demarrerVuMetre();
}

// Niveaux mesurés de la dernière capture (pic + RMS moyen), en dB pleine échelle.
function picDbCapture() { return picMax > 0 ? +(20 * Math.log10(picMax)).toFixed(1) : null; }
function rmsDbCapture() { return nMesures > 0 && sommeCarres > 0 ? +(10 * Math.log10(sommeCarres / nMesures)).toFixed(1) : null; }

async function demarrerCapture(l) {
  if (!(await obtenirFlux())) return;
  demarrerRecorder(() => {
    setEtat(`✓ Prise capturée (${(blobPrise.size / 1024).toFixed(0)} Ko). Réécoutez, puis Envoyez ou Refaites.`);
    rendreBoutonsEnreg('capture', l);
  });
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
      let max = 0, carres = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > max) max = v;
        carres += v * v;
      }
      if (max > picMax) picMax = max;
      sommeCarres += carres / buf.length; nMesures++;
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
  const picDb = picDbCapture();
  const rmsDb = rmsDbCapture();
  const qs = new URLSearchParams({ ligne: l.id, dureeMs: String(dureeMs) });
  if (picDb != null) qs.set('picDb', String(picDb));
  if (rmsDb != null) qs.set('rmsDb', String(rmsDb));
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

// ─────────────────────────── Mode : test micro (étalon) ────────────────────
// Contrôle qualité d'entrée de session (doc 18 §5) : ligne étalon fixe, verdict
// pic/RMS, comparaison au dernier étalon (niveau + périphérique), historique.

function dernierEtalon() {
  return etalonSessions.length ? etalonSessions[etalonSessions.length - 1] : null;
}
function etalonDuJour() {
  const auj = new Date().toDateString();
  return etalonSessions.some((s) => new Date(s.date).toDateString() === auj);
}
function labelPeriphCourant() {
  const sel = $('#st-periph');
  if (sel && sel.selectedIndex >= 0 && sel.value) return sel.options[sel.selectedIndex].textContent;
  return (periph && periph.label) || 'micro par défaut';
}

async function listerMicros() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === 'audioinput');
  } catch { return []; }
}

// Verdict : liste de points { niveau: ok|warn|err, texte }. Cibles doc 18 §5 :
// pic entre −12 et −3 dBFS, RMS autour de −20, cohérence de session à ±4 dB.
function verdictEtalon(picDb, rmsDb, label) {
  const pts = [];
  if (picDb == null) {
    pts.push({ niveau: 'warn', texte: 'Pic non mesuré (Web Audio indisponible) — fiez-vous à la réécoute.' });
  } else if (picDb > -1.5) {
    pts.push({ niveau: 'err', texte: `Pic ${picDb} dB : SATURATION — reculez du micro ou baissez le gain, puis refaites.` });
  } else if (picDb < -18) {
    pts.push({ niveau: 'warn', texte: `Pic ${picDb} dB : trop faible — rapprochez-vous (~15 cm) ou montez le gain.` });
  } else {
    pts.push({ niveau: 'ok', texte: `Pic ${picDb} dB : bon niveau (cible −12 à −3).` });
  }
  if (rmsDb != null) {
    if (rmsDb < -30) pts.push({ niveau: 'warn', texte: `Niveau moyen ${rmsDb} dB : trop faible.` });
    else if (rmsDb > -10) pts.push({ niveau: 'warn', texte: `Niveau moyen ${rmsDb} dB : très fort — vérifiez qu'il n'y a pas de distorsion à la réécoute.` });
    else pts.push({ niveau: 'ok', texte: `Niveau moyen ${rmsDb} dB : dans la cible.` });
  }
  const prec = dernierEtalon();
  if (prec) {
    if (prec.peripherique && label && prec.peripherique !== label) {
      pts.push({ niveau: 'err', texte: `Micro DIFFÉRENT du dernier étalon (« ${prec.peripherique} ») — reprenez le même matériel, ou assumez le changement en connaissance de cause.` });
    }
    if (prec.rmsDb != null && rmsDb != null) {
      const delta = +(rmsDb - prec.rmsDb).toFixed(1);
      if (Math.abs(delta) > 4) pts.push({ niveau: 'warn', texte: `Niveau à ${delta > 0 ? '+' : ''}${delta} dB du dernier étalon — ajustez distance ou gain avant d'enchaîner.` });
      else pts.push({ niveau: 'ok', texte: 'Cohérent avec la dernière session.' });
    }
  } else {
    pts.push({ niveau: 'ok', texte: 'Premier étalon — il servira de référence aux sessions suivantes.' });
  }
  return pts;
}

function rendreEtalon() {
  const zone = $('#st-zone');
  const fait = etalonDuJour();
  zone.innerHTML = `
    <div class="st-enreg">
      <div class="st-etalon-rappel">📋 <b>Rituel d'entrée de session</b> : même pièce, même micro,
        même distance (~15 cm), porte fermée, téléphone en silencieux. Enregistrez la phrase étalon,
        vérifiez le verdict, puis passez à la file d'attente.
        ${fait ? '<span class="st-etalon-ok">✓ étalon du jour déjà fait</span>' : ''}</div>
      <div class="st-carte-ligne">
        <span class="lg-type t-consigne">étalon</span>
        <div class="st-grand-texte">${esc(PHRASE_ETALON)}</div>
        <div class="st-contexte">Toujours la même phrase — elle permet de comparer les sessions entre elles.</div>
      </div>
      <div class="st-periph-ligne">
        <label for="st-periph">🎤 Micro :</label>
        <select id="st-periph"><option value="">micro par défaut</option></select>
        <button class="btn" id="st-periph-activer" type="button" hidden>Autoriser le micro</button>
      </div>
      <div class="st-vu" id="st-vu"><div class="st-vu-barre" id="st-vu-barre"></div></div>
      <div class="st-etat-micro" id="st-etat">Prêt. Appuyez sur <b>Enregistrer</b> et lisez la phrase étalon.</div>
      <div class="st-boutons" id="st-boutons"></div>
      <audio id="st-audio" controls hidden style="width:100%;margin-top:14px"></audio>
      <div id="st-verdict"></div>
      ${gabaritHistoriqueEtalon()}
    </div>`;
  blobPrise = null;
  etalonBoutons('pret');
  remplirPeriph();
}

function gabaritHistoriqueEtalon() {
  if (!etalonSessions.length) return '';
  const derniers = etalonSessions.slice(-8).reverse();
  return `<div class="st-etalon-histo">
    <h3>Étalons précédents</h3>
    <table class="lg-table">
      <thead><tr><th>Date</th><th>Par</th><th>Micro</th><th class="c">Pic</th><th class="c">Moyen</th><th>Écoute</th></tr></thead>
      <tbody>${derniers.map((s) => `<tr>
        <td>${esc(new Date(s.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</td>
        <td>${esc(s.utilisateur || '—')}</td>
        <td class="st-periph-cell">${esc(s.peripherique || '—')}</td>
        <td class="c">${s.picDb != null ? esc(s.picDb) + ' dB' : '—'}</td>
        <td class="c">${s.rmsDb != null ? esc(s.rmsDb) + ' dB' : '—'}</td>
        <td><audio controls preload="none" src="/api/studio/etalon/audio/${esc(s.id)}"></audio></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

// Remplit le sélecteur de micros. Les libellés ne sont visibles qu'après une
// autorisation micro : sinon on propose un bouton « Autoriser » qui ouvre le flux.
async function remplirPeriph() {
  const sel = $('#st-periph');
  const btn = $('#st-periph-activer');
  if (!sel) return;
  const micros = await listerMicros();
  const avecLabels = micros.some((m) => m.label);
  if (!avecLabels) {
    if (btn) {
      btn.hidden = false;
      btn.onclick = async () => { if (await obtenirFlux()) { arretMicro(); remplirPeriph(); } };
    }
    return;
  }
  if (btn) btn.hidden = true;
  sel.innerHTML = micros.map((m) =>
    `<option value="${esc(m.deviceId)}">${esc(m.label || 'micro sans nom')}</option>`).join('');
  if (periph && periph.deviceId && micros.some((m) => m.deviceId === periph.deviceId)) {
    sel.value = periph.deviceId;
  }
  sel.onchange = () => {
    periph = { deviceId: sel.value, label: sel.options[sel.selectedIndex].textContent };
    try { localStorage.setItem('plouma-studio-micro', JSON.stringify(periph)); } catch { /* privé */ }
    arretMicro(); // le prochain enregistrement rouvrira le flux sur le bon périphérique
    setEtat(`Micro changé : <b>${esc(periph.label)}</b>. Prêt.`);
  };
}

function etalonBoutons(phase) {
  const b = $('#st-boutons');
  if (!b) return;
  const gros = (id, cls, txt) => `<button class="action ${cls} st-b" id="${id}">${txt}</button>`;
  if (phase === 'pret') {
    b.innerHTML = gros('st-et-rec', 'btn-ok', '● Enregistrer');
  } else if (phase === 'enregistre') {
    b.innerHTML = gros('st-et-stop', 'btn-ko', '■ Stop');
  } else {
    b.innerHTML = gros('st-et-reecouter', 'btn-neutre', '▶ Réécouter')
      + gros('st-et-refaire', 'btn-neutre', '↻ Refaire')
      + gros('st-et-envoyer', 'btn-principal', '✓ Enregistrer l’étalon');
  }
  const rec = $('#st-et-rec'); if (rec) rec.onclick = etalonDemarrer;
  const stop = $('#st-et-stop'); if (stop) stop.onclick = () => arreterCapture();
  const re = $('#st-et-reecouter'); if (re) re.onclick = () => { const a = $('#st-audio'); if (a && !a.hidden) a.play(); };
  const rf = $('#st-et-refaire'); if (rf) rf.onclick = () => {
    blobPrise = null;
    const a = $('#st-audio'); if (a) { a.hidden = true; a.removeAttribute('src'); }
    const v = $('#st-verdict'); if (v) v.innerHTML = '';
    setEtat('Reprise. Appuyez sur Enregistrer.');
    etalonBoutons('pret');
  };
  const env = $('#st-et-envoyer'); if (env) env.onclick = envoyerEtalon;
}

async function etalonDemarrer() {
  if (!(await obtenirFlux())) return;
  remplirPeriph(); // les libellés viennent d'apparaître si c'était la 1re autorisation
  const v = $('#st-verdict'); if (v) v.innerHTML = '';
  demarrerRecorder(() => {
    const pts = verdictEtalon(picDbCapture(), rmsDbCapture(), labelPeriphCourant());
    const pire = pts.some((p) => p.niveau === 'err') ? 'err' : pts.some((p) => p.niveau === 'warn') ? 'warn' : 'ok';
    setEtat(pire === 'ok' ? '✓ Niveaux bons. Réécoutez, puis enregistrez l’étalon.'
      : '⚠️ Vérifiez le verdict ci-dessous avant d’enregistrer l’étalon.', pire === 'err');
    const zv = $('#st-verdict');
    if (zv) zv.innerHTML = `<div class="st-verdict">${pts.map((p) =>
      `<div class="v-${p.niveau}">${p.niveau === 'ok' ? '✓' : p.niveau === 'warn' ? '⚠️' : '✗'} ${esc(p.texte)}</div>`).join('')}</div>`;
    etalonBoutons('capture');
  });
  setEtat('🔴 Enregistrement… lisez la phrase étalon, puis <b>Stop</b>.');
  etalonBoutons('enregistre');
}

async function envoyerEtalon() {
  if (!blobPrise) return;
  const env = $('#st-et-envoyer'); if (env) { env.disabled = true; env.textContent = 'Envoi…'; }
  const qs = new URLSearchParams({ dureeMs: String(Math.max(0, Date.now() - dateDebut)) });
  const picDb = picDbCapture(); if (picDb != null) qs.set('picDb', String(picDb));
  const rmsDb = rmsDbCapture(); if (rmsDb != null) qs.set('rmsDb', String(rmsDb));
  qs.set('peripherique', labelPeriphCourant());
  try {
    const r = await fetch(`/api/studio/etalon?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': mimePrise || 'audio/webm' },
      body: blobPrise,
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
    etalonSessions.push(data.session);
    blobPrise = null;
    rendreEtalon();
    setEtat('✓ Étalon du jour enregistré. Passez à la file d’attente !');
  } catch (e) {
    setEtat(`⚠️ Envoi échoué : ${esc(e.message)}. La prise est conservée, réessayez.`, true);
    if (env) { env.disabled = false; env.textContent = '✓ Enregistrer l’étalon'; }
  }
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
  try {
    const e = await fetchJson('/api/studio/etalon');
    etalonSessions = Array.isArray(e.sessions) ? e.sessions : [];
  } catch { etalonSessions = []; }
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
  $('#st-ong-file').classList.toggle('actif', mode === 'file' || mode === 'enreg');
  $('#st-ong-etalon').classList.toggle('actif', mode === 'etalon');
  $('#st-ong-arbitrage').classList.toggle('actif', mode === 'arbitrage');
  if (mode === 'arbitrage') rendreArbitrage();
  else if (mode === 'etalon') rendreEtalon();
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
  $('#st-ong-file').onclick = () => { if (mode !== 'file' && mode !== 'enreg') { arretMicro(); mode = 'file'; } rendreMode(); };
  $('#st-ong-etalon').onclick = () => { arretMicro(); mode = 'etalon'; rendreMode(); };
  $('#st-ong-arbitrage').onclick = () => { arretMicro(); mode = 'arbitrage'; rendreMode(); };
  document.addEventListener('keydown', onKey);
  charger();
}

export function demonter() {
  arretMicro();
  document.removeEventListener('keydown', onKey);
}

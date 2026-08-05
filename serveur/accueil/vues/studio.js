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
//     frise d'onde live puis ÉDITEUR après le stop (tête de lecture cliquable, sélection à la
//     souris, coupes avec annulation — prise montée envoyée en WAV PCM, sinon source intacte),
//     boutons ● Enregistrer / ■ Stop / ↻ Refaire / ✓ Envoyer / Passer, espace = rec/stop/lecture.
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
let ondesLive = [];               // pics par frame → frise d'onde pendant l'enregistrement

// Éditeur de prise (onde décodée, tête de lecture, sélection, coupes).
let bufferPrise = null;           // AudioBuffer décodé de blobPrise
let montageFait = false;          // ≥1 coupe → on enverra un WAV reconstruit
let picsCache = null;             // pics par colonne (recalculés après coupe/resize)
let selDebut = null, selFin = null, tetePos = 0;   // secondes
let lectureSrc = null, lectureDepart = 0, lectureOffset = 0, rafLecture = 0;
let pileAnnulation = [];          // AudioBuffers précédents (annuler la coupe)

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
  // Mots dérivés des banques + syllabes UNIQUES de leurs découpages (colonne
  // « decoupage », séparateur « - ») : chaque mot ajouté à une banque fait
  // apparaître automatiquement ses nouvelles syllabes dans la file.
  const syllabes = new Map(); // syllabe → { exemple, aVerifier }
  for (const nom of BANQUES) {
    let csv = null;
    try { csv = await fetchTexte(`/contenu/banques/${nom}.csv`); } catch { continue; }
    const li = csv.split(/\r?\n/).filter((x) => x.trim() !== '');
    if (li.length < 2) continue;
    const entete = champs(li[0]);
    const iMot = entete.indexOf('mot');
    const iDec = entete.indexOf('decoupage');
    const iVerif = entete.indexOf('aVerifier');
    if (iMot < 0) continue;
    for (let k = 1; k < li.length; k++) {
      const c = champs(li[k]);
      const mot = (c[iMot] || '').trim().normalize('NFC');
      if (!mot) continue;
      out.push({
        id: `mot-${mot}`, texte: mot, type: 'mot', contexte: `Banque « ${nom} » — mot prononcé`,
        indication: 'articulé, naturel', variables: [], priorite: 2, statut: 'actif', source: `banque:${nom}`,
      });
      if (iDec < 0) continue;
      const verif = iVerif >= 0 && (c[iVerif] || '').trim() === 'oui';
      for (const brut of (c[iDec] || '').split('-')) {
        const s = brut.trim().normalize('NFC');
        if (!s) continue;
        const connu = syllabes.get(s);
        if (!connu) syllabes.set(s, { exemple: mot, aVerifier: verif });
        else if (verif) connu.aVerifier = true;
      }
    }
  }
  for (const [s, info] of syllabes) {
    out.push({
      id: `syllabe-${s}`, texte: s, type: 'syllabe',
      contexte: `Syllabe orale « ${s} » (ex. « ${info.exemple} ») — prononcée détachée, comme en découpant le mot`
        + (info.aVerifier ? ' · ⚠️ découpage marqué « à vérifier » (e caduc)' : ''),
      indication: 'syllabe détachée, nette, sans allonger la voyelle', variables: [],
      priorite: 2, statut: 'actif', source: 'banques:decoupage',
    });
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

// Ordre de type pour la file : phonèmes/consignes d'abord, puis syllabes, mots ensuite.
const RANG_TYPE = { phoneme: 0, consigne: 1, feedback: 2, interpellation: 3, babillage: 4, histoire: 5, syllabe: 6, mot: 7 };
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
  bufferPrise = null; montageFait = false; picsCache = null;
  selDebut = selFin = null; tetePos = 0; pileAnnulation = [];
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
      <canvas id="st-onde" class="st-onde" height="110"></canvas>
      <div class="st-onde-outils" id="st-onde-outils" hidden>
        <button class="btn" id="st-ed-lire" type="button">▶ Lire</button>
        <button class="btn" id="st-ed-couper" type="button" disabled>✂ Couper la sélection</button>
        <button class="btn" id="st-ed-annuler" type="button" disabled>↩ Annuler</button>
        <span class="st-ed-duree" id="st-ed-duree"></span>
      </div>
      <div class="st-hint st-onde-aide" id="st-onde-aide" hidden>Cliquez sur l'onde pour placer la tête de lecture, glissez pour sélectionner un passage à couper (espace = lire/pause).</div>
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
      + gros('st-passer', 'btn-neutre', 'Passer →');
  } else if (phase === 'enregistre') {
    b.innerHTML = gros('st-stop', 'btn-ko', '■ Stop');
  } else if (phase === 'capture') {
    // L'écoute et les coupes vivent dans la barre d'outils de l'onde.
    b.innerHTML = gros('st-refaire', 'btn-neutre', '↻ Refaire')
      + gros('st-envoyer', 'btn-principal', '✓ Envoyer & suivant')
      + gros('st-passer', 'btn-neutre', 'Passer →');
  }
  cablerBoutons(l);
}

function cablerBoutons(l) {
  const rec = $('#st-rec'); if (rec) rec.onclick = () => demarrerCapture(l);
  const stop = $('#st-stop'); if (stop) stop.onclick = () => arreterCapture(l);
  const rf = $('#st-refaire'); if (rf) rf.onclick = () => {
    blobPrise = null;
    reinitialiserEditeur();
    const a = $('#st-audio'); if (a) { a.hidden = true; a.removeAttribute('src'); }
    setEtat('Reprise. Appuyez sur Enregistrer.');
    rendreBoutonsEnreg('pret', l);
  };
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
  picMax = 0; sommeCarres = 0; nMesures = 0; ondesLive = [];
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
  reinitialiserEditeur();
  demarrerRecorder(() => {
    setEtat(`✓ Prise capturée (${(blobPrise.size / 1024).toFixed(0)} Ko). Écoutez, coupez si besoin, puis Envoyez ou Refaites.`);
    rendreBoutonsEnreg('capture', l);
    initialiserEditeur();
  });
  setEtat('🔴 Enregistrement… parlez, puis <b>Stop</b> (ou espace).');
  rendreBoutonsEnreg('enregistre', l);
}

function arreterCapture() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  arretVuMetre();
}

function ctxAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function demarrerVuMetre() {
  try {
    const src = ctxAudio().createMediaStreamSource(flux);
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
      ondesLive.push(max);
      dessinerLive();
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
  arreterLecture();
  try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* rien */ }
  recorder = null;
  if (flux) { for (const t of flux.getTracks()) t.stop(); flux = null; }
  if (audioCtx) { try { audioCtx.close(); } catch { /* rien */ } audioCtx = null; }
  analyser = null;
}

async function envoyer(l) {
  if (!blobPrise) return;
  arreterLecture();
  const env = $('#st-envoyer'); if (env) { env.disabled = true; env.textContent = 'Envoi…'; }
  // Sans coupe : la prise SOURCE part telle quelle (on ne transcode jamais deux fois).
  // Avec coupes : WAV PCM reconstruit depuis l'audio décodé et monté.
  let corps = blobPrise, type = mimePrise || 'audio/webm';
  let dureeMs = Math.max(0, Date.now() - dateDebut);
  if (montageFait && bufferPrise) {
    corps = bufferVersWav(bufferPrise);
    type = 'audio/wav';
    dureeMs = Math.round(bufferPrise.duration * 1000);
  }
  const picDb = picDbCapture();
  const rmsDb = rmsDbCapture();
  const qs = new URLSearchParams({ ligne: l.id, dureeMs: String(dureeMs) });
  if (picDb != null) qs.set('picDb', String(picDb));
  if (rmsDb != null) qs.set('rmsDb', String(rmsDb));
  try {
    const r = await fetch(`/api/studio/prise?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: corps,
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
  reinitialiserEditeur();
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

// ────────────── Éditeur de prise : onde, tête de lecture, coupes ───────────
// Zéro dépendance : AnalyserNode pour la frise live, decodeAudioData pour
// l'onde complète, AudioBufferSourceNode pour la lecture (les blobs de
// MediaRecorder ont une durée « Infinity » dans <audio>, on n'y touche pas).

let coulOnde = null;
function couleursOnde() {
  if (!coulOnde) {
    const cs = getComputedStyle(document.documentElement);
    const v = (nom, defaut) => (cs.getPropertyValue(nom) || defaut).trim();
    coulOnde = {
      barre: v('--accent', '#3b6fe0'),
      tete: v('--rouge', '#c0392b'),
      selection: 'rgba(59,111,224,.18)',
      bord: v('--trait', '#e6eaf2'),
    };
  }
  return coulOnde;
}

function preparerCanvas() {
  const c = $('#st-onde');
  if (!c) return null;
  if (c.clientWidth && c.width !== c.clientWidth) { c.width = c.clientWidth; picsCache = null; }
  return c;
}

// Frise live pendant l'enregistrement : un pic par frame, défile vers la gauche.
function dessinerLive() {
  const c = preparerCanvas();
  if (!c) return;
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const n = Math.min(ondesLive.length, W);
  const dep = ondesLive.length - n;
  g.fillStyle = couleursOnde().barre;
  for (let i = 0; i < n; i++) {
    const h = Math.max(2, ondesLive[dep + i] * H);
    g.fillRect(i, (H - h) / 2, 1, h);
  }
}

// Pics min/max par colonne de pixels pour l'onde décodée.
function picsParColonne(buf, W) {
  const ch = buf.getChannelData(0);
  const parCol = Math.max(1, Math.floor(ch.length / W));
  const pics = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let m = 0;
    const d = x * parCol, f = Math.min(ch.length, d + parCol);
    for (let i = d; i < f; i++) { const v = Math.abs(ch[i]); if (v > m) m = v; }
    pics[x] = m;
  }
  return pics;
}

function dessinerEditeur() {
  const c = preparerCanvas();
  if (!c || !bufferPrise) return;
  if (!picsCache) picsCache = picsParColonne(bufferPrise, c.width);
  const g = c.getContext('2d');
  const W = c.width, H = c.height, duree = bufferPrise.duration;
  const px = (s) => Math.round((s / duree) * W);
  g.clearRect(0, 0, W, H);
  if (selDebut != null && selFin != null) {
    g.fillStyle = couleursOnde().selection;
    g.fillRect(px(selDebut), 0, Math.max(1, px(selFin) - px(selDebut)), H);
  }
  g.fillStyle = couleursOnde().barre;
  for (let x = 0; x < W; x++) {
    const h = Math.max(2, picsCache[x] * H * 0.92);
    g.fillRect(x, (H - h) / 2, 1, h);
  }
  g.fillStyle = couleursOnde().tete;
  g.fillRect(Math.min(W - 2, px(tetePos)), 0, 2, H);
}

function majOutilsEditeur() {
  const lire = $('#st-ed-lire');
  if (lire) lire.textContent = lectureSrc ? '■ Pause' : '▶ Lire';
  const coupe = $('#st-ed-couper');
  if (coupe) coupe.disabled = !(bufferPrise && selDebut != null && selFin != null && selFin - selDebut > 0.02);
  const ann = $('#st-ed-annuler');
  if (ann) ann.disabled = pileAnnulation.length === 0;
  const dur = $('#st-ed-duree');
  if (dur && bufferPrise) dur.textContent = `${bufferPrise.duration.toFixed(1)} s${montageFait ? ' · monté → WAV' : ''}`;
}

function reinitialiserEditeur() {
  arreterLecture();
  bufferPrise = null; montageFait = false; picsCache = null;
  selDebut = selFin = null; tetePos = 0; pileAnnulation = [];
  const outils = $('#st-onde-outils'); if (outils) outils.hidden = true;
  const aide = $('#st-onde-aide'); if (aide) aide.hidden = true;
  const c = $('#st-onde'); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

async function initialiserEditeur() {
  try {
    const ab = await blobPrise.arrayBuffer();
    bufferPrise = await ctxAudio().decodeAudioData(ab);
  } catch {
    // Décodage impossible → repli : le lecteur <audio> natif suffit pour écouter.
    const a = $('#st-audio'); if (a) a.hidden = false;
    return;
  }
  const outils = $('#st-onde-outils'); if (outils) outils.hidden = false;
  const aide = $('#st-onde-aide'); if (aide) aide.hidden = false;
  cablerEditeur();
  dessinerEditeur();
  majOutilsEditeur();
}

function cablerEditeur() {
  const c = $('#st-onde');
  if (!c) return;
  const posSec = (e) => {
    const r = c.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return p * bufferPrise.duration;
  };
  let dragDepart = null;
  c.onpointerdown = (e) => {
    if (!bufferPrise) return;
    c.setPointerCapture(e.pointerId);
    arreterLecture(); majOutilsEditeur();
    dragDepart = posSec(e);
    selDebut = selFin = null;
    dessinerEditeur();
  };
  c.onpointermove = (e) => {
    if (dragDepart == null || !bufferPrise) return;
    const s = posSec(e);
    if (Math.abs(s - dragDepart) > 0.02) {
      selDebut = Math.min(dragDepart, s);
      selFin = Math.max(dragDepart, s);
      dessinerEditeur(); majOutilsEditeur();
    }
  };
  c.onpointerup = (e) => {
    if (dragDepart == null || !bufferPrise) return;
    if (selDebut == null) { tetePos = posSec(e); dessinerEditeur(); }
    dragDepart = null;
    majOutilsEditeur();
  };
  const lire = $('#st-ed-lire');
  if (lire) lire.onclick = () => { if (lectureSrc) { arreterLecture(); majOutilsEditeur(); dessinerEditeur(); } else lireEditeur(); };
  const coupe = $('#st-ed-couper'); if (coupe) coupe.onclick = couperSelection;
  const ann = $('#st-ed-annuler'); if (ann) ann.onclick = annulerCoupe;
}

function lireEditeur() {
  if (!bufferPrise) return;
  arreterLecture();
  const ctx = ctxAudio();
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = bufferPrise;
  src.connect(ctx.destination);
  const aSel = selDebut != null && selFin != null && selFin - selDebut > 0.02;
  const dep = aSel ? selDebut : (tetePos >= bufferPrise.duration - 0.05 ? 0 : tetePos);
  lectureSrc = src; lectureOffset = dep; lectureDepart = ctx.currentTime;
  src.onended = () => {
    if (lectureSrc !== src) return;
    lectureSrc = null;
    cancelAnimationFrame(rafLecture); rafLecture = 0;
    majOutilsEditeur(); dessinerEditeur();
  };
  if (aSel) src.start(0, dep, selFin - dep); else src.start(0, dep);
  const tick = () => {
    tetePos = Math.min(bufferPrise.duration, lectureOffset + (ctxAudio().currentTime - lectureDepart));
    dessinerEditeur();
    rafLecture = requestAnimationFrame(tick);
  };
  tick();
  majOutilsEditeur();
}

function arreterLecture() {
  if (lectureSrc) {
    const src = lectureSrc;
    lectureSrc = null;
    try { src.onended = null; src.stop(); } catch { /* déjà arrêtée */ }
  }
  if (rafLecture) { cancelAnimationFrame(rafLecture); rafLecture = 0; }
}

function couperSelection() {
  if (!bufferPrise || selDebut == null || selFin == null || selFin - selDebut < 0.02) return;
  arreterLecture();
  const sr = bufferPrise.sampleRate, nc = bufferPrise.numberOfChannels;
  const d = Math.max(0, Math.floor(selDebut * sr));
  const f = Math.min(bufferPrise.length, Math.ceil(selFin * sr));
  const reste = bufferPrise.length - (f - d);
  if (reste < sr * 0.05) { setEtat('⚠️ Coupe refusée : il ne resterait presque rien de la prise.', true); return; }
  pileAnnulation.push(bufferPrise);
  if (pileAnnulation.length > 10) pileAnnulation.shift();
  const nb = ctxAudio().createBuffer(nc, reste, sr);
  for (let ch = 0; ch < nc; ch++) {
    const av = bufferPrise.getChannelData(ch), ap = nb.getChannelData(ch);
    ap.set(av.subarray(0, d), 0);
    ap.set(av.subarray(f), d);
  }
  bufferPrise = nb; montageFait = true; picsCache = null;
  tetePos = Math.min(selDebut, nb.duration);
  selDebut = selFin = null;
  setEtat('✂️ Passage coupé. Réécoutez pour vérifier le raccord.');
  dessinerEditeur(); majOutilsEditeur();
}

function annulerCoupe() {
  if (!pileAnnulation.length) return;
  arreterLecture();
  bufferPrise = pileAnnulation.pop();
  montageFait = pileAnnulation.length > 0;
  picsCache = null; selDebut = selFin = null; tetePos = 0;
  setEtat('↩ Coupe annulée.');
  dessinerEditeur(); majOutilsEditeur();
}

// AudioBuffer → WAV PCM 16 bits (envoyé seulement quand la prise a été montée).
function bufferVersWav(buf) {
  const nc = Math.min(2, buf.numberOfChannels), sr = buf.sampleRate, n = buf.length;
  const total = 44 + n * nc * 2;
  const dv = new DataView(new ArrayBuffer(total));
  const ecrire = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ecrire(0, 'RIFF'); dv.setUint32(4, total - 8, true); ecrire(8, 'WAVE');
  ecrire(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true);
  ecrire(36, 'data'); dv.setUint32(40, n * nc * 2, true);
  const canaux = [];
  for (let ch = 0; ch < nc; ch++) canaux.push(buf.getChannelData(ch));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < nc; ch++) {
      const v = Math.max(-1, Math.min(1, canaux[ch][i]));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([dv.buffer], { type: 'audio/wav' });
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
      <canvas id="st-onde" class="st-onde" height="110"></canvas>
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

// Raccourci clavier (mode enregistrement) : espace = enregistrer / stop, puis lire / pause.
function onKey(e) {
  if (mode !== 'enreg') return;
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    if (recorder && recorder.state === 'recording') arreterCapture();
    else if (!blobPrise) { const rec = $('#st-rec'); if (rec) rec.click(); }
    else if (bufferPrise) {
      if (lectureSrc) { arreterLecture(); majOutilsEditeur(); dessinerEditeur(); }
      else lireEditeur();
    }
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

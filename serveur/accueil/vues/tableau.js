// Vue « Tableau de bord » — vue d'accueil de l'atelier.
// Agrégation lecture seule via /api/tableau-de-bord (KPIs, banques, suivi, simulateur,
// activité, serveur). Rafraîchissement manuel + auto toutes les 60 s tant que la vue
// est montée ; l'intervalle est nettoyé au démontage.

import { $, esc, fetchJson, relatif, dureeHumaine, nomFichier } from '/accueil/app.js';

export const titre = 'Tableau de bord';

const GABARIT = `
  <div class="topbar">
    <div>
      <h1>Tableau de bord</h1>
      <div class="fil">Vue d'ensemble du projet Plouma — contenu, suivi, moteur et activité.</div>
    </div>
    <div class="actions">
      <span class="maj" id="maj">—</span>
      <button class="btn" id="recharger" type="button">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Recharger
      </button>
    </div>
  </div>

  <div id="err-zone"></div>

  <section class="kpis" id="kpis">
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Mots validés</div>
      <div class="k-val sq" id="kpi-mots-v">00 <small>/ 00</small></div>
      <div class="k-sous" id="kpi-mots-p">—</div>
      <div class="barre"><span id="kpi-mots-barre" style="width:0"></span></div>
    </div>
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Commentaires ouverts</div>
      <div class="k-val sq" id="kpi-comm">0</div>
      <div class="k-sous" id="kpi-comm-sous">—</div>
    </div>
    <div class="kpi">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg> Verdicts simulateur</div>
      <div class="k-val sq" id="kpi-sim">0 <small>/ 0</small></div>
      <div class="k-sous" id="kpi-sim-sous">—</div>
    </div>
    <div class="kpi" id="kpi-git-carte">
      <div class="k-tete"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg> Commits à pousser</div>
      <div class="k-val sq" id="kpi-git">0</div>
      <div class="k-sous" id="kpi-git-sous">—</div>
    </div>
  </section>

  <section class="grille">
    <article class="carte large">
      <div class="c-tete">
        <h2><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Relecture du contenu</h2>
        <a class="lien" href="#/banque">Voir la banque →</a>
      </div>
      <div id="banques"><div class="vide">Chargement…</div></div>
      <div class="action-carte">
        <a class="btn primaire" href="#/relecture">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Continuer la relecture
        </a>
      </div>
    </article>

    <article class="carte moyenne">
      <div class="c-tete">
        <h2><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Suivi projet</h2>
        <span class="lien" id="suivi-total" style="color:var(--doux)">—</span>
      </div>
      <div class="stack" id="suivi-stack" title="Répartition des tâches">
        <span class="seg-fait" style="width:0"></span>
        <span class="seg-recette" style="width:0"></span>
        <span class="seg-todo" style="width:0"></span>
        <span class="seg-reporte" style="width:0"></span>
      </div>
      <div class="legende" id="suivi-legende"></div>
      <div class="note-suivi" id="suivi-note"></div>
    </article>

    <article class="carte moyenne">
      <div class="c-tete">
        <h2><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg> Simulateur du Directeur</h2>
        <a class="lien" href="#/simulateur">Détails →</a>
      </div>
      <div id="verdicts"><div class="vide">Chargement…</div></div>
      <div class="sim-meta" id="sim-meta"></div>
    </article>

    <article class="carte large">
      <div class="c-tete">
        <h2><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Activité récente</h2>
      </div>
      <div id="activite"><div class="vide">Chargement…</div></div>
    </article>

    <article class="carte pleine">
      <div class="c-tete">
        <h2><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> État du serveur</h2>
      </div>
      <div class="serveur-grille" id="serveur"><div class="vide">Chargement…</div></div>
    </article>
  </section>`;

// ── Rendus par section ──────────────────────────────────────
function rendreKpis(d) {
  const c = d.contenu || {};
  const mots = c.mots || 0, val = c.valides || 0;
  const pct = mots ? Math.round((val / mots) * 100) : 0;
  $('#kpi-mots-v').innerHTML = `${val} <small>/ ${mots}</small>`;
  $('#kpi-mots-p').textContent = `${pct} % validés · ${c.aRelire || 0} à relire`;
  $('#kpi-mots-barre').style.width = pct + '%';

  const cm = d.commentaires || {};
  $('#kpi-comm').textContent = cm.nonResolus ?? 0;
  $('#kpi-comm-sous').textContent = `${cm.resolus ?? 0} résolus · ${cm.total ?? 0} au total`;

  const sim = d.simulateur || {};
  if (sim.present) {
    $('#kpi-sim').innerHTML = `${sim.okTotal ?? 0} <small>/ ${sim.total ?? 0}</small>`;
    $('#kpi-sim-sous').textContent = (sim.okTotal === sim.total) ? 'tous les verdicts au vert' : `${(sim.total - sim.okTotal)} verdict(s) hors cible`;
  } else {
    $('#kpi-sim').innerHTML = `— <small>/ —</small>`;
    $('#kpi-sim-sous').textContent = 'aucune exécution';
  }

  const sv = d.serveur || {};
  const carte = $('#kpi-git-carte');
  if (sv.pushOk === false) {
    carte.classList.add('alerte');
    $('#kpi-git').textContent = (sv.commitsEnAvance != null ? sv.commitsEnAvance : '⚠');
    $('#kpi-git-sous').innerHTML = `<span class="k-alerte"><svg style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> deploy key GitHub manquante</span>`;
  } else {
    carte.classList.remove('alerte');
    const n = sv.commitsEnAvance ?? 0;
    $('#kpi-git').textContent = n;
    $('#kpi-git-sous').textContent = n === 0 ? 'clone à jour avec origin' : `en attente de push`;
  }
}

function rendreBanques(d) {
  const c = d.contenu || {};
  const banques = c.banques || [];
  const el = $('#banques');
  if (banques.length === 0) {
    el.innerHTML = `<div class="vide">Aucune banque de mots trouvée.</div>`;
  } else {
    el.innerHTML = banques.map((b) => {
      const pct = b.mots ? Math.round((b.valides / b.mots) * 100) : 0;
      return `<div class="ligne-banque">
        <div class="lb-tete">
          <b>${esc(b.fichier.replace('.csv', ''))}</b>
          <span class="chiffres"><em>${b.valides}</em> / ${b.mots} validés · ${pct} %</span>
        </div>
        <div class="barre"><span style="width:${pct}%"></span></div>
        <div class="lb-meta">
          <span class="pastille"><i class="pt v"></i>${b.valides} validés</span>
          <span class="pastille"><i class="pt r"></i>${b.aRelire} à relire</span>
          <span class="pastille"><i class="pt a"></i>${b.aVerifier} à vérifier</span>
        </div>
      </div>`;
    }).join('');
  }
  if (c.modules != null || c.mecaniques != null) {
    const lg = d.lignes || {};
    const st = d.studio || {};
    el.innerHTML += `<div class="lb-meta" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--trait)">
      <span><b>${c.modules ?? '—'}</b> modules</span>
      <span><b>${c.competences ?? '—'}</b> compétences</span>
      <span><b>${c.mecaniques ?? '—'}</b> mécaniques</span>
      <span><a class="lien" href="#/lignes"><b>${lg.total ?? 0}</b> lignes de texte</a></span>
      <span><a class="lien" href="#/studio"><b>${st.avecRetenue ?? 0}</b> / ${st.total ?? 0} audio retenu</a></span>
    </div>`;
  }
}

function rendreSuivi(d) {
  const s = (d.suivi && d.suivi.statuts) || {};
  const total = (d.suivi && d.suivi.total) || 0;
  const fait = s['validee'] || 0, recette = s['en-recette'] || 0, todo = s['a-developper'] || 0, reporte = s['reportee'] || 0;
  const w = (n) => total ? (n / total * 100).toFixed(1) + '%' : '0';
  const st = $('#suivi-stack').children;
  st[0].style.width = w(fait); st[1].style.width = w(recette); st[2].style.width = w(todo); st[3].style.width = w(reporte);
  $('#suivi-total').textContent = `${total} tâches`;
  const lignes = [
    ['seg-fait', 'Fait', fait], ['seg-recette', 'En recette', recette],
    ['seg-todo', 'À développer', todo], ['seg-reporte', 'Reporté', reporte],
  ];
  $('#suivi-legende').innerHTML = lignes.map(([cl, nom, n]) =>
    `<div class="leg"><span class="car ${cl}"></span>${nom}<span class="n">${n}</span></div>`).join('');
  $('#suivi-note').textContent = (d.suivi && d.suivi.note) || '';
}

function rendreSimulateur(d) {
  const sim = d.simulateur || {};
  const el = $('#verdicts');
  if (!sim.present || !sim.verdicts || sim.verdicts.length === 0) {
    el.innerHTML = `<div class="vide">Aucun résultat de simulation committé.<br>Lancez le simulateur pour peupler cette carte.</div>`;
    $('#sim-meta').innerHTML = '';
    return;
  }
  el.innerHTML = sim.verdicts.map((v) => `
    <div class="verdict">
      <span class="marque-ok ${v.ok ? 'ok' : 'ko'}">${v.ok
        ? '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}</span>
      <span class="v-nom">${esc(v.nom)}</span>
      <span class="v-val">${esc(v.valeur)}</span>
    </div>`).join('');
  const m = sim.meta || {};
  $('#sim-meta').innerHTML =
    `<span><b>${m.enfants ?? '—'}</b> enfants × <b>${m.semaines ?? '—'}</b> semaines</span>` +
    (m.seed ? `<span>seed <b>${esc(m.seed)}</b></span>` : '');
}

function rendreActivite(d) {
  const ent = (d.activite && d.activite.entrees) || [];
  const el = $('#activite');
  if (ent.length === 0) {
    el.innerHTML = `<div class="vide"><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Aucune écriture enregistrée pour l’instant.</div>`;
    return;
  }
  el.innerHTML = `<ul class="flux">${ent.map((e) => {
    const u = e.utilisateur || '?';
    const geste = e.endpoint && e.endpoint.includes('comments') ? 'a commenté'
      : e.endpoint && e.endpoint.includes('estimations') ? 'a estimé'
      : 'a modifié';
    return `<li>
      <span class="av">${esc(u.slice(0, 2))}</span>
      <div class="corps">
        <div class="t"><b>${esc(u)}</b> ${geste} <b>${esc(nomFichier(e.fichier)) || 'un fichier'}</b></div>
        <div class="f">${esc(e.fichier || '')}</div>
      </div>
      <span class="quand" title="${esc(e.date || '')}">${esc(relatif(e.date))}</span>
    </li>`;
  }).join('')}</ul>`;
}

function rendreServeur(d) {
  const sv = d.serveur || {};
  const commit = sv.dernierCommit || {};
  const dateCommit = commit.date ? new Date(commit.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const puce = sv.pushOk === false
    ? `<span class="puce-sv ko"><span class="p"></span> push en attente</span>`
    : `<span class="puce-sv ok"><span class="p"></span> synchronisé</span>`;
  $('#serveur').innerHTML = `
    <div class="sv"><div class="lab">Branche</div><div class="val mono">${esc(sv.branche || '—')}</div></div>
    <div class="sv"><div class="lab">Dernier commit</div><div class="val">${esc(commit.sujet || '—')}<br><span style="color:var(--tres-doux);font-size:12px">${esc(dateCommit)}</span></div></div>
    <div class="sv"><div class="lab">Synchro Git</div><div class="val">${puce}${sv.commitsEnAvance != null ? ` <span style="color:var(--doux)">· ${sv.commitsEnAvance} en avance</span>` : ''}</div></div>
    <div class="sv"><div class="lab">Uptime</div><div class="val">${esc(dureeHumaine(sv.uptimeSecondes))}</div></div>
    <div class="sv"><div class="lab">Node</div><div class="val mono">${esc(sv.node || '—')}</div></div>`;
}

// ── Chargement / rafraîchissement ───────────────────────────
let enCours = false;
let minuteur = null;

async function charger() {
  if (enCours) return;
  enCours = true;
  const bouton = $('#recharger');
  if (bouton) bouton.classList.add('tourne');
  try {
    const d = await fetchJson('/api/tableau-de-bord', { headers: { Accept: 'application/json' } });
    $('#err-zone').innerHTML = '';
    rendreKpis(d);
    rendreBanques(d);
    rendreSuivi(d);
    rendreSimulateur(d);
    rendreActivite(d);
    rendreServeur(d);
    const maj = $('#maj');
    if (maj) maj.textContent = 'Actualisé ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    const z = $('#err-zone');
    if (z) z.innerHTML = `<div class="grille"><div class="banniere-err">
      <svg style="width:18px;height:18px;flex:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Impossible de charger le tableau de bord (${esc(e.message)}). Nouvel essai automatique dans une minute.
    </div></div>`;
  } finally {
    if (bouton) bouton.classList.remove('tourne');
    enCours = false;
  }
}

export function monter(hote) {
  hote.innerHTML = GABARIT;
  $('#recharger').addEventListener('click', charger);
  charger();
  minuteur = setInterval(charger, 60_000);
}

export function demonter() {
  if (minuteur) { clearInterval(minuteur); minuteur = null; }
}

// Vue « Simulateur » — port natif de cadrage/simulateur/dashboard/index.html.
// Verdicts, courbes de réussite par profil (SVG inline), histogramme niveaux/biome,
// jours/biome par profil, compteurs de protection. Source : /cadrage/simulateur/out/
// results.json (peut manquer → message clair). Courbes/barres recolorisées dans une
// gamme navy cohérente + teintes sémantiques.

import { $, esc, fetchJson } from '/accueil/app.js';

export const titre = 'Simulateur';

const URL_RESULTS = '/cadrage/simulateur/out/results.json';

// Gamme navy + sémantiques (une couleur par profil).
const COULEURS = {
  'rapide': '#2e8b62',        // vert : va vite / bien
  'moyen': '#2f4d8a',         // navy accent
  'lent': '#3a4a6d',          // navy clair
  'irrégulier': '#c07a2a',    // orange : variable
  'en difficulté': '#c04a44', // rouge : sémantique alerte
};
const GRILLE = '#e7eaef';
const BANDE = '#2e8b6218'; // cible verte, très douce
const BARRE_DEFAUT = '#2f4d8a';

function graphLignes(parProfil, semaines, cibleMin, cibleMax) {
  const W = 1020, H = 260, m = { t: 14, r: 10, b: 26, l: 40 };
  const x = (i) => m.l + (i / Math.max(1, semaines - 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - 0.5) / 0.5) * (H - m.t - m.b); // axe 50 % → 100 %
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  s += `<rect x="${m.l}" y="${y(cibleMax)}" width="${W - m.l - m.r}" height="${y(cibleMin) - y(cibleMax)}" fill="${BANDE}"/>`;
  for (const v of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${GRILLE}"/>`
      + `<text x="4" y="${y(v) + 4}">${Math.round(v * 100)} %</text>`;
  }
  for (const [nom, p] of Object.entries(parProfil)) {
    const pts = p.tauxParSemaine.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${COULEURS[nom] || BARRE_DEFAUT}" stroke-width="2.2"/>`;
  }
  for (let i = 0; i < semaines; i += 4) s += `<text x="${x(i)}" y="${H - 8}">S${i + 1}</text>`;
  return s + '</svg>';
}

function graphBarres(entries, couleur = BARRE_DEFAUT) {
  const W = 1020, H = 200, m = { t: 12, r: 10, b: 26, l: 40 };
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const bw = (W - m.l - m.r) / entries.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
  entries.forEach(([nom, v], i) => {
    const h = (v / max) * (H - m.t - m.b);
    const cx = m.l + i * bw;
    const fill = typeof couleur === 'function' ? couleur(nom) : couleur;
    s += `<rect x="${cx + bw * 0.14}" y="${H - m.b - h}" width="${bw * 0.72}" height="${h}" rx="6" fill="${fill}"/>`
      + `<text x="${cx + bw / 2}" y="${H - m.b - h - 5}" text-anchor="middle" style="font-weight:700; fill:#141a24">${v}</text>`
      + `<text x="${cx + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(nom)}</text>`;
  });
  return s + '</svg>';
}

const ENTETE = `
  <div class="topbar">
    <div>
      <h1>Simulateur du Directeur</h1>
      <div class="fil">Enfants virtuels contre le moteur adaptatif — paramètres pré-validés (docs 02 §5 &amp; 04). Relancer : <code>npm run sim</code>.</div>
    </div>
  </div>`;

export async function monter(hote) {
  hote.innerHTML = ENTETE + '<div id="sim-corps"></div>';
  const corps = $('#sim-corps', hote);

  let d;
  try {
    d = await fetchJson(URL_RESULTS);
  } catch (e) {
    corps.innerHTML = `<div class="vide" style="padding:48px 20px">
      <svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
      Aucun résultat de simulation committé (${esc(e.message)}).<br>
      Lancer d'abord : <code>npm run sim</code>.
    </div>`;
    return;
  }

  const parts = [];

  // Verdicts
  parts.push(`<div class="sim-verdicts">${(d.verdicts || []).map((v) => `
    <div class="sim-verdict">
      <span class="marque-ok ${v.ok ? 'ok' : 'ko'}">${v.ok
        ? '<svg style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}</span>
      <div><div class="valeur">${esc(v.valeur)}</div><div class="nom">${esc(v.nom)}</div></div>
    </div>`).join('')}</div>`);

  // Taux de réussite hebdomadaire
  parts.push(`<h2 class="sim-section-titre">Taux de réussite par semaine et par profil (bande verte = cible ${Math.round(d.meta.params.cibleReussiteMin * 100)}-${Math.round(d.meta.params.cibleReussiteMax * 100)} %)</h2>`);
  const legende = Object.keys(d.parProfil)
    .map((n) => `<span style="--c:${COULEURS[n] || BARRE_DEFAUT}">${esc(n)} (n=${d.parProfil[n].n})</span>`).join('');
  parts.push(`<div class="carte sim-graph">
    ${graphLignes(d.parProfil, d.meta.semaines, d.meta.params.cibleReussiteMin, d.meta.params.cibleReussiteMax)}
    <div class="sim-legende">${legende}</div>
  </div>`);

  // Histogramme niveaux par biome
  const ordre = ['≤5', '6-10', '11-15', '16-20', '21-30', '>30'];
  const histo = ordre.filter((b) => d.histoNiveauxParBiome && d.histoNiveauxParBiome[b] != null)
    .map((b) => [b, d.histoNiveauxParBiome[b]]);
  parts.push(`<h2 class="sim-section-titre">Niveaux joués avant de sortir d’un biome (profils hors difficulté)</h2>`);
  parts.push(`<div class="carte sim-graph">${histo.length ? graphBarres(histo) : '<div class="vide">Aucune donnée.</div>'}</div>`);

  // Jours par biome par profil
  parts.push(`<h2 class="sim-section-titre">Jours pour valider un biome (médiane par profil)</h2>`);
  const joursEntries = Object.entries(d.parProfil).map(([n, p]) => [n, p.joursParBiomeMediane]);
  parts.push(`<div class="carte sim-graph">${graphBarres(joursEntries, (n) => COULEURS[n] || BARRE_DEFAUT)}</div>`);

  // Compteurs de protection
  parts.push(`<h2 class="sim-section-titre">Mécanismes de protection</h2>`);
  const g = d.global || {};
  const compteurs = [
    [g.interventionsStagnation, 'interventions stagnation (bascule mécanique + cran −1)', false],
    [g.signauxParent, 'signaux discrets côté parent', false],
    [g.coinces, 'enfants passés par un « tapis roulant » (> 60 niveaux)', false],
    [g.violations, 'violations de garde-fous (doit rester 0)', (g.violations || 0) > 0],
  ];
  parts.push(`<div class="sim-compteurs">${compteurs.map(([valeur, nom, alerte]) =>
    `<div class="sim-compteur ${alerte ? 'alerte' : ''}"><div class="valeur">${esc(valeur ?? '—')}</div><div class="nom">${esc(nom)}</div></div>`).join('')}</div>`);

  // Méta
  const m = d.meta || {};
  parts.push(`<p style="color:var(--tres-doux);font-size:13px;margin-top:26px">
    ${esc(m.enfants ?? '—')} enfants × ${esc(m.semaines ?? '—')} semaines · seed « ${esc(m.seed ?? '—')} » ·
    ${esc((m.modules && m.modules.length) ?? '—')} biomes simulés · généré en ${m.dureeMs != null ? (m.dureeMs / 1000).toFixed(1) : '—'} s</p>`);

  corps.innerHTML = parts.join('');
}

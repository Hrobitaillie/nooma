// Serveur de l'atelier Plouma — zéro dépendance, Node ≥ 18. (doc 18, phase 1)
//
// Évolution durcie de l'ancien cadrage/server.mjs :
//   - liste BLANCHE des racines servies (cadrage/, docs/, contenu/) — jamais app/, flooow/, .git…
//   - refus des dotfiles, *.orig, *.bak ; pas de listing de répertoires ;
//   - limite de taille sur les POST (2 Mo) + timeout de requête ;
//   - identité via l'en-tête X-Utilisateur (posé par nginx après basic auth — le serveur
//     n'écoute QUE 127.0.0.1, le mur d'auth est devant, jamais dans Node) ;
//   - journal d'audit des écritures (data/journal.log, append-only) ;
//   - commit/push git automatique des écritures de contenu (GIT_AUTO=1, branche courante
//     du clone serveur = serveur/contenu — doc 18 §1.3), sérialisé et débouncé.
//
// Usage local  : npm start                        (auth off, git off, port 8090)
// Usage serveur: systemd → HOTE=127.0.0.1 GIT_AUTO=1 node serveur/serveur.mjs

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { gererStudio } from './api/studio.mjs';

const execFileP = promisify(execFile);

// ───────────────────────────── Configuration ─────────────────────────────────
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8090;
const HOTE = process.env.HOTE || '127.0.0.1';
const DATA = process.env.DATA_DIR || join(RACINE, 'data');
const GIT_AUTO = process.env.GIT_AUTO === '1';
const UTILISATEUR_DEFAUT = process.env.UTILISATEUR_DEFAUT || 'local';
const LIMITE_CORPS = 2 * 1024 * 1024; // 2 Mo — largement au-delà des JSON/CSV de contenu

/** Racines servies en statique — tout le reste du dépôt est INTERDIT. */
const RACINES_SERVIES = ['cadrage/', 'docs/', 'contenu/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.txt': 'text/plain; charset=utf-8',
};

// Endpoints d'écriture : chemin → fichier cible (relatif au dépôt).
// Les chemins .php sont hérités du viewer locasyst — c'est Node qui répond.
const API_JSON = {
  '/cadrage/viewer/comments.php': 'cadrage/viewer/comments.json',
  '/cadrage/viewer/estimations.php': 'cadrage/viewer/estimations.json',
};
const API_JSON_DEFAUT = {
  '/cadrage/viewer/comments.php': '{"version":1,"comments":[]}',
  '/cadrage/viewer/estimations.php': '{}',
};

// ─────────────────── Tableau de bord : agrégation lecture seule ───────────────
// Chaque section a un fallback : un fichier absent ne fait JAMAIS planter l'endpoint.

/** Lit un fichier du dépôt en texte, ou renvoie null s'il est absent/illisible. */
async function lireTexte(rel) {
  try {
    return await readFile(join(RACINE, rel), 'utf8');
  } catch {
    return null;
  }
}

/** Lit + parse un JSON du dépôt, ou renvoie null. */
async function lireJson(rel) {
  const t = await lireTexte(rel);
  if (t === null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Découpe une ligne CSV séparée par ';' (pas de guillemets dans nos banques). */
function champsCsv(ligne) {
  return ligne.split(';');
}

/** Agrège l'état d'une banque CSV (mot;…;aVerifier;statut). */
function analyserBanque(nom, texte) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length === 0) return { fichier: nom, mots: 0, valides: 0, aRelire: 0, aVerifier: 0 };
  const entete = champsCsv(lignes[0]);
  const iStatut = entete.indexOf('statut');
  const iVerif = entete.indexOf('aVerifier');
  let valides = 0, aRelire = 0, aVerifier = 0;
  const corps = lignes.slice(1);
  for (const l of corps) {
    const c = champsCsv(l);
    const statut = iStatut >= 0 ? (c[iStatut] || '').trim() : '';
    const verif = iVerif >= 0 ? (c[iVerif] || '').trim().toLowerCase() : '';
    if (statut === 'valide') valides++;
    else if (statut === 'a-relire') aRelire++;
    if (verif === 'oui') aVerifier++;
  }
  return { fichier: nom, mots: corps.length, valides, aRelire, aVerifier };
}

/** Section « contenu » : banques CSV + comptes du graphe de compétences + mécaniques. */
async function sectionContenu() {
  const out = { banques: [], mots: 0, valides: 0, aRelire: 0, aVerifier: 0, modules: null, competences: null, mecaniques: null };
  try {
    const { readdir } = await import('node:fs/promises');
    const fichiers = (await readdir(join(RACINE, 'contenu', 'banques')))
      .filter((f) => f.endsWith('.csv'))
      .sort();
    for (const f of fichiers) {
      const texte = await lireTexte(join('contenu', 'banques', f));
      if (texte === null) continue;
      const b = analyserBanque(f, texte);
      out.banques.push(b);
      out.mots += b.mots;
      out.valides += b.valides;
      out.aRelire += b.aRelire;
      out.aVerifier += b.aVerifier;
    }
  } catch { /* dossier absent → banques vides */ }

  const graphe = await lireJson('contenu/graphe-competences.json');
  if (graphe && Array.isArray(graphe.modules)) {
    out.modules = graphe.modules.length;
    out.competences = graphe.modules.reduce((n, m) => n + ((m.competences && m.competences.length) || 0), 0);
  }
  const meca = await lireJson('contenu/mecaniques.json');
  if (meca && Array.isArray(meca.mecaniques)) out.mecaniques = meca.mecaniques.length;
  return out;
}

/** Section « lignes » : registre voix (doc 18 §4) — total, par type, actif vs prévu. */
async function sectionLignes() {
  const data = await lireJson('contenu/voix/lignes.json');
  const liste = data && Array.isArray(data.lignes) ? data.lignes : [];
  const parType = {};
  let actifs = 0, prevus = 0;
  for (const l of liste) {
    if (!l || typeof l !== 'object') continue;
    const t = l.type || 'inconnu';
    parType[t] = (parType[t] || 0) + 1;
    if ((l.statut || 'actif') === 'prevu') prevus++;
    else actifs++;
  }
  return { present: !!data, total: liste.length, parType, actifs, prevus };
}

/** Section « studio » : compteurs des prises (doc 18 §5) — lignes avec audio retenu / total.
 * Lit data/studio/etat.json (hors git). Le « total » = registre actif + mots des banques
 * (mêmes sources dérivées que la vue lignes) pour un dénominateur cohérent. */
async function sectionStudio() {
  let etat = null;
  try {
    etat = JSON.parse(await readFile(join(DATA, 'studio', 'etat.json'), 'utf8'));
  } catch { etat = null; }
  const lignesEtat = etat && etat.lignes && typeof etat.lignes === 'object' ? etat.lignes : {};

  let avecRetenue = 0, avecPrises = 0, prisesTotal = 0, aArbitrer = 0;
  for (const entree of Object.values(lignesEtat)) {
    const prises = Array.isArray(entree.prises) ? entree.prises : [];
    if (prises.length === 0) continue;
    avecPrises++;
    prisesTotal += prises.length;
    const retenue = prises.some((p) => p.statut === 'retenue');
    if (retenue) avecRetenue++;
    const proposees = prises.filter((p) => p.statut === 'proposee').length;
    if (!retenue && proposees >= 2) aArbitrer++;
  }

  // Dénominateur : lignes du registre (actives) + mots des banques.
  let total = 0;
  const reg = await lireJson('contenu/voix/lignes.json');
  if (reg && Array.isArray(reg.lignes)) {
    total += reg.lignes.filter((l) => l && (l.statut || 'actif') !== 'prevu').length;
  }
  try {
    const { readdir } = await import('node:fs/promises');
    const fichiers = (await readdir(join(RACINE, 'contenu', 'banques'))).filter((f) => f.endsWith('.csv'));
    const syllabes = new Set(); // syllabes uniques (colonne decoupage) — mêmes dérivées que la vue lignes
    for (const f of fichiers) {
      const texte = await lireTexte(join('contenu', 'banques', f));
      if (texte === null) continue;
      const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lignes.length < 2) continue;
      total += lignes.length - 1;
      const iDec = lignes[0].split(';').indexOf('decoupage');
      if (iDec < 0) continue;
      for (let k = 1; k < lignes.length; k++) {
        for (const brut of (lignes[k].split(';')[iDec] || '').split('-')) {
          const s = brut.trim().normalize('NFC');
          if (s) syllabes.add(s);
        }
      }
    }
    total += syllabes.size;
  } catch { /* pas de banques */ }

  return { present: !!etat, total, avecRetenue, avecPrises, prisesTotal, aArbitrer };
}

/** Section « commentaires » : total / résolus / non résolus. */
async function sectionCommentaires() {
  const data = await lireJson('cadrage/viewer/comments.json');
  const liste = data && Array.isArray(data.comments) ? data.comments : [];
  const resolus = liste.filter((c) => c && c.resolved).length;
  return { total: liste.length, resolus, nonResolus: liste.length - resolus };
}

/** Section « simulateur » : verdicts + méta (fichier committé, peut manquer). */
async function sectionSimulateur() {
  const data = await lireJson('cadrage/simulateur/out/results.json');
  if (!data) return { present: false, verdicts: [], meta: null };
  const verdicts = Array.isArray(data.verdicts)
    ? data.verdicts.map((v) => ({ nom: v.nom, valeur: v.valeur, ok: !!v.ok }))
    : [];
  const m = data.meta || {};
  return {
    present: true,
    verdicts,
    okTotal: verdicts.filter((v) => v.ok).length,
    total: verdicts.length,
    meta: { enfants: m.enfants ?? null, semaines: m.semaines ?? null, seed: m.seed ?? null },
  };
}

/** Section « suivi projet » : nœuds du graphe flooow par statut natif. */
async function sectionSuivi() {
  const g = await lireJson('flooow/data/nooma/nooma-project.graph.json');
  const vide = { validee: 0, 'en-recette': 0, 'a-developper': 0, reportee: 0 };
  if (!g || !Array.isArray(g.nodes)) return { statuts: vide, total: 0, note: 'graphe introuvable ou illisible' };

  // Les groupes « SUIVI · … » sont des frames (type=frame, kind=module) dont le nom
  // commence par « SUIVI ». Les features de suivi y sont rattachées par parentId, et
  // portent le statut natif (validee/en-recette/a-developper/reportee) dans attrs.status.
  const suiviIds = new Set(
    g.nodes
      .filter((n) => n.type === 'frame' && typeof n.attrs?.name === 'string' && n.attrs.name.startsWith('SUIVI'))
      .map((n) => n.id),
  );
  const statutsSuivi = new Set(['validee', 'en-recette', 'a-developper', 'reportee']);
  const compte = { ...vide };
  let total = 0;
  let note = null;

  const rattachables = g.nodes.filter((n) => n.type === 'feature' && suiviIds.has(n.parentId));
  if (suiviIds.size > 0 && rattachables.length > 0) {
    for (const n of rattachables) {
      const s = n.attrs?.status;
      if (s in compte) compte[s]++;
      total++;
    }
    note = `${rattachables.length} nœuds rattachés aux ${suiviIds.size} groupes « SUIVI · … »`;
  } else {
    // Rattachement ambigu → on compte tous les nœuds porteurs d'un statut de suivi.
    for (const n of g.nodes) {
      const s = n.attrs?.status;
      if (statutsSuivi.has(s)) { if (s in compte) compte[s]++; total++; }
    }
    note = 'groupes SUIVI non identifiés — comptage de tous les nœuds porteurs d\'un statut de suivi';
  }
  return { statuts: compte, total, note };
}

/** Section « activité » : 15 dernières lignes de data/journal.log. */
async function sectionActivite() {
  try {
    const brut = await readFile(join(DATA, 'journal.log'), 'utf8');
    const lignes = brut.split(/\r?\n/).filter((l) => l.trim() !== '');
    const dernieres = lignes.slice(-15).reverse();
    const entrees = [];
    for (const l of dernieres) {
      try {
        const e = JSON.parse(l);
        entrees.push({ date: e.date || null, utilisateur: e.utilisateur || null, endpoint: e.endpoint || null, fichier: e.fichier || null, type: e.type || null });
      } catch { /* ligne corrompue ignorée */ }
    }
    return { entrees };
  } catch {
    return { entrees: [] };
  }
}

/** Section « serveur » : uptime, Node, état git du clone (tolérant aux erreurs). */
async function sectionServeur() {
  const base = {
    uptimeSecondes: Math.round(process.uptime()),
    node: process.version,
    branche: null,
    dernierCommit: null,
    commitsEnAvance: null,
    pushOk: null,
  };
  const opt = { cwd: RACINE, timeout: 5000 };
  const gitLu = (args) => execFileP('git', args, opt).then((r) => r.stdout.trim()).catch(() => null);

  base.branche = await gitLu(['rev-parse', '--abbrev-ref', 'HEAD']);
  const sujet = await gitLu(['log', '-1', '--pretty=%s']);
  const date = await gitLu(['log', '-1', '--pretty=%cI']);
  if (sujet !== null) base.dernierCommit = { sujet, date };

  // Nb de commits d'avance sur la ref distante de suivi de contenu.
  // On tente @{u} puis origin/serveur/contenu. Si aucune n'existe → push en attente.
  let avance = await gitLu(['rev-list', '--count', 'origin/serveur/contenu..HEAD']);
  if (avance === null) avance = await gitLu(['rev-list', '--count', '@{u}..HEAD']);
  if (avance === null) {
    base.commitsEnAvance = null;
    base.pushOk = false; // ref distante absente → deploy key manquante / push en attente
  } else {
    base.commitsEnAvance = Number(avance);
    base.pushOk = true;
  }
  return base;
}

/** Assemble le JSON complet du tableau de bord. Chaque section est isolée. */
async function tableauDeBord() {
  const enrober = async (fn, fallback) => {
    try { return await fn(); } catch { return fallback; }
  };
  const [contenu, lignes, studio, commentaires, simulateur, suivi, activite, serveur] = await Promise.all([
    enrober(sectionContenu, { banques: [] }),
    enrober(sectionLignes, { present: false, total: 0, parType: {}, actifs: 0, prevus: 0 }),
    enrober(sectionStudio, { present: false, total: 0, avecRetenue: 0, avecPrises: 0, prisesTotal: 0, aArbitrer: 0 }),
    enrober(sectionCommentaires, { total: 0, resolus: 0, nonResolus: 0 }),
    enrober(sectionSimulateur, { present: false, verdicts: [], meta: null }),
    enrober(sectionSuivi, { statuts: {}, total: 0, note: 'erreur' }),
    enrober(sectionActivite, { entrees: [] }),
    enrober(sectionServeur, { uptimeSecondes: Math.round(process.uptime()), node: process.version }),
  ]);
  return { genereLe: new Date().toISOString(), contenu, lignes, studio, commentaires, simulateur, suivi, activite, serveur };
}

// ───────────────────────────── Aides ─────────────────────────────────────────
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function utilisateur(req) {
  const u = String(req.headers['x-utilisateur'] || '').trim();
  return /^[a-z0-9_-]{1,32}$/i.test(u) ? u : UTILISATEUR_DEFAUT;
}

/** Lit le corps d'une requête avec limite dure — coupe net au-delà. */
function lireCorps(req, res) {
  return new Promise((resolve) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (c) => {
      taille += c.length;
      if (taille > LIMITE_CORPS) {
        send(res, 413, '{"ok":false,"error":"corps trop volumineux"}');
        req.destroy();
        resolve(null);
        return;
      }
      morceaux.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/** Journal d'audit append-only des écritures (data/journal.log, une ligne JSON par écriture). */
async function journaliser(entree) {
  try {
    await mkdir(DATA, { recursive: true });
    await appendFile(
      join(DATA, 'journal.log'),
      JSON.stringify({ date: new Date().toISOString(), ...entree }) + '\n',
    );
  } catch (e) {
    console.error('[journal]', e.message);
  }
}

// ─────────────────── Git : commit/push auto, sérialisé ───────────────────────
// File de promesses : jamais deux opérations git en parallèle. Push débouncé.
let fileGit = Promise.resolve();
let pushPrevu = null;

function git(...args) {
  return execFileP('git', args, { cwd: RACINE });
}

function committerContenu(fichierRelatif, user, endpoint) {
  if (!GIT_AUTO) return;
  fileGit = fileGit
    .then(async () => {
      await git('add', '--', fichierRelatif);
      // Rien à committer si le contenu n'a pas changé (écriture identique).
      const { stdout } = await git('status', '--porcelain', '--', fichierRelatif);
      if (!stdout.trim()) return;
      await git(
        'commit', '-m', `contenu(${endpoint}): mise à jour via l'atelier`,
        '--author', `${user} <${user}@atelier.plouma.local>`,
        '--', fichierRelatif,
      );
      // Push débouncé : une salve d'écritures = un seul push.
      clearTimeout(pushPrevu);
      pushPrevu = setTimeout(() => {
        fileGit = fileGit.then(() => git('push', 'origin', 'HEAD')).catch((e) => {
          console.error('[git push]', e.message);
          journaliser({ type: 'erreur-git-push', erreur: e.message });
        });
      }, 20_000);
    })
    .catch((e) => {
      console.error('[git]', e.message);
      journaliser({ type: 'erreur-git', fichier: fichierRelatif, erreur: e.message });
    });
}

// ───────────────────────────── Serveur ───────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  const user = utilisateur(req);

  // --- API : commentaires / estimations (JSON complet re-posté) -------------
  if (API_JSON[path]) {
    const cible = API_JSON[path];
    if (req.method === 'GET') {
      try {
        send(res, 200, await readFile(join(RACINE, cible)));
      } catch {
        send(res, 200, API_JSON_DEFAUT[path]);
      }
      return;
    }
    if (req.method === 'POST') {
      const brut = await lireCorps(req, res);
      if (brut === null) return;
      try {
        const data = JSON.parse(brut);
        await writeFile(join(RACINE, cible), JSON.stringify(data, null, 2) + '\n');
        await journaliser({ type: 'ecriture', utilisateur: user, endpoint: path, fichier: cible, octets: brut.length });
        committerContenu(cible, user, path.split('/').pop().replace('.php', ''));
        send(res, 200, '{"ok":true}');
      } catch {
        send(res, 400, '{"ok":false,"error":"invalid json"}');
      }
      return;
    }
    send(res, 405, '{"ok":false,"error":"method not allowed"}');
    return;
  }

  // --- API : sauvegarde d'une banque d'items (admin) -------------------------
  if (path === '/contenu/banques/save') {
    if (req.method !== 'POST') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return;
    }
    const brut = await lireCorps(req, res);
    if (brut === null) return;
    try {
      const { fichier, csv } = JSON.parse(brut);
      if (!/^[a-z0-9-]+\.csv$/.test(fichier)) {
        send(res, 400, '{"ok":false,"error":"nom de fichier invalide"}');
        return;
      }
      if (typeof csv !== 'string' || !csv.startsWith('mot;')) {
        send(res, 400, '{"ok":false,"error":"en-tête CSV inattendu"}');
        return;
      }
      const cible = join('contenu', 'banques', fichier);
      await writeFile(join(RACINE, cible), csv.endsWith('\n') ? csv : csv + '\n');
      await journaliser({ type: 'ecriture', utilisateur: user, endpoint: path, fichier: cible, octets: csv.length });
      committerContenu(cible, user, 'banque');
      send(res, 200, '{"ok":true}');
    } catch {
      send(res, 400, '{"ok":false,"error":"invalid json"}');
    }
    return;
  }

  // --- API : tableau de bord (agrégation LECTURE SEULE) ----------------------
  if (path === '/api/tableau-de-bord') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return;
    }
    try {
      const data = await tableauDeBord();
      send(res, 200, JSON.stringify(data));
    } catch (e) {
      send(res, 500, JSON.stringify({ ok: false, error: 'agrégation impossible' }));
    }
    return;
  }
  // --- API : studio d'enregistrement (doc 18 §5) — module dédié ---------------
  if (path.startsWith('/api/studio/')) {
    const traite = await gererStudio(req, res, {
      RACINE, DATA, LIMITE_CORPS, send,
      utilisateur, journaliser, committerContenu,
    });
    if (traite) return;
  }

  // Aucun autre chemin /api/ n'existe : jamais d'écriture ici.
  if (path.startsWith('/api/')) {
    send(res, 404, '{"ok":false,"error":"not found"}');
    return;
  }

  // --- Statique (liste blanche stricte) --------------------------------------
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed', 'text/plain');
    return;
  }
  if (path === '/') {
    // La racine = le tableau de bord de l'atelier (hub vers doc, admin, outils).
    try {
      const accueil = await readFile(join(RACINE, 'serveur', 'accueil', 'index.html'));
      send(res, 200, accueil, MIME['.html']);
    } catch {
      res.writeHead(302, { Location: '/cadrage/viewer/' });
      res.end();
    }
    return;
  }
  if (path === '/robots.txt') {
    send(res, 200, 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8');
    return;
  }

  let fichier = path.slice(1); // sans le / initial
  if (fichier.endsWith('/')) fichier += 'index.html';

  // Correspondance spéciale : /accueil/… → serveur/accueil/… (la SPA de l'atelier).
  // On préfixe simplement par « serveur/ » AVANT normalisation, puis on applique
  // exactement les mêmes protections (traversée / dotfiles / *.orig|bak).
  if (fichier === 'accueil' || fichier === 'accueil/' || fichier.startsWith('accueil/')) {
    fichier = 'serveur/' + fichier;
  }

  const complet = normalize(join(RACINE, fichier));
  const relatif = relative(RACINE, complet).replaceAll('\\', '/');

  // Racines servies : la liste blanche + la SPA de l'atelier (serveur/accueil/ uniquement).
  const racineOk =
    RACINES_SERVIES.some((r) => relatif.startsWith(r)) ||
    relatif === 'serveur/accueil/index.html' ||
    relatif.startsWith('serveur/accueil/');

  // Traversée hors dépôt, racine non listée, dotfiles, fichiers de travail : refus.
  const segments = relatif.split('/');
  const interdit =
    relatif.startsWith('..') ||
    !racineOk ||
    segments.some((s) => s.startsWith('.')) ||
    /\.(orig|bak)$/.test(relatif);
  if (interdit) {
    send(res, 403, 'forbidden', 'text/plain');
    return;
  }

  try {
    const corps = await readFile(complet);
    send(res, 200, corps, MIME[extname(complet).toLowerCase()] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found: ' + relatif, 'text/plain; charset=utf-8');
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;

server.listen(PORT, HOTE, () => {
  console.log(`Atelier Plouma → http://${HOTE}:${PORT}/cadrage/viewer/`);
  console.log(`  relecture    → http://${HOTE}:${PORT}/#/relecture`);
  console.log(`  git auto: ${GIT_AUTO ? 'ON (branche courante)' : 'off'} · journal: ${join(DATA, 'journal.log')}`);
});

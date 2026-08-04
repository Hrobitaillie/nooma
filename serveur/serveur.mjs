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
  const complet = normalize(join(RACINE, fichier));
  const relatif = relative(RACINE, complet).replaceAll('\\', '/');

  // Traversée hors dépôt, racine non listée, dotfiles, fichiers de travail : refus.
  const segments = relatif.split('/');
  const interdit =
    relatif.startsWith('..') ||
    !RACINES_SERVIES.some((r) => relatif.startsWith(r)) ||
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
  console.log(`  admin banque → http://${HOTE}:${PORT}/contenu/banques/admin.html`);
  console.log(`  git auto: ${GIT_AUTO ? 'ON (branche courante)' : 'off'} · journal: ${join(DATA, 'journal.log')}`);
});

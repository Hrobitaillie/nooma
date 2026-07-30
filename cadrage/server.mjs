// Serveur de cadrage Nooma — zéro dépendance, Node ≥ 18.
// Sert le repo en statique + fait vivre les endpoints du viewer
// (comments.php / estimations.php, conservés tels quels pour ne pas
// modifier l'app héritée de locasyst : ici c'est Node qui répond, pas PHP).
//
// Usage : npm start   (ou : node cadrage/server.mjs)

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = join(ROOT, 'cadrage', 'viewer');
const PORT = Number(process.env.PORT) || 8090;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Endpoints d'écriture du viewer : le fichier JSON qui porte les données.
const API = {
  '/cadrage/viewer/comments.php': join(VIEWER, 'comments.json'),
  '/cadrage/viewer/estimations.php': join(VIEWER, 'estimations.json'),
};
const API_DEFAULT = {
  '/cadrage/viewer/comments.php': '{"version":1,"comments":[]}',
  '/cadrage/viewer/estimations.php': '{}',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// Sauvegarde d'une banque d'items depuis l'admin (contenu/banques/admin.html).
// Le client envoie le CSV complet ; on vérifie juste le nom de fichier et l'en-tête.
async function sauverBanque(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    try {
      const { fichier, csv } = JSON.parse(raw);
      if (!/^[a-z0-9-]+\.csv$/.test(fichier)) { send(res, 400, '{"ok":false,"error":"nom de fichier invalide"}'); return; }
      if (!csv.startsWith('mot;')) { send(res, 400, '{"ok":false,"error":"en-tête CSV inattendu"}'); return; }
      await writeFile(join(ROOT, 'contenu', 'banques', fichier), csv.endsWith('\n') ? csv : csv + '\n');
      send(res, 200, '{"ok":true}');
    } catch {
      send(res, 400, '{"ok":false,"error":"invalid json"}');
    }
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);

  // --- API commentaires / estimations ---------------------------------------
  if (API[path]) {
    if (req.method === 'GET') {
      try {
        send(res, 200, await readFile(API[path]));
      } catch {
        send(res, 200, API_DEFAULT[path]);
      }
      return;
    }
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(raw);
          await writeFile(API[path], JSON.stringify(data, null, 2) + '\n');
          send(res, 200, '{"ok":true}');
        } catch (e) {
          send(res, 400, '{"ok":false,"error":"invalid json"}');
        }
      });
      return;
    }
    send(res, 405, '{"ok":false,"error":"method not allowed"}');
    return;
  }

  // --- API banques d'items (admin) -------------------------------------------
  if (path === '/contenu/banques/save') {
    if (req.method === 'POST') { sauverBanque(req, res); return; }
    send(res, 405, '{"ok":false,"error":"method not allowed"}');
    return;
  }

  // --- Statique --------------------------------------------------------------
  if (path === '/') {
    res.writeHead(302, { Location: '/cadrage/viewer/' });
    res.end();
    return;
  }
  let file = path;
  if (file.endsWith('/')) file += 'index.html';
  const full = normalize(join(ROOT, file));
  if (!full.startsWith(ROOT)) { send(res, 403, 'forbidden', 'text/plain'); return; }
  try {
    const body = await readFile(full);
    send(res, 200, body, MIME[extname(full).toLowerCase()] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found: ' + file, 'text/plain; charset=utf-8');
  }
});

const FLOOOW_PORT = Number(process.env.VITE_PORT) || 5173;

server.listen(PORT, () => {
  console.log(`Cadrage Nooma → http://localhost:${PORT}/cadrage/viewer/`);
  console.log(`Graphe flooow → http://localhost:${FLOOOW_PORT}/  (projet « nooma » — lancer « npm run flooow » si non démarré)`);
  console.log('(commentaires et estimations persistés dans cadrage/viewer/*.json)');
});

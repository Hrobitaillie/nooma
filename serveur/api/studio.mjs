// Studio d'enregistrement — API (doc 18 §5). Module importé par serveur/serveur.mjs.
//
// Zéro dépendance. Le modèle de données vit HORS git dans DATA_DIR (data/studio/) :
//   data/studio/etat.json                          index global, écrit atomiquement (tmp+rename)
//   data/studio/prises/<ligne-id>/<prise-id>.<ext>  fichiers audio bruts (webm/mp4/ogg)
//   data/studio/etalon.json                        contrôle qualité d'entrée de session (§5)
//   data/studio/etalon/<etalon-id>.<ext>           prises étalon (comparaison entre sessions)
//
// Le PACK exporté (prises retenues converties par ffmpeg) va, lui, DANS git :
//   contenu/voix/pack/<ligne-id>.ogg + contenu/voix/pack/manifest.json
// → committé par le mécanisme git auto existant, il arrive dans l'app par sync_contenu.
//
// Ce module exporte `gererStudio(req, res, ctx)` : renvoie true s'il a traité la requête,
// false sinon (le serveur poursuit son routage). `ctx` fournit les aides du serveur
// (RACINE, DATA, utilisateur, journaliser, committerContenu, send…).

import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, unlink, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// Limite spécifique aux endpoints studio (le reste du serveur garde 2 Mo).
export const LIMITE_CORPS_STUDIO = 25 * 1024 * 1024; // 25 Mo

// Formats audio bruts acceptés en entrée (source conservée telle quelle, doc 18 §5.3).
// Le WAV vient du montage côté studio (coupes) : PCM reconstruit depuis la prise décodée.
const MIME_ENTREE = {
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
};
// Normalise « audio/webm;codecs=opus » → « audio/webm ».
function typeBase(ct) {
  return String(ct || '').split(';')[0].trim().toLowerCase();
}
const MIME_SORTIE = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const STATUTS = new Set(['proposee', 'retenue', 'ecartee']);

// ─────────────────────────── Validation d'identifiants ───────────────────────
// Un ligneId valide : présent dans le registre, OU convention dérivée mot-* / phoneme-*.
// Toujours [a-z0-9-]+ (pas de '.', pas de traversée). On charge le registre à la volée
// (petit fichier, lecture rare) plus les banques et les graphèmes pour les dérivés.

function idBienForme(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && id.length <= 120;
}

async function idsRegistre(RACINE) {
  try {
    const t = await readFile(join(RACINE, 'contenu/voix/lignes.json'), 'utf8');
    const data = JSON.parse(t);
    const set = new Set();
    for (const l of data.lignes || []) if (l && idBienForme(l.id)) set.add(l.id);
    return set;
  } catch {
    return new Set();
  }
}

/** ligneId autorisé : registre exact, ou mot-<...> / phoneme-<...> bien formés. */
async function ligneAutorisee(RACINE, id) {
  if (!idBienForme(id)) return false;
  if (id.startsWith('mot-') || id.startsWith('phoneme-')) {
    // Un préfixe seul (« mot- ») ne suffit pas : il faut un suffixe non vide.
    return id.length > 4;
  }
  const registre = await idsRegistre(RACINE);
  return registre.has(id);
}

// ─────────────────────────── Persistance de l'index ──────────────────────────
function cheminEtat(DATA) {
  return join(DATA, 'studio', 'etat.json');
}
function dossierPrises(DATA, ligneId) {
  return join(DATA, 'studio', 'prises', ligneId);
}

async function lireEtat(DATA) {
  try {
    const t = await readFile(cheminEtat(DATA), 'utf8');
    const data = JSON.parse(t);
    if (!data || typeof data !== 'object' || typeof data.lignes !== 'object') {
      return { version: 1, lignes: {} };
    }
    return data;
  } catch {
    return { version: 1, lignes: {} };
  }
}

// Écriture sérialisée + atomique (tmp dans le même dossier + rename) — partagée
// entre etat.json et etalon.json (une seule file, jamais deux écritures croisées).
let fileEcriture = Promise.resolve();
function ecrireJsonSerialise(cible, data) {
  const op = fileEcriture.then(async () => {
    await mkdir(dirname(cible), { recursive: true });
    const tmp = cible + '.' + process.pid + '.' + Date.now() + '.tmp';
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
    await rename(tmp, cible);
  });
  // La file ne doit jamais rester rejetée (sinon les écritures suivantes échouent).
  fileEcriture = op.catch(() => {});
  return op;
}
function ecrireEtat(DATA, data) {
  return ecrireJsonSerialise(cheminEtat(DATA), data);
}

// ─────────────────────────── Étalon (contrôle qualité de session) ─────────────
function cheminEtalon(DATA) {
  return join(DATA, 'studio', 'etalon.json');
}
async function lireEtalon(DATA) {
  try {
    const data = JSON.parse(await readFile(cheminEtalon(DATA), 'utf8'));
    if (!data || !Array.isArray(data.sessions)) return { version: 1, sessions: [] };
    return data;
  } catch {
    return { version: 1, sessions: [] };
  }
}

/** Prochain numéro de prise pour une ligne (croissant, jamais réutilisé). */
function prochainNumero(entree) {
  let max = 0;
  for (const p of entree.prises) if (p.n > max) max = p.n;
  return max + 1;
}

function trouverPrise(etat, priseId) {
  for (const [ligneId, entree] of Object.entries(etat.lignes)) {
    const p = (entree.prises || []).find((x) => x.id === priseId);
    if (p) return { ligneId, entree, prise: p };
  }
  return null;
}

// ─────────────────────────── Lecture du corps binaire ────────────────────────
function lireCorpsBinaire(req, res, limite, send) {
  return new Promise((resolve) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (c) => {
      taille += c.length;
      if (taille > limite) {
        send(res, 413, '{"ok":false,"error":"corps trop volumineux (max 25 Mo)"}');
        req.destroy();
        resolve(null);
        return;
      }
      morceaux.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(morceaux)));
    req.on('error', () => resolve(null));
  });
}

function lireCorpsTexte(req, res, limite, send) {
  return lireCorpsBinaire(req, res, limite, send).then((b) => (b ? b.toString('utf8') : null));
}

// ─────────────────────────── ffmpeg (export) ─────────────────────────────────
async function ffmpegPresent() {
  try {
    await execFileP('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────── Routeur du module ───────────────────────────────
// ctx = { RACINE, DATA, send, utilisateur:req=>string, journaliser, committerContenu }
export async function gererStudio(req, res, ctx) {
  const { RACINE, DATA, send } = ctx;
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  if (!path.startsWith('/api/studio/')) return false;

  const user = ctx.utilisateur(req);

  // GET /api/studio/etat — index complet (source du statut audio de la vue lignes).
  if (path === '/api/studio/etat') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const etat = await lireEtat(DATA);
    send(res, 200, JSON.stringify(etat));
    return true;
  }

  // POST /api/studio/prise?ligne=<id> — corps binaire audio.
  if (path === '/api/studio/prise') {
    if (req.method !== 'POST') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const ligneId = url.searchParams.get('ligne') || '';
    if (!(await ligneAutorisee(RACINE, ligneId))) {
      send(res, 400, '{"ok":false,"error":"ligneId invalide ou inconnu"}');
      return true;
    }
    const ct = typeBase(req.headers['content-type']);
    const ext = MIME_ENTREE[ct];
    if (!ext) {
      send(res, 415, '{"ok":false,"error":"Content-Type audio non supporté (webm/mp4/ogg)"}');
      return true;
    }
    const corps = await lireCorpsBinaire(req, res, LIMITE_CORPS_STUDIO, send);
    if (corps === null) return true; // 413 déjà envoyé, ou erreur réseau
    if (corps.length === 0) {
      send(res, 400, '{"ok":false,"error":"corps audio vide"}');
      return true;
    }

    const etat = await lireEtat(DATA);
    const entree = etat.lignes[ligneId] || (etat.lignes[ligneId] = { prises: [] });
    if (!Array.isArray(entree.prises)) entree.prises = [];
    const n = prochainNumero(entree);
    const priseId = `prise-${String(n).padStart(3, '0')}`;
    const rel = `prises/${ligneId}/${priseId}${ext}`;

    try {
      const dossier = dossierPrises(DATA, ligneId);
      await mkdir(dossier, { recursive: true });
      await writeFile(join(dossier, priseId + ext), corps);
    } catch (e) {
      send(res, 500, '{"ok":false,"error":"écriture du fichier impossible"}');
      return true;
    }

    // Métadonnées optionnelles mesurées côté client (durée, niveaux).
    const dureeMs = Number(url.searchParams.get('dureeMs')) || null;
    const picDb = url.searchParams.has('picDb') ? Number(url.searchParams.get('picDb')) : null;
    const rmsDb = url.searchParams.has('rmsDb') ? Number(url.searchParams.get('rmsDb')) : null;

    const prise = {
      id: priseId,
      n,
      ligneId,
      fichier: rel,
      mime: ct,
      utilisateur: user,
      date: new Date().toISOString(),
      dureeMs,
      picDb,
      rmsDb,
      taille: corps.length,
      statut: 'proposee',
      note: '',
    };
    entree.prises.push(prise);
    await ecrireEtat(DATA, etat);
    await ctx.journaliser({ type: 'studio-prise', utilisateur: user, endpoint: path, fichier: rel, octets: corps.length });
    send(res, 200, JSON.stringify({ ok: true, prise }));
    return true;
  }

  // GET /api/studio/audio/<ligneId>/<priseId> — sert le fichier (jamais de traversée).
  if (path.startsWith('/api/studio/audio/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const reste = path.slice('/api/studio/audio/'.length);
    const parts = reste.split('/');
    if (parts.length !== 2) {
      send(res, 400, '{"ok":false,"error":"chemin audio invalide"}');
      return true;
    }
    const [ligneId, priseId] = parts;
    // Validation stricte : aucun '.', aucun séparateur → traversée impossible.
    if (!idBienForme(ligneId) || !/^prise-[0-9]{1,6}$/.test(priseId)) {
      send(res, 400, '{"ok":false,"error":"identifiant invalide"}');
      return true;
    }
    const etat = await lireEtat(DATA);
    const entree = etat.lignes[ligneId];
    const prise = entree && (entree.prises || []).find((p) => p.id === priseId);
    if (!prise) {
      send(res, 404, '{"ok":false,"error":"prise introuvable"}');
      return true;
    }
    const abs = join(DATA, 'studio', prise.fichier);
    // Ceinture-bretelles : le fichier résolu doit rester sous data/studio/prises/.
    const racineAudio = join(DATA, 'studio', 'prises') + '/';
    if (!(abs + '').startsWith(racineAudio)) {
      send(res, 403, 'forbidden', 'text/plain');
      return true;
    }
    try {
      const st = await stat(abs);
      const ext = prise.fichier.slice(prise.fichier.lastIndexOf('.'));
      res.writeHead(200, {
        'Content-Type': MIME_SORTIE[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'none',
      });
      if (req.method === 'HEAD') { res.end(); return true; }
      createReadStream(abs).pipe(res);
    } catch {
      send(res, 404, '{"ok":false,"error":"fichier absent"}');
    }
    return true;
  }

  // POST /api/studio/prise/<priseId>/statut — {statut, note?}.
  const mStatut = path.match(/^\/api\/studio\/prise\/(prise-[0-9]{1,6})\/statut$/);
  if (mStatut) {
    if (req.method !== 'POST') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const priseId = mStatut[1];
    const brut = await lireCorpsTexte(req, res, ctx.LIMITE_CORPS || 2 * 1024 * 1024, send);
    if (brut === null) return true;
    let corps;
    try { corps = JSON.parse(brut); } catch {
      send(res, 400, '{"ok":false,"error":"invalid json"}');
      return true;
    }
    const statut = String(corps.statut || '');
    if (!STATUTS.has(statut)) {
      send(res, 400, '{"ok":false,"error":"statut inconnu (proposee|retenue|ecartee)"}');
      return true;
    }
    const etat = await lireEtat(DATA);
    const cible = trouverPrise(etat, priseId);
    if (!cible) {
      send(res, 404, '{"ok":false,"error":"prise introuvable"}');
      return true;
    }
    // Une seule « retenue » par ligne : rétrograde l'ancienne en « proposee ».
    if (statut === 'retenue') {
      for (const p of cible.entree.prises) {
        if (p.id !== priseId && p.statut === 'retenue') p.statut = 'proposee';
      }
      // Snapshot du texte enregistré (pour détecter « à refaire » quand le texte change).
      cible.entree.texteEnregistre = await texteLigne(RACINE, cible.ligneId);
    }
    cible.prise.statut = statut;
    if (typeof corps.note === 'string') cible.prise.note = corps.note.slice(0, 500);
    await ecrireEtat(DATA, etat);
    await ctx.journaliser({ type: 'studio-statut', utilisateur: user, endpoint: path, fichier: cible.prise.fichier, statut });
    send(res, 200, JSON.stringify({ ok: true, prise: cible.prise }));
    return true;
  }

  // DELETE /api/studio/prise/<priseId> (ou POST .../supprimer) — supprime une ÉCARTÉE.
  const mSuppr = path.match(/^\/api\/studio\/prise\/(prise-[0-9]{1,6})(\/supprimer)?$/);
  if (mSuppr && (req.method === 'DELETE' || (req.method === 'POST' && mSuppr[2]))) {
    const priseId = mSuppr[1];
    const etat = await lireEtat(DATA);
    const cible = trouverPrise(etat, priseId);
    if (!cible) {
      send(res, 404, '{"ok":false,"error":"prise introuvable"}');
      return true;
    }
    if (cible.prise.statut !== 'ecartee') {
      send(res, 409, '{"ok":false,"error":"seule une prise écartée est supprimable"}');
      return true;
    }
    // Supprime le fichier (best effort) puis l'entrée d'index.
    try { await unlink(join(DATA, 'studio', cible.prise.fichier)); } catch { /* déjà absent */ }
    cible.entree.prises = cible.entree.prises.filter((p) => p.id !== priseId);
    if (cible.entree.prises.length === 0) {
      delete etat.lignes[cible.ligneId];
      try { await rm(dossierPrises(DATA, cible.ligneId), { recursive: true, force: true }); } catch { /* rien */ }
    }
    await ecrireEtat(DATA, etat);
    await ctx.journaliser({ type: 'studio-suppr', utilisateur: user, endpoint: path, fichier: cible.prise.fichier });
    send(res, 200, '{"ok":true}');
    return true;
  }

  // GET/POST /api/studio/etalon — contrôle qualité d'entrée de session (doc 18 §5).
  // POST : corps binaire audio + query dureeMs/picDb/rmsDb/peripherique.
  if (path === '/api/studio/etalon') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const etalon = await lireEtalon(DATA);
      send(res, 200, JSON.stringify({ ok: true, sessions: etalon.sessions }));
      return true;
    }
    if (req.method !== 'POST') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const ct = typeBase(req.headers['content-type']);
    const ext = MIME_ENTREE[ct];
    if (!ext) {
      send(res, 415, '{"ok":false,"error":"Content-Type audio non supporté (webm/mp4/ogg)"}');
      return true;
    }
    const corps = await lireCorpsBinaire(req, res, LIMITE_CORPS_STUDIO, send);
    if (corps === null) return true;
    if (corps.length === 0) {
      send(res, 400, '{"ok":false,"error":"corps audio vide"}');
      return true;
    }

    const etalon = await lireEtalon(DATA);
    let max = 0;
    for (const s of etalon.sessions) if (s.n > max) max = s.n;
    const n = max + 1;
    const id = `etalon-${String(n).padStart(3, '0')}`;
    try {
      const dossier = join(DATA, 'studio', 'etalon');
      await mkdir(dossier, { recursive: true });
      await writeFile(join(dossier, id + ext), corps);
    } catch {
      send(res, 500, '{"ok":false,"error":"écriture du fichier impossible"}');
      return true;
    }
    const session = {
      id,
      n,
      date: new Date().toISOString(),
      utilisateur: user,
      peripherique: String(url.searchParams.get('peripherique') || '').slice(0, 200),
      dureeMs: Number(url.searchParams.get('dureeMs')) || null,
      picDb: url.searchParams.has('picDb') ? Number(url.searchParams.get('picDb')) : null,
      rmsDb: url.searchParams.has('rmsDb') ? Number(url.searchParams.get('rmsDb')) : null,
      mime: ct,
      fichier: `etalon/${id}${ext}`,
      taille: corps.length,
    };
    etalon.sessions.push(session);
    await ecrireJsonSerialise(cheminEtalon(DATA), etalon);
    await ctx.journaliser({ type: 'studio-etalon', utilisateur: user, endpoint: path, fichier: session.fichier, octets: corps.length });
    send(res, 200, JSON.stringify({ ok: true, session }));
    return true;
  }

  // GET /api/studio/etalon/audio/<etalonId> — réécoute d'un étalon passé.
  if (path.startsWith('/api/studio/etalon/audio/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const id = path.slice('/api/studio/etalon/audio/'.length);
    if (!/^etalon-[0-9]{1,6}$/.test(id)) {
      send(res, 400, '{"ok":false,"error":"identifiant invalide"}');
      return true;
    }
    const etalon = await lireEtalon(DATA);
    const session = etalon.sessions.find((s) => s.id === id);
    if (!session) {
      send(res, 404, '{"ok":false,"error":"étalon introuvable"}');
      return true;
    }
    const abs = join(DATA, 'studio', session.fichier);
    if (!(abs + '').startsWith(join(DATA, 'studio', 'etalon') + '/')) {
      send(res, 403, 'forbidden', 'text/plain');
      return true;
    }
    try {
      const st = await stat(abs);
      const ext2 = session.fichier.slice(session.fichier.lastIndexOf('.'));
      res.writeHead(200, {
        'Content-Type': MIME_SORTIE[ext2] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'none',
      });
      if (req.method === 'HEAD') { res.end(); return true; }
      createReadStream(abs).pipe(res);
    } catch {
      send(res, 404, '{"ok":false,"error":"fichier absent"}');
    }
    return true;
  }

  // POST /api/studio/export — convertit chaque ligne retenue vers le pack committé.
  if (path === '/api/studio/export') {
    if (req.method !== 'POST') {
      send(res, 405, '{"ok":false,"error":"method not allowed"}');
      return true;
    }
    const rapport = await exporter(ctx, user);
    send(res, rapport.ok ? 200 : 200, JSON.stringify(rapport));
    return true;
  }

  // Rien d'autre sous /api/studio/.
  send(res, 404, '{"ok":false,"error":"not found"}');
  return true;
}

// ─────────────────────────── Résolution du texte d'une ligne ─────────────────
// Pour le snapshot « texteEnregistre » : registre exact, ou dérivé mot-/phoneme-.
async function texteLigne(RACINE, ligneId) {
  if (ligneId.startsWith('mot-')) return ligneId.slice(4);
  if (ligneId.startsWith('phoneme-')) return ligneId.slice(8);
  try {
    const data = JSON.parse(await readFile(join(RACINE, 'contenu/voix/lignes.json'), 'utf8'));
    const l = (data.lignes || []).find((x) => x && x.id === ligneId);
    return l ? String(l.texte || '') : '';
  } catch {
    return '';
  }
}

// ─────────────────────────── Export ffmpeg → pack committé ───────────────────
// Pour chaque ligne avec prise retenue :
//   ffmpeg -i <src> -ac 1 -af loudnorm=I=-16:TP=-1.5 -c:a libvorbis -q:a 4 <ligne-id>.ogg
// séquentiel, timeout par fichier, rapport JSON. ffmpeg absent → rapport propre, pas de crash.
async function exporter(ctx, user) {
  const { RACINE, DATA } = ctx;
  const etat = await lireEtat(DATA);

  const aExporter = [];
  for (const [ligneId, entree] of Object.entries(etat.lignes)) {
    const retenue = (entree.prises || []).find((p) => p.statut === 'retenue');
    if (retenue) aExporter.push({ ligneId, prise: retenue });
  }

  if (!(await ffmpegPresent())) {
    return {
      ok: false,
      ffmpeg: false,
      message: 'ffmpeg est absent de ce serveur — installez-le (apt install ffmpeg) pour exporter le pack.',
      candidats: aExporter.length,
      convertis: 0,
      echecs: [],
    };
  }

  const dossierPack = join(RACINE, 'contenu', 'voix', 'pack');
  await mkdir(dossierPack, { recursive: true });

  const convertis = [];
  const echecs = [];
  const manifest = { version: 1, genereLe: new Date().toISOString(), par: user, format: 'ogg-vorbis-mono-r128', lignes: {} };

  for (const { ligneId, prise } of aExporter) {
    const src = join(DATA, 'studio', prise.fichier);
    const dest = join(dossierPack, ligneId + '.ogg');
    try {
      await execFileP('ffmpeg', [
        '-y', '-i', src,
        '-ac', '1',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'libvorbis', '-q:a', '4',
        dest,
      ], { timeout: 60_000 });
      const st = await stat(dest);
      manifest.lignes[ligneId] = {
        fichier: `${ligneId}.ogg`,
        taille: st.size,
        dateOriginale: prise.date,
        priseSource: prise.id,
      };
      convertis.push(ligneId);
    } catch (e) {
      echecs.push({ ligneId, erreur: (e.message || 'échec ffmpeg').slice(0, 200) });
    }
  }

  // Manifest écrit dans tous les cas (même partiel) pour tracer l'état du pack.
  await writeFile(join(dossierPack, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Commit git auto (mécanisme existant) : le pack + manifest arrivent dans l'app par sync.
  ctx.committerContenu('contenu/voix/pack', user, 'pack-voix');
  await ctx.journaliser({ type: 'studio-export', utilisateur: user, convertis: convertis.length, echecs: echecs.length });

  return {
    ok: echecs.length === 0,
    ffmpeg: true,
    candidats: aExporter.length,
    convertis: convertis.length,
    lignesConverties: convertis,
    echecs,
    manifest: 'contenu/voix/pack/manifest.json',
  };
}

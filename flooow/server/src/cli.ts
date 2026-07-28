// CLI `flooow` — l'interface de lecture d'un agent sur les projets (pivot agentique,
// cadrage/06-pivot-agentique/plan.md §3.2). Trois niveaux de zoom, jamais plus de contexte que
// nécessaire : `summary` (sommaire), `get` (fiche + interconnexions), `get --content` (le contenu
// d'UN élément). Réutilise la couche disque du serveur (files.ts) et les fiches de @flooow/core.
//
// Lecture directe du fichier : si le projet est OUVERT dans l'app, le fichier peut retarder de
// quelques secondes sur le Y.Doc (debounce d'onStoreDocument) — acceptable en lecture. Les
// ÉCRITURES, elles, ne passeront jamais par ici : uniquement par les ops serveur (plan §3.1).
import { migrate } from '@flooow/core/model/migrations'
import { parseProjectDoc } from '@flooow/core/model/schema'
import type { Comment, ProjectDoc } from '@flooow/core/model/types'
import { isBlock, isPage } from '@flooow/core/model/types'
import { docToMarkdown } from '@flooow/core/model/richContent'
import { entityCard, projectSummary } from '@flooow/core/agent/cards'
import { findEntities } from '@flooow/core/agent/refs'
import { AgentOpError, applyOps, type AgentOp } from '@flooow/core/agent/ops'
import { createEmptyProject } from '@flooow/core/model/factory'
import { promises as nodeFs } from 'node:fs'
import { join as pathJoin, resolve as pathResolve } from 'node:path'
import { config } from './config.js'
import {
  HttpError,
  createFile,
  createFolder,
  listFiles,
  listFolders,
  readFileRaw,
  writeFile,
} from './files.js'

const USAGE = `flooow — interface agent des projets Flooow (données : <dataDir>/<dossier>/<fichier>.graph.json)

Lecture :
  flooow ls                            liste les dossiers et projets disponibles
  flooow summary <dossier/fichier>     sommaire du projet : une ligne par entité, avec poignées
  flooow get <dossier/fichier> <poignée> [--content]
                                       fiche d'un élément (métadonnées + interconnexions) ;
                                       --content ajoute son contenu markdown
  flooow find <dossier/fichier> <texte>
                                       recherche par nom/code/route/titre (insensible aux accents)
  flooow comments <dossier/fichier> [--for-claude] [--resolved | --all] [--tag <libellé>]
                                       fils de commentaires (défaut : les OUVERTS). --for-claude ne
                                       garde que les fils adressés à l'agent — À RELEVER en début de
                                       session, puis traiter et résoudre (ops reply-comment /
                                       resolve-comment via flooow apply)
  flooow comment <flooow://dossier/fichier#id | dossier/fichier> [poignée]
                                       UN fil, avec la fiche de son élément ancré et le mode
                                       d'emploi pour y répondre/le résoudre. Accepte tel quel la
                                       référence copiée depuis l'app (bouton 🔗 d'un fil)

Écriture :
  flooow create <dossier/fichier> [nom du projet…] [--site <env>/<slug>]
                                       crée un projet vierge (dossier créé au besoin) et rend
                                       le lien direct vers l'app. Avec --site : les données vivent
                                       dans le docs/ du site bao visé (JSON sous docs/.graph/,
                                       narratif markdown publié par Portulan), le dossier de l'app
                                       devient un lien symbolique. Site absent → le créer d'abord :
                                       bao site create <env>/<slug> --type static
  flooow apply <dossier/fichier> [ops.json]
                                       applique un lot d'ops (JSON { "ops": [...] } lu depuis le
                                       fichier donné, ou stdin sans argument). Atomique : tout ou rien.
  flooow ops                           mémo du vocabulaire d'ops, avec exemples

Poignées : id court affiché dans les fiches (préfixe ≥ 4), id complet, ou code de
fonctionnalité (ex. DEV-04). Une poignée ambiguë liste les candidats.

Méthode conseillée : summary d'abord, puis get de proche en proche — ne demander --content
que sur l'élément travaillé. Écrire par petits lots cohérents et relire la fiche après coup.`

const OPS_HELP = `Vocabulaire d'ops (corps JSON : { "ops": [ … ] }) — lot ATOMIQUE, validé zod + invariants.
Les créations acceptent un "id" optionnel (chaîne libre unique) : les ops suivants du même lot
peuvent alors référencer l'entité par cet id. Sans "id", un UUID est généré (rendu dans le rapport).
Aucun op ne prend de position : tout est auto-placé, l'humain réarrange au canvas.

Créations :
  {"op":"create-page","name":"Tarifs","slug":"tarifs","parent":"<poignée page>","description":"…","roles":["client"],"lot":2}
  {"op":"create-block","page":"<poignée>","name":"Grille","blockType":"grid","content":"markdown…"}
  {"op":"create-module","name":"Paiement"}
  {"op":"create-feature","module":"<poignée>","code":"PAY-01","name":"Payer un devis","estimate":"2j","content":"markdown…"}
  {"op":"create-service","name":"CentralPay","baseUrl":"https://…","risk":"high","endpoints":[{"method":"POST","path":"/payments"}]}
  {"op":"add-api-ref","block":"<bloc>","service":"<poignée>","method":"GET","path":"/devis"}
      → LA façon de connecter un BLOC à une API (rendue dans la carte du bloc). remove-api-ref pour retirer.

Commentaires (v13 — fils ancrés page/bloc, lus dans le panneau 💬 de l'app) :
  {"op":"create-comment","target":"<page|bloc>","markdown":"…","tag":{"label":"Wording","color":"#7c3aed"},"forClaude":false}
      → "forClaude":true = fil adressé à l'agent (réservé aux membres Pilot'in, invisible aux clients)
  {"op":"reply-comment","comment":"<id ≥ 4>","markdown":"…"}
  {"op":"resolve-comment","comment":"<id ≥ 4>"}          ("resolved":false pour rouvrir)
  Compat : create-behavior produit un commentaire tag « Comportement » ; create-api-note une
  connexion inline du bloc (ou un commentaire tag « API » si la page cible n'a aucun bloc).

Modifications :
  {"op":"update","target":"<poignée>","set":{"name":"…","slug":"…","lot":3}}   champs selon le type
  {"op":"set-content","target":"<bloc|fonctionnalité>","markdown":"…"}           remplace le contenu
  {"op":"set-field","feature":"<poignée>","field":"perimeter|libellé","option":"Site"}  crée l'option si absente
  {"op":"set-site","context":"…","constraints":["…"]}
  {"op":"set-home","page":"<poignée>"}

Liens (navigatesTo : page→page · dependsOn : fonctionnalité→fonctionnalité · realizedBy : fonctionnalité→page/bloc) :
  {"op":"link","type":"realizedBy","source":"PAY-01","target":"<bloc>"}
  {"op":"unlink","type":"navigatesTo","source":"<page>","target":"<page>"}

Suppression (cascade : page → blocs + notes + arêtes ; module plein ou service référencé : refusé) :
  {"op":"delete","target":"<poignée>"}

Le contenu ("content"/"markdown") est du markdown borné : #–###### , listes plates - / 1., citation >,
\`\`\` code, **gras**, *italique*, \`code\`, [lien](url), <u>souligné</u>.`

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** `<dossier>/<fichier>` → ProjectDoc migré + validé (mêmes gardes que le serveur). */
async function loadProject(path: string): Promise<ProjectDoc> {
  const m = /^([^/]+)\/([^/]+)$/.exec(path.trim())
  if (!m) fail(`Chemin de projet invalide : « ${path} » (attendu : <dossier>/<fichier>).`)
  const [, folder, file] = m
  const raw = await readFileRaw(folder!, file!)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(`Le fichier ${path} n'est pas un JSON valide.`)
  }
  return parseProjectDoc(migrate(parsed))
}

/**
 * Localise le serveur Flooow vivant. Plusieurs instances peuvent coexister en dev (dev.sh lance
 * l'API sur 3011 — celle que le front proxie — tandis que le défaut de config est 3010) : on sonde
 * les candidats et on prend le premier qui répond. Écrire sur un autre serveur que celui de l'app
 * créerait une room parallèle sur le même fichier — c'est exactement ce qu'on veut éviter.
 */
async function findServer(): Promise<string | null> {
  // PORT explicite d'abord (l'appelant sait ce qu'il fait), puis 3011 (l'API que le front
  // proxie — dev.sh et vite.config), puis le défaut serveur. NE PAS mettre 3010 en tête :
  // écrire sur une instance parallèle pendant que l'app est branchée sur 3011 ouvrirait
  // deux rooms sur le même fichier.
  const explicit = process.env.PORT ? [Number(process.env.PORT)] : []
  const candidates = [...new Set([...explicit, 3011, config.port, 3010])]
  for (const port of candidates) {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 800)
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctl.signal })
      clearTimeout(t)
      if (res.ok) return `http://127.0.0.1:${port}`
    } catch {
      /* candidat suivant */
    }
  }
  return null
}

/** Lit le lot d'ops depuis un fichier ou stdin. Accepte { ops: [...] } ou un tableau nu. */
async function readOps(source: string | undefined): Promise<AgentOp[]> {
  const { readFile } = await import('node:fs/promises')
  const text = source
    ? await readFile(source, 'utf8').catch(() => fail(`Fichier d'ops introuvable : ${source}`))
    : await new Promise<string>((resolvePromise) => {
        let buf = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk) => (buf += chunk))
        process.stdin.on('end', () => resolvePromise(buf))
      })
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('Le lot d’ops n’est pas un JSON valide. Voir : flooow ops')
  }
  const ops = Array.isArray(parsed) ? parsed : (parsed as { ops?: unknown }).ops
  if (!Array.isArray(ops) || ops.length === 0) fail('Lot vide — attendu { "ops": [ … ] }.')
  return ops as AgentOp[]
}

/**
 * Applique un lot d'ops. Chemin nominal : la route serveur (qui écrit dans le Y.Doc — si la room
 * est ouverte, les clients voient la modification en direct). Repli si le serveur est éteint :
 * application directe sur le fichier — sans serveur il n'existe aucune room, donc aucun risque
 * d'écrasement ; le même applyOps (atomique, validé) est utilisé dans les deux cas.
 */
async function cmdApply(path: string, source: string | undefined): Promise<string> {
  const m = /^([^/]+)\/([^/]+)$/.exec(path.trim())
  if (!m) fail(`Chemin de projet invalide : « ${path} » (attendu : <dossier>/<fichier>).`)
  const [, folder, file] = m
  const ops = await readOps(source)

  const base = await findServer()
  if (base) {
    const res = await fetch(`${base}/api/agent/${folder}/${file}/ops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops }),
    })
    const body = (await res.json()) as { report?: string[]; error?: { message?: string } }
    if (!res.ok) fail(`Refusé par le serveur : ${body.error?.message ?? res.statusText}`)
    return [`Appliqué via le serveur (${base}, room live) :`, ...(body.report ?? [])].join('\n')
  }

  const raw = await readFileRaw(folder!, file!)
  const prev = parseProjectDoc(migrate(JSON.parse(raw)))
  try {
    const { doc, report } = applyOps(prev, ops)
    await writeFile(folder!, file!, doc)
    return [`Appliqué en direct sur le fichier (serveur éteint — aucune room ouverte) :`, ...report].join('\n')
  } catch (err) {
    if (err instanceof AgentOpError) fail(`Lot refusé : ${err.message}`)
    throw err
  }
}

/** Crée un dossier (idempotent) + un projet vierge, et rend le lien direct vers l'app. */
// ── Rangement chez le site (cadrage par projet, publié par Portulan) ──────────

const SITE_RE = /^(dev|preprod|tma)\/([a-z0-9][a-z0-9-]*)$/
const ENV_URL_PREFIX: Record<string, string> = { dev: 'd', preprod: 'p', tma: 't' }
/** Répertoires typés du narratif (méthode lannes) posés dans le docs/ du site. */
const DOCS_TYPE_DIRS: Record<string, string> = {
  decisions: 'Décisions — ce qu’on a choisi (ADR-NNNN, proposed → accepted → superseded).',
  questions: 'Questions — ce qu’on ne sait pas (Q-NNN, open → answered → closed). Jamais tranchées seul.',
  decouvertes: 'Découvertes — ce que le terrain a appris (D-NNN, datées, immuables).',
  spec: 'Specs — ce qu’on sait (état courant, draft → stable → obsolete).',
}

/**
 * Prépare le rangement d'un projet dans le docs/ d'un site bao : squelette docs
 * (portulan.yaml + répertoires typés + .graph/) puis lien symbolique
 * <dataDir>/<dossier> → <site>/docs/.graph. Idempotent ; refuse d'écraser un
 * dossier local existant (le déménager à la main d'abord). Renvoie l'URL Portulan.
 */
async function linkFolderToSite(folder: string, site: string, title: string, file: string): Promise<string> {
  const m = SITE_RE.exec(site.trim())
  if (!m) return fail(`Site invalide : « ${site} » (attendu : dev|preprod|tma/<slug>).`)
  const [, env, slug] = m
  const sitePath = `/srv/${env}/${slug}`
  const siteExists = await nodeFs
    .stat(sitePath)
    .then((s) => s.isDirectory())
    .catch(() => false)
  if (!siteExists)
    return fail(
      `Le site ${env}/${slug} n'existe pas (${sitePath}).\nLe créer d'abord (léger, sans BDD) : bao site create ${env}/${slug} --type static`,
    )

  const docsDir = pathJoin(sitePath, 'docs')
  const target = pathJoin(docsDir, '.graph')
  await nodeFs.mkdir(target, { recursive: true })
  for (const [dir, intro] of Object.entries(DOCS_TYPE_DIRS)) {
    const d = pathJoin(docsDir, dir)
    await nodeFs.mkdir(d, { recursive: true })
    const index = pathJoin(d, 'index.md')
    if (!(await nodeFs.access(index).then(() => true, () => false)))
      await nodeFs.writeFile(index, `# ${dir[0]!.toUpperCase()}${dir.slice(1)}\n\n${intro}\n`, 'utf8')
  }
  const yaml = pathJoin(docsDir, 'portulan.yaml')
  if (!(await nodeFs.access(yaml).then(() => true, () => false)))
    await nodeFs.writeFile(yaml, `title: ${title}\n`, 'utf8')

  // AGENTS.md : le mode d'emploi du cadrage pour TOUT agent travaillant dans le dépôt du site —
  // c'est ce qui rend les commentaires « pour Claude » découvrables hors du dépôt flooow (un
  // CLAUDE.md du site n'a qu'à le référencer). Idempotent : jamais réécrit s'il existe.
  const agentsMd = pathJoin(docsDir, 'AGENTS.md')
  if (!(await nodeFs.access(agentsMd).then(() => true, () => false)))
    await nodeFs.writeFile(agentsMd, siteAgentsMd(`${folder}/${file}`), 'utf8')

  const linkPath = pathResolve(config.dataDir, folder)
  const st = await nodeFs.lstat(linkPath).catch(() => null)
  if (st?.isSymbolicLink()) {
    const cur = await nodeFs.readlink(linkPath)
    if (pathResolve(cur) !== target)
      return fail(`Le dossier « ${folder} » est déjà lié à ${cur} — pas à ${target}.`)
  } else if (st) {
    return fail(
      `Le dossier « ${folder} » existe déjà en local (${linkPath}).\nDéménager son contenu vers ${target}/ puis le remplacer par le lien avant de recommencer.`,
    )
  } else {
    await nodeFs.mkdir(pathResolve(config.dataDir), { recursive: true })
    await nodeFs.symlink(target, linkPath)
  }
  return `https://${slug}--docs.${ENV_URL_PREFIX[env!]}.pilot-in.net`
}

/**
 * Contenu du AGENTS.md posé dans le docs/ d'un site lié (voir linkFolderToSite). Auto-porteur :
 * un agent qui ne connaît RIEN de Flooow doit pouvoir traiter un commentaire avec ce seul fichier.
 */
function siteAgentsMd(project: string): string {
  return `# Cadrage Flooow de ce site — mode d'emploi agent

Le cadrage visuel du projet vit dans \`.graph/\` (app Flooow). Il se LIT et s'ÉCRIT uniquement
par la CLI \`flooow\`, invocable depuis n'importe quel répertoire :

\`\`\`bash
pnpm -s -C /srv/dev/flooow flooow summary ${project}     # sommaire (point d'entrée)
pnpm -s -C /srv/dev/flooow flooow --help                        # le reste
\`\`\`

**INTERDIT : modifier un \`.graph.json\` à la main** — le fichier d'un projet ouvert est réécrit
par le serveur, toute édition directe serait écrasée. \`flooow apply\` (lot d'ops JSON) est le
seul chemin d'écriture.

## Commentaires adressés à Claude

Les membres Pilot'in posent dans l'app des commentaires « ✳ pour Claude » sur les éléments du
cadrage : ce sont des CONSIGNES à traiter.

- **En début de session** : \`pnpm -s -C /srv/dev/flooow flooow comments ${project} --for-claude\`
- **Sur une référence collée** (\`flooow://…#…\`, copiée par le bouton 🔗 d'un fil dans l'app) :
  \`pnpm -s -C /srv/dev/flooow flooow comment <référence>\` → le fil, la fiche de l'élément
  ancré, et le mode d'emploi exact pour répondre.
- **Après traitement**, répondre ET résoudre dans un même lot d'ops (\`reply-comment\` +
  \`resolve-comment\`) — un fil traité sans réponse ni résolution est un travail invisible.

## Narratif

Décisions/questions/découvertes/specs : fichiers markdown de ce docs/ (voir les index de chaque
répertoire), à éditer directement. Le graphe, lui, ne passe que par la CLI.
`
}

async function cmdCreate(path: string, projectName: string | undefined, site?: string): Promise<string> {
  const m = /^([^/]+)\/([^/]+)$/.exec(path.trim())
  if (!m) fail(`Chemin invalide : « ${path} » (attendu : <dossier>/<fichier>).`)
  const [, folder, file] = m
  const displayName = projectName?.trim() || file!
  const doc = createEmptyProject(displayName)

  const portulanUrl = site ? await linkFolderToSite(folder!, site, displayName, file!) : null

  const base = await findServer()
  let slug = file!
  if (base) {
    const post = async (url: string, body: unknown): Promise<Response> =>
      fetch(`${base}${url}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    const folderRes = await post('/api/folders', { name: folder })
    if (!folderRes.ok && folderRes.status !== 409) {
      const body = (await folderRes.json()) as { error?: { message?: string } }
      fail(`Création du dossier refusée : ${body.error?.message ?? folderRes.statusText}`)
    }
    const fileRes = await post(`/api/folders/${folder}/files`, { name: file, doc })
    const body = (await fileRes.json()) as { file?: { slug: string }; error?: { message?: string } }
    if (!fileRes.ok) fail(`Création du projet refusée : ${body.error?.message ?? fileRes.statusText}`)
    slug = body.file?.slug ?? slug
  } else {
    await createFolder(folder!).catch((err: unknown) => {
      if (!(err instanceof HttpError && err.status === 409)) throw err
    })
    const info = await createFile(folder!, file!, doc)
    slug = info.slug
  }

  return [
    `Projet « ${displayName} » créé : ${folder}/${slug}`,
    `Lien direct : ${config.appUrl}/p/${folder}/${slug}`,
    ...(portulanUrl
      ? [
          `Docs (Portulan) : ${portulanUrl} — narratif markdown dans /srv/${site!.trim()}/docs/`,
          `Le JSON vit dans docs/.graph/ (ignoré par Portulan) ; le dossier de l'app est un lien symbolique.`,
        ]
      : []),
    `Prochaine étape agent : flooow summary ${folder}/${slug}`,
  ].join('\n')
}

/**
 * Liste les fils de commentaires (v13). Défaut : les OUVERTS ; `--resolved` les résolus, `--all`
 * tout ; `--for-claude` ne garde que les fils adressés à l'agent ; `--tag <libellé>` filtre sur le
 * tag custom. Sortie complète (corps + réponses en markdown) : c'est la matière à traiter, pas un
 * sommaire — un fil se répond/résout ensuite par ops (reply-comment / resolve-comment).
 */
function renderComments(
  doc: ProjectDoc,
  opts: { forClaude: boolean; resolved: boolean; all: boolean; tag?: string },
): string {
  const anchorLabel = (c: Comment): string => {
    const n = doc.nodes.find((x) => x.id === c.anchor.nodeId)
    if (!n) return 'élément supprimé'
    if (isPage(n)) return `page « ${n.attrs.name} »`
    if (isBlock(n)) {
      const page = doc.nodes.find((x) => x.id === n.parentId)
      const prefix = page && isPage(page) ? `${page.attrs.name} › ` : ''
      return `bloc « ${prefix}${n.attrs.name} »`
    }
    return c.anchor.nodeId
  }
  // Poignée affichée : plus longue que le shortId standard (8) — les ids issus de la migration
  // commencent tous par « comment- », huit caractères ne discriminent rien.
  const handleOf = (c: Comment): string => (c.id.length > 16 ? c.id.slice(0, 16) : c.id)
  const kept = doc.comments.filter((c) => {
    if (!opts.all && (opts.resolved ? !c.resolved : c.resolved)) return false
    if (opts.forClaude && c.forClaude !== true) return false
    if (opts.tag && c.tag?.label.toLowerCase() !== opts.tag.toLowerCase()) return false
    return true
  })
  if (!kept.length) return 'Aucun commentaire ne correspond.'
  const lines: string[] = []
  for (const c of kept) {
    const badges = [
      c.forClaude ? '✳ pour Claude' : null,
      c.tag ? `[${c.tag.label}]` : null,
      c.resolved ? 'résolu' : 'ouvert',
    ].filter(Boolean)
    lines.push(`── ${handleOf(c)} · ${anchorLabel(c)} · ${badges.join(' · ')} · ${c.author || '?'} ${c.createdAt}`)
    if (c.anchor.range) lines.push(`   passage visé : « ${c.anchor.range.text} »`)
    const body = docToMarkdown(c.body)
    if (body) lines.push(...body.split('\n').map((l) => `   ${l}`))
    for (const r of c.replies) {
      lines.push(`   ↳ ${r.author || '?'} ${r.createdAt} :`)
      lines.push(...docToMarkdown(r.body).split('\n').map((l) => `     ${l}`))
    }
    lines.push('')
  }
  lines.push(`${kept.length} fil(s). Répondre/résoudre : ops reply-comment / resolve-comment (flooow ops).`)
  return lines.join('\n')
}

/**
 * Référence canonique d'un fil : `flooow://<dossier>/<fichier>#<id>` — c'est ce que copie le
 * bouton 🔗 d'un fil dans l'app. Accepter la référence TELLE QUELLE est le contrat : n'importe
 * quel agent, depuis n'importe quel dépôt, la colle après `flooow comment` et obtient tout le
 * contexte. Repli : `<dossier>/<fichier> <poignée>` en deux arguments.
 */
function parseCommentRef(arg1: string | undefined, arg2: string | undefined): { path: string; handle: string } {
  if (!arg1) fail('Usage : flooow comment <flooow://dossier/fichier#id | dossier/fichier> [poignée]')
  if (arg1.startsWith('flooow://')) {
    const rest = arg1.slice('flooow://'.length)
    const hash = rest.indexOf('#')
    if (hash <= 0 || hash === rest.length - 1)
      fail(`Référence invalide : « ${arg1} » (attendu : flooow://<dossier>/<fichier>#<id>).`)
    return { path: rest.slice(0, hash), handle: rest.slice(hash + 1) }
  }
  if (!arg2) fail('Poignée manquante : flooow comment <dossier/fichier> <id ≥ 4 caractères>')
  return { path: arg1, handle: arg2 }
}

/** UN fil + la fiche de son élément ancré + le mode d'emploi (répondre / résoudre par ops). */
function renderOneComment(doc: ProjectDoc, path: string, handle: string): string {
  const h = handle.trim()
  if (h.length < 4) fail(`Poignée trop courte : « ${handle} » (≥ 4 caractères).`)
  const matches = doc.comments.filter((c) => c.id === h || c.id.startsWith(h))
  if (!matches.length) fail(`Commentaire introuvable : « ${handle} ». Voir : flooow comments ${path} --all`)
  if (matches.length > 1)
    fail(`Poignée ambiguë : « ${handle} » → ${matches.map((c) => c.id.slice(0, 16)).join(', ')}.`)
  const c = matches[0]!

  const lines: string[] = [
    renderComments(
      { ...doc, comments: [c] },
      { forClaude: false, resolved: c.resolved, all: true },
    )
      .split('\n')
      .slice(0, -1) // sans la ligne de compte générique
      .join('\n'),
  ]
  // Fiche de l'élément ancré : le CONTEXTE du fil — l'agent ne devine pas ce que vise la consigne.
  if (doc.nodes.some((n) => n.id === c.anchor.nodeId)) {
    lines.push('── Élément ancré ──', entityCard(doc, c.anchor.nodeId, { content: true }))
  } else {
    lines.push('── Élément ancré : SUPPRIMÉ (le fil reste lisible, la consigne peut être caduque) ──')
  }
  lines.push(
    '',
    '── Traiter ce fil ──',
    'Modifier le graphe si la consigne le demande (flooow ops pour le vocabulaire), puis répondre',
    'ET résoudre dans un même lot :',
    `  echo '{"ops":[{"op":"reply-comment","comment":"${c.id.slice(0, 16)}","markdown":"Fait : …"},{"op":"resolve-comment","comment":"${c.id.slice(0, 16)}"}]}' | pnpm -s -C /srv/dev/flooow flooow apply ${path}`,
  )
  return lines.join('\n')
}

async function cmdLs(): Promise<string> {
  const folders = await listFolders()
  if (!folders.length) return 'Aucun dossier de projets.'
  const lines: string[] = []
  for (const folder of folders) {
    lines.push(`${folder.slug}/`)
    for (const f of await listFiles(folder.slug)) {
      const kb = Math.round(f.size / 1024)
      lines.push(`  ${folder.slug}/${f.slug} — ${f.projectName ?? 'sans nom'} · ${kb} Ko · ${f.updatedAt.slice(0, 16).replace('T', ' ')}`)
    }
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  // Flags à valeur (--site <env>/<slug>, --tag <libellé>) : extraits AVANT le tri
  // flags/positionnels, sinon la valeur serait prise pour un argument positionnel.
  let site: string | undefined
  const siteIdx = args.indexOf('--site')
  if (siteIdx !== -1) {
    site = args[siteIdx + 1]
    if (!site || site.startsWith('--')) fail('--site attend une valeur : --site <env>/<slug>')
    args.splice(siteIdx, 2)
  }
  let tag: string | undefined
  const tagIdx = args.indexOf('--tag')
  if (tagIdx !== -1) {
    tag = args[tagIdx + 1]
    if (!tag || tag.startsWith('--')) fail('--tag attend une valeur : --tag <libellé>')
    args.splice(tagIdx, 2)
  }
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const positional = args.filter((a) => !a.startsWith('--'))
  const [command, path, ...rest] = positional

  if (!command || command === 'help' || flags.has('--help')) {
    console.log(USAGE)
    return
  }

  switch (command) {
    case 'ls':
      console.log(await cmdLs())
      return
    case 'summary': {
      if (!path) fail('Usage : flooow summary <dossier/fichier>')
      console.log(projectSummary(await loadProject(path)))
      return
    }
    case 'get': {
      const handle = rest.join(' ').trim()
      if (!path || !handle) fail('Usage : flooow get <dossier/fichier> <poignée> [--content]')
      console.log(entityCard(await loadProject(path), handle, { content: flags.has('--content') }))
      return
    }
    case 'find': {
      const query = rest.join(' ').trim()
      if (!path || !query) fail('Usage : flooow find <dossier/fichier> <texte>')
      const doc = await loadProject(path)
      const matches = findEntities(doc, query)
      if (!matches.length) {
        console.log(`Aucun résultat pour « ${query} ». Voir le sommaire : flooow summary ${path}`)
        return
      }
      console.log(matches.map((m) => `- [${m.kind}] ${m.name} (${m.id.slice(0, 8)})`).join('\n'))
      return
    }
    case 'comments': {
      if (!path) fail('Usage : flooow comments <dossier/fichier> [--for-claude] [--resolved | --all] [--tag <libellé>]')
      console.log(
        renderComments(await loadProject(path), {
          forClaude: flags.has('--for-claude'),
          resolved: flags.has('--resolved'),
          all: flags.has('--all'),
          tag,
        }),
      )
      return
    }
    case 'comment': {
      const ref = parseCommentRef(path, rest[0])
      console.log(renderOneComment(await loadProject(ref.path), ref.path, ref.handle))
      return
    }
    case 'ops':
      console.log(OPS_HELP)
      return
    case 'create': {
      if (!path) fail('Usage : flooow create <dossier/fichier> [nom du projet…] [--site <env>/<slug>]')
      console.log(await cmdCreate(path, rest.join(' '), site))
      return
    }
    case 'apply': {
      if (!path) fail('Usage : flooow apply <dossier/fichier> [ops.json] (ou lot JSON sur stdin)')
      console.log(await cmdApply(path, rest[0]))
      return
    }
    default:
      fail(`Commande inconnue : « ${command} ».\n\n${USAGE}`)
  }
}

main().catch((err: unknown) => {
  if (err instanceof HttpError) fail(err.message)
  fail(err instanceof Error ? err.message : String(err))
})

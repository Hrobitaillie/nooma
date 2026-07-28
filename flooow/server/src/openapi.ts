// Doc API auto-générée. Deux routes montées sur l'app racine (mountDocs) :
//   GET /api/openapi.json — spec OpenAPI 3.1 construite par INTROSPECTION des routes Hono
//     (toute nouvelle route apparaît d'elle-même, sans annotation) ;
//   GET /api/docs — UI interactive Scalar (mise en page type readme.io : sidebar,
//     console « Test Request », auth mémorisée dans le navigateur via persistAuth).
// ROUTE_DOCS n'est qu'un ENRICHISSEMENT (résumés, corps, réponses) : une route absente
// de cette table est quand même listée, avec ses paramètres de chemin déduits.
import type { Hono } from 'hono'

const VERSION = '0.1.0'

type Json = Record<string, unknown>

// ── Briques de schéma réutilisables ─────────────────────────────────────────
const REF_ERREUR = { $ref: '#/components/schemas/Erreur' }

/** Réponse d'erreur uniforme du routeur api : { error: { code, message } }. */
function err(description: string): Json {
  return { description, content: { 'application/json': { schema: REF_ERREUR } } }
}

const SCHEMAS: Json = {
  Erreur: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: { code: { type: 'string' }, message: { type: 'string' } },
        required: ['code', 'message'],
      },
    },
    required: ['error'],
  },
  Session: {
    type: 'object',
    description: 'Identité dérivée des headers AuthCrunch (auth.ts) + droit d’écriture.',
    properties: {
      id: { type: 'string', description: 'Identifiant stable (sujet JWT, sinon email, sinon nom).' },
      name: { type: 'string' },
      email: { type: ['string', 'null'] },
      role: { type: 'string', enum: ['dev', 'marin', 'client'] },
      avatar: { type: ['string', 'null'] },
      authenticated: { type: 'boolean', description: 'false = repli anonyme (dev direct hors Caddy).' },
      canWrite: { type: 'boolean', description: 'true pour dev/marin ; client = lecture seule.' },
    },
  },
  Utilisateur: {
    type: 'object',
    description: 'Entrée de l’annuaire (mentions « @ ») : Pilot’In internes actifs.',
    properties: {
      id: { type: 'string', description: 'UUID bao, persisté dans les mentions des documents.' },
      name: { type: 'string' },
      email: { type: ['string', 'null'] },
      role: { type: 'string', enum: ['dev', 'marin', 'client'] },
    },
  },
  Dossier: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      name: { type: 'string' },
      fileCount: { type: 'integer' },
      updatedAt: { type: ['string', 'null'], format: 'date-time' },
    },
  },
  Fichier: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      name: { type: 'string' },
      projectName: { type: ['string', 'null'] },
      size: { type: 'integer', description: 'Taille en octets.' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Document: {
    type: 'object',
    description:
      'Document projet complet (.graph.json) portant meta.formatVersion — voir packages/core/src/model.',
    additionalProperties: true,
  },
  OpAgent: {
    type: 'object',
    description:
      'Opération du vocabulaire agent (@flooow/core/agent/ops) : create-page, create-block, ' +
      'create-module, create-feature, create-service, create-behavior, create-api-note, ' +
      'add-api-ref, remove-api-ref, create-note-page, update, set-content, set-field, ' +
      'set-site, set-home, link, unlink, delete.',
    properties: { op: { type: 'string' } },
    required: ['op'],
    additionalProperties: true,
  },
}

/** Corps JSON { name } (création / renommage). */
function bodyName(example: string): Json {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        example: { name: example },
      },
    },
  }
}

function json200(schema: Json, description = 'OK'): Json {
  return { description, content: { 'application/json': { schema } } }
}

const R403 = err('Écriture refusée (rôle client = lecture seule).')
const R404 = err('Dossier ou fichier introuvable.')

// ── Enrichissement par route (clé : « MÉTHODE /chemin » côté Hono, avec :params) ──
const ROUTE_DOCS: Record<string, Json> = {
  'GET /api/health': {
    tags: ['Santé'],
    summary: 'Sonde de vie',
    description: 'Sans auth. Répond toujours si le process tourne.',
    security: [],
    responses: {
      '200': json200({
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          service: { type: 'string' },
          version: { type: 'string' },
        },
      }),
    },
  },
  'GET /api/session': {
    tags: ['Session'],
    summary: 'Identité courante',
    description:
      'Identité dérivée des headers injectés par AuthCrunch, plus le droit d’écriture. ' +
      'Sans header (dev direct sur le port), repli « anonyme » avec rôle dev.',
    responses: { '200': json200({ $ref: '#/components/schemas/Session' }) },
  },
  'GET /api/whoami': {
    tags: ['Session'],
    summary: 'Alias historique de /session',
    deprecated: true,
    responses: { '200': json200({ $ref: '#/components/schemas/Session' }) },
  },
  'GET /api/users': {
    tags: ['Annuaire'],
    summary: 'Annuaire des mentions « @ »',
    description:
      'Lecture ouverte à tous les rôles. N’expose que nom/email/rôle des Pilot’In internes actifs.',
    responses: {
      '200': json200({
        type: 'object',
        properties: { users: { type: 'array', items: { $ref: '#/components/schemas/Utilisateur' } } },
      }),
    },
  },
  'GET /api/folders': {
    tags: ['Dossiers'],
    summary: 'Lister les dossiers',
    responses: {
      '200': json200({
        type: 'object',
        properties: { folders: { type: 'array', items: { $ref: '#/components/schemas/Dossier' } } },
      }),
    },
  },
  'POST /api/folders': {
    tags: ['Dossiers'],
    summary: 'Créer un dossier',
    requestBody: bodyName('Clients 2026'),
    responses: {
      '201': json200({ type: 'object', properties: { folder: { $ref: '#/components/schemas/Dossier' } } }, 'Créé'),
      '403': R403,
    },
  },
  'PATCH /api/folders/:folder': {
    tags: ['Dossiers'],
    summary: 'Renommer un dossier',
    requestBody: bodyName('Nouveau nom'),
    responses: {
      '200': json200({ type: 'object', properties: { folder: { $ref: '#/components/schemas/Dossier' } } }),
      '403': R403,
      '404': R404,
    },
  },
  'DELETE /api/folders/:folder': {
    tags: ['Dossiers'],
    summary: 'Supprimer un dossier',
    responses: { '204': { description: 'Supprimé' }, '403': R403, '404': R404 },
  },
  'GET /api/folders/:folder/files': {
    tags: ['Fichiers'],
    summary: 'Lister les fichiers d’un dossier',
    responses: {
      '200': json200({
        type: 'object',
        properties: { files: { type: 'array', items: { $ref: '#/components/schemas/Fichier' } } },
      }),
      '404': R404,
    },
  },
  'POST /api/folders/:folder/files': {
    tags: ['Fichiers'],
    summary: 'Créer un fichier projet',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, doc: { $ref: '#/components/schemas/Document' } },
            required: ['name', 'doc'],
          },
          example: { name: 'mon-projet', doc: { meta: { formatVersion: 9 } } },
        },
      },
    },
    responses: {
      '201': json200({ type: 'object', properties: { file: { $ref: '#/components/schemas/Fichier' } } }, 'Créé'),
      '403': R403,
      '404': R404,
    },
  },
  'GET /api/files/:folder/:file': {
    tags: ['Fichiers'],
    summary: 'Lire un document (brut)',
    description: 'Renvoie le JSON du document tel que stocké sur disque.',
    responses: { '200': json200({ $ref: '#/components/schemas/Document' }), '404': R404 },
  },
  'PUT /api/files/:folder/:file': {
    tags: ['Fichiers'],
    summary: 'Écraser un document',
    description:
      '⚠️ Écrit le document ENTIER. Ne pas écrire le .graph.json d’une room collaborative ' +
      'ouverte : le pont collab repersisterait par-dessus. Corps borné à 20 Mo (413 au-delà).',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Document' } } },
    },
    responses: {
      '200': json200({
        type: 'object',
        properties: { ok: { type: 'boolean' }, updatedAt: { type: 'string', format: 'date-time' } },
      }),
      '403': R403,
      '404': R404,
      '413': err('Corps trop volumineux (> 20 Mo).'),
    },
  },
  'PATCH /api/files/:folder/:file': {
    tags: ['Fichiers'],
    summary: 'Renommer un fichier',
    requestBody: bodyName('nouveau-nom'),
    responses: {
      '200': json200({ type: 'object', properties: { file: { $ref: '#/components/schemas/Fichier' } } }),
      '403': R403,
      '404': R404,
    },
  },
  'DELETE /api/files/:folder/:file': {
    tags: ['Fichiers'],
    summary: 'Supprimer un fichier',
    responses: { '204': { description: 'Supprimé' }, '403': R403, '404': R404 },
  },
  'POST /api/agent/:folder/:file/ops': {
    tags: ['Agent'],
    summary: 'Appliquer un lot d’opérations agent',
    description:
      'Écriture par lot via le Y.Doc (pivot agentique) : sûre même si la room est ouverte, ' +
      'contrairement à PUT /files. Atomique : 400 avec le message de l’op fautive si le lot ' +
      'est invalide, sinon { ok, report }. Vocabulaire : @flooow/core/agent/ops.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { ops: { type: 'array', items: { $ref: '#/components/schemas/OpAgent' }, minItems: 1 } },
            required: ['ops'],
          },
          example: {
            ops: [
              { op: 'create-page', name: 'Accueil', slug: '' },
              { op: 'create-block', page: 'Accueil', name: 'Hero', blockType: 'hero' },
            ],
          },
        },
      },
    },
    responses: {
      '200': json200({
        type: 'object',
        properties: { ok: { type: 'boolean' }, report: { type: 'object', additionalProperties: true } },
      }),
      '400': err('Lot invalide (invalid_ops ou op fautive).'),
      '403': R403,
      '404': R404,
    },
  },
}

ROUTE_DOCS['POST /api/proxy'] = {
  tags: ['Proxy'],
  summary: 'Relayer une requête vers une API externe',
  description:
    'Console d’essai de la vue API de l’app : relaye une requête vers un service tiers du ' +
    'cadrage (le navigateur est bloqué par CORS). Seuls les headers du corps sont transmis. ' +
    'Anti-SSRF : hôte résolu et validé (toutes adresses publiques), connexion épinglée sur ' +
    'l’adresse validée, redirections non suivies. Réponse bornée à 2 Mo, timeout 20 s.',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] },
            url: { type: 'string', description: 'URL absolue http(s) du service tiers.' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            body: { type: ['string', 'null'] },
          },
          required: ['method', 'url'],
        },
        example: {
          method: 'GET',
          url: 'https://www.booking-manager.com/api/v2/bases',
          headers: { Authorization: 'Bearer <jeton>' },
        },
      },
    },
  },
  responses: {
    '200': json200({
      type: 'object',
      description: 'Réponse du tiers, telle quelle (le statut HTTP tiers est DANS le corps).',
      properties: {
        status: { type: 'integer' },
        statusText: { type: 'string' },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        body: { type: 'string' },
        truncated: { type: 'boolean', description: 'true si le corps dépassait 2 Mo (coupé).' },
        durationMs: { type: 'integer' },
      },
    }),
    '400': err('Méthode, URL ou hôte refusé.'),
    '403': R403,
    '502': err('Service tiers injoignable ou timeout.'),
  },
}

// Descriptions des paramètres de chemin récurrents.
const PARAM_DESCRIPTIONS: Record<string, string> = {
  folder: 'Slug du dossier (voir GET /api/folders).',
  file: 'Slug du fichier, sans extension (voir GET /api/folders/{folder}/files).',
}

// Ordre (et description) des groupes dans la sidebar.
const TAGS: Json[] = [
  { name: 'Santé' },
  { name: 'Session', description: 'Identité et droits de l’appelant.' },
  { name: 'Annuaire', description: 'Utilisateurs référencés par les mentions « @ ».' },
  { name: 'Dossiers' },
  { name: 'Fichiers', description: 'Documents projet (.graph.json) rangés par dossier.' },
  { name: 'Agent', description: 'Écritures par lot d’opérations, via le document collaboratif.' },
  { name: 'Proxy', description: 'Relais vers les API tierces du cadrage (console d’essai de la vue API).' },
]

// Repli de groupe pour une route non documentée : premier segment après /api.
function tagFromPath(path: string): string {
  const seg = path.replace(/^\/api\/?/, '').split('/')[0]
  return seg ? seg : 'API'
}

/** `/api/files/:folder/:file` → `/api/files/{folder}/{file}` + liste des params. */
function toOpenApiPath(honoPath: string): { path: string; params: string[] } {
  const params: string[] = []
  const path = honoPath.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    params.push(name)
    return `{${name}}`
  })
  return { path, params }
}

/** Construit la spec en introspectant les routes réellement enregistrées sur l'app. */
export function buildOpenApiSpec(app: Hono): Json {
  const paths: Record<string, Json> = {}
  const seen = new Set<string>()
  const tagsVus = new Set(TAGS.map((t) => t.name as string))

  for (const route of app.routes) {
    // 'ALL' = middlewares (logger, identité) ; /api/docs et /api/openapi.json = cette doc.
    if (route.method === 'ALL') continue
    if (route.path === '/api/docs' || route.path === '/api/openapi.json') continue
    const key = `${route.method} ${route.path}`
    if (seen.has(key)) continue
    seen.add(key)

    const { path, params } = toOpenApiPath(route.path)
    const meta = ROUTE_DOCS[key]
    const operation: Json = {
      tags: [tagFromPath(route.path)],
      summary: `${route.method} ${path}`,
      ...meta,
    }
    if (params.length > 0) {
      operation.parameters = params.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: PARAM_DESCRIPTIONS[name],
      }))
    }
    operation.responses ??= { '200': { description: 'OK' } }
    for (const t of operation.tags as string[]) tagsVus.add(t)

    paths[path] ??= {}
    ;(paths[path] as Json)[route.method.toLowerCase()] = operation
  }

  // Tags : l'ordre déclaré d'abord, puis les groupes découverts (routes non documentées).
  const tags = [
    ...TAGS,
    ...[...tagsVus].filter((t) => !TAGS.some((d) => d.name === t)).map((name) => ({ name })),
  ]

  return {
    openapi: '3.1.0',
    info: {
      title: 'Flooow — API',
      version: VERSION,
      description:
        'API REST du serveur Flooow (fichiers, dossiers, session, opérations agent). ' +
        'Spec générée automatiquement par introspection des routes Hono : toute route ' +
        'nouvelle apparaît ici sans annotation. Le temps réel (Yjs/Hocuspocus) passe par ' +
        'WebSocket sur /collab et n’est pas décrit par cette spec.',
    },
    servers: [{ url: '/', description: 'Même origine que la doc' }],
    tags,
    security: [
      { 'x-token-user-roles': [], 'x-token-user-name': [], 'x-token-user-email': [] },
    ],
    paths,
    components: {
      schemas: SCHEMAS,
      securitySchemes: {
        'x-token-user-roles': {
          type: 'apiKey',
          in: 'header',
          name: 'x-token-user-roles',
          description:
            'Rôles bao (ex. « pilotin/dev »). Le serveur cherche le token dev/marin, sinon client ' +
            '(lecture seule). En prod ces headers sont INJECTÉS par AuthCrunch après login — les ' +
            'renseigner ici ne sert qu’en dev direct sur le port, pour simuler un rôle. ' +
            'Sans aucun header : repli anonyme avec rôle dev.',
        },
        'x-token-user-name': {
          type: 'apiKey',
          in: 'header',
          name: 'x-token-user-name',
          description: 'Nom affiché (présence, curseurs). Simulation en dev direct uniquement.',
        },
        'x-token-user-email': {
          type: 'apiKey',
          in: 'header',
          name: 'x-token-user-email',
          description: 'Email (id stable si pas de sujet JWT). Simulation en dev direct uniquement.',
        },
      },
    },
  }
}

// ── UI Scalar (layout type readme.io : sidebar + doc + console de test) ──────
// persistAuth garde les headers saisis dans le localStorage du navigateur.
const DOCS_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flooow — API</title>
    <style>body { margin: 0 }</style>
  </head>
  <body>
    <div id="app"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.62.7/dist/browser/standalone.min.js"
      integrity="sha384-EwzgoZBka78eLmWZat7cTrMu7j1ix6wGO4XN+wqAIYyJ13Yq37Xdom1T7tPzSq31"
      crossorigin="anonymous"
    ></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/api/openapi.json',
        persistAuth: true,
        // Sans ça, Scalar replie chaque groupe derrière un « Show More » : la doc
        // semble vide alors que la spec est complète.
        defaultOpenAllTags: true,
        metaData: { title: 'Flooow — API' },
      })
    </script>
  </body>
</html>
`

/**
 * Monte la doc sur l'app racine : /api/docs (UI) + /api/openapi.json (spec).
 * À appeler APRÈS le montage des autres routes ; la spec est de toute façon
 * construite paresseusement (première requête) puis mise en cache.
 */
export function mountDocs(app: Hono): void {
  let cache: Json | null = null
  app.get('/api/openapi.json', (c) => {
    cache ??= buildOpenApiSpec(app)
    return c.json(cache)
  })
  app.get('/api/docs', (c) => c.html(DOCS_HTML))
}

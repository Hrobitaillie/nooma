// Relais HTTP vers les API tierces (console d'essai de la vue API — cf routes.ts).
//
// Anti-SSRF : un regex sur le nom d'hôte ne suffit pas (nom public résolvant vers
// une IP privée, rebinding DNS entre validation et connexion). Ici le nom est
// RÉSOLU d'abord, toutes les adresses retournées doivent être publiques, puis la
// connexion est ÉPINGLÉE sur l'adresse validée (option `lookup` de http.request) :
// une re-résolution entre les deux est impossible. http(s).request ne suit pas
// les redirections — un 3xx est rendu tel quel, il ne peut pas rebondir en privé.
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { HttpError } from './files.js'

export const PROXY_TIMEOUT_MS = 20_000
export const PROXY_MAX_BODY_BYTES = 2 * 1024 * 1024
// User-Agent par défaut : Node n'en met aucun, et de nombreuses API (GitHub, WAF…)
// rejettent une requête sans UA. Un navigateur/curl en fournit toujours un ; on
// reproduit ce comportement pour que la console d'essai ne trébuche pas là-dessus.
// N'écrase pas un UA fourni explicitement par l'utilisateur.
const DEFAULT_USER_AGENT = 'Flooow-API-Console/1.0 (+https://flooow.d.pilot-in.net)'

export interface ProxyResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  truncated: boolean
  durationMs: number
}

// ── Adresses privées / locales / spéciales ────────────────────────────────────
function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0)
}

// [réseau, bits de masque] — loopback, RFC1918, lien-local/metadata cloud (169.254),
// CGNAT (100.64/10), 0/8 et broadcast.
const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['255.255.255.255', 32],
]

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  return PRIVATE_V4.some(([net, bits]) => n >>> (32 - bits) === ipv4ToInt(net) >>> (32 - bits))
}

/** Développe une IPv6 en 8 groupes de 16 bits (gère `::` et le suffixe v4 pointé). null si invalide. */
function expandV6(addr: string): number[] | null {
  let s = addr
  // Suffixe IPv4 pointé (v4-mapped/compat) → deux groupes hex.
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (tail) {
    if (isIP(tail) !== 4) return null
    const n = ipv4ToInt(tail)
    s = s.slice(0, s.length - tail.length) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const back = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null
  const groups = back ? [...head, ...Array(8 - head.length - back.length).fill('0'), ...back] : head
  if (groups.length !== 8) return null
  return groups.map((g) => parseInt(g || '0', 16))
}

/** true si l'adresse (v4 ou v6) est loopback, privée, lien-local, CGNAT, ULA ou non spécifiée. */
export function isPrivateIp(addr: string): boolean {
  const a = addr.toLowerCase()
  if (isIP(a) === 4) return isPrivateV4(a)
  if (isIP(a) !== 6) return true // forme inconnue : on refuse par défaut
  const g = expandV6(a)
  if (!g) return true // IPv6 non développable : refus par défaut
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number]
  // v4-mapped (::ffff:0:0/96) ou v4-compat (::0.0.0.0/96) : juger sur l'IPv4 portée.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
    if (g6 === 0 && g7 <= 1) return true // :: et ::1
    return isPrivateV4(`${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`)
  }
  if (g0 >= 0xfc00 && g0 <= 0xfdff) return true // fc00::/7 (ULA)
  if (g0 >= 0xfe80 && g0 <= 0xfebf) return true // fe80::/10 (lien-local)
  return false
}

/**
 * Résout et valide l'hôte d'une URL cible, et renvoie l'adresse à épingler.
 * Les formes IPv4 décimales/hex/octales sont déjà normalisées en pointé par le
 * parseur d'URL WHATWG ; l'hostname IPv6 arrive entre crochets, on les retire.
 */
async function resolvePinnedAddress(target: URL): Promise<{ address: string; family: number }> {
  const host = target.hostname.replace(/\.$/, '').replace(/^\[|\]$/g, '').toLowerCase()

  const literal = isIP(host)
  if (literal) {
    if (isPrivateIp(host)) throw new HttpError(400, 'forbidden_host', 'Hôte local ou privé interdit.')
    return { address: host, family: literal }
  }

  if (host === 'localhost' || /\.(local|internal)$/.test(host)) {
    throw new HttpError(400, 'forbidden_host', 'Hôte local ou privé interdit.')
  }

  let addrs: Array<{ address: string; family: number }>
  try {
    addrs = await lookup(host, { all: true })
  } catch {
    throw new HttpError(502, 'upstream_unreachable', `Résolution DNS impossible pour « ${host} ».`)
  }
  const first = addrs[0]
  if (!first || addrs.some((a) => isPrivateIp(a.address))) {
    throw new HttpError(400, 'forbidden_host', 'Hôte local ou privé interdit.')
  }
  return first
}

/** Relaye la requête et rend la réponse du tiers (corps borné, lu en flux). */
export async function relayProxyRequest(
  method: string,
  target: URL,
  headers: Record<string, string>,
  body: string | null,
): Promise<ProxyResult> {
  const pinned = await resolvePinnedAddress(target)
  const started = Date.now()

  return await new Promise<ProxyResult>((resolve, reject) => {
    const doRequest = target.protocol === 'https:' ? httpsRequest : httpRequest
    const outHeaders: Record<string, string> = { ...headers }
    if (!Object.keys(outHeaders).some((h) => h.toLowerCase() === 'user-agent')) {
      outHeaders['User-Agent'] = DEFAULT_USER_AGENT
    }
    if (body != null) outHeaders['Content-Length'] = String(Buffer.byteLength(body))

    const req = doRequest(
      target,
      {
        method,
        headers: outHeaders,
        timeout: PROXY_TIMEOUT_MS,
        // Connexion épinglée : on rend l'adresse DÉJÀ validée, jamais une re-résolution.
        lookup: (_host, options, cb) => {
          if (options.all) cb(null, [pinned])
          else cb(null, pinned.address, pinned.family)
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let received = 0
        let truncated = false
        let settled = false

        const settle = (): void => {
          if (settled) return
          settled = true
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
            ),
            body: Buffer.concat(chunks).toString('utf8'),
            truncated,
            durationMs: Date.now() - started,
          })
        }

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (received > PROXY_MAX_BODY_BYTES) {
            // Un tiers qui répond 500 Mo ne doit pas gonfler le process : on coupe.
            truncated = true
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('end', settle)
        res.on('close', settle)
      },
    )

    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (err) => {
      reject(
        new HttpError(
          502,
          'upstream_unreachable',
          err.message === 'timeout' ? `Pas de réponse en ${PROXY_TIMEOUT_MS / 1000} s.` : 'Service injoignable.',
        ),
      )
    })
    if (body != null) req.write(body)
    req.end()
  })
}

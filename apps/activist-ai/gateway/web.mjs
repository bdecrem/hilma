// The way out for web search and downloads: two narrow routes a sealed workspace may call through
// its door, and nothing else. The VM still has no network; the gateway makes the request.
//
//   POST /web/search   {"q": "<words>", "count": 1..20}  ->  {"results": [{title, url, snippet}]}
//   POST /web/fetch    {"url": "https://..."}            ->  the document's bytes, its type, and
//                                                            x-ola-final-url / x-ola-fetched-at
//
// Who may use them is decided by the front desk, from the person's answer to the approval in the
// page ("Allow once" / "Always in this project"), and written to GATEWAY_WEB_FILE (mode 600, one
// JSON object, by rename; reloaded when it changes and again before any refusal):
//   { "ws-<id>": { "always": true } }                              the project said always
//   { "ws-<id>": { "once": [{ "id", "kind": "search"|"fetch",       one call, for this exact query or
//                              "h": sha256 of the item, "exp" }] } } address, before exp (ms)
// A "once" is spent the first time it is used (kept in the usage database, so a restart does not
// give it back). Anything not granted: 403 with a plain sentence the agent can relay.
//
// Search goes to one provider (GATEWAY_SEARCH_PROVIDER: brave, or mock for tests and made-up runs),
// with the key in SEARCH_API_KEY (never in a workspace). The reply is rebuilt from title, url and
// snippet only.
//
// Fetch is made boring on purpose: https only, port 443 only, GET only, no cookies or credentials
// ever sent, no user name or password in the address. The host is resolved HERE, every address it
// resolves to is checked (private, loopback, link-local, CGNAT 100.64/10 where the tailnet lives,
// multicast, reserved, documentation, NAT64/6to4 forms of those, and the machine's own
// addresses), and the connection is made to the address that was checked, never resolved again
// (DNS rebinding). Redirects are followed by hand, at most 5, each hop checked the same way. No
// compression is accepted (Accept-Encoding: identity, and a reply that is encoded anyway is
// refused), so there is no decompression bomb. Size caps by type, a type allowlist, a connect,
// first-byte and total time limit. Per caller: a rate per minute, a weekly count in the gateway's
// usage table (model "web-search" / "web-fetch"), at most 2 at once.
//
// What is written down: one line per request with the caller, route, status, a fixed reason, the
// number of results or bytes, and for a fetch the HOST of the final address (a name the gateway
// checked, never a path, query or the search words). That is the standing rule: no content.
import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { readFileSync, statSync, watch } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'

export const WEB_SETTINGS = [
  'GATEWAY_WEB_FILE', 'GATEWAY_SEARCH_PROVIDER', 'GATEWAY_SEARCH_UPSTREAM', 'GATEWAY_WEB_WEEKLY', 'GATEWAY_WEB_PER_MINUTE',
  'GATEWAY_FETCH_MAX_BYTES', 'GATEWAY_FETCH_MAX_PAGE_BYTES', 'GATEWAY_FETCH_TIMEOUT_MS', 'GATEWAY_FETCH_TEST_HOSTS', 'GATEWAY_FETCH_TEST_CA', 'GATEWAY_FETCH_REFUSE_NETS',
  'GATEWAY_SCHOLAR_CONTACT', 'GATEWAY_SCHOLAR_UPSTREAMS',
]
// Scholarly lookup: fixed public indexes, never an address the caller chooses.
const SCHOLAR = { crossref: 'https://api.crossref.org', unpaywall: 'https://api.unpaywall.org', openalex: 'https://api.openalex.org' }
const PROVIDERS = { brave: { name: 'Brave Search', url: 'https://api.search.brave.com/res/v1/web/search' }, mock: { name: 'a made-up search (tests)', url: null } }

// What a download may be, by type, and how large. Pages and plain text are small; documents and
// data files may be large.
const BIG = ['application/pdf', 'text/csv', 'application/json', 'application/xml', 'text/xml', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/rtf']
const PAGE = ['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown', 'application/rss+xml', 'application/atom+xml']
const OFFICE = /^application\/vnd\.(openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|oasis\.opendocument\.(text|spreadsheet|presentation))$/
export function allowedType(ct) {
  const mime = String(ct ?? '').split(';')[0].trim().toLowerCase()
  if (PAGE.includes(mime)) return { mime, kind: 'page' }
  if (BIG.includes(mime) || OFFICE.test(mime)) return { mime, kind: 'big' }
  return null
}

// ---------------------------------------------------------------- which addresses are refused
const blocked = new net.BlockList()
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(a, p, 'ipv4')
for (const [a, p] of [['::', 128], ['::1', 128], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2001:10::', 28], ['2001:20::', 28], ['3fff::', 20], ['5f00::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]) blocked.addSubnet(a, p, 'ipv6')
// Only global unicast (2000::/3) is ever reached over IPv6; the forms that carry an IPv4 address
// are judged by it first. Everything else (SIIT ::ffff:0:0/96, local-use NAT64 64:ff9b:1::/48,
// whatever is assigned next) is refused (review 4, L1).
const global6 = new net.BlockList()
global6.addSubnet('2000::', 3, 'ipv6')
const own = () => new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map((i) => i.address.toLowerCase()))
// The networks this machine sits on, not only its own addresses (review 4, M3): at CASBS the
// mini's interface is 171.66.240.175/24, public addresses whose neighbors (printers, other
// machines, anything that trusts "inside the building") the fetch route could otherwise reach.
export function ownNetworks() {
  const list = new net.BlockList()
  for (const i of Object.values(os.networkInterfaces()).flat().filter(Boolean)) {
    const [addr, bits] = String(i.cidr ?? '').split('/')
    if (!addr || !bits) continue
    try {
      list.addSubnet(addr, Number(bits), i.family === 'IPv6' || i.family === 6 ? 'ipv6' : 'ipv4')
    } catch {}
  }
  return list
}

// Review 4's open item (review 5): the fetch route still reached the rest of the campus the machine
// sits in, and anything that trusts a campus address. GATEWAY_FETCH_REFUSE_NETS lists more networks
// to refuse, as CIDRs separated by commas; by default Stanford's 171.64.0.0/14, where this machine
// is (set it to an empty value where the machine is somewhere else).
export const DEFAULT_REFUSE_NETS = '171.64.0.0/14'
export function refuseNets(spec, bad = (m) => { throw new Error(m) }) {
  const list = new net.BlockList()
  for (const [i, part] of String(spec ?? '').split(',').map((x) => x.trim()).filter(Boolean).entries()) {
    const [addr, bits] = part.split('/')
    const fam = net.isIP(addr)
    const n = Number(bits)
    if (!fam || !/^\d{1,3}$/.test(bits ?? '') || n > (fam === 4 ? 32 : 128)) {
      bad(`GATEWAY_FETCH_REFUSE_NETS entry ${i + 1}: a network like 171.64.0.0/14`)
      continue
    }
    list.addSubnet(addr, n, fam === 4 ? 'ipv4' : 'ipv6')
  }
  return list
}
/** The IPv4 address an IPv6 address carries (mapped, compatible, NAT64, 6to4), or null. */
export function embeddedV4(ip) {
  if (net.isIP(ip) !== 6) return null
  const g = v6groups(ip.toLowerCase())
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return v4of(g[6], g[7])
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4of(g[6], g[7])
  if (g[0] === 0x2002) return v4of(g[1], g[2])
  return null
}
/** Whether an address, or the IPv4 address inside it, is in one of these networks. */
export function inNets(ip, ...lists) {
  const v4 = embeddedV4(ip)
  return lists.some((l) => l.check(ip, net.isIP(ip) === 6 ? 'ipv6' : 'ipv4') || (v4 !== null && l.check(v4, 'ipv4')))
}

/** Expands an IPv6 address to 8 groups of 16 bits. */
function v6groups(ip) {
  let [head, tail] = ip.split('::')
  const conv = (s) => (s ? s.split(':') : []).flatMap((g) => (g.includes('.') ? (() => { const b = g.split('.').map(Number); return [((b[0] << 8) | b[1]).toString(16), ((b[2] << 8) | b[3]).toString(16)] })() : [g]))
  const h = conv(head)
  const t = tail === undefined ? [] : conv(tail)
  const fill = tail === undefined ? [] : Array(8 - h.length - t.length).fill('0')
  return [...h, ...fill, ...t].map((g) => parseInt(g || '0', 16))
}
const v4of = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

/** Why an address must not be reached, or null. */
export function refusedAddress(ip, ownSet = own()) {
  const fam = net.isIP(ip)
  if (!fam) return 'not an address'
  if (ownSet.has(ip.toLowerCase())) return "this machine's own address"
  if (fam === 4) return blocked.check(ip, 'ipv4') ? 'a private or reserved address' : null
  const g = v6groups(ip.toLowerCase())
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::/96): judge the IPv4 inside.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return refusedAddress(v4of(g[6], g[7]), ownSet) && 'a private or reserved address'
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return refusedAddress(v4of(g[6], g[7]), ownSet) && 'a private or reserved address'
  if (g[0] === 0x2002) return refusedAddress(v4of(g[1], g[2]), ownSet) && 'a private or reserved address' // 6to4
  return blocked.check(ip, 'ipv6') || !global6.check(ip, 'ipv6') ? 'a private or reserved address' : null
}

// Names that are never on the public internet, whatever they resolve to today.
const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa|ts\.net|onion|invalid|example)$/i

export function webConfig(env, bad) {
  const num = (k, dflt, min, max) => {
    const raw = env[k]
    if (raw === undefined || raw === '') return dflt
    if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) bad(`${k} must be a whole number from ${min} to ${max}`)
    return Number(raw)
  }
  const provider = env.GATEWAY_SEARCH_PROVIDER || null
  if (provider && !(provider in PROVIDERS)) bad(`GATEWAY_SEARCH_PROVIDER must be one of ${Object.keys(PROVIDERS).join(', ')}`)
  const key = env.SEARCH_API_KEY || null
  if (key !== null && !/^[\x21-\x7e]{16,300}$/.test(key)) bad('SEARCH_API_KEY does not look like a key')
  if (provider === 'brave' && !key) bad('GATEWAY_SEARCH_PROVIDER=brave needs SEARCH_API_KEY')
  let upstream = provider && PROVIDERS[provider].url ? new URL(PROVIDERS[provider].url) : null
  if (env.GATEWAY_SEARCH_UPSTREAM) {
    try {
      upstream = new URL(env.GATEWAY_SEARCH_UPSTREAM)
      if (!(upstream.protocol === 'https:' || (upstream.protocol === 'http:' && upstream.hostname === '127.0.0.1'))) bad('GATEWAY_SEARCH_UPSTREAM must be https (plain http only to 127.0.0.1, for tests)')
    } catch {
      bad('GATEWAY_SEARCH_UPSTREAM is not a URL')
    }
  }
  // Tests only: names under .test (reserved, never in real DNS) resolved from this list, so a test
  // can stand up an https server on this machine and play rebinding and redirects. An entry is
  // name=answer[|answer...][~second lookup's answers]; an answer is ip[:port], and a trailing "!"
  // lets 127.0.0.1 through for that name only (the test server). Nothing else changes.
  const testHosts = new Map()
  if (env.GATEWAY_FETCH_TEST_HOSTS) {
    env.GATEWAY_FETCH_TEST_HOSTS.split(',').forEach((entry, i) => {
      const at = entry.indexOf('=')
      const name = entry.slice(0, at).toLowerCase()
      if (!/^[a-z0-9-]+\.test$/.test(name)) return bad(`GATEWAY_FETCH_TEST_HOSTS entry ${i + 1}: only names under .test`)
      const rounds = entry.slice(at + 1).split('~').map((r) => r.split('|').map((a) => {
        const loop = a.endsWith('!')
        const m = /^([0-9a-f.:]+?)(?::(\d+))?!?$/i.exec(a)
        return m && net.isIP(m[1]) ? { address: m[1], family: net.isIP(m[1]), port: m[2] ? Number(m[2]) : 443, loop } : (bad(`GATEWAY_FETCH_TEST_HOSTS entry ${i + 1}: an answer is ip[:port][!]`), null)
      }))
      testHosts.set(name, { rounds, n: 0 })
    })
  }
  let testCa = null
  if (env.GATEWAY_FETCH_TEST_CA) {
    try {
      testCa = readFileSync(env.GATEWAY_FETCH_TEST_CA, 'utf8')
    } catch {
      bad('GATEWAY_FETCH_TEST_CA cannot be read')
    }
  }
  // GATEWAY_SCHOLAR_CONTACT: the address these services ask callers to give (Crossref's polite pool,
  // Unpaywall's email). Ola's own, never a person's. Without it, lookups say they are not set up.
  const contact = env.GATEWAY_SCHOLAR_CONTACT || null
  if (contact && !/^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/.test(contact)) bad('GATEWAY_SCHOLAR_CONTACT is an email address (Ola’s own)')
  const scholar = { ...SCHOLAR }
  if (env.GATEWAY_SCHOLAR_UPSTREAMS) {
    // Tests only: crossref=http://127.0.0.1:port,unpaywall=...,openalex=...
    for (const [i, part] of env.GATEWAY_SCHOLAR_UPSTREAMS.split(',').entries()) {
      const at = part.indexOf('=')
      const name = part.slice(0, at)
      let u = null
      try {
        u = new URL(part.slice(at + 1))
      } catch {}
      if (!(name in SCHOLAR) || !u || !(u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1'))) bad(`GATEWAY_SCHOLAR_UPSTREAMS entry ${i + 1}: crossref, unpaywall or openalex = an https address (http only to 127.0.0.1, for tests)`)
      else scholar[name] = u.href.replace(/\/+$/, '')
    }
  }
  return {
    contact,
    scholar,
    file: env.GATEWAY_WEB_FILE || null,
    provider,
    providerName: provider ? PROVIDERS[provider].name : null,
    key,
    upstream,
    weekly: num('GATEWAY_WEB_WEEKLY', 2000, 1, 1_000_000),
    perMinute: num('GATEWAY_WEB_PER_MINUTE', 30, 1, 10_000),
    maxBig: num('GATEWAY_FETCH_MAX_BYTES', 50 * 1024 * 1024, 1024, 512 * 1024 * 1024),
    maxPage: num('GATEWAY_FETCH_MAX_PAGE_BYTES', 5 * 1024 * 1024, 1024, 64 * 1024 * 1024),
    totalMs: num('GATEWAY_FETCH_TIMEOUT_MS', 120_000, 100, 600_000),
    testHosts,
    testCa,
    refuse: refuseNets(env.GATEWAY_FETCH_REFUSE_NETS ?? DEFAULT_REFUSE_NETS, bad),
  }
}

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
/** The one form of a search that a "once" grant is bound to (the front desk computes the same). */
export const searchItem = (q) => String(q).replace(/\s+/g, ' ').trim()
/** The one form of an address that a "once" grant is bound to. */
export const fetchItem = (u) => new URL(String(u).trim()).href
export const itemHash = (kind, item) => sha(`${kind}\0${item}`)

export function makeWeb({ cfg, db, readBody, send, fail }) {
  // ------------------------------------------------------------ grants, from the front desk's file
  let grants = new Map()
  let seen = ''
  // Host callers (not workspaces: Bart's own opencode, caller `bart`) have no project for the front
  // desk to ask in; their owner answers in his own apps. Their standing grant is in a file of its
  // own beside the front desk's (the front desk rewrites its file from its database and keeps
  // nothing else), `<GATEWAY_WEB_FILE>-hosts`, written by bart/ola-bart.sh: mode 600,
  // { "<caller>": { "always": true } }, names that are not `ws-` (a workspace never gets one here).
  let hostGrants = new Map()
  let hostSeen = ''
  const loadHostGrants = () => {
    if (!cfg.file) return
    const f = `${cfg.file}-hosts`
    let st
    try {
      st = statSync(f)
    } catch {
      if (hostSeen !== 'missing' && hostGrants.size) process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'web_host_grants', ok: true, callers: 0 }) + '\n')
      hostSeen = 'missing'
      hostGrants = new Map()
      return
    }
    const stamp = `${st.ino}:${st.mtimeMs}:${st.size}`
    if (stamp === hostSeen) return
    hostSeen = stamp
    if ((st.mode & 0o077) !== 0) return console.error('GATEWAY_WEB_FILE-hosts must be mode 600: the host grants in force stay')
    try {
      const raw = JSON.parse(readFileSync(f, 'utf8'))
      const next = new Map()
      for (const [name, g] of Object.entries(raw ?? {})) {
        if (name.startsWith('ws-') || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name) || g?.always !== true) continue
        next.set(name, { always: true, once: [] })
      }
      hostGrants = next
      process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'web_host_grants', ok: true, callers: next.size }) + '\n')
    } catch {
      console.error('GATEWAY_WEB_FILE-hosts could not be read: the host grants in force stay')
    }
  }
  const loadGrants = () => {
    loadHostGrants()
    if (!cfg.file) return
    try {
      const st = statSync(cfg.file)
      const stamp = `${st.ino}:${st.mtimeMs}:${st.size}`
      if (stamp === seen) return
      seen = stamp
      if ((st.mode & 0o077) !== 0) return console.error('GATEWAY_WEB_FILE must be mode 600: the grants in force stay')
      const raw = JSON.parse(readFileSync(cfg.file, 'utf8'))
      const next = new Map()
      for (const [name, g] of Object.entries(raw ?? {})) {
        if (!/^ws-[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name) || !g || typeof g !== 'object') continue
        const once = (Array.isArray(g.once) ? g.once : []).filter((o) => o && /^[0-9a-f]{16,64}$/.test(o.id) && ['search', 'fetch', 'lookup'].includes(o.kind) && /^[0-9a-f]{64}$/.test(o.h) && Number.isSafeInteger(o.exp)).slice(0, 200)
        next.set(name, { always: g.always === true, once })
      }
      grants = next
      process.stdout.write(JSON.stringify({ t: new Date().toISOString(), event: 'web_grants', ok: true, callers: grants.size, always: [...grants.values()].filter((g) => g.always).length }) + '\n')
    } catch {
      console.error('GATEWAY_WEB_FILE could not be read: the grants in force stay')
    }
  }
  loadGrants()
  const timer = setInterval(loadGrants, 1000)
  timer.unref()
  try {
    if (cfg.file) watch(cfg.file, () => loadGrants()).unref?.()
  } catch {}

  db.exec(`CREATE TABLE IF NOT EXISTS web_once_used (id TEXT PRIMARY KEY, at INTEGER NOT NULL) STRICT;`)
  const spent = db.prepare('INSERT OR IGNORE INTO web_once_used (id, at) VALUES (?, ?)')
  const prune = db.prepare('DELETE FROM web_once_used WHERE at < ?')
  prune.run(Date.now() - 30 * 24 * 3600_000)
  const countWeek = db.prepare(`SELECT coalesce(sum(requests), 0) AS n FROM usage WHERE week = ? AND caller = ? AND model IN ('web-search', 'web-fetch', 'web-lookup')`)
  const addUse = db.prepare(`INSERT INTO usage (week, caller, model, requests, tokens_in, tokens_out) VALUES (?, ?, ?, 1, 0, 0)
    ON CONFLICT (week, caller, model) DO UPDATE SET requests = requests + 1`)
  const weekKey = () => {
    const d = new Date()
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10)
  }
  const weekOf = (caller) => ({ used: countWeek.get(weekKey(), caller).n, limit: cfg.weekly })

  /** May `who` make this call? Spends a matching "once" grant. Reloads the file once on a miss. */
  function grantFor(who, kind, item) {
    const h = itemHash(kind, item)
    for (let attempt = 0; attempt < 2; attempt++) {
      const g = grants.get(who) ?? hostGrants.get(who)
      if (g?.always) return 'always'
      const now = Date.now()
      for (const o of g?.once ?? []) {
        if (o.kind !== kind || o.h !== h || o.exp < now) continue
        if (spent.run(o.id, now).changes === 1) return 'once'
      }
      seen = '' // the front desk may have written the file a moment ago
      hostSeen = ''
      loadGrants()
    }
    return null
  }

  const minute = new Map() // caller -> times of recent calls
  const inflight = new Map()
  let allInflight = 0

  async function handle(req, res, rec, who, signal) {
    const no = (status, why, message, type = 'invalid_request_error', headers) => {
      rec.status = status
      rec.why = why
      fail(res, status, message, type, headers)
    }
    if (req.method !== 'POST') return no(404, 'not found', 'not found')
    const kind = rec.route
    let raw
    try {
      raw = await readBody(req, 8 * 1024)
    } catch (e) {
      return no(e.code === 'too_large' ? 413 : 400, 'the body was not read', 'the request could not be read')
    }
    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      return no(400, 'the body is not JSON', 'the request body is not JSON')
    }
    let item
    if (kind === 'search') {
      if (typeof body?.q !== 'string' || !searchItem(body.q) || body.q.length > 400) return no(400, 'no search words', 'give the search as "q", 1 to 400 characters')
      item = searchItem(body.q)
      if (!cfg.provider) return no(503, 'no search provider', 'Web search is not set up on this machine yet.', 'api_error')
    } else if (kind === 'lookup') {
      if (typeof body?.q !== 'string' || !searchItem(body.q) || body.q.length > 1000) return no(400, 'no citation', 'give the citation or DOI as "q", 1 to 1,000 characters')
      item = searchItem(body.q)
      if (!cfg.contact) return no(503, 'scholarly lookup not set up', 'Looking up papers is not set up on this machine yet.', 'api_error')
    } else {
      try {
        if (typeof body?.url !== 'string' || body.url.length > 2048) throw new Error()
        item = fetchItem(body.url)
      } catch {
        return no(400, 'not an address', 'give the address as "url", a full https:// address')
      }
    }
    // The person's yes, enforced here (the page and opencode only carry the question).
    const grant = grantFor(who, kind, item)
    if (!grant && kind === 'lookup') return no(403, 'not approved for this project', 'This lookup was not approved. Ola asks the person first: run ola-lookup on its own, in a command by itself, so they can answer.', 'web_not_approved')
    if (!grant) return no(403, 'not approved for this project', kind === 'search' ? 'This search was not approved. Ola asks the person first: run ola-search on its own, in a command by itself, so they can answer.' : 'This download was not approved. Ola asks the person first: run ola-fetch on its own, in a command by itself, so they can answer.', 'web_not_approved')
    rec.grant = grant
    // How much: per minute, per week (shared with the usage table), at most 2 at once per caller.
    const now = Date.now()
    const times = (minute.get(who) ?? []).filter((t) => t > now - 60_000)
    minute.set(who, times)
    if (times.length >= cfg.perMinute) return no(429, 'the per-minute web limit', `Ola has made ${cfg.perMinute} web requests in the last minute for this project; wait a minute.`, 'rate_limit_error', { 'Retry-After': '60' })
    const w = weekOf(who)
    if (w.used >= w.limit) return no(429, 'the weekly web limit', `This project has made its ${w.limit} web searches and downloads for the week; the count starts again on Monday.`, 'insufficient_quota')
    if ((inflight.get(who) ?? 0) >= 2 || allInflight >= 8) return no(429, 'too many web requests at once', 'Ola is already making two web requests for this project; try again when one finishes.', 'rate_limit_error', { 'Retry-After': '5' })
    times.push(now)
    inflight.set(who, (inflight.get(who) ?? 0) + 1)
    allInflight++
    addUse.run(weekKey(), who, `web-${kind}`)
    try {
      if (kind === 'lookup') return await lookup(item, res, rec, no, signal)
      if (kind === 'search') return await search(item, Math.min(20, Math.max(1, Number.isSafeInteger(body.count) ? body.count : 8)), res, rec, no, signal)
      return await fetchDoc(item, res, rec, no, signal)
    } finally {
      inflight.set(who, inflight.get(who) - 1)
      allInflight--
    }
  }

  // ------------------------------------------------------------ search
  const clean = (s, max) => String(s ?? '').replace(/<[^>]{0,200}>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max)
  async function search(q, count, res, rec, no, signal) {
    let results
    if (cfg.provider === 'mock' && !cfg.upstream) results = mockResults(q, count)
    else {
      const u = new URL(cfg.upstream)
      u.searchParams.set('q', q)
      u.searchParams.set('count', String(count))
      u.searchParams.set('text_decorations', 'false')
      u.searchParams.set('safesearch', 'moderate')
      let r
      try {
        r = await getJson(u, { 'X-Subscription-Token': cfg.key ?? '', Accept: 'application/json', 'Accept-Encoding': 'identity' }, signal)
      } catch {
        return no(502, 'the search service could not be reached', 'The search service could not be reached just now. Try again in a minute.', 'api_error')
      }
      if (r.status === 401 || r.status === 403) return no(502, `the search service answered ${r.status}`, 'The search service refused this machine’s key. Tell Bart.', 'api_error')
      if (r.status === 429) return no(429, 'the search service is rate limiting', 'The search service is busy; try again in a minute.', 'rate_limit_error', { 'Retry-After': '30' })
      if (r.status !== 200 || !r.json) return no(502, `the search service answered ${r.status}`, 'The search service did not answer properly. Try again in a minute.', 'api_error')
      const list = Array.isArray(r.json?.web?.results) ? r.json.web.results : Array.isArray(r.json?.results) ? r.json.results : []
      results = list.slice(0, count).map((x) => ({ title: clean(x?.title, 300), url: typeof x?.url === 'string' && /^https?:\/\//.test(x.url) ? x.url.slice(0, 2048) : null, snippet: clean(x?.description ?? x?.snippet, 600), age: typeof x?.age === 'string' ? clean(x.age, 40) : null })).filter((x) => x.url)
    }
    rec.status = 200
    rec.results = results.length
    send(res, 200, { object: 'search', provider: cfg.providerName, results })
  }
  // ------------------------------------------------------------ scholarly lookup
  // One citation or DOI in; the best matches out (title, authors, year, DOI, where published) and,
  // for the best one, where a free copy can be had. Fixed public indexes only: Crossref for the
  // record (its "polite pool": the contact goes in `mailto`), Unpaywall for free copies (its
  // `email`), OpenAlex when Crossref has no record of a DOI. Two requests a lookup as a rule, three at
  // most. Replies are rebuilt from the fields below; nothing is followed, nothing is downloaded.
  const DOI_IN = /\b(10\.\d{4,9}\/[^\s"<>]+)/i
  const words = (s) => new Set(String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  const https2048 = (u) => (typeof u === 'string' && /^https?:\/\//.test(u) && u.length <= 2048 ? u : null)
  const doiPath = (doi) => doi.split('/').map(encodeURIComponent).join('/')
  function fromCrossref(m) {
    const title = clean(Array.isArray(m?.title) ? m.title[0] : m?.title, 500)
    const authors = (Array.isArray(m?.author) ? m.author : []).map((a) => clean([a?.given, a?.family].filter(Boolean).join(' ') || a?.name, 120)).filter(Boolean)
    const year = [m?.issued, m?.published, m?.['published-print'], m?.['published-online']].map((d) => d?.['date-parts']?.[0]?.[0]).find((y) => Number.isSafeInteger(y)) ?? null
    const doi = typeof m?.DOI === 'string' && /^10\.\d{4,9}\/\S{1,200}$/.test(m.DOI) ? m.DOI : null
    return { title, authors: authors.slice(0, 10), more_authors: Math.max(0, authors.length - 10), year, doi, venue: clean(Array.isArray(m?.['container-title']) ? m['container-title'][0] : '', 300) || null, type: clean(m?.type, 40) || null, open_copy: null }
  }
  function fromOpenAlex(w) {
    const authors = (Array.isArray(w?.authorships) ? w.authorships : []).map((a) => clean(a?.author?.display_name, 120)).filter(Boolean)
    const doi = typeof w?.doi === 'string' ? w.doi.replace(/^https:\/\/doi\.org\//i, '') : null
    const loc = w?.best_oa_location
    return {
      title: clean(w?.display_name ?? w?.title, 500),
      authors: authors.slice(0, 10),
      more_authors: Math.max(0, authors.length - 10),
      year: Number.isSafeInteger(w?.publication_year) ? w.publication_year : null,
      doi: doi && /^10\.\d{4,9}\/\S{1,200}$/.test(doi) ? doi : null,
      venue: clean(w?.primary_location?.source?.display_name, 300) || null,
      type: clean(w?.type, 40) || null,
      open_copy: loc && (https2048(loc.pdf_url) || https2048(loc.landing_page_url)) ? { url: https2048(loc.pdf_url) || https2048(loc.landing_page_url), pdf: !!https2048(loc.pdf_url), landing_page: https2048(loc.landing_page_url), version: clean(loc.version, 40) || null, license: clean(loc.license, 40) || null, host: clean(loc.source?.display_name, 120) || null, from: 'OpenAlex' } : null,
    }
  }
  async function lookup(q, res, rec, no, signal) {
    const headers = { Accept: 'application/json', 'Accept-Encoding': 'identity', 'User-Agent': `Ola/1 (a research assistant looking up one reference; mailto:${cfg.contact})` }
    const get = async (base, path, params) => {
      const u = new URL(base + path)
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
      try {
        return await getJson(u, headers, signal)
      } catch {
        return { status: 0, json: null }
      }
    }
    const sources = []
    let results = []
    let doi = DOI_IN.exec(q)?.[1]?.replace(/[.,;:)\]}>]+$/, '') ?? null
    if (doi && (doi.length > 200 || doi.split('/').some((p) => p === '.' || p === '..' || p === ''))) doi = null
    rec.lookup = doi ? 'doi' : 'citation'
    if (doi) {
      const r = await get(cfg.scholar.crossref, `/works/${doiPath(doi)}`, { mailto: cfg.contact })
      if (r.status === 200 && r.json?.message) results = [{ ...fromCrossref(r.json.message), match: 1 }], sources.push('Crossref')
      else if (r.status === 404 || r.status === 200) {
        const o = await get(cfg.scholar.openalex, `/works/doi:${doiPath(doi)}`, { mailto: cfg.contact })
        if (o.status === 200 && o.json) results = [{ ...fromOpenAlex(o.json), match: 1 }], sources.push('OpenAlex')
        else if (o.status !== 404) return no(502, 'the scholarly indexes did not answer', 'The catalogs of research papers did not answer just now. Try again in a minute.', 'web_upstream')
      } else return no(r.status === 429 ? 429 : 502, `crossref answered ${r.status}`, r.status === 429 ? 'Crossref is busy; try again in a minute.' : 'Crossref did not answer just now. Try again in a minute.', 'web_upstream')
    } else {
      const r = await get(cfg.scholar.crossref, '/works', { 'query.bibliographic': q, rows: '5', select: 'DOI,title,author,issued,published,container-title,type', mailto: cfg.contact })
      if (r.status !== 200 || !Array.isArray(r.json?.message?.items)) return no(r.status === 429 ? 429 : 502, `crossref answered ${r.status}`, r.status === 429 ? 'Crossref is busy; try again in a minute.' : 'Crossref did not answer just now. Try again in a minute.', 'web_upstream')
      sources.push('Crossref')
      // How much of each title appears in the citation (0 to 1): the agent's guide to how sure.
      const qw = words(q)
      results = r.json.message.items.slice(0, 5).map(fromCrossref).filter((x) => x.title).map((x) => {
        const tw = [...words(x.title)]
        return { ...x, match: tw.length ? Math.round((tw.filter((w) => qw.has(w)).length / tw.length) * 100) / 100 : 0 }
      }).sort((a, b) => b.match - a.match).slice(0, 3)
    }
    // Where a free copy of the best match can be had.
    const best = results[0]
    if (best?.doi) {
      const u = await get(cfg.scholar.unpaywall, `/v2/${doiPath(best.doi)}`, { email: cfg.contact })
      const loc = u.status === 200 ? u.json?.best_oa_location : null
      if (u.status === 200) sources.push('Unpaywall')
      if (loc && (https2048(loc.url_for_pdf) || https2048(loc.url))) {
        best.open_copy = { url: https2048(loc.url_for_pdf) || https2048(loc.url), pdf: !!https2048(loc.url_for_pdf), landing_page: https2048(loc.url_for_landing_page), version: clean(loc.version, 40) || null, license: clean(loc.license, 40) || null, host: clean(loc.host_type, 40) || null, from: 'Unpaywall' }
      } else if (u.status === 200 && best.open_copy === null) best.open_copy = null
      best.is_open = u.status === 200 ? u.json?.is_oa === true || !!best.open_copy : best.open_copy ? true : null
    }
    rec.status = 200
    rec.results = results.length
    send(res, 200, { object: 'lookup', kind: doi ? 'doi' : 'citation', results, sources })
  }

  function getJson(u, headers, signal) {
    return new Promise((resolve, reject) => {
      const lib = u.protocol === 'https:' ? https : http
      const r = lib.request(u, { method: 'GET', headers, signal, timeout: 15_000 }, (up) => {
        const chunks = []
        let size = 0
        up.on('data', (c) => {
          size += c.length
          if (size > 4 * 1024 * 1024) return up.destroy(), reject(new Error('too large'))
          chunks.push(c)
        })
        up.on('end', () => {
          let json = null
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {}
          resolve({ status: up.statusCode, json })
        })
        up.on('error', reject)
      })
      r.on('timeout', () => r.destroy(new Error('timeout')))
      r.on('error', reject)
      r.end()
    })
  }

  // ------------------------------------------------------------ fetch
  async function resolveChecked(host) {
    const bare = host.replace(/^\[|\]$/g, '')
    if (net.isIP(bare)) {
      const why = refusedAddress(bare) ?? (inNets(bare, ownNetworks()) ? "this machine's own network" : inNets(bare, cfg.refuse) ? 'a network this machine refuses' : null)
      return why ? { why } : { addrs: [{ address: bare, family: net.isIP(bare), port: 443 }], servername: undefined }
    }
    if (LOCAL_NAMES.test(host) || !host.includes('.')) return { why: 'a name that is not on the public internet' }
    const test = cfg.testHosts.get(host)
    let addrs
    if (test) {
      addrs = test.rounds[Math.min(test.n, test.rounds.length - 1)]
      test.n++
    } else if (host.endsWith('.test')) return { why: 'a name that is not on the public internet' }
    else {
      try {
        addrs = (await dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => ({ ...a, port: 443 }))
      } catch {
        return { why: 'a name that does not resolve', status: 502 }
      }
    }
    if (!addrs.length) return { why: 'a name that does not resolve', status: 502 }
    // EVERY address must be public: a name that also answers a private one is refused whole.
    const nets = ownNetworks()
    for (const a of addrs) {
      if (a.loop && a.address === '127.0.0.1') continue
      const why = refusedAddress(a.address) ?? (inNets(a.address, nets) ? "this machine's own network" : inNets(a.address, cfg.refuse) ? 'a network this machine refuses' : null)
      if (why) return { why }
    }
    return { addrs, servername: host, test: !!test }
  }

  async function fetchDoc(first, res, rec, no, signal) {
    const deadline = Date.now() + cfg.totalMs
    let url = first
    for (let hop = 0; ; hop++) {
      let u
      try {
        u = new URL(url)
      } catch {
        return no(400, 'not an address', 'That is not a web address.')
      }
      if (u.protocol !== 'https:') return no(400, hop ? 'a redirect to something not https' : 'not https', hop ? 'The site sent Ola to an address that is not https, so Ola stopped.' : 'Ola downloads only https:// addresses.')
      if (u.username || u.password) return no(400, 'an address with a user name', 'Ola does not download addresses that carry a user name or password.')
      if (u.port && u.port !== '443') return no(400, 'a port other than 443', 'Ola downloads only from the standard https port.')
      rec.host = u.hostname.slice(0, 253)
      const where = await resolveChecked(u.hostname.toLowerCase())
      if (where.why) return no(where.status ?? 403, `refused: ${where.why}`, where.status ? 'That site’s name could not be found.' : 'Ola does not download from that address: it is not on the public internet.', 'web_refused')
      let r
      try {
        r = await getOnce(u, where, signal, deadline)
      } catch (e) {
        const why = e.message === 'timeout' ? 'the site took too long' : e.message === 'aborted' ? 'the caller went away' : 'the site could not be reached'
        return no(e.message === 'aborted' ? 499 : 504, why, e.message === 'timeout' ? 'The site took too long to answer.' : 'The site could not be reached.', 'web_upstream')
      }
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        r.res.destroy()
        if (hop >= 5) return no(502, 'more than 5 redirects', 'The site sent Ola from address to address more than 5 times, so Ola stopped.', 'web_upstream')
        const loc = r.res.headers.location
        if (typeof loc !== 'string' || loc.length > 4096) return no(502, 'a redirect with no address', 'The site sent a redirect with no address.', 'web_upstream')
        try {
          url = new URL(loc, u).href
        } catch {
          return no(502, 'a redirect with a bad address', 'The site sent a redirect Ola could not read.', 'web_upstream')
        }
        continue
      }
      if (r.status !== 200) {
        r.res.destroy()
        return no(502, `the site answered ${r.status}`, `The site answered ${r.status}${r.status === 404 ? ' (not found)' : r.status === 403 ? ' (not allowed)' : ''}.`, 'web_upstream')
      }
      const enc = String(r.res.headers['content-encoding'] ?? 'identity').toLowerCase()
      if (enc !== 'identity' && enc !== '') return r.res.destroy(), no(502, 'a compressed reply', 'The site sent the document compressed in a way Ola does not open.', 'web_refused')
      const type = allowedType(r.res.headers['content-type'])
      if (!type) return r.res.destroy(), no(415, 'a type that is not allowed', 'Ola downloads web pages, text, PDFs, spreadsheets, data files and office documents, not this kind of file.', 'web_refused')
      const max = type.kind === 'page' ? cfg.maxPage : cfg.maxBig
      const declared = Number(r.res.headers['content-length'])
      if (Number.isFinite(declared) && declared > max) return r.res.destroy(), no(413, 'over the size cap', `That file is larger than ${Math.round(max / 1024 / 1024)} MB, the most Ola downloads.`, 'web_refused')
      let body
      try {
        body = await readCapped(r.res, max, deadline, signal)
      } catch (e) {
        if (e.message === 'too_large') return no(413, 'over the size cap', `That file is larger than ${Math.round(max / 1024 / 1024)} MB, the most Ola downloads.`, 'web_refused')
        return no(504, 'the site took too long', 'The site took too long to send the document.', 'web_upstream')
      }
      rec.status = 200
      rec.bytes = body.length
      const charset = /charset=([A-Za-z0-9._-]{1,40})/i.exec(String(r.res.headers['content-type'] ?? ''))?.[1]
      res.writeHead(200, {
        'Content-Type': type.mime + (charset ? `; charset=${charset}` : ''),
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
        'X-Ola-Final-Url': url.slice(0, 4096),
        'X-Ola-Fetched-At': new Date().toISOString(),
        'X-Ola-Redirects': String(hop),
      })
      return res.end(body)
    }
  }

  function getOnce(u, where, signal, deadline) {
    // The connection goes to the address that was checked: host is that IP, the name is only the
    // TLS server name and the Host header. Nothing here resolves the name again.
    const a = where.addrs[0]
    return new Promise((resolve, reject) => {
      const req = https.request({
        host: a.address,
        family: a.family,
        port: a.port,
        servername: where.servername,
        path: (u.pathname || '/') + u.search,
        method: 'GET',
        agent: false,
        lookup: () => {
          throw new Error('no second resolution')
        },
        ...(where.test && cfg.testCa ? { ca: cfg.testCa } : {}),
        headers: { Host: u.host, 'User-Agent': 'Ola/1 (a research assistant fetching one document)', Accept: 'text/html, application/pdf, text/plain, text/csv, application/json, application/xml, */*;q=0.5', 'Accept-Encoding': 'identity', 'Accept-Language': 'en' },
        timeout: Math.min(20_000, Math.max(100, deadline - Date.now())),
        signal,
      })
      const total = setTimeout(() => req.destroy(new Error('timeout')), Math.max(0, deadline - Date.now()))
      req.on('response', (res) => {
        clearTimeout(total)
        resolve({ status: res.statusCode, res })
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (e) => (clearTimeout(total), reject(new Error(signal.aborted ? 'aborted' : e.message === 'timeout' ? 'timeout' : 'unreachable'))))
      req.end()
    })
  }

  function readCapped(res, max, deadline, signal) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      const t = setTimeout(() => (res.destroy(), reject(new Error('timeout'))), Math.max(0, deadline - Date.now()))
      const onAbort = () => (res.destroy(), reject(new Error('aborted')))
      signal.addEventListener('abort', onAbort, { once: true })
      res.on('data', (c) => {
        size += c.length
        if (size > max) {
          clearTimeout(t)
          res.destroy()
          return reject(new Error('too_large'))
        }
        chunks.push(c)
      })
      res.on('end', () => (clearTimeout(t), signal.removeEventListener('abort', onAbort), resolve(Buffer.concat(chunks))))
      res.on('error', () => (clearTimeout(t), reject(new Error('unreachable'))))
    })
  }

  return {
    handle,
    weekOf,
    scrub: (s) => (cfg.key && s.includes(cfg.key) ? s.split(cfg.key).join('[redacted]') : s),
    close: () => clearInterval(timer),
  }
}

// A made-up provider for tests and made-up runs: fixed results, one of them a real, stable public
// document (the Universal Declaration of Human Rights from the UN's human rights office), so a
// live check can fetch one real PDF; the others are under .invalid, refused by name, so a model that
// follows them reaches nothing. Never used when a real provider is set.
function mockResults(q, count) {
  return [
    { title: 'Universal Declaration of Human Rights (English)', url: 'https://www.ohchr.org/sites/default/files/UDHR/Documents/UDHR_Translations/eng.pdf', snippet: 'The full text of the Universal Declaration of Human Rights, adopted by the UN General Assembly in 1948.', age: null },
    { title: `Made-up result for: ${q.slice(0, 80)}`, url: 'https://made-up.invalid/adaptation-report', snippet: 'A result made up by the test search. This page does not exist (.invalid never resolves).', age: null },
    { title: 'Another made-up result', url: 'https://www.made-up.invalid/notes', snippet: 'Made up as well; the gateway refuses it by name, without asking anyone.', age: null },
  ].slice(0, count)
}

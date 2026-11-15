#!/usr/bin/env node
// Watches the agenda pages of public bodies: which documents are posted, which
// are new since the last run, and how much one body posts in a year.
//   node scripts/venture/watch.mjs check              documents that are new (or reposted) since the last run, and records them as seen.
//                                                     A body's first run records everything and prints only the last 14 days.
//   node scripts/venture/watch.mjs check --dry        the same, and writes nothing
//   node scripts/venture/watch.mjs newest             per body: the governing body's newest agenda for a meeting today or later, else the last past one
//   node scripts/venture/watch.mjs volume [months]    per body: meetings, files and pages over the period (default 12), then a MEDIAN line
//   options: --json   --only <slug,slug>   --today YYYY-MM-DD   --config <file>   --verbose (progress on stderr)
//            --no-pdfinfo (behave as on a machine without poppler)
//            check:   --back <days of meeting dates looked at, default 120>
//            volume:  --packets <how many packets per body to download and count, default 4; 0 = none>
//                     --no-pages (counts of meetings and files only, no downloads)
//            --max-mb <largest agenda downloaded for a page count, default 40>   --packet-max-mb <default 250>
//
// Bodies are read from apps/venture/private/data/watch.json (private, not in git;
// this file names no body). One entry per body:
//   { "slug": "...", "name": "...", "sources": [ <source>, ... ] }      (one source may be written flat on the entry)
//   legistar:   { "platform": "legistar", "client": "<name in webapi.legistar.com/v1/<client>>", "governing": ["City Council", ...],
//                 "packets": "meeting-page" | "attachments" | ["meeting-page", "attachments"] | "none" }
//                 meeting-page: the packet is the "Agenda Packet" link on each meeting's page (the API does not carry it);
//                 attachments: the supporting documents hang on the agenda's items (counted by `volume` only)
//   civicplus:  { "platform": "civicplus", "base": "https://<site>", "category": [<ids of the governing body's Agenda Center categories>],
//                 "packetTitle": "<regex: rows that are the packet, default \bpacket\b>", "noticeCategory": [<ids that hold only notices>] }
//   civicclerk: { "platform": "civicclerk", "tenant": "<name in <tenant>.api.civicclerk.com>", "governing": ["City Commission", ...] }
//   any source: "noticeTitle": "<regex>" for cancellations and quorum notices: a file, but neither an agenda nor a meeting.
// Bodies named in "governing" (or the listed categories) are the council or commission; every other body on the
// page is a board or committee, and is reported apart.
//
// Output: plain text, one line per document, tab-separated, always these nine columns:
//   status  slug  kind  gov|board  meeting-date  published  pages  url  title
//   status: new | revised (check), upcoming | past (newest);  kind: agenda | packet | minutes | notice
//   published: 2026-01-31T17:05Z where the platform gives UTC, "2026-01-31 17:05" where it gives the body's local time, - if unknown
//   pages: a number, or ? (not counted: pdfinfo missing, file over --max-mb, not a PDF, download failed).
//          Without pdfinfo only the files that state their own page count (linearized PDFs) get a number.
// `volume` prints one line per body of tab-separated key=value pairs (_gov = the governing body, _all = every body
// on the page; packet_pages_est and attachment_pages_est are extrapolations from the sample). A body that fails
// prints "FAIL <slug> <why>" on its own line and the others carry on; the exit code is then 1.
//
// State (private): watch-seen.json (what `check` has reported) and watch-pages.json (page counts, so no file is
// downloaded twice), beside watch.json. Needs node 18+ only. Page counts come from poppler's pdfinfo if it is
// installed, reading the download from a pipe: no file is ever written to disk. Fetching is polite: one request
// at a time per site, a second apart, one retry after a pause, a generic User-Agent.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const DATA = fileURLToPath(new URL('apps/venture/private/data/', root))
const args = process.argv.slice(2)
const cmd = args[0]
const flag = (k) => args.includes(k)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const JSON_OUT = flag('--json')
const DRY = flag('--dry')
const VERBOSE = flag('--verbose')
const CONFIG = opt('--config') ? resolve(opt('--config')) : DATA + 'watch.json'
const SEEN = DATA + 'watch-seen.json'
const PAGES = DATA + 'watch-pages.json'
const MAX_MB = Number(opt('--max-mb', 40))
const PACKET_MAX_MB = Number(opt('--packet-max-mb', 250))
const UA = 'Mozilla/5.0 (compatible; agenda-watch/1.0)'
const GAP = 1100 // ms between two requests to one site
const FAR = '2100-01-01'
const NOTICE = 'cancel|quorum|^public notice|notice of (?:possible|potential)'

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const today = opt('--today') ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const ymd = (d) => d.toISOString().slice(0, 10)
const addDays = (s, n) => ymd(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5))
const addMonths = (s, n) => {
  const d = new Date(s + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  return ymd(d)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const note = (...a) => VERBOSE && console.error(...a)
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback)
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 1))
  renameSync(path + '.tmp', path)
}
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;|&thinsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const plain = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const names = (list) => new Map((list ?? []).map((n, i) => [String(n).trim().toLowerCase(), i]))
const median = (list) => {
  const v = list.filter((n) => typeof n === 'number').sort((a, b) => a - b)
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null
}
const sum = (list) => list.reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0)

// ---------- fetching: one request at a time per site, a second apart ----------

// A site is the last two labels of the host name, so the many <client>.<platform> names that one vendor serves
// from one machine share a lane. The next request starts a second after the last one ended; a long download
// stops holding the others up after ten seconds.
const lanes = new Map()
function lane(url, job) {
  const site = new URL(url).hostname.split('.').slice(-2).join('.')
  const before = lanes.get(site) ?? Promise.resolve()
  const run = before.then(job)
  const over = run.then(() => {}, () => {})
  lanes.set(site, before.then(() => Promise.race([over, sleep(10_000)])).then(() => sleep(GAP)))
  return run
}
// Opens url and hands the response to `use`, which reads what it needs inside the host's lane.
// One retry, after a pause, for a network error or a "busy" status; then the failure is the caller's.
function open(url, init, timeoutMs, use) {
  return lane(url, async () => {
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), timeoutMs)
      try {
        const res = await fetch(url, { redirect: 'follow', ...init, headers: { 'User-Agent': UA, Accept: '*/*', ...init?.headers }, signal: ctl.signal })
        if ([429, 502, 503, 504].includes(res.status) && attempt === 0) {
          await res.body?.cancel().catch(() => {})
          await sleep(Math.min(Number(res.headers.get('retry-after')) || 20, 60) * 1000)
          continue
        }
        return await use(res)
      } catch (e) {
        if (attempt === 0 && e.name !== 'AbortError' && !e.final) {
          await sleep(15_000)
          continue
        }
        if (e.final) throw e
        throw new Error(`${new URL(url).host}: ${e.name === 'AbortError' ? `no answer in ${timeoutMs / 1000}s` : e.cause?.code || e.message}`)
      } finally {
        clearTimeout(timer)
      }
    }
  })
}
const final = (message) => Object.assign(new Error(message), { final: true })
const getText = (url, init) =>
  open(url, init, 90_000, async (res) => {
    const text = await res.text()
    if (!res.ok) {
      let why = text.slice(0, 160).replace(/\s+/g, ' ')
      try {
        why = JSON.parse(text).ExceptionMessage || JSON.parse(text).Message || why
      } catch {}
      throw final(`HTTP ${res.status} from ${new URL(url).host}: ${why}`)
    }
    return text
  })
const getJson = async (url) => {
  const text = await getText(url)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${new URL(url).host} did not answer with JSON`)
  }
}

// ---------- page counts ----------

const PDFINFO = flag('--no-pdfinfo')
  ? null
  : ['pdfinfo', '/opt/homebrew/bin/pdfinfo', '/usr/local/bin/pdfinfo', '/usr/bin/pdfinfo'].find((bin) => !spawnSync(bin, ['-v']).error) ?? null
const cache = readJson(PAGES, {})
let cacheDirty = 0
const saveCache = () => {
  if (!DRY && cacheDirty) writeJson(PAGES, cache)
  cacheDirty = 0
}

// Reads a PDF's page count without keeping the file: a linearized file says it in its first kilobyte
// (believed only when the length it states is the length the server sends), anything else is piped
// through pdfinfo. sizeOnly stops after the headers.
function measure(url, { maxMb, sizeOnly = false }) {
  return open(url, {}, 20 * 60_000, async (res) => {
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return { pages: null, mb: null, why: `HTTP ${res.status}` }
    }
    const length = Number(res.headers.get('content-length')) || null
    const mb = length ? Math.round((length / 1048576) * 100) / 100 : null
    const reader = res.body.getReader()
    const stop = async (out) => {
      await reader.cancel().catch(() => {})
      return out
    }
    if (sizeOnly) return stop({ pages: null, mb, why: 'size only' })
    let head = Buffer.alloc(0)
    while (head.length < 2048) {
      const { value, done } = await reader.read()
      if (done) break
      head = Buffer.concat([head, value])
    }
    const start = head.subarray(0, 2048).toString('latin1')
    if (!start.includes('%PDF-')) return stop({ pages: null, mb, why: 'not a PDF' })
    const lin = start.match(/<<[^>]*\/Linearized\b[^>]*>>/)?.[0]
    const linLength = Number(lin?.match(/\/L\s*(\d+)/)?.[1])
    const linPages = Number(lin?.match(/\/N\s*(\d+)/)?.[1])
    if (length && linLength === length && linPages > 0) return stop({ pages: linPages, mb })
    if (mb && mb > maxMb) return stop({ pages: null, mb, why: `over ${maxMb} MB` })
    if (!PDFINFO) return stop({ pages: null, mb, why: 'no pdfinfo' })
    const child = spawn(PDFINFO, ['-'], { stdio: ['pipe', 'pipe', 'pipe'] })
    try {
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err += d))
      child.stdin.on('error', () => {})
      const closed = new Promise((r) => child.on('close', r))
      const write = (buf) => Promise.race([closed, new Promise((r) => (child.stdin.write(buf) ? r() : child.stdin.once('drain', r)))])
      let bytes = head.length
      await write(head)
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > maxMb * 1048576) return stop({ pages: null, mb: Math.round(bytes / 1048576), why: `over ${maxMb} MB` })
        if (child.exitCode === null) await write(value)
      }
      child.stdin.end()
      await closed
      const pages = Number(out.match(/^Pages:\s+(\d+)/m)?.[1])
      const size = mb ?? Math.round((bytes / 1048576) * 100) / 100
      return pages > 0 ? { pages, mb: size } : { pages: null, mb: size, why: 'pdfinfo: ' + (err.trim().split('\n')[0] || 'no page count') }
    } finally {
      if (child.exitCode === null) child.kill()
    }
  })
}
// Fills doc.pages and doc.mb, from the cache when the file was counted before. A failure is a "?", never a throw.
async function count(doc, { maxMb = MAX_MB, sizeOnly = false } = {}) {
  const hit = cache[doc.key]
  if (hit && (typeof hit.pages === 'number' || (sizeOnly && typeof hit.mb === 'number'))) return Object.assign(doc, { pages: hit.pages ?? null, mb: hit.mb ?? null })
  const got = await measure(doc.url, { maxMb, sizeOnly }).catch((e) => ({ pages: null, mb: null, why: e.message }))
  Object.assign(doc, { pages: got.pages, mb: got.mb ?? doc.mb ?? null, ...(got.why && got.pages === null && !sizeOnly ? { why: got.why } : {}) })
  if (typeof got.pages === 'number' || typeof got.mb === 'number') {
    cache[doc.key] = { ...(typeof got.pages === 'number' ? { pages: got.pages } : {}), ...(typeof got.mb === 'number' ? { mb: got.mb } : {}) }
    if (++cacheDirty >= 40) saveCache()
  }
  return doc
}
// Packets are large and pdfinfo holds each one in memory: three at a time across all bodies, one per body.
let bigRunning = 0
const bigWaiting = []
async function fewAtATime(job) {
  while (bigRunning >= 3) await new Promise((r) => bigWaiting.push(r))
  bigRunning++
  try {
    return await job()
  } finally {
    bigRunning--
    bigWaiting.shift()?.()
  }
}

// ---------- platforms: each returns the documents of one source between two meeting dates ----------
// A document: { kind, body, gov, rank, date, published, title, url, order, meeting, page?, eventId? }
// order sorts newest-posted first within a source; meeting groups the files of one meeting; rank is the body's
// place in the source's "governing" list (the first name is the council or commission itself, then its workshops).

async function legistar(src, { from, to }) {
  if (!src.client) throw new Error('a legistar source needs "client"')
  const gov = names(src.governing)
  const notice = new RegExp(src.noticeTitle ?? NOTICE, 'i')
  const api = `https://webapi.legistar.com/v1/${encodeURIComponent(src.client)}`
  const stamp = (utc) => (utc ? utc.slice(0, 16) + 'Z' : null)
  const fileTitle = (url, comment) => {
    const file = decodeURIComponent(url.split('/').pop() ?? '').replace(/\.pdf$/i, '').replace(/^\d+_[A-Z]_/, '').replace(/_/g, ' ')
    return (file + (comment ? ` (${comment.replace(/\s+/g, ' ').trim()})` : '')).trim()
  }
  const docs = []
  for (let skip = 0; ; skip += 1000) {
    const filter = encodeURIComponent(`EventDate ge datetime'${from}' and EventDate le datetime'${to}'`)
    const events = await getJson(`${api}/events?$filter=${filter}&$orderby=${encodeURIComponent('EventDate desc')}&$top=1000&$skip=${skip}`)
    if (!Array.isArray(events)) throw new Error('the events API did not return a list')
    for (const e of events) {
      const body = (e.EventBodyName ?? '').trim()
      const base = { body, gov: gov.has(body.toLowerCase()), rank: gov.get(body.toLowerCase()) ?? 99, date: (e.EventDate ?? '').slice(0, 10), meeting: String(e.EventId), eventId: e.EventId, page: e.EventInSiteURL }
      if (e.EventAgendaFile) {
        const title = fileTitle(e.EventAgendaFile, e.EventComment)
        const published = stamp(e.EventAgendaLastPublishedUTC)
        docs.push({ ...base, kind: notice.test(title) ? 'notice' : 'agenda', title, url: e.EventAgendaFile, published, order: Date.parse(published ?? '') || 0 })
      }
      if (e.EventMinutesFile) {
        const published = stamp(e.EventMinutesLastPublishedUTC)
        docs.push({ ...base, kind: 'minutes', title: fileTitle(e.EventMinutesFile), url: e.EventMinutesFile, published, order: Date.parse(published ?? '') || 0 })
      }
    }
    if (events.length < 1000) break
  }
  return docs
}
// The packet is not in the API: it is the "Agenda Packet" link on the meeting's own page, when there is one.
async function legistarPacket(pageUrl) {
  const known = cache[`packet-link|${pageUrl}`]?.url
  if (known) return known
  const html = await getText(pageUrl)
  const link = html.match(/<a[^>]*id="[^"]*hypAgendaPacket"[^>]*>/i)?.[0]
  const href = link?.match(/href="([^"]+)"/i)?.[1]
  if (!href) return null
  const url = new URL(decode(href), pageUrl).href
  cache[`packet-link|${pageUrl}`] = { url } // a found packet keeps its address; a missing one is looked for again
  cacheDirty++
  return url
}
// Where there is no packet, the supporting documents are attachments on the agenda's items.
async function legistarAttachments(src, eventId) {
  const items = await getJson(`https://webapi.legistar.com/v1/${encodeURIComponent(src.client)}/events/${eventId}/eventitems?AgendaNote=0&MinutesNote=0&Attachments=1`)
  const files = new Map()
  for (const item of Array.isArray(items) ? items : [])
    for (const a of item.EventItemMatterAttachments ?? []) if (a.MatterAttachmentHyperlink) files.set(a.MatterAttachmentHyperlink, a.MatterAttachmentName ?? '')
  return [...files].map(([url, name]) => ({ url, name }))
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const monthNo = (word) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1
async function civicplus(src, { from, to, govOnly }) {
  if (!src.base) throw new Error('a civicplus source needs "base"')
  const base = src.base.replace(/\/+$/, '')
  const govIds = names([src.category ?? []].flat())
  const noticeIds = new Set([src.noticeCategory ?? []].flat().map(String))
  const packet = new RegExp(src.packetTitle ?? '\\bpacket\\b', 'i')
  const notice = new RegExp(src.noticeTitle ?? NOTICE, 'i')
  const rowsOf = (html) =>
    html.split(/(?=<tr[^>]*class="catAgendaRow")/).slice(1).map((row) => {
      const when = row.match(/aria-label="Agenda for ([A-Za-z]+) (\d{1,2}), (\d{4})"/)
      const posted = plain(row.match(/<h3[\s\S]*?<\/h3>/)?.[0] ?? '').match(/Posted ([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) ([AP]M)/)
      const links = [...row.matchAll(/href="(\/AgendaCenter\/ViewFile\/(Agenda|Minutes)\/_?[^"?]*-(\d+))(\?[^"]*)?"/g)]
      return {
        date: when ? `${when[3]}-${pad(monthNo(when[1]))}-${pad(when[2])}` : null,
        published: posted ? `${posted[3]}-${pad(monthNo(posted[1]))}-${pad(posted[2])} ${pad((Number(posted[4]) % 12) + (posted[6] === 'PM' ? 12 : 0))}:${posted[5]}` : null,
        title: plain(row.match(/<\/h3>\s*<p>\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
        links: links.map((l) => ({ path: l[1], type: l[2], id: Number(l[3]), query: decode(l[4] ?? '') })),
      }
    })
  const html = await getText(`${base}/AgendaCenter`)
  const cats = html.split(/(?=<div[^>]*id="cat\d+")/).slice(1).map((part) => ({
    id: part.match(/id="cat(\d+)"/)[1],
    name: plain(part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''),
    years: [...new Set([...part.matchAll(/changeYear\((\d{4}),/g)].map((m) => Number(m[1])))],
    shown: Number(part.match(/<li[^>]*class=["']?current["']?[^>]*>\s*<a[^>]*>(\d{4})</)?.[1]) || null,
    rows: rowsOf(part),
  }))
  if (!cats.length) throw new Error(`no Agenda Center categories at ${base}/AgendaCenter`)
  for (const id of govIds.keys()) if (!cats.some((c) => c.id === id)) throw new Error(`category ${id} is not on ${base}/AgendaCenter`)
  const lastYear = Math.min(Number(to.slice(0, 4)), Number(today.slice(0, 4)) + 1)
  const docs = new Map()
  for (const cat of cats) {
    if (govOnly && !govIds.has(cat.id)) continue
    const rows = [...cat.rows]
    // the page shows one year per category; the other years of the period are asked for one by one
    // (the page itself POSTs this form; some sites refuse the POST from outside and all four tried answer the GET)
    for (let year = Number(from.slice(0, 4)); year <= lastYear; year++) {
      if (year === cat.shown || !cat.years.includes(year)) continue
      const form = `year=${year}&catID=${cat.id}&startDate=&endDate=&term=&prevVersionScreen=false`
      const list = `${base}/AgendaCenter/UpdateCategoryList`
      rows.push(...rowsOf(await getText(`${list}?${form}`).catch(() => getText(list, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }))))
    }
    for (const row of rows) {
      if (!row.date || row.date < from || row.date > to) continue
      const shared = { body: cat.name, gov: govIds.has(cat.id), rank: govIds.get(cat.id) ?? 99, date: row.date, meeting: `${cat.id}:${row.date}` }
      for (const link of row.links) {
        if (/html=true/.test(link.query)) continue // the same agenda as a web page
        const isPacket = /packet=true/.test(link.query)
        const kind = link.type === 'Minutes' ? 'minutes' : isPacket || packet.test(row.title) ? 'packet' : noticeIds.has(cat.id) || notice.test(row.title) ? 'notice' : 'agenda'
        const url = base + link.path + (isPacket ? '?packet=true' : '')
        const title = (row.title || cat.name) + (link.type === 'Minutes' ? ' (minutes)' : isPacket ? ' (packet)' : '')
        docs.set(url, { ...shared, kind, title, url, published: link.type === 'Minutes' ? null : row.published, order: link.id })
      }
    }
  }
  return [...docs.values()]
}

async function civicclerk(src, { from, to }) {
  if (!src.tenant) throw new Error('a civicclerk source needs "tenant"')
  const gov = names(src.governing)
  const notice = new RegExp(src.noticeTitle ?? NOTICE, 'i')
  const api = `https://${src.tenant}.api.civicclerk.com/v1`
  const kinds = { agenda: 'agenda', 'agenda packet': 'packet', minutes: 'minutes' }
  const docs = []
  let url = `${api}/Events?$filter=${encodeURIComponent(`startDateTime ge ${from}T00:00:00Z and startDateTime le ${to}T23:59:59Z`)}&$orderby=${encodeURIComponent('startDateTime desc')}`
  for (let pageNo = 0; url && pageNo < 400; pageNo++) {
    const page = await getJson(url)
    if (!Array.isArray(page.value)) throw new Error('the events API did not return a list')
    for (const e of page.value) {
      const body = (e.eventCategoryName ?? e.categoryName ?? '').trim()
      for (const f of e.publishedFiles ?? []) {
        const kind = kinds[(f.type ?? '').toLowerCase()]
        if (!kind || !f.fileId) continue
        const title = `${e.eventName ?? body} ${f.name ?? f.type}`.replace(/\s+/g, ' ').trim()
        docs.push({
          body,
          gov: gov.has(body.toLowerCase()),
          rank: gov.get(body.toLowerCase()) ?? 99,
          date: (e.startDateTime ?? e.eventDate ?? '').slice(0, 10),
          meeting: String(e.id),
          kind: kind === 'agenda' && notice.test(title) ? 'notice' : kind,
          title,
          url: `${api}/Meetings/GetMeetingFileStream(fileId=${f.fileId},plainText=false)`,
          published: f.publishOn ? f.publishOn.slice(0, 16).replace('T', ' ') : null, // the body's local time, whatever the Z says
          order: f.fileId,
        })
      }
    }
    url = page['@odata.nextLink'] ?? null
  }
  return docs
}

const PLATFORMS = { legistar, civicplus, civicclerk }
const sourcesOf = (body) => body.sources ?? [body]
const keyOf = (d) => `${d.kind}|${d.url}|${d.published ?? ''}`

// Every source of one body. A source that fails is reported and the others still count.
async function load(body, range) {
  const docs = []
  const fails = []
  await Promise.all(
    sourcesOf(body).map(async (src, i) => {
      try {
        if (!PLATFORMS[src.platform]) throw new Error(`unknown platform "${src.platform}"`)
        for (const d of await PLATFORMS[src.platform](src, range)) docs.push({ slug: body.slug, ...d, src: i, key: keyOf(d) })
        note(`${body.slug}: ${src.platform} listed`)
      } catch (e) {
        fails.push(`${src.platform}: ${e.message}`)
      }
    }),
  )
  return { docs, fails }
}
// The meetings behind a list of documents: one per agenda (or packet) that is not a notice.
const meetingsOf = (docs) => {
  const seen = new Map()
  for (const d of docs) if ((d.kind === 'agenda' || d.kind === 'packet') && !seen.has(`${d.src}:${d.meeting}`)) seen.set(`${d.src}:${d.meeting}`, d)
  return [...seen.values()]
}
const newestFirst = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.order - a.order)
const KIND_ORDER = { agenda: 0, packet: 1, notice: 2, minutes: 3 }
const byMeeting = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order)
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim()
const row = (status, d) => [status, d.slug, d.kind, d.gov ? 'gov' : 'board', d.date, d.published ?? '-', d.pages ?? '?', d.url, d.body && !d.title.toLowerCase().includes(d.body.toLowerCase()) ? `${d.body}: ${d.title}` : d.title].map(clean).join('\t')
const publicDoc = ({ src, key, order, rank, meeting, eventId, page, ...rest }) => rest

// ---------- the three commands, each for one body ----------

async function check(body, state) {
  const st = (state.bodies[body.slug] ??= { initialized: null, seen: {}, packetUrl: {} })
  st.packetUrl ??= {}
  const { docs, fails } = await load(body, { from: addDays(today, -Number(opt('--back', 120))), to: FAR })
  const recent = addDays(today, -14)
  // Legistar packets: one look at the page of each recent or coming meeting that has an agenda, until its packet is known
  for (const [i, src] of sourcesOf(body).entries()) {
    if (src.platform !== 'legistar' || ![src.packets ?? []].flat().includes('meeting-page')) continue
    for (const agenda of docs.filter((d) => d.src === i && d.kind === 'agenda' && d.date >= recent && d.page)) {
      try {
        const url = st.packetUrl[agenda.meeting] ?? (await legistarPacket(agenda.page))
        if (!url) continue
        st.packetUrl[agenda.meeting] = url
        // a packet has no date of its own: it is taken as reposted whenever its agenda is
        const packet = { ...agenda, kind: 'packet', url, title: `${agenda.title} (packet)` }
        docs.push({ ...packet, key: keyOf(packet) })
      } catch (e) {
        fails.push(`packet of ${agenda.date}: ${e.message}`)
      }
    }
  }
  const first = !st.initialized
  const known = new Set(Object.keys(st.seen).map((k) => k.slice(0, k.lastIndexOf('|'))))
  const fresh = []
  for (const d of docs) {
    if (st.seen[d.key]) continue
    st.seen[d.key] = new Date().toISOString()
    if (!first || (d.published ?? d.date).slice(0, 10) >= recent) fresh.push({ ...d, status: known.has(`${d.kind}|${d.url}`) ? 'revised' : 'new' })
  }
  if (!fails.length) st.initialized ??= new Date().toISOString()
  await Promise.all(fresh.map((d) => count(d)))
  return { docs: fresh.sort(byMeeting), fails }
}

async function newest(body) {
  const { docs, fails } = await load(body, { from: addDays(today, -365), to: FAR, govOnly: true })
  const agendas = docs.filter((d) => d.gov && d.kind === 'agenda')
  const coming = agendas.filter((d) => d.date >= today)
  // of the agendas for meetings still to come: the body named first in "governing" before its workshops and
  // briefings, then the one posted last; with none to come, the last meeting held
  const pick = coming.length
    ? coming.sort((a, b) => a.src - b.src || a.rank - b.rank || b.order - a.order || newestFirst(a, b))[0]
    : agendas.sort((a, b) => newestFirst({ ...a, order: 0 }, { ...b, order: 0 }) || a.rank - b.rank || b.order - a.order)[0]
  if (!pick) return { docs: [], fails: fails.length ? fails : ['no agenda of the governing body in the last 365 days'] }
  await count(pick)
  return { docs: [{ ...pick, status: pick.date >= today ? 'upcoming' : 'past' }], fails }
}

async function volume(body, months, sample) {
  const from = addMonths(today, -months)
  const { docs, fails } = await load(body, { from, to: today })
  const pages = !flag('--no-pages')
  const meetings = meetingsOf(docs)
  const packets = { form: 'none', count: 0, sized: 0, mb: null, sample: [], pagesPerMb: null, estimatedPages: null, estimatedPagesByMean: null, how: null }
  let attached = null

  // What comes with the governing body's agendas: packets the platform lists, packets found on Legistar meeting
  // pages, and where the source says so the attachments on the agenda's items.
  let attachments = null
  for (const [i, src] of sourcesOf(body).entries()) {
    const want = src.platform === 'legistar' ? [src.packets ?? []].flat() : []
    if (!want.includes('meeting-page') && !want.includes('attachments')) continue
    const govMeetings = meetings.filter((d) => d.src === i && d.gov).sort(newestFirst)
    for (const m of govMeetings) {
      try {
        if (want.includes('meeting-page')) {
          const url = await legistarPacket(m.page)
          const packet = url && { ...m, kind: 'packet', url, title: `${m.title} (packet)` }
          if (packet) docs.push({ ...packet, key: keyOf(packet) })
        }
        if (want.includes('attachments')) {
          attachments ??= []
          attachments.push({ date: m.date, title: m.title, files: await legistarAttachments(src, m.eventId) })
        }
      } catch (e) {
        fails.push(`packet of ${m.date}: ${e.message}`)
      }
    }
    note(`${body.slug}: packets looked up for ${govMeetings.length} meetings`)
  }

  const listed = docs.filter((d) => d.gov && d.kind === 'packet')
  const jobs = []
  if (pages) {
    for (const d of docs) if (d.kind === 'agenda' || d.kind === 'notice' || (d.kind === 'minutes' && d.gov)) jobs.push(count(d))
    for (const d of listed) jobs.push(count(d, { sizeOnly: true }))
  }
  await Promise.all(jobs)
  note(`${body.slug}: ${jobs.length} files counted`)

  if (listed.length) {
    listed.sort(newestFirst)
    Object.assign(packets, { form: 'one-pdf', count: listed.length })
    if (pages) {
      const picked = listed.slice(0, sample)
      for (const d of picked) await fewAtATime(() => count(d, { maxMb: PACKET_MAX_MB }))
      const sized = listed.filter((d) => typeof d.mb === 'number')
      const counted = picked.filter((d) => typeof d.pages === 'number' && typeof d.mb === 'number')
      packets.sized = sized.length
      packets.mb = Math.round(sum(sized.map((d) => d.mb)))
      packets.sample = picked.map((d) => ({ date: d.date, title: d.title, url: d.url, pages: d.pages ?? null, mb: d.mb ?? null, ...(d.why ? { why: d.why } : {}) }))
      if (counted.length) {
        packets.pagesPerMb = Math.round((sum(counted.map((d) => d.pages)) / sum(counted.map((d) => d.mb))) * 100) / 100
        // two extrapolations from the sample: its pages per megabyte times the megabytes of every packet of the
        // period (each one's size is read from its headers), and its mean pages times the number of packets
        packets.estimatedPages = sized.length ? Math.round((packets.pagesPerMb * sum(sized.map((d) => d.mb)) * listed.length) / sized.length) : null
        packets.estimatedPagesByMean = Math.round((sum(counted.map((d) => d.pages)) / counted.length) * listed.length)
        packets.how = `${counted.length} of ${listed.length} packets counted (the newest); the year is an extrapolation`
      }
    }
  }
  if (attachments) {
    const total = sum(attachments.map((m) => m.files.length))
    attached = { files: total, meetings: attachments.length, sample: [], pagesPerFile: null, estimatedPages: null, how: null }
    if (!listed.length) packets.form = 'attachments'
    if (pages) {
      const picked = attachments.filter((m) => m.files.length).slice(0, sample)
      const all = []
      for (const m of picked) {
        const each = await Promise.all(m.files.map((f) => count({ url: f.url, key: `attachment|${f.url}|` })))
        all.push(...each)
        attached.sample.push({ date: m.date, title: m.title, files: each.length, counted: each.filter((d) => typeof d.pages === 'number').length, pages: sum(each.map((d) => d.pages)), mb: Math.round(sum(each.map((d) => d.mb)) * 10) / 10 })
      }
      const counted = all.filter((d) => typeof d.pages === 'number')
      const notPdf = all.filter((d) => d.why === 'not a PDF').length
      if (all.length) {
        // an attachment that is not a PDF counts as no pages; the year is the sample's pages per attachment times every attachment
        attached.pagesPerFile = Math.round((sum(counted.map((d) => d.pages)) / all.length) * 10) / 10
        attached.estimatedPages = Math.round((sum(counted.map((d) => d.pages)) / all.length) * total)
        attached.how = `${all.length} attachments of the ${picked.length} newest meetings: ${counted.length} PDFs counted, ${notPdf} not PDFs, ${all.length - counted.length - notPdf} too large or failed; the year (${total} attachments) is an extrapolation`
      }
    }
  }

  const side = (list) => {
    const of = (kind) => list.filter((d) => d.kind === kind)
    const total = (kind) => (pages ? sum(of(kind).map((d) => d.pages)) : null)
    return {
      meetings: meetingsOf(list).length,
      agendas: of('agenda').length,
      agendaPages: total('agenda'),
      agendasNotCounted: pages ? of('agenda').filter((d) => typeof d.pages !== 'number').length : null,
      notices: of('notice').length,
      noticePages: total('notice'),
      minutes: of('minutes').length,
      packets: of('packet').length, // on Legistar only the governing body's meeting pages are looked at
    }
  }
  const govDocs = docs.filter((d) => d.gov)
  const gov = side(govDocs)
  gov.minutesPages = pages ? sum(govDocs.filter((d) => d.kind === 'minutes').map((d) => d.pages)) : null
  gov.minutesNotCounted = pages ? govDocs.filter((d) => d.kind === 'minutes' && typeof d.pages !== 'number').length : null
  const bodies = {}
  for (const d of docs) {
    const b = (bodies[d.body] ??= { gov: d.gov, meetings: 0, agendas: 0, agendaPages: 0, packets: 0, notices: 0, minutes: 0 })
    if (d.kind === 'agenda') (b.agendas++, (b.agendaPages += d.pages ?? 0))
    else b[d.kind === 'packet' ? 'packets' : d.kind === 'notice' ? 'notices' : 'minutes']++
  }
  for (const m of meetings) bodies[m.body].meetings++
  const notCounted = docs.filter((d) => (d.kind === 'agenda' || d.kind === 'notice') && pages && typeof d.pages !== 'number').map((d) => ({ date: d.date, body: d.body, title: d.title, url: d.url, mb: d.mb ?? null, why: d.why ?? null }))
  return { result: { slug: body.slug, from, to: today, months, gov, all: side(docs), packets, attachments: attached, bodies, notCounted }, fails }
}

const volumeLine = (label, r) =>
  [
    label,
    `period=${r.from}..${r.to}`,
    `meetings_gov=${r.gov.meetings}`,
    `meetings_all=${r.all.meetings}`,
    `agendas_gov=${r.gov.agendas}`,
    `agenda_pages_gov=${r.gov.agendaPages ?? '?'}`,
    `agendas_all=${r.all.agendas}`,
    `agenda_pages_all=${r.all.agendaPages ?? '?'}`,
    `agendas_not_counted=${r.all.agendasNotCounted ?? '?'}`,
    `notices_all=${r.all.notices}`,
    `minutes_gov=${r.gov.minutes}`,
    `minutes_pages_gov=${r.gov.minutesPages ?? '?'}`,
    `minutes_all=${r.all.minutes}`,
    `packets_form=${r.packets.form}`,
    `packets_gov=${r.packets.count}`,
    `packets_mb=${r.packets.mb ?? '?'}`,
    `packet_sample_pages=${r.packets.sample.map((s) => s.pages ?? '?').join(',') || '-'}`,
    `packet_pages_est=${r.packets.estimatedPages ?? '-'}`,
    `packet_pages_est_by_mean=${r.packets.estimatedPagesByMean ?? '-'}`,
    `attachments_gov=${r.attachments?.files ?? '-'}`,
    `attachment_sample_pages=${r.attachments?.sample.map((s) => s.pages ?? '?').join(',') || '-'}`,
    `attachment_pages_est=${r.attachments?.estimatedPages ?? '-'}`,
  ].join('\t')

// ---------- run ----------

if (!['check', 'newest', 'volume'].includes(cmd)) {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(2)
}
if (!existsSync(CONFIG)) {
  console.error(`no list of bodies at ${CONFIG}`)
  process.exit(2)
}
const config = readJson(CONFIG)
const only = opt('--only')?.split(',')
const bodies = (config.bodies ?? config).filter((b) => !only || only.includes(b.slug))
const state = cmd === 'check' ? readJson(SEEN, { version: 1, bodies: {} }) : null
const months = cmd === 'volume' && /^\d+$/.test(args[1] ?? '') ? Number(args[1]) : 12
const sample = Number(opt('--packets', 4))

const results = await Promise.all(
  bodies.map(async (body) => {
    try {
      if (cmd === 'check') return await check(body, state)
      if (cmd === 'newest') return await newest(body)
      return await volume(body, months, sample)
    } catch (e) {
      return { docs: [], fails: [e.message] }
    }
  }),
)
if (cmd === 'check' && !DRY) writeJson(SEEN, state)
saveCache()

const failures = results.flatMap((r, i) => r.fails.map((error) => ({ slug: bodies[i].slug, error })))
if (cmd === 'volume') {
  const done = results.map((r) => r.result).filter(Boolean)
  const mid = (pick) => median(done.map(pick))
  const medians = done.length
    ? {
        from: done[0].from,
        to: done[0].to,
        gov: Object.fromEntries(['meetings', 'agendas', 'agendaPages', 'minutes', 'minutesPages'].map((k) => [k, mid((r) => r.gov[k])])),
        all: Object.fromEntries(['meetings', 'agendas', 'agendaPages', 'agendasNotCounted', 'notices', 'minutes'].map((k) => [k, mid((r) => r.all[k])])),
        // medians over the bodies that have the thing at all
        packets: { form: `${done.filter((r) => r.packets.form === 'one-pdf').length} of ${done.length} one-pdf`, count: mid((r) => r.packets.count || null), mb: mid((r) => r.packets.mb), sample: [], estimatedPages: mid((r) => r.packets.estimatedPages), estimatedPagesByMean: mid((r) => r.packets.estimatedPagesByMean) },
        attachments: { files: mid((r) => r.attachments?.files), sample: [], estimatedPages: mid((r) => r.attachments?.estimatedPages) },
      }
    : null
  if (JSON_OUT) console.log(JSON.stringify({ today, months, bodies: done, median: medians, failures }, null, 1))
  else {
    for (const r of done) console.log(volumeLine(r.slug, r))
    if (medians) console.log(volumeLine('MEDIAN', medians))
  }
} else {
  const docs = results.flatMap((r) => r.docs)
  if (JSON_OUT) console.log(JSON.stringify({ today, [cmd === 'check' ? 'new' : 'newest']: docs.map(publicDoc), failures }, null, 1))
  else for (const d of docs) console.log(row(d.status, d))
}
if (!JSON_OUT) for (const f of failures) console.log(['FAIL', f.slug, clean(f.error)].join('\t'))
process.exit(failures.length ? 1 : 0)

#!/usr/bin/env node
// Ola's front desk: the one service a customer's browser talks to.
//
//   node frontdesk/server.mjs          (settings from the environment; see config below)
//
// One origin serves the built web app (web/dist) and the API. It binds loopback only: on the
// Studio, Caddy (TLS) and the relay sit in front of it. Every request is checked in this order:
//   1. Host is our origin's host (DNS rebinding), else 421.
//   2. Cross-site fetches are refused on /api and /oc (Sec-Fetch-Site), and every state-changing
//      request must carry our exact Origin.
//   3. /api/auth/*: passkey registration (by invitation) and sign-in, rate-limited.
//   4. Everything else under /api and /oc needs a live session (cookie), and a state-changing
//      request also the session's CSRF token (X-Ola-CSRF).
//   5. Workspace routes name their workspace (X-Ola-Workspace, or ?w= on a download link); the
//      person must be a member of its team, now (checked per request, so removal is immediate).
//      Viewers read; owners and members also run the agent and change files. Not a member: 404.
//   6. /oc/api/*: only the opencode routes in web/server/proxy.mjs (ALLOWED, the one list), to
//      that workspace's desk socket, with the workspace's opencode password added here.
// Pages the agent builds are never served as documents of this origin: "Open" shows them under
// /v/<grant>/ with an opaque origin, a path-limited CSP and a wrapper that holds their navigation
// (views.mjs, which says why); a separate origin per workspace comes later (README).
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audit, nameRef, openDb, loadKeys } from './db.mjs'
import { addressKey, makeAuth } from './auth.mjs'
import { makeWorkspaces } from './workspaces.mjs'
import { makeViews } from './views.mjs'
import { claudeConfig, makeClaude } from './claude.mjs'
import { CONTAINER, HOME as WS_HOME } from '../workspace/ws.mjs'
import { makeWeb } from './web.mjs'
import { hostedConfig, makeHosted } from './hosted.mjs'
import { jobsConfig, makeJobs } from './jobs.mjs'
import { routeNeed } from '../web/server/proxy.mjs'
import { tooLargeMessage, validName } from '../web/server/files.mjs'
import { closeAfter, lingering, readUpTo } from '../web/server/linger.mjs'
import { derivedThings, isThingFile, otherCount, otherFiles } from '../web/server/project.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- config
export function config(env = process.env) {
  const origin = new URL(env.OLA_FD_ORIGIN ?? 'http://localhost:4700')
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username) throw new Error('OLA_FD_ORIGIN is a bare origin, like https://app.ola.cx')
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') throw new Error('OLA_FD_ORIGIN must be https (or http://localhost for staging)')
  const host = env.OLA_FD_BIND ?? '127.0.0.1'
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('the front desk binds loopback only (OLA_FD_BIND 127.0.0.1 or ::1)')
  const num = (name, dflt, min, max) => {
    const v = env[name] === undefined ? dflt : Number(env[name])
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}`)
    return v
  }
  return {
    origin: origin.origin,
    host,
    port: num('OLA_FD_PORT', Number(origin.port || 4700), 0, 65535),
    data: env.OLA_FD_DATA ?? path.join(os.homedir(), '.ola-frontdesk'),
    dist: env.OLA_FD_DIST ?? path.join(HERE, '../web/dist'),
    maxUpload: num('OLA_FD_MAX_UPLOAD_MB', 50, 1, 1024) * 1024 * 1024,
    // A file that comes in pieces (resumable; a library zip, a large database): up to this size,
    // and never past the project's free space (2026-11-17).
    maxLibrary: num('OLA_FD_MAX_LIBRARY_MB', 4096, 1, 65_536) * 1024 * 1024,
    chunkBytes: num('OLA_FD_CHUNK_MB', 8, 1, 64) * 1024 * 1024,
    session: { absoluteMs: num('OLA_FD_SESSION_HOURS', 14 * 24, 1, 90 * 24) * 3600_000, idleMs: num('OLA_FD_IDLE_HOURS', 24, 0.01, 30 * 24) * 3600_000 },
    limits: signinLimits(num('OLA_FD_SIGNIN_BURST', 10, 1, 1000), num('OLA_FD_SIGNIN_PER_MIN', 10, 1, 1000)),
    // The client address: the socket's peer, or with the PROXY protocol (v1) the one the relay in
    // front reports. With it on, a connection that does not start with a PROXY line is refused.
    proxyProtocol: env.OLA_FD_PROXY_PROTOCOL === '1',
    connectionsPerAddress: num('OLA_FD_CONNECTIONS_PER_ADDRESS', 128, 4, 10_000),
    // Transfers that run a `container exec` (uploads, downloads, file lists, the project view),
    // in flight at once: per person, uploads per person, per workspace, and bytes in all.
    transfers: { perPerson: 6, uploadsPerPerson: 3, perWorkspace: 12, bytes: num('OLA_FD_INFLIGHT_MB', 512, 16, 16_384) * 1024 * 1024 },
    idleStopMs: num('OLA_FD_IDLE_STOP_MIN', 30, 0, 24 * 60) * 60_000, // 0: never
    // The longest one run may execute before the front desk interrupts it (and tells the page).
    runCeilingMs: num('OLA_FD_RUN_CEILING_MIN', 120, 0.1, 7 * 24 * 60) * 60_000,
    wakeWaitMs: num('OLA_FD_WAKE_WAIT_MS', 1500, 0, 30_000),
    workingWindowMs: num('OLA_FD_WORKING_WINDOW_S', 300, 2, 3600) * 1000,
    capacity: 4, // workspaces the machine runs at once (ws.mjs MAX_RUNNING)
    // Fallback to Claude (claude.mjs): the gateway's grants file, its usage token, the ceilings.
    claude: claudeConfig(env),
    // Web search and downloads: the grants file the gateway reads (GATEWAY_WEB_FILE there), and
    // the provider's name for the line under the approval ("The words of the search go to …").
    webFile: env.OLA_FD_WEB_FILE ?? path.join(WS_HOME, 'gateway-web'),
    searchProvider: env.OLA_FD_SEARCH_PROVIDER ?? 'Brave Search',
    // Fallback to a hosted open model (hosted.mjs): the gateway's hosted grants file, the ceiling.
    hosted: hostedConfig(env),
    // Batch jobs (jobs.mjs): the gateway's job grants file, how often jobs are looked after.
    jobs: jobsConfig(env),
    // Shown in the delete confirmation. The product decision: a deleted file leaves the workspace
    // at once and stays in encrypted backups for up to 14 days.
    deleteNotice:
      env.OLA_FD_DELETE_NOTICE ??
      'It leaves Ola’s computer at once, and Ola can no longer read it. A copy stays in the machine’s encrypted backups for up to 14 days, then it is gone from those too. Your own copy, if you have one, is not touched.',
  }
}

/**
 * Sign-in limits (review of 2026-11-16, M3; see auth.mjs). Per address: the burst and rate given.
 * Per passkey: an assertion for a passkey we hold, 10 at once and 10 a minute, whoever sends it.
 * Global, for anonymous requests: at least 30 addresses' worth, so one caller cannot reach it.
 */
export function signinLimits(burst, perMinute) {
  const g = Math.max(600, 30 * perMinute, 30 * burst)
  return { perAddress: { capacity: burst, perMinute }, perCredential: { capacity: 10, perMinute: 10 }, global: { capacity: g, perMinute: g } }
}

// ---------------------------------------------------------------- headers
export const CSP_PAGE = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
const CSP_DATA = "default-src 'none'; frame-ancestors 'none'; sandbox"
function secure(res, https) {
  res.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('cross-origin-opener-policy', 'same-origin')
  res.setHeader('cross-origin-resource-policy', 'same-origin')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()')
  res.setHeader('content-security-policy', CSP_DATA + (https ? '; upgrade-insecure-requests' : ''))
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }

// How often a request that stays open rechecks its session and membership (see `hold`).
const RECHECK_MS = Math.max(250, Number(process.env.OLA_FD_RECHECK_MS) || 1000)
// A reply sent before the request's body was read (a 401, a refusal, a 413) closes the
// connection: otherwise Node keeps reading a body nobody wants, and a slow sender held the socket
// for up to 15 minutes after its 401 (review of 2026-11-16, M2). It closes the lingering way
// (../web/server/linger.mjs): destroyed at once, the client often got a reset instead of the
// answer, and a person whose file was too large saw a network error (2026-11-16).
const json = (res, status, body, extra = {}) => {
  const req = res.req
  if (req && !req.complete) closeAfter(req, res)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }).end(JSON.stringify(body))
}
const NOT_FOUND = { error: 'not_found', message: 'That is not here, or it is not yours to open.' }
const CLOSED = { error: 'closed', message: 'This project is closed for now: Ola’s computer could not finish changing its keys safely, so no one can use it until Ola’s team has checked it. Your files are kept.' }
// A workspace that could not be started: the machine is full (it starts once a slot frees, on the
// next request), it is closed, or something else failed. Each says so, with a time to try again.
function startRefused(res, e) {
  if (e?.code === 'CLOSED') return json(res, 423, CLOSED)
  if (e?.code === 'MACHINE_BUSY') return json(res, 503, { error: 'machine_busy', message: 'Ola’s computer is running as many projects as it can just now. Try again in a few minutes.' }, { 'retry-after': '60' })
  return json(res, 503, { error: 'start_failed', message: 'Ola’s computer could not start your project just now. Nothing was changed. Try again in a minute.' }, { 'retry-after': '30' })
}

async function readJson(req, max = 64 * 1024, ms = 10_000) {
  // A small JSON body, whole within ms, or nothing: a trickled body does not hold the socket.
  // One over max is left unread (not destroyed), so the 400 that follows reaches the client.
  const timer = setTimeout(() => req.destroy(), ms)
  const got = await readUpTo(req, max).finally(() => clearTimeout(timer))
  if (!got) return null
  try {
    return JSON.parse(got.toString('utf8') || '{}')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- the server
export function makeFrontDesk(cfg = config()) {
  const db = openDb(cfg.data)
  const keys = loadKeys(cfg.data)
  const https = cfg.origin.startsWith('https:')
  const originHost = new URL(cfg.origin).host
  const log = (m) => console.log(JSON.stringify({ t: new Date().toISOString(), event: 'frontdesk', msg: String(m).slice(0, 300) }))
  const auth = makeAuth({ db, keys, origin: cfg.origin, session: cfg.session, limits: cfg.limits, log })
  const web = makeWeb({ db, file: cfg.webFile, providerName: cfg.searchProvider, log })
  const workspaces = makeWorkspaces({ db, keys, log, idleStopMs: cfg.idleStopMs, runCeilingMs: cfg.runCeilingMs, webModeOf: (slug) => web.modeBySlug(slug) })
  const clientOf = (req) => req.socket.olaClient ?? addressKey(req.socket.remoteAddress)

  // "People working": how many people made a request in the last whole window (5 minutes), all
  // teams together, in memory only, never who. The number changes only at a window's end, so
  // polling it shows one number per window and nothing about when within it anyone was active,
  // or on which team (review of 2026-11-16, L2).
  let cur = { k: -1, people: new Set() }
  let prev = { k: -1, n: 0 }
  const roll = () => {
    const k = Math.floor(Date.now() / cfg.workingWindowMs)
    if (cur.k !== k) (prev = { k: cur.k, n: cur.people.size }), (cur = { k, people: new Set() })
    return k
  }
  const seen = (personId) => (roll(), cur.people.add(personId))
  const working = () => (prev.k === roll() - 1 ? prev.n : 0)

  // Transfers in flight (review of 2026-11-16, M5): each holds a host `container exec`.
  // One person may hold at most a quarter of the bytes in flight (second review, 2026-11-16: one
  // viewer's four unread downloads of a 128 MiB file held all 512 MiB, for good, and every other
  // customer's uploads and downloads were refused).
  const flights = { person: new Map(), uploads: new Map(), ws: new Map(), personBytes: new Map(), bytes: 0 }
  const T = cfg.transfers
  const bump = (m, k, d) => m.set(k, (m.get(k) ?? 0) + d)
  function takeSlot(personId, slug, { upload = false, bytes = 0 } = {}) {
    // A person's first transfer may be as large as the total allows (a big file must stay
    // downloadable); further ones must fit within their quarter.
    const mine = () => flights.personBytes.get(personId) ?? 0
    const overShare = (n) => mine() > 0 && mine() + n > T.bytes / 4
    if ((flights.person.get(personId) ?? 0) >= T.perPerson || (upload && (flights.uploads.get(personId) ?? 0) >= T.uploadsPerPerson) || (flights.ws.get(slug) ?? 0) >= T.perWorkspace || flights.bytes + bytes > T.bytes || overShare(bytes)) return null
    bump(flights.person, personId, 1)
    bump(flights.ws, slug, 1)
    if (upload) bump(flights.uploads, personId, 1)
    flights.bytes += bytes
    bump(flights.personBytes, personId, bytes)
    let held = bytes
    let done = false
    return {
      /** Adds bytes once they are known (a download's size); false if that is over the total. */
      grow(n) {
        if (flights.bytes + n > T.bytes || (held > 0 ? mine() + n > T.bytes / 4 : overShare(n))) return false
        flights.bytes += n
        bump(flights.personBytes, personId, n)
        held += n
        return true
      },
      release() {
        if (done) return
        done = true
        bump(flights.person, personId, -1)
        bump(flights.ws, slug, -1)
        if (upload) bump(flights.uploads, personId, -1)
        flights.bytes -= held
        bump(flights.personBytes, personId, -held)
        if (!flights.personBytes.get(personId)) flights.personBytes.delete(personId)
      },
    }
  }
  const tooMany = { error: 'too_many_transfers', message: 'Several transfers are already under way. Wait for one to finish, then try again.' }

  const membership = (personId, slug) =>
    typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)
      ? db
          .prepare(
            `SELECT w.id, w.slug, w.name, w.status, t.name AS team, m.role FROM workspaces w JOIN teams t ON t.id = w.team_id
             JOIN memberships m ON m.team_id = w.team_id WHERE m.person_id = ? AND w.slug = ?`,
          )
          .get(personId, slug)
      : undefined

  const views = makeViews({ cfg, db, keys, auth, membership, workspaces })
  const claude = makeClaude({ db, cc: cfg.claude, container: CONTAINER, workspaces, runCeilingMs: cfg.runCeilingMs, log })
  const hosted = makeHosted({ db, hc: cfg.hosted, cc: cfg.claude, workspaces, runCeilingMs: cfg.runCeilingMs, log })
  const jobs = makeJobs({ db, jc: cfg.jobs, cc: cfg.claude, workspaces, hostedInfo: (w) => hosted.info(w), claudeInfo: (w) => claude.info(w), log })

  const shas = new Map() // `${slug}\0${path}` -> sha256, as ola-files last said
  const MAX_LISTED = 1000

  /** The workspace's files as the page sees them: plain files, hidden folders left out. */
  async function fileEntries(ws) {
    const list = await workspaces.filesAsync(ws.slug)
    const up = new Map(db.prepare('SELECT name_ref, at FROM uploads WHERE workspace_id = ?').all(ws.id).map((r) => [Buffer.from(r.name_ref).toString('hex'), r.at]))
    const out = []
    for (const f of list) {
      if (f.type !== 'file' || f.path.split('/').some((p) => p.startsWith('.') || p === 'node_modules' || p === '__pycache__') || !workspaces.validRel(f.path)) continue
      // The project database is shown under Data, not as a file (and its -wal and -shm never).
      if (/^project\.db(-wal|-shm|-journal)?$/.test(f.path)) continue
      const at = up.get(nameRef(keys, ws.id, f.path).toString('hex'))
      out.push({ path: f.path, size: f.size, modified: new Date((f.mtime ?? 0) * 1000).toISOString(), origin: at ? 'uploaded' : 'made', uploaded: at ? new Date(at).toISOString() : null })
      shas.set(`${ws.slug}\0${f.path}`, f.sha256)
      if (shas.size > 20_000) shas.clear()
    }
    out.sort((a, b) => (a.origin === b.origin ? a.path.localeCompare(b.path) : a.origin === 'uploaded' ? -1 : 1))
    return out
  }
  // The things on the project view: the 12 newest pages (.html, anywhere) and .csv/.md files Ola
  // made at the top of the folder, each at most 1 MiB, read 32 KiB each in ONE `container exec`
  // (a page for its <title>), and cached by sha256
  // so an unchanged file is not read again (review of 2026-11-16, M4: one exec per file, every
  // page load, unbounded).
  const MAX_THINGS = 12
  // A page's or a CSV's first bytes as text, by the charset it declares (a Windows-1252 or Hebrew
  // page's <title> showed as "D�cision" read as UTF-8), else UTF-8, else Windows-1252: the order
  // of workspace/lib/olatext.py, for the few bytes the home reads on the host.
  function decodeText(buf) {
    const head = buf.subarray(0, 4096).toString('latin1')
    const declared = /<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_:.-]{2,40})/i.exec(head)?.[1]
    for (const enc of [declared, 'utf-8']) {
      if (!enc) continue
      try {
        return new TextDecoder(/^(iso-8859-1|latin-?1|us-ascii|ascii)$/i.test(enc) ? 'windows-1252' : enc, { fatal: true }).decode(buf, { stream: true }) // stream: a character cut at the 32 KiB end is not an error
      } catch {}
    }
    return new TextDecoder('windows-1252').decode(buf)
  }
  const texts = new Map() // `${slug}\0${path}\0${sha}` -> text
  async function madeThings(ws, entries) {
    // Pictures, PDFs and Word files Ola made are things too (2026-11-17); only pages, CSVs and
    // Markdown are read (and so capped at 1 MiB).
    const needsText = (f) => /\.(html?|csv|md)$/i.test(f.path)
    const picks = entries
      .filter((f) => isThingFile(f) && (!needsText(f) || f.size <= 1024 * 1024))
      .sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path))
      .slice(0, MAX_THINGS)
    const key = (f) => `${ws.slug}\0${f.path}\0${shas.get(`${ws.slug}\0${f.path}`) ?? '?'}`
    const missing = picks.filter((f) => needsText(f) && !texts.has(key(f)))
    if (missing.length) {
      const got = await workspaces.peek(ws.slug, missing.map((f) => f.path), 32 * 1024)
      if (texts.size > 2000) texts.clear()
      for (const f of missing) if (got.has(f.path)) texts.set(key(f), decodeText(got.get(f.path)))
    }
    return derivedThings({ list: async () => picks, readText: async (rel) => texts.get(key(picks.find((f) => f.path === rel))) ?? null })
  }

  async function workspaceRoute(req, res, sess, url, p) {
    const slug = req.headers['x-ola-workspace'] ?? (req.method === 'GET' ? url.searchParams.get('w') : null)
    const ws = membership(sess.personId, slug)
    if (!ws) return json(res, 404, NOT_FOUND)
    // Closed by the admin CLI (a rotation could not make it safe): refused, to its members only.
    if (ws.status !== 'active') return json(res, 423, CLOSED)
    const canRun = ws.role === 'owner' || ws.role === 'member'
    const readOnly = { error: 'read_only', message: 'You can read this project, but not change it or ask Ola to work in it. Ask its owner if you need more.' }

    // A request that stays open (the event stream above all, also a download) is checked again
    // while it runs: removal from the team, sign-out, revocation, suspension, expiry or the idle
    // limit cuts it within RECHECK_MS. Checked once at the start only, a removed member's or a
    // thief's open stream kept receiving every event of the workspace (review of 2026-11-16, H1).
    const hold = () => {
      const timer = setInterval(() => {
        if (auth.stillValid(sess) && membership(sess.personId, ws.slug)?.status === 'active') return
        clearInterval(timer)
        res.destroy()
      }, RECHECK_MS)
      res.on('close', () => clearInterval(timer))
    }

    if (p.startsWith('/oc/')) {
      const need = routeNeed(req.method, p.slice(3))
      if (!need) return json(res, 403, { error: 'not_allowed' })
      if (need === 'run' && !canRun) return json(res, 403, readOnly)
      // An open tab's event stream does not wake a workspace stopped for idleness; opening the
      // project (or any other request) does.
      if (p === '/oc/api/event' && workspaces.isAsleep(ws.slug)) return json(res, 503, { error: 'asleep', message: 'Your workspace is resting. Open the project to wake it.' }, { 'retry-after': '30' })
      // While the hosted open model works on a request in a conversation, that conversation runs on
      // it: a prompt the page sends there meanwhile would too, so it waits (hosted.mjs).
      const prompt = req.method === 'POST' ? /^\/oc\/api\/session\/([A-Za-z0-9_-]{1,80})\/prompt$/.exec(p) : null
      if (prompt && hosted.busy(ws.slug, prompt[1])) return json(res, 409, { error: 'hosted_busy', message: 'The hosted open model is still working on a request in this conversation. Wait for it to finish, or stop it.' })
      await workspaces.ensureRunning(ws.slug)
      // An answer to a permission request: a web search or download in it becomes a grant for the
      // gateway first (web.mjs), and "Always in this project" is kept for the project.
      const reply = /^\/oc\/api\/session\/([A-Za-z0-9_-]{1,80})\/permission\/([A-Za-z0-9_-]{1,80})\/reply$/.exec(p)
      if (reply && req.method === 'POST') {
        const body = await readJson(req, 16 * 1024)
        if (!body || typeof body.decision !== 'string') return json(res, 400, { error: 'bad_json' })
        const ask = (m, pathname, b) => workspaces.ocCall(ws.slug, m, pathname, b)
        let decision = await web.onReply(ws, sess.personId, reply[1], reply[2], body.decision, ask)
        // Never opencode's own "always": it saves a durable project-wide rule, which is not what
        // "Yes, for the rest of this conversation" says (review 4, H2). The front desk keeps it for
        // this conversation (workspaces.mjs forConversation) and opencode hears "once".
        if (decision === 'always') {
          const pending = await ask('GET', `/api/session/${reply[1]}/permission`)
          const list = Array.isArray(pending.json) ? pending.json : Array.isArray(pending.json?.data) ? pending.json.data : []
          const q = list.find((x) => x?.id === reply[2])
          if (q) workspaces.allowForConversation(ws.slug, reply[1], q.action)
          decision = 'once'
        }
        const r = await ask('POST', `/api/session/${reply[1]}/permission/${reply[2]}/reply`, { decision, ...(typeof body.message === 'string' ? { message: body.message.slice(0, 2000) } : {}) })
        if (r.status >= 400) return json(res, r.status === 404 ? 404 : 502, { error: 'reply_failed', message: 'Your answer did not reach Ola. Try again.' })
        return res.writeHead(204, { 'cache-control': 'no-store' }).end()
      }
      hold()
      return workspaces.forward(ws.slug, ws.id, sess.personId, req, res, p.slice(3), url.search)
    }

    // The project's settings: web search and downloads (shown to everyone, changed by owners and members).
    if (p === '/api/settings' && req.method === 'GET') return json(res, 200, { web: web.settings(ws), role: ws.role })
    if (p === '/api/settings/web' && req.method === 'POST') {
      if (!canRun) return json(res, 403, readOnly)
      const body = await readJson(req)
      if (typeof body?.always !== 'boolean') return json(res, 400, { error: 'bad_json' })
      web.setAlways(ws, sess.personId, body.always)
      return json(res, 200, { web: web.settings(ws) })
    }

    if (p === '/api/project' && req.method === 'GET') {
      // A workspace that is not running is started; if that takes longer than wakeWaitMs the page
      // hears "waking" and asks again, instead of waiting on one long request or showing an error.
      if (!workspaces.isReady(ws.slug)) {
        const waking = workspaces.ensureRunning(ws.slug)
        waking.catch(() => {})
        const done = await Promise.race([waking.then(() => true, (e) => e), new Promise((r) => setTimeout(() => r(false), cfg.wakeWaitMs))])
        if (done === false) return json(res, 503, { error: 'waking', message: 'Waking your workspace…' }, { 'retry-after': '1' })
        if (done !== true) return startRefused(res, done)
      }
      const slot = takeSlot(sess.personId, ws.slug)
      if (!slot) return json(res, 429, tooMany, { 'retry-after': '5' })
      let entries, made
      try {
        await workspaces.ensureRunning(ws.slug)
        entries = await fileEntries(ws)
        made = await madeThings(ws, entries)
      } finally {
        slot.release()
      }
      const members = db.prepare('SELECT p.id, p.display_name FROM memberships m JOIN people p ON p.id = m.person_id JOIN workspaces w ON w.team_id = m.team_id WHERE w.id = ? ORDER BY p.display_name').all(ws.id)
      return json(res, 200, {
        project: { id: ws.slug, name: ws.name, group: ws.team, people: ['you', ...members.filter((m) => m.id !== sess.personId).map((m) => m.display_name)], filesUploaded: entries.filter((f) => f.origin === 'uploaded').length },
        machine: { working: working(), capacity: cfg.capacity },
        things: made,
        // Everything else in the folder, as it is (the home lists it under the things).
        files: otherFiles(entries, made),
        otherTotal: otherCount(entries, made),
        role: ws.role,
      })
    }
    // Fallback to Claude (claude.mjs). Reading the setting: any member. Changing it: an owner.
    // Running Claude, answering its questions, stopping it: owners and members.
    if (p === '/api/claude' && req.method === 'GET') return json(res, 200, await claude.info(ws))
    // Both fallbacks at once (hosted.mjs, claude.mjs), and "When a request looks like a stretch".
    if (p === '/api/fallback' && req.method === 'GET') {
      const [c, h] = await Promise.all([claude.info(ws), hosted.info(ws)])
      return json(res, 200, { claude: c, hosted: h, ...hosted.stretchOf(ws), canChange: ws.role === 'owner' })
    }
    if ((p === '/api/fallback/settings' || p === '/api/hosted/settings' || p === '/api/hosted/run') && req.method === 'POST') {
      const body = await readJson(req, 64 * 1024)
      if (!body) return json(res, 400, { error: 'bad_json' })
      if (p === '/api/fallback/settings') {
        const r = hosted.setStretch(ws, body)
        return json(res, r.status, r.body)
      }
      if (p === '/api/hosted/settings') {
        const r = await hosted.setSettings(ws, sess.personId, body)
        return json(res, r.status, r.body)
      }
      if (!canRun) return json(res, 403, readOnly)
      const r = await hosted.start(ws, sess.personId, body)
      return json(res, r.status, r.body)
    }
    if (p.startsWith('/api/claude/')) {
      const what = p.slice('/api/claude/'.length)
      if (what === 'turns' && req.method === 'GET') {
        const r = await claude.turns(ws, url.searchParams.get('conversation'))
        return json(res, r.status, r.body)
      }
      if (what === 'follow' && req.method === 'GET') {
        hold()
        return claude.follow(ws, url.searchParams.get('run'), res) || json(res, 404, NOT_FOUND)
      }
      if (req.method !== 'POST' || !['settings', 'run', 'answer', 'stop'].includes(what)) return json(res, 404, NOT_FOUND)
      const body = await readJson(req, 160 * 1024)
      if (!body) return json(res, 400, { error: 'bad_json' })
      if (what === 'settings') {
        const r = await claude.setSettings(ws, sess.personId, body)
        return json(res, r.status, r.body)
      }
      if (!canRun) return json(res, 403, readOnly)
      if (what === 'run') {
        hold()
        const r = await claude.start(ws, sess.personId, body, res, req)
        return r ? json(res, r.status, r.body) : undefined
      }
      const r = what === 'answer' ? claude.answer(ws, body) : claude.stop(ws, body.run)
      return json(res, r.status, r.body)
    }
    // Runs stopped at the ceiling (the page asks when a run is interrupted, to say why), from the
    // front desk's memory: no exec, does not wake the workspace, is not use.
    if (p === '/api/runs' && req.method === 'GET') return json(res, 200, workspaces.runsOf(ws.slug))
    // Batch jobs (jobs.mjs): the list and one job (any member), and trial, start, pause, resume and
    // cancel (owners and members; the whole job, outside models and budgets: owners).
    if (p === '/api/jobs' || p.startsWith('/api/jobs/')) {
      try {
        if (p === '/api/jobs' && req.method === 'GET') return json(res, 200, await jobs.list(ws))
        if (p === '/api/jobs/job' && req.method === 'GET') {
          const r = await jobs.show(ws, url.searchParams.get('id'), { stage: url.searchParams.get('stage'), offset: intParam(url, 'offset', 0, 1_000_000), limit: intParam(url, 'limit', 50, 200), problems: url.searchParams.get('problems') === '1' })
          return json(res, r.status, r.body)
        }
        const what = p.slice('/api/jobs/'.length)
        if (req.method !== 'POST' || !['trial', 'start', 'pause', 'resume', 'cancel'].includes(what)) return json(res, 404, NOT_FOUND)
        const body = await readJson(req, 16 * 1024)
        if (!body) return json(res, 400, { error: 'bad_json' })
        const r = await jobs.act(ws, sess.personId, what, body)
        return json(res, r.status, r.body)
      } catch (e) {
        if (['CLOSED', 'MACHINE_BUSY', 'START_FAILED'].includes(e?.code)) return startRefused(res, e)
        if (e?.code === 'JOB_FAILED' || e?.code === 'NO_JOB') return json(res, 502, { error: 'job_failed', message: 'The project’s jobs could not be read just now. Try again in a minute.' })
        throw e
      }
    }
    // Data: the project database, read-only, through `ola-db api` inside the VM (never opened on
    // the host). Each request is one exec with a time and size cap, and one transfer slot.
    if (p.startsWith('/api/data') && req.method === 'GET') {
      const slot = takeSlot(sess.personId, ws.slug)
      if (!slot) return json(res, 429, tooMany, { 'retry-after': '5' })
      const busy = workspaces.holdBusy(ws.slug)
      try {
        await workspaces.ensureRunning(ws.slug)
        return await dataRoute(req, res, ws, url, p, hold)
      } catch (e) {
        if (e?.code === 'NO_TABLE') return json(res, 404, { error: 'no_table', message: 'That table is not in this project’s data any more.' })
        if (e?.code === 'DB_FAILED') return json(res, 502, { error: 'data_failed', message: /long/.test(e.message) ? 'That took too long. Try a narrower search.' : 'The project’s data could not be read just now. Try again in a minute.' })
        throw e
      } finally {
        slot.release()
        busy()
      }
    }

    // Reading real documents and Open for every kind (2026-11-17): a table's rows, a thumbnail,
    // the project's disk, and uploads in pieces. Each holds one transfer slot while it runs.
    if (p === '/api/view/table' || p === '/api/thumb' || p === '/api/disk' || p.startsWith('/api/uploads')) {
      if (p.startsWith('/api/uploads') && !canRun) return json(res, 403, readOnly)
      const piece = p.startsWith('/api/uploads/') && req.method === 'PUT'
      const declared = Number(req.headers['content-length'] ?? NaN)
      if (piece && (!Number.isSafeInteger(declared) || declared < 0)) return json(res, 411, { error: 'length_required', message: 'The upload did not say its size. Try again from the page.' })
      if (piece && declared > cfg.chunkBytes) return json(res, 413, { error: 'too_large', message: 'That piece is larger than Ola takes at once. Reload the page and try again.' })
      const slot = takeSlot(sess.personId, ws.slug, piece ? { upload: true, bytes: declared } : {})
      if (!slot) return json(res, 429, tooMany, { 'retry-after': '5' })
      const busy = workspaces.holdBusy(ws.slug)
      try {
        await workspaces.ensureRunning(ws.slug)
        return await documentRoute(req, res, sess, ws, url, p, hold)
      } finally {
        slot.release()
        busy()
      }
    }

    // Every other route runs at least one `container exec`: one transfer slot each.
    const upload = p === '/api/files' && req.method === 'POST'
    let slot = null
    if (upload) {
      if (!canRun) return json(res, 403, readOnly)
      const name = url.searchParams.get('name') ?? ''
      if (!validName(name)) return json(res, 400, { error: 'bad_name', message: 'The file name has characters Ola does not accept. Rename it with letters, digits and spaces.' })
      const declared = Number(req.headers['content-length'] ?? NaN)
      if (!Number.isSafeInteger(declared) || declared < 0) return json(res, 411, { error: 'length_required', message: 'The upload did not say its size. Try again from the page.' })
      if (declared > cfg.maxUpload) return json(res, 413, { error: 'too_large', message: tooLargeMessage(cfg.maxUpload) })
      slot = takeSlot(sess.personId, ws.slug, { upload: true, bytes: declared })
    } else if (['/api/files', '/api/activity'].includes(p) || p.startsWith('/api/files/')) slot = takeSlot(sess.personId, ws.slug)
    else return json(res, 404, NOT_FOUND)
    if (!slot) return json(res, 429, tooMany, { 'retry-after': '5' })
    const busy = workspaces.holdBusy(ws.slug)
    try {
      await workspaces.ensureRunning(ws.slug)
      return await transfer(req, res, sess, ws, url, p, canRun, readOnly, slot, hold)
    } finally {
      slot.release()
      busy()
    }
  }

  // ---------------------------------------------------------------- documents (2026-11-17)
  //
  // What happens to a file once it is in the project, whichever way it came (one request or in
  // pieces), all of it inside the VM: a zip is unpacked into a folder (ola-unzip: bombs, paths
  // that climb out, links and absurd counts refused, with the zip kept as a plain file), a SQLite
  // database is attached read-only to the project's data after its integrity check, a document
  // is indexed (OCR for scanned pages). The answer says which, in words the page shows as text.
  async function afterUpload(ws, sess, name) {
    if (/\.zip$/i.test(name)) {
      const z = await workspaces.unzip(ws.slug, name)
      if (z.refused) return { refused: `${name} was not unpacked: ${z.refused}. It is kept as it is, as a file nothing opens.` }
      const at = Date.now()
      const ins = db.prepare('INSERT INTO uploads (workspace_id, name_ref, sha256, size, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (workspace_id, name_ref) DO UPDATE SET sha256 = excluded.sha256, size = excluded.size, at = excluded.at')
      for (const f of z.files) {
        ins.run(ws.id, nameRef(keys, ws.id, f.path), f.sha256, f.size, at)
        audit(db, { actor: sess.personId, action: 'file_uploaded', workspace: ws.id, nameRef: nameRef(keys, ws.id, f.path), sha256: f.sha256, size: f.size })
      }
      // The zip itself goes: its files are in the folder now.
      if (await workspaces.removeFile(ws.slug, name).catch(() => false)) db.prepare('DELETE FROM uploads WHERE workspace_id = ? AND name_ref = ?').run(ws.id, nameRef(keys, ws.id, name))
      const done = workspaces.holdBusy(ws.slug)
      workspaces.dbAddFolder(ws.slug, z.folder).then((ok) => ok || log(`${ws.slug}: an unpacked folder could not be indexed`)).finally(done)
      return { unpacked: { folder: z.folder, files: z.files.length, renamed: z.renamed?.length ?? 0, skipped: z.skipped ?? 0 } }
    }
    if (/\.(db|sqlite|sqlite3)$/i.test(name)) {
      const a = await workspaces.dbAttach(ws.slug, name)
      if (a.refused) return { refused: `${name} was not added to Data: ${a.refused}.` }
      return { attached: a }
    }
    if (workspaces.isDocument(name)) {
      // Recorded and indexed in the project database, as one Ola downloads is. Not awaited: a
      // long PDF takes seconds, a scanned one longer.
      const done = workspaces.holdBusy(ws.slug)
      workspaces.dbAdd(ws.slug, name, { by: 'upload', ms: 30 * 60_000 }).then((ok) => ok || log(`${ws.slug}: an upload could not be indexed`)).finally(done)
    }
    return {}
  }

  // Uploads in pieces: the front desk's memory says who started which, the VM holds the bytes
  // (/work/.ola/uploads/<id>.part, ola-put). A piece must start where the last one ended, so a
  // dropped connection resumes from what the VM really has. A front desk restart forgets the
  // uploads; the page then starts again (the VM clears parts left for two days).
  const pieces = new Map() // id -> { slug, wsId, personId, name, size, replace, at }
  const PIECES_PER_PERSON = 8
  function pieceOf(sess, ws, id) {
    const u = /^[0-9a-f]{32}$/.test(id) ? pieces.get(id) : null
    if (!u || u.personId !== sess.personId || u.slug !== ws.slug) return null
    if (Date.now() - u.at > 24 * 3600_000) return pieces.delete(id), null
    return u
  }
  async function documentRoute(req, res, sess, ws, url, p, hold) {
    const rel = url.searchParams.get('path') ?? ''
    const plain = workspaces.validRel(rel) && !rel.split('/').some((x) => x.startsWith('.'))
    if (p === '/api/view/table' && req.method === 'GET') {
      if (!plain || !/\.(csv|tsv|xlsx|xlsm)$/i.test(rel)) return json(res, 404, NOT_FOUND)
      const args = ['table', rel, '--offset', String(intParam(url, 'offset', 0, 1e9)), '--limit', String(intParam(url, 'limit', 50, 200) || 50)]
      const sheet = url.searchParams.get('sheet')
      if (sheet && sheet.length <= 64) args.push('--sheet', sheet)
      const sort = url.searchParams.get('sort')
      if (sort && sort.length <= 128) args.push('--sort', sort, '--dir', url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc')
      const q = url.searchParams.get('q')
      if (q && q.trim()) args.push('--q', q.slice(0, 200))
      const t = await workspaces.viewJson(ws.slug, args)
      if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return json(res, 404, { error: 'not_shown', message: 'That table could not be shown. Download the file instead.' })
      if (url.searchParams.get('first') === '1') audit(db, { actor: sess.personId, action: 'page_opened', workspace: ws.id, nameRef: nameRef(keys, ws.id, rel) })
      return json(res, 200, { table: rel, columns: t.columns.slice(0, 300).map((c) => ({ name: String(c?.name ?? '').slice(0, 200), type: '' })), rows: t.rows.slice(0, 200), total: Number(t.total) || 0, offset: Number(t.offset) || 0, limit: Number(t.limit) || 50, sheets: Array.isArray(t.sheets) ? t.sheets.slice(0, 64).map(String) : null, sheet: typeof t.sheet === 'string' ? t.sheet : null })
    }
    if (p === '/api/thumb' && req.method === 'GET') {
      // A small picture of a thing on the project home: an image as it is, a PDF's first page.
      // Only as an image (never a document of this origin), with a sandbox CSP and nosniff.
      if (!plain || req.headers['sec-fetch-dest'] !== 'image') return json(res, 404, NOT_FOUND)
      const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase()
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'image/png' }[ext]
      if (!type) return json(res, 404, NOT_FOUND)
      const gone = new AbortController()
      res.on('close', () => gone.abort())
      const f = ext === 'pdf' ? await workspaces.viewStream(ws.slug, ['pdf-page', rel, 1, '--width', 480], { signal: gone.signal }) : await workspaces.getStream(ws.slug, rel, { signal: gone.signal })
      if (!f) return res.destroyed ? undefined : json(res, 404, NOT_FOUND)
      if (f.size > 8 * 1024 * 1024) return f.kill(), json(res, 413, { error: 'too_large' })
      res.writeHead(200, { 'content-type': type, 'content-length': String(f.size), 'cache-control': 'private, max-age=60', 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" })
      try {
        for await (const c of f.stream) if (!res.write(c) && !res.destroyed) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
        res.end()
      } catch {
        res.destroy()
      } finally {
        f.kill()
      }
      return
    }
    if (p === '/api/disk' && req.method === 'GET') {
      const d = await workspaces.disk(ws.slug)
      const uploaded = db.prepare('SELECT coalesce(sum(size), 0) AS n FROM uploads WHERE workspace_id = ?').get(ws.id).n
      return json(res, 200, { ...d, uploaded: Math.min(uploaded, d.files), maxUpload: cfg.maxLibrary })
    }
    if (p === '/api/uploads' && req.method === 'POST') {
      const body = await readJson(req)
      const name = typeof body?.name === 'string' ? body.name : ''
      const size = body?.size
      if (!validName(name)) return json(res, 400, { error: 'bad_name', message: 'The file name has characters Ola does not accept. Rename it with letters, digits and spaces.' })
      if (!Number.isSafeInteger(size) || size < 0) return json(res, 400, { error: 'bad_size' })
      if (size > cfg.maxLibrary) return json(res, 413, { error: 'too_large', message: tooLargeMessage(cfg.maxLibrary) })
      const free = (await workspaces.disk(ws.slug)).free
      if (size > free * 0.9) return json(res, 507, { error: 'no_room', message: `This project has room for about ${Math.floor((free * 0.9) / 1024 ** 2)} MB more, and the file is ${Math.ceil(size / 1024 ** 2)} MB. Delete something from Files, or ask Bart for more room.` })
      // The same file again (same name and size, same person): carry on where it stopped.
      for (const [id, u] of pieces) {
        if (u.personId === sess.personId && u.slug === ws.slug && u.name === name && u.size === size) {
          const have = await workspaces.uploadStatus(ws.slug, id)
          if (have !== null && have <= size) return (u.at = Date.now()), json(res, 200, { id, have, chunk: cfg.chunkBytes })
          pieces.delete(id)
        }
      }
      if ([...pieces.values()].filter((u) => u.personId === sess.personId).length >= PIECES_PER_PERSON) return json(res, 429, tooMany, { 'retry-after': '30' })
      const id = randomUUID().replace(/-/g, '')
      pieces.set(id, { slug: ws.slug, wsId: ws.id, personId: sess.personId, name, size, replace: body.replace === true, at: Date.now() })
      return json(res, 201, { id, have: 0, chunk: cfg.chunkBytes })
    }
    const m = /^\/api\/uploads\/([0-9a-f]{32})(\/finish)?$/.exec(p)
    const u = m && pieceOf(sess, ws, m[1])
    if (!u) return json(res, 404, { error: 'no_upload', message: 'That upload is no longer under way. Choose the file again to start over.' })
    if (!m[2] && req.method === 'GET') return json(res, 200, { id: m[1], have: (await workspaces.uploadStatus(ws.slug, m[1])) ?? 0, size: u.size })
    if (!m[2] && req.method === 'DELETE') {
      pieces.delete(m[1])
      await workspaces.abortUpload(ws.slug, m[1])
      return json(res, 200, { aborted: true })
    }
    if (!m[2] && req.method === 'PUT') {
      const offset = Number.parseInt(url.searchParams.get('offset') ?? '', 10)
      const declared = Number(req.headers['content-length'])
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + declared > u.size) return json(res, 400, { error: 'bad_offset' })
      let moved = 0
      let mark = 0
      const slow = setInterval(() => (moved - mark < 32 * 1024 && !req.complete ? req.destroy() : (mark = moved)), 30_000)
      async function* counted() {
        for await (const c of req) {
          moved += c.length
          yield c
        }
      }
      try {
        const r = await workspaces.putChunk(ws.slug, m[1], offset, counted(), { maxBytes: declared })
        u.at = Date.now()
        if (r.mismatch) return json(res, 409, { error: 'offset', have: r.have })
        return json(res, 200, { have: r.have })
      } catch (e) {
        if (e.code === 'ABORTED') return json(res, 400, { error: 'aborted' }, { connection: 'close' })
        return json(res, 502, { error: 'write_failed', message: 'A piece could not be written on Ola’s computer. Try again.' })
      } finally {
        clearInterval(slow)
      }
    }
    if (m[2] && req.method === 'POST') {
      const have = await workspaces.uploadStatus(ws.slug, m[1])
      if (have !== u.size) return json(res, 409, { error: 'incomplete', have: have ?? 0, message: 'Not all of the file has arrived yet.' })
      let got
      try {
        got = await workspaces.finishUpload(ws.slug, m[1], u.name, { replace: u.replace })
      } catch (e) {
        if (e.code === 'EXISTS') return json(res, 409, { error: 'exists', message: `There is already a file called ${u.name}.` })
        return json(res, 502, { error: 'write_failed', message: 'The file could not be written on Ola’s computer. Nothing was kept.' })
      }
      pieces.delete(m[1])
      const ref = nameRef(keys, ws.id, u.name)
      db.prepare('INSERT INTO uploads (workspace_id, name_ref, sha256, size, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (workspace_id, name_ref) DO UPDATE SET sha256 = excluded.sha256, size = excluded.size, at = excluded.at').run(ws.id, ref, got.sha256, got.size, Date.now())
      audit(db, { actor: sess.personId, action: 'file_uploaded', workspace: ws.id, nameRef: ref, sha256: got.sha256, size: got.size })
      return json(res, 201, { path: u.name, size: got.size, sha256: got.sha256, ...(await afterUpload(ws, sess, u.name)) })
    }
    return json(res, 404, NOT_FOUND)
  }

  const TABLE = /^[A-Za-z0-9_][A-Za-z0-9_ .-]{0,127}$/
  const intParam = (url, k, d, max) => Math.min(max, Math.max(0, Number.parseInt(url.searchParams.get(k) ?? '', 10) || d))
  async function dataRoute(req, res, ws, url, p, hold) {
    if (p === '/api/data') return json(res, 200, await workspaces.dbApi(ws.slug, ['tables']))
    if (p === '/api/data/table') {
      const name = url.searchParams.get('name') ?? ''
      if (!TABLE.test(name)) return json(res, 404, NOT_FOUND)
      const args = ['browse', '--table', name, '--offset', String(intParam(url, 'offset', 0, 1e9)), '--limit', String(intParam(url, 'limit', 50, 200) || 50)]
      const sort = url.searchParams.get('sort')
      if (sort && sort.length <= 128) args.push('--sort', sort, '--dir', url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc')
      const q = url.searchParams.get('q')
      if (q && q.trim()) args.push('--q', q.slice(0, 200))
      return json(res, 200, await workspaces.dbApi(ws.slug, args))
    }
    if (p === '/api/data/docs') {
      const args = ['docs', '--offset', String(intParam(url, 'offset', 0, 1e9)), '--limit', String(intParam(url, 'limit', 50, 100) || 50)]
      const q = url.searchParams.get('q')
      if (q && q.trim()) args.push('--q', q.slice(0, 200))
      return json(res, 200, await workspaces.dbApi(ws.slug, args))
    }
    if (p === '/api/data/download' || p === '/api/data/xlsx') {
      const name = url.searchParams.get('name') ?? ''
      if (p === '/api/data/xlsx' && !TABLE.test(name)) return json(res, 404, NOT_FOUND)
      const s = workspaces.dbStream(ws.slug, p === '/api/data/download' ? ['backup'] : ['xlsx', '--table', name])
      res.on('close', () => s.kill())
      hold()
      const file = p === '/api/data/download' ? `${ws.slug}-data.db` : `${name}.xlsx`
      let started = false
      for await (const c of s.stream) {
        if (!started) {
          started = true
          res.writeHead(200, { 'content-type': p === '/api/data/download' ? 'application/vnd.sqlite3' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file)}`, 'cache-control': 'no-store' })
        }
        if (!res.write(c)) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
        if (res.destroyed) break
      }
      const code = await s.done
      if (!started) return json(res, code === 4 ? 404 : 502, code === 4 ? NOT_FOUND : { error: 'data_failed', message: 'The download could not be made just now. Try again in a minute.' })
      if (code !== 0) return res.destroy()
      return res.end()
    }
    return json(res, 404, NOT_FOUND)
  }

  async function transfer(req, res, sess, ws, url, p, canRun, readOnly, slot, hold) {
    if (p === '/api/files' && req.method === 'GET') {
      const files = await fileEntries(ws)
      return json(res, 200, { files: files.slice(0, MAX_LISTED), ...(files.length > MAX_LISTED ? { more: files.length - MAX_LISTED } : {}) })
    }
    if (p === '/api/files' && req.method === 'POST') {
      const name = url.searchParams.get('name') ?? ''
      const tooBig = { error: 'too_large', message: tooLargeMessage(cfg.maxUpload) }
      // A signed-in upload may take its time, but not trickle: under 32 KiB in 30 s ends it.
      let got
      let moved = 0
      let mark = 0
      const slow = setInterval(() => (moved - mark < 32 * 1024 && !req.complete ? req.destroy() : (mark = moved)), 30_000)
      async function* counted() {
        for await (const c of req) {
          moved += c.length
          yield c
        }
      }
      try {
        got = await workspaces.putStream(ws.slug, name, counted(), { replace: url.searchParams.get('replace') === '1', maxBytes: cfg.maxUpload })
      } catch (e) {
        if (e.code === 'EXISTS') return json(res, 409, { error: 'exists', message: `There is already a file called ${name}.` })
        if (e.code === 'TOO_LARGE') return json(res, 413, tooBig, { connection: 'close' })
        audit(db, { actor: sess.personId, action: 'file_uploaded', workspace: ws.id, nameRef: nameRef(keys, ws.id, name), ok: false })
        return json(res, 502, { error: 'write_failed', message: 'The file could not be written on Ola’s computer. Nothing was kept.' })
      } finally {
        clearInterval(slow)
      }
      const ref = nameRef(keys, ws.id, name)
      db.prepare('INSERT INTO uploads (workspace_id, name_ref, sha256, size, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (workspace_id, name_ref) DO UPDATE SET sha256 = excluded.sha256, size = excluded.size, at = excluded.at').run(ws.id, ref, got.sha256, got.size, Date.now())
      audit(db, { actor: sess.personId, action: 'file_uploaded', workspace: ws.id, nameRef: ref, sha256: got.sha256, size: got.size })
      return json(res, 201, { path: name, size: got.size, sha256: got.sha256, ...(await afterUpload(ws, sess, name)) })
    }
    if (p.startsWith('/api/files/')) {
      let rel
      try {
        rel = decodeURIComponent(p.slice('/api/files/'.length))
      } catch {
        return json(res, 404, NOT_FOUND)
      }
      if (!workspaces.validRel(rel) || rel.split('/').some((x) => x.startsWith('.'))) return json(res, 404, NOT_FOUND)
      const ref = nameRef(keys, ws.id, rel)
      if (req.method === 'GET') {
        // The exec dies with the request: a browser that gives up before the header kills it, and
        // ola-get refuses anything but a regular file at once (a FIFO hung it; review L1).
        const gone = new AbortController()
        res.on('close', () => gone.abort())
        const f = await workspaces.getStream(ws.slug, rel, { signal: gone.signal })
        if (!f) return res.destroyed ? undefined : json(res, 404, NOT_FOUND)
        if (res.destroyed) return f.kill()
        if (!slot.grow(f.size)) {
          f.kill()
          return json(res, 503, { error: 'busy', message: 'Ola’s computer is moving a lot of data just now. Try the download again in a minute.' }, { 'retry-after': '30' })
        }
        hold()
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(f.size),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(rel.split('/').pop())}`,
          'cache-control': 'no-store',
        })
        const sha = createHash('sha256')
        let sent = 0
        // A download must keep moving like an upload: under 32 KiB taken in 30 s ends it, so an
        // unread one cannot hold its exec and its bytes for good (second review, 2026-11-16).
        let mark = 0
        const slow = setInterval(() => (sent - mark < 32 * 1024 ? res.destroy() : (mark = sent)), Number(process.env.OLA_FD_SLOW_MS) || 30_000)
        try {
          for await (const c of f.stream) {
            sha.update(c)
            sent += c.length
            // A response already destroyed (the client left while the next chunk was on its way)
            // never emits 'drain' or 'close' again: waiting for either held the download's exec,
            // slot and bytes for good (third review, 2026-11-16; the same in views.mjs).
            if (!res.write(c) && !res.destroyed) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
            if (res.destroyed) break
          }
          res.end()
        } catch {
          res.destroy()
        } finally {
          clearInterval(slow)
          f.kill()
        }
        const whole = sent === f.size && !res.destroyed
        audit(db, { actor: sess.personId, action: 'file_downloaded', workspace: ws.id, nameRef: ref, sha256: whole ? sha.digest('hex') : null, size: sent, ok: whole })
        return
      }
      if (req.method === 'DELETE') {
        if (!canRun) return json(res, 403, readOnly)
        if (!(await workspaces.removeFile(ws.slug, rel))) return json(res, 404, NOT_FOUND)
        // Its document row and index entries go with it.
        await workspaces.dbRemove(ws.slug, rel)
        const row = db.prepare('SELECT sha256, size FROM uploads WHERE workspace_id = ? AND name_ref = ?').get(ws.id, ref)
        db.prepare('DELETE FROM uploads WHERE workspace_id = ? AND name_ref = ?').run(ws.id, ref)
        audit(db, { actor: sess.personId, action: 'file_deleted', workspace: ws.id, nameRef: ref, sha256: row?.sha256 ?? null, size: row?.size ?? null })
        return json(res, 200, { deleted: rel })
      }
    }
    if (p === '/api/activity' && req.method === 'GET') {
      // What happened to this workspace's data, newest first. File names are matched back from
      // the keyed hashes of the files that are still there; a deleted file shows no name.
      const names = new Map((await fileEntries(ws)).map((f) => [nameRef(keys, ws.id, f.path).toString('hex'), f.path]))
      // "Read by a run" rows are the workspace's own claim (from its event stream), so they get
      // their own 200: however many a hostile run reports, they cannot push what people did
      // (uploads, downloads, deletes, runs started) out of the view (review of 2026-11-16, H2).
      const q = (kind) =>
        db
          .prepare(
            `SELECT a.id, a.at, a.action, a.actor_kind, p.display_name AS who, a.name_ref, a.sha256, a.size, a.ok FROM audit a LEFT JOIN people p ON p.id = a.actor_person_id
             WHERE a.workspace_id = ? AND (a.actor_kind = 'run') = ? ORDER BY a.id DESC LIMIT 200`,
          )
          .all(ws.id, kind ? 1 : 0)
      const rows = [...q(false), ...q(true)].sort((x, y) => y.id - x.id)
      return json(res, 200, {
        activity: rows.map((r) => ({ at: new Date(r.at).toISOString(), action: r.action, by: r.actor_kind === 'admin' ? 'Bart' : r.who ?? null, viaRun: r.actor_kind === 'run', file: r.name_ref ? names.get(Buffer.from(r.name_ref).toString('hex')) ?? null : null, size: r.size, sha256: r.sha256, ok: !!r.ok })),
      })
    }
    return json(res, 404, NOT_FOUND)
  }

  async function handle(req, res) {
    // A request pipelined behind one already refused and closing is not answered.
    if (lingering(req)) return req.socket.destroy()
    secure(res, https)
    if (req.headers.host !== originHost) return json(res, 421, { error: 'wrong_host' })
    const url = new URL(req.url ?? '/', cfg.origin)
    const p = url.pathname
    const api = p.startsWith('/api/') || p.startsWith('/oc/')
    const site = req.headers['sec-fetch-site']
    if (api && site && site !== 'same-origin' && site !== 'none') return json(res, 403, { error: 'cross_site' })
    const writes = req.method !== 'GET' && req.method !== 'HEAD'
    if (writes && req.headers.origin !== cfg.origin) return json(res, 403, { error: 'wrong_origin' })

    if (p === '/api/health') return json(res, 200, { ok: true })
    // A page Ola built, under its grant (views.mjs): no cookie is needed or wanted here.
    if (p.startsWith('/v/')) return views.serve(req, res, p)

    // ---------------------------------------------- sign-in (no session yet)
    if (p.startsWith('/api/auth/')) {
      if (req.method !== 'POST') return json(res, 405, { error: 'method' })
      const body = await readJson(req)
      if (!body) return json(res, 400, { error: 'bad_json' })
      if (!auth.allow(p.slice('/api/auth/'.length), clientOf(req), body)) return json(res, 429, { error: 'slow_down', message: 'Too many tries. Wait a minute and try again.' }, { 'retry-after': '60' })
      let r
      if (p === '/api/auth/register/options') r = await auth.registerOptions(body.invite)
      else if (p === '/api/auth/register/verify') r = await auth.registerVerify(body.ceremony, body.response)
      else if (p === '/api/auth/login/options') r = await auth.loginOptions()
      else if (p === '/api/auth/login/verify') r = await auth.loginVerify(body.ceremony, body.response)
      else return json(res, 404, NOT_FOUND)
      return json(res, r.status, r.body, r.cookie ? { 'set-cookie': r.cookie } : {})
    }

    // ---------------------------------------------- signed in
    if (api) {
      const sess = auth.session(req)
      if (!sess) return json(res, 401, { error: 'signed_out', message: 'You are signed out. Sign in again with your passkey.' }, { 'set-cookie': auth.clearCookie })
      if (writes && !auth.csrfOk(sess, req)) return json(res, 403, { error: 'csrf', message: 'Reload the page and try again.' })
      seen(sess.personId)
      if (p === '/api/me' && req.method === 'GET') {
        const list = db
          .prepare(
            `SELECT w.slug, w.name, t.name AS team, m.role FROM memberships m JOIN teams t ON t.id = m.team_id JOIN workspaces w ON w.team_id = t.id
             WHERE m.person_id = ? AND w.status = 'active' ORDER BY w.name`,
          )
          .all(sess.personId)
        return json(res, 200, { person: { handle: sess.handle, name: sess.name }, csrf: sess.csrf, workspaces: list, machine: { working: working(), capacity: cfg.capacity }, policy: { deleteNotice: cfg.deleteNotice, maxUpload: cfg.maxUpload, searchProvider: cfg.searchProvider }, notices: auth.notices(sess) })
      }
      // "Open" on a page: a navigation from the app (same-origin, so the Strict cookie came along).
      if (p === '/api/open' && req.method === 'GET') return views.open(req, res, sess, url)
      if (p === '/api/signout' && req.method === 'POST') {
        auth.signOut(sess)
        return json(res, 200, { ok: true }, { 'set-cookie': auth.clearCookie })
      }
      return await workspaceRoute(req, res, sess, url, p)
    }

    // ---------------------------------------------- the page
    // Only the built app. Nothing a workspace made is ever served from this origin: a site or
    // preview the agent builds gets its own origin (see README, "The preview origin").
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' })
    let rel = '/'
    try {
      rel = decodeURIComponent(p)
    } catch {}
    let file = path.join(cfg.dist, path.normalize(rel).replace(/^([/\\])+/, ''))
    if (!file.startsWith(cfg.dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(cfg.dist, 'index.html')
    const type = TYPES[path.extname(file)]
    if (!type) return json(res, 404, NOT_FOUND)
    res.writeHead(200, {
      'content-type': type,
      'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-store',
      'content-security-policy': CSP_PAGE + (https ? '; upgrade-insecure-requests' : ''),
    })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }

  // Headers whole within 5 s and at most 8 KiB; an idle kept-alive connection closes after 5 s;
  // a body not wanted is not read (json() above). requestTimeout stays long for an upload that
  // passed sign-in, which has its own minimum rate.
  const server = http.createServer({ requestTimeout: 15 * 60_000, headersTimeout: 5_000, keepAliveTimeout: 5_000, maxHeaderSize: 8 * 1024, connectionsCheckingInterval: 1_000 }, (req, res) => {
    handle(req, res).catch((e) => {
      log(`error (${e?.code ?? e?.name ?? 'error'})`)
      if (res.headersSent) res.destroy()
      else if (['MACHINE_BUSY', 'CLOSED', 'START_FAILED'].includes(e?.code)) startRefused(res, e)
      else json(res, 500, { error: 'server_error', message: 'Ola’s computer could not do that just now. Nothing was changed.' })
    })
  })
  server.maxConnections = 512

  // At most connectionsPerAddress open connections from one client address.
  const perAddr = new Map()
  const admit = (sock, addr) => {
    if ((perAddr.get(addr) ?? 0) >= cfg.connectionsPerAddress) return sock.destroy(), false
    bump(perAddr, addr, 1)
    sock.once('close', () => (bump(perAddr, addr, -1), perAddr.get(addr) <= 0 && perAddr.delete(addr)))
    return true
  }
  // What the front desk listens with: the HTTP server itself, or (OLA_FD_PROXY_PROTOCOL=1) a TCP
  // server that reads the relay's PROXY v1 line ("PROXY TCP4 <client> <us> <port> <port>\r\n"),
  // notes the client's address, and hands the connection to the HTTP server.
  let listener = server
  if (cfg.proxyProtocol) {
    listener = net.createServer({ pauseOnConnect: true, allowHalfOpen: false }, (sock) => {
      let head = Buffer.alloc(0)
      const timer = setTimeout(() => sock.destroy(), 5_000)
      const onData = (d) => {
        head = Buffer.concat([head, d])
        const nl = head.indexOf('\r\n')
        // The spec's longest v1 line is 107 bytes with its CRLF; anything longer is refused.
        if (nl < 0 ? head.length > 107 : nl > 105) return clearTimeout(timer), sock.destroy()
        if (nl < 0) return
        clearTimeout(timer)
        sock.off('data', onData)
        sock.pause()
        const m = /^PROXY (TCP4|TCP6) (\S{2,45}) (\S{2,45}) (\d{1,5}) (\d{1,5})$/.exec(head.subarray(0, nl).toString('latin1'))
        const fam = m && (m[1] === 'TCP4' ? 4 : 6)
        if (!m || net.isIP(m[2]) !== fam || net.isIP(m[3]) !== fam || +m[4] > 65535 || +m[5] > 65535) return sock.destroy()
        // Limited by its key: an IPv6 client by its /64 (auth.mjs addressKey).
        sock.olaClient = addressKey(m[2])
        if (!admit(sock, sock.olaClient)) return
        const rest = head.subarray(nl + 2)
        if (rest.length) sock.unshift(rest)
        // The HTTP parser must read through the stream (where the rest of the first chunk was put
        // back), not straight from the handle.
        if (sock._handle) sock._handle._consumed = true
        server.emit('connection', sock)
        sock.resume()
      }
      sock.on('data', onData)
      sock.on('error', () => sock.destroy())
      sock.resume()
    })
    listener.maxConnections = 512
    // The HTTP server never listens itself here, and Node starts its header and request timeouts
    // (headersTimeout, requestTimeout, checked each connectionsCheckingInterval) on its 'listening'
    // event: without this, behind the PROXY protocol a client could send its headers one byte at a
    // time for as long as it liked (second review, 2026-11-16: still open after 12 s, against a
    // 408 at 6 s without the PROXY protocol). Refuse to start if that hook is not where it was.
    if (!server.listeners('listening').some((f) => f.name === 'setupConnectionsTracking')) throw new Error('this Node does not start HTTP timeouts on listening; the PROXY protocol mode needs review')
    listener.once('listening', () => server.emit('listening'))
  } else server.on('connection', (sock) => admit(sock, addressKey(sock.remoteAddress)))
  return { server, listener, db, cfg, workspaces, views, claude, hosted, jobs, close: () => (jobs.close(), claude.close(), hosted.close(), workspaces.close(), web.close(), listener.close(), listener !== server && server.close(), db.close()) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fd = makeFrontDesk()
  fd.listener.listen(fd.cfg.port, fd.cfg.host, () => console.log(JSON.stringify({ t: new Date().toISOString(), event: 'start', origin: fd.cfg.origin, port: fd.listener.address().port, proxyProtocol: fd.cfg.proxyProtocol, idleStopMin: fd.cfg.idleStopMs / 60_000, runCeilingMin: fd.cfg.runCeilingMs / 60_000 })))
  const stop = () => (fd.close(), process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

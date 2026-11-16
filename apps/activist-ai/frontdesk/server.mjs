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
// Things the agent builds (sites, previews) are never served from this origin; see README.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audit, nameRef, openDb, loadKeys } from './db.mjs'
import { makeAuth } from './auth.mjs'
import { makeWorkspaces } from './workspaces.mjs'
import { routeNeed } from '../web/server/proxy.mjs'
import { validName } from '../web/server/files.mjs'
import { derivedThings } from '../web/server/project.mjs'

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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' }

// How often a request that stays open rechecks its session and membership (see `hold`).
const RECHECK_MS = Math.max(250, Number(process.env.OLA_FD_RECHECK_MS) || 1000)
// A reply sent before the request's body was read (a 401, a refusal, a 413) closes the
// connection: otherwise Node keeps reading a body nobody wants, and a slow sender held the socket
// for up to 15 minutes after its 401 (review of 2026-11-16, M2).
const json = (res, status, body, extra = {}) => {
  const req = res.req
  if (req && !req.complete) {
    extra = { ...extra, connection: 'close' }
    res.once('finish', () => req.socket?.destroy())
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }).end(JSON.stringify(body))
}
const NOT_FOUND = { error: 'not_found', message: 'That is not here, or it is not yours to open.' }

async function readJson(req, max = 64 * 1024, ms = 10_000) {
  let size = 0
  const chunks = []
  // A small JSON body, whole within ms, or nothing: a trickled body does not hold the socket.
  const timer = setTimeout(() => req.destroy(), ms)
  try {
    for await (const c of req) {
      size += c.length
      if (size > max) return null
      chunks.push(c)
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
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
  const workspaces = makeWorkspaces({ db, keys, log, idleStopMs: cfg.idleStopMs, runCeilingMs: cfg.runCeilingMs })
  const clientOf = (req) => req.socket.olaClient ?? req.socket.remoteAddress ?? '?'

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
  const flights = { person: new Map(), uploads: new Map(), ws: new Map(), bytes: 0 }
  const T = cfg.transfers
  const bump = (m, k, d) => m.set(k, (m.get(k) ?? 0) + d)
  function takeSlot(personId, slug, { upload = false, bytes = 0 } = {}) {
    if ((flights.person.get(personId) ?? 0) >= T.perPerson || (upload && (flights.uploads.get(personId) ?? 0) >= T.uploadsPerPerson) || (flights.ws.get(slug) ?? 0) >= T.perWorkspace || flights.bytes + bytes > T.bytes) return null
    bump(flights.person, personId, 1)
    bump(flights.ws, slug, 1)
    if (upload) bump(flights.uploads, personId, 1)
    flights.bytes += bytes
    let held = bytes
    let done = false
    return {
      /** Adds bytes once they are known (a download's size); false if that is over the total. */
      grow(n) {
        if (flights.bytes + n > T.bytes) return false
        flights.bytes += n
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
      },
    }
  }
  const tooMany = { error: 'too_many_transfers', message: 'Several transfers are already under way. Wait for one to finish, then try again.' }

  const membership = (personId, slug) =>
    typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)
      ? db
          .prepare(
            `SELECT w.id, w.slug, w.name, t.name AS team, m.role FROM workspaces w JOIN teams t ON t.id = w.team_id
             JOIN memberships m ON m.team_id = w.team_id WHERE m.person_id = ? AND w.slug = ? AND w.status = 'active'`,
          )
          .get(personId, slug)
      : undefined

  const shas = new Map() // `${slug}\0${path}` -> sha256, as ola-files last said
  const MAX_LISTED = 1000

  /** The workspace's files as the page sees them: plain files, hidden folders left out. */
  async function fileEntries(ws) {
    const list = await workspaces.filesAsync(ws.slug)
    const up = new Map(db.prepare('SELECT name_ref, at FROM uploads WHERE workspace_id = ?').all(ws.id).map((r) => [Buffer.from(r.name_ref).toString('hex'), r.at]))
    const out = []
    for (const f of list) {
      if (f.type !== 'file' || f.path.split('/').some((p) => p.startsWith('.') || p === 'node_modules' || p === '__pycache__') || !workspaces.validRel(f.path)) continue
      const at = up.get(nameRef(keys, ws.id, f.path).toString('hex'))
      out.push({ path: f.path, size: f.size, modified: new Date((f.mtime ?? 0) * 1000).toISOString(), origin: at ? 'uploaded' : 'made', uploaded: at ? new Date(at).toISOString() : null })
      shas.set(`${ws.slug}\0${f.path}`, f.sha256)
      if (shas.size > 20_000) shas.clear()
    }
    out.sort((a, b) => (a.origin === b.origin ? a.path.localeCompare(b.path) : a.origin === 'uploaded' ? -1 : 1))
    return out
  }
  // The things on the project view: the 12 newest .csv/.md files Ola made at the top of the
  // folder, each at most 1 MiB, read 32 KiB each in ONE `container exec`, and cached by sha256
  // so an unchanged file is not read again (review of 2026-11-16, M4: one exec per file, every
  // page load, unbounded).
  const MAX_THINGS = 12
  const texts = new Map() // `${slug}\0${path}\0${sha}` -> text
  async function madeThings(ws, entries) {
    const picks = entries
      .filter((f) => f.origin === 'made' && !f.path.includes('/') && /\.(csv|md)$/.test(f.path) && f.size <= 1024 * 1024)
      .sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path))
      .slice(0, MAX_THINGS)
    const key = (f) => `${ws.slug}\0${f.path}\0${shas.get(`${ws.slug}\0${f.path}`) ?? '?'}`
    const missing = picks.filter((f) => !texts.has(key(f)))
    if (missing.length) {
      const got = await workspaces.peek(ws.slug, missing.map((f) => f.path), 32 * 1024)
      if (texts.size > 2000) texts.clear()
      for (const f of missing) if (got.has(f.path)) texts.set(key(f), got.get(f.path).toString('utf8'))
    }
    return derivedThings({ list: async () => picks, readText: async (rel) => texts.get(key(picks.find((f) => f.path === rel))) ?? null })
  }

  async function workspaceRoute(req, res, sess, url, p) {
    const slug = req.headers['x-ola-workspace'] ?? (req.method === 'GET' ? url.searchParams.get('w') : null)
    const ws = membership(sess.personId, slug)
    if (!ws) return json(res, 404, NOT_FOUND)
    const canRun = ws.role === 'owner' || ws.role === 'member'
    const readOnly = { error: 'read_only', message: 'You can read this project, but not change it or ask Ola to work in it. Ask its owner if you need more.' }

    // A request that stays open (the event stream above all, also a download) is checked again
    // while it runs: removal from the team, sign-out, revocation, suspension, expiry or the idle
    // limit cuts it within RECHECK_MS. Checked once at the start only, a removed member's or a
    // thief's open stream kept receiving every event of the workspace (review of 2026-11-16, H1).
    const hold = () => {
      const timer = setInterval(() => {
        if (auth.stillValid(sess) && membership(sess.personId, ws.slug)) return
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
      await workspaces.ensureRunning(ws.slug)
      hold()
      return workspaces.forward(ws.slug, ws.id, sess.personId, req, res, p.slice(3), url.search)
    }

    if (p === '/api/project' && req.method === 'GET') {
      // A workspace that is not running is started; if that takes longer than wakeWaitMs the page
      // hears "waking" and asks again, instead of waiting on one long request or showing an error.
      if (!workspaces.isReady(ws.slug)) {
        const waking = workspaces.ensureRunning(ws.slug)
        waking.catch(() => {})
        const done = await Promise.race([waking.then(() => true, (e) => e), new Promise((r) => setTimeout(() => r(false), cfg.wakeWaitMs))])
        if (done === false) return json(res, 503, { error: 'waking', message: 'Waking your workspace…' }, { 'retry-after': '1' })
        if (done !== true) return json(res, 503, { error: 'machine_busy', message: 'Ola’s computer is running as many projects as it can just now. Try again in a few minutes.' }, { 'retry-after': '60' })
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
        role: ws.role,
      })
    }
    // Runs stopped at the ceiling (the page asks when a run is interrupted, to say why), from the
    // front desk's memory: no exec, does not wake the workspace, is not use.
    if (p === '/api/runs' && req.method === 'GET') return json(res, 200, workspaces.runsOf(ws.slug))
    // Every other route runs at least one `container exec`: one transfer slot each.
    const upload = p === '/api/files' && req.method === 'POST'
    let slot = null
    if (upload) {
      if (!canRun) return json(res, 403, readOnly)
      const name = url.searchParams.get('name') ?? ''
      if (!validName(name)) return json(res, 400, { error: 'bad_name', message: 'The file name has characters Ola does not accept. Rename it with letters, digits and spaces.' })
      const declared = Number(req.headers['content-length'] ?? NaN)
      if (!Number.isSafeInteger(declared) || declared < 0) return json(res, 411, { error: 'length_required', message: 'The upload did not say its size. Try again from the page.' })
      if (declared > cfg.maxUpload) return json(res, 413, { error: 'too_large', message: `The file is larger than ${cfg.maxUpload / 1024 / 1024} MB.` })
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

  async function transfer(req, res, sess, ws, url, p, canRun, readOnly, slot, hold) {
    if (p === '/api/files' && req.method === 'GET') {
      const files = await fileEntries(ws)
      return json(res, 200, { files: files.slice(0, MAX_LISTED), ...(files.length > MAX_LISTED ? { more: files.length - MAX_LISTED } : {}) })
    }
    if (p === '/api/files' && req.method === 'POST') {
      const name = url.searchParams.get('name') ?? ''
      const tooBig = { error: 'too_large', message: `The file is larger than ${cfg.maxUpload / 1024 / 1024} MB.` }
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
      return json(res, 201, { path: name, size: got.size, sha256: got.sha256 })
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
        try {
          for await (const c of f.stream) {
            sha.update(c)
            sent += c.length
            if (!res.write(c)) await new Promise((r) => (res.once('drain', r), res.once('close', r)))
            if (res.destroyed) break
          }
          res.end()
        } catch {
          res.destroy()
        } finally {
          f.kill()
        }
        const whole = sent === f.size && !res.destroyed
        audit(db, { actor: sess.personId, action: 'file_downloaded', workspace: ws.id, nameRef: ref, sha256: whole ? sha.digest('hex') : null, size: sent, ok: whole })
        return
      }
      if (req.method === 'DELETE') {
        if (!canRun) return json(res, 403, readOnly)
        if (!(await workspaces.removeFile(ws.slug, rel))) return json(res, 404, NOT_FOUND)
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
        return json(res, 200, { person: { handle: sess.handle, name: sess.name }, csrf: sess.csrf, workspaces: list, machine: { working: working(), capacity: cfg.capacity }, policy: { deleteNotice: cfg.deleteNotice }, notices: auth.notices(sess) })
      }
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
      if (!res.headersSent) json(res, e?.code === 'START_FAILED' ? 503 : 500, { error: 'server_error', message: 'Ola’s computer could not do that just now. Nothing was changed.' })
      else res.destroy()
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
        if (nl < 0) return head.length > 107 ? (clearTimeout(timer), sock.destroy()) : undefined
        clearTimeout(timer)
        sock.off('data', onData)
        sock.pause()
        const m = /^PROXY (TCP4|TCP6) (\S+) (\S+) (\d{1,5}) (\d{1,5})$/.exec(head.subarray(0, nl).toString('latin1'))
        if (!m || net.isIP(m[2]) !== (m[1] === 'TCP4' ? 4 : 6)) return sock.destroy()
        sock.olaClient = m[2]
        if (!admit(sock, m[2])) return
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
  } else server.on('connection', (sock) => admit(sock, sock.remoteAddress ?? '?'))
  return { server, listener, db, cfg, workspaces, close: () => (workspaces.close(), listener.close(), listener !== server && server.close(), db.close()) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fd = makeFrontDesk()
  fd.listener.listen(fd.cfg.port, fd.cfg.host, () => console.log(JSON.stringify({ t: new Date().toISOString(), event: 'start', origin: fd.cfg.origin, port: fd.listener.address().port, proxyProtocol: fd.cfg.proxyProtocol, idleStopMin: fd.cfg.idleStopMs / 60_000, runCeilingMin: fd.cfg.runCeilingMs / 60_000 })))
  const stop = () => (fd.close(), process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

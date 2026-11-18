// The front desk's side of a sealed workspace: start it, reach its opencode through its desk
// socket (workspace/desk.mjs) with the password only this process reads, and move files with the
// workspace tools (ola-put, ola-get, ola-rm, ola-files, through workspace/ws.mjs).
//
// Everything that comes back from a workspace is the workspace's word: the agent can replace
// opencode on its own loopback. Replies are typed and capped by the proxy; file lists are parsed
// strictly by ws.mjs; no host path is ever built from anything the workspace says.
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ws from '../workspace/ws.mjs'
import { makeProxy, opencodeCall } from '../web/server/proxy.mjs'
import { audit, nameRef } from './db.mjs'
import { webRequests } from '../web/server/webask.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WS_CLI = path.join(HERE, '../workspace/ws.mjs')
// The most of one opencode reply the front desk reads (oc below): most replies, and a conversation's
// message list, which a long run's tool steps make large (OLA-131).
export const OC_MAX = 256 * 1024
export const MESSAGES_MAX = 32 * 1024 * 1024
const MESSAGES = /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/message(\?|$)/
// The desk takes 16 connections per workspace; keep a few for ws.mjs's own checks.
const MAX_SOCKETS = 12
// "Read by a run" rows a prompt may add (see watch).
const READS_PER_PROMPT = 200
// A run the front desk interrupted at the ceiling that its workspace still reports as running this
// long after: no longer activity (a stuck or lying opencode does not hold the VM).
const CANCEL_GRACE_MS = 60_000
// What the page shows on a run stopped at the ceiling (GET /api/runs).
export const ceilingMessage = (minutes) =>
  `Ola stopped this after ${minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : minutes < 1 ? `${Math.round(minutes * 60)} seconds` : `${Math.round(minutes * 10) / 10} minutes`}: that is the longest one request may run, so that no request can hold Ola’s computer for good. What it finished is in the folder. Ask again to carry on, in smaller steps.`

export function makeWorkspaces({ db, keys, log, idleStopMs = 30 * 60_000, runCeilingMs = 120 * 60_000, cancelGraceMs = CANCEL_GRACE_MS, webModeOf = () => 'ask' }) {
  const ready = new Map() // slug -> time it last answered
  const starting = new Map() // slug -> Promise
  const refused = new Map() // slug -> { e, at }: the last start refused, for 2 s
  const stopping = new Map() // slug -> Promise
  const agents = new Map()
  const proxies = new Map()
  const watchers = new Map()
  const runBy = new Map() // `${slug}:${sessionID}` -> person id of the last prompt
  const lastUse = new Map() // slug -> time of the last request a person made to it
  const busy = new Map() // slug -> transfers in flight (an upload or download keeps it awake)
  const asleep = new Set() // stopped for idleness here; its event stream does not wake it
  const secretsSeen = new Map() // slug -> the secrets file's mtime when the connections were made
  const runs = new Map() // slug -> Map(sessionID -> { since, cancelledAt }): sessions seen executing
  const lastRun = new Map() // slug -> the last time a session in it was seen executing
  const prompted = new Map() // `${slug}:${sessionID}` -> when a person's prompt for it last went through
  // "Yes, for the rest of this conversation", kept here: `${slug}:${sessionID}` -> Set of opencode
  // actions the person allowed for that conversation. opencode 2.3.0's own "always" saves a durable
  // project-wide allow rule (it outlived the conversation and a restart: review 4, H2), so opencode
  // is only ever told "once", and the watcher answers a later question of the same action in the
  // same conversation "once" by itself. Never a web search or download (web.mjs has its own).
  const forConversation = new Map()
  const ended = new Map() // `${slug}:${sessionID}` -> when its event stream last said a run ended
  const ceilingStops = new Map() // `${slug}:${sessionID}` -> { at, minutes }, for the page (24 h)
  // slug -> when a person's prompt in it last went through. From the audit log at start, so a front
  // desk restart does not hand a run a fresh ceiling (second review, 2026-11-16).
  const lastPrompt = new Map(db.prepare("SELECT w.slug, max(a.at) AS at FROM audit a JOIN workspaces w ON w.id = a.workspace_id WHERE a.action = 'run_started' GROUP BY w.slug").all().map((r) => [r.slug, r.at]))

  const run = (cmd, slug) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [WS_CLI, cmd, slug], { stdio: ['ignore', 'ignore', 'pipe'], env: process.env })
      let err = ''
      child.stderr.on('data', (d) => (err = (err + d).slice(-500)))
      // A full machine and a closed workspace are told apart (ws.mjs EXIT), so the page can say so.
      const why = (code) => (code === ws.EXIT.MACHINE_FULL ? 'MACHINE_BUSY' : code === ws.EXIT.CLOSED ? 'CLOSED' : 'START_FAILED')
      child.on('close', (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(err.trim() || `ws ${cmd} exited ${code}`), { code: why(code) }))))
    })

  // After a rotation (a member removed) the password changed and the container was made again:
  // drop the pooled connections and the watcher made with the old one. A rotation under way
  // (secrets.env.next) counts as a change too, so nothing is reused across it.
  function fresh(slug) {
    let m = 0
    for (const f of [ws.paths(slug).secrets, ws.paths(slug).next])
      try {
        m += statSync(f).mtimeMs
      } catch {}
    if (secretsSeen.has(slug) && secretsSeen.get(slug) !== m) reset(slug)
    secretsSeen.set(slug, m)
  }
  function reset(slug) {
    ready.delete(slug)
    watchers.get(slug)?.req?.destroy()
    agents.get(slug)?.destroy()
    agents.delete(slug)
    proxies.delete(slug)
  }

  /** Starts the workspace if it is not running (ws.mjs start is idempotent), at most once at a time. */
  async function ensureRunning(slug) {
    fresh(slug)
    lastUse.set(slug, Date.now())
    asleep.delete(slug)
    if (Date.now() - (ready.get(slug) ?? 0) < 30_000) return
    if (stopping.has(slug)) await stopping.get(slug).catch(() => {})
    // A start refused a moment ago (a full machine, a closed workspace) is the answer for the next
    // ask too: a wake that took longer than the page waits was only ever heard as "waking".
    const f = refused.get(slug)
    if (!starting.has(slug) && f && Date.now() - f.at < 2000) throw f.e
    if (!starting.has(slug)) {
      const p = run('start', slug)
        .then(() => (ready.set(slug, Date.now()), refused.delete(slug)), (e) => (refused.set(slug, { e, at: Date.now() }), Promise.reject(e)))
        .finally(() => starting.delete(slug))
      starting.set(slug, p)
    }
    return starting.get(slug)
  }
  const forget = (slug) => ready.delete(slug)
  const isReady = (slug) => Date.now() - (ready.get(slug) ?? 0) < 30_000
  const isAsleep = (slug) => asleep.has(slug)
  /** An upload or download under way: the workspace is not stopped for idleness meanwhile. */
  function holdBusy(slug) {
    busy.set(slug, (busy.get(slug) ?? 0) + 1)
    let done = false
    return () => {
      if (done) return
      done = true
      busy.set(slug, busy.get(slug) - 1)
      lastUse.set(slug, Date.now())
    }
  }

  // -------------------------------------------------------------- idle stop and the run ceiling
  //
  // A workspace no one has made a request to for idleStopMs (OLA_FD_IDLE_STOP_MIN, 30 minutes),
  // with no transfer under way and no run executing in it, is stopped: an idle VM keeps the memory
  // it once used (Apple's documented limit). An open event stream is not use: a tab left open all
  // night does not hold a VM. Opening the project starts it again (the page says "Waking your
  // workspace…"). Its event stream alone does not wake it.
  //
  // A run is activity. Each sweep asks the workspace's opencode, through its desk, which sessions
  // are executing (GET /api/session/active); while one is, the workspace is not stopped, and idle
  // time counts from the later of the last request and the last sweep that saw a run. Before, a
  // run that went past the idle limit with no new request from the browser was stopped mid-task.
  //
  // The ceiling (OLA_FD_RUN_CEILING_MIN, 2 hours): a session executing for that long without a
  // break is interrupted through opencode's own interrupt route, and the page is told why (GET
  // /api/runs). The clock starts when a sweep first sees the session executing, or at the person's
  // prompt that followed the end of its last run; the workspace's event stream alone can never
  // restart it (that stream is the workspace's word). A session still reported as executing a
  // minute after its interrupt no longer counts as activity, so the idle stop ends it.
  async function active(slug) {
    return new Promise((resolve) => {
      let auth
      try {
        auth = authorization(slug)()
      } catch {
        return resolve(null)
      }
      const req = http.request({ socketPath: ws.paths(slug).opencode, agent: agentFor(slug), path: '/api/session/active', headers: { authorization: auth, accept: 'application/json' }, timeout: 10_000 }, (res) => {
        let t = ''
        res.setEncoding('utf8')
        res.on('data', (d) => {
          t += d
          if (t.length > 256 * 1024) req.destroy()
        })
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(null)
          try {
            const data = JSON.parse(t)?.data
            if (!data || typeof data !== 'object' || Array.isArray(data)) return resolve(null)
            resolve(new Set(Object.keys(data).filter((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id) && data[id]?.type === 'running').slice(0, 200)))
          } catch {
            resolve(null)
          }
        })
        res.on('error', () => resolve(null))
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => req.destroy())
      req.end()
    })
  }
  function interrupt(slug, sessionID) {
    return new Promise((resolve) => {
      let auth
      try {
        auth = authorization(slug)()
      } catch {
        return resolve(0)
      }
      const req = http.request({ socketPath: ws.paths(slug).opencode, agent: agentFor(slug), method: 'POST', path: `/api/session/${sessionID}/interrupt`, headers: { authorization: auth, 'content-length': '0' }, timeout: 10_000 }, (res) => (res.resume(), resolve(res.statusCode)))
      req.on('error', () => resolve(0))
      req.on('timeout', () => req.destroy())
      req.end()
    })
  }
  /** Folds what opencode says is executing into `runs`; returns how many count as activity. */
  //
  // The ceiling also holds for the whole workspace (second review, 2026-11-16: a hostile opencode
  // that names a new session id at every sweep was never interrupted and never stopped, and held a
  // VM slot for good with no one using it; a run's subagent sessions have new ids too). Runs count
  // as activity only up to the ceiling after the last prompt a PERSON sent in that workspace; past
  // that, whatever still says it is executing is interrupted (at most 20 a sweep) and the idle stop
  // applies as if nothing ran.
  function track(slug, now, executing) {
    if (!runs.has(slug)) runs.set(slug, new Map())
    const mine = runs.get(slug)
    if (!executing) return mine.clear(), 0 // no answer: nothing is executing there that anyone can see
    for (const id of mine.keys()) if (!executing.has(id)) mine.delete(id)
    const minutes = Math.round((runCeilingMs / 60_000) * 100) / 100
    if (runCeilingMs > 0 && now > (lastPrompt.get(slug) ?? 0) + runCeilingMs + cancelGraceMs + sweepMs) {
      let sent = 0
      for (const id of executing) {
        let r = mine.get(id)
        if (!r) mine.set(id, (r = { since: now, cancelledAt: 0 }))
        if (r.cancelledAt || sent >= 20) continue
        sent++
        r.cancelledAt = now
        if (ceilingStops.size >= 500) ceilingStops.delete(ceilingStops.keys().next().value)
        ceilingStops.set(`${slug}:${id}`, { at: now, minutes })
        interrupt(slug, id).then((status) => log(`${slug}: a run went past the ${minutes} min ceiling after the last prompt and was interrupted (${status})`))
      }
      return 0
    }
    let counting = 0
    for (const id of executing) {
      const key = `${slug}:${id}`
      let r = mine.get(id)
      if (!r) mine.set(id, (r = { since: now, cancelledAt: 0 }))
      else if ((ended.get(key) ?? 0) > r.since && (prompted.get(key) ?? 0) > (ended.get(key) ?? 0)) Object.assign(r, { since: prompted.get(key), cancelledAt: 0 })
      if (runCeilingMs > 0 && !r.cancelledAt && now - r.since >= runCeilingMs) {
        r.cancelledAt = now
        if (ceilingStops.size >= 500) ceilingStops.delete(ceilingStops.keys().next().value)
        ceilingStops.set(key, { at: now, minutes }) // before the interrupt, so the page finds it
        interrupt(slug, id).then((status) => log(`${slug}: a run reached the ${minutes} min ceiling and was interrupted (${status})`))
      }
      if (r.cancelledAt && now - r.cancelledAt > cancelGraceMs) continue
      counting++
    }
    return counting
  }
  let sweeping = false
  async function sweep() {
    if (sweeping) return
    sweeping = true
    try {
      for (const slug of [...lastUse.keys()]) {
        if (starting.has(slug) || stopping.has(slug) || asleep.has(slug)) continue
        const now = Date.now()
        const counting = track(slug, now, await active(slug))
        if (counting > 0) {
          lastRun.set(slug, now)
          const w = watchers.get(slug)
          if (w) w.until = Math.max(w.until, now + 15 * 60_000) // "read by a run" keeps watching a long run
          continue
        }
        const at = Math.max(lastUse.get(slug) ?? 0, lastRun.get(slug) ?? 0)
        if (idleStopMs <= 0 || now - at < idleStopMs || (busy.get(slug) ?? 0) > 0 || starting.has(slug) || stopping.has(slug) || asleep.has(slug)) continue
        asleep.add(slug)
        reset(slug)
        const p = run('stop', slug)
          .then(() => log(`${slug}: stopped after ${Math.round((now - at) / 60_000)} min idle`))
          .catch((e) => (asleep.delete(slug), log(`${slug}: idle stop failed (${e.code ?? 'error'})`)))
          .finally(() => stopping.delete(slug))
        stopping.set(slug, p)
      }
      const old = Date.now() - 24 * 3600_000
      for (const [k, v] of ceilingStops) if (v.at < old) ceilingStops.delete(k)
      for (const m of [prompted, ended]) if (m.size > 5000) m.clear()
    } finally {
      sweeping = false
    }
  }
  // Every workspace the platform knows counts as just used when the front desk starts, so one left
  // running across a restart is stopped after the same idle time.
  for (const w of db.prepare("SELECT slug FROM workspaces WHERE status = 'active'").all()) lastUse.set(w.slug, Date.now())
  const sweepMs = Math.max(1000, Math.min(60_000, Math.min(idleStopMs > 0 ? idleStopMs : Infinity, runCeilingMs > 0 ? runCeilingMs : Infinity) / 4))
  const sweeper = idleStopMs > 0 || runCeilingMs > 0 ? setInterval(sweep, sweepMs) : null
  sweeper?.unref()

  function agentFor(slug) {
    if (!agents.has(slug)) agents.set(slug, new http.Agent({ keepAlive: true, maxSockets: MAX_SOCKETS, maxFreeSockets: 2, timeout: 120_000 }))
    return agents.get(slug)
  }
  // The password is read from the workspace's secrets file (mode 600) on each request, so a
  // rotated password takes effect without a restart. It is never sent to the browser.
  const authorization = (slug) => () => `Basic ${Buffer.from(`opencode:${ws.secrets(slug).OPENCODE_PASSWORD}`).toString('base64')}`

  function proxyFor(slug, workspaceId) {
    if (!proxies.has(slug)) {
      proxies.set(
        slug,
        makeProxy({
          socketPath: ws.paths(slug).opencode,
          agent: agentFor(slug),
          authorization: authorization(slug),
          work: '/work',
          webMode: () => webModeOf(slug),
          log: (m) => {
            forget(slug)
            log(`${slug}: ${m}`)
          },
          onForward: ({ method, pathname }) => {
            const m = /^\/api\/session\/([A-Za-z0-9_-]{1,80})\/prompt$/.exec(pathname)
            if (method === 'POST' && m) watch(slug, workspaceId)
          },
        }),
      )
    }
    return proxies.get(slug)
  }

  /** What is recorded for a person's prompt: who started the run, its clock, the audit row. */
  function notePrompt(slug, workspaceId, personId, sessionID) {
    runBy.set(`${slug}:${sessionID}`, personId)
    prompted.set(`${slug}:${sessionID}`, Date.now())
    lastPrompt.set(slug, Date.now())
    audit(db, { actor: personId, action: 'run_started', workspace: workspaceId })
  }

  /** Forwards one page request to the workspace's opencode; records who started a run. */
  async function forward(slug, workspaceId, personId, req, res, pathname, search) {
    fresh(slug)
    const m = /^\/api\/session\/([A-Za-z0-9_-]{1,80})\/prompt$/.exec(pathname)
    if (req.method === 'POST' && m) notePrompt(slug, workspaceId, personId, m[1])
    return proxyFor(slug, workspaceId)(req, res, pathname, search)
  }

  /**
   * One request to the workspace's opencode from the front desk itself, never from the page (the
   * hosted model's run: switching a session's model, its prompt). Resolves { status, json }; the
   * reply is the workspace's word, capped and only parsed. A conversation's message list is capped
   * far higher than the rest (OLA-131): a design run's list passed 256 KB, the one cap there was,
   * and the cut reply read as "that request is not in this conversation", so "Just this once" on
   * Compare with Claude was refused. A reply cut at its cap resolves { status: 0, json: null, cut: true }.
   */
  function oc(slug, method, pathname, body = null, max = MESSAGES.test(pathname) ? MESSAGES_MAX : OC_MAX) {
    return new Promise((resolve) => {
      let auth
      try {
        auth = authorization(slug)()
      } catch {
        return resolve({ status: 0, json: null })
      }
      const data = body === null ? null : Buffer.from(JSON.stringify(body))
      const headers = { authorization: auth, accept: 'application/json', ...(data ? { 'content-type': 'application/json', 'content-length': String(data.length) } : { 'content-length': '0' }) }
      let cut = false
      const req = http.request({ socketPath: ws.paths(slug).opencode, agent: agentFor(slug), method, path: pathname, headers, timeout: 20_000 }, (res) => {
        let t = ''
        res.setEncoding('utf8')
        res.on('data', (d) => {
          t += d
          if (t.length > max) {
            cut = true
            req.destroy()
          }
        })
        res.on('end', () => {
          let json = null
          try {
            json = t ? JSON.parse(t) : null
          } catch {}
          resolve({ status: res.statusCode ?? 0, json })
        })
        res.on('error', () => resolve({ status: 0, json: null }))
      })
      req.on('error', () => resolve({ status: 0, json: null, ...(cut ? { cut: true } : {}) }))
      req.on('timeout', () => req.destroy())
      req.end(data ?? undefined)
    })
  }

  // -------------------------------------------------------------- "read by a run"
  //
  // While a run may be going, the front desk keeps its own subscription to the workspace's event
  // stream and writes one audit row for each file opencode's `read` tool opens (by keyed name
  // hash). A shell command that reads a file is not seen here: it is recorded as the run itself.
  //
  // The stream is the workspace's word, and a hostile agent can answer on opencode's port with
  // as many forged `read` events as it likes (review of 2026-11-16, H2: 100,000 rows in 5 s, on
  // the host's shared disk). So: one row per file per watch, and at most READS_PER_PROMPT rows
  // per prompt a person sent (each new prompt allows that many more).
  function watch(slug, workspaceId) {
    const w = watchers.get(slug)
    if (w) return (w.until = Date.now() + 15 * 60_000), (w.budget = Math.min(w.budget + READS_PER_PROMPT, 4 * READS_PER_PROMPT))
    const state = { until: Date.now() + 15 * 60_000, names: new Map(), seen: new Set(), budget: READS_PER_PROMPT, req: null }
    watchers.set(slug, state)
    const req = http.request({ socketPath: ws.paths(slug).opencode, agent: agentFor(slug), path: '/api/event', headers: { authorization: authorization(slug)(), accept: 'text/event-stream' } }, (res) => {
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        buf += chunk
        if (buf.length > 4 * 1024 * 1024) buf = buf.slice(-1024 * 1024) // a huge event is not ours to keep
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (line.startsWith('data:')) onEvent(line.slice(5).trim())
        }
        if (Date.now() > state.until) req.destroy()
      })
      res.on('end', () => watchers.delete(slug))
    })
    state.req = req
    const timer = setInterval(() => Date.now() > state.until && req.destroy(), 60_000)
    req.on('close', () => (clearInterval(timer), watchers.delete(slug)))
    req.on('error', () => watchers.delete(slug))
    req.end()

    function onEvent(raw) {
      let ev
      try {
        ev = JSON.parse(raw)
      } catch {
        return
      }
      const d = ev?.data
      if (d && typeof d.sessionID === 'string' && d.sessionID.length <= 80 && /^session\.execution\.(succeeded|failed|interrupted)$/.test(ev.type)) {
        ended.set(`${slug}:${d.sessionID}`, Date.now())
        return
      }
      if (!d || typeof d.id !== 'string' || d.id.length > 120) return
      if (ev.type === 'permission.asked' && typeof d.sessionID === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(d.sessionID) && /^[A-Za-z0-9_-]{1,80}$/.test(d.id)) {
        const allowed = forConversation.get(`${slug}:${d.sessionID}`)
        if (allowed?.has(d.action) && !webRequests(d.action, d.resources).length) opencodeCall({ socketPath: ws.paths(slug).opencode, agent: agentFor(slug), authorization: authorization(slug) }, 'POST', `/api/session/${d.sessionID}/permission/${d.id}/reply`, { decision: 'once' }).catch(() => {})
        return
      }
      if (ev.type === 'session.tool.input.started' && typeof d.name === 'string') {
        if (state.names.size > 5000) state.names.clear()
        state.names.set(d.id, d.name)
      } else if (ev.type === 'session.tool.called' && state.names.get(d.id) === 'read' && !state.seen.has(d.id)) {
        let p = d.input?.path ?? d.input?.filePath
        if (typeof p !== 'string' || p.length > 1300) return
        if (p.startsWith('/work/')) p = p.slice(6)
        if (!ws.validRel(p) || state.budget <= 0) return
        const ref = nameRef(keys, workspaceId, p)
        const key = ref.toString('hex')
        if (state.seen.has(key)) return
        state.seen.add(key)
        state.budget--
        const actor = runBy.get(`${slug}:${d.sessionID}`) ?? null
        audit(db, { actorKind: 'run', actor, action: 'file_read_by_run', workspace: workspaceId, nameRef: ref })
      }
    }
  }

  return {
    ensureRunning,
    forget,
    isReady,
    isAsleep,
    holdBusy,
    touch: (slug) => lastUse.set(slug, Date.now()),
    /** Runs stopped at the ceiling in the last 24 hours, and how many sessions are executing. */
    runsOf: (slug) => ({
      executing: runs.get(slug)?.size ?? 0,
      stopped: [...ceilingStops].filter(([k]) => k.startsWith(`${slug}:`)).map(([k, v]) => ({ session: k.slice(slug.length + 1), at: new Date(v.at).toISOString(), minutes: v.minutes, message: ceilingMessage(v.minutes) })),
    }),
    sweep,
    forward,
    /** One JSON request from the front desk itself to the workspace's opencode, through its desk. */
    /** The person said "for the rest of this conversation" to `action` in `sessionID`. */
    allowForConversation(slug, sessionID, action) {
      if (typeof action !== 'string' || action.length > 60) return
      const k = `${slug}:${sessionID}`
      if (!forConversation.has(k)) forConversation.set(k, new Set())
      forConversation.get(k).add(action)
      if (forConversation.size > 5000) forConversation.delete(forConversation.keys().next().value)
    },
    ocCall: (slug, method, pathname, body) => opencodeCall({ socketPath: ws.paths(slug).opencode, agent: agentFor(slug), authorization: authorization(slug) }, method, pathname, body),
    dbApi: ws.dbApi,
    dbStream: ws.dbStream,
    dbAdd: ws.dbAdd,
    dbRemove: ws.dbRemove,
    isDocument: ws.isDocument,
    oc,
    /** The sessions opencode says are executing (a Set), or null when it does not answer. */
    executing: active,
    /** A prompt the front desk sent itself, recorded as a person's (who, the run's clock, the audit). */
    notePrompt: (slug, workspaceId, personId, sessionID) => (fresh(slug), notePrompt(slug, workspaceId, personId, sessionID), watch(slug, workspaceId)),
    putStream: ws.putStream,
    getStream: ws.getStream,
    // Reading real documents and Open for every kind (README): all inside the VM.
    viewStream: ws.viewStream,
    viewJson: ws.viewJson,
    unzip: ws.unzip,
    dbAttach: ws.dbAttach,
    dbAddFolder: ws.dbAddFolder,
    disk: ws.disk,
    putChunk: ws.putChunk,
    uploadStatus: ws.uploadStatus,
    finishUpload: ws.finishUpload,
    abortUpload: ws.abortUpload,
    removeFile: ws.removeFile,
    filesAsync: ws.filesAsync,
    peek: ws.peek,
    validRel: ws.validRel,
    close() {
      if (sweeper) clearInterval(sweeper)
      for (const w of watchers.values()) w.req?.destroy()
      for (const a of agents.values()) a.destroy()
    },
  }
}

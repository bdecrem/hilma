// The front desk's side of a sealed workspace: start it, reach its opencode through its desk
// socket (workspace/desk.mjs) with the password only this process reads, and move files with the
// workspace tools (ola-put, ola-get, ola-rm, ola-files, through workspace/ws.mjs).
//
// Everything that comes back from a workspace is the workspace's word: the agent can replace
// opencode on its own loopback. Replies are typed and capped by the proxy; file lists are parsed
// strictly by ws.mjs; no host path is ever built from anything the workspace says.
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ws from '../workspace/ws.mjs'
import { makeProxy } from '../web/server/proxy.mjs'
import { audit, nameRef } from './db.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WS_CLI = path.join(HERE, '../workspace/ws.mjs')
// The desk takes 16 connections per workspace; keep a few for ws.mjs's own checks.
const MAX_SOCKETS = 12

export function makeWorkspaces({ db, keys, log }) {
  const ready = new Map() // slug -> time it last answered
  const starting = new Map() // slug -> Promise
  const agents = new Map()
  const proxies = new Map()
  const watchers = new Map()
  const runBy = new Map() // `${slug}:${sessionID}` -> person id of the last prompt

  /** Starts the workspace if it is not running (ws.mjs start is idempotent), at most once at a time. */
  async function ensureRunning(slug) {
    if (Date.now() - (ready.get(slug) ?? 0) < 30_000) return
    if (!starting.has(slug)) {
      const p = new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [WS_CLI, 'start', slug], { stdio: ['ignore', 'ignore', 'pipe'], env: process.env })
        let err = ''
        child.stderr.on('data', (d) => (err = (err + d).slice(-500)))
        child.on('close', (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(err.trim() || `ws start exited ${code}`), { code: 'START_FAILED' }))))
      })
        .then(() => ready.set(slug, Date.now()))
        .finally(() => starting.delete(slug))
      starting.set(slug, p)
    }
    return starting.get(slug)
  }
  const forget = (slug) => ready.delete(slug)

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

  /** Forwards one page request to the workspace's opencode; records who started a run. */
  async function forward(slug, workspaceId, personId, req, res, pathname, search) {
    const m = /^\/api\/session\/([A-Za-z0-9_-]{1,80})\/prompt$/.exec(pathname)
    if (req.method === 'POST' && m) {
      runBy.set(`${slug}:${m[1]}`, personId)
      audit(db, { actor: personId, action: 'run_started', workspace: workspaceId })
    }
    return proxyFor(slug, workspaceId)(req, res, pathname, search)
  }

  // -------------------------------------------------------------- "read by a run"
  //
  // While a run may be going, the front desk keeps its own subscription to the workspace's event
  // stream and writes one audit row for each file opencode's `read` tool opens (by keyed name
  // hash). A shell command that reads a file is not seen here: it is recorded as the run itself.
  function watch(slug, workspaceId) {
    const w = watchers.get(slug)
    if (w) return (w.until = Date.now() + 15 * 60_000)
    const state = { until: Date.now() + 15 * 60_000, names: new Map(), seen: new Set(), req: null }
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
      if (!d || typeof d.id !== 'string' || d.id.length > 120) return
      if (ev.type === 'session.tool.input.started' && typeof d.name === 'string') {
        if (state.names.size > 5000) state.names.clear()
        state.names.set(d.id, d.name)
      } else if (ev.type === 'session.tool.called' && state.names.get(d.id) === 'read' && !state.seen.has(d.id)) {
        let p = d.input?.path ?? d.input?.filePath
        if (typeof p !== 'string' || p.length > 1300) return
        if (p.startsWith('/work/')) p = p.slice(6)
        if (!ws.validRel(p)) return
        state.seen.add(d.id)
        const actor = runBy.get(`${slug}:${d.sessionID}`) ?? null
        audit(db, { actorKind: 'run', actor, action: 'file_read_by_run', workspace: workspaceId, nameRef: nameRef(keys, workspaceId, p) })
      }
    }
  }

  return {
    ensureRunning,
    forget,
    forward,
    putStream: ws.putStream,
    getStream: ws.getStream,
    removeFile: ws.removeFile,
    filesAsync: ws.filesAsync,
    validRel: ws.validRel,
    close() {
      for (const w of watchers.values()) w.req?.destroy()
      for (const a of agents.values()) a.destroy()
    },
  }
}

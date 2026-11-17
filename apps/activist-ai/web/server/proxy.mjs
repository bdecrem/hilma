// The door from the page to the workspace's opencode server. The one allowlist of opencode routes:
// the dev server (dev.mjs) and the front desk (../../frontdesk/server.mjs) both use this file.
//
// The browser talks to /oc/api/... on our own origin. This module forwards a short list of
// routes to `opencode serve` with the workspace's Basic-auth password, which the browser never
// sees, and refuses everything else (providers, credentials, shells, ptys, MCP, config...).
// Creating a session is rewritten: the folder and the permission rules are decided here, from
// the autonomy the page asked for, never taken from the browser.
import http from 'node:http'
import { closeAfter, readUpTo } from './linger.mjs'
import { webRules } from './webask.mjs'

/**
 * Routes the page may use, and what each needs: `read` (any member, viewers included) or `run`
 * (owners and members: it starts, steers or answers the agent). Anything else answers 403.
 */
export const ALLOWED = [
  ['GET', /^\/api\/event$/, 'read'],
  ['GET', /^\/api\/session$/, 'read'],
  ['POST', /^\/api\/session$/, 'run'],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}$/, 'read'],
  ['PATCH', /^\/api\/session\/[A-Za-z0-9_-]{1,80}$/, 'run'],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/prompt$/, 'run'],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/interrupt$/, 'run'],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/message$/, 'read'],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/context$/, 'read'],
  ['GET', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/permission$/, 'read'],
  ['POST', /^\/api\/session\/[A-Za-z0-9_-]{1,80}\/permission\/[A-Za-z0-9_-]{1,80}\/reply$/, 'run'],
]

/** What a route needs ('read' or 'run'), or null when the page may not use it. */
export function routeNeed(method, pathname) {
  return ALLOWED.find(([m, re]) => m === method && re.test(pathname))?.[2] ?? null
}
export function allowed(method, pathname) {
  return routeNeed(method, pathname) !== null
}

// Never allowed in a workspace, whatever the autonomy: these would reach outside it.
const ALWAYS_DENY = ['webfetch', 'websearch', 'external_directory', 'browser']
// What "Ask me first" stops for: changing files and running code.
const ASK_FIRST = ['shell', 'bash', 'edit', 'write', 'apply_patch', 'patch']

/**
 * opencode permission rules for an autonomy choice and the project's web choice. Later rules win,
 * so the denials go last. `ola-search` and `ola-fetch` ask the person (the approval says what would
 * be searched or downloaded) unless the project said "Always in this project" and the person did
 * not choose "Ask me first". These rules only carry the question: the gateway is what refuses a
 * web request the project did not approve (gateway/web.mjs).
 */
export function permissionsFor(autonomy, web = 'ask') {
  const rules = [{ action: '*', resource: '*', effect: 'allow' }]
  if (autonomy === 'ask') for (const action of ASK_FIRST) rules.push({ action, resource: '*', effect: 'ask' })
  rules.push(...webRules(web === 'always' && autonomy !== 'ask' ? 'allow' : 'ask'))
  for (const action of ALWAYS_DENY) rules.push({ action, resource: '*', effect: 'deny' })
  return rules
}

/** The body opencode gets for PATCH /api/session/:id: a title and the autonomy, nothing else. */
export function rewriteSessionUpdate(raw, web = 'ask') {
  let sent = {}
  try {
    sent = raw.length ? JSON.parse(raw) : {}
  } catch {
    return null
  }
  const out = {}
  if (typeof sent?.title === 'string') out.title = sent.title.slice(0, 200)
  const autonomy = sent?.metadata?.autonomy
  if (autonomy === 'ask' || autonomy === 'go') {
    out.metadata = { autonomy }
    out.permissions = permissionsFor(autonomy, web)
  }
  return out
}

/** The body opencode gets for POST /api/session, built from what the page sent. */
export function rewriteSessionCreate(raw, work, web = 'ask') {
  let sent = {}
  try {
    sent = raw.length ? JSON.parse(raw) : {}
  } catch {
    return null
  }
  const autonomy = sent?.metadata?.autonomy === 'ask' ? 'ask' : 'go'
  const title = typeof sent?.title === 'string' ? sent.title.slice(0, 200) : undefined
  return {
    ...(title ? { title } : {}),
    location: { directory: work },
    metadata: { autonomy },
    permissions: permissionsFor(autonomy, web),
  }
}

// opencode picks its project instance from `?directory=` (and `?workspace=`): a viewer's GET
// with `?directory=/opt/ola` made it open an instance there (review of 2026-11-16, M5). The
// folder is decided here, so those never pass; the rest of the query does.
const NEVER_FORWARDED = ['directory', 'workspace']
export function forwardedQuery(search) {
  const q = new URLSearchParams(search ?? '')
  for (const k of [...q.keys()]) if (NEVER_FORWARDED.includes(k.toLowerCase())) q.delete(k)
  const s = q.toString()
  return s ? `?${s}` : ''
}

const MAX_BODY = 256 * 1024
// What comes back from opencode is the workspace's word (the agent can replace opencode on its
// own loopback): its type is forced to JSON or an event stream, and a plain reply is capped.
const MAX_REPLY = 32 * 1024 * 1024

/**
 * One proxy to one workspace's opencode. `target` is a URL (the dev server's local opencode) or
 * `socketPath` a unix socket (a sealed workspace's desk); `agent` is an optional http.Agent.
 * `onForward({ method, pathname })` is told about each request that reached opencode with a 2xx.
 * `webMode()` says the project's web choice ('ask' or 'always') for new or changed sessions.
 */
export function makeProxy({ target, socketPath, agent, authorization, work, log = () => {}, onForward = () => {}, webMode = () => 'ask' }) {
  const upstream = target ? new URL(target) : null
  return async function proxy(req, res, pathname, search) {
    if (!allowed(req.method, pathname)) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not_allowed' }))
      return
    }
    let body = null
    if (req.method !== 'GET') {
      // Over MAX_BODY: the 413 with a lingering close, so the page reads it (./linger.mjs).
      body = await readUpTo(req, MAX_BODY)
      if (!body) {
        if (req.destroyed) return
        closeAfter(req, res)
        res.writeHead(413, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'too_large', message: 'That message is longer than Ola accepts. Send it in shorter parts.' }))
        return
      }
      if (req.method === 'POST' && pathname === '/api/session') {
        const rewritten = rewriteSessionCreate(body.toString('utf8'), work, webMode())
        if (!rewritten) {
          res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad_json' }))
          return
        }
        body = Buffer.from(JSON.stringify(rewritten))
      }
      if (req.method === 'PATCH') {
        const rewritten = rewriteSessionUpdate(body.toString('utf8'), webMode())
        if (!rewritten) {
          res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad_json' }))
          return
        }
        body = Buffer.from(JSON.stringify(rewritten))
      }
    }
    const headers = { authorization: typeof authorization === 'function' ? authorization() : authorization, accept: req.headers.accept ?? '*/*' }
    if (body) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(body.length)
    }
    const where = socketPath ? { socketPath, agent } : { host: upstream.hostname, port: upstream.port, agent }
    const up = http.request({ ...where, method: req.method, path: pathname + forwardedQuery(search), headers }, (upRes) => {
      const stream = /^text\/event-stream\b/i.test(upRes.headers['content-type'] ?? '')
      const out = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-type': stream ? 'text/event-stream' : 'application/json; charset=utf-8' }
      const declared = Number(upRes.headers['content-length'])
      if (!stream && Number.isFinite(declared)) {
        if (declared > MAX_REPLY) {
          upRes.destroy()
          res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'reply_too_large' }))
          return
        }
        out['content-length'] = String(declared)
      }
      res.writeHead(upRes.statusCode ?? 502, out)
      if (stream) res.flushHeaders?.()
      let seen = 0
      upRes.on('data', (c) => {
        seen += c.length
        if (!stream && seen > MAX_REPLY) return res.destroy(), upRes.destroy()
        res.write(c)
      })
      upRes.on('end', () => {
        res.end()
        if ((upRes.statusCode ?? 500) < 300) onForward({ method: req.method, pathname })
      })
      // opencode went away mid-stream: end the page's stream too, so it notices at once.
      upRes.on('aborted', () => res.destroy())
      upRes.on('error', () => res.destroy())
      res.on('close', () => upRes.destroy())
    })
    up.on('error', (e) => {
      log(`opencode unreachable: ${e.code ?? e.message}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'workspace_unreachable', message: 'Ola’s computer could not reach this project just now. Nothing was changed.' }))
      else res.destroy()
    })
    // The page went away (closed tab, lost network): stop the upstream request too.
    res.on('close', () => {
      if (!res.writableFinished) up.destroy()
    })
    up.end(body ?? undefined)
  }
}

/**
 * One request to a workspace's opencode from the front desk itself (not the page): JSON in and out,
 * capped and timed. What comes back is the workspace's word.
 */
export function opencodeCall({ target, socketPath, agent, authorization }, method, pathname, body, { ms = 10_000, max = 1024 * 1024 } = {}) {
  const upstream = target ? new URL(target) : null
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body))
  return new Promise((resolve) => {
    const headers = { authorization: typeof authorization === 'function' ? authorization() : authorization, accept: 'application/json' }
    if (data) (headers['content-type'] = 'application/json'), (headers['content-length'] = String(data.length))
    const where = socketPath ? { socketPath, agent } : { host: upstream.hostname, port: upstream.port, agent }
    const req = http.request({ ...where, method, path: pathname, headers, timeout: ms }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > max) return req.destroy()
        chunks.push(c)
      })
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {}
        resolve({ status: res.statusCode ?? 502, json })
      })
      res.on('error', () => resolve({ status: 502, json: null }))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve({ status: 502, json: null }))
    req.end(data ?? undefined)
  })
}

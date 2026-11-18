// "Lots of permissions" for Bart's opencode, applied on the machine (OLA-139, 2026-11-17). Bart:
// "All apps and all modes should have a toggle to remove most permission requests."
//
// One choice, kept in one file on the machine (`$STATE/permissions`: `lots` or `ask`; no file is
// `lots`, the default for Bart's own Ola). Any of Bart's apps reads and sets it through the phone
// door (`GET|PUT /ola/permissions`, phone-door.mjs). This module, run inside the phone door's
// process, watches opencode's event stream and, under `lots`, answers each ask-first step "once" the
// moment opencode asks: a command, a new or changed file, and so Ola's web commands too (a search
// or download is a shell command; the gateway's standing grant for the `bart` caller lets it out).
// So the phone alone, the Mac off, gets no question. Under `ask` it answers nothing.
//
// What the config refuses stays refused: a refusal is never asked, so nothing here can turn one
// into a yes (external_directory, opencode's own web tools, code mode, skills not Ola's, other
// providers, the shell patterns naming what serves real people). Only these actions are answered,
// never `external_directory`, `skill`, `question` or anything new.
//
// opencode's "always" is never sent (it saves a durable rule in the project); "once" each time, so
// turning the choice back to `ask` applies to the very next step.
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import http from 'node:http'

export const LOTS_ACTIONS = new Set(['shell', 'bash', 'edit', 'write', 'apply_patch', 'patch'])

// "Yes, for the rest of this session" (OLA-142, 2026-11-18). Bart: "I had to approve like 10
// different times, even when I said approve always in this session." The apps used to send
// opencode its own "always", which saves a lasting rule for the whole project from each command's
// head (`ola-search *`, `head *`): a download or a lookup after a yes to a search asked again, and
// the yes outlived the session, every later session included. Now the yes is kept here, for that
// session only, by kind: a web step (a search, download or lookup, however the model wraps it: the
// apps' WebAsk.question) covers every later web step in the session; any other step covers later
// steps of the same action. opencode only ever hears "once".
const WEB_TOOLS = { 'ola-search': 'search', '/opt/ola/bin/ola-search': 'search', 'ola-fetch': 'fetch', '/opt/ola/bin/ola-fetch': 'fetch', 'ola-lookup': 'lookup', '/opt/ola/bin/ola-lookup': 'lookup' }

/** The shell words of a simple command (words, quotes, backslash escapes), or null. */
export function shellWords(cmd) {
  if (typeof cmd !== 'string' || cmd.length > 8192) return null
  const words = []
  let cur = ''
  let has = false
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (c === "'") {
      const end = cmd.indexOf("'", i + 1)
      if (end < 0) return null
      cur += cmd.slice(i + 1, end)
      has = true
      i = end
    } else if (c === '"') {
      i++
      for (; i < cmd.length && cmd[i] !== '"'; i++) {
        if (cmd[i] === '$' || cmd[i] === '`') return null
        if (cmd[i] === '\\' && i + 1 < cmd.length && '"\\$`\n'.includes(cmd[i + 1])) i++
        cur += cmd[i]
      }
      if (i >= cmd.length) return null
      has = true
    } else if (c === '\\') {
      if (i + 1 >= cmd.length) return null
      cur += cmd[++i]
      has = true
    } else if (c === ' ' || c === '\t') {
      if (has) words.push(cur), (cur = ''), (has = false)
    } else if ('$`;&|<>()\n\r{}'.includes(c)) return null
    else (cur += c), (has = true)
  }
  if (has) words.push(cur)
  return words
}

/** `2>&1`, `2>/dev/null`, `>/dev/null 2>&1` at the end of a command, removed. */
export function stripRedirects(cmd) {
  let c = String(cmd ?? '').trim()
  for (;;) {
    const n = c.replace(/\s+(?:[12]?>&[12]|[12]?>\s*\/dev\/null)$/, '')
    if (n === c) return c
    c = n
  }
}

/** A command that only shows or trims output (OlaKit WebAsk.isPlumbing, word for word). */
export function isPlumbing(cmd) {
  const w = shellWords(stripRedirects(cmd))
  if (!w?.length) return false
  const rest = w.slice(1)
  switch (w[0]) {
    case 'head': case 'tail': case 'wc': case 'sort': case 'uniq': return rest.every((x) => x.startsWith('-') || /^\d+$/.test(x))
    case 'cat': return w.length === 1
    case 'echo': case 'true': case 'which': case 'type': return true
    case 'grep': return rest.filter((x) => !x.startsWith('-')).length <= 1
    default: return false
  }
}

/** Whether a permission is a web step: every command an Ola web command or plumbing, one at least. */
export function isWebStep(action, resources) {
  if (action !== 'shell' && action !== 'bash') return false
  const list = Array.isArray(resources) ? resources : []
  let web = 0
  for (const r of list) {
    const first = stripRedirects(r).split(/\s+/)[0]
    if (WEB_TOOLS[first]) web++
    else if (!isPlumbing(r)) return false
  }
  return web > 0
}

/** What a session yes is about: 'web' for a web step, else the action. */
export const kindOf = (action, resources) => (isWebStep(action, resources) ? 'web' : String(action ?? ''))
export const MODES = ['lots', 'ask']

/** The machine's choice. No file: `lots`. Anything but the two words: `ask` (said in the log). */
export function readMode(file, log = () => {}) {
  let s
  try {
    s = readFileSync(file, 'utf8').trim()
  } catch (e) {
    if (e.code === 'ENOENT') return 'lots'
    log(`permissions: ${file} unreadable (${e.code}); asking before each step`)
    return 'ask'
  }
  if (MODES.includes(s)) return s
  log(`permissions: ${file} holds neither lots nor ask; asking before each step`)
  return 'ask'
}

/** Writes the choice beside and renames it into place, mode 600. */
export function writeMode(file, mode) {
  if (!MODES.includes(mode)) throw new Error(`not a permissions mode: ${mode}`)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${mode}\n`, { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, file)
}

/** Whether an opencode question goes ahead under `lots`. */
export function goesAhead(action) {
  return LOTS_ACTIONS.has(action)
}

/**
 * Starts watching. `upstream` is opencode's "host:port", `basic` its Authorization header.
 * Returns { sweep, stop, answered() }: `sweep()` answers every step already waiting (run when the
 * choice becomes `lots`, and at each (re)connect, so a question asked while this was away is not
 * left hanging).
 */
export function startApprover({ upstream, basic, file, log = () => {}, retryMs = 2000 }) {
  const [host, port] = [upstream.slice(0, upstream.lastIndexOf(':')), Number(upstream.slice(upstream.lastIndexOf(':') + 1))]
  let stopped = false
  let req = null
  let answered = 0
  const inFlight = new Set()
  // sessionID -> the kinds the person said "yes, for the rest of this session" to. In memory: a
  // restart of the door asks again, never the other way round.
  const sessionYes = new Map()
  const covered = (p) => sessionYes.get(p.sessionID)?.has(kindOf(p.action, p.resources)) === true

  function call(method, path, body) {
    return new Promise((resolve) => {
      const data = body ? Buffer.from(JSON.stringify(body)) : null
      const r = http.request({ host, port, method, path, headers: { authorization: basic, accept: 'application/json', ...(data ? { 'content-type': 'application/json', 'content-length': String(data.length) } : {}) }, timeout: 15_000 }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
          } catch {}
          resolve({ status: res.statusCode ?? 0, json })
        })
      })
      r.on('timeout', () => r.destroy())
      r.on('error', () => resolve({ status: 0, json: null }))
      if (data) r.write(data)
      r.end()
    })
  }

  async function answer(p) {
    if (!p || typeof p.id !== 'string' || typeof p.sessionID !== 'string') return
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(p.id) || !/^[A-Za-z0-9_-]{1,80}$/.test(p.sessionID)) return
    const lots = goesAhead(p.action) && readMode(file, log) === 'lots'
    if ((!lots && !covered(p)) || inFlight.has(p.id)) return
    inFlight.add(p.id)
    const r = await call('POST', `/api/session/${p.sessionID}/permission/${p.id}/reply`, { decision: 'once' })
    inFlight.delete(p.id)
    if (r.status >= 200 && r.status < 300) answered++
    // 404: already answered (by an app, or by a sweep that crossed this event): nothing to do.
    else if (r.status !== 404) log(`permissions: a ${p.action} step was not answered (${r.status})`)
  }

  async function sweep() {
    const lots = readMode(file, log) === 'lots'
    const r = await call('GET', '/api/permission/request')
    const list = Array.isArray(r.json) ? r.json : Array.isArray(r.json?.data) ? r.json.data : []
    const mine = list.filter((p) => p && ((lots && goesAhead(p.action)) || covered(p)))
    await Promise.all(mine.map(answer))
    return mine.length
  }

  /**
   * "Yes, for the rest of this session" to one waiting request: kept for its session and kind, the
   * request answered "once", and anything else of that kind waiting in the session too. Returns
   * the HTTP status for the app (404 when no such request is waiting).
   */
  async function sayYesForSession(sessionID, requestID) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(sessionID) || !/^[A-Za-z0-9_-]{1,80}$/.test(requestID)) return 400
    const r = await call('GET', `/api/session/${sessionID}/permission`)
    const list = Array.isArray(r.json) ? r.json : Array.isArray(r.json?.data) ? r.json.data : []
    const p = list.find((x) => x?.id === requestID)
    if (!p) return r.status === 0 ? 502 : 404
    const kind = kindOf(p.action, p.resources)
    if (!sessionYes.has(sessionID)) sessionYes.set(sessionID, new Set())
    sessionYes.get(sessionID).add(kind)
    if (sessionYes.size > 5000) sessionYes.delete(sessionYes.keys().next().value)
    log(`permissions: yes for the rest of a session to ${kind === 'web' ? 'web steps' : kind}`)
    inFlight.add(p.id)
    const res = await call('POST', `/api/session/${sessionID}/permission/${requestID}/reply`, { decision: 'once' })
    inFlight.delete(p.id)
    for (const other of list) if (other?.id !== requestID && other?.sessionID === sessionID && covered(other)) await answer(other)
    return res.status === 0 ? 502 : res.status
  }

  function connect() {
    if (stopped) return
    req = http.request({ host, port, path: '/api/event', headers: { authorization: basic, accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) {
        log(`permissions: opencode's events answered ${res.statusCode}`)
        res.resume()
        return
      }
      sweep().catch(() => {})
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        buf += chunk
        if (buf.length > 4 * 1024 * 1024) buf = buf.slice(-1024 * 1024)
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          let ev
          try {
            ev = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }
          if (ev?.type === 'permission.asked') answer(ev.data).catch(() => {})
        }
      })
    })
    req.on('close', () => {
      req = null
      if (!stopped) setTimeout(connect, retryMs).unref?.()
    })
    req.on('error', () => {})
    req.end()
  }
  connect()

  return {
    sweep,
    sayYesForSession,
    yesFor: (sessionID) => [...(sessionYes.get(sessionID) ?? [])],
    answered: () => answered,
    stop() {
      stopped = true
      req?.destroy()
    },
  }
}

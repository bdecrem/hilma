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
    if (!goesAhead(p.action) || readMode(file, log) !== 'lots' || inFlight.has(p.id)) return
    inFlight.add(p.id)
    const r = await call('POST', `/api/session/${p.sessionID}/permission/${p.id}/reply`, { decision: 'once' })
    inFlight.delete(p.id)
    if (r.status >= 200 && r.status < 300) answered++
    // 404: already answered (by an app, or by a sweep that crossed this event): nothing to do.
    else if (r.status !== 404) log(`permissions: a ${p.action} step was not answered (${r.status})`)
  }

  async function sweep() {
    if (readMode(file, log) !== 'lots') return 0
    const r = await call('GET', '/api/permission/request')
    const list = Array.isArray(r.json) ? r.json : Array.isArray(r.json?.data) ? r.json.data : []
    const mine = list.filter((p) => goesAhead(p?.action))
    await Promise.all(mine.map(answer))
    return mine.length
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
    answered: () => answered,
    stop() {
      stopped = true
      req?.destroy()
    },
  }
}

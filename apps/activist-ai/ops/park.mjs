// Parking idle projects for an update's test suites (OLA-240).
//
// The machine runs four VMs. An update's two VM suites (workspace, frontdesk) run one after the
// other and need two of them. On Nov 20 two updates were refused, "the machine is full: 3 VMs
// running that are not this suite's", while two people's projects and a checker's test project
// were open. Updates must not depend on nobody using Ola, so:
//
//   1. The update writes a park request ($OLA_HOME/park-request.json) before its suites and
//      removes it when it ends, however it ends (process exit; and `until` in case it is killed).
//   2. While a request stands, the front desk (frontdesk/workspaces.mjs) parks every running
//      project no one has used for `idleMs` (5 minutes) and that has no run executing and no
//      transfer under way: stopped the way its idle stop does it, so an open tab's event stream
//      does not wake it, and the next request does. Parked slugs go to $OLA_HOME/parked.json,
//      which outlives a front desk restart (a passing update restarts it).
//   3. The update then waits up to 20 minutes for room for its suites' VMs (it used to fail
//      after 3), saying once what it waits for. A project in use is never stopped for it.
//   4. When the request is gone, the front desk starts the projects it parked again (those still
//      stopped), so a person comes back to a project that is up, and forgets them.
//
// Only file names, times and project slugs go in these files.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const PARK_IDLE_MS = 5 * 60_000 // a project unused this long is parked for a test
export const PARK_UNTIL_MS = 3 * 3600_000 // a request no one removed (the update was killed) ends by itself
export const ROOM_WAIT_MS = 20 * 60_000 // how long an update waits for room for its suites
export const WAKE_GIVE_UP_MS = 15 * 60_000 // a parked project not started again by then wakes on its next request

export const files = (home) => ({ request: path.join(home, 'park-request.json'), parked: path.join(home, 'parked.json') })

function read(f) {
  try {
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}
function write(f, v) {
  writeFileSync(`${f}.tmp`, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 })
  renameSync(`${f}.tmp`, f)
}

/** The update: asks for idle projects to be parked; returns a function that ends the request (idempotent). */
export function requestPark(home, { by, idleMs = PARK_IDLE_MS, untilMs = PARK_UNTIL_MS, now = Date.now() } = {}) {
  const f = files(home).request
  const req = { at: now, by: String(by ?? 'update'), idleMs, until: now + untilMs }
  write(f, req)
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    // Only our own request: a later update's is left standing.
    if (read(f)?.at === req.at) rmSync(f, { force: true })
  }
  return Object.assign(end, { at: req.at })
}

/** The standing request, or null (none, unreadable, or past its `until`). */
export function standing(home, now = Date.now()) {
  const r = read(files(home).request)
  return r && Number.isFinite(r.at) && Number.isFinite(r.idleMs) && now < r.until ? r : null
}
export const parkedNow = (home) => read(files(home).parked)

/** The update: waits until the front desk has answered this request (parked.json names it), up to `ms`. */
export async function waitAnswered(home, at, { ms = 30_000, step = 500 } = {}) {
  const end = Date.now() + ms
  for (;;) {
    const p = parkedNow(home)
    if (p?.request === at) return p
    if (Date.now() > end) return null
    await new Promise((r) => setTimeout(r, step))
  }
}

/**
 * The front desk's side, one call per poll. `candidates()` lists the projects it knows with
 * { slug, running, idleMs, busy (a run executing or a transfer), why } ; `park(slug)` stops one
 * the idle stop's way; `wake(slug)` starts one again (rejects when it cannot now). Returns what it
 * did, for the log.
 */
export function makeParker({ home, candidates, park, wake, log = () => {}, now = () => Date.now() }) {
  const f = files(home).parked
  const waking = new Set()
  let polling = false
  async function poll() {
    if (polling) return
    polling = true
    try {
      const req = standing(home, now())
      const state = parkedNow(home) ?? { request: null, parked: [], kept: [] }
      if (req) {
        // Parked under an earlier request that ended without a wake (a restart in between) stay parked under this one.
        const parked = new Set(state.parked ?? [])
        const kept = []
        for (const c of await candidates()) {
          if (!c.running || parked.has(c.slug)) continue
          if (c.busy || c.idleMs < req.idleMs) {
            kept.push({ slug: c.slug, why: c.busy ? 'in use: a run or a transfer' : `used ${Math.round(c.idleMs / 60_000)} min ago` })
            continue
          }
          try {
            await park(c.slug)
            parked.add(c.slug)
            log(`${c.slug}: parked for an update's tests (${Math.round(c.idleMs / 60_000)} min idle)`)
          } catch (e) {
            kept.push({ slug: c.slug, why: `could not be parked (${e.code ?? 'error'})` })
          }
        }
        const next = { request: req.at, by: req.by, parked: [...parked], kept, at: now(), endedAt: null }
        if (JSON.stringify({ ...next, at: 0 }) !== JSON.stringify({ ...state, at: 0 })) write(f, next)
        return next
      }
      // No request: start again what was parked, then forget it.
      if (!state.parked?.length) {
        if (existsSync(f)) rmSync(f, { force: true })
        return null
      }
      const endedAt = state.endedAt ?? now()
      const left = []
      const up = new Set((await candidates()).filter((c) => c.running).map((c) => c.slug))
      for (const slug of state.parked) {
        if (up.has(slug)) continue // a person woke it meanwhile
        if (waking.has(slug)) {
          left.push(slug)
          continue
        }
        if (now() - endedAt > WAKE_GIVE_UP_MS) {
          log(`${slug}: not started again after the update (it starts on its next request)`)
          continue
        }
        waking.add(slug)
        left.push(slug)
        Promise.resolve()
          .then(() => wake(slug))
          .then(
            () => log(`${slug}: started again after the update's tests`),
            (e) => log(`${slug}: could not be started again yet (${e.code ?? 'error'}), tried again`),
          )
          .finally(() => waking.delete(slug))
      }
      // A slug whose wake succeeded is running at the next poll and drops out above.
      if (left.length) write(f, { ...state, parked: left, endedAt, at: now() })
      else rmSync(f, { force: true })
      return { parked: left }
    } finally {
      polling = false
    }
  }
  return { poll }
}

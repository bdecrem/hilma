// The record of deliberate ways around a guard (OLA-251, third pass, Nov 20).
// Two checkers each found new ways around the same guards. A guard in a script the guarded agent runs
// itself can stop the mistake and the shortcut, but not a deliberate way around: the agent controls
// its own flags, environment and files. So every such way around that the tracker can see leaves one
// line here, in the tracker's database (venture_state "override:<time>:<random>", not a local file an
// agent can edit unnoticed), and the evening review carries the day's count and list by itself
// (sweep.mjs post), shown on the Learning page as "ways around a guard used today".
//   { at, ticket, what, caller, host, tool }
//   caller: the agent or session id the hook recorded for this call (_who.mjs, from the real hook file,
//   never from VENTURE_CALLERS_FILE), or "unknown".
// What writes one: --beside accepted; a lane edited; VENTURE_CALLERS_FILE, VENTURE_LIVE_RELEASE or
// VENTURE_ASKS_FILE set on the real tracker (ignored there); VENTURE_PRIVATE set on a real write (refused);
// a cache file for the live release that the tracker did not write as it is; a pass tried by a caller
// the tracker could not identify; a pass on a ticket built before callers were recorded; an update of
// the test server that did not go through runner.mjs deploy; a check added, changed or skipped after
// the ticket was started. `issues.mjs overrides [--day D]` prints them.
import { hostname } from 'node:os'
import { randomBytes } from 'node:crypto'
import { CALLERS, caller } from './_who.mjs'

export const OVERRIDE_PREFIX = 'override:'
const pacificDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

/** The caller as the hook saw it: the real hook file, whatever VENTURE_CALLERS_FILE says (that file is
 *  read only on a copy of the tracker, VENTURE_TRACKER_FAKE, where tests name their own callers). */
export function realCaller(argv = process.argv.slice(2), tool = 'issues.mjs') {
  try {
    const c = caller({ argv, file: process.env.VENTURE_TRACKER_FAKE && process.env.VENTURE_CALLERS_FILE ? process.env.VENTURE_CALLERS_FILE : CALLERS, tool })
    return c.id ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** One line. key: an optional stable key (so the same update of the test server is written once). */
export async function writeOverride(db, { ticket = null, what, tool = 'issues.mjs', key = null, at = null, who = null }) {
  const now = at ?? new Date().toISOString()
  const k = OVERRIDE_PREFIX + (key ?? `${now}:${randomBytes(3).toString('hex')}`)
  const value = { at: now, ticket, what, caller: who ?? realCaller(), host: hostname().replace(/\..*$/, ''), tool }
  const r = await db.from('venture_state').upsert({ key: k, value, at: new Date().toISOString() })
  if (r.error) console.error(`(the override line could not be written: ${r.error.message})`)
  else console.error(`(recorded as a way around a guard, for the evening review: ${what})`)
  return value
}

export async function hasOverride(db, key) {
  const r = await db.from('venture_state').select('key').eq('key', OVERRIDE_PREFIX + key).maybeSingle()
  return !!r.data
}

/** The lines of a Pacific day (YYYY-MM-DD), oldest first. */
export async function overridesOf(db, day = pacificDay()) {
  const r = await db.from('venture_state').select('key, value').like('key', `${OVERRIDE_PREFIX}%`)
  if (r.error) throw new Error(`overrides: ${r.error.message}`)
  return (r.data ?? []).map((x) => x.value).filter((v) => v?.at && pacificDay(Date.parse(v.at)) === day).sort((a, b) => a.at.localeCompare(b.at))
}

export const overrideLine = (v) => `${new Date(v.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).padEnd(8)} ${(v.ticket ?? '-').padEnd(8)} ${String(v.caller).slice(0, 44).padEnd(44)} ${v.what}`

// ---- Updates of the test server that did not go through the gate (OLA-279). `ola.mjs deploy` refuses
// any caller but the gate (OLA_DEPLOY_VIA, ops/signers.mjs deployCaller), but the variable can be typed; `runner.mjs deploy` is the gate and records every update it
// allows in venture_state "runner_deploys". The test server's own list (~/ola-staging/deploys.log, one
// line per update attempt, ending when it is deployed or refused) is compared with that record; every
// line after the gate existed with no allowed start in the 90 minutes before it is an override, written
// once (its key is the line's time). runner.mjs status and issues.mjs unchecked (the hourly check) do it.
export const GATE_SINCE = '2026-11-20T21:20:32Z' // a9d7cbee, the gate (OLA-272)
const DEPLOY_SPAN = 90 * 60e3
export function ungatedDeploys(logText = '', starts = [], since = GATE_SINCE, allow = []) {
  const lines = String(logText).split('\n').map((l) => ({ l: l.trim(), at: /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s/.exec(l.trim())?.[1] })).filter((x) => x.at && x.at > since)
  const free = [...starts].map((s) => s.at).sort()
  const out = []
  for (const x of lines.sort((a, b) => a.at.localeCompare(b.at))) {
    // since OLA-279 each line ends " via <caller>": one that names another caller is outside the gate whatever its time
    const via = / via (.+)$/.exec(x.l)?.[1]
    if (via && allow.includes(via)) continue // a caller in order on this machine (the Studio's first install, OLA-448)
    if (via && via !== 'runner.mjs deploy') {
      out.push(x)
      continue
    }
    const i = free.findIndex((s) => s <= x.at && Date.parse(x.at) - Date.parse(s) < DEPLOY_SPAN)
    if (i >= 0) free.splice(i, 1)
    else out.push(x)
  }
  return out
}
// key, allow, machine, since: another machine's record and list, and when the gate began there (the Mac Studio, OLA-448);
// the default is the mini's test server.
export async function checkDeploys(db, logText, { tool = 'runner.mjs', key: stateKey = 'runner_deploys', allow = [], machine = 'test server', since = GATE_SINCE } = {}) {
  const st = (await db.from('venture_state').select('value').eq('key', stateKey).maybeSingle()).data?.value ?? { starts: [] }
  const bad = ungatedDeploys(logText, st.starts ?? [], since, allow)
  const fresh = []
  for (const x of bad) {
    const key = `deploy${stateKey.slice('runner_deploys'.length)}:${x.at}`
    if (await hasOverride(db, key)) continue
    fresh.push(x)
    await writeOverride(db, { key, at: x.at, tool, who: `not known (run on the ${machine}, outside a hook)`, what: `the ${machine} was updated outside runner.mjs deploy (no update allowed by the gate in the 90 minutes before): ${x.l.slice(0, 200)}` })
  }
  return { bad, fresh }
}

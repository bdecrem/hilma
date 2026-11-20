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
export function realCaller(argv = process.argv.slice(2)) {
  try {
    const c = caller({ argv, file: process.env.VENTURE_TRACKER_FAKE && process.env.VENTURE_CALLERS_FILE ? process.env.VENTURE_CALLERS_FILE : CALLERS })
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

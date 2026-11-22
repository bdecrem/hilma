// Who is working on Venture (table venture_state, schema 008). The watchers of
// an interactive session call beat() on every poll; the runner on the Mac mini
// (runner.mjs) stays idle while that heartbeat is fresh.
import { hostname } from 'node:os'

export async function getState(db, key) {
  const { data, error } = await db.from('venture_state').select('*').eq('key', key).maybeSingle()
  if (error) throw new Error(`venture_state: ${error.message}`)
  return data // { key, value, at } or null
}

export async function setState(db, key, value) {
  const { error } = await db.from('venture_state').upsert({ key, value, at: new Date().toISOString() })
  if (error) throw new Error(`venture_state: ${error.message}`)
}

// "an interactive session is open here": never fails a watcher over it
export const beat = async (db, what) => {
  await setState(db, 'session', { host: hostname(), by: what }).catch(() => {})
  // and per machine, the last beat of each day (seen_<host>, the last 7 days): requests.mjs reads it to
  // know which machines had a session that day and until when, apart from their own exports (OLA-213)
  try {
    const host = hostname().replace(/\..*$/, '').replace(/[^A-Za-z0-9]/g, '_')
    const days = { ...((await getState(db, `seen_${host}`))?.value?.days ?? {}), [pacificDay()]: new Date().toISOString() }
    for (const k of Object.keys(days).sort().slice(0, -7)) delete days[k]
    await setState(db, `seen_${host}`, { host, days })
  } catch {}
}

// The daily sweep (scripts/venture/sweep.mjs, apps/venture/SWEEP.md): the Pacific days that still
// need one. A day is due from 6 pm of that day; every day since the first sweep counts.
export const pacificDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
/** The moment a Pacific day ends (the next day's midnight, PST or PDT), in ms. */
export const pacificDayEnd = (day) => {
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10)
  return [7, 8].map((h) => Date.parse(`${next}T0${h}:00:00Z`)).find((t) => pacificDay(t) === next && pacificDay(t - 1) === day) ?? Date.parse(`${next}T08:00:00Z`)
}
/** A day's stored match (requests.mjs) that ran before the day ended: requests he made after it have no outcome. */
export const matchEarly = (d) => !!d && !d.failed && Date.parse(d.at) < pacificDayEnd(d.day)
export async function sweepDue(db) {
  const s = (await getState(db, 'sweeps'))?.value
  if (!s?.since) return []
  const have = new Set(s.days.map((d) => d.day))
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Los_Angeles' }))
  const today = pacificDay()
  const due = []
  for (let d = s.since; d <= today && due.length < 14; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10)) if (!have.has(d) && (d < today || hour >= 18)) due.push(d)
  return due
}

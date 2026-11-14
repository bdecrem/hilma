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
export const beat = (db, what) => setState(db, 'session', { host: hostname(), by: what }).catch(() => {})

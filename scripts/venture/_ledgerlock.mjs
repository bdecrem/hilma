// One correct.mjs run at a time writes the ledger, across machines (OLA-251, nineteenth checker). The lock
// beside data/weaknesses.json covers one notes folder, but the runner on the mini and the lead on the M1 each
// have their own folder and share one tracker: two adds at once, one on each, both got through, took the same
// number, and the one written last lowered the kind the next fix needs, with no line. So add, fix and
// accept-notes also hold a row in the tracker (venture_state ledger-lock), taken by an insert, which the
// database refuses while the row exists. A row older than five minutes is taken over (its holder died).
//   node scripts/venture/_ledgerlock.mjs release <owner>   (run by correct.mjs's exit handler)
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const KEY = 'ledger-lock'
const STALE = 5 * 60e3

export async function trackerDb() {
  if (process.env.VENTURE_TRACKER_FAKE) return (await import('./_fakedb.mjs')).fakeClient(process.env.VENTURE_TRACKER_FAKE)
  const { createClient } = await import('@supabase/supabase-js')
  const env = existsSync(root + '.env.local') ? Object.fromEntries(readFileSync(root + '.env.local', 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')])) : process.env
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

/** Takes the lock or returns a sentence why not (after waiting up to waitMs). */
export async function acquire(owner, { waitMs = 120e3 } = {}) {
  const db = await trackerDb()
  const t0 = Date.now()
  for (;;) {
    const at = new Date().toISOString()
    const r = await db.from('venture_state').insert({ key: KEY, value: { owner, at }, at })
    if (!r.error) {
      // read back: the row must be ours (a takeover by two at once leaves one owner)
      const x = (await db.from('venture_state').select('value').eq('key', KEY).maybeSingle()).data?.value
      if (x?.owner === owner) return null
    } else if (!/duplicate|unique|23505/i.test(`${r.error.code ?? ''} ${r.error.message ?? ''}`)) {
      return `the tracker's ledger lock could not be taken (${r.error.message})`
    }
    const held = (await db.from('venture_state').select('value, at').eq('key', KEY).maybeSingle()).data
    if (held && Date.now() - Date.parse(held.value?.at ?? held.at) > STALE) {
      await db.from('venture_state').delete().eq('key', KEY).eq('at', held.at)
      continue
    }
    if (Date.now() - t0 > waitMs) return `another correct.mjs run is writing the ledger (${held?.value?.owner ?? '?'}, since ${held?.value?.at ?? '?'}); run this again when it ends`
    await new Promise((res) => setTimeout(res, 300 + Math.random() * 300))
  }
}

export async function release(owner) {
  const db = await trackerDb()
  const x = (await db.from('venture_state').select('value').eq('key', KEY).maybeSingle()).data?.value
  if (x?.owner === owner) await db.from('venture_state').delete().eq('key', KEY)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv[2] === 'release') await release(process.argv[3])

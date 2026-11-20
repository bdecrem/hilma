// One-off helper: settle a two-sided change to data/weaknesses.json (this Mac and the mini's night job).
// Takes the bucket's copy, keeps every seen entry and guard from both sides, the newer replay, and
// this side's other fields; writes the result here and marks the bucket's copy as seen so push uploads.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(readFileSync(new URL('.env.local', root), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const rel = 'data/weaknesses.json'
const here = new URL('apps/venture/private/' + rel, root)
const got = await db.storage.from('venture-private').download(rel)
if (got.error) throw new Error(got.error.message)
const buf = Buffer.from(await got.data.arrayBuffer())
const theirs = JSON.parse(buf.toString('utf8'))
const mine = JSON.parse(readFileSync(here, 'utf8'))
const key = (x) => JSON.stringify(x)
let added = 0
for (const t of theirs) {
  const m = mine.find((x) => x.id === t.id)
  if (!m) { mine.push(t); added++; continue }
  for (const s of t.seen ?? []) if (!m.seen.some((x) => x.ref === s.ref && x.day === s.day)) { m.seen.push(s); added++ }
  for (const g of t.guards ?? []) if (!m.guards.some((x) => x.what === g.what && x.day === g.day)) { m.guards.push(g); added++ }
  if (t.replay && (!m.replay || t.replay.at > m.replay.at)) { m.replay = t.replay; added++ }
  for (const k of Object.keys(t)) if (!(k in m)) { m[k] = t[k]; added++ }
}
for (const m of mine) m.seen.sort((a, b) => a.day.localeCompare(b.day))
writeFileSync(here, JSON.stringify(mine, null, 2) + '\n')
const mp = new URL('apps/venture/private/.sync-manifest.json', root)
const man = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : {}
man[rel] = createHash('sha256').update(buf).digest('hex')
writeFileSync(mp, JSON.stringify(man, null, 2))
console.log(`merged: ${added} thing(s) taken from the other machine's copy; ${mine.length} weaknesses`)

// Changes many rooms at once through changeRoom (the decorator, the test run, a saved version),
// in the name of one account, a few rooms at a time. Nothing goes on the wire. Used 2026-11-14 to
// give every study two things of its own.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/rooms-batch.ts <requests.json> <character> [--only a,b] [--dry] [--jobs 4]
// requests.json: { "<room>": "<sentence>", ... } (a null value is skipped)
import { readFileSync, writeFileSync } from 'node:fs'
import { changeRoom } from '../../src/lib/semibart/room-change'
import { MAX_PROMPT } from '../../src/lib/semibart/room-agent'
import { rosterRoom } from '../../src/lib/semibart/rooms'
import { db } from '../../src/lib/semibart/db'

async function main() {
  const args = process.argv.slice(2)
  const [file, character] = args
  const flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1] }
  const only = flag('--only')?.split(',')
  const jobs = Number(flag('--jobs') || 4)
  const dry = args.includes('--dry')
  if (!file || !character) { console.error('usage: rooms-batch.ts <requests.json> <character> [--only a,b] [--dry] [--jobs 4]'); process.exit(1) }
  const all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string | null>
  const todo = Object.entries(all).filter((e): e is [string, string] => !!e[1] && (!only || only.includes(e[0])))
  const bad = todo.filter(([room, ask]) => !rosterRoom(room) || ask.length > MAX_PROMPT)
  if (bad.length) { bad.forEach(([room, ask]) => console.error(`${room}: ${rosterRoom(room) ? `${ask.length} characters, over ${MAX_PROMPT}` : 'no such room'}`)); process.exit(1) }
  if (dry) { console.log(`${todo.length} rooms ok`); return }
  const { data: user, error } = await db().from('semibart_users').select('*').eq('character', character).single()
  if (error || !user) { console.error('no such account:', character, error?.message); process.exit(1) }
  const out: Record<string, unknown> = {}
  const queue = [...todo]
  const worker = async () => {
    for (let job; (job = queue.shift());) {
      const [room, ask] = job, t0 = Date.now()
      try {
        const r = await changeRoom(user, room, ask)
        out[room] = r.ok ? { ok: true, version: r.version, say: r.say } : r
        console.log(`${room}: ${r.ok ? `v${r.version}` : `NOT SAVED (${r.status})`} ${Math.round((Date.now() - t0) / 1000)}s: ${r.say}`)
      } catch (e) {
        out[room] = { ok: false, error: String(e) }
        console.log(`${room}: ERROR ${e}`)
      }
      writeFileSync(file.replace(/\.json$/, '.results.json'), JSON.stringify(out, null, 2))
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker))
  const failed = Object.entries(out).filter(([, v]) => !(v as { ok: boolean }).ok).map(([k]) => k)
  console.log(failed.length ? `failed: ${failed.join(',')}` : 'all saved')
}
main().catch(e => { console.error(e); process.exit(1) })

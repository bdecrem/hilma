// Runs the room decorator for real (one Claude call, plus repairs) without touching the database:
// what would be saved for a request, how long it took, what the test run measured.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/decorate-try.ts <room> "<request>" <out.js> [--effort low|medium|high] [--from current.js]
import { readFileSync, writeFileSync } from 'node:fs'
import { decorateRoom } from '../../src/lib/semibart/room-agent'
import { rosterRoom } from '../../src/lib/semibart/rooms'

async function main() {
  const [room, request, out, ...rest] = process.argv.slice(2)
  const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined }
  const info = rosterRoom(room)
  if (!info || !request || !out) { console.error('usage: decorate-try.ts <room> "<request>" <out.js> [--effort e] [--from file]'); process.exit(1) }
  const from = flag('--from')
  const current = from ? readFileSync(from, 'utf8') : ''
  const result = await decorateRoom({ key: room, room: info, current, version: current ? 1 : 0, request, asker: info.name, effort: flag('--effort') as 'low' | 'medium' | 'high' | undefined, log: l => console.log('  ' + l) })
  console.log(result.ok ? `OK in ${(result.ms / 1000).toFixed(1)}s, ${result.attempts} attempt(s)` : `NOT SAVED (${result.reason}) in ${(result.ms / 1000).toFixed(1)}s`)
  console.log('say:', result.say)
  if (result.ok) { writeFileSync(out, result.code); console.log(`code: ${result.code.length} chars -> ${out}; layers ${result.check.layers.join('+')}, ${result.check.maxOps} calls in the busiest frame, ${result.check.spots} spot(s)`) }
}
main().catch(e => { console.error(e); process.exit(1) })

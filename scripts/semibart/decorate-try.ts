// Runs the room decorator for real (one Claude call, plus repairs) without touching the database:
// what would be saved for a request, how long it took, what the test run measured.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/decorate-try.ts <room> "<request>" <out.js> [--effort low|medium|high] [--from current.js]
//                                                  [--as <character>] [--history history.json]
// --as: which occupant is asking (the host unless given). --history: the room's earlier changes,
// as rooms.ts roomLog returns them ([{ kind, who, character, ask, say }]); the run appends its own
// entry to that file when it succeeds, so a string of runs plays out a decoration war.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { decorateRoom } from '../../src/lib/semibart/room-agent'
import { rosterRoom } from '../../src/lib/semibart/rooms'

async function main() {
  const [room, request, out, ...rest] = process.argv.slice(2)
  const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined }
  const info = rosterRoom(room)
  if (!info || !request || !out) { console.error('usage: decorate-try.ts <room> "<request>" <out.js> [--effort e] [--from file]'); process.exit(1) }
  const from = flag('--from')
  const current = from ? readFileSync(from, 'utf8') : ''
  const as = flag('--as') || room, seat = info.occupants.indexOf(as)
  if (seat < 0) { console.error(`${as} does not live in ${room}: ${info.occupants.join(', ')}`); process.exit(1) }
  const hfile = flag('--history')
  const history = hfile && existsSync(hfile) ? JSON.parse(readFileSync(hfile, 'utf8')) : []
  const result = await decorateRoom({ key: room, room: info, current, version: history.length, request, asker: info.names[seat], askerCharacter: as, history, effort: flag('--effort') as 'low' | 'medium' | 'high' | undefined, log: l => console.log('  ' + l) })
  if (result.ok && hfile) writeFileSync(hfile, JSON.stringify([...history, { version: history.length + 1, kind: 'decorate', who: info.names[seat], character: as, ask: request, say: result.say }], null, 1))
  console.log(result.ok ? `OK in ${(result.ms / 1000).toFixed(1)}s, ${result.attempts} attempt(s)` : `NOT SAVED (${result.reason}) in ${(result.ms / 1000).toFixed(1)}s`)
  console.log('say:', result.say)
  if (result.ok) { writeFileSync(out, result.code); console.log(`code: ${result.code.length} chars -> ${out}; layers ${result.check.layers.join('+')}, ${result.check.maxOps} calls in the busiest frame, ${result.check.spots} spot(s)`) }
}
main().catch(e => { console.error(e); process.exit(1) })

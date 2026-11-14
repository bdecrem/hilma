// Saves a piece of room code you have already looked at (decorate-try.ts, then room-shots.mjs) as
// the room's next version, in the name of one of its occupants or an admin. The code goes through
// the same test run as a live request; nothing is generated here.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/room-put.ts <room> <code.js> <character> "<request>" "<say>"
import { readFileSync } from 'node:fs'
import { checkRoomCode } from '../../src/lib/semibart/room-check'
import { claimRoom, getRoom, mayDecorate, releaseRoom, rosterRoom, saveRoom } from '../../src/lib/semibart/rooms'
import { db } from '../../src/lib/semibart/db'

async function main() {
  const [room, file, character, prompt, say] = process.argv.slice(2)
  if (!rosterRoom(room) || !file || !character || !prompt || !say) { console.error('usage: room-put.ts <room> <code.js> <character> "<request>" "<say>"'); process.exit(1) }
  const code = readFileSync(file, 'utf8')
  const check = checkRoomCode(code)
  if (!check.ok) { console.error('the test run failed:', check.reason); process.exit(1) }
  const { data: user, error } = await db().from('semibart_users').select('*').eq('character', character).single()
  if (error || !user) { console.error('no such account:', character, error?.message); process.exit(1) }
  if (!mayDecorate(user, room)) { console.error(`${character} may not decorate ${room}`); process.exit(1) }
  if (!(await claimRoom(room, 20))) { console.error('someone is changing this room'); process.exit(1) }
  try {
    const before = await getRoom(room)
    const version = await saveRoom({ room, from: before.version, code, prompt, say, author: user.id, kind: 'decorate' })
    console.log(version === null ? 'the room changed meanwhile; nothing saved' : `saved ${room} v${version}`)
  } finally { await releaseRoom(room) }
}
main().catch(e => { console.error(e); process.exit(1) })

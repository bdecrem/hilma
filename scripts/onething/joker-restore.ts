// Restore someone's streak by hand: cover the given missed days as a gift
// (their jokers are not spent; a tenth day reached on the way still deals one),
// and re-chain every day after, in one transaction (jokers.ts, restoreStreak).
// Dry run unless --apply. Covered days show on their wall as taped jokers.
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/onething/joker-restore.ts <user id> <yyyy-mm-dd,…> [--apply]
import { findUserById, listEntries, localDay, scoreboard, tzFor } from '../../src/lib/onething/core'
import { listSaves, restoreStreak } from '../../src/lib/onething/jokers'

async function main() {
  const [id, list, flag] = process.argv.slice(2)
  const user = id ? await findUserById(id) : null
  if (!user || !list) throw new Error('usage: joker-restore.ts <user id> <yyyy-mm-dd,…> [--apply]')
  const apply = flag === '--apply'
  const r = await restoreStreak(user, list.split(','), !apply)
  console.log(JSON.stringify({ covers: r.days, from: r.from, now: r.now, jokers: `${r.held} → ${r.left}`, after: r.after.map((a) => `${a.day}: ${a.was}→${a.becomes} (${a.points} pts)`) }, null, 1))
  if (!apply) return console.log('dry run; add --apply to write it')
  const today = localDay(new Date(), tzFor(user))
  const board = scoreboard(await listEntries(user.id), today, await listSaves(user.id))
  console.log(`applied. streak now ${board.streak}, ${board.points} points, ${(await findUserById(user.id))!.jokers} jokers`)
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1) })

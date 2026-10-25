// Jokers on the real tables, on a throwaway account (joker-user.ts): a stale
// offer spends nothing; playing covers both gaps, re-chains the five days
// after, spends two and deals one back; the next sentence runs on through the
// covered days to day 42; a tenth day deals a joker. Cleans up after itself.
//   set -a; source ./.env.local; set +a; npx tsx scripts/onething/joker-db-check.ts
import { execSync } from 'node:child_process'
import { f2Supabase } from '../../src/lib/f2/supabase'
import { addDays, findUserById, listEntries, localDay, recordEntry, scoreboard } from '../../src/lib/onething/core'
import { JokerError, listSaves, playJokers, rescueFor } from '../../src/lib/onething/jokers'

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const out = execSync('npx tsx scripts/onething/joker-user.ts', { encoding: 'utf8' }).trim().split('\n').pop()!
  const { id } = JSON.parse(out) as { id: string }
  const sb = f2Supabase()
  try {
    const today = localDay(new Date(), 'America/Los_Angeles')
    let user = (await findUserById(id))!
    const before = await listEntries(id)
    const offer = rescueFor(before, await listSaves(id), today, user.jokers)
    check(!!offer && offer.days.join() === [addDays(today, -7), addDays(today, -2)].join() && offer.now === 41, 'the offer: both gaps, 36 → 41', JSON.stringify(offer?.days))

    let refused = false
    try { await playJokers(user, today, [addDays(today, -2)]) } catch (e) { refused = e instanceof JokerError }
    user = (await findUserById(id))!
    check(refused && user.jokers === 3 && (await listSaves(id)).size === 0, 'a stale offer (one day of two) is refused and spends nothing')

    const r = await playJokers(user, today, offer!.days)
    user = (await findUserById(id))!
    const saves = await listSaves(id)
    const after = await listEntries(id)
    check(user.jokers === 2, 'hand: 3 − 2 + 1 dealt back by day 40 = 2', String(user.jokers))
    check(saves.size === 2 && saves.has(addDays(today, -7)) && saves.has(addDays(today, -2)), 'two covered days stored')
    check(after.slice(0, 5).map((e) => e.streak).reverse().join() === '37,38,39,40,41', 'the five days after re-chained 37–41', after.slice(0, 5).map((e) => e.streak).join())
    check(after.every((e) => e.points >= before.find((b) => b.id === e.id)!.points), 'no day lost points')
    check(after[0].points === r.after[r.after.length - 1].points, 'stored points are the plan\'s')
    const board = scoreboard(after, today, saves)
    check(board.streak === 41 && board.points === after[0].points, 'scoreboard: 41 alive', String(board.streak))
    check(rescueFor(after, saves, today, user.jokers) === null, 'nothing left to save')

    let twice = false
    try { await playJokers(user, today, offer!.days) } catch (e) { twice = e instanceof JokerError }
    check(twice && (await findUserById(id))!.jokers === 2, 'playing the same offer again is refused')

    const kept = await recordEntry(user, today, 'Today, written after the save.')
    check(kept.streak === 42 && !kept.joker, 'the next sentence is day 42', String(kept.streak))

    // A tenth day deals: write on through days 43–49 is too slow here, so stage day 49 directly and record day 50.
    const { error } = await sb.from('onething_entries').update({ streak: 49 }).eq('id', kept.entry.id)
    if (error) throw new Error(error.message)
    const fifty = await recordEntry(user, addDays(today, 1), 'Day fifty, staged.')
    check(fifty.streak === 50 && fifty.joker?.dealt === true && fifty.joker.held === 3, 'day 50 deals a joker: 3 in hand', JSON.stringify(fifty.joker))
    await sb.from('onething_entries').update({ streak: 59 }).eq('id', fifty.entry.id)
    const sixty = await recordEntry(user, addDays(today, 2), 'Day sixty, staged.')
    check(sixty.joker?.dealt === false && (await findUserById(id))!.jokers === 3, 'day 60 with a full hand: nothing dealt, still 3')
  } finally {
    execSync('npx tsx scripts/onething/joker-user.ts cleanup', { encoding: 'utf8' })
    const { data } = await sb.from('onething_saves').select('id').eq('user_id', id)
    check((data ?? []).length === 0, 'cleanup: saves gone with the account')
  }
  console.log(failures ? `${failures} failure(s)` : 'all passed')
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

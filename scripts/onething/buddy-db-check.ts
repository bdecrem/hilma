// Buddy streaks against the real tables: two throwaway users (+1999…), seven
// days of entries each, an active pair — then afterKept pays the day-7 bonus
// once, a missed day shows up as a reset line, and buddyViews reads it all
// back. Sends nothing. Cleans up after itself (also on failure).
//   set -a; . .env.local; set +a; npx tsx scripts/onething/buddy-db-check.ts
import { f2Supabase } from '../../src/lib/f2/supabase'
import { addDays, listEntries, type User } from '../../src/lib/onething/core'
import { BONUS_POINTS, afterKept, buddyViews, resetLines } from '../../src/lib/onething/buddies'

const A_PHONE = '+19990000001'
const B_PHONE = '+19990000002'
let failures = 0
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
const sb = f2Supabase()

async function cleanup() {
  const { data } = await sb.from('onething_users').select('id').in('phone', [A_PHONE, B_PHONE])
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  if (ids.length) {
    await sb.from('onething_buddies').delete().or(`inviter_id.in.(${ids.join(',')}),invitee_id.in.(${ids.join(',')})`)
    await sb.from('onething_entries').delete().in('user_id', ids)
    await sb.from('onething_users').delete().in('id', ids)
  }
}

async function mkUser(phone: string, name: string | null): Promise<User> {
  const { data, error } = await sb.from('onething_users').insert({ phone, tz: 'America/Los_Angeles', name }).select('*').single()
  if (error) throw new Error(error.message)
  return data as User
}
async function mkEntries(userId: string, days: string[]) {
  let points = 0
  for (let i = 0; i < days.length; i++) {
    points += 10
    const { error } = await sb.from('onething_entries').insert({ user_id: userId, day: days[i], text: `day ${i + 1}`, streak: i + 1, points })
    if (error) throw new Error(error.message)
  }
}
const day = (i: number) => addDays('2026-08-01', i) // Aug 1 = i 0

async function main() {
try {
  await cleanup()
  const a = await mkUser(A_PHONE, 'Testa')
  const b = await mkUser(B_PHONE, null)
  const seven = Array.from({ length: 7 }, (_, i) => day(i)) // Aug 1..7
  await mkEntries(a.id, seven)
  await mkEntries(b.id, seven.slice(0, 6)) // B has Aug 1..6 so far
  const { data: row, error } = await sb.from('onething_buddies')
    .insert({ inviter_id: a.id, invitee_handle: B_PHONE, invitee_id: b.id, status: 'active', accepted_at: new Date().toISOString(), start_day: day(0) })
    .select('*').single()
  if (error) throw new Error(error.message)

  // A kept Aug 7 first: B still to come, streak 6 alive from yesterday, no bonus yet.
  let tail = await afterKept(a, day(6))
  check(JSON.stringify(tail) === JSON.stringify(['999 000 0002\'s still to come.']), `A first on day 7 → "still to come" with the number as name (${tail.join(' | ')})`)

  // B keeps Aug 7: both in, streak 7 → bonus paid to both, once.
  await mkEntries(b.id, [day(6)])
  const aBefore = (await listEntries(a.id, 1))[0].points
  const bBefore = (await listEntries(b.id, 1))[0].points
  tail = await afterKept(b, day(6))
  check(tail[0] === `Day 7 with Testa. ${BONUS_POINTS} points for both of you.` && tail[1] === "Testa's in too.", `B second on day 7 → bonus line + "in too" (${tail.join(' | ')})`)
  const aAfter = (await listEntries(a.id, 1))[0].points
  const bAfter = (await listEntries(b.id, 1))[0].points
  check(aAfter === aBefore + BONUS_POINTS && bAfter === bBefore + BONUS_POINTS, `both latest entries +${BONUS_POINTS} (${aBefore}→${aAfter}, ${bBefore}→${bAfter})`)
  const { data: r1 } = await sb.from('onething_buddies').select('*').eq('id', row.id).single()
  check(r1.streak === 7 && r1.best === 7 && r1.last_bonus_day === day(6), `row stores streak 7, best 7, last_bonus_day ${day(6)}`)
  tail = await afterKept(a, day(6))
  const aAgain = (await listEntries(a.id, 1))[0].points
  check(aAgain === aAfter && !tail.some((t) => t.startsWith('Day 7')), 'running afterKept again the same day pays nothing twice')

  // The site's view for A on Aug 7.
  const v = await buddyViews(a, day(6))
  check(v.buddies.length === 1 && v.buddies[0].streak === 7 && v.buddies[0].inToday && v.buddies[0].nextBonusIn === 7, `buddyViews: streak 7, in today, next bonus in 7 (${JSON.stringify(v.buddies[0])})`)

  // Aug 8: nobody writes. Aug 9 morning: the question carries one reset line, once.
  let lines = await resetLines(a, day(8))
  check(lines.length === 1 && lines[0] === 'Buddy streak with 999 000 0002 reset to zero. Yours is fine.', `reset line on the morning after a missed day (${lines.join(' | ')})`)
  lines = await resetLines(a, day(8))
  check(lines.length === 0, 'the reset line is not repeated')
  const { data: r2 } = await sb.from('onething_buddies').select('*').eq('id', row.id).single()
  check(r2.streak === 0 && r2.best === 7, 'row now streak 0, best still 7')
} catch (e) {
  failures++
  console.log('FAIL threw:', (e as Error).message)
} finally {
  await cleanup()
  const { data } = await sb.from('onething_users').select('id').in('phone', [A_PHONE, B_PHONE])
  check((data ?? []).length === 0, 'throwaway users removed')
}
}

main().then(() => {
console.log(failures ? `${failures} failure(s)` : 'all passed')
process.exit(failures ? 1 : 0)
})

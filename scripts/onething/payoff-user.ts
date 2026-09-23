// A throwaway user (+1999…) with a seven-day streak ending today in LA, so the
// milestone payoff can be driven on localhost through /api/onething/dev/as.
//   set -a; source ./.env.local; set +a; npx tsx scripts/onething/payoff-user.ts   → prints the id
//   … payoff-user.ts cleanup                                                       → removes it
// Sends nothing (the +1999 range gets no texts).
import { f2Supabase } from '../../src/lib/f2/supabase'
import { addDays, localDay } from '../../src/lib/onething/core'
import { pointsForEntry } from '../../src/lib/onething/levels'
const PHONE = '+19990000007'
const sb = f2Supabase()
async function cleanup() {
  const { data } = await sb.from('onething_users').select('id').eq('phone', PHONE)
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  if (ids.length) {
    await sb.from('onething_entries').delete().in('user_id', ids)
    await sb.from('onething_users').delete().in('id', ids)
  }
  console.log('cleaned', ids.length)
}
async function main() {
  await cleanup()
  if (process.argv[2] === 'cleanup') return
  const { data: u, error } = await sb.from('onething_users').insert({ phone: PHONE, tz: 'America/Los_Angeles', name: 'Payoff Test' }).select('*').single()
  if (error) throw new Error(error.message)
  const today = localDay(new Date(), 'America/Los_Angeles')
  let points = 0
  for (let k = 1; k <= 7; k++) {
    const { base, bonus } = pointsForEntry(k); points += base + bonus
    const { error: e } = await sb.from('onething_entries').insert({ user_id: u.id, day: addDays(today, k - 7), text: `day ${k} of the test streak`, streak: k, points })
    if (e) throw new Error(e.message)
  }
  console.log(JSON.stringify({ id: u.id, today, points }))
}
main().catch((e) => { console.error(e); process.exit(1) })

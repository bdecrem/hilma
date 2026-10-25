// A throwaway user (+1999…) in Bart's October shape: a 36-day streak, a missed
// day exactly a week ago, four days, a missed day the day before yesterday,
// yesterday kept, today still open — and three jokers in hand. Drives the save
// on localhost through /api/onething/dev/as. Doodles off (no model calls).
//   set -a; source ./.env.local; set +a; npx tsx scripts/onething/joker-user.ts   → prints the id
//   … joker-user.ts cleanup                                                       → removes it
// Sends nothing (the +1999 range gets no texts).
import { f2Supabase } from '../../src/lib/f2/supabase'
import { addDays, localDay } from '../../src/lib/onething/core'
import { pointsForEntry } from '../../src/lib/onething/levels'
const PHONE = '+19990000010'
const sb = f2Supabase()
const SENTENCES = ['Fog on the hill until noon.', 'Fixed the gate, finally.', 'Long call with Mom.', 'Bread came out flat but good.', 'Walked the long way home.', 'The fig tree dropped everything at once.']
async function cleanup() {
  const { data } = await sb.from('onething_users').select('id').eq('phone', PHONE)
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  if (ids.length) await sb.from('onething_users').delete().in('id', ids) // entries and saves cascade
  console.log('cleaned', ids.length)
}
async function main() {
  await cleanup()
  if (process.argv[2] === 'cleanup') return
  const tz = 'America/Los_Angeles'
  const today = localDay(new Date(), tz)
  const { data: u, error } = await sb.from('onething_users').insert({ phone: PHONE, tz, name: 'Joker Test', doodles: false, jokers: 3, created_at: `${addDays(today, -60)}T12:00:00Z` }).select('*').single()
  if (error) throw new Error(error.message)
  const missed = new Set([addDays(today, -7), addDays(today, -2)])
  let streak = 0, points = 0, prev: string | null = null
  for (let k = 43; k >= 1; k--) { // today−43 … today−8: 36 days
    const day = addDays(today, -k)
    if (missed.has(day)) continue
    streak = prev === addDays(day, -1) ? streak + 1 : 1
    const { base, bonus } = pointsForEntry(streak); points += base + bonus
    const { error: e } = await sb.from('onething_entries').insert({ user_id: u.id, day, text: SENTENCES[k % SENTENCES.length], streak, points })
    if (e) throw new Error(e.message)
    prev = day
  }
  console.log(JSON.stringify({ id: u.id, today, streak, points }))
}
main().catch((e) => { console.error(e); process.exit(1) })

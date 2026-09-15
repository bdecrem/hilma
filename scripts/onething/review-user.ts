// A throwaway account for reviewing the site on localhost: joined 17 days
// ago, eight days of sentences (a Sapling, streak alive through yesterday so
// today is still open, the days before that missed), one active buddy six
// days in, one invite out, one invite waiting.
// Sends nothing. Numbers are +1999…, like buddy-db-check.ts. Production's
// hourly tick will try to text them and fail quietly until `down`.
//   set -a; . .env.local; set +a; npx tsx scripts/onething/review-user.ts up    # prints the ids
//   set -a; . .env.local; set +a; npx tsx scripts/onething/review-user.ts down  # removes everything
import { f2Supabase } from '../../src/lib/f2/supabase'
import { addDays, localDay, pointsForEntry, type User } from '../../src/lib/onething/core'

const PHONES = { me: '+19990000011', buddy: '+19990000012', out: '+19990000013', waiting: '+19990000014' }
const sb = f2Supabase()

async function down() {
  const { data } = await sb.from('onething_users').select('id').in('phone', Object.values(PHONES))
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  if (ids.length === 0) return console.log('nothing to remove')
  await sb.from('onething_buddies').delete().or(`inviter_id.in.(${ids.join(',')}),invitee_id.in.(${ids.join(',')})`)
  await sb.from('onething_buddies').delete().in('invitee_handle', Object.values(PHONES))
  await sb.from('onething_entries').delete().in('user_id', ids)
  for (const id of ids) {
    const { data: objs } = await sb.storage.from('onething-avatars').list(id)
    if (objs?.length) await sb.storage.from('onething-avatars').remove(objs.map((o) => `${id}/${o.name}`))
  }
  await sb.from('onething_users').delete().in('id', ids)
  console.log('removed', ids.length, 'accounts')
}

async function mkUser(phone: string, name: string | null, created_at?: string): Promise<User> {
  const { data, error } = await sb.from('onething_users').insert({ phone, tz: 'America/Los_Angeles', name, ...(created_at ? { created_at } : {}) }).select('*').single()
  if (error) throw new Error(error.message)
  return data as User
}

async function seedDays(user: User, texts: string[], through: string) {
  let points = 0
  const rows = texts.map((text, i) => {
    const streak = i + 1
    const { base, bonus } = pointsForEntry(streak)
    points += base + bonus
    return { user_id: user.id, day: addDays(through, i - (texts.length - 1)), text, streak, points }
  })
  const { error } = await sb.from('onething_entries').insert(rows)
  if (error) throw new Error(error.message)
  return points
}

async function up() {
  await down()
  const yesterday = addDays(localDay(new Date(), 'America/Los_Angeles'), -1)
  const me = await mkUser(PHONES.me, 'Ada', `${addDays(yesterday, -16)}T18:00:00Z`)
  const buddy = await mkUser(PHONES.buddy, 'Sam')
  const waiting = await mkUser(PHONES.waiting, 'Priya')
  const points = await seedDays(me, [
    'Signed up for this on a whim, then wrote the first line standing in the kitchen.',
    'The neighbour’s cat sat on the warm hood of the car for the whole of lunch.',
    'Finished the last chapter on the train and missed my stop by one.',
    'Rain all morning, then the light came in sideways around four.\nSam texted a photo of the same sky from across town.',
    'Fixed the wobbly chair with a folded receipt.',
    'A long call with my sister, mostly about nothing, which was the point.',
    'Burnt the toast twice and ate it anyway.',
    'Walked the long way home and found a street I had never been down.',
  ], yesterday)
  await seedDays(buddy, ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven.', 'Eight.'], yesterday)
  const start_day = addDays(yesterday, -5) // six days both wrote → pair streak 6, next bonus in 1
  const { error: bErr } = await sb.from('onething_buddies').insert([
    { inviter_id: buddy.id, invitee_handle: me.phone, invitee_id: me.id, status: 'active', accepted_at: new Date().toISOString(), start_day, streak: 6, best: 6 },
    // every row names every column: a multi-row insert sends null for a missing key, not the default
    { inviter_id: me.id, invitee_handle: PHONES.out, invitee_id: null, status: 'pending', accepted_at: null, start_day: null, streak: 0, best: 0 },
    { inviter_id: waiting.id, invitee_handle: me.phone, invitee_id: null, status: 'pending', accepted_at: null, start_day: null, streak: 0, best: 0 },
  ])
  if (bErr) throw new Error(bErr.message)
  console.log(`review account ${me.phone} (${points} points): ${me.id}`)
  console.log(`sign in on localhost: http://localhost:3000/api/onething/dev/as?id=${me.id}`)
}

const mode = process.argv[2]
if (mode === 'up') up().catch((e) => { console.error(e); process.exit(1) })
else if (mode === 'down') down().catch((e) => { console.error(e); process.exit(1) })
else { console.error('usage: review-user.ts up|down'); process.exit(2) }

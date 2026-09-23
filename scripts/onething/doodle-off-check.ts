// With doodles off, doodleEntry draws nothing: flips the throwaway user Ada
// (+1999…11) off, asks for one of her days, expects null, flips her back.
//   set -a; source ./.env.local; set +a; npx tsx scripts/onething/doodle-off-check.ts
import { f2Supabase } from '../../src/lib/f2/supabase'
import { doodleEntry } from '../../src/lib/onething/doodle'
const PHONE = '+19990000011'
async function main() {
  const sb = f2Supabase()
  const { data: u } = await sb.from('onething_users').select('id, doodles').eq('phone', PHONE).maybeSingle()
  if (!u) throw new Error('no throwaway user')
  const { data: e } = await sb.from('onething_entries').select('id, doodle').eq('user_id', u.id).order('day', { ascending: false }).limit(1).maybeSingle()
  if (!e) throw new Error('no entry')
  await sb.from('onething_users').update({ doodles: false }).eq('id', u.id)
  try {
    const d = await doodleEntry(e.id)
    const { data: after } = await sb.from('onething_entries').select('doodle').eq('id', e.id).single()
    const untouched = after?.doodle === e.doodle
    console.log(d === null && untouched ? 'ok   off → nothing drawn, row untouched' : `FAIL drew=${d !== null} untouched=${untouched}`)
    if (d !== null || !untouched) process.exitCode = 1
  } finally {
    await sb.from('onething_users').update({ doodles: u.doodles ?? true }).eq('id', u.id)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })

// Count a refresher as taken on certified topics: bumps recert_stage, moves
// recert_due_at to the next free Friday at the new interval, pays RECERT_XP.
// Same code path as a passed refresher (applyRecertRenewal). Written for
// 2026-10-02, when three of Bart's refreshers were recorded as full Final
// Reviews (B each) and therefore never renewed.
//
// Run: set -a; source .env.local; set +a
//      npx tsx scripts/f2-recert-renew.ts [--dry] <thread-id> [<thread-id> ...]
import { f2Supabase } from '../src/lib/f2/supabase'
import {
  RECERT_XP,
  applyRecertRenewal,
  recertIntervalDays,
  scheduleRecertDue,
} from '../src/lib/f2/flash'

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const ids = args.filter((a) => !a.startsWith('--'))
  if (ids.length === 0) {
    console.error('usage: f2-recert-renew.ts [--dry] <thread-id> ...')
    process.exit(1)
  }
  const sb = f2Supabase()
  for (const id of ids) {
    const { data: t, error } = await sb
      .from('f2_threads')
      .select('id, user_id, topic, stars, recert_stage, recert_due_at')
      .eq('id', id)
      .maybeSingle()
    if (error || !t) {
      console.error(`${id}: not found`, error?.message ?? '')
      process.exitCode = 1
      continue
    }
    if ((t.stars ?? 0) < 3) {
      console.error(`${id} "${t.topic}": stars=${t.stars}, not certified — skipped`)
      process.exitCode = 1
      continue
    }
    const stage = t.recert_stage ?? 0
    const nextStage = stage + 1
    if (dry) {
      const due = await scheduleRecertDue(t.user_id, t.id, Date.now(), recertIntervalDays(nextStage))
      console.log(`DRY "${t.topic}": stage ${stage} → ${nextStage}, due ${t.recert_due_at} → ${due} (+${RECERT_XP} XP)`)
      continue
    }
    const due = await applyRecertRenewal(t.user_id, t.id, stage)
    const { data: after } = await sb
      .from('f2_threads')
      .select('recert_stage, recert_due_at')
      .eq('id', t.id)
      .maybeSingle()
    console.log(`RENEWED "${t.topic}": stage ${stage} → ${after?.recert_stage}, due ${t.recert_due_at} → ${after?.recert_due_at} (requested ${due}, +${RECERT_XP} XP)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

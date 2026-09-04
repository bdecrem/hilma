// One-off: set a grade on a voice session and apply its recert effects.
// Usage: set -a && source .env.local && set +a && npx tsx scripts/f2/set-review-grade.ts <voice_session_id> <grade> "<note>"
import { f2Supabase } from '../../src/lib/f2/supabase'
import { applyRecertRenewal, recertRenews, recordVoiceSessionGrade, type FinalReviewGrade } from '../../src/lib/f2/flash'

async function main() {
  const [sessionId, letter, note] = process.argv.slice(2)
  const grade = letter as FinalReviewGrade['grade']
  const { data: s } = await f2Supabase().from('f2_voice_sessions').select('id,user_id,thread_id,mode,grade').eq('id', sessionId).single()
  if (!s) throw new Error('session not found')
  const { data: t } = await f2Supabase().from('f2_threads').select('id,topic,stars,recert_stage,recert_due_at').eq('id', s.thread_id).single()
  if (!t) throw new Error('thread not found')
  console.log('before', { mode: s.mode, grade: s.grade, stars: t.stars, stage: t.recert_stage, due: t.recert_due_at })
  await recordVoiceSessionGrade(s.user_id, s.id, { grade, passed: grade === 'A', notes: note ?? 'Grade set by the user.', strengths: [], weaknesses: [] })
  let due = t.recert_due_at
  if (t.stars >= 3 && recertRenews(grade)) due = await applyRecertRenewal(s.user_id, t.id, t.recert_stage ?? 0)
  const { data: after } = await f2Supabase().from('f2_threads').select('stars,recert_stage,recert_due_at').eq('id', t.id).single()
  console.log('after', { grade, ...after, due })
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

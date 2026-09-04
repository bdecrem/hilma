// iMessage is the daily-card channel and nothing else. This drives
// processMessage exactly as the BlueBubbles webhook does, on the F2 test
// account (never Bart's), through every daily-card state and a set of
// stray texts, and asserts that nothing outside the state machine ever
// reaches the command router or topic chat. Regression check for the
// 2026-09-04 bug: a duplicate bonus letter fell through to chat and the
// latest topic's open quiz ran over iMessage.
//
//   npx tsx scripts/f2-imessage-gate-check.ts
//
// Grades two cards for real (Anthropic), then restores the account's
// xp / streak / credits / daily_card to what they were.
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const T = '853d0054-7de2-4359-9133-8c14ff3f2653' // newx-test, never Bart's

async function main() {
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const { processMessage } = await import('../src/lib/f2/agent')
  const { IMESSAGE_DAILY_ONLY_REPLY } = await import('../src/lib/f2/daily-card')
  const sb = f2Supabase()
  let failed = 0
  const check = (name: string, ok: boolean, got?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)?.slice(0, 300)}`}`)
    if (!ok) failed++
  }
  const userRow = async () => (await sb.from('f2_users').select('*').eq('id', T).single()).data as Record<string, unknown>
  const threadsSnap = async () => {
    const { data } = await sb.from('f2_threads').select('id, updated_at, messages').eq('user_id', T)
    return (data ?? []).map((t) => `${t.id}:${(t.messages as unknown[]).length}:${t.updated_at}`).sort().join('|')
  }
  const state = async () => (await sb.from('f2_users').select('daily_card').eq('id', T).single()).data?.daily_card
  const send = (text: string) => processMessage({ userId: T, handle: 'test-chat', text, client: 'imessage' })

  const before = await userRow()
  const tBefore = await threadsSnap()
  await sb.from('f2_users').update({ daily_card: null }).eq('id', T)

  // 1. Nothing pending: strays, commands, and URLs all get the pointer and touch nothing.
  for (const text of ['A', 'The plaster acts as the binder', 'quote "hello world" (me)', 'https://en.wikipedia.org/wiki/Fresco', 'dodo make flash cards', 'setup: frescoes', 'new none frescoes', 'reflection quiz', '1']) {
    const r = await send(text)
    check(`idle "${text.slice(0, 24)}" → pointer`, r.reply === IMESSAGE_DAILY_ONLY_REPLY && !r.thread_id, r)
  }
  check('idle: no thread touched', (await threadsSnap()) === tBefore)
  const mid = await userRow()
  const drift = Object.keys(before).filter((k) => k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(mid[k]))
  check('idle: user row untouched', drift.length === 0, drift)

  // 2. Daily question pending → freeform answer graded, bonus offered.
  const { data: pool } = await sb.from('f2_flash_cards').select('id, question, answer').eq('user_id', T).is('rating', null).limit(1)
  const card = pool![0]
  await sb.from('f2_users').update({ daily_card: { card_id: card.id, sent_at: new Date().toISOString() } }).eq('id', T)
  let r = await send(card.answer)
  check('daily answer graded', /^(✅ Right\.|❌ Not quite)/.test(r.reply) && r.reply.includes('Press 1 for today\'s bonus question.'), r)
  let s = await state()
  check('state → bonus_offer', s?.stage === 'bonus_offer', s)

  // 3. Bonus offer standing: a stray text gets the reminder + pointer, offer stands.
  r = await send('thanks!')
  check('offer + stray → reminder', r.reply === `Press 1 for today's bonus question. ${IMESSAGE_DAILY_ONLY_REPLY}`, r)
  s = await state()
  check('offer still standing', s?.stage === 'bonus_offer', s)

  // 4. "1" → multiple-choice bonus question.
  r = await send('1')
  check('"1" → bonus question', r.reply.startsWith('🎁 Bonus question:') && /\nA\. /.test(r.reply), r)
  s = await state()
  check('state → bonus_question', s?.stage === 'bonus_question' && Array.isArray(s.choices), s)

  // 5. Letter → graded, flow ends.
  r = await send('A')
  check('letter graded', /^(✅ Right\.|❌ Not quite)/.test(r.reply) && r.reply.includes('Both answers count on your Peck map'), r)
  s = await state()
  check('state cleared', s == null, s)

  // 6. The 2026-09-04 bug: a duplicate "A" two seconds later. Must NOT reach chat.
  const tMid = await threadsSnap()
  r = await send('A')
  check('duplicate "A" → pointer, not chat', r.reply === IMESSAGE_DAILY_ONLY_REPLY && !r.thread_id, r)
  check('duplicate "A": no thread touched', (await threadsSnap()) === tMid)

  // Restore the test account (daily_card, xp, streak, credits…) to what it was.
  const after = await userRow()
  const restore: Record<string, unknown> = {}
  for (const k of Object.keys(before)) {
    if (k === 'id' || k === 'updated_at') continue
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) restore[k] = before[k]
  }
  if (Object.keys(restore).length) {
    const { error } = await sb.from('f2_users').update(restore).eq('id', T)
    console.log(`restored ${Object.keys(restore).join(', ')}${error ? ` — ERROR ${error.message}` : ''}`)
  }
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

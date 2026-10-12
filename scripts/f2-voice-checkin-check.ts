// Daily Voice Checkin, end to end below the app, on the F2 test account
// (never Bart's). Restores everything it touches.
//
//   npx tsx scripts/f2-voice-checkin-check.ts [--voice] [--thread <id>]
//
// 1. The pick: one per PT day, the same under concurrent asks, from active
//    topics only (never an Inactive one), with a high-level question.
// 2. iMessage "9": marks the texted topic Inactive (via processMessage, as the
//    webhook drives it); a daily card sent later keeps its "9"; an Inactive
//    topic leaves the checkin, Actively Read and Peck pools; the Rename
//    sheet's kind change brings it back.
// 3. Recording: a pass counts once for the day (streak bumped, XP paid), a
//    second grade the same day pays nothing more, "no answer" never counts.
// 4. --voice: three simulated conversations through the real voice prompt and
//    model (the ElevenLabs engine's Claude turn) with a simulated student, then
//    the real grader: a good first answer passes on attempt 1; a bad first
//    answer gets the explanation and a second chance that passes; two bad
//    answers fail.
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const T = '853d0054-7de2-4359-9133-8c14ff3f2653' // newx-test
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

async function main() {
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const VC = await import('../src/lib/f2/voice-checkin')
  const AR = await import('../src/lib/f2/actively-read')
  const { processMessage } = await import('../src/lib/f2/agent')
  const { peckExcludedThreadIds, judgeVoiceCheckin } = await import('../src/lib/f2/flash')
  const { ptDay, getDailyStreak } = await import('../src/lib/f2/streak')
  const sb = f2Supabase()
  let failed = 0
  const check = (name: string, ok: boolean, got?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)?.slice(0, 400)}`}`)
    if (!ok) failed++
  }

  // --- snapshot ---------------------------------------------------------------
  const { data: userBefore } = await sb.from('f2_users').select('voice_checkin, voice_checkin_enabled, actively_read, daily_card, xp, daily_streak, daily_streak_date, peck_week_start').eq('id', T).single()
  const { data: threadsBefore } = await sb.from('f2_threads').select('id, kind, ar_inactive_at').eq('user_id', T)
  const restore = async () => {
    await sb.from('f2_users').update(userBefore!).eq('id', T)
    for (const t of threadsBefore ?? []) await sb.from('f2_threads').update({ kind: t.kind, ar_inactive_at: t.ar_inactive_at }).eq('id', t.id)
  }

  try {
    // --- 1. the pick ------------------------------------------------------------
    await sb.from('f2_users').update({ voice_checkin: null }).eq('id', T)
    const picks = await Promise.all([VC.ensureTodaysCheckin(T), VC.ensureTodaysCheckin(T)])
    check('a checkin exists', !!picks[0], picks[0])
    check('concurrent asks agree on one topic', picks.every((p) => p?.thread_id === picks[0]?.thread_id), picks.map((p) => p?.thread_id))
    const c = picks[0]!
    console.log(`  topic: ${c.topic}\n  question: ${c.question}`)
    check('the question is one high-level sentence', c.question.length > 12 && c.question.length <= 300 && /\?$/.test(c.question) && !/\d{4}/.test(c.question), c.question)
    check('the checkin is for today (PT)', c.day === ptDay(), c.day)
    const again = await VC.ensureTodaysCheckin(T)
    check('asking again returns the same checkin and question', again?.thread_id === c.thread_id && again?.question === c.question, again)
    const text = VC.voiceCheckinText(c)
    check('the text names the topic, the question, the link and "Reply 9"', text.includes(c.topic) && text.includes(c.question) && text.includes(`/checkin/${c.thread_id}`) && /reply 9/i.test(text), text)

    // --- 2. iMessage "9" --------------------------------------------------------
    const state = (await sb.from('f2_users').select('voice_checkin').eq('id', T).single()).data!.voice_checkin
    await sb.from('f2_users').update({ voice_checkin: { ...state, imessage_sent_at: new Date(Date.now() - 60_000).toISOString() }, daily_card: { card_id: 'x', sent_at: new Date().toISOString() }, actively_read: null }).eq('id', T)
    const deferred = await VC.maybeHandleVoiceCheckinReply(T, '9')
    check('a "9" after a newer daily card is not ours', deferred === null, deferred)
    await sb.from('f2_users').update({ daily_card: null }).eq('id', T)
    const viaGate = await processMessage({ userId: T, handle: 'test-chat', text: '9', client: 'imessage' })
    check('processMessage("9") marks the texted topic inactive', /is inactive now/.test(viaGate.reply ?? ''), viaGate)
    const { data: row } = await sb.from('f2_threads').select('kind').eq('id', c.thread_id).single()
    check('the topic\'s kind is inactive', row?.kind === 'inactive', row)
    check('today\'s checkin now reads inactive', (await VC.ensureTodaysCheckin(T))?.resolved === 'inactive')
    const second = await processMessage({ userId: T, handle: 'test-chat', text: '9', client: 'imessage' })
    check('a second "9" falls through to the daily-card reply', !/is inactive now/.test(second.reply ?? ''), second)
    check('an inactive topic is out of the Peck pool', (await peckExcludedThreadIds(T)).has(c.thread_id))
    await sb.from('f2_users').update({ actively_read: null }).eq('id', T)
    const arPick = await AR.ensureTodaysPick(T)
    check('an inactive topic is out of the Actively Read pool', arPick?.thread_id !== c.thread_id, arPick)
    await sb.from('f2_users').update({ voice_checkin: { ...state, day: '2000-01-01' } }).eq('id', T)
    const fresh = await VC.ensureTodaysCheckin(T)
    check('an inactive topic is out of the checkin pool', fresh?.thread_id !== c.thread_id, fresh)
    await sb.from('f2_threads').update({ kind: 'general' }).eq('id', c.thread_id)
    check('setting another kind brings it back', !(await peckExcludedThreadIds(T)).has(c.thread_id))

    // --- 3. recording -------------------------------------------------------------
    await sb.from('f2_users').update({ voice_checkin: { day: ptDay(), thread_id: c.thread_id, question: c.question, picked_at: new Date().toISOString() }, daily_streak: 0, daily_streak_date: null, peck_week_start: null }).eq('id', T)
    const xpBefore = (await sb.from('f2_users').select('xp').eq('id', T).single()).data!.xp as number
    const r1 = await VC.recordVoiceCheckin(T, c.thread_id, { outcome: 'passed' }, 'session-a')
    const xpAfter = (await sb.from('f2_users').select('xp').eq('id', T).single()).data!.xp as number
    check('a pass counts: streak 1, XP paid', r1.counted && r1.streak === 1 && r1.xp_awarded > 0 && xpAfter === xpBefore + r1.xp_awarded, { r1, xpBefore, xpAfter })
    check('the streak reads 1', (await getDailyStreak(T)).streak === 1)
    check('today\'s checkin reads passed', (await VC.ensureTodaysCheckin(T))?.resolved === 'passed')
    const r2 = await VC.recordVoiceCheckin(T, c.thread_id, { outcome: 'failed' }, 'session-b')
    check('a second grade the same day pays nothing', !r2.counted && r2.xp_awarded === 0 && (await sb.from('f2_users').select('xp').eq('id', T).single()).data!.xp === xpAfter, r2)
    await sb.from('f2_users').update({ voice_checkin: { day: ptDay(), thread_id: c.thread_id, question: c.question, picked_at: new Date().toISOString() } }).eq('id', T)
    const r3 = await VC.recordVoiceCheckin(T, c.thread_id, { outcome: 'no_answer' }, 'session-c')
    check('"no answer" never counts', !r3.counted && (await VC.ensureTodaysCheckin(T))?.resolved === null, r3)
    const r4 = await VC.recordVoiceCheckin(T, c.thread_id, { outcome: 'inactive' }, 'session-d')
    check('"done with this topic" in the chat makes it inactive', !r4.counted && (await sb.from('f2_threads').select('kind').eq('id', c.thread_id).single()).data?.kind === 'inactive', r4)
  } finally {
    await restore()
  }

  // --- 4. voice -----------------------------------------------------------------
  if (process.argv.includes('--voice')) {
    const { getThreadById, buildBudgetedContent } = await import('../src/lib/f2/threads')
    const { resolveVoiceStart } = await import('../src/lib/f2/voice-start')
    const { streamElevenTurn, turnMessages, elevenOpeningInstruction, ELEVEN_KICKOFF } = await import('../src/lib/f2/eleven')
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const threadId = arg('--thread') ?? 'dd124799-57cc-4e8b-aada-13937f6bfdde' // Sargon of Akkad
    const thread = (await getThreadById(T, threadId))!
    const start = await resolveVoiceStart({ id: T, username: 'newx-test@example.com' }, { mode: 'voice_checkin', thread_id: threadId }, 'eleven')
    if (!start.ok) throw new Error(`start: ${start.error}`)
    const question = start.instructions.match(/The question \(ask exactly this, in these words\):\n"([^"]+)"/)?.[1] ?? ''
    console.log(`  question: ${question}`)
    check('voice: the prompt carries one question', question.length > 12, start.instructions.slice(0, 300))
    const source = buildBudgetedContent(thread, 60_000)

    const student = async (persona: string, last: string) => {
      const r = await claude.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 400,
        output_config: { effort: 'low' },
        system: `You play a learner in a spoken conversation with a tutor named Dodo about "${thread.topic}". ${persona} Reply with only the words you say aloud, two or three sentences, no stage directions.\n\nWhat you know:\n${persona.includes('strong') ? source.slice(0, 40_000) : '(only a vague memory of the title)'}`,
        messages: [{ role: 'user', content: last }],
      })
      const b = r.content.find((x) => x.type === 'text')
      return b && b.type === 'text' ? b.text.trim() : '...'
    }
    const dodo = async (transcript: { role: 'user' | 'agent'; content: string }[]) => {
      let out = ''
      for await (const chunk of streamElevenTurn({ systemPrompt: start.instructions, messages: turnMessages(transcript, elevenOpeningInstruction('voice_checkin')) })) out += chunk
      return out.trim()
    }
    const run = async (label: string, script: (turn: number, last: string) => Promise<string | null>) => {
      const transcript: { role: 'user' | 'agent'; content: string }[] = [{ role: 'user', content: ELEVEN_KICKOFF }]
      const spoken: { role: 'user' | 'assistant'; text: string }[] = []
      for (let turn = 0; turn < 8; turn++) {
        const said = await dodo(transcript)
        transcript.push({ role: 'agent', content: said })
        spoken.push({ role: 'assistant', text: said })
        console.log(`  [${label}] DODO: ${said.slice(0, 260)}${said.length > 260 ? '…' : ''}`)
        if (/that's your checkin|tap end/i.test(said)) break
        const reply = await script(turn, said)
        if (reply == null) break
        transcript.push({ role: 'user', content: reply })
        spoken.push({ role: 'user', text: reply })
        console.log(`  [${label}] USER: ${reply.slice(0, 260)}`)
      }
      return spoken
    }
    const strongPersona = 'You studied this material well (you are a strong student): answer the question correctly at the big-picture level, in your own words, never quoting the material.'
    const weakPersona = 'You barely remember this topic (you are a weak student, and a stubborn one): give a confident but WRONG guess about the big picture — invent a plausible-sounding wrong idea — and never use anything the tutor just said; if the tutor explained something, ignore it and give a different wrong guess. Never admit outright that you do not know.'

    // A: good first answer → pass on attempt 1.
    const a = await run('first-try', async (_t, last) => student(strongPersona, last))
    const aDodo = a.filter((t) => t.role === 'assistant').map((t) => t.text).join('\n')
    check('voice: Dodo opens with the question', /\?/.test(a[0]?.text ?? ''), a[0])
    check('voice: a good answer gets "Pass" and the checkin ends', /\bpass\b/i.test(aDodo) && /that's your checkin|tap end/i.test(aDodo), aDodo.slice(0, 600))
    const gA = await judgeVoiceCheckin(thread, question, a)
    console.log('  first-try grade:', JSON.stringify(gA))
    check('grade: passes on attempt 1', gA.outcome === 'passed' && gA.passed_on === 1, gA)

    // B: bad first answer → explanation → second chance → good answer → pass on 2.
    let bTurn = 0
    const b = await run('second-chance', async (_t, last) => student(bTurn++ === 0 ? weakPersona : strongPersona, last))
    const bDodo = b.filter((t) => t.role === 'assistant').map((t) => t.text).join('\n')
    check('voice: a bad answer gets "Not yet", an explanation and "Second chance"', /not yet/i.test(bDodo) && /second chance/i.test(bDodo), bDodo.slice(0, 900))
    const gB = await judgeVoiceCheckin(thread, question, b)
    console.log('  second-chance grade:', JSON.stringify(gB))
    check('grade: passes on attempt 2', gB.outcome === 'passed' && gB.passed_on === 2, gB)

    // C: two bad answers → fail, and never a third question.
    const cc = await run('fail', async (_t, last) => student(weakPersona, last))
    const cDodo = cc.filter((t) => t.role === 'assistant').map((t) => t.text).join('\n')
    check('voice: two bad answers end with a verdict, no third ask', /not this time|not yet/i.test(cDodo) && /that's your checkin|tap end/i.test(cDodo) && (cDodo.match(/second chance/gi) ?? []).length <= 1, cDodo.slice(0, 900))
    const gC = await judgeVoiceCheckin(thread, question, cc)
    console.log('  fail grade:', JSON.stringify(gC))
    check('grade: two bad answers fail', gC.outcome === 'failed', gC)
  }

  console.log(failed ? `\n${failed} FAILED` : '\nall passed')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

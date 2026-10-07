// Actively Read, end to end below the app, on the F2 test account (never
// Bart's). Restores everything it touches.
//
//   npx tsx scripts/f2-actively-read-check.ts [--voice] [--thread <id>]
//
// 1. The daily pick: chosen once per PT day, the same under concurrent asks,
//    only from unstarred, undeclined topics.
// 2. iMessage "2": declines the texted pick (via processMessage, as the
//    webhook drives it); a bonus question sent later keeps its "2"; undo.
// 3. The award: first star + exactly one Peck level (streak marked, XP paid),
//    never twice for the same topic.
// 4. --voice: three simulated conversations through the real voice prompt and
//    model (the ElevenLabs engine's Claude turn) with a simulated student, then
//    the real grader: a strong test passes (A- or better), a weak test fails,
//    "not interested" grades as declined.
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const T = '853d0054-7de2-4359-9133-8c14ff3f2653' // newx-test
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

async function main() {
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const AR = await import('../src/lib/f2/actively-read')
  const { processMessage } = await import('../src/lib/f2/agent')
  const { getJumboState, judgeActivelyRead } = await import('../src/lib/f2/flash')
  const { ptDay } = await import('../src/lib/f2/streak')
  const sb = f2Supabase()
  let failed = 0
  const check = (name: string, ok: boolean, got?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)?.slice(0, 400)}`}`)
    if (!ok) failed++
  }

  // --- snapshot ---------------------------------------------------------------
  const { data: userBefore } = await sb.from('f2_users').select('actively_read, daily_card, xp, peck_week_start').eq('id', T).single()
  const { data: threadsBefore } = await sb.from('f2_threads').select('id, stars, ar_inactive_at, ar_passed_at').eq('user_id', T)
  const { data: setsBefore } = await sb.from('f2_flash_sets').select('id').eq('user_id', T).not('jumbo_level', 'is', null)
  const setIdsBefore = new Set((setsBefore ?? []).map((s) => s.id))
  const restore = async () => {
    await sb.from('f2_users').update(userBefore!).eq('id', T)
    for (const t of threadsBefore ?? []) await sb.from('f2_threads').update({ stars: t.stars, ar_inactive_at: t.ar_inactive_at, ar_passed_at: t.ar_passed_at }).eq('id', t.id)
    const { data: setsAfter } = await sb.from('f2_flash_sets').select('id').eq('user_id', T).not('jumbo_level', 'is', null)
    const extra = (setsAfter ?? []).map((s) => s.id).filter((id) => !setIdsBefore.has(id))
    if (extra.length) await sb.from('f2_flash_sets').delete().in('id', extra)
  }

  try {
    // --- 1. the pick ------------------------------------------------------------
    await sb.from('f2_users').update({ actively_read: null }).eq('id', T)
    const picks = await Promise.all([AR.ensureTodaysPick(T), AR.ensureTodaysPick(T), AR.ensureTodaysPick(T)])
    check('a pick exists', !!picks[0], picks[0])
    check('concurrent asks agree on one topic', picks.every((p) => p?.thread_id === picks[0]?.thread_id), picks.map((p) => p?.thread_id))
    const pick = picks[0]!
    const pt = (threadsBefore ?? []).find((t) => t.id === pick.thread_id)
    check('the pick is unstarred and not declined', pt?.stars === 0 && !pt?.ar_inactive_at, pt)
    check('the pick is for today (PT)', pick.day === ptDay(), pick.day)
    const again = await AR.ensureTodaysPick(T)
    check('asking again returns the same pick', again?.thread_id === pick.thread_id, again)

    // --- 2. iMessage "2" --------------------------------------------------------
    const state = (await sb.from('f2_users').select('actively_read').eq('id', T).single()).data!.actively_read
    await sb.from('f2_users').update({ actively_read: { ...state, imessage_sent_at: new Date(Date.now() - 60_000).toISOString() }, daily_card: { stage: 'bonus_question', card_id: 'x', sent_at: new Date().toISOString(), choices: ['a', 'b'] } }).eq('id', T)
    const deferred = await AR.maybeHandleActivelyReadReply(T, '2')
    check('a "2" after a newer bonus question is not ours', deferred === null, deferred)
    await sb.from('f2_users').update({ daily_card: null }).eq('id', T)
    const viaGate = await processMessage({ userId: T, handle: 'test-chat', text: '2', client: 'imessage' })
    check('processMessage("2") declines the texted pick', /off your Actively Read list/.test(viaGate.reply ?? ''), viaGate)
    const { data: declinedRow } = await sb.from('f2_threads').select('ar_inactive_at').eq('id', pick.thread_id).single()
    check('the topic is marked not interested', !!declinedRow?.ar_inactive_at, declinedRow)
    const after = await AR.ensureTodaysPick(T)
    check('today\'s pick now reads declined', after?.resolved === 'declined', after)
    const second = await processMessage({ userId: T, handle: 'test-chat', text: '2', client: 'imessage' })
    check('a second "2" falls through to the daily-card reply', !/off your Actively Read list/.test(second.reply ?? ''), second)
    await AR.undoDeclineActivelyRead(T, pick.thread_id)
    const { data: undone } = await sb.from('f2_threads').select('ar_inactive_at').eq('id', pick.thread_id).single()
    check('undo clears not interested', undone?.ar_inactive_at === null, undone)
    check('undo reopens today\'s pick', (await AR.ensureTodaysPick(T))?.resolved === null)

    // --- 3. the award -----------------------------------------------------------
    await sb.from('f2_users').update({ actively_read: { day: ptDay(), thread_id: pick.thread_id, picked_at: new Date().toISOString() } }).eq('id', T)
    const before = await getJumboState(T)
    const xpBefore = (await sb.from('f2_users').select('xp').eq('id', T).single()).data!.xp as number
    const reward = await AR.awardActivelyRead(T, pick.thread_id)
    const afterJumbo = await getJumboState(T)
    const xpAfter = (await sb.from('f2_users').select('xp, peck_week_start').eq('id', T).single()).data!
    check('award: first star', reward.stars === 1, reward)
    check('award: exactly the next Peck level', reward.peck_level === before.highest_passed + 1 && afterJumbo.highest_passed === before.highest_passed + 1, { reward, before: before.highest_passed, after: afterJumbo.highest_passed })
    check('award: XP paid', reward.xp_awarded > 0 && (xpAfter.xp as number) === xpBefore + reward.xp_awarded, { reward, xpBefore, xpAfter })
    check('award: weekly Peck streak marked today', xpAfter.peck_week_start === ptDay(), xpAfter)
    const twice = await AR.awardActivelyRead(T, pick.thread_id)
    await AR.declineActivelyRead(T, pick.thread_id)
    check('a later decline never overrides a pass', (await AR.ensureTodaysPick(T))?.resolved === 'passed')
    check('award: never twice', twice.peck_level === null && (await getJumboState(T)).highest_passed === afterJumbo.highest_passed, twice)
    check('award resolves today\'s pick as passed', (await AR.ensureTodaysPick(T))?.resolved === 'passed')
    const text = AR.activelyReadText(pick.topic, pick.thread_id)
    check('the text names the topic, the link and "Reply 2"', text.includes(pick.topic) && text.includes(`/read/${pick.thread_id}`) && text.includes('Reply 2'), text)
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
    const start = await resolveVoiceStart({ id: T, username: 'newx-test@example.com' }, { mode: 'actively_read', thread_id: threadId }, 'eleven')
    if (!start.ok) throw new Error(`start: ${start.error}`)
    const source = buildBudgetedContent(thread, 60_000)

    // The student: a second model that plays the user's side.
    const student = async (persona: string, history: { role: 'user' | 'agent'; content: string }[]) => {
      const r = await claude.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 400,
        output_config: { effort: 'low' },
        system: `You play a learner in a spoken conversation with a tutor named Dodo about "${thread.topic}". ${persona} Reply with only the words you say aloud, one or two sentences, no stage directions.\n\nWhat you know:\n${persona.includes('strong') ? source.slice(0, 40_000) : '(only a vague memory of the title)'}`,
        messages: history.length ? history.map((h) => ({ role: h.role === 'agent' ? 'user' : 'assistant', content: h.content })).filter((m, i, a) => !(i === 0 && m.role === 'assistant')) as never : [{ role: 'user', content: '(start)' }],
      })
      const b = r.content.find((x) => x.type === 'text')
      return b && b.type === 'text' ? b.text.trim() : '...'
    }
    const dodo = async (transcript: { role: 'user' | 'agent'; content: string }[]) => {
      let out = ''
      for await (const chunk of streamElevenTurn({ systemPrompt: start.instructions, messages: turnMessages(transcript, elevenOpeningInstruction('actively_read')) })) out += chunk
      return out.trim()
    }

    const run = async (label: string, script: (turn: number, last: string) => Promise<string | null>) => {
      const transcript: { role: 'user' | 'agent'; content: string }[] = [{ role: 'user', content: ELEVEN_KICKOFF }]
      const spoken: { role: 'user' | 'assistant'; text: string }[] = []
      for (let turn = 0; turn < 12; turn++) {
        const said = await dodo(transcript)
        transcript.push({ role: 'agent', content: said })
        spoken.push({ role: 'assistant', text: said })
        console.log(`  [${label}] DODO: ${said.slice(0, 220)}${said.length > 220 ? '…' : ''}`)
        if (/that's the test|tap end/i.test(said) && turn > 0) break
        const reply = await script(turn, said)
        if (reply == null) break
        transcript.push({ role: 'user', content: reply })
        spoken.push({ role: 'user', text: reply })
        console.log(`  [${label}] USER: ${reply.slice(0, 220)}`)
      }
      return spoken
    }

    // Strong: one exchange of conversation, then "I'm ready", then good answers.
    const strong = await run('strong', async (turn, last) => {
      if (turn === 0) return 'I know he founded an empire, but tell me the main idea in a nutshell.'
      if (turn === 1) return "Okay, I'm ready."
      return student('You studied this material well some days ago (you are a strong student): answer each question correctly, in your own words (never quote the material), with the key reason or mechanism and a supporting detail.', [{ role: 'agent', content: last }])
    })
    const sDodo = strong.filter((t) => t.role === 'assistant').map((t) => t.text).join('\n')
    check('voice: "I\'m ready" starts the three-question test', /three questions/i.test(sDodo), sDodo.slice(0, 600))
    check('voice: the test ends with "Tap End"', /tap end/i.test(strong[strong.length - 1]?.text ?? ''), strong[strong.length - 1])
    const gStrong = await judgeActivelyRead(thread, strong)
    console.log('  strong grade:', JSON.stringify(gStrong))
    check('grade: a strong test passes (A- or better, 3 answered)', gStrong.outcome === 'tested' && gStrong.passed, gStrong)

    const weak = await run('weak', async (turn) => {
      if (turn === 0) return "I'm ready, test me."
      return ["I don't really remember.", 'Something about a king? Not sure.', 'No idea, sorry.'][Math.min(2, turn - 1)]
    })
    const gWeak = await judgeActivelyRead(thread, weak)
    console.log('  weak grade:', JSON.stringify(gWeak))
    check('grade: a weak test fails', gWeak.outcome === 'tested' && !gWeak.passed, gWeak)

    const declined = await run('declined', async (turn) => (turn === 0 ? "Honestly I'm not interested in this one." : null))
    const dLast = declined.filter((t) => t.role === 'assistant').pop()?.text ?? ''
    check('voice: "not interested" is acknowledged without a pitch', /off your daily picks|no problem/i.test(dLast), dLast)
    const gDecl = await judgeActivelyRead(thread, declined)
    console.log('  declined grade:', JSON.stringify(gDecl))
    check('grade: "not interested" grades as declined', gDecl.outcome === 'declined' && !gDecl.passed && gDecl.grade === null, gDecl)
  }

  console.log(failed ? `\n${failed} FAILED` : '\nall passed')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

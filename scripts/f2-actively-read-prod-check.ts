// Actively Read through PRODUCTION's routes, on the F2 test account (never
// Bart's): start a real `actively_read` voice session (ElevenLabs engine),
// play a strong conversation through the same voice prompt + model locally,
// upload it through the real finish route, grade it through the real grade
// route, and check the reward (star 1, the next Peck level, today's pick
// resolved). Restores the account afterwards.
//
//   npx tsx scripts/f2-actively-read-prod-check.ts [--base https://feynd.cc] [--thread <id>]
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const T = '853d0054-7de2-4359-9133-8c14ff3f2653'
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'https://feynd.cc')!

async function main() {
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const { getJumboState } = await import('../src/lib/f2/flash')
  const { getThreadById, buildBudgetedContent } = await import('../src/lib/f2/threads')
  const { resolveVoiceStart } = await import('../src/lib/f2/voice-start')
  const { streamElevenTurn, turnMessages, elevenOpeningInstruction, ELEVEN_KICKOFF } = await import('../src/lib/f2/eleven')
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const sb = f2Supabase()
  let failed = 0
  const check = (name: string, ok: boolean, got?: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)?.slice(0, 500)}`}`)
    if (!ok) failed++
  }

  // Sign in to the deployment.
  const login = await fetch(`${BASE}/api/f2/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'newx-test@example.com', password: process.env.F2_TEST_PASS }) })
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  if (!login.ok || !cookie) throw new Error(`login failed ${login.status}`)
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) } })
    const body = await r.json().catch(() => ({}))
    return { status: r.status, body }
  }

  const { body: pickBody } = await api('/api/f2/actively-read')
  const threadId = arg('--thread') ?? pickBody.pick?.thread_id
  check('production returns today\'s pick', !!threadId, pickBody)

  // Snapshot for restore.
  const { data: userBefore } = await sb.from('f2_users').select('actively_read, xp, peck_week_start').eq('id', T).single()
  const { data: threadBefore } = await sb.from('f2_threads').select('stars, ar_inactive_at, ar_passed_at').eq('id', threadId).single()
  const { data: setsBefore } = await sb.from('f2_flash_sets').select('id').eq('user_id', T).not('jumbo_level', 'is', null)
  const before = new Set((setsBefore ?? []).map((s) => s.id))
  const jumboBefore = await getJumboState(T)

  try {
    const start = await api('/api/f2/eleven/session', { method: 'POST', body: JSON.stringify({ mode: 'actively_read', thread_id: threadId }) })
    check('production starts an actively_read voice session', start.status === 200 && start.body.voice_session?.mode === 'actively_read' && !!start.body.eleven?.conversation_token, { status: start.status, mode: start.body.voice_session?.mode, err: start.body.error })
    check('Dodo speaks first (kickoff sent)', start.body.eleven?.kickoff === '[begin]', start.body.eleven?.kickoff)
    const vsId = start.body.voice_session?.id as string
    const { data: row } = await sb.from('f2_voice_sessions').select('system_prompt').eq('id', vsId).single()
    check('the stored prompt is the Actively Read script', /ACTIVELY READ session/.test(row?.system_prompt ?? ''), (row?.system_prompt ?? '').slice(0, 200))

    // The conversation, on the prompt production stored for this session.
    const thread = (await getThreadById(T, threadId))!
    const source = buildBudgetedContent(thread, 40_000)
    const transcript: { role: 'user' | 'agent'; content: string }[] = [{ role: 'user', content: ELEVEN_KICKOFF }]
    const spoken: { role: 'user' | 'assistant'; text: string; created_at: string }[] = []
    const say = (role: 'user' | 'assistant', text: string) => spoken.push({ role, text, created_at: new Date().toISOString() })
    for (let turn = 0; turn < 10; turn++) {
      let out = ''
      for await (const c of streamElevenTurn({ systemPrompt: row!.system_prompt, messages: turnMessages(transcript, elevenOpeningInstruction('actively_read')) })) out += c
      transcript.push({ role: 'agent', content: out.trim() }); say('assistant', out.trim())
      console.log(`  DODO: ${out.trim().slice(0, 160)}`)
      if (turn > 0 && /tap end/i.test(out)) break
      let reply: string
      if (turn === 0) reply = 'Give me the big idea in a couple of sentences.'
      else if (turn === 1) reply = "Okay, I'm ready."
      else {
        const r = await claude.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 400, output_config: { effort: 'low' }, system: `You are a strong student who studied this material carefully some days ago. Answer the tutor's question correctly, in your own words (never quote the material), with the key reason or mechanism and a supporting detail, in two or three spoken sentences, nothing else.\n\n${source}`, messages: [{ role: 'user', content: out }] })
        const b = r.content.find((x) => x.type === 'text')
        reply = b && b.type === 'text' ? b.text.trim() : 'I am not sure.'
      }
      transcript.push({ role: 'user', content: reply }); say('user', reply)
      console.log(`  USER: ${reply.slice(0, 160)}`)
    }

    const fin = await api(`/api/f2/live/session/${vsId}`, { method: 'PATCH', body: JSON.stringify({ transcript: spoken }) })
    check('production finish route stores the transcript', fin.status === 200, fin)
    const t0 = Date.now()
    const g = await api(`/api/f2/topics/${threadId}/actively-read`, { method: 'POST', body: JSON.stringify({ voice_session_id: vsId }) })
    console.log(`  grade (${((Date.now() - t0) / 1000).toFixed(0)} s):`, JSON.stringify(g.body))
    check('production grades it tested and passed (B+ or better)', g.status === 200 && g.body.outcome === 'tested' && g.body.passed === true && ['A+', 'A', 'A-', 'B+'].includes(g.body.grade), g)
    check('the reward is the next Peck level', g.body.peck_level_cleared === jumboBefore.highest_passed + 1, { got: g.body.peck_level_cleared, expected: jumboBefore.highest_passed + 1 })
    check('the topic now has its first star', g.body.stars === 1 && (await sb.from('f2_threads').select('stars').eq('id', threadId).single()).data?.stars === 1)
    const again = await api(`/api/f2/topics/${threadId}/actively-read`, { method: 'POST', body: JSON.stringify({ voice_session_id: vsId }) })
    check('grading the same session again returns the same verdict, no second level', again.body.grade === g.body.grade && (await getJumboState(T)).highest_passed === jumboBefore.highest_passed + 1, again.body)
    const { body: after } = await api('/api/f2/actively-read')
    check('today\'s pick reads passed', after.pick?.resolved === 'passed', after)
  } finally {
    await sb.from('f2_users').update(userBefore!).eq('id', T)
    await sb.from('f2_threads').update(threadBefore!).eq('id', threadId)
    const { data: setsAfter } = await sb.from('f2_flash_sets').select('id').eq('user_id', T).not('jumbo_level', 'is', null)
    const extra = (setsAfter ?? []).map((s) => s.id).filter((id) => !before.has(id))
    if (extra.length) await sb.from('f2_flash_sets').delete().in('id', extra)
    console.log(`restored the test account (${extra.length} granted set row(s) removed)`)
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

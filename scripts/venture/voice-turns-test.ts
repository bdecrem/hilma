// npx tsx --test scripts/venture/voice-turns-test.ts
// A few more words from Bart on a voice call (OLA-204): what counts as a few, and the voice
// writer's carry-over (src/lib/venture/voice-turns.ts, voice-carry.ts), then the phone path end to
// end with a stand-in writer that takes as long as the real one to begin. Nothing here reaches a
// real service: no Realtime session, no ElevenLabs token, no Claude.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CARRY_MAX_WORDS, isBackchannel, isRevision, mayCarryOver, withoutRepeat } from '../../src/lib/venture/voice-turns'
import { carryKey, carryRegistry, type Writer } from '../../src/lib/venture/voice-carry'
import * as P from '../../src/lib/venture/phone'
import type { PhoneDeps } from '../../src/lib/venture/phone'
type Row = Awaited<ReturnType<PhoneDeps['turns']>>[number]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('a few more words carry the reply over; a turn that changes course does not', () => {
  const q = 'So the list has daily tasks and weekly tasks, eight and nine.'
  assert.ok(mayCarryOver(q, `${q} Okay.`))
  assert.ok(mayCarryOver(q, `${q} Okay.Test round. Yeah, this looks good.`))
  assert.ok(mayCarryOver(q, `${q} Are you still there?`), 'asking if Kit is there is not a new question')
  assert.ok(mayCarryOver('Yes,', 'Yes, approved.'))
  assert.ok(mayCarryOver("Can I hang up? 'Cause I, I, I'm clear.", "Can I hang up? 'Cause I, I, I, I'm clear."), 'a stutter heard twice')
  assert.ok(mayCarryOver(q, q), 'a retry')
  assert.equal(mayCarryOver(q, `${q} But not the second one.`), false, 'but')
  assert.equal(mayCarryOver(q, `${q} No, wait.`), false, 'no, wait')
  assert.equal(mayCarryOver(q, `${q} Which one runs first?`), false, 'a new question')
  assert.equal(mayCarryOver(q, `${q} ${'and then some more words '.repeat(2)}`), false, `more than ${CARRY_MAX_WORDS} words`)
  assert.equal(mayCarryOver(q, 'Something else entirely, about the dashboard.'), false)
})

test('revisions: a stutter counts, a different line does not, and "yes" is not "yesterday"', () => {
  assert.ok(isRevision("Can I hang up? 'Cause I, I, I'm clear.", "Can I hang up? 'Cause I, I, I, I'm clear."))
  assert.equal(isRevision('Yes', 'Yesterday we shipped it'), false)
  assert.equal(isRevision('What should I look at today?', 'Who is on the call tomorrow?'), false)
})

test('his earlier words at the front of a new turn are cut off', () => {
  const a = "Excellent. I'm looking at it now."
  const b = 'Uh, so there are daily tasks and weekly ones.'
  assert.equal(withoutRepeat(`${a} ${b}`, ['Where are they?', a]), b)
  assert.equal(withoutRepeat(`${a} ${b} Okay, test round.`, ['Where are they?', a, b]), 'Okay, test round.')
  assert.equal(withoutRepeat('Yes. Approved.', ['Yes.']), 'Yes. Approved.', 'fewer than three words is not a repeat')
  assert.equal(withoutRepeat(a, [a]), a, 'the same words alone are a retry, not a repeat')
})

test('a "yeah" under the voice is listening; "wait" and "no" are not', () => {
  for (const s of ['Yeah.', 'Mm-hmm.', 'Okay, okay.', 'Right.', 'Got it.', 'Uh-huh']) assert.ok(isBackchannel(s), s)
  for (const s of ['Wait.', 'No.', 'Stop there.', 'Yeah, but which one?', 'Tell me more about it.', '']) assert.equal(isBackchannel(s), false, s)
})

// A stand-in for one headless Claude Code reply: first words after `firstMs`, then the rest.
function slowWriter(stats: { starts: number; stopped: number }, firstMs: number, pieces: string[]): Writer {
  return async (onText, signal) => {
    stats.starts++
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, firstMs)
      signal.addEventListener('abort', () => (clearTimeout(t), resolve()))
    })
    for (const p of pieces) {
      if (signal.aborted) return (stats.stopped++, { said: false, why: 'stopped' })
      onText(p)
      await sleep(10)
    }
    return { said: true, why: '' }
  }
}

function read(reg: ReturnType<typeof carryRegistry>, key: string, asked: string, write: Writer) {
  const o = reg.open(key, asked, write)
  let text = ''
  const done = new Promise<string>((resolve) => o.attach({ onText: (t) => (text += t), onEnd: () => resolve(text) }))
  return { o, done, text: () => text }
}

test('the writer: a caller that leaves and comes back with a few more words gets the same reply, sooner', async () => {
  const reg = carryRegistry({ graceMs: 300 })
  const stats = { starts: 0, stopped: 0 }
  const write = slowWriter(stats, 120, ['Seven daily and nine weekly. ', 'Approve those three?'])
  const msgs = [{ role: 'user', content: '(The call just connected.)' }, { role: 'assistant', content: 'Hi.' }, { role: 'user', content: 'The list has eight and nine.' }]
  const key = carryKey('lead', msgs)
  const a = read(reg, key, 'The list has eight and nine.', write)
  await sleep(60)
  a.o.leave() // the bridge drops the first request: he said more
  const t0 = Date.now()
  const b = read(reg, key, 'The list has eight and nine. Okay.', write)
  assert.equal(b.o.carried, true)
  assert.equal(await b.done, 'Seven daily and nine weekly. Approve those three?')
  assert.ok(Date.now() - t0 < 120, 'the rest of the first reply, not a new one from the start')
  assert.equal(stats.starts, 1)

  // A real change of course starts a new reply, and the old one, read by nobody, is stopped.
  const c = read(reg, carryKey('lead', [...msgs.slice(0, 2), { role: 'user', content: 'x' }]), 'Another question entirely, about the ads?', write)
  assert.equal(c.o.carried, false)
  await c.done
  assert.equal(stats.starts, 2)
})

test('the writer: a reply nobody takes over is stopped after the grace time', async () => {
  const reg = carryRegistry({ graceMs: 50 })
  const stats = { starts: 0, stopped: 0 }
  const a = read(reg, 'k', 'Hello there.', slowWriter(stats, 20, ['One. ', 'Two. ', 'Three. ', 'Four. ', 'Five. ', 'Six. ', 'Seven. ', 'Eight. ', 'Nine. ', 'Ten.']))
  await sleep(25)
  a.o.leave()
  await sleep(200)
  assert.equal(stats.stopped, 1)
  assert.equal(reg.size(), 0)
})

// The phone path, the way the check-in of 2026-11-19 went: he pauses, the engine sends his turn,
// he adds a word, it sends it again (the bridge drops its first request, which never reaches the
// function), and again. Made-up words; the writer takes 400 ms to begin.
function phoneFake() {
  let id = 0
  const rows: Row[] = []
  const stats = { starts: 0, stopped: 0 }
  const reg = carryRegistry({ graceMs: 1000 })
  const d = {
    user: () => 'bart',
    turns: async (s: string) => rows.filter((r) => r.session === s).map((r) => ({ ...r })),
    phoneRows: async () => [...rows].reverse(),
    addTurn: async (session: string, role: Row['role'], text: string) => void rows.push({ id: ++id, session, role, text, at: new Date().toISOString(), call: 'phone' }),
    reviseTurn: async (rowId: number, text: string) => {
      const r = rows.find((x) => x.id === rowId)
      if (r) r.text = text
    },
    checkEvery: 20,
    mint: async () => 'fake-token',
    system: async () => 'LEAD',
    warm: async () => {},
    later: () => {},
    // The voice writer on the mini, in miniature: the registry and a slow Claude.
    reply: (lead: string, messages: { role: string; content: unknown }[], signal?: AbortSignal, info?: { carried?: boolean }) =>
      (async function* () {
        const ms = messages.map((m) => ({ role: m.role, content: String(m.content) }))
        const asked = ms[ms.length - 1].content
        const o = reg.open(carryKey(lead, ms), asked, slowWriter(stats, 400, [`About "${asked.slice(-12)}": `, 'yes, all three.']))
        if (info) info.carried = o.carried
        const q: string[] = []
        let end = false
        let wake = () => {}
        o.attach({ onText: (t) => (q.push(t), wake()), onEnd: () => ((end = true), wake()) })
        const onAbort = () => (o.leave(), (end = true), wake())
        signal?.addEventListener('abort', onAbort)
        try {
          for (;;) {
            if (q.length) yield q.shift()!
            else if (end) return
            else await new Promise<void>((r) => (wake = r))
          }
        } finally {
          signal?.removeEventListener('abort', onAbort)
          o.leave()
        }
      })(),
    transcribe: async () => '',
    saveMemo: async () => ({ id: 0, text: '', at: '', seen_at: null }),
    memos: async () => [],
    now: () => Date.now(),
    minutesAfter: async () => {},
    minutesFor: async () => new Map(),
    minutes: { get: async () => null, put: async () => {}, ask: async () => '{}' },
  } as unknown as PhoneDeps
  return { d, rows, stats }
}

test('the phone: three sends of one turn, a few words apart, are one row, one reply, written once', async () => {
  const f = phoneFake()
  const start = await (await P.startMeeting(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' }), f.d)).json()
  const voice = start.dynamic_variables.dodo_voice_session
  const head = [{ role: 'user' as const, content: '[begin]' }, { role: 'agent' as const, content: P.GREETING }]
  await P.kitTurn({ voice_session_id: voice, transcript: head.slice(0, 1) }, new AbortController().signal, f.d)

  const base = 'The list has daily tasks and weekly tasks.'
  const sends = [base, `${base} Okay.`, `${base} Okay. Yeah, this looks good.`]
  const t0 = Date.now()
  const responses: Promise<string>[] = []
  for (const [i, s] of sends.entries()) {
    const res = await P.kitTurn({ voice_session_id: voice, transcript: [...head, { role: 'user', content: s }] }, new AbortController().signal, f.d)
    responses.push(res.text())
    if (i < sends.length - 1) await sleep(150) // he goes on before the reply begins
  }
  const said = await responses[2]
  const waited = Date.now() - t0
  await Promise.all(responses)
  await sleep(50)
  assert.equal(f.stats.starts, 1, 'Claude was asked once')
  assert.ok(said.endsWith('yes, all three.'))
  // Before: each send started over, so the reply began 400 ms after the last send (700 ms in).
  assert.ok(waited < 600, `the reply came ${waited} ms after his first words were sent`)
  const spoken = f.rows.filter((x) => x.role !== 'event').map((x) => `${x.role}: ${x.text}`)
  assert.deepEqual(spoken, [`claude: ${P.GREETING}`, `bart: ${sends[2]}`, `claude: ${said}`])
  assert.ok(f.rows.some((x) => x.text === 'reply carried over: he added a few words'))
})

test('the phone: a stutter 150 ms apart is one row and one answer, not two', async () => {
  const f = phoneFake()
  const start = await (await P.startMeeting(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' }), f.d)).json()
  const voice = start.dynamic_variables.dodo_voice_session
  const head = [{ role: 'user' as const, content: '[begin]' }, { role: 'agent' as const, content: P.GREETING }]
  await P.kitTurn({ voice_session_id: voice, transcript: head.slice(0, 1) }, new AbortController().signal, f.d)
  const a = P.kitTurn({ voice_session_id: voice, transcript: [...head, { role: 'user', content: "Can I hang up? 'Cause I, I, I'm clear." }] }, new AbortController().signal, f.d)
  await sleep(150)
  const b = P.kitTurn({ voice_session_id: voice, transcript: [...head, { role: 'user', content: "Can I hang up? 'Cause I, I, I, I'm clear." }] }, new AbortController().signal, f.d)
  await Promise.all([(await a).text(), (await b).text()])
  await sleep(50)
  assert.deepEqual(f.rows.filter((x) => x.role === 'bart').map((x) => x.text), ["Can I hang up? 'Cause I, I, I, I'm clear."])
  assert.equal(f.rows.filter((x) => x.role === 'claude').length, 2, 'the greeting and one answer')
  assert.equal(f.stats.starts, 1)
})

test('the phone: his earlier line sent again at the front of a new turn is not stored twice', async () => {
  const f = phoneFake()
  const start = await (await P.startMeeting(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' }), f.d)).json()
  const voice = start.dynamic_variables.dodo_voice_session
  const head = [{ role: 'user' as const, content: '[begin]' }, { role: 'agent' as const, content: P.GREETING }]
  await P.kitTurn({ voice_session_id: voice, transcript: head.slice(0, 1) }, new AbortController().signal, f.d)
  const a = "Excellent. I'm looking at it now."
  await (await P.kitTurn({ voice_session_id: voice, transcript: [...head, { role: 'user', content: a }] }, new AbortController().signal, f.d)).text()
  // Kit's answer was not heard; the engine sends his words since its last line, the old ones first
  const more = 'So there are daily tasks and weekly ones.'
  await (await P.kitTurn({ voice_session_id: voice, transcript: [...head, { role: 'user', content: `${a} ${more}` }] }, new AbortController().signal, f.d)).text()
  await (await P.kitTurn({ voice_session_id: voice, transcript: [...head, { role: 'user', content: `${a} ${more} Okay.` }] }, new AbortController().signal, f.d)).text()
  await sleep(50)
  assert.deepEqual(f.rows.filter((x) => x.role === 'bart').map((x) => x.text), [a, more, 'Okay.'])
})

test('OLA-478: the writer at its plan limit is said as that, with when it comes back; a test call says it is a test', async () => {
  const { talkStream, talkReply } = await import('../../src/lib/venture/talk')
  process.env.VENTURE_VOICE_URL = 'http://writer.invalid'
  process.env.VENTURE_VOICE_SECRET = 'x'.repeat(32)
  const real = globalThis.fetch
  const bodies: string[] = []
  const say = (text: string) => async (_u: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''))
    return new Response(text, { status: 502 })
  }
  const all = async (g: AsyncGenerator<string>) => {
    let s = ''
    for await (const t of g) s += t
    return s
  }
  try {
    for (const [text, when] of [["You've hit your weekly limit · resets 2am (America/Los_Angeles)", '2am'], ['5-hour limit reached ∙ resets 7pm', '7pm'], ['Claude AI usage limit reached', '']]) {
      globalThis.fetch = say(text) as typeof fetch
      const out = await all(talkStream('', [{ role: 'user', content: 'hi' }]))
      assert.match(out, /plan limit/, text)
      if (when) assert.match(out, new RegExp(`comes back at ${when}`), text)
      else assert.doesNotMatch(out, /comes back/, text)
    }
    globalThis.fetch = say('claude exit 1') as typeof fetch
    await assert.rejects(all(talkStream('', [{ role: 'user', content: 'hi' }])), /did not answer \(502\)/)
    bodies.length = 0
    globalThis.fetch = say("You've hit your weekly limit · resets 2am") as typeof fetch
    const at = new Date().toISOString()
    await all(talkReply([{ role: 'event', text: 'test', at }, { role: 'bart', text: 'hello', at }] as never))
    await all(talkReply([{ role: 'bart', text: 'hello', at }] as never))
    assert.equal(JSON.parse(bodies[0]).test, true, 'a test call says so')
    assert.equal(JSON.parse(bodies[1]).test, undefined, "Bart's own call never does")
  } finally {
    globalThis.fetch = real
  }
})

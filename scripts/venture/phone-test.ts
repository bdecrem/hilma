// npx tsx --test scripts/venture/phone-test.ts
// Kit's voice meetings and notes from the phone (src/lib/venture/phone.ts), with stand-ins for
// the token check, the database, ElevenLabs, Claude and speech-to-text. Nothing here reaches a
// real service: no ElevenLabs token is ever minted.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as P from '../../src/lib/venture/phone'
import type { PhoneDeps } from '../../src/lib/venture/phone'
import { writeMinutes, type Line, type Minutes, type MinutesDeps } from '../../src/lib/venture/minutes'
type Row = Awaited<ReturnType<PhoneDeps['turns']>>[number]

// A stand-in for the minutes call: Claude's JSON, decided by the test.
type Draft = { summary: string; decided: { text: string; quote: string }[]; to_decide: { text: string }[]; kit_will_do: { text: string }[]; facts: { text: string }[] }
const EMPTY: Draft = { summary: 'A short call.', decided: [], to_decide: [], kit_will_do: [], facts: [] }

function fake(opts: { reply?: (signal?: AbortSignal) => AsyncIterable<string>; transcript?: string; draft?: Draft } = {}) {
  let id = 0
  let clock = Date.parse('2026-11-17T10:00:00Z')
  const rows: Row[] = []
  const memos: { id: number; text: string; at: string; seen_at: string | null }[] = []
  const calls = { mint: 0, warm: 0, reply: 0, transcribe: 0, systems: [] as string[], messages: [] as unknown[] }
  const later: (() => Promise<void>)[] = []
  const minutes = new Map<string, Minutes>()
  const asked: string[] = []
  const md: MinutesDeps = {
    get: async (source, ref) => minutes.get(`${source}:${ref}`) ?? null,
    put: async (m) => void minutes.set(`${m.source}:${m.ref}`, structuredClone(m)),
    ask: async (_system, user) => {
      asked.push(user)
      return JSON.stringify(opts.draft ?? EMPTY)
    },
  }
  const linesOf = (source: Minutes['source'], ref: string): Line[] =>
    source === 'meeting'
      ? rows.filter((r) => r.session === ref && r.role !== 'event').map((r) => ({ who: r.role === 'bart' ? 'bart' : 'kit', text: r.text }))
      : memos.filter((m) => String(m.id) === ref).map((m) => ({ who: 'bart', text: m.text }))
  const d: PhoneDeps = {
    user: (t) => (t === 'good' ? 'bart' : null),
    turns: async (s) => rows.filter((r) => r.session === s).map((r) => ({ ...r })),
    phoneRows: async (since) => rows.filter((r) => r.call === 'phone' && Date.parse(r.at) >= since.getTime()).reverse(),
    addTurn: async (session, role, text) => {
      rows.push({ id: ++id, session, role, text, at: new Date(clock).toISOString(), call: 'phone' })
    },
    mint: async (engine) => {
      calls.mint++
      assert.equal(engine, P.KIT_ENGINE_ID)
      return 'fake-conversation-token'
    },
    system: async () => 'SYSTEM',
    warm: async (s) => {
      calls.warm++
      calls.systems.push(s)
    },
    later: (fn) => void later.push(fn),
    reply: (system, messages, signal) => {
      calls.reply++
      calls.messages = messages
      return (opts.reply ?? (async function* () { yield 'Ship it **today**. ' ; yield 'Then call me.' }))(signal)
    },
    transcribe: async () => {
      calls.transcribe++
      return opts.transcript ?? 'Look at the pricing page tonight.'
    },
    saveMemo: async (text) => {
      const m = { id: ++id, text, at: new Date(clock).toISOString(), seen_at: null }
      memos.unshift(m)
      return m
    },
    memos: async (n) => memos.slice(0, n),
    now: () => clock,
    reviseTurn: async (rowId, text) => {
      const r = rows.find((x) => x.id === rowId)
      if (r) r.text = text
    },
    checkEvery: 5,
    minutesAfter: async (source, ref) => void (await writeMinutes(source, ref, linesOf(source, ref), md)),
    minutesFor: async (source, refs) => new Map(refs.flatMap((r) => (minutes.has(`${source}:${r}`) ? [[r, minutes.get(`${source}:${r}`)!] as const] : []))),
    minutes: md,
  }
  return { d, rows, memos, calls, later, minutes, asked, tick: (s: number) => (clock += s * 1000) }
}

const auth = (token = 'good') => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const post = (body: unknown, token?: string) => new Request('https://x.test/', { method: 'POST', headers: auth(token), body: JSON.stringify(body) })
const get = (token?: string) => new Request('https://x.test/', { headers: auth(token) })
const read = async (r: Response) => ({ status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() })
const turn = (voice: string, transcript: { role: 'user' | 'agent'; content: string }[]) => ({ voice_session_id: voice, transcript })

test('no token, no voice: nothing is minted and nothing is stored', async () => {
  const f = fake()
  for (const token of ['', 'bad']) {
    assert.equal((await P.startMeeting(post({}, token), f.d)).status, 401)
    assert.equal((await P.overview(get(token), f.d)).status, 401)
    assert.equal((await P.endMeeting(post({}, token), '00000000-0000-4000-8000-000000000000', f.d)).status, 401)
    assert.equal((await P.readMeeting(get(token), '00000000-0000-4000-8000-000000000000', f.d)).status, 401)
    const form = new FormData()
    form.append('audio', new Blob([new Uint8Array(5000)], { type: 'audio/mp4' }), 'note.m4a')
    assert.equal((await P.leaveNote(new Request('https://x.test/', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form }), f.d)).status, 401)
  }
  assert.equal(f.calls.mint, 0)
  assert.equal(f.calls.transcribe, 0)
  assert.equal(f.rows.length, 0)
})

test('a meeting: start, greeting, a turn in and a spoken reply out, stored, ended', async () => {
  const f = fake()
  const start = await read(await P.startMeeting(post({}), f.d))
  assert.equal(start.status, 200)
  assert.equal(start.body.conversation_token, 'fake-conversation-token')
  assert.equal(start.body.kickoff, '[begin]')
  const voice = start.body.dynamic_variables.dodo_voice_session
  assert.ok(P.isKitVoiceId(voice))
  assert.equal(f.calls.mint, 1)
  // the system prompt is warmed after the response, not before it
  assert.equal(f.calls.warm, 0)
  await Promise.all(f.later.map((fn) => fn()))
  assert.equal(f.calls.warm, 1)

  const hello = await read(await P.kitTurn(turn(voice, [{ role: 'user', content: '[begin]' }]), new AbortController().signal, f.d))
  assert.equal(hello.body, P.GREETING)
  assert.equal(f.calls.reply, 0, 'the greeting does not wait for Claude')

  f.tick(5)
  const r = await read(await P.kitTurn(turn(voice, [{ role: 'user', content: '[begin]' }, { role: 'agent', content: P.GREETING }, { role: 'user', content: 'Should we ship the PDF page today?' }]), new AbortController().signal, f.d))
  assert.equal(r.body, 'Ship it today. Then call me.', 'markdown is stripped before it is spoken')
  const msgs = f.calls.messages as { role: string; content: string }[]
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user'])
  assert.equal(msgs[2].content, 'Should we ship the PDF page today?')

  const session = start.body.session
  const spoken = f.rows.filter((x) => x.session === session && x.role !== 'event').map((x) => `${x.role}: ${x.text}`)
  assert.deepEqual(spoken, [`claude: ${P.GREETING}`, 'bart: Should we ship the PDF page today?', 'claude: Ship it today. Then call me.'])
  assert.ok(f.rows.every((x) => x.call === 'phone'))

  f.tick(60)
  assert.equal((await P.endMeeting(post({ seconds: 65, reason: 'you' }), session, f.d)).status, 200)
  assert.equal((await P.endMeeting(post({ seconds: 65, reason: 'you' }), session, f.d)).status, 200, 'twice is fine')
  assert.equal(f.rows.filter((x) => x.text.startsWith('ended')).length, 1)
  assert.equal(f.rows.at(-1)!.text, 'ended: you, 65 s')
  // after the end the bridge gets no more answers for it
  assert.equal((await P.kitTurn(turn(voice, [{ role: 'user', content: 'hello?' }]), new AbortController().signal, f.d)).status, 409)

  const list = await read(await P.overview(get(), f.d))
  assert.equal(list.body.meetings.length, 1)
  assert.equal(list.body.meetings[0].first_line, 'Should we ship the PDF page today?')
  assert.equal(list.body.meetings[0].seconds, 65)
  const back = await read(await P.readMeeting(get(), session, f.d))
  assert.deepEqual(back.body.turns.map((t: { who: string }) => t.who), ['kit', 'bart', 'kit'])
})

test('a retried turn is stored once; silence gets a short line without Claude', async () => {
  const f = fake()
  const start = await read(await P.startMeeting(post({}), f.d))
  const voice = start.body.dynamic_variables.dodo_voice_session
  const t = turn(voice, [{ role: 'user', content: 'Two things.' }])
  // the bridge asks again when the first try produced no words (its body is never read here)
  await P.kitTurn(t, new AbortController().signal, f.d)
  await read(await P.kitTurn(t, new AbortController().signal, f.d))
  assert.equal(f.rows.filter((x) => x.role === 'bart').length, 1)
  assert.equal(f.rows.filter((x) => x.role === 'claude').length, 1)
  const before = f.calls.reply
  const quiet = await read(await P.kitTurn(turn(voice, [{ role: 'user', content: '' }]), new AbortController().signal, f.d))
  assert.equal(quiet.body, "I'm here.")
  assert.equal(f.calls.reply, before, 'no Claude call for a quiet turn')
})

test('barge-in: the reply stops, what was written is kept and marked interrupted', async () => {
  const ctl = new AbortController()
  const f = fake({
    reply: (signal) =>
      (async function* () {
        yield 'The first half of a long answer. '
        await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted'))))
        yield 'never said'
      })(),
  })
  const start = await read(await P.startMeeting(post({}), f.d))
  const res = await P.kitTurn(turn(start.body.dynamic_variables.dodo_voice_session, [{ role: 'user', content: 'Walk me through it.' }]), ctl.signal, f.d)
  const reader = res.body!.getReader()
  const first = await reader.read()
  assert.equal(new TextDecoder().decode(first.value), 'The first half of a long answer. ')
  ctl.abort()
  const next = reader.read()
  await reader.cancel()
  await next.catch(() => {})
  await new Promise((r) => setTimeout(r, 10))
  const tail = f.rows.slice(-2).map((x) => `${x.role}: ${x.text}`)
  assert.deepEqual(tail, ['claude: The first half of a long answer.', 'event: interrupted'])
})

test('a failed reply is heard and recorded', async () => {
  const f = fake({ reply: () => (async function* () { throw new Error('prompt is too long') })() })
  const start = await read(await P.startMeeting(post({}), f.d))
  const r = await read(await P.kitTurn(turn(start.body.dynamic_variables.dodo_voice_session, [{ role: 'user', content: 'Hello?' }]), new AbortController().signal, f.d))
  assert.match(r.body, /broken on my side/)
  assert.ok(f.rows.some((x) => x.role === 'event' && x.text === 'reply failed: prompt is too long'))
})

test('limits: a second start within seconds and too many in an hour are refused before minting', async () => {
  const f = fake()
  assert.equal((await P.startMeeting(post({}), f.d)).status, 200)
  assert.equal((await P.startMeeting(post({}), f.d)).status, 429, 'double tap')
  assert.equal(f.calls.mint, 1)
  for (let i = 1; i < P.STARTS_AN_HOUR; i++) {
    f.tick(P.START_GAP_S + 1)
    assert.equal((await P.startMeeting(post({}), f.d)).status, 200)
  }
  f.tick(P.START_GAP_S + 1)
  assert.equal((await P.startMeeting(post({}), f.d)).status, 429, 'the hourly cap')
  assert.equal(f.calls.mint, P.STARTS_AN_HOUR)
  // every earlier meeting the phone never closed was closed by the next start
  const sessions = new Set(f.rows.map((x) => x.session))
  const open = [...sessions].filter((s) => !f.rows.some((x) => x.session === s && x.text.startsWith('ended')))
  assert.equal(open.length, 1)
})

test('a reconnect continues the same meeting and greets as "back"', async () => {
  const f = fake()
  const a = await read(await P.startMeeting(post({}), f.d))
  const voice = a.body.dynamic_variables.dodo_voice_session
  await P.kitTurn(turn(voice, [{ role: 'user', content: '[begin]' }]), new AbortController().signal, f.d)
  f.tick(3)
  const b = await read(await P.startMeeting(post({ session: a.body.session }), f.d))
  assert.equal(b.status, 200)
  assert.equal(b.body.session, a.body.session)
  assert.equal(b.body.resumed, true)
  const again = await read(await P.kitTurn(turn(voice, [{ role: 'user', content: '[begin]' }]), new AbortController().signal, f.d))
  assert.equal(again.body, "I'm back. Go on.")
})

test('the turn route only answers meetings started from the phone', async () => {
  const f = fake()
  assert.equal((await P.kitTurn(turn('kit-not-a-uuid', [{ role: 'user', content: 'hi' }]), new AbortController().signal, f.d)).status, 400)
  assert.equal((await P.kitTurn(turn('kit-00000000-0000-4000-8000-000000000000', [{ role: 'user', content: 'hi' }]), new AbortController().signal, f.d)).status, 404)
  assert.equal(P.isKitVoiceId('3f1c2b7e-0000-4000-8000-000000000000'), false, 'a Dodo session id is not Kit')
})

test('a note: transcribed, stored as a voice note, answered with the text; limits', async () => {
  const f = fake()
  const send = (bytes: number, seconds = 30) => {
    const form = new FormData()
    form.append('audio', new Blob([new Uint8Array(bytes)], { type: 'audio/mp4' }), 'note.m4a')
    form.append('seconds', String(seconds))
    return P.leaveNote(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer good' }, body: form }), f.d)
  }
  const ok = await read(await send(20_000))
  assert.equal(ok.status, 200)
  assert.equal(ok.body.note.text, 'Look at the pricing page tonight.')
  assert.equal(f.memos.length, 1)
  assert.equal((await send(100)).status, 400, 'too short')
  assert.equal((await send(P.NOTE_MAX_BYTES + 1)).status, 413, 'too big')
  assert.equal((await send(20_000, 400)).status, 413, 'too long')
  assert.equal(f.calls.transcribe, 1, 'refused notes are never transcribed')
  const list = await read(await P.overview(get(), f.d))
  assert.equal(list.body.notes[0].text, 'Look at the pricing page tonight.')
  assert.equal(list.body.notes[0].read, false)
})

// The shape of the first real meeting (2026-11-17), with made-up words: he paused mid-question, the
// engine sent the turn, he went on, the engine sent the same turn again, longer. Both reached
// kitTurn; Claude answered both and both answers and both versions of his line were stored.
test('a turn sent again, longer, is one row and one answer; the first answer stops and is not kept', async () => {
  let call = 0
  const f = fake({
    reply: (signal) => {
      const n = ++call
      return (async function* () {
        if (n === 1) {
          yield 'An answer to half a question. '
          await new Promise((resolve) => {
            signal!.addEventListener('abort', resolve)
            setTimeout(resolve, 2000)
          })
          yield 'And more of it.'
        } else {
          yield 'Three things, short.'
        }
      })()
    },
  })
  const start = await read(await P.startMeeting(post({}), f.d))
  const voice = start.body.dynamic_variables.dodo_voice_session
  const head = [{ role: 'user' as const, content: '[begin]' }, { role: 'agent' as const, content: P.GREETING }]
  await P.kitTurn(turn(voice, head.slice(0, 1)), new AbortController().signal, f.d)

  // the engine's first send: his words so far
  const first = await P.kitTurn(turn(voice, [...head, { role: 'user', content: 'What should I look at today?' }]), new AbortController().signal, f.d)
  const r1 = first.body!.getReader()
  assert.equal(new TextDecoder().decode((await r1.read()).value), 'An answer to half a question. ')
  // the engine's second send of the same spoken turn (the bridge drops the first request, but
  // that cancel never reaches the function, so nothing is aborted here)
  const second = await read(await P.kitTurn(turn(voice, [...head, { role: 'user', content: 'What should I look at today? Keep it to three things.' }]), new AbortController().signal, f.d))
  assert.equal(second.body, 'Three things, short.')
  // the first reply notices its question was revised, stops, and is not stored
  for (;;) if ((await r1.read()).done) break
  await new Promise((r) => setTimeout(r, 20))
  const spoken = f.rows.filter((x) => x.role !== 'event').map((x) => `${x.role}: ${x.text}`)
  assert.deepEqual(spoken, [`claude: ${P.GREETING}`, 'bart: What should I look at today? Keep it to three things.', 'claude: Three things, short.'])
  assert.ok(f.rows.some((x) => x.text === 'reply dropped: he said more'))
  assert.equal(call, 2)
})

test('a revision is the same words with more after them, punctuation aside; a new line is not', () => {
  // the second pair of that meeting, made-up words: a comma added, a sentence more
  assert.ok(P.isRevision('Can you tell me how we check quality, uh, each time or in general?', 'Can you tell me how we check quality, uh, each time, or in general? The short version.'))
  assert.ok(P.isRevision('Move the call to Thursday', 'Move the call to Thursday.'))
  assert.equal(P.isRevision('Yes.', 'No, wait.'), false)
  assert.equal(P.isRevision('What should I look at today?', 'Who is on the call tomorrow?'), false)
})

test("Kit's greeting heard through the speaker is not his line", async () => {
  const f = fake()
  const start = await read(await P.startMeeting(post({}), f.d))
  const voice = start.body.dynamic_variables.dodo_voice_session
  const head = [{ role: 'user' as const, content: '[begin]' }, { role: 'agent' as const, content: P.GREETING }]
  await P.kitTurn(turn(voice, head.slice(0, 1)), new AbortController().signal, f.d)
  // recorded: "Hello. Hi Bart." right after "Hi Bart, Kit here."
  await read(await P.kitTurn(turn(voice, [...head, { role: 'user', content: 'Hello. Hi Bart.' }]), new AbortController().signal, f.d))
  assert.deepEqual(f.rows.filter((x) => x.role === 'bart').map((x) => x.text), ['Hello.'])
  assert.equal(P.withoutEcho('Hi Bart, Kit here.', P.GREETING), '')
  assert.equal(P.withoutEcho('Kit, here is the plan.', P.GREETING), 'Kit, here is the plan.')
})

test('a turn that is only Kit\'s own voice gets a short line and no row', async () => {
  const f = fake()
  const start = await read(await P.startMeeting(post({}), f.d))
  const voice = start.body.dynamic_variables.dodo_voice_session
  const head = [{ role: 'user' as const, content: '[begin]' }, { role: 'agent' as const, content: P.GREETING }]
  await P.kitTurn(turn(voice, head.slice(0, 1)), new AbortController().signal, f.d)
  const r = await read(await P.kitTurn(turn(voice, [...head, { role: 'user', content: 'Hi Bart.' }]), new AbortController().signal, f.d))
  assert.equal(r.body, "I'm here.")
  assert.equal(f.rows.filter((x) => x.role === 'bart').length, 0)
  assert.equal(f.calls.reply, 0)
})

test('an empty transcription is not stored', async () => {
  const f = fake({ transcript: '' })
  const form = new FormData()
  form.append('audio', new Blob([new Uint8Array(20_000)], { type: 'audio/mp4' }), 'note.m4a')
  const r = await P.leaveNote(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer good' }, body: form }), f.d)
  assert.equal(r.status, 400)
  assert.equal(f.memos.length, 0)
})

// MARK: minutes (2026-11-17: "I need those conversations to go into your memory and decisions to be
// acted on, always"). Claude is a stand-in; these check the plumbing and the guard on decisions.

async function meetingWith(f: ReturnType<typeof fake>, said: { who: 'bart' | 'kit'; text: string }[]) {
  const start = await read(await P.startMeeting(post({}), f.d))
  const session = start.body.session as string
  for (const l of said) await f.d.addTurn(session, l.who === 'bart' ? 'bart' : 'claude', l.text)
  return session
}

test('thinking out loud with an imperative is to be decided, even when Claude calls it decided', async () => {
  // made-up words in the shape of the second meeting: an idea, an imperative inside it, Kit's "got it"
  const f = fake({ draft: { ...EMPTY, decided: [{ text: 'Offer the Mac app as a choice', quote: 'Got it, I will scope it.' }], to_decide: [{ text: 'Whether to offer the Mac app to others' }] } })
  const session = await meetingWith(f, [
    { who: 'bart', text: 'I wonder if other people should get the Mac app too. Make it a choice.' },
    { who: 'kit', text: 'Got it, I will scope it.' },
  ])
  await P.endMeeting(post({ seconds: 60, reason: 'you' }), session, f.d)
  for (const fn of f.later) await fn()
  const m = f.minutes.get(`meeting:${session}`)!
  assert.deepEqual(m.decided, [], 'a quote that is not his own words does not make a decision')
  assert.deepEqual(m.to_decide.map((x) => x.text), ['Whether to offer the Mac app to others', 'Offer the Mac app as a choice'])
  assert.match(f.asked[0], /BART: I wonder if other people/)
  assert.match(f.asked[0], /KIT: Got it/)
})

test('a confirmed decision is decided, with his words quoted', async () => {
  const f = fake({ draft: { ...EMPTY, decided: [{ text: 'Ship the new page on Friday', quote: 'Yes, decided.' }], kit_will_do: [{ text: 'Send the draft tonight' }] } })
  const session = await meetingWith(f, [
    { who: 'bart', text: 'Should we ship the new page on Friday?' },
    { who: 'kit', text: 'Decided, or thinking out loud?' },
    { who: 'bart', text: 'Yes, decided. And send me the draft tonight.' },
  ])
  await P.endMeeting(post({ seconds: 40, reason: 'you' }), session, f.d)
  for (const fn of f.later) await fn()
  const m = f.minutes.get(`meeting:${session}`)!
  assert.deepEqual(m.decided, [{ id: 'd1', text: 'Ship the new page on Friday', quote: 'Yes, decided.' }])
  assert.deepEqual(m.kit_will_do.map((x) => x.text), ['Send the draft tonight'])
})

test('a meeting that ended by a drop still gets minutes, once', async () => {
  const f = fake()
  const session = await meetingWith(f, [{ who: 'bart', text: 'Quick thought about the pricing.' }])
  await P.endMeeting(post({ seconds: 20, reason: 'dropped' }), session, f.d)
  await P.endMeeting(post({ seconds: 20, reason: 'dropped' }), session, f.d)
  for (const fn of f.later) await fn()
  assert.ok(f.minutes.has(`meeting:${session}`))
  assert.equal(f.asked.length, 1, 'written once')
  // a meeting the phone never closed gets them when the next one starts
  const g = fake()
  const lost = await meetingWith(g, [{ who: 'bart', text: 'Something I said before the app was killed.' }])
  g.tick(P.START_GAP_S + 1)
  await P.startMeeting(post({}), g.d)
  for (const fn of g.later) await fn()
  assert.ok(g.minutes.has(`meeting:${lost}`))
})

test('a note gets minutes, and the list shows them', async () => {
  const f = fake({ transcript: 'Look into the clinic idea and tell me what it costs.', draft: { ...EMPTY, kit_will_do: [{ text: 'Find out what the clinic idea costs' }] } })
  const form = new FormData()
  form.append('audio', new Blob([new Uint8Array(20_000)], { type: 'audio/mp4' }), 'note.m4a')
  const r = await read(await P.leaveNote(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer good' }, body: form }), f.d))
  for (const fn of f.later) await fn()
  const m = f.minutes.get(`note:${r.body.note.id}`)!
  assert.deepEqual(m.kit_will_do.map((x) => x.text), ['Find out what the clinic idea costs'])
  const list = await read(await P.overview(get(), f.d))
  assert.deepEqual(list.body.notes[0].minutes.kit_will_do.map((x: { text: string }) => x.text), ['Find out what the clinic idea costs'])
})

test('a correction from the phone persists, is marked as his, and needs his token', async () => {
  const f = fake({ draft: { ...EMPTY, to_decide: [{ text: 'Offer the Mac app as a choice' }, { text: 'Rename the board' }] } })
  const session = await meetingWith(f, [{ who: 'bart', text: 'Offer the Mac app as a choice. And maybe rename the board.' }])
  await P.endMeeting(post({ seconds: 30, reason: 'you' }), session, f.d)
  for (const fn of f.later) await fn()
  assert.equal((await P.correct(post({ source: 'meeting', ref: session, id: 't1', to: 'decided' }, 'bad'), f.d)).status, 401)
  const moved = await read(await P.correct(post({ source: 'meeting', ref: session, id: 't1', to: 'decided' }), f.d))
  assert.equal(moved.status, 200)
  const gone = await read(await P.correct(post({ source: 'meeting', ref: session, id: 't2', to: 'delete' }), f.d))
  assert.equal(gone.status, 200)
  const m = f.minutes.get(`meeting:${session}`)!
  assert.deepEqual(m.decided.map((x) => [x.text, x.by]), [['Offer the Mac app as a choice', 'bart']])
  assert.deepEqual(m.to_decide, [])
  assert.deepEqual(m.removed!.map((x) => [x.text, x.by]), [['Rename the board', 'bart']])
  assert.ok(m.edited_at)
  assert.equal((await P.correct(post({ source: 'meeting', ref: session, id: 't2', to: 'decided' }), f.d)).status, 404, 'a removed line cannot be moved')
  const back = await read(await P.readMeeting(get(), session, f.d))
  assert.equal(back.body.minutes.decided[0].by, 'bart')
})

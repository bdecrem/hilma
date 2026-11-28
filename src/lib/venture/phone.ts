import type Anthropic from '@anthropic-ai/sdk' // the message type only; nothing here calls the API
import { isSession, newSession, type Turn } from './interview'
import { talkMessages } from './talk'
import type { Memo } from './memo'
import { correctMinutes, type Minutes, type MinutesDeps } from './minutes'
import { isRevision, norm, withoutRepeat } from './voice-turns'

export { isRevision }

// Kit in the Ola iPhone app (2026-11-17). Bart: "proper full duplex voice meetings with you or
// leave you voice notes", inside the app, for admins only, "like the voice mode in the dodo app".
//
// A meeting is Dodo's ElevenLabs + Claude engine with Kit's words:
//   phone ──WebRTC──▶ ElevenLabs "Kit" engine (Angela, calm; barge-in, turn-taking, the voice)
//         ──ws──▶ the voice bridge's existing /ws/prod path ──▶ /api/f2/eleven/turn on this site
//         ──▶ kitTurn() here, because the voice-session id starts with "kit-" (Dodo's are UUIDs)
//         ──▶ Claude with the Venture notes, exactly as /venture/talk loads them.
// So the bridge and its Railway settings are unchanged (scripts/venture/kit-engine.mjs makes the
// engine). Turns are stored as they happen in venture_interview_turns under call = 'phone', where
// scripts/venture/transcript.mjs and the runner already read voice conversations.
//
// A voice note is the memo page's path: transcribed, stored in venture_messages as a voice note,
// read by the runner and the session like the others. The audio is never stored.
//
// Every endpoint except the turn needs the phone's admin token (src/lib/kochito/app-auth.ts). The
// turn comes from the bridge (its secret is checked by the route) and only answers a session that
// a token holder started. ElevenLabs tokens are minted only by start, which a person's Start calls.

export const PHONE = 'phone'
/// The "Kit" Speech Engine (scripts/venture/kit-engine.mjs prints it). Not a secret.
export const KIT_ENGINE_ID = 'seng_3801m7mrg2rtfzra2n6gb4ya1efn'
export const KICKOFF = '[begin]'
const PREFIX = 'kit-'

export const kitVoiceId = (session: string) => PREFIX + session
export const isKitVoiceId = (id: unknown): id is string => typeof id === 'string' && id.startsWith(PREFIX)

// Limits. A token that is minted and never used holds one of the workspace's ElevenLabs slots, so
// a start that repeats (a double tap, a loop) is refused before anything is minted.
export const START_GAP_S = 15
export const STARTS_AN_HOUR = 10
export const NOTE_MAX_BYTES = 4_000_000 // Vercel takes 4.5 MB; five minutes of AAC at 64 kbps is 2.4 MB
export const NOTE_MIN_BYTES = 800
export const NOTE_MAX_S = 300

export const GREETING = 'Hi Bart, Kit here.'
const BACK = "I'm back. Go on."
const HERE = "I'm here."
const BROKEN = 'Something is broken on my side. Leave me a note instead, and the session will fix it.'
const END_REASONS = ['you', 'silence', 'dropped', 'phone call', 'background', 'time limit', 'error'] as const

// Said before the talk page's persona: where this call is and what Kit is called.
export const PHONE_LEAD = `This call is in the Ola app on Bart's iPhone, a voice meeting he started from the Kit tab. On it you go by Kit, the name he uses for you in this project; the notes below say who Kit is. Everything else below holds as written.\n\n`

type Row = Turn & { call?: string }

export type PhoneDeps = {
  user(token: string | null): string | null
  turns(session: string): Promise<Row[]>
  phoneRows(since: Date, limit: number): Promise<Row[]>
  addTurn(session: string, role: Turn['role'], text: string): Promise<void>
  /// Rewrites one of his rows when the engine sends the same spoken turn again, revised.
  reviseTurn(id: number, text: string): Promise<void>
  /// Tests only: how often a reply checks its question still stands.
  checkEvery?: number
  mint(engineId: string): Promise<string>
  /// Local voice (OLA-534): the Mac Studio's voice address and a six-hour token for it, or null when
  /// this server has none (the same token the talk page gets, src/app/api/venture/talk/session).
  localVoice?(): { url: string; token: string } | null
  system(): Promise<string>
  warm(system: string): Promise<void>
  later(fn: () => Promise<void>): void
  /// `info.carried`: the writer took over the reply it was writing to his same turn with fewer words.
  reply(system: string, messages: Anthropic.MessageParam[], signal?: AbortSignal, info?: { carried?: boolean }): AsyncIterable<string>
  transcribe(audio: Blob, filename: string): Promise<string>
  saveMemo(text: string): Promise<Memo>
  memos(limit: number): Promise<Memo[]>
  now(): number
  /// Writes the minutes of a meeting or a note (after the response; never throws).
  minutesAfter(source: Minutes['source'], ref: string): Promise<void>
  minutesFor(source: Minutes['source'], refs: string[]): Promise<Map<string, Minutes>>
  minutes: MinutesDeps
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

function bearer(req: Request): string | null {
  const a = req.headers.get('authorization') ?? ''
  return a.startsWith('Bearer ') ? a.slice(7).trim() : null
}

const ended = (rows: Row[]) => rows.some((t) => t.role === 'event' && t.text.startsWith('ended'))

function bySession(rows: Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>()
  for (const r of [...rows].sort((a, b) => a.id - b.id)) out.set(r.session, [...(out.get(r.session) ?? []), r])
  return out
}

// MARK: Start

/// POST { session? } → a token for one ElevenLabs conversation. With the id of a meeting that has
/// not ended (the network dropped and the phone reconnects once), the meeting continues.
export async function startMeeting(req: Request, d: PhoneDeps): Promise<Response> {
  const user = d.user(bearer(req))
  if (!user) return json({ error: 'Sign in again.' }, 401)
  const body = (await req.json().catch(() => ({}))) as { session?: unknown; local?: unknown }
  // Local voice: the Studio's ears and mouth instead of ElevenLabs; nothing is minted.
  const local = body.local === true ? (d.localVoice?.() ?? null) : null
  if (body.local === true && !local) return json({ error: 'The Mac Studio voice is not set up on the server. Turn off Local voice to talk now.' }, 503)

  let session: string = newSession()
  let resumed = false
  if (isSession(body.session)) {
    const rows = await d.turns(body.session)
    if (rows.length && rows[0].call === PHONE && !ended(rows)) {
      session = body.session
      resumed = true
    }
  }

  const hour = await d.phoneRows(new Date(d.now() - 3600e3), 2000)
  const starts = hour.filter((t) => t.role === 'event' && (t.text === 'started' || t.text === 'resumed'))
  const last = starts.reduce((m, t) => Math.max(m, new Date(t.at).getTime()), 0)
  // A reconnect may follow its start closely; a new meeting may not (a double tap, a loop).
  if (!resumed && d.now() - last < START_GAP_S * 1000) return json({ error: 'One moment, then try again.' }, 429)
  if (starts.length >= STARTS_AN_HOUR) return json({ error: 'That is a lot of meetings this hour. Try again later, or leave a note.' }, 429)
  // A meeting the phone never closed (the app was killed) is closed now, so it reads as over.
  for (const [id, rows] of bySession(hour)) {
    if (id !== session && !ended(rows)) {
      await d.addTurn(id, 'event', 'ended: not closed by the phone')
      d.later(() => d.minutesAfter('meeting', id))
    }
  }
  await d.addTurn(session, 'event', resumed ? 'resumed' : 'started')

  if (local) {
    await d.addTurn(session, 'event', 'voice: local (Mac Studio)')
    d.later(async () => {
      try {
        await d.warm(await d.system())
      } catch (e) {
        console.error('[venture/phone] warm failed:', e)
      }
    })
    return json({ session, resumed, local, kickoff: KICKOFF })
  }

  let token: string
  try {
    token = await d.mint(KIT_ENGINE_ID)
  } catch (e) {
    console.error('[venture/phone] mint failed:', e)
    await d.addTurn(session, 'event', 'ended: the voice service did not answer').catch(() => {})
    return json({ error: 'Kit cannot take a call right now. Leave a note instead.' }, 502)
  }
  // The system prompt is large; cache it while the call connects and the greeting plays.
  d.later(async () => {
    try {
      await d.warm(await d.system())
    } catch (e) {
      console.error('[venture/phone] warm failed:', e)
    }
  })
  return json({
    session,
    resumed,
    conversation_token: token,
    dynamic_variables: { dodo_voice_session: kitVoiceId(session) },
    kickoff: KICKOFF,
  })
}

// MARK: A turn (from the bridge, through /api/f2/eleven/turn)

export type BridgeTurn = { voice_session_id?: string; transcript?: { role: 'user' | 'agent'; content: string }[] }

/// Spoken text: no markdown, whatever the model does.
export const spoken = (s: string) => s.replace(/[*#`_~]+/g, '')

// What ElevenLabs does with a turn, as the first real meeting (2026-11-17) stored it: he paused,
// the engine sent his words so far, he went on, and it sent the same turn again, longer ("What are
// you blocking on?" then "What are you blocking on? List them ... really short."). The bridge
// cancels its request for the first, but the cancel never reached this function on Vercel, so
// Claude answered both and both answers were stored. Now a turn that revises the last one replaces
// its row, and a reply whose question has since been revised or followed stops and is not kept.
// The engine also heard Kit's own greeting through the speaker: "Hello. Hi Bart." was his line.

// The check-in of 2026-11-19 (OLA-204): each new turn still dropped the reply in flight and Claude
// started from nothing, four to six seconds each, three times in a row while he added "Okay." and
// "Yeah, this looks good."; now the voice writer carries that reply over to the longer turn when
// he only added a few words (voice-carry.ts). The same call stored "Can I hang up?" twice and
// answered it twice: the two turns came 150 ms apart, a stutter apart ("I, I, I'm" and "I, I, I,
// I'm"), which did not count as a revision, and each request took the newest row as its question.
// Now a stutter is a revision, and a request answers the row it wrote. ElevenLabs also sends his
// earlier words again at the front of a turn when Kit's answer to them was not heard; they are
// cut off (withoutRepeat), so each row holds what he said once.

/// His line without the sentences that are Kit's own last line coming back through the speaker.
export function withoutEcho(said: string, kitLine: string | undefined): string {
  if (!kitLine) return said
  const kit = norm(kitLine)
  const sentences = said.match(/[^.?!]+[.?!]*/g) ?? [said]
  const kept = sentences.filter((x) => {
    const n = norm(x)
    return !(n.split(' ').length >= 2 && kit.includes(n))
  })
  return kept.join('').trim()
}

/// How often a reply in progress checks that its question still stands.
export const SUPERSEDE_CHECK_MS = 600

export async function kitTurn(body: BridgeTurn, signal: AbortSignal, d: PhoneDeps): Promise<Response> {
  const session = (body.voice_session_id ?? '').slice(PREFIX.length)
  if (!isSession(session) || !Array.isArray(body.transcript)) return json({ error: 'bad kit turn' }, 400)
  const rows = await d.turns(session)
  if (!rows.length || rows[0].call !== PHONE) return json({ error: 'no such meeting' }, 404)
  if (ended(rows)) return json({ error: 'the meeting has ended' }, 409)

  const lastEntry = body.transcript[body.transcript.length - 1]
  const heard = lastEntry?.role === 'user' ? (lastEntry.content ?? '').trim() : ''

  const text = (s: string) => new Response(s, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
  if (heard === KICKOFF) {
    const line = rows.some((t) => t.role === 'claude') ? BACK : GREETING
    await d.addTurn(session, 'claude', line)
    return text(line)
  }
  const lastSpoken = [...rows].reverse().find((t) => t.role !== 'event')
  // His earlier lines, oldest first; when his last row is the turn being heard again, not that one.
  const his = rows.filter((t) => t.role === 'bart' && t !== lastSpoken).map((t) => t.text)
  const said = withoutRepeat(withoutEcho(heard, lastSpoken?.role === 'claude' ? lastSpoken.text : undefined), his)
  // ElevenLabs asks for a turn when he has been quiet a while (or heard only Kit's own voice);
  // no need to wake Claude for that.
  if (!said) return text(HERE)

  // One row per spoken turn: a retry is the same row, a revision rewrites it.
  let mine: number | null = null
  if (lastSpoken?.role === 'bart' && lastSpoken.text !== said && isRevision(lastSpoken.text, said)) {
    await d.reviseTurn(lastSpoken.id, said)
    mine = lastSpoken.id
  } else if (lastSpoken?.role === 'bart' && lastSpoken.text === said) {
    mine = lastSpoken.id
  } else {
    await d.addTurn(session, 'bart', said)
  }
  const turns = await d.turns(session)
  // The row this request wrote, not the newest one: a turn that came a moment later is its own.
  const asked = mine !== null ? { id: mine, text: said } : [...turns].reverse().find((t) => t.role === 'bart' && t.text === said)!
  const messages = talkMessages(turns.filter((t) => t.id <= asked.id))

  const enc = new TextEncoder()
  const gen = phoneReply(session, { id: asked.id, text: said }, messages, signal, d)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next()
        if (done) controller.close()
        else controller.enqueue(enc.encode(value))
      } catch (e) {
        controller.error(e)
      }
    },
    async cancel() {
      await gen.return(undefined)
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
}

/// Claude's reply, stored as it ends: whole, cut off by Bart (what was written by then, and
/// "interrupted"), or failed (an event saying why, and a line he hears). A reply whose question
/// was revised or followed by another turn while it ran (`asked` is no longer his last line) is
/// stopped and not stored: the newer turn has its own answer.
async function* phoneReply(session: string, asked: { id: number; text: string }, messages: Anthropic.MessageParam[], signal: AbortSignal, d: PhoneDeps): AsyncGenerator<string> {
  let out = ''
  let state: 'running' | 'done' | 'failed' = 'running'
  const stop = new AbortController()
  const both = AbortSignal.any([signal, stop.signal])
  const superseded = async () => {
    const last = [...(await d.turns(session))].reverse().find((t) => t.role === 'bart')
    return !last || last.id !== asked.id || last.text !== asked.text
  }
  let replaced = false
  const info: { carried?: boolean } = {}
  const watch = setInterval(() => {
    superseded()
      .then((yes) => {
        if (yes && !replaced) {
          replaced = true
          stop.abort()
        }
      })
      .catch(() => {})
  }, d.checkEvery ?? SUPERSEDE_CHECK_MS)
  // A stream nobody reads to the end never reaches `finally`: the watch must not outlive the turn.
  ;(watch as { unref?: () => void }).unref?.()
  const giveUp = setTimeout(() => clearInterval(watch), 120_000)
  ;(giveUp as { unref?: () => void }).unref?.()
  try {
    for await (const chunk of d.reply(await d.system(), messages, both, info)) {
      if (replaced) break
      const s = spoken(chunk)
      if (!s) continue
      out += s
      yield s
    }
    state = replaced ? 'running' : 'done'
  } catch (e) {
    if (both.aborted) return
    state = 'failed'
    console.error('[venture/phone] reply failed:', e)
    const why = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 300)
    await d.addTurn(session, 'event', `reply failed: ${why}`).catch(() => {})
    if (!out) {
      out = BROKEN
      yield BROKEN
    }
  } finally {
    clearInterval(watch)
    if (!replaced) replaced = await superseded().catch(() => false)
    if (replaced) {
      await d.addTurn(session, 'event', 'reply dropped: he said more').catch(() => {})
    } else {
      if (info.carried) await d.addTurn(session, 'event', 'reply carried over: he added a few words').catch(() => {})
      if (out.trim()) await d.addTurn(session, 'claude', out.trim()).catch((e) => console.error('[venture/phone] store failed:', e))
      if (state === 'running') await d.addTurn(session, 'event', 'interrupted').catch(() => {})
    }
  }
}

// MARK: A turn with the local voice (OLA-534)

/// POST { text } (Bearer) → Claude's reply to what he said, streamed as plain text: the phone's own
/// ears (the Mac Studio) heard him, so the phone asks here instead of the bridge. The same turn
/// logic as an ElevenLabs meeting (kitTurn): the kickoff gets the greeting, the rows are stored
/// under call = 'phone', so the list, the minutes and transcript.mjs see the meeting as any other.
export async function localTurn(req: Request, session: string, d: PhoneDeps): Promise<Response> {
  if (!d.user(bearer(req))) return json({ error: 'Sign in again.' }, 401)
  if (!isSession(session)) return json({ error: 'no such meeting' }, 404)
  const body = (await req.json().catch(() => ({}))) as { text?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 20_000) : ''
  if (!text) return json({ error: 'nothing said' }, 400)
  return kitTurn({ voice_session_id: kitVoiceId(session), transcript: [{ role: 'user', content: text }] }, req.signal, d)
}

// MARK: End, read back, the list

/// POST { seconds, reason } → the meeting is over. Twice is fine.
export async function endMeeting(req: Request, session: string, d: PhoneDeps): Promise<Response> {
  if (!d.user(bearer(req))) return json({ error: 'Sign in again.' }, 401)
  if (!isSession(session)) return json({ error: 'no such meeting' }, 404)
  const rows = await d.turns(session)
  if (!rows.length || rows[0].call !== PHONE) return json({ error: 'no such meeting' }, 404)
  // Every way a meeting ends gets its minutes (written once; a second end changes nothing).
  d.later(() => d.minutesAfter('meeting', session))
  if (ended(rows)) return json({ ok: true })
  const body = (await req.json().catch(() => ({}))) as { seconds?: unknown; reason?: unknown }
  const reason = (END_REASONS as readonly string[]).includes(String(body.reason)) ? String(body.reason) : 'you'
  const seconds = Math.max(0, Math.min(4 * 3600, Math.round(Number(body.seconds) || 0)))
  await d.addTurn(session, 'event', `ended: ${reason}, ${seconds} s`)
  return json({ ok: true })
}

export async function readMeeting(req: Request, session: string, d: PhoneDeps): Promise<Response> {
  if (!d.user(bearer(req))) return json({ error: 'Sign in again.' }, 401)
  if (!isSession(session)) return json({ error: 'no such meeting' }, 404)
  const rows = await d.turns(session)
  if (!rows.length || rows[0].call !== PHONE) return json({ error: 'no such meeting' }, 404)
  const minutes = (await d.minutesFor('meeting', [session])).get(session) ?? null
  return json({ meeting: summary(session, rows), minutes, turns: rows.filter((t) => t.role !== 'event').map((t) => ({ who: t.role === 'claude' ? 'kit' : 'bart', text: t.text, at: t.at })) })
}

function summary(id: string, rows: Row[]) {
  const first = rows[0].at
  const last = rows[rows.length - 1].at
  const spokenRows = rows.filter((t) => t.role !== 'event')
  const opener = rows.find((t) => t.role === 'bart')?.text ?? spokenRows[0]?.text ?? ''
  return {
    id,
    at: first,
    seconds: Math.max(0, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000)),
    first_line: opener.slice(0, 200),
    turns: spokenRows.length,
  }
}

/// GET → the last meetings (with at least one spoken turn) and the last notes, newest first.
export async function overview(req: Request, d: PhoneDeps): Promise<Response> {
  if (!d.user(bearer(req))) return json({ error: 'Sign in again.' }, 401)
  const rows = await d.phoneRows(new Date(d.now() - 60 * 86400e3), 3000)
  const meetings = [...bySession(rows)]
    .filter(([, r]) => r.some((t) => t.role === 'bart'))
    .map(([id, r]) => summary(id, r))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8)
  const memos = await d.memos(8)
  const mm = await d.minutesFor('meeting', meetings.map((m) => m.id))
  const nm = await d.minutesFor('note', memos.map((m) => String(m.id)))
  return json({
    meetings: meetings.map((m) => ({ ...m, minutes: mm.get(m.id) ?? null })),
    notes: memos.map((m) => ({ id: m.id, text: m.text, at: m.at, read: !!m.seen_at, minutes: nm.get(String(m.id)) ?? null })),
  })
}

// MARK: A voice note

/// multipart: audio (what the phone records: AAC in .m4a), seconds. → { note: { id, text, at } }
export async function leaveNote(req: Request, d: PhoneDeps): Promise<Response> {
  if (!d.user(bearer(req))) return json({ error: 'Sign in again.' }, 401)
  const length = Number(req.headers.get('content-length') ?? 0)
  if (length > NOTE_MAX_BYTES + 64_000) return json({ error: 'That note is too long. Keep it under five minutes.' }, 413)
  const form = await req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof Blob)) return json({ error: 'No recording came through. Try again.' }, 400)
  if (audio.size > NOTE_MAX_BYTES || Number(form?.get('seconds')) > NOTE_MAX_S + 10) return json({ error: 'That note is too long. Keep it under five minutes.' }, 413)
  if (audio.size < NOTE_MIN_BYTES) return json({ error: 'That was too short to hear. Try again.' }, 400)
  let text: string
  try {
    text = await d.transcribe(audio, 'note.m4a')
  } catch (e) {
    console.error('[venture/phone] transcription failed:', e)
    return json({ error: 'The note did not go through. It was not saved; record it again.' }, 502)
  }
  if (!text) return json({ error: 'I could not make out any words. Try again.' }, 400)
  const memo = await d.saveMemo(text)
  d.later(() => d.minutesAfter('note', String(memo.id)))
  return json({ note: { id: memo.id, text: memo.text, at: memo.at } })
}

// MARK: Bart corrects the minutes

/// POST { source, ref, id, to: 'decided' | 'to_decide' | 'delete' } → { minutes }. The line is
/// marked as his, and the minutes count as unread again, so the runner and the session see it.
export async function correct(req: Request, d: PhoneDeps): Promise<Response> {
  if (!d.user(bearer(req))) return json({ error: 'Sign in again.' }, 401)
  const b = (await req.json().catch(() => ({}))) as { source?: unknown; ref?: unknown; id?: unknown; to?: unknown }
  const source = b.source === 'meeting' || b.source === 'note' ? b.source : null
  const to = b.to === 'decided' || b.to === 'to_decide' || b.to === 'delete' ? b.to : null
  if (!source || !to || typeof b.ref !== 'string' || typeof b.id !== 'string') return json({ error: 'bad correction' }, 400)
  const m = await correctMinutes(source, b.ref, { id: b.id, to }, d.minutes)
  if (!m) return json({ error: 'That line is not there any more.' }, 404)
  return json({ minutes: m })
}

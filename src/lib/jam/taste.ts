// Jam — what a user likes, learned from explicit and implicit signals.
//
// v1 (2026-09-06): explicit signals. After each agent turn the client offers
// 👍 / 👎 (tap up to three times) and the track's "…" menu takes a 1–5 star
// rating of the whole creation.
// v2 (same day): implicit signals, no new UI. /api/jam/llm mines every
// user message against the previous turn — a follow-up that pushes back
// ("less reverb", "no", "too busy", a manual [controls] edit that reverses
// the agent's move) is a `correction`, an explicit "love it" is `praise`;
// a bounce (export) and a publish are positive signals on the whole track.
// Every signal keeps the turn's tool calls with their inputs, so
// preferences attach to parameters, not adjectives.
//
// All of it reaches the agent through the system prompt (appendTaste):
//   - the user's last few signals verbatim, from the first one on;
//   - once they have TASTE_MIN_SIGNALS signals (and every TASTE_EVERY new
//     ones) a short note written by a cheap model into jam_users.taste_note;
//   - "starting points": the tweak values that stuck in the tracks they
//     rated 4–5, bounced or published (median per parameter path, in the
//     agent's own units) — so a new track starts from their numbers.
// Rows live in jam_votes (schemas 005 + 007); nothing is trained.

import Anthropic from '@anthropic-ai/sdk'
import { jamDb } from './db'

export const TASTE_MODEL = process.env.JAM_TASTE_MODEL || 'claude-sonnet-5'
export const MINER_MODEL = process.env.JAM_MINER_MODEL || 'claude-haiku-4-5-20251001'
/** Signals (votes, corrections, ratings, bounces …) before the first note. */
export const TASTE_MIN_SIGNALS = 5
/** New signals between rewrites of the note. */
export const TASTE_EVERY = 5
const SIGNALS_IN_PROMPT = 60
const RATED_TRACKS_IN_PROMPT = 20
const RECENT_IN_PROMPT = 6
const STARTING_POINTS_MAX = 30
const GOOD_TRACKS_FOR_POINTS = 8
const NOTE_MAX_CHARS = 1200

export type SignalSource = 'vote' | 'correction' | 'praise' | 'bounce' | 'publish'

export type ToolCall = { name: string; input?: unknown }

export type SignalInput = {
  trackId: string
  /** Feed id of the user message that started the turn; `corr:<i>:<hash>` for mined ones; `track:<kind>` for whole-track signals. */
  turnId: string
  /** -3..3; 0 removes the signal. */
  score: number
  source?: SignalSource
  prompt?: string
  reply?: string
  actions?: string[]
  calls?: ToolCall[]
  state?: unknown
  reason?: string
}

export type VoteInput = SignalInput

export type Taste = { note: string | null; votes: number; updatedAt: string | null }

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

const squash = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)

/** Tool calls as stored: at most `max` of them, inputs cut to 300 chars of JSON. */
export function trimCalls(calls: unknown, max = 40): ToolCall[] {
  if (!Array.isArray(calls)) return []
  const out: ToolCall[] = []
  for (const c of calls.slice(0, max)) {
    if (!c || typeof c !== 'object') continue
    const name = (c as { name?: unknown }).name
    if (typeof name !== 'string') continue
    let input: unknown = (c as { input?: unknown }).input
    if (input !== undefined) {
      const json = JSON.stringify(input)
      if (json && json.length > 300) input = json.slice(0, 300)
    }
    out.push(input === undefined ? { name } : { name, input })
  }
  return out
}

/** Store (or, for score 0, remove) one signal. */
export async function recordSignal(userId: string, v: SignalInput): Promise<void> {
  const db = jamDb()
  if (v.score === 0) {
    const { error } = await db.from('jam_votes').delete().eq('user_id', userId).eq('track_id', v.trackId).eq('turn_id', v.turnId)
    if (error) throw new Error(`jam_votes delete failed: ${error.message}`)
    return
  }
  const { error } = await db.from('jam_votes').upsert(
    {
      user_id: userId,
      track_id: v.trackId,
      turn_id: v.turnId,
      score: v.score,
      source: v.source ?? 'vote',
      prompt: v.prompt ?? null,
      reply: v.reply ?? null,
      actions: v.actions ?? (v.calls ? v.calls.map((c) => c.name) : []),
      calls: v.calls ?? null,
      state: v.state ?? null,
      reason: v.reason ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,track_id,turn_id' },
  )
  if (error) throw new Error(`jam_votes write failed: ${error.message}`)
}

/** An explicit thumbs vote. */
export async function recordVote(userId: string, v: VoteInput): Promise<void> {
  return recordSignal(userId, { ...v, source: 'vote' })
}

/** A whole-track implicit signal: bounce (export) +2, publish +3. One row per track and kind. */
export async function recordImplicit(userId: string, trackId: string, kind: 'bounce' | 'publish', title?: string): Promise<void> {
  return recordSignal(userId, {
    trackId,
    turnId: `track:${kind}`,
    score: kind === 'publish' ? 3 : 2,
    source: kind,
    prompt: title,
  })
}

/** turnId → score for one track (the Studio's thumbs rows read the `vote` rows). */
export async function listVotes(userId: string, trackId: string): Promise<Record<string, number>> {
  const { data, error } = await jamDb().from('jam_votes').select('turn_id, score').eq('user_id', userId).eq('track_id', trackId).eq('source', 'vote')
  if (error) throw new Error(`jam_votes read failed: ${error.message}`)
  const out: Record<string, number> = {}
  for (const row of data ?? []) out[row.turn_id as string] = Number(row.score)
  return out
}

/** The stored note (or null). */
export async function getTasteNote(userId: string): Promise<string | null> {
  const { data, error } = await jamDb().from('jam_users').select('taste_note').eq('id', userId).maybeSingle()
  if (error) throw new Error(`taste read failed: ${error.message}`)
  return (data?.taste_note as string | null) ?? null
}

const thumbs = (score: number) => (score > 0 ? '👍' : '👎').repeat(Math.min(3, Math.abs(score)))

/**
 * The user's last few signals, verbatim, for the prompt — so the agent
 * reacts to a 👎👎👎 on "add a big reverb" from the very first one.
 */
export async function recentSignals(userId: string, limit = RECENT_IN_PROMPT): Promise<string[]> {
  const { data, error } = await jamDb()
    .from('jam_votes')
    .select('score, source, prompt, reply, actions, reason, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`jam_votes read failed: ${error.message}`)
  return (data ?? []).reverse().map((r) => {
    const score = Number(r.score)
    const asked = typeof r.prompt === 'string' ? squash(r.prompt, 160) : ''
    const did = Array.isArray(r.actions) && r.actions.length ? ` — agent ran ${(r.actions as string[]).slice(0, 8).join(', ')}` : ''
    const said = typeof r.reply === 'string' && r.reply ? ` — agent said "${squash(r.reply, 140)}"` : ''
    const reason = typeof r.reason === 'string' && r.reason ? ` — ${squash(r.reason, 120)}` : ''
    switch (r.source) {
      case 'correction': return `${thumbs(score)} they pushed back after "${asked}"${did}${reason}`
      case 'praise': return `${thumbs(score)} they praised the result of "${asked}"${did}${reason}`
      case 'bounce': return `${thumbs(score)} they bounced (exported) "${asked}"`
      case 'publish': return `${thumbs(score)} they published "${asked}"`
      default: return `${thumbs(score)} on "${asked}"${did}${said}`
    }
  })
}

export const recentVotes = recentSignals

export async function getTaste(userId: string): Promise<Taste> {
  const db = jamDb()
  const [{ data: u, error: ue }, { count, error: ce }] = await Promise.all([
    db.from('jam_users').select('taste_note, taste_updated_at').eq('id', userId).maybeSingle(),
    db.from('jam_votes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  if (ue) throw new Error(`taste read failed: ${ue.message}`)
  if (ce) throw new Error(`jam_votes count failed: ${ce.message}`)
  return { note: (u?.taste_note as string | null) ?? null, votes: count ?? 0, updatedAt: (u?.taste_updated_at as string | null) ?? null }
}

// ---------------------------------------------------------------------------
// Parameter attribution: the values that stuck in the user's best tracks
// ---------------------------------------------------------------------------

type Block = { type?: string; text?: string; name?: string; input?: unknown }
type Msg = { role?: string; content?: string | Block[] }

/** Plain text of a user message; null for tool results / anything else. */
function userText(m: Msg | undefined): string | null {
  if (!m || m.role !== 'user') return null
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content) && m.content.length && m.content.every((b) => b?.type === 'text')) return m.content.map((b) => b.text ?? '').join('\n')
  return null
}

/** Final `tweak` / `tweak_multi` value per parameter path across a track's history (last write wins). */
function finalValues(messages: unknown): Map<string, number | string> {
  const out = new Map<string, number | string>()
  if (!Array.isArray(messages)) return out
  const set = (path: unknown, value: unknown) => {
    if (typeof path !== 'string' || !path) return
    if (typeof value === 'number' && Number.isFinite(value)) out.set(path, value)
    else if (typeof value === 'string' && value.length <= 24) out.set(path, value)
  }
  for (const m of messages as Msg[]) {
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const b of m.content) {
      if (b?.type !== 'tool_use' || !b.input || typeof b.input !== 'object') continue
      const input = b.input as Record<string, unknown>
      if (b.name === 'tweak') set(input.path, input.value)
      else if (b.name === 'tweak_multi' && input.params && typeof input.params === 'object') {
        for (const [path, value] of Object.entries(input.params as Record<string, unknown>)) set(path, value)
      }
    }
  }
  return out
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const round = (x: number) => (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10)

/**
 * "Starting points": per parameter path, the median of what the agent's
 * tweaks settled on in the user's good tracks (rated 4–5, bounced or
 * published). Producer units — the agent's own vocabulary.
 */
export async function startingPoints(userId: string): Promise<string[]> {
  const db = jamDb()
  const [{ data: sig, error: se }, { data: rated, error: re }] = await Promise.all([
    db.from('jam_votes').select('track_id').eq('user_id', userId).in('source', ['bounce', 'publish']),
    db.from('jam_tracks').select('id').eq('user_id', userId).gte('rating', 4),
  ])
  if (se) throw new Error(`jam_votes read failed: ${se.message}`)
  if (re) throw new Error(`jam_tracks read failed: ${re.message}`)
  const ids = new Set<string>()
  for (const r of sig ?? []) ids.add(r.track_id as string)
  for (const r of rated ?? []) ids.add(r.id as string)
  if (!ids.size) return []
  const { data: tracks, error } = await db
    .from('jam_tracks')
    .select('id, messages, updated_at')
    .in('id', [...ids])
    .order('updated_at', { ascending: false })
    .limit(GOOD_TRACKS_FOR_POINTS)
  if (error) throw new Error(`jam_tracks read failed: ${error.message}`)

  const perPath = new Map<string, (number | string)[]>()
  for (const t of tracks ?? []) {
    for (const [path, value] of finalValues(t.messages)) {
      const list = perPath.get(path) ?? []
      list.push(value)
      perPath.set(path, list)
    }
  }
  return [...perPath.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, STARTING_POINTS_MAX)
    .map(([path, values]) => {
      const nums = values.filter((v): v is number => typeof v === 'number')
      const shown = nums.length ? String(round(median(nums))) : String(values[values.length - 1])
      return `${path} ${shown}${values.length > 1 ? ` (${values.length} tracks)` : ''}`
    })
}

// ---------------------------------------------------------------------------
// Correction mining: does this message push back on the last turn?
// ---------------------------------------------------------------------------

const MINER_SYSTEM = `You read one new message in a Jambot chat and say what it is. Jambot is an AI groovebox: the user asks for beats in words, an agent programs drum machines and synths with tools (add_jt90, tweak, add_send, set_arrangement …) and replies. You get the user's previous request, what the agent did for it, and the user's NEW message.

Answer with JSON only, no prose:
{"kind":"correction"|"praise"|"new"|"unclear","strength":1|2|3,"reason":"<at most 80 characters>","targets":["<parameter or move> <direction>", …]}

correction = the new message pushes back on what the agent just did: undo, "no", "too …", less/more of something the agent changed, or a "[controls] …" line (a manual slider/sequencer edit) that reverses or shrinks the agent's move. praise = it explicitly likes the result ("perfect", "love it") even if a new request follows. new = a new request with no judgment of the last turn. unclear = anything else.
strength: 3 = explicit rejection or undo, or strong words; 2 = a clear adjustment of the agent's move; 1 = mild. reason names the concrete thing (e.g. "reverb too big", "hats too busy", "kick lost its tail"). targets lists parameter paths or moves with a direction when you can tell, else [].`

export type Verdict = { kind: 'correction' | 'praise' | 'new' | 'unclear'; strength: 1 | 2 | 3; reason: string; targets: string[] }

async function classify(input: { asked: string; calls: ToolCall[]; reply: string; now: string }): Promise<Verdict> {
  const res = await client().messages.create({
    model: MINER_MODEL,
    max_tokens: 200,
    system: MINER_SYSTEM,
    messages: [{
      role: 'user',
      content: `Previous request: ${JSON.stringify(squash(input.asked, 400))}\nAgent did: ${JSON.stringify(input.calls.slice(0, 20))}\nAgent said: ${JSON.stringify(squash(input.reply, 400))}\nNEW message: ${JSON.stringify(squash(input.now, 500))}`,
    }],
  })
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`miner returned no JSON: ${text.slice(0, 120)}`)
  const j = JSON.parse(m[0]) as Partial<Verdict>
  const kind = (['correction', 'praise', 'new', 'unclear'] as const).find((k) => k === j.kind) ?? 'unclear'
  const strength = (j.strength === 1 || j.strength === 2 || j.strength === 3 ? j.strength : 1) as 1 | 2 | 3
  return { kind, strength, reason: typeof j.reason === 'string' ? squash(j.reason, 120) : '', targets: Array.isArray(j.targets) ? j.targets.filter((t): t is string => typeof t === 'string').slice(0, 8) : [] }
}

function hash8(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/**
 * Called by /api/jam/llm (after the response is sent) with the agent
 * history of the call that starts a user turn: the last message is the
 * user's new text, the messages before it are the previous turn. Records a
 * `correction` or `praise` signal and refreshes the note when due.
 */
export async function mineCorrection(userId: string, trackId: string, messages: unknown): Promise<Verdict['kind'] | 'skipped'> {
  if (!Array.isArray(messages) || messages.length < 3) return 'skipped'
  const msgs = messages as Msg[]
  const last = msgs.length - 1
  const now = userText(msgs[last])
  if (!now) return 'skipped'
  let j = last - 1
  while (j >= 0 && userText(msgs[j]) === null) j--
  if (j < 0) return 'skipped'
  const asked = userText(msgs[j]) as string
  const calls: ToolCall[] = []
  const replies: string[] = []
  for (let k = j + 1; k < last; k++) {
    const m = msgs[k]
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const b of m.content) {
      if (b?.type === 'tool_use' && typeof b.name === 'string') calls.push({ name: b.name, input: b.input })
      else if (b?.type === 'text' && b.text) replies.push(b.text)
    }
  }
  if (!calls.length && !replies.length) return 'skipped'
  const trimmed = trimCalls(calls)
  const verdict = await classify({ asked, calls: trimmed, reply: replies.join('\n'), now })
  if (verdict.kind !== 'correction' && verdict.kind !== 'praise') return verdict.kind
  await recordSignal(userId, {
    trackId,
    turnId: `corr:${j}:${hash8(asked)}`,
    score: verdict.kind === 'correction' ? -verdict.strength : verdict.strength,
    source: verdict.kind,
    prompt: asked,
    reply: replies.join('\n').slice(0, 1000),
    calls: trimmed,
    reason: [verdict.reason, ...verdict.targets].filter(Boolean).join(' · ').slice(0, 300) || undefined,
  })
  await maybeRefreshTaste(userId)
  return verdict.kind
}

// ---------------------------------------------------------------------------
// The note
// ---------------------------------------------------------------------------

/**
 * Rewrite the note when the user has enough new signals. Returns true when a
 * new note was written. Throws on model or database failure — callers log
 * and carry on; a signal is never lost over a note.
 */
export async function maybeRefreshTaste(userId: string): Promise<boolean> {
  const db = jamDb()
  const [{ data: u, error: ue }, { count, error: ce }, { count: rated, error: re }] = await Promise.all([
    db.from('jam_users').select('taste_votes_seen').eq('id', userId).maybeSingle(),
    db.from('jam_votes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('jam_tracks').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('rating', 'is', null),
  ])
  if (ue) throw new Error(`taste read failed: ${ue.message}`)
  if (ce) throw new Error(`jam_votes count failed: ${ce.message}`)
  if (re) throw new Error(`jam_tracks count failed: ${re.message}`)
  const total = (count ?? 0) + (rated ?? 0)
  const seen = Number(u?.taste_votes_seen ?? 0)
  if (total < TASTE_MIN_SIGNALS || total - seen < TASTE_EVERY) return false

  const [{ data: rows, error }, { data: tracks, error: te }] = await Promise.all([
    db.from('jam_votes')
      .select('score, source, prompt, reply, actions, calls, reason, state, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNALS_IN_PROMPT),
    db.from('jam_tracks')
      .select('title, rating, bpm, bars, session, feed, updated_at')
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(RATED_TRACKS_IN_PROMPT),
  ])
  if (error) throw new Error(`jam_votes read failed: ${error.message}`)
  if (te) throw new Error(`jam_tracks read failed: ${te.message}`)

  const note = await writeNote((rows ?? []).reverse(), tracks ?? [])
  const { error: we } = await db
    .from('jam_users')
    .update({ taste_note: note, taste_votes_seen: total, taste_updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (we) throw new Error(`taste write failed: ${we.message}`)
  return true
}

const NOTE_SYSTEM = `You write a short private production note about one Jambot user, from the signals they gave on the agent's work.

Jambot is an AI groovebox: the user asks for beats in words and an agent programs drum machines and synths (909 and 808-style drums, 303 acid, 101 leads, 202 bass, delay, reverb, sidechain, song arrangements). Signals, each on one turn unless said otherwise: vote = an explicit thumbs, +1..+3 liked (more = stronger), -1..-3 disliked; correction = the user pushed back on what the agent had just done (its reason says what was wrong), -1..-3 by strength; praise = they explicitly liked a result; bounce = they exported the whole track; publish = they put the whole track on the public catalog; star ratings rate a whole finished track 1–5. Each signal lists the tool calls the agent made (with parameter paths and values in the agent's units) — attach preferences to those concrete parameters when the signals support it. Whole-track signals (stars, bounce, publish) weigh more than a single turn.

Write at most 120 words of plain text in exactly this shape, one line each, and leave a line out when the signals say nothing about it:
Likes: …
Dislikes: …
Asks for: …
Watch out: …

Rules: only what the signals support, and name concrete things (tempos, instruments, sounds, parameter values, moves such as "long delay tails" or "busy hats"); no adjectives without evidence; when a strong signal and a weak one disagree, the strong one wins; if the evidence is thin, say "few signals yet" and keep it short. No preamble, no headings other than the four labels, no advice addressed to the user, no praise.`

async function writeNote(rows: Record<string, unknown>[], rated: Record<string, unknown>[]): Promise<string> {
  const tracks = rated.map((t) => {
    const session = t.session as { instruments?: { id?: string }[] } | null
    const feed = Array.isArray(t.feed) ? (t.feed as { kind?: string; text?: string }[]) : []
    return {
      stars: Number(t.rating),
      title: typeof t.title === 'string' ? t.title.slice(0, 80) : undefined,
      bpm: t.bpm,
      bars: t.bars,
      instruments: session?.instruments?.map((i) => i.id).filter(Boolean),
      asked: feed.filter((f) => f.kind === 'user' && typeof f.text === 'string').slice(0, 4).map((f) => (f.text as string).slice(0, 200)),
    }
  })
  const signals = rows.map((r) => ({
    kind: r.source ?? 'vote',
    score: Number(r.score),
    when: typeof r.created_at === 'string' ? r.created_at.slice(0, 10) : undefined,
    asked: typeof r.prompt === 'string' ? r.prompt.slice(0, 300) : undefined,
    reason: typeof r.reason === 'string' ? r.reason.slice(0, 200) : undefined,
    agent_did: Array.isArray(r.calls) && r.calls.length ? (r.calls as ToolCall[]).slice(0, 20) : (Array.isArray(r.actions) ? (r.actions as string[]).slice(0, 30) : []),
    agent_said: typeof r.reply === 'string' ? r.reply.slice(0, 300) : undefined,
    state: r.state ?? undefined,
  }))
  const res = await client().messages.create({
    model: TASTE_MODEL,
    max_tokens: 400,
    system: NOTE_SYSTEM,
    messages: [{ role: 'user', content: `Signals, oldest first:\n${JSON.stringify(signals)}\n\nWhole tracks the user star-rated (1–5):\n${JSON.stringify(tracks)}` }],
  })
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!text) throw new Error('taste note came back empty')
  return text.slice(0, NOTE_MAX_CHARS)
}

// ---------------------------------------------------------------------------
// Into the prompt
// ---------------------------------------------------------------------------

/**
 * The agent's system prompt with the user's taste appended. Keeps the
 * shape it was given (a string, or the Messages-API block array the engine
 * builds); the taste goes last so the cached blocks before it stay cached.
 */
export function appendTaste<T>(system: T, note: string | null, recent: string[] = [], starting: string[] = []): T {
  if (!note && recent.length === 0 && starting.length === 0) return system
  const parts = [
    '## What this listener likes',
    'From their thumbs, their corrections and what they kept (more thumbs = stronger). Lean toward it when it fits what they ask for now; don\'t mention it unless they ask.',
  ]
  if (note) parts.push(note)
  if (recent.length) parts.push(`Their latest signals:\n${recent.map((l) => `- ${l}`).join('\n')}`)
  if (starting.length) parts.push(`Starting points — the values your tweaks settled on in the tracks they rated well, bounced or published (median, your units). Start there unless they ask for something else:\n${starting.map((l) => `- ${l}`).join('\n')}`)
  const block = parts.join('\n')
  if (typeof system === 'string') return `${system}\n\n${block}` as T
  if (Array.isArray(system)) return [...system, { type: 'text', text: block }] as T
  return system
}

// Jam — what a user likes, learned from their thumbs on agent turns.
//
// v1 (2026-09-06): explicit votes only. After each agent turn the client
// offers 👍 / 👎 (tap up to three times); a vote is stored in jam_votes with
// the turn's prompt, the tools the agent ran, its reply and a small state
// snapshot. Once a user has TASTE_MIN_VOTES votes — and again every
// TASTE_EVERY new ones — a cheap model turns the recent votes into a short
// "taste note" (jam_users.taste_note) that /api/jam/llm appends to the
// agent's system prompt. v2 adds implicit signals (edits, publish) through
// jam_votes.source.

import Anthropic from '@anthropic-ai/sdk'
import { jamDb } from './db'

export const TASTE_MODEL = process.env.JAM_TASTE_MODEL || 'claude-sonnet-5'
/** Votes needed before the first note is written. */
export const TASTE_MIN_VOTES = 5
/** New votes between rewrites of the note. */
export const TASTE_EVERY = 5
const VOTES_IN_PROMPT = 60
const RATED_TRACKS_IN_PROMPT = 20
const RECENT_VOTES_IN_PROMPT = 5
const NOTE_MAX_CHARS = 1200

export type VoteInput = {
  trackId: string
  turnId: string
  /** -3..3; 0 removes the vote. */
  score: number
  prompt?: string
  reply?: string
  actions?: string[]
  state?: unknown
}

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

/** Store (or, for score 0, remove) one turn's vote. */
export async function recordVote(userId: string, v: VoteInput): Promise<void> {
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
      source: 'vote',
      prompt: v.prompt ?? null,
      reply: v.reply ?? null,
      actions: v.actions ?? [],
      state: v.state ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,track_id,turn_id' },
  )
  if (error) throw new Error(`jam_votes write failed: ${error.message}`)
}

/** turnId → score for one track. */
export async function listVotes(userId: string, trackId: string): Promise<Record<string, number>> {
  const { data, error } = await jamDb().from('jam_votes').select('turn_id, score').eq('user_id', userId).eq('track_id', trackId)
  if (error) throw new Error(`jam_votes read failed: ${error.message}`)
  const out: Record<string, number> = {}
  for (const row of data ?? []) out[row.turn_id as string] = Number(row.score)
  return out
}

/** The stored note (or null) — the one read the LLM route does per call. */
export async function getTasteNote(userId: string): Promise<string | null> {
  const { data, error } = await jamDb().from('jam_users').select('taste_note').eq('id', userId).maybeSingle()
  if (error) throw new Error(`taste read failed: ${error.message}`)
  return (data?.taste_note as string | null) ?? null
}

/**
 * The user's last few votes, verbatim, for the prompt — so the agent reacts
 * to a 👎👎👎 on "add a big reverb" from the very first vote, before there
 * are enough for a note.
 */
export async function recentVotes(userId: string, limit = RECENT_VOTES_IN_PROMPT): Promise<string[]> {
  const { data, error } = await jamDb()
    .from('jam_votes')
    .select('score, prompt, actions, reply, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`jam_votes read failed: ${error.message}`)
  return (data ?? []).reverse().map((r) => {
    const score = Number(r.score)
    const thumbs = (score > 0 ? '👍' : '👎').repeat(Math.min(3, Math.abs(score)))
    const asked = typeof r.prompt === 'string' ? r.prompt.replace(/\s+/g, ' ').slice(0, 160) : ''
    const did = Array.isArray(r.actions) && r.actions.length ? ` — agent ran ${(r.actions as string[]).slice(0, 8).join(', ')}` : ''
    const said = typeof r.reply === 'string' && r.reply ? ` — agent said "${r.reply.replace(/\s+/g, ' ').slice(0, 140)}"` : ''
    return `${thumbs} on "${asked}"${did}${said}`
  })
}

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

/**
 * Rewrite the note when the user has enough new votes. Returns true when a
 * new note was written. Throws on model or database failure — callers log
 * and carry on; a vote is never lost over a note.
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
  // Turn votes and whole-track star ratings count together as signals.
  const total = (count ?? 0) + (rated ?? 0)
  const seen = Number(u?.taste_votes_seen ?? 0)
  if (total < TASTE_MIN_VOTES || total - seen < TASTE_EVERY) return false

  const [{ data: rows, error }, { data: tracks, error: te }] = await Promise.all([
    db.from('jam_votes')
      .select('score, prompt, reply, actions, state, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(VOTES_IN_PROMPT),
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

const NOTE_SYSTEM = `You write a short private production note about one Jambot user, from their thumbs on the agent's turns.

Jambot is an AI groovebox: the user asks for beats in words and an agent programs drum machines and synths (909 and 808-style drums, 303 acid, 101 leads, 202 bass, delay, reverb, sidechain, song arrangements). Each vote rates one whole turn: what the user asked, what the agent did (the tools it ran, its reply) and the sound that resulted. Scores run +1..+3 (liked, more = stronger) and -1..-3 (disliked). Star ratings rate a whole finished track 1–5 (what it is, what was asked for along the way) and weigh more than a single turn. The note is read by the agent on every later turn so it can make the choices this user would make.

Write at most 120 words of plain text in exactly this shape, one line each, and leave a line out when the votes say nothing about it:
Likes: …
Dislikes: …
Asks for: …
Watch out: …

Rules: only what the votes support, and name concrete things (tempos, instruments, sounds, moves such as "long delay tails" or "busy hats"); no adjectives without evidence; when a strong vote and a weak one disagree, the strong one wins; if the evidence is thin, say "few votes yet" and keep it short. No preamble, no headings other than the four labels, no advice addressed to the user, no praise.`

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
  const votes = rows.map((r) => ({
    score: Number(r.score),
    when: typeof r.created_at === 'string' ? r.created_at.slice(0, 10) : undefined,
    asked: typeof r.prompt === 'string' ? r.prompt.slice(0, 400) : undefined,
    agent_did: Array.isArray(r.actions) ? (r.actions as string[]).slice(0, 30) : [],
    agent_said: typeof r.reply === 'string' ? r.reply.slice(0, 400) : undefined,
    state: r.state ?? undefined,
  }))
  const res = await client().messages.create({
    model: TASTE_MODEL,
    max_tokens: 400,
    system: NOTE_SYSTEM,
    messages: [{ role: 'user', content: `Turn votes, oldest first:\n${JSON.stringify(votes)}\n\nWhole tracks the user star-rated (1–5):\n${JSON.stringify(tracks)}` }],
  })
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!text) throw new Error('taste note came back empty')
  return text.slice(0, NOTE_MAX_CHARS)
}

/**
 * The agent's system prompt with the user's taste appended. Keeps the
 * shape it was given (a string, or the Messages-API block array the engine
 * builds); the note goes last so the cached blocks before it stay cached.
 */
export function appendTaste<T>(system: T, note: string | null, recent: string[] = []): T {
  if (!note && recent.length === 0) return system
  const parts = ['## What this listener likes', 'Their thumbs on earlier turns (more thumbs = stronger). Lean toward it when it fits what they ask for now; don\'t mention it unless they ask.']
  if (note) parts.push(note)
  if (recent.length) parts.push(`Their latest votes:\n${recent.map((l) => `- ${l}`).join('\n')}`)
  const block = parts.join('\n')
  if (typeof system === 'string') return `${system}\n\n${block}` as T
  if (Array.isArray(system)) return [...system, { type: 'text', text: block }] as T
  return system
}

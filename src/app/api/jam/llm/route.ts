// Jam — one Messages API call for the browser-side Jambot agent loop.
//
// The whole agent (session, tools, rendering) runs in the browser; this route
// only adds the API key. The request body is exactly what core/agent.js
// hands its `llm` function: { system, messages, tools, max_tokens }.
//
// Three gates keep a public URL from turning into an open proxy for the key:
//   1. a signed-in Jam account (jam_session cookie) — 401 otherwise
//   2. the request has to be a Jambot agent call: the system prompt carries
//      the Jambot marker and tools are present — 400 otherwise
//   3. a per-user daily token budget (JAM_DAILY_TOKENS, src/lib/jam/usage.ts)
//      — 429 once it is spent; admins are exempt (usage still recorded)
//
// The user's taste (src/lib/jam/taste.ts) is appended to the system prompt,
// and after each turn-starting call the new message is mined for a
// correction of the previous turn (header x-jam-track names the track).
//
// Upstream failures never come back as 401/403: the client treats 401 as
// "signed out", and a rejected server-side API key is not the user's problem.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse, after } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { dailyTokenLimit, getDailyUsage, recordUsage, type AnthropicUsage } from '@/lib/jam/usage'
import { appendTaste, getTasteNote, mineCorrection, recentSignals, startingPoints } from '@/lib/jam/taste'

export const runtime = 'nodejs'
export const maxDuration = 120

const DEFAULT_MODEL = 'claude-opus-5'
/** "jambot max": the newest Fable, extra-high effort (JAM_MAX_MODEL overrides). */
const MAX_MODEL = 'claude-fable-5-1'
const MAX_TOKENS_CAP = 16384

/** Every Jambot system prompt starts with this (JAMBOT-PROMPT.md). */
const JAMBOT_MARKER = 'You are Jambot'
const TRACK_RE = /^[0-9a-f-]{36}$/i

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

/**
 * A Jambot agent call has the Jambot system prompt (a string, or the
 * Messages-API array of text blocks core/agent.js builds) and a tool list.
 */
function isJambotCall(system: unknown, tools: unknown): boolean {
  if (!Array.isArray(tools) || tools.length === 0) return false
  if (typeof system === 'string') return system.includes(JAMBOT_MARKER)
  if (Array.isArray(system)) {
    return system.some((b) => {
      const text = (b as { text?: unknown } | null)?.text
      return typeof text === 'string' && text.includes(JAMBOT_MARKER)
    })
  }
  return false
}

const err = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)

  let body: { system?: unknown; messages?: unknown; tools?: unknown; max_tokens?: unknown }
  try {
    body = await req.json()
  } catch {
    return err('invalid JSON', 400)
  }
  const { system, messages, tools, max_tokens } = body
  if (!Array.isArray(messages) || messages.length === 0) return err('messages required', 400)
  if (!isJambotCall(system, tools)) return err('This endpoint only serves the Jambot agent.', 400)

  // Daily budget. A missing/unreachable usage table is a deployment error —
  // fail the call rather than run unmetered.
  let limit: number
  try {
    limit = dailyTokenLimit()
  } catch (e) {
    console.error('[jam/llm] budget config', (e as Error).message)
    return err('The music service is misconfigured (token budget). Try again later.', 500)
  }
  // Admins (jam_users.is_admin) have no cap — their usage is still recorded.
  try {
    const used = await getDailyUsage(user.id)
    if (used.total > limit && !user.admin) {
      console.warn('[jam/llm] daily budget spent', user.username, used.total, '>', limit)
      return err(`Daily limit reached (${Math.round(used.total / 1000)}k of ${Math.round(limit / 1000)}k tokens). It resets at midnight UTC.`, 429)
    }
  } catch (e) {
    console.error('[jam/llm] usage read', (e as Error).message)
    return err('The music service is misconfigured (usage accounting is unavailable). Try again later.', 500)
  }

  // "jambot max" (admins only, per open track): the newest Fable at extra-high
  // effort. The client sends x-jam-max: 1 on every call of that session.
  const maxMode = req.headers.get('x-jam-max') === '1' && user.admin
  const model = maxMode ? (process.env.JAM_MAX_MODEL || MAX_MODEL) : (process.env.JAM_MODEL || DEFAULT_MODEL)
  const maxTokens = Math.min(typeof max_tokens === 'number' ? max_tokens : 8192, MAX_TOKENS_CAP)
  if (maxMode) console.log('[jam/llm] max mode', user.username, model)

  // The user's taste — the summarized note plus their last few votes
  // verbatim — rides along at the end of the system prompt. A transient
  // read failure costs the taste for this turn, not the turn.
  let systemPrompt = system
  try {
    const [note, recent, starting] = await Promise.all([getTasteNote(user.id), recentSignals(user.id), startingPoints(user.id)])
    systemPrompt = appendTaste(system, note, recent, starting)
  } catch (e) {
    console.warn('[jam/llm] taste read', (e as Error).message)
  }

  let res: Anthropic.Message
  try {
    res = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      ...(maxMode ? { output_config: { effort: 'xhigh' as const } } : {}),
      system: systemPrompt as Anthropic.MessageCreateParams['system'],
      tools: tools as Anthropic.MessageCreateParams['tools'],
      messages: messages as Anthropic.MessageParam[],
    })
  } catch (e) {
    const { status, message } = e as { status?: number; message?: string }
    console.error('[jam/llm] upstream', status, message)
    // Never relay 401/403: the client would sign the user out for a server-side key problem.
    if (status === 401 || status === 403) return err('The music service is misconfigured (its API key was rejected). Your account is fine — try again later.', 502)
    if (status === 429) return err('The music service is busy. Try again in a moment.', 429)
    if (status === 529 || status === 503) return err('The music service is overloaded. Try again in a moment.', 503)
    // Anthropic reports an exhausted balance as a 400 invalid_request_error.
    if (status === 400 && /credit|billing/i.test(message || '')) return err('The music service is out of credit. Nothing is wrong with your track — try again later.', 502)
    if (status === 400) return err('The music service could not process this conversation. Try again; if it keeps failing, start a new track.', 502)
    return err('The music service is unavailable. Try again in a moment.', 502)
  }

  try {
    await recordUsage(user.id, res.usage as AnthropicUsage)
  } catch (e) {
    console.error('[jam/llm] usage write', (e as Error).message)
    return err('The music service is misconfigured (usage accounting failed). Try again later.', 500)
  }

  // Taste v2: after the response is on its way, judge the user's new
  // message against the previous turn (correction / praise) — only on the
  // call that starts a turn (its last message is user text, not a tool
  // result). Clients name the track in x-jam-track; older clients don't,
  // and then nothing is mined.
  const trackId = req.headers.get('x-jam-track') || ''
  if (TRACK_RE.test(trackId)) {
    after(async () => {
      try {
        const kind = await mineCorrection(user.id, trackId, messages)
        if (kind === 'correction' || kind === 'praise') console.log('[jam/llm] mined', kind, 'for', user.username)
      } catch (e) {
        console.error('[jam/llm] mining', (e as Error).message)
      }
    })
  }

  return NextResponse.json(res)
}

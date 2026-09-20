// Dodo voice on ElevenLabs Speech Engine + Claude — the second voice engine,
// a device-side setting next to GPT-Live (src/lib/f2/live.ts). Reference:
// docs/f2-eleven-voice-reference.md.
//
// Shape of a session:
// - ElevenLabs owns the audio: speech-to-text, turn-taking, barge-in and
//   text-to-speech. The phone talks to ElevenLabs over WebRTC with a
//   conversation token we mint here.
// - We own the words. For every user turn ElevenLabs sends the transcript to
//   the voice bridge (apps/dodo-voice-bridge, a WebSocket server — Vercel
//   cannot host one), which POSTs it to /api/f2/eleven/turn; that route runs
//   Claude with the session's stored prompt and streams plain text back.
// - Claude's context holds the WHOLE topic material, so there is no excerpt,
//   no backend model and no delegation (compare live.ts).
import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from './supabase'
import { type RealtimeMode } from './realtime'

const DEFAULT_MODEL = 'claude-opus-5'
const DEFAULT_EFFORT = 'low'
const MAX_TURN_TOKENS = 2048
/// What the client sends as a text message to make Dodo open a scripted
/// session. It reaches the bridge as the first user turn; turnMessages()
/// swaps it for the opening instruction, and clients keep it out of the
/// transcript they upload.
export const ELEVEN_KICKOFF = '[begin]'

export function elevenModel(): string {
  return process.env.F2_ELEVEN_MODEL || DEFAULT_MODEL
}

/// Thinking is OFF by default: in a spoken turn the wait before the first
/// word is what people feel. Measured 2026-09-20 on a topic session, time to
/// first text was 1.0–1.3 s disabled against 2.9 s adaptive at low effort.
/// F2_ELEVEN_THINKING=adaptive turns it back on.
function elevenThinking(): 'adaptive' | 'disabled' {
  return process.env.F2_ELEVEN_THINKING === 'adaptive' ? 'adaptive' : 'disabled'
}

function elevenEffort(): 'low' | 'medium' | 'high' {
  const effort = process.env.F2_ELEVEN_EFFORT
  return effort === 'medium' || effort === 'high' ? effort : DEFAULT_EFFORT
}

function elevenApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')
  return key
}

export function elevenEngineId(): string {
  const id = process.env.ELEVEN_SPEECH_ENGINE_ID
  if (!id) throw new Error('ELEVEN_SPEECH_ENGINE_ID is not set')
  return id
}

export function bridgeSecret(): string {
  const secret = process.env.DODO_BRIDGE_SECRET
  if (!secret) throw new Error('DODO_BRIDGE_SECRET is not set')
  return secret
}

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

/// A WebRTC conversation token for the Speech Engine. The phone starts the
/// conversation with it; the API key never leaves the server.
export async function mintElevenConversationToken(engineId: string = elevenEngineId()): Promise<string> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(engineId)}`,
    { headers: { 'xi-api-key': elevenApiKey() } },
  )
  const text = await res.text()
  if (!res.ok) {
    console.error('[f2/eleven] token mint failed:', res.status, text.slice(0, 400))
    throw new Error(`ElevenLabs token request failed (${res.status})`)
  }
  const token = (JSON.parse(text) as { token?: string }).token
  if (!token) throw new Error('ElevenLabs token response had no token')
  return token
}

/// The first user turn of a scripted session, in place of the kickoff text.
export function elevenOpeningInstruction(mode: RealtimeMode): string | null {
  if (mode === 'global' || mode === 'topic' || mode === 'walk') return null
  return '(The session has just connected and they are listening. Begin now: give your opening line exactly as your instructions describe and ask the first question.)'
}

// ---------------------------------------------------------------------------
// The session row: f2_voice_sessions carries the prompt for the turns.
// ---------------------------------------------------------------------------

export type ElevenSessionRow = {
  id: string
  user_id: string
  mode: RealtimeMode
  system_prompt: string
  ended_at: string | null
}

export async function getElevenSession(voiceSessionId: string): Promise<ElevenSessionRow | null> {
  const { data, error } = await f2Supabase()
    .from('f2_voice_sessions')
    .select('id, user_id, mode, system_prompt, ended_at')
    .eq('id', voiceSessionId)
    .not('system_prompt', 'is', null)
    .maybeSingle()
  if (error) {
    console.error('[f2/eleven] getElevenSession failed:', error)
    return null
  }
  return (data as ElevenSessionRow | null) ?? null
}

export async function saveElevenSessionPrompt(input: {
  voiceSessionId: string
  systemPrompt: string
}): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_voice_sessions')
    .update({ system_prompt: input.systemPrompt })
    .eq('id', input.voiceSessionId)
  if (error) console.error('[f2/eleven] saveElevenSessionPrompt failed:', error)
  return !error
}

export async function setElevenConversationId(voiceSessionId: string, conversationId: string) {
  const { error } = await f2Supabase()
    .from('f2_voice_sessions')
    .update({ realtime_session_id: conversationId })
    .eq('id', voiceSessionId)
    .is('realtime_session_id', null)
  if (error) console.error('[f2/eleven] setElevenConversationId failed:', error)
}

// ---------------------------------------------------------------------------
// A turn
// ---------------------------------------------------------------------------

export type ElevenTranscriptMessage = { role: 'user' | 'agent'; content: string }

/// ElevenLabs' running transcript → Messages API turns. Empty turns are
/// dropped, the kickoff becomes the opening instruction, and the list always
/// starts and ends with the user (the API requires the first; the last is
/// what Claude answers).
export function turnMessages(
  transcript: ElevenTranscriptMessage[],
  opening: string | null,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []
  for (const turn of transcript) {
    let text = (turn.content ?? '').trim()
    if (turn.role === 'user' && text === ELEVEN_KICKOFF) {
      text = opening ?? '(The session has just connected.)'
    }
    if (!text) continue
    const role = turn.role === 'agent' ? 'assistant' : 'user'
    if (messages.length === 0 && role === 'assistant') {
      messages.push({ role: 'user', content: '(The session has just connected.)' })
    }
    messages.push({ role, content: text })
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: '(They said nothing. Carry on naturally.)' })
  }
  return messages
}

export type ElevenTurnUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  first_text_ms: number | null
  total_ms: number
  stop_reason: string | null
}

/// Run one turn on Claude and yield the text as it arrives. The system prompt
/// is cached (it holds the topic material and never changes within a
/// session); the growing conversation is cached behind it.
export async function* streamElevenTurn(input: {
  systemPrompt: string
  messages: Anthropic.MessageParam[]
  signal?: AbortSignal
  onDone?: (usage: ElevenTurnUsage) => void
}): AsyncGenerator<string> {
  const started = Date.now()
  let firstTextAt: number | null = null
  const thinking = elevenThinking()
  const stream = anthropic().messages.stream(
    {
      model: elevenModel(),
      max_tokens: MAX_TURN_TOKENS,
      thinking: { type: thinking },
      output_config: { effort: elevenEffort() },
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: input.messages,
    },
    { signal: input.signal },
  )
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      if (firstTextAt === null) firstTextAt = Date.now()
      yield event.delta.text
    }
  }
  const final = await stream.finalMessage()
  input.onDone?.({
    input_tokens: final.usage.input_tokens,
    output_tokens: final.usage.output_tokens,
    cache_read_input_tokens: final.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: final.usage.cache_creation_input_tokens ?? 0,
    first_text_ms: firstTextAt === null ? null : firstTextAt - started,
    total_ms: Date.now() - started,
    stop_reason: final.stop_reason,
  })
}

import { f2Supabase } from './supabase'
import {
  buildFullContent,
  getThreadById,
  type F2Thread,
  type F2ThreadMessage,
} from './threads'

export type RealtimeMode = 'global' | 'topic'

export type VoiceSession = {
  id: string
  user_id: string
  thread_id: string | null
  mode: RealtimeMode
  realtime_session_id: string | null
  realtime_model: string | null
  realtime_voice: string | null
}

const DEFAULT_MODEL = 'gpt-realtime-2'
const DEFAULT_VOICE = 'marin'
const DEFAULT_REASONING_EFFORT = 'low'
const MAX_INITIAL_CONTENT_CHARS = 8000
const MAX_TOOL_CONTENT_CHARS = 16000
const MAX_RECENT_MESSAGES = 10

export function realtimeModel(): string {
  return process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL
}

export function realtimeVoice(): string {
  return process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE
}

export function realtimeReasoningEffort(): string {
  return process.env.OPENAI_REALTIME_REASONING_EFFORT || DEFAULT_REASONING_EFFORT
}

function openaiApiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return key
}

function summarizeThreadForPrompt(thread: F2Thread): string {
  const subject = thread.topic || thread.url || 'Untitled topic'
  const fullContent = buildFullContent(thread)
  const source = fullContent
    ? `\n\nSource excerpt:\n${fullContent.slice(0, MAX_INITIAL_CONTENT_CHARS)}`
    : ''
  const recent = formatMessages(thread.messages.slice(-MAX_RECENT_MESSAGES))
  return `Current topic:
Thread id: ${thread.id}
Title: ${subject}
URL: ${thread.url ?? 'none'}
Quiz count: ${thread.quiz_count}
Last quizzed: ${thread.last_quizzed_at ?? 'never'}
Recent messages:
${recent || '(none)'}${source}`
}

function formatMessages(messages: F2ThreadMessage[]): string {
  return messages
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
    .slice(0, 4000)
}

/// Pull a friendly first-name out of whatever the username happens to be.
/// Email-style usernames (the default for new signups) get the local part,
/// title-cased; anything else passes through.
function friendlyName(userName: string): string {
  const trimmed = userName.trim()
  if (!trimmed) return 'there'
  const local = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed
  // Strip digits/punctuation that look like decoration ("bart_d_42" → "bart d")
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim()
  if (!cleaned) return local
  return cleaned
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export function buildRealtimeInstructions(input: {
  mode: RealtimeMode
  userName: string
  thread?: F2Thread | null
}): string {
  const name = friendlyName(input.userName)
  const base = `You are F2, a learning companion, speaking in a live voice conversation with ${name}. Address them by their first name when it feels natural — do not use it in every sentence.

Style:
- Speak directly, naturally, and thoughtfully.
- Keep answers conversational; prefer 30-90 seconds unless the user asks for more.
- Ask one question at a time.
- When teaching, help the user understand the idea, not just memorize facts.
- Do not mention tool names or implementation details.

Grounding:
- If the user asks about saved F2 material, use get_topic_context before making specific claims.
- Never pretend you have read source text that has not been provided.
- If the tool returns limited context, say what you can infer and ask whether to go deeper.`

  if (input.mode === 'topic' && input.thread) {
    return `${base}

You are currently in topic voice mode. Treat this topic as the default referent for "this", "it", "the article", "the topic", or "what I saved".

${summarizeThreadForPrompt(input.thread)}`
  }

  return `${base}

You are currently in global voice mode. The user may ask about any saved F2 topic. Search/list-topic tools may be added later; for now, ask the user to open a topic for source-grounded discussion if you do not have enough context.`
}

export function getTopicContextTool() {
  return {
    type: 'function',
    name: 'get_topic_context',
    description:
      'Fetch source-grounded context for the current F2 topic. Use before making specific claims about saved topic content.',
    parameters: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: 'The F2 thread id for the topic being discussed.',
        },
        query: {
          type: 'string',
          description: 'The user question or phrase to retrieve relevant context for.',
        },
      },
      required: ['thread_id', 'query'],
      additionalProperties: false,
    },
  }
}

export async function createVoiceSession(input: {
  userId: string
  mode: RealtimeMode
  threadId?: string
  realtimeSessionId?: string
  model: string
  voice: string
}): Promise<VoiceSession | null> {
  const { data, error } = await f2Supabase()
    .from('f2_voice_sessions')
    .insert({
      user_id: input.userId,
      thread_id: input.threadId ?? null,
      mode: input.mode,
      realtime_session_id: input.realtimeSessionId ?? null,
      realtime_model: input.model,
      realtime_voice: input.voice,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[f2/realtime] createVoiceSession failed:', error)
    return null
  }
  return data as VoiceSession
}

export async function updateVoiceSessionRealtimeId(input: {
  userId: string
  voiceSessionId: string
  realtimeSessionId: string
}): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_voice_sessions')
    .update({
      realtime_session_id: input.realtimeSessionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.voiceSessionId)
    .eq('user_id', input.userId)
  if (error) console.error('[f2/realtime] update realtime id failed:', error)
}

export async function finishVoiceSession(input: {
  userId: string
  voiceSessionId: string
  transcript?: unknown
  summary?: string
  usage?: unknown
}): Promise<boolean> {
  const update: Record<string, unknown> = {
    ended_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (input.transcript !== undefined) update.transcript = input.transcript
  if (input.summary !== undefined) update.summary = input.summary
  if (input.usage !== undefined) update.usage = input.usage

  const { error } = await f2Supabase()
    .from('f2_voice_sessions')
    .update(update)
    .eq('id', input.voiceSessionId)
    .eq('user_id', input.userId)

  if (error) {
    console.error('[f2/realtime] finishVoiceSession failed:', error)
    return false
  }
  return true
}

export async function getTopicContext(input: {
  userId: string
  threadId: string
  query: string
}): Promise<{
  thread_id: string
  topic: string | null
  url: string | null
  quiz_count: number
  last_quizzed_at: string | null
  recent_messages: F2ThreadMessage[]
  context: string
}> {
  const thread = await getThreadById(input.userId, input.threadId)
  if (!thread) {
    throw new Error('Topic not found for this user.')
  }

  const content = buildFullContent(thread)
  const context = selectRelevantContent(content, input.query)
  return {
    thread_id: thread.id,
    topic: thread.topic,
    url: thread.url,
    quiz_count: thread.quiz_count,
    last_quizzed_at: thread.last_quizzed_at,
    recent_messages: thread.messages.slice(-MAX_RECENT_MESSAGES),
    context,
  }
}

function selectRelevantContent(content: string, query: string): string {
  if (!content) return ''
  if (content.length <= MAX_TOOL_CONTENT_CHARS) return content

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3)

  if (terms.length === 0) return content.slice(0, MAX_TOOL_CONTENT_CHARS)

  const lower = content.toLowerCase()
  let bestIndex = -1
  for (const term of terms) {
    const idx = lower.indexOf(term)
    if (idx >= 0 && (bestIndex === -1 || idx < bestIndex)) bestIndex = idx
  }
  if (bestIndex === -1) return content.slice(0, MAX_TOOL_CONTENT_CHARS)

  const start = Math.max(0, bestIndex - 3000)
  return content.slice(start, start + MAX_TOOL_CONTENT_CHARS)
}

export async function createOpenAIRealtimeClientSecret(input: {
  instructions: string
}) {
  const model = realtimeModel()
  const voice = realtimeVoice()
  const body = {
    session: {
      type: 'realtime',
      model,
      instructions: input.instructions,
      output_modalities: ['audio'],
      audio: {
        input: {
          turn_detection: {
            type: 'semantic_vad',
          },
          transcription: {
            model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-realtime-whisper',
            language: 'en',
          },
        },
        output: {
          voice,
        },
      },
      reasoning: {
        effort: realtimeReasoningEffort(),
      },
      tool_choice: 'auto',
      tools: [getTopicContextTool()],
    },
  }

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }

  if (!res.ok) {
    console.error('[f2/realtime] OpenAI client secret failed:', json)
    throw new Error(`OpenAI client secret failed (${res.status})`)
  }

  return json as {
    value: string
    expires_at: number
    session: { id: string; model?: string }
  }
}

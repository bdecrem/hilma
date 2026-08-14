import { f2Supabase } from './supabase'
import {
  buildFullContent,
  getThreadById,
  type F2Thread,
  type F2ThreadMessage,
} from './threads'

// 'walk' belongs to Peri (src/lib/f4) but shares this table + session helpers.
// 'flash' = a spoken 10-card flash set; 'final_review' = the star-3 oral exam;
// 'second_chance' = the 3-question retake offered after a failed Final Review.
export type RealtimeMode =
  | 'global' | 'topic' | 'walk' | 'flash' | 'final_review' | 'second_chance'

export type VoiceSession = {
  id: string
  user_id: string
  thread_id: string | null
  mode: RealtimeMode
  realtime_session_id: string | null
  realtime_model: string | null
  realtime_voice: string | null
}

const DEFAULT_MODEL = 'gpt-realtime-2.1'
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

/// The Realtime voices users can pick from, probed against the live API
/// (fable/onyx/nova are TTS-only and rejected; alloy/verse accepted but
/// left out to keep the list at 8). Preview clips for these ship in the
/// Dodo app bundle — regenerate with scripts/generate-voice-previews.mjs
/// if this list changes.
export const REALTIME_VOICES = [
  { id: 'marin', label: 'Marin', blurb: 'Bright and natural — the default.' },
  { id: 'cedar', label: 'Cedar', blurb: 'Grounded and easygoing, lower register.' },
  { id: 'ash', label: 'Ash', blurb: 'Calm and low-key.' },
  { id: 'ballad', label: 'Ballad', blurb: 'Expressive, storyteller cadence.' },
  { id: 'coral', label: 'Coral', blurb: 'Upbeat and quick.' },
  { id: 'echo', label: 'Echo', blurb: 'Clear and direct.' },
  { id: 'sage', label: 'Sage', blurb: 'Soft and unhurried.' },
  { id: 'shimmer', label: 'Shimmer', blurb: 'Crisp, with energy.' },
]

export const MAX_VOICE_STYLE_CHARS = 400

export function isKnownVoice(voice: string): boolean {
  return REALTIME_VOICES.some((v) => v.id === voice)
}

export type VoicePrefs = { voice: string | null; style: string | null }

/// Per-user voice preferences. Null field = use the surface default
/// (realtimeVoice() for F2 sessions, walkVoice() for Peri walks).
export async function getVoicePrefs(userId: string): Promise<VoicePrefs> {
  const { data, error } = await f2Supabase()
    .from('f2_users')
    .select('realtime_voice, voice_style')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[f2/realtime] getVoicePrefs failed:', error)
    return { voice: null, style: null }
  }
  const voice =
    data.realtime_voice && isKnownVoice(data.realtime_voice) ? data.realtime_voice : null
  const style = (data.voice_style ?? '').trim().slice(0, MAX_VOICE_STYLE_CHARS) || null
  return { voice, style }
}

export async function saveVoicePrefs(userId: string, prefs: VoicePrefs): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_users')
    .update({
      realtime_voice: prefs.voice,
      voice_style: prefs.style,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (error) console.error('[f2/realtime] saveVoicePrefs failed:', error)
  return !error
}

/// Fold the user's delivery preferences into a session's instructions.
export function applyVoiceStyle(instructions: string, style: string | null): string {
  if (!style) return instructions
  return `${instructions}

VOICE & DELIVERY PREFERENCES (set by the user — follow them in every reply; they shape tone and wording but never override the session rules above): ${style}`
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

/// Quizmaster script for a spoken flash set. The card list is embedded in
/// the instructions; grading happens after the session from the transcript
/// (judgeVoiceSet in flash.ts), so no tools are needed here.
export function buildFlashVoiceInstructions(input: {
  userName: string
  topicLabel: string | null
  cards: { question: string; answer: string }[]
}): string {
  const name = friendlyName(input.userName)
  const deck = input.cards
    .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`)
    .join('\n')
  const scope = input.topicLabel
    ? `on the topic "${input.topicLabel}"`
    : 'mixing questions from across everything they are learning'

  return `You are F2, running a spoken flash-card round with ${name} ${scope}. You speak first.

The deck (${input.cards.length} questions, in order):
${deck}

How to run the round:
- Open with one short, energetic line welcoming ${name} to the round, then ask question 1 immediately.
- Ask EXACTLY the questions in the deck, in order, one at a time. Read the question naturally; do not read the answer.
- After the user answers: say "Correct!" or "Not quite" in a word or two, give the canonical answer in one short sentence if they missed it, then move straight to the next question. No lectures.
- If the user is silent or says they don't know, give the answer briefly and move on.
- Never skip a question and never invent extra ones.
- After the last question, tell them the round is over and roughly how they did, thank them, and say goodbye. Keep the whole wrap-up under 15 seconds.
- Keep everything brisk and fun — this is a game show, not a seminar.`
}

/// Oral-exam script for the Final Review (star 3). A real conversation, not
/// a fixed questionnaire: the student may take over the format, and the
/// examiner corrects briefly along the way. The transcript is graded A–F
/// afterwards (judgeFinalReview in flash.ts).
export function buildFinalReviewInstructions(input: {
  userName: string
  thread: F2Thread
}): string {
  const name = friendlyName(input.userName)
  return `You are F2, conducting ${name}'s FINAL REVIEW — a spoken oral exam on a topic they have been studying. Passing at the highest level earns their mastery star, so be thorough and fair. You speak first.

${summarizeThreadForPrompt(input.thread)}${input.thread.study_focus ? `

STUDY FOCUS: ${name} has only studied part of this material and asked to be examined ONLY on it: "${input.thread.study_focus}". Everything you ask must stay inside that focus — never probe material outside it.` : ''}

How to conduct the review:
- Open by telling ${name} this is their Final Review and there's a star on the line, then ask the first question: what's their main takeaway from this material?
- Default shape: about five substantive questions that together cover the main ideas AND some supporting detail. Prefer "explain", "why", and "how" over trivia. One question at a time; let them finish.
- The student may propose their own format — "let me summarize it in five parts and we'll discuss each", walking through it chapter by chapter, and so on. Accept it and work inside it: listen to each part, probe it with follow-up questions, and make sure anything important they skip still gets covered by your questions before the end.
- Track what they have ALREADY covered, especially during a long opening overview. Never ask them to repeat something an earlier answer already handled — when your planned question was covered, say so in a few words and either go one level deeper on it (mechanism, evidence, why it matters) or move to ground they haven't touched. Redundant questions waste their exam.
- Corrections are allowed and useful. When they get something wrong or leave out something essential, say so briefly — one or two plain, specific sentences — then move on. No lectures: this is still an exam, and the grade rests on what THEY demonstrate, so keep the floor mostly theirs.
- A short follow-up probe ("and why does that matter?") is good whenever an answer is thin.
- Use get_topic_context if you need source detail to form a good question or to check a claim they made.
- Keep the whole thing a fluid conversation — their thinking, your questions, your brief corrections — not a quiz script.
- Once the material has been covered, thank them, tell them the review is complete and that their grade is being tallied, and say goodbye. Do not announce a grade yourself.`
}

/// The Second Chance: exactly three questions, offered after a failed Final
/// Review. Targets the weaknesses from the failed attempt when we have them.
/// Passing bar (applied by the grader afterwards): A-level command across
/// the three answers combined.
export function buildSecondChanceInstructions(input: {
  userName: string
  thread: F2Thread
  /** Weaknesses the grader flagged on the failed Final Review, if any. */
  weaknesses?: string[]
}): string {
  const name = friendlyName(input.userName)
  const weak = (input.weaknesses ?? []).filter((w) => w.trim())
  return `You are F2, giving ${name} their SECOND CHANCE — a short spoken retake after a Final Review that fell just short. Exactly THREE questions. Their mastery star is on the line: to pass, their three answers together must be A-level. You speak first.

${summarizeThreadForPrompt(input.thread)}${input.thread.study_focus ? `

STUDY FOCUS: ${name} has only studied part of this material and asked to be examined ONLY on it: "${input.thread.study_focus}". Everything you ask must stay inside that focus.` : ''}${weak.length > 0 ? `

WHERE THEY FELL SHORT LAST TIME — build your three questions primarily from these areas, so they can prove they've closed the gaps:
${weak.map((w) => `- ${w}`).join('\n')}` : ''}

How to run it:
- Open by telling ${name} this is their Second Chance: three questions, and strong answers on all three earn the star. Then ask question 1.
- Ask EXACTLY three substantive questions — "explain", "why", "how" — one at a time. No more, no fewer.
- One short follow-up probe per question is allowed when an answer is thin, but it belongs to the same question.
- Brief corrections are fine, but the grade rests on what THEY demonstrate — keep the floor theirs.
- Use get_topic_context if you need source detail to form a sharp question.
- After the third answer, thank them, say their grade is being tallied, and say goodbye. Do not announce a result yourself.`
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
  /** Override the tool catalog (defaults to F2's get_topic_context). */
  tools?: unknown[]
  /** Override the output voice (defaults to env / marin). */
  voice?: string
}) {
  const model = realtimeModel()
  const voice = input.voice ?? realtimeVoice()
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
      tools: input.tools ?? [getTopicContextTool()],
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

// Dodo's GLOBAL chat — one conversation, typed or spoken, that knows
// everything in all of ONE user's topics. Reference: docs/f2-global-chat.md.
//
// What Claude gets on every turn:
//   - the MAP (knowledge.ts): a digest of every topic + where the learner
//     stands on it — cached with the system prompt;
//   - PASSAGES: the turn's question is searched against the user's embedded
//     material BEFORE Claude is called, and the hits ride in with the question
//     (no tool round-trip, so a spoken turn stays quick);
//   - a `search_material` tool for when it needs to dig further.
// The same turn runner serves the text chat (collected) and the ElevenLabs
// voice engine (streamed to be spoken).
import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from './supabase'
import { friendlyName } from './live'
import {
  buildKnowledgeMap,
  findTopicByTitle,
  formatPassages,
  listTopicTitles,
  searchKnowledge,
  worthSearching,
  type Passage,
} from './knowledge'

const MAX_TOOL_ROUNDS = 2
const MAX_STORED_MESSAGES = 400
/// Conversation turns sent back to the model. Older ones stay in the table.
const HISTORY_TURNS = 40

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

// ---------------------------------------------------------------------------
// Storage: one row per user
// ---------------------------------------------------------------------------

export type GlobalSource = { thread_id: string; topic: string }

export type GlobalMessage = {
  role: 'user' | 'assistant'
  text: string
  created_at: string
  via?: 'voice'
  sources?: GlobalSource[]
}

export async function getGlobalMessages(userId: string): Promise<GlobalMessage[]> {
  const { data, error } = await f2Supabase()
    .from('f2_global_chats')
    .select('messages')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`global chat read failed: ${error.message}`)
  return ((data?.messages as GlobalMessage[] | undefined) ?? []).filter((m) => m?.text)
}

export async function appendGlobalMessages(userId: string, toAdd: GlobalMessage[]): Promise<GlobalMessage[]> {
  if (toAdd.length === 0) return getGlobalMessages(userId)
  const existing = await getGlobalMessages(userId)
  const messages = [...existing, ...toAdd].slice(-MAX_STORED_MESSAGES)
  const { error } = await f2Supabase()
    .from('f2_global_chats')
    .upsert({ user_id: userId, messages, updated_at: new Date().toISOString() })
  if (error) throw new Error(`global chat write failed: ${error.message}`)
  return messages
}

export async function clearGlobalMessages(userId: string): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_global_chats')
    .upsert({ user_id: userId, messages: [], updated_at: new Date().toISOString() })
  if (error) throw new Error(`global chat clear failed: ${error.message}`)
}

/// A finished global VOICE session joins the same conversation.
export async function mergeVoiceTranscript(
  userId: string,
  transcript: { role?: string; text?: string; created_at?: string }[],
): Promise<void> {
  const turns: GlobalMessage[] = transcript
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && t.text?.trim())
    .map((t) => ({
      role: t.role as 'user' | 'assistant',
      text: t.text!.trim(),
      created_at: t.created_at ?? new Date().toISOString(),
      via: 'voice' as const,
    }))
  await appendGlobalMessages(userId, turns)
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const GLOBAL_BRIEF = (name: string, topics: number) =>
  `This is ${name}'s GLOBAL conversation: it is not about one topic, it is about everything they have saved in Dodo — ${topics} topic${topics === 1 ? '' : 's'}, listed in YOUR LIBRARY MAP below. Only their own library exists here; you know nothing about what other people saved.

How to use what you have:
- The map tells you what each topic covers and where ${name} stands on it (stars, weak spots, how recently they touched it). Use it to answer "what have I got on…", to connect ideas ACROSS topics, to suggest what to review, and to decide where to look.
- Passages from their material may arrive with a question, marked as retrieved. Treat them as the source of truth for details, and say which topic something comes from when it helps ("in your Sapiens notes…").
- When the passages don't cover what you need, use the search_material tool — with a specific query, optionally narrowed to one topic — rather than answering from general knowledge as if it were theirs. If their library has nothing on it, say so plainly, then answer from general knowledge and make clear that's what you're doing.
- Never invent the contents of a topic. The map is a summary; a detail that is in neither the map nor a passage has not been read.`

const TEXT_STYLE = (name: string) =>
  `You are Dodo, a learning companion, in a text chat with ${name}. Be warm, direct and specific. Keep replies short by default — a few sentences, or a tight list when that is clearer — and go longer only when asked. Light markdown is fine. Ask at most one question at a time.`

const TOOL_NOTE =
  'When you use a tool, you may say a brief sentence first. If no tool can express what was asked for, say so instead of guessing. Do not include internal or system XML tags in your response.'

export type GlobalSurface = 'text' | 'eleven'

/// The system prompt for a global turn. `voicePersona` is the spoken-engine
/// persona from live.ts (ELEVEN_PERSONA) when the surface is voice.
export async function buildGlobalSystem(input: {
  userId: string
  userName: string
  surface: GlobalSurface
  voicePersona?: string
}): Promise<{ system: string; topics: number }> {
  const name = friendlyName(input.userName)
  const map = await buildKnowledgeMap(input.userId)
  const head = input.surface === 'eleven' && input.voicePersona ? input.voicePersona : TEXT_STYLE(name)
  const spoken =
    input.surface === 'eleven'
      ? `\n\nKeep spoken answers conversational — usually under 45 seconds. Before a search, say one short natural line ("let me look at your notes on that") so there is no dead air.`
      : ''
  const system = `${head}

${GLOBAL_BRIEF(name, map.topics)}${spoken}

${TOOL_NOTE}

YOUR LIBRARY MAP (${map.topics} topics, most recently touched first):
${map.text || '(the library is empty — they have not saved anything yet; help them decide what to add)'}`
  return { system, topics: map.topics }
}

/// The compact form for GPT-Live, whose live prompt is capped at 16K tokens:
/// titles + standing only. The full map goes to its Responses backend.
export async function buildGlobalMapBlocks(userId: string): Promise<{ full: string; compact: string; topics: number }> {
  const map = await buildKnowledgeMap(userId)
  const compact = map.text
    .split('\n\n')
    .map((entry) => entry.split('\n').slice(0, 2).join('\n'))
    .join('\n')
    .slice(0, 24_000)
  return { full: map.text, compact, topics: map.topics }
}

// ---------------------------------------------------------------------------
// A turn
// ---------------------------------------------------------------------------

const SEARCH_TOOL: Anthropic.Tool = {
  name: 'search_material',
  description:
    "Search the full text of this learner's own saved material (all topics, or one) and get back the most relevant passages. Use it when the library map and any retrieved passages do not contain the detail you need. Write the query as the specific thing you are looking for, not as a question to the learner.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for, in a few specific words or a short phrase.' },
      topic: {
        type: 'string',
        description: 'Optional: the title of one topic from the library map, to search only that topic.',
      },
    },
    required: ['query'],
  },
}

export type GlobalTurnResult = {
  sources: GlobalSource[]
  searches: number
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
    retrieval_ms: number
    first_text_ms: number | null
    total_ms: number
  }
}

const STOPWORDS = new Set(
  'about above after again against because before being below between could doing during every first found great their there these thing things think those three through under until where which while whose would should other others still might never always really something someone topic topics notes saved library'.split(' '),
)

function distinctiveTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().match(/[\p{L}]{5,}|\d{2,}/gu) ?? []) {
    if (!STOPWORDS.has(raw)) out.add(raw)
  }
  return out
}

/// Which topics did the ANSWER draw on? Not "which passages were retrieved" —
/// a loose match reaches the model on purpose, and similarity scores do not
/// separate used from unused. A topic is a source when the reply names it, or
/// when the reply shares enough distinctive words with one of its passages
/// that the passage was evidently used.
function sourcesOf(reply: string, passages: Passage[], titles: { threadId: string; topic: string }[]): GlobalSource[] {
  const seen = new Map<string, GlobalSource>()
  const replyLower = reply.toLowerCase()
  const replyTokens = distinctiveTokens(reply)
  for (const t of titles) {
    if (t.topic.length >= 6 && replyLower.includes(t.topic.toLowerCase())) {
      seen.set(t.threadId, { thread_id: t.threadId, topic: t.topic })
    }
  }
  for (const p of passages) {
    if (seen.has(p.threadId)) continue
    let shared = 0
    for (const token of distinctiveTokens(p.text)) if (replyTokens.has(token)) shared++
    if (shared >= 4) seen.set(p.threadId, { thread_id: p.threadId, topic: p.topic })
  }
  return [...seen.values()]
}

/// Run one global turn and yield Claude's text as it arrives. `messages` must
/// end with the user's turn (plain text).
export async function* runGlobalTurn(input: {
  userId: string
  system: string
  messages: Anthropic.MessageParam[]
  model: string
  thinking: 'adaptive' | 'disabled'
  effort: 'low' | 'medium' | 'high'
  maxTokens: number
  signal?: AbortSignal
  onDone?: (result: GlobalTurnResult) => void
}): AsyncGenerator<string> {
  const started = Date.now()
  let firstTextAt: number | null = null
  let reply = ''
  const used: Passage[] = []
  let searches = 0
  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  // 1. Retrieve for the question itself, before the model runs.
  const messages = [...input.messages]
  const last = messages[messages.length - 1]
  const question = last && last.role === 'user' && typeof last.content === 'string' ? last.content : ''
  let retrievalMs = 0
  if (question && worthSearching(question)) {
    const t0 = Date.now()
    try {
      const passages = await searchKnowledge(input.userId, question, { limit: 5 })
      if (passages.length > 0) {
        used.push(...passages)
        messages[messages.length - 1] = {
          role: 'user',
          content: `[Retrieved from their library for this turn — use what is relevant, ignore the rest]\n${formatPassages(passages)}\n\n[What they said]\n${question}`,
        }
      }
    } catch (err) {
      // A search outage must not take the conversation down: the map is still there.
      console.error('[f2/global-chat] pre-retrieval failed:', err)
    }
    retrievalMs = Date.now() - t0
  }

  // 2. Claude, with the search tool, for up to MAX_TOOL_ROUNDS extra rounds.
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic().messages.stream(
      {
        model: input.model,
        max_tokens: input.maxTokens,
        thinking: { type: input.thinking },
        output_config: { effort: input.effort },
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        tools: round < MAX_TOOL_ROUNDS ? [SEARCH_TOOL] : undefined,
        messages,
      },
      { signal: input.signal },
    )
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (firstTextAt === null) firstTextAt = Date.now()
        reply += event.delta.text
        yield event.delta.text
      }
    }
    const final = await stream.finalMessage()
    totals.input_tokens += final.usage.input_tokens
    totals.output_tokens += final.usage.output_tokens
    totals.cache_read_input_tokens += final.usage.cache_read_input_tokens ?? 0
    totals.cache_creation_input_tokens += final.usage.cache_creation_input_tokens ?? 0

    const calls = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (final.stop_reason !== 'tool_use' || calls.length === 0) break

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      const args = call.input as { query?: unknown; topic?: unknown }
      const query = typeof args.query === 'string' ? args.query : ''
      searches++
      try {
        const threadId =
          typeof args.topic === 'string' && args.topic.trim()
            ? ((await findTopicByTitle(input.userId, args.topic)) ?? undefined)
            : undefined
        const passages = query ? await searchKnowledge(input.userId, query, { limit: 6, threadId }) : []
        used.push(...passages)
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: passages.length > 0 ? formatPassages(passages) : 'Nothing in their library matches that.',
        })
      } catch (err) {
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          is_error: true,
          content: `Search failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        })
      }
    }
    messages.push({ role: 'assistant', content: final.content })
    messages.push({ role: 'user', content: results })
    // A spoken reply needs a breath between the bridging line and the answer.
    yield ' '
  }

  input.onDone?.({
    sources: sourcesOf(reply, used, await listTopicTitles(input.userId)),
    searches,
    usage: {
      ...totals,
      retrieval_ms: retrievalMs,
      first_text_ms: firstTextAt === null ? null : firstTextAt - started,
      total_ms: Date.now() - started,
    },
  })
}

/// Stored history → Messages API turns (most recent HISTORY_TURNS).
export function historyMessages(history: GlobalMessage[]): Anthropic.MessageParam[] {
  return history.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: m.text }))
}

import Anthropic from '@anthropic-ai/sdk'
import type { F2Thread } from './threads'

const MODEL = 'claude-sonnet-4-6'
const MAX_CONTEXT_FOR_CHAT = 24000

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

// Three actions Claude can pick on every inbound text:
//  - continue: stay in the active learning thread; persist the exchange
//  - new_topic: spin up a fresh thread on a new topic; persist as the new thread
//  - chitchat: answer off-topic question without polluting any learning thread
export type RouterAction =
  | { kind: 'continue'; reply: string }
  | { kind: 'new_topic'; topic: string; reply: string }
  | { kind: 'chitchat'; reply: string }

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'continue_chat',
    description:
      "Reply within the user's ACTIVE learning thread. Use when the user is asking a follow-up question, answering a quiz, requesting clarification, or otherwise advancing the current topic. The exchange will be appended to the thread's message history.",
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Your response to the user.' },
      },
      required: ['reply'],
    },
  },
  {
    name: 'start_new_topic',
    description:
      "Start a fresh learning thread on a DIFFERENT topic. Use when the user explicitly asks to learn something new (\"explain X\", \"teach me about Y\", \"let's switch to Z\") or when their question is clearly about a domain unrelated to the active thread. The opening_reply must briefly acknowledge the switch (e.g. 'New topic: X.' or 'Switching to Y.') and then begin substantive teaching.",
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Short noun phrase naming the new topic (2-5 words).',
        },
        opening_reply: {
          type: 'string',
          description:
            'Full response to the user — should include both the topic-switch acknowledgement and substantive opening content.',
        },
      },
      required: ['topic', 'opening_reply'],
    },
  },
  {
    name: 'chitchat',
    description:
      "Answer an off-topic or chatbot-style question that doesn't belong in a learning thread (weather, jokes, code help, trivia unrelated to the active topic, casual conversation). This reply will NOT be persisted anywhere.",
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Your response to the user.' },
      },
      required: ['reply'],
    },
  },
]

function buildSystem(thread: F2Thread | null): string {
  const baseRules = `Reply rules:
- Be direct. No preambles ("Great question", "Based on the article").
- Plain text, no markdown.
- Keep replies tight unless the user asks for more.`

  if (!thread) {
    return `You are F2 — a learning companion. The user has no active learning thread yet.

For every message, pick exactly one tool:
- start_new_topic: if the user wants to learn something. Even simple framings like "explain photosynthesis" or "what is X" should start a topic — that's the whole point of F2.
- chitchat: only for clearly off-topic banter (weather, jokes, casual hellos, AI-chatbot trivia unrelated to learning).
- continue_chat: do NOT use — there is no active thread.

${baseRules}`
  }

  const subject = thread.topic
    ? `topic "${thread.topic}"`
    : thread.url
      ? `URL ${thread.url}`
      : '(no subject)'

  const sourceBlock = thread.content
    ? `\n\nSource content (primary reference — answer from this when relevant):\n${thread.content.slice(0, MAX_CONTEXT_FOR_CHAT)}`
    : ''

  return `You are F2 — a learning companion. The user has an ACTIVE learning thread on: ${subject}.${sourceBlock}

For every message, pick exactly one tool:
- continue_chat: the user is advancing the current topic — follow-up questions, quiz answers, "tell me more", clarifications.
- start_new_topic: the user wants to learn about a different topic. Don't be too eager — only switch when the new topic is clearly unrelated.
- chitchat: off-topic banter, jokes, weather, AI-chatbot trivia unrelated to the active topic. Won't be persisted.

${baseRules}`
}

export async function routeAndReply(
  thread: F2Thread | null,
  userText: string,
): Promise<RouterAction> {
  const systemText = buildSystem(thread)

  const history = (thread?.messages ?? []).map((m) => ({
    role: m.role,
    content: m.text,
  }))

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: [
      { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
    ],
    tools: TOOLS,
    tool_choice: { type: 'any' },
    messages: [...history, { role: 'user', content: userText }],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    // Defensive: model returned plain text instead of a tool call.
    const text = response.content.find((b) => b.type === 'text')
    const reply = text?.type === 'text' ? text.text.trim() : '(no response)'
    return { kind: 'chitchat', reply }
  }

  const input = toolUse.input as Record<string, unknown>
  switch (toolUse.name) {
    case 'continue_chat':
      return { kind: 'continue', reply: String(input.reply ?? '').trim() }
    case 'start_new_topic':
      return {
        kind: 'new_topic',
        topic: String(input.topic ?? '').trim(),
        reply: String(input.opening_reply ?? '').trim(),
      }
    case 'chitchat':
      return { kind: 'chitchat', reply: String(input.reply ?? '').trim() }
    default:
      return {
        kind: 'chitchat',
        reply: `(unknown tool: ${toolUse.name})`,
      }
  }
}

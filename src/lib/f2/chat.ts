import { buildFullContent, type F2Thread } from './threads'
import { llmComplete, contextCharBudget, type LlmTool } from './llm'

// All chat replies go through the model registry in llm.ts. `model` params
// below are registry keys sent by the client (iOS/macOS picker); undefined
// keeps the legacy default so the web app is unchanged.

// Actions Claude can pick on every inbound text:
//  - continue: stay in the active learning thread; persist the exchange
//  - new_topic: spin up a fresh thread on a new topic; persist as the new thread
//  - chitchat: answer off-topic question without polluting any learning thread
//  - more_videos: (video topics only) find 3 more videos for this topic —
//    the agent layer runs the YouTube search, not the router
export type RouterAction =
  | { kind: 'continue'; reply: string }
  | { kind: 'new_topic'; topic: string; reply: string }
  | { kind: 'chitchat'; reply: string }
  | { kind: 'more_videos'; refinement: string | null }

const TOOLS: LlmTool[] = [
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

/// Offered only when the active thread was seeded with videos. The router
/// just signals intent — the agent layer runs the actual YouTube search.
const MORE_VIDEOS_TOOL: LlmTool = {
  name: 'more_videos',
  description:
    'The user wants MORE videos for the active topic — "give me 3 other ones", "find me different videos", "more videos please", "got anything newer?". Do not use for questions about the existing videos\' content.',
  input_schema: {
    type: 'object',
    properties: {
      refinement: {
        type: 'string',
        description:
          'Only when the user narrows the ask (e.g. "more, but about the experiments"): a short phrase capturing the narrowing. Omit otherwise.',
      },
    },
  },
}

/// A thread qualifies for more_videos when it carries video sources — either
/// it was created by the "new/setup" video flow (video_band set) or its
/// primary source is a video URL.
export function threadHasVideos(thread: F2Thread | null): boolean {
  if (!thread) return false
  return thread.video_band != null || thread.kind === 'video'
}

/// Fit source material to the model's context budget. Books overflow the
/// smaller-context models (GLM: 262K tokens vs Claude's 1M); rather than
/// hard-failing the API call, keep the head of the source and say so.
function fitToBudget(content: string, model: string | null | undefined): string {
  const budget = contextCharBudget(model)
  if (content.length <= budget) return content
  return (
    content.slice(0, budget) +
    '\n\n[Source truncated here — it exceeds this model\'s context window. Answer from the portion above and general knowledge; mention the cutoff if the user asks about late-in-source material.]'
  )
}

function buildSystem(thread: F2Thread | null, model?: string | null): string {
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

  const fullContent = buildFullContent(thread)
  const sourceBlock = fullContent
    ? `\n\nSource content (primary reference — answer from this when relevant):\n${fitToBudget(fullContent, model)}`
    : ''

  const moreVideosLine = threadHasVideos(thread)
    ? '\n- more_videos: the user asks for more/other/different videos on this topic. The system runs the search — do not invent video titles or links yourself.'
    : ''

  return `You are F2 — a learning companion. The user has an ACTIVE learning thread on: ${subject}.${sourceBlock}

For every message, pick exactly one tool:
- continue_chat: the user is advancing the current topic — follow-up questions, quiz answers, "tell me more", clarifications.
- start_new_topic: the user wants to learn about a different topic. Don't be too eager — only switch when the new topic is clearly unrelated.
- chitchat: off-topic banter, jokes, weather, AI-chatbot trivia unrelated to the active topic. Won't be persisted.${moreVideosLine}

${baseRules}`
}

function historyOf(thread: F2Thread): { role: 'user' | 'assistant'; content: string }[] {
  return thread.messages.map((m) => ({ role: m.role, content: m.text }))
}

/// Reflection quiz, step 1: ask a single thoughtful question.
///
/// One-shot by design. The reflection quiz is for one-off articles / stories
/// where the goal is a moment of personal takeaway, not factual recall —
/// one question is enough to "do the work."
export async function askReflectionQuestion(
  thread: F2Thread,
  userText: string,
  model?: string | null,
): Promise<string> {
  const subject = thread.topic ?? thread.url ?? '(this topic)'
  const fullContent = buildFullContent(thread)
  const sourceBlock = fullContent
    ? `\n\nSource content (the material the user is reflecting on):\n${fitToBudget(fullContent, model)}`
    : ''

  const system = `You are F2 — a learning companion. The user just asked for a Reflection Quiz on: ${subject}.

Ask exactly ONE thoughtful, open-ended question inviting personal reflection on this material — what they take away, how it lands for them, what it shifts. Don't test recall. Don't lead. No preamble ("Great question", "Let's reflect"). No markdown. Plain text, one question, that's it.${sourceBlock}`

  const result = await llmComplete({
    model,
    system,
    messages: [...historyOf(thread), { role: 'user', content: userText }],
    maxTokens: 400,
  })
  return result.type === 'text' ? result.text : ''
}

/// Reflection quiz, step 2: brief acknowledgement of the user's answer.
///
/// One short sentence, no grading, no summary, no follow-up question. The
/// agent layer appends the star-earned line and updates the thread state.
export async function acknowledgeReflectionAnswer(
  thread: F2Thread,
  userText: string,
  model?: string | null,
): Promise<string> {
  const subject = thread.topic ?? thread.url ?? '(this topic)'

  const system = `You are F2 — a learning companion. The user just answered the single reflection question you asked them about: ${subject}.

React in ONE short sentence — something warm and human ("Mm, that lands." / "Yeah, I get that." / a brief sincere reaction to what they said). Do NOT grade. Do NOT summarize. Do NOT ask another question. Plain text. One sentence.`

  const result = await llmComplete({
    model,
    system,
    messages: [...historyOf(thread), { role: 'user', content: userText }],
    maxTokens: 120,
  })
  return result.type === 'text' ? result.text : ''
}

export async function routeAndReply(
  thread: F2Thread | null,
  userText: string,
  model?: string | null,
): Promise<RouterAction> {
  const tools = threadHasVideos(thread) ? [...TOOLS, MORE_VIDEOS_TOOL] : TOOLS
  const result = await llmComplete({
    model,
    system: buildSystem(thread, model),
    messages: [
      ...(thread ? historyOf(thread) : []),
      { role: 'user', content: userText },
    ],
    maxTokens: 1000,
    tools,
    forceTool: true,
  })

  if (result.type === 'text') {
    // Defensive: model returned plain text instead of a tool call.
    return { kind: 'chitchat', reply: result.text || '(no response)' }
  }

  const input = result.input
  switch (result.name) {
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
    case 'more_videos': {
      const refinement = String(input.refinement ?? '').trim()
      return { kind: 'more_videos', refinement: refinement || null }
    }
    default:
      return {
        kind: 'chitchat',
        reply: `(unknown tool: ${result.name})`,
      }
  }
}

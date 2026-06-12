import Anthropic from '@anthropic-ai/sdk'
import { buildFullContent, type F2Thread } from '@/lib/f2/threads'

// Distillation is the bridge from "understood it" to "will remember it":
// turn a source + the user's conversation about it into a handful of atomic
// idea cards the scheduler can drill. Sonnet, because extraction quality is
// the whole product here — bad cards make every future review worthless.
const MODEL = 'claude-sonnet-4-6'

// Keep the prompt bounded for very long transcripts/books. ~60K chars of
// source is plenty to find the core ideas.
const MAX_SOURCE_CHARS = 60_000
const MAX_CONVO_MESSAGES = 30

const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'A self-contained recall question, answerable without the source open.',
          },
          answer: {
            type: 'string',
            description: 'The canonical answer, 1-3 sentences.',
          },
        },
        required: ['prompt', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
}

let _client: Anthropic | null = null
function anthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey })
  return _client
}

export type DistilledCard = { prompt: string; answer: string }

// Extract 4-8 idea cards from a topic. `existingPrompts` lets a re-distill
// (after more reading or conversation) add only what's new.
export async function distillCards(
  thread: F2Thread,
  existingPrompts: string[] = [],
): Promise<DistilledCard[]> {
  const source = buildFullContent(thread).slice(0, MAX_SOURCE_CHARS)
  const convo = (thread.messages ?? [])
    .slice(-MAX_CONVO_MESSAGES)
    .map((m) => `${m.role === 'user' ? 'USER' : 'TUTOR'}: ${m.text.trim()}`)
    .join('\n\n')
  const subject = thread.topic ?? thread.url ?? '(untitled)'

  const system = `You distill learning material into atomic "idea cards" for spaced-repetition review. Each card is one idea worth remembering a year from now.

Rules for good cards:
- The prompt must be SELF-CONTAINED: answerable by someone who studied the material but doesn't have it open. Name the subject in the prompt ("In Karpathy's talk on...", "According to the article on X..."), never say "the article" or "this video" bare.
- One idea per card. Never two questions in one prompt.
- Prefer understanding over trivia: ask why something works, what follows from it, how two things differ — not dates, names, or numbers unless the number IS the idea.
- The answer is the canonical 1-3 sentence answer a grader will compare against. Make it concrete and complete.
- 4 to 8 cards. Fewer good cards beat more weak ones. If the material is thin, return fewer.
- If the user asked questions in the conversation, the ideas they engaged with matter most — prioritize those.
${existingPrompts.length > 0 ? '- Cards already exist for this topic (listed in the message). Do NOT duplicate them or rephrase them; only add genuinely new ideas. Return an empty array if nothing new is worth adding.' : ''}`

  const user = `Topic: ${subject}

${source ? `Source material:\n${source}` : '(No source text — work from the conversation alone.)'}

${convo ? `Conversation the user had while studying this:\n${convo}` : ''}

${existingPrompts.length > 0 ? `Existing card prompts (do not duplicate):\n${existingPrompts.map((p) => `- ${p}`).join('\n')}` : ''}

Extract the idea cards.`

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    output_config: { format: { type: 'json_schema', schema: CARDS_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  const raw = block?.type === 'text' ? block.text.trim() : ''
  const parsed = raw ? (JSON.parse(raw) as { cards?: DistilledCard[] }) : null
  const cards = (parsed?.cards ?? []).filter(
    (c) => c.prompt?.trim() && c.answer?.trim(),
  )
  return cards.slice(0, 8)
}

import Anthropic from '@anthropic-ai/sdk'
import { f2Supabase } from '@/lib/f2/supabase'
import { buildFullContent, type F2Thread } from '@/lib/f2/threads'

// Primer questions are the attention half of the system: three things to hold
// in mind WHILE reading/watching/listening, generated the moment a source
// lands — before the user consumes it. Reading with a question in mind is
// active reading; that's the entire feature.
const MODEL = 'claude-haiku-4-5'
const MAX_SOURCE_CHARS = 30_000

const PRIMER_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 3 short questions to hold in mind while consuming the material.',
    },
  },
  required: ['questions'],
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

export async function generatePrimer(thread: F2Thread): Promise<string[]> {
  const source = buildFullContent(thread).slice(0, MAX_SOURCE_CHARS)
  if (!source.trim()) return []
  const subject = thread.topic ?? thread.url ?? '(untitled)'

  const system = `You write 3 "read for this" questions someone holds in mind WHILE consuming a piece of material (article, talk, podcast). The goal is attention: a reader with a question in mind reads actively.

Rules:
- Exactly 3 questions, each under 15 words.
- Point at the material's central tensions and claims — the things worth noticing as they go by.
- No quiz trivia, no yes/no questions, no spoiling the answer in the question.`

  const user = `Material: ${subject}

${source}

Write the 3 questions.`

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 300,
    system,
    output_config: { format: { type: 'json_schema', schema: PRIMER_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  const raw = block?.type === 'text' ? block.text.trim() : ''
  const parsed = raw ? (JSON.parse(raw) as { questions?: string[] }) : null
  return (parsed?.questions ?? []).filter((q) => q.trim()).slice(0, 3)
}

export async function savePrimer(
  userId: string,
  threadId: string,
  questions: string[],
): Promise<void> {
  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({ primer: questions })
    .eq('id', threadId)
    .eq('user_id', userId)
  if (error) console.error('[f3] savePrimer failed:', error)
}

import Anthropic from '@anthropic-ai/sdk'

// Grades one free-text recall attempt against the card's canonical answer.
// Haiku — it's a tight comparison task, called once per card per review.
const MODEL = 'claude-haiku-4-5'

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    grade: {
      type: 'integer',
      enum: [0, 1, 2],
      description: '0 = forgot, 1 = shaky (gist only), 2 = solid.',
    },
    feedback: {
      type: 'string',
      description:
        'One short, direct sentence: confirm what they got, or supply what they missed.',
    },
  },
  required: ['grade', 'feedback'],
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

export type RecallGrade = {
  grade: 0 | 1 | 2
  feedback: string
}

// Throws on API failure — the route falls back to letting the user self-grade
// rather than inventing a score. (The generous-fallback pattern from quiz
// grading is wrong here: a fabricated "solid" would corrupt the schedule.)
export async function gradeRecall(input: {
  prompt: string
  canonicalAnswer: string
  userAnswer: string
}): Promise<RecallGrade> {
  const system = `You grade a single spaced-repetition recall attempt. The user was shown a question and typed an answer from memory.

Compare their answer to the canonical answer ON SUBSTANCE:
- 2 (solid): they expressed the core idea in their own words. Different phrasing, examples, or extra detail are all fine. Minor imprecision is fine.
- 1 (shaky): they have the gist or a fragment, but missed real substance or mixed in something wrong.
- 0 (forgot): blank, "I don't know", wrong idea, or unrelated.

Be honest, not generous — a wrong "solid" pushes this idea months out and the user actually forgets it. But never punish phrasing: this is recall, not an essay.

Feedback: one direct sentence. If solid, confirm sharply ("Right — and the key is X."). If not, give the piece they missed. No filler, no "great job".`

  const user = `Question: ${input.prompt}

Canonical answer: ${input.canonicalAnswer}

The user's answer (typed from memory): ${input.userAnswer || '(blank)'}`

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 200,
    system,
    output_config: { format: { type: 'json_schema', schema: GRADE_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  const raw = block?.type === 'text' ? block.text.trim() : ''
  const parsed = JSON.parse(raw) as { grade: number; feedback: string }
  const grade = ([0, 1, 2].includes(parsed.grade) ? parsed.grade : 1) as 0 | 1 | 2
  return { grade, feedback: String(parsed.feedback ?? '').slice(0, 300) }
}

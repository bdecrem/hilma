import Anthropic from '@anthropic-ai/sdk'
import { buildFullContent, type F2Thread } from './threads'

const MODEL = 'claude-haiku-4-5'
// Haiku 4.5 has a 200K-token context window — comfortably fits articles,
// transcripts, and most books, so the grader can evaluate against the real
// ground truth. (No 1M beta header: it's a no-op on a 200K model.) The rare
// oversized source surfaces via the catch below, which credits the user.
const MAX_TRANSCRIPT_MESSAGES = 24

// Structured-output schema: the API constrains the response to valid JSON of
// this exact shape, so no hand-rolled extraction is needed. `accepted` is an
// enum (numeric constraints like minimum/maximum aren't supported by the
// structured-output schema subset, so the 0–4 bound is expressed as an enum).
const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    accepted: {
      type: 'integer',
      enum: [0, 1, 2, 3, 4],
      description: 'How many of the 4 substantive answers (questions 2–5) were acceptable.',
    },
    notes: {
      type: 'string',
      description: "One short sentence on the user's overall performance.",
    },
  },
  required: ['accepted', 'notes'],
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

export type QuizTwoGrade = {
  accepted: number     // 0..4 substantive questions answered acceptably
  total: number        // always 4 — the reflection question isn't graded
  passed: boolean      // accepted >= 3
  notes?: string       // short reasoning, surfaced to client for transparency
}

/// Grades Quiz 2 by reading the recent thread transcript + source content
/// and asking Haiku to count how many of the 4 substantive answers cleared
/// a C-grade bar (51% understanding — main idea right, details may be off).
/// The first quiz question is the reflection prompt and is NOT graded.
///
/// Falls back to "passed" when the grader can't return a clean number —
/// better to err generously than to gate the user on a flaky LLM read.
export async function gradeQuizTwo(thread: F2Thread): Promise<QuizTwoGrade> {
  const transcript = recentTranscript(thread)
  const source = buildFullContent(thread)
  const subject = thread.topic ?? thread.url ?? '(no subject)'

  const system = `You are grading a 5-question quiz a user just took on a topic.
Question 1 is always a reflection ("What is the main thing you learned from this?") — DO NOT grade it. Skip it.
Questions 2–5 are substantive recall/understanding questions.

For each of the 4 substantive questions, decide if the user's answer is at least C-grade — they got the main idea right, even if details are imprecise. If they were silent, confused, or said something clearly wrong, that's a fail.

Pass threshold: at least 3 of 4 substantive answers acceptable.

Return how many of the 4 substantive answers were acceptable, plus one short sentence on the user's overall performance.`

  const user = `Topic: ${subject}

Source content (the ground truth — answers should align with this when applicable):
${source || '(no source content for this topic — judge based on the transcript itself)'}

Quiz transcript (most recent messages, oldest first):
${transcript}

Count how many of the 4 substantive answers (questions 2–5) were acceptable.`

  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 200,
      system,
      output_config: { format: { type: 'json_schema', schema: GRADE_SCHEMA } },
      messages: [{ role: 'user', content: user }],
    })
    const block = res.content.find(b => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    // Output is schema-constrained, so a plain parse is safe; a refusal or
    // truncation throws and is caught below (generous fallback).
    const parsed = raw ? (JSON.parse(raw) as { accepted?: unknown; notes?: unknown }) : null
    const accepted = clampInt(parsed?.accepted, 0, 4)
    const notes = typeof parsed?.notes === 'string' ? parsed.notes.slice(0, 240) : undefined
    return {
      accepted,
      total: 4,
      passed: accepted >= 3,
      notes,
    }
  } catch (e) {
    console.error('[f2] gradeQuizTwo failed — falling back to pass:', e)
    return { accepted: 3, total: 4, passed: true, notes: 'Grader unavailable — credit awarded.' }
  }
}

function recentTranscript(thread: F2Thread): string {
  const msgs = thread.messages.slice(-MAX_TRANSCRIPT_MESSAGES)
  return msgs
    .map(m => `${m.role === 'user' ? 'USER' : 'F2'}: ${m.text.trim()}`)
    .join('\n\n')
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

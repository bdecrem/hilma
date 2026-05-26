import Anthropic from '@anthropic-ai/sdk'
import type { F2Thread } from './threads'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_SOURCE_CHARS = 4000
const MAX_TRANSCRIPT_MESSAGES = 24

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
  const source = (thread.content ?? '').slice(0, MAX_SOURCE_CHARS)
  const subject = thread.topic ?? thread.url ?? '(no subject)'

  const system = `You are grading a 5-question quiz a user just took on a topic.
Question 1 is always a reflection ("What is the main thing you learned from this?") — DO NOT grade it. Skip it.
Questions 2–5 are substantive recall/understanding questions.

For each of the 4 substantive questions, decide if the user's answer is at least C-grade — they got the main idea right, even if details are imprecise. If they were silent, confused, or said something clearly wrong, that's a fail.

Pass threshold: at least 3 of 4 substantive answers acceptable.

Reply with ONLY valid JSON in this shape:
{"accepted": 0, "notes": "one short sentence on the user's overall performance"}

No prose, no backticks, no preamble. Just the JSON.`

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
      messages: [{ role: 'user', content: user }],
    })
    const block = res.content.find(b => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    const parsed = extractJson(raw)
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

function extractJson(raw: string): { accepted?: unknown; notes?: unknown } | null {
  if (!raw) return null
  // Trim accidental code fences.
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Find the outermost JSON object — defensive against any preamble.
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

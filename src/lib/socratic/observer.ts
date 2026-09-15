// The observer: an independent read of each student message.
//
// Runs in every arm. It classifies the student's reply against the method's
// answer taxonomy, scores the reasoning 0–3, flags doctrinal errors and
// names the move the method calls for next. Its verdicts are the study's
// per-turn measurement; in arm C they are also handed to the tutor as the
// coach note. A cheaper model than the tutor, low effort, structured output.

import Anthropic from '@anthropic-ai/sdk'
import { getClient } from './anthropic'
import { runClaudeCode, useClaudeCode } from './claude-code'
import type { Module, Move, Verdict } from './types'
import { ANSWER_TYPES, MOVES } from './types'

const DEFAULT_MODEL = 'claude-sonnet-5'

export function observerModel(): string {
  return process.env.SOC_OBSERVER_MODEL || DEFAULT_MODEL
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    answer_type: { type: 'string', enum: ANSWER_TYPES.filter((t) => t !== 'none') },
    quality: { type: 'integer', enum: [0, 1, 2, 3] },
    doctrinal_error: { type: 'boolean' },
    recommended_move: { type: 'string', enum: MOVES },
    rationale: { type: 'string' },
  },
  required: ['answer_type', 'quality', 'doctrinal_error', 'recommended_move', 'rationale'],
  additionalProperties: false,
} as const

function observerPrompt(m: Module): string {
  return `You are the observer in a study of Socratic tutoring for first-year law students. You read one exchange — the tutor's last message and the student's reply — and classify the student's reply. You never speak to anyone; your verdict is logged, and in one study condition it is shown to the tutor as a coaching note. Be exact and be brief.

# The material (so you can judge doctrine)

${m.doctrine}

## The hypothetical the session argues through

${m.hypothetical}

# The method (so you can judge which move comes next)

${m.method}

# Your verdict

- \`answer_type\`, one of:
  - \`ready\` — agrees to start the questions; \`not_ready\` — wants more explanation first
  - \`question\` — asks the tutor something
  - \`bare_conclusion\` — a position with nothing behind it ("yes, she's liable")
  - \`hedge\` — "it depends" with no commitment
  - \`list_of_facts\` — true, relevant facts with no reasoning connecting them to the conclusion (the classic first-year mistake)
  - \`argument\` — facts connected to a conclusion by reasoning (policy, analogy to precedent, consequences)
  - \`counter_argument\` — argues the opposite side of a position already taken
  - \`line_drawing\` — proposes or defends a limiting principle, or presses the snowball worry
  - \`sympathetic_group\` — names a group harmed if the rule is over-extended
  - \`element_conflation\` — argues causation or breach when the question is duty (e.g. "but for the entrustment this wouldn't have happened")
  - \`doctrinal_error\` — misstates the rule, the holding, or the structure of the claim
  - \`stuck\` — "I don't know", can't take the next step
  - \`other\` — anything else (small talk, off topic)
- \`quality\` of the student's reasoning: 0 = none / off topic; 1 = facts or a conclusion, unconnected; 2 = a real argument with a gap; 3 = complete and well connected, or a correct doctrinal statement. Readiness replies and questions are usually 0 — that is not a criticism.
- \`doctrinal_error\` — true if the student got the law wrong anywhere in the message, whatever the answer type.
- \`recommended_move\` — the move the method calls for next, one of: ${MOVES.join(', ')}. Use \`facts_not_argument\` for a list of facts, \`commit\` for a hedge or bare conclusion, \`scaffold\` only when the student is stuck after a genuine attempt, \`flip\` after a good one-sided argument, \`line_drawing\` / \`sympathetic_group\` when they argue for extension, \`boundary\` for conflation, \`teach\` for a doctrinal error, \`probe\` when the answer is fine and the session should simply continue, \`readiness_check\` / \`overview\` around the opening, \`mastery_summary\` when all four mastery criteria look met.
- \`rationale\` — one sentence, at most 30 words, that a researcher skimming the log can use.`
}

export async function observe(m: Module, tutorMessage: string, studentMessage: string): Promise<{ verdict: Verdict; usage: Anthropic.Usage; model: string; latencyMs: number }> {
  const model = observerModel()
  const user = `<tutor>\n${tutorMessage}\n</tutor>\n\n<student>\n${studentMessage}\n</student>`
  if (useClaudeCode()) {
    const r = await runClaudeCode({ model, effort: 'low', system: observerPrompt(m), schema: VERDICT_SCHEMA, prompt: user })
    return { verdict: r.output as Verdict, usage: { ...r.usage, cost_usd: r.costUsd } as unknown as Anthropic.Usage, model, latencyMs: r.latencyMs }
  }
  const t0 = Date.now()
  const res = await getClient().messages.create({
    model,
    max_tokens: 1024,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    system: [{ type: 'text', text: observerPrompt(m), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  })
  if (res.stop_reason === 'refusal') throw new Error('observer refused')
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) throw new Error('observer returned no text')
  const verdict = JSON.parse(text) as Verdict
  return { verdict, usage: res.usage, model, latencyMs: Date.now() - t0 }
}

/** The coach note appended to the student's message in arm C. */
export function coachNote(v: Verdict): string {
  const move: Move = v.recommended_move
  return `<coach>\nStudent's message reads as: ${v.answer_type} (quality ${v.quality}/3)${v.doctrinal_error ? ', with a doctrinal error' : ''}.\n${v.rationale}\nRecommended next move: ${move}.\n</coach>`
}

// The tutor: one streamed Messages call per turn.
//
// History is rebuilt from the stored turns each time: student turns become
// user messages (with the coach note as a second text block in arm C),
// tutor turns become the JSON the model produced, reassembled from the
// stored reply and self-report so the format the model sees in its own
// past turns matches what it is asked to produce now.

import Anthropic from '@anthropic-ai/sdk'
import { getClient } from './anthropic'
import { runClaudeCode, useClaudeCode } from './claude-code'
import { partialReply } from './partial'
import { OPENING_MESSAGE, TUTOR_OUTPUT_SCHEMA, systemBlocks, systemPrompt } from './prompts'
import type { Arm, Module, Turn, TutorMeta } from './types'
import { ANSWER_TYPES, MASTERY_KEYS, MOVES, PHASES } from './types'

const DEFAULT_MODEL = 'claude-opus-5'
type Effort = NonNullable<Anthropic.OutputConfig['effort']>
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function tutorModel(): string {
  return process.env.SOC_TUTOR_MODEL || DEFAULT_MODEL
}

function tutorEffort(): Effort {
  const e = process.env.SOC_TUTOR_EFFORT
  if (!e) return 'medium'
  if (!EFFORTS.includes(e as Effort)) throw new Error(`SOC_TUTOR_EFFORT must be one of ${EFFORTS.join(', ')}`)
  return e as Effort
}

/** Rebuild the API conversation from stored turns. */
export function historyFromTurns(turns: Turn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = []
  for (const t of turns) {
    if (t.role === 'student') {
      const text = t.hidden ? OPENING_MESSAGE : t.content
      out.push({
        role: 'user',
        content: t.coach ? [{ type: 'text', text }, { type: 'text', text: t.coach }] : text,
      })
    } else {
      const meta = t.meta as TutorMeta | null
      out.push({ role: 'assistant', content: JSON.stringify({ reply: t.content, ...(meta ?? {}) }) })
    }
  }
  return out
}

function isMeta(x: unknown): x is TutorMeta & { reply: string } {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.reply !== 'string') return false
  if (!PHASES.includes(o.phase as never)) return false
  if (!MOVES.includes(o.move as never)) return false
  if (!ANSWER_TYPES.includes(o.student_answer as never)) return false
  const m = o.mastery as Record<string, unknown> | null
  if (!m || typeof m !== 'object') return false
  return MASTERY_KEYS.every((k) => typeof m[k] === 'boolean')
}

export type TutorResult = {
  reply: string
  meta: TutorMeta
  usage: Anthropic.Usage
  model: string
  latencyMs: number
}

/**
 * Stream one tutor turn. `onDelta` receives the reply text as it arrives
 * (already decoded from the JSON the model is writing). Resolves with the
 * parsed reply and self-report once the message is complete.
 */
export async function runTutor(arm: Arm, m: Module, turns: Turn[], onDelta: (text: string) => void): Promise<TutorResult> {
  if (useClaudeCode()) return runTutorLocal(arm, m, turns, onDelta)
  const model = tutorModel()
  const t0 = Date.now()
  const stream = getClient().messages.stream({
    model,
    max_tokens: 16000,
    output_config: { effort: tutorEffort(), format: { type: 'json_schema', schema: TUTOR_OUTPUT_SCHEMA } },
    system: systemBlocks(arm, m),
    messages: historyFromTurns(turns),
  })

  let buffer = ''
  let sent = 0
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      buffer += event.delta.text
      const reply = partialReply(buffer)
      if (reply.length > sent) {
        onDelta(reply.slice(sent))
        sent = reply.length
      }
    }
  }
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new Error('tutor refused')
  if (final.stop_reason === 'max_tokens') throw new Error('tutor hit max_tokens')
  const text = final.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) throw new Error('tutor returned no text')
  const parsed: unknown = JSON.parse(text)
  if (!isMeta(parsed)) throw new Error('tutor output did not match the schema')
  const { reply, ...meta } = parsed
  // Anything the partial decoder missed (it stops at a cut-off escape).
  if (reply.length > sent) onDelta(reply.slice(sent))
  return { reply, meta, usage: final.usage, model, latencyMs: Date.now() - t0 }
}

/**
 * The same turn through the Claude Code CLI (SOC_BACKEND=claude-code): the
 * conversation lives in a Claude Code session named by the socratic session
 * id, so only this turn's student message is sent; the coach note rides in
 * the same message, as it does in the API path.
 */
async function runTutorLocal(arm: Arm, m: Module, turns: Turn[], onDelta: (text: string) => void): Promise<TutorResult> {
  const model = tutorModel()
  const last = turns[turns.length - 1]
  if (!last || last.role !== 'student') throw new Error('runTutor: last turn must be the student')
  const text = last.hidden ? OPENING_MESSAGE : last.content
  const prompt = last.coach ? `${text}\n\n${last.coach}` : text
  let sent = 0
  const r = await runClaudeCode({
    model,
    effort: tutorEffort(),
    system: systemPrompt(arm, m),
    schema: TUTOR_OUTPUT_SCHEMA,
    prompt,
    session: { id: last.session_id },
    onPartialJson: (json) => {
      const reply = partialReply(json)
      if (reply.length > sent) {
        onDelta(reply.slice(sent))
        sent = reply.length
      }
    },
  })
  if (!isMeta(r.output)) throw new Error('tutor output did not match the schema')
  const { reply, ...meta } = r.output
  if (reply.length > sent) onDelta(reply.slice(sent))
  return { reply, meta, usage: { ...r.usage, cost_usd: r.costUsd } as unknown as Anthropic.Usage, model, latencyMs: r.latencyMs }
}

// System prompts for the three arms, and the tutor's output schema.
//
// Everything the tutor knows comes from the module (src/lib/socratic/modules):
// arm A gets the doctrine and the hypothetical with a "just explain" brief;
// arms B and C get the whole study script (doctrine, method, protocol,
// question bank, tone) plus the class transcript for voice. Arm C adds the
// coach channel. The prompts are stable per (arm, module) so the API caches
// them; anything per-turn goes in the messages.

import type Anthropic from '@anthropic-ai/sdk'
import type { Arm, Module } from './types'
import { ANSWER_TYPES, MASTERY_KEYS, MOVES, PHASES } from './types'

/** Opening user message (hidden from the student) that asks the tutor to begin. */
export const OPENING_MESSAGE = '(The student has opened the session. Begin.)'

/** JSON schema for the tutor's structured output. `reply` first so it streams. */
export const TUTOR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'What the student sees, in Markdown.' },
    phase: { type: 'string', enum: PHASES },
    move: { type: 'string', enum: MOVES },
    student_answer: { type: 'string', enum: ANSWER_TYPES },
    mastery: {
      type: 'object',
      properties: Object.fromEntries(MASTERY_KEYS.map((k) => [k, { type: 'boolean' }])),
      required: MASTERY_KEYS,
      additionalProperties: false,
    },
  },
  required: ['reply', 'phase', 'move', 'student_answer', 'mastery'],
  additionalProperties: false,
} as const

function outputFormat(m: Module): string {
  return `## Output format

Every reply is one JSON object; the API enforces the schema. Fields:

- \`reply\` — what the student sees, in Markdown. Write it the way you would speak in a one-on-one session: short paragraphs, a question on its own line, headings only in the overview. Never mention this format, the JSON, or the other fields.
- \`phase\` — where the session is after this reply: \`overview\` (you just gave the overview), \`readiness\` (you asked whether they're ready and are waiting), \`questioning\` (working through the material), \`mastery\` (the mastery check / wrap-up), \`done\` (the session has been wrapped up).
- \`move\` — the primary thing this reply does: ${MOVES.map((m) => `\`${m}\``).join(', ')}.
- \`student_answer\` — how you read the student's most recent message (\`none\` on the opening turn): ${ANSWER_TYPES.map((m) => `\`${m}\``).join(', ')}.
- \`mastery\` — the four mastery flags as you currently judge them from what the student has actually said (not what you told them): ${MASTERY_KEYS.map((k) => `\`${k}\` (${m.masteryCriteria[k]})`).join(', ')}. Once a flag is true it stays true.`
}

function moduleHeader(m: Module) {
  return `# ${m.title}\n### ${m.subtitle}\n${m.source}.`
}

/** Arm A: a knowledgeable, friendly tutor that explains and answers. The control. */
function assistantPrompt(m: Module): string {
  return `You are a knowledgeable, friendly tutor helping a student study one topic, one-on-one, in a chat. The topic is below. Teach it the way a good study assistant does: explain clearly, answer questions directly and completely, give examples, and when the student asks what the right answer or the best argument is, give it. You may occasionally check that they've followed you, but your job is to explain, not to cross-examine — don't withhold answers or turn the student's questions back on them.

Open the session with a clear, organized overview of the material (a few paragraphs, not an essay), state the hypothetical as an interesting question worth thinking about, and invite the student to ask whatever they'd like or to try the hypothetical with you. From then on, follow the student's lead. Report \`phase\` as \`overview\` for the opening reply and \`questioning\` afterwards (\`done\` if the student says they're finished). Your \`move\` is normally \`answer\`; use \`teach\` when you correct a doctrinal mistake and \`recap\` when you summarize where things stand.

${moduleHeader(m)}

## The material

${m.doctrine}

## The hypothetical

${m.hypothetical}

${outputFormat(m)}`
}

/** Arms B and C: the study script, Zeiler's method, the transcript for voice. */
function socraticPrompt(m: Module, coached: boolean): string {
  const coach = coached
    ? `
## The coach

A second agent, the coach, reads each student message before you do and appends a <coach> block to it: its read of the message (the same answer types you use), a quality score, and the move the method calls for next. The student cannot see this and does not know it exists. Treat the coach's recommended move as the default for your reply; depart from it only when the conversation makes it clearly wrong (say, the coach recommends \`flip\` but the student has just asked a direct question that deserves an answer first). Never mention the coach, its notes, or that anything is being appended to the student's messages.
`
    : ''

  return `${m.framing}

Do not paraphrase this into a generic "let's learn about torts" session — the value here is the specificity of her method.

${moduleHeader(m)}

### 1. What you need to know cold before you teach it

${m.doctrine}

### 2. The hypothetical that drives the session — ${m.hypotheticalTitle}

${m.hypothetical}

### 3. Zeiler's method — what you must reproduce

${m.method}

### 4. Session protocol — run it in this order

${m.protocol}

### 5. Question bank (internal reference — do not dump this on the student verbatim; use it to structure your own questions)

${m.questionBank}

### 6. Tone

${m.tone}
${coach}
${outputFormat(m)}${transcriptAppendix(m)}`
}

function transcriptAppendix(m: Module): string {
  if (!m.transcript.trim()) return ''
  return `

## Appendix — the class transcript this session is modelled on

This is the verbatim classroom dialogue. Use it for her voice, her pacing, and her exact phrasings when the same moment comes up with your student ("a list of facts is never an argument", "you're stuck, right? so what do we need? strategies"). Don't quote it at length, and don't tell the student what other students said unless it helps them (the sympathetic groups the class came up with are fair game as prompts once the student has tried).

${m.transcript}`
}

export function systemPrompt(arm: Arm, m: Module): string {
  if (arm === 'A') return assistantPrompt(m)
  return socraticPrompt(m, arm === 'C')
}

/** The system block, cached: one prompt per (arm, module), identical every turn. */
export function systemBlocks(arm: Arm, m: Module): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text: systemPrompt(arm, m), cache_control: { type: 'ephemeral' } }]
}

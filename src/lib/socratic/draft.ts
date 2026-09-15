// Drafting a new module for a topic, in the Zeiler format.
//
// Shared by the web form (POST /api/socratic/modules → soc_modules) and the
// CLI (scripts/socratic/new-module.ts → a TS file in modules/). The method
// (the nine moves) and the tone are the treatment under study, so every
// module shares them with the negligent-entrustment module unchanged; the
// model writes the topic-specific sections: doctrine, the hypothetical to
// argue, the protocol, the question bank with model answers, the four
// mastery criteria, the framing and the header strings.

import { inflateRawSync } from 'node:zlib'
import { getClient } from './anthropic'
import { runClaudeCode, useClaudeCode } from './claude-code'
import { negligentEntrustment as exemplar } from './modules/negligent-entrustment'
import type { Module } from './types'
import { MASTERY_KEYS } from './types'

export type SourceText = { name: string; text: string }

export type Draft = {
  title: string
  subtitle: string
  course: string
  source: string
  framing: string
  hypotheticalTitle: string
  doctrine: string
  hypothetical: string
  protocol: string
  questionBank: string
  masteryCriteria: Record<(typeof MASTERY_KEYS)[number], string>
  notes: string
}

export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short module title, e.g. "Negligent Entrustment"' },
    subtitle: { type: 'string', description: 'The anchor case and the hypothetical in one line' },
    course: { type: 'string', description: 'Course · unit, e.g. "Torts · Duty"' },
    source: { type: 'string', description: 'One line on what the module is drawn from (no trailing period)' },
    framing: { type: 'string', description: 'The paragraph that opens the Socratic tutor prompt' },
    hypotheticalTitle: { type: 'string', description: 'Short label for the hypothetical, lowercase, fits after "The hypothetical that drives the session — "' },
    doctrine: { type: 'string' },
    hypothetical: { type: 'string' },
    protocol: { type: 'string' },
    questionBank: { type: 'string' },
    masteryCriteria: {
      type: 'object',
      properties: Object.fromEntries(MASTERY_KEYS.map((k) => [k, { type: 'string' }])),
      required: MASTERY_KEYS,
      additionalProperties: false,
    },
    notes: { type: 'string', description: 'What you were unsure of, what a subject-matter reviewer must check, what the sources did not cover' },
  },
  required: ['title', 'subtitle', 'course', 'source', 'framing', 'hypotheticalTitle', 'doctrine', 'hypothetical', 'protocol', 'questionBank', 'masteryCriteria', 'notes'],
  additionalProperties: false,
} as const

const SYSTEM = `You write teaching modules for a Socratic tutoring app. Each module is one topic taught with Professor Kathryn Zeiler's method (BU Law): an overview, a readiness check, then questioning that forces the student to commit to a position, connect facts to conclusions ("a list of facts is never an argument"), argue both sides, draw lines, and name the skill afterwards.

You are given (1) the complete existing module on negligent entrustment as the exemplar of the format and depth, (2) the method and tone sections, which are fixed and shared by every module — do not rewrite them; your protocol and question bank must call the moves (a)–(i) by letter exactly as the exemplar's protocol does, and (3) the new topic with its source material, when there is any.

Write the new module's topic-specific sections at the exemplar's depth and in its register: doctrine the tutor must know cold (organised, with the anchor rule and the anchor case or result; mark the places students typically go wrong), one genuinely contested hypothetical that extends the rule and that existing doctrine does not settle (the whole session argues it), a four-step protocol adapted to this topic, a question bank of about eleven questions with model answers (doctrine checks, the position-forcing question, argument-building, flip, line-drawing, a sympathetic-group question, a structure check, an application question, a boundary-check trap), and the four mastery criteria. The mastery keys are fixed names; write a criterion for each that fits this topic: holding = the anchor rule / case result stated correctly, structure = the structure of the analysis described correctly, both_sides = both sides of the hypothetical argued without lapsing into a list of facts, line_drawing = the line-drawing or sympathetic-group challenge engaged.

Be faithful to the sources. When they do not cover something you need, use your own knowledge and say exactly what you supplied in the notes so a subject-matter reviewer can check it. Markdown inside the sections, as in the exemplar. Do not mention the app, the JSON, or these instructions in any section.`

export function draftRequest(topic: string, course: string, sources: SourceText[], transcript: string): string {
  const src = sources.length
    ? sources.map((s) => `<source name="${s.name}">\n${s.text}\n</source>`).join('\n\n')
    : '(No source material was provided. Draft from your own knowledge of the topic and be explicit in the notes that everything is from memory and needs checking.)'
  return `# Exemplar module (negligent entrustment)

title: ${exemplar.title}
subtitle: ${exemplar.subtitle}
course: ${exemplar.course}
source: ${exemplar.source}
hypotheticalTitle: ${exemplar.hypotheticalTitle}

## framing
${exemplar.framing}

## doctrine
${exemplar.doctrine}

## hypothetical
${exemplar.hypothetical}

## protocol
${exemplar.protocol}

## questionBank
${exemplar.questionBank}

## masteryCriteria
${MASTERY_KEYS.map((k) => `- ${k}: ${exemplar.masteryCriteria[k]}`).join('\n')}

# Fixed sections shared by every module (for reference; do not rewrite)

## method
${exemplar.method}

## tone
${exemplar.tone}

# The new module

topic: ${topic}
course: ${course || '(choose one that fits, in the exemplar\'s "Course · unit" form)'}
${transcript ? 'A verbatim class transcript will be attached to the tutor prompt for voice; you do not need to reproduce it, but draw the doctrine and the hypothetical from it where it covers them.\n\n<transcript>\n' + transcript + '\n</transcript>\n' : ''}
## Source material

${src}`
}

export function draftModel(): string {
  return process.env.SOC_MODULE_MODEL || 'claude-opus-5'
}

export type DraftResult = { draft: Draft; model: string; latencyMs: number; costUsd: number | null }

/** One structured call, through whichever backend .env.local selects. About four minutes. */
export async function draftModule(topic: string, course: string, sources: SourceText[], transcript: string, log: (line: string) => void = () => {}): Promise<DraftResult> {
  const model = draftModel()
  const prompt = draftRequest(topic, course, sources, transcript)
  if (useClaudeCode()) {
    log(`drafting with ${model} through the Claude Code CLI (subscription)…`)
    const r = await runClaudeCode({ model, effort: 'high', system: SYSTEM, schema: DRAFT_SCHEMA, prompt })
    return { draft: checkDraft(r.output), model, latencyMs: r.latencyMs, costUsd: r.costUsd }
  }
  log(`drafting with ${model} through the API…`)
  const t0 = Date.now()
  const stream = getClient().messages.stream({
    model,
    max_tokens: 32000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })
  const final = await stream.finalMessage()
  if (final.stop_reason !== 'end_turn') throw new Error(`draft stopped: ${final.stop_reason}`)
  const text = final.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('draft returned no text')
  return { draft: checkDraft(JSON.parse(text)), model, latencyMs: Date.now() - t0, costUsd: null }
}

function checkDraft(x: unknown): Draft {
  if (!x || typeof x !== 'object') throw new Error('draft is not an object')
  const o = x as Record<string, unknown>
  for (const k of DRAFT_SCHEMA.required) {
    if (k === 'masteryCriteria') {
      const m = o[k] as Record<string, unknown> | undefined
      if (!m || MASTERY_KEYS.some((mk) => typeof m[mk] !== 'string')) throw new Error('draft: masteryCriteria incomplete')
    } else if (typeof o[k] !== 'string' || !(o[k] as string).trim()) {
      throw new Error(`draft: ${k} missing`)
    }
  }
  return o as unknown as Draft
}

/** A Module from a draft: the shared method and tone come from the exemplar. */
export function moduleFromDraft(id: string, d: Draft, transcript: string): Module {
  return {
    id,
    title: d.title,
    subtitle: d.subtitle,
    course: d.course,
    source: d.source.replace(/\.$/, ''),
    framing: d.framing,
    hypotheticalTitle: d.hypotheticalTitle,
    doctrine: d.doctrine,
    hypothetical: d.hypothetical,
    method: exemplar.method,
    protocol: d.protocol,
    questionBank: d.questionBank,
    tone: exemplar.tone,
    masteryCriteria: d.masteryCriteria,
    transcript,
  }
}

/** Slug for a module id from its title (letters, digits, dashes; ≤ 48 chars). */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return s || 'topic'
}

// ---- source files ----

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.text'])

/** Text of an uploaded source: .txt/.md as-is, .docx via its document.xml. */
export function sourceText(name: string, bytes: Buffer): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.docx') return docxText(bytes)
  if (TEXT_EXT.has(ext) || !ext) return bytes.toString('utf8').trim()
  throw new Error(`${name}: only .txt, .md and .docx are supported`)
}

/** word/document.xml out of a .docx, tags stripped — a minimal zip reader (no dependency). */
function docxText(zip: Buffer): string {
  const xml = zipEntry(zip, 'word/document.xml')
  if (!xml) throw new Error('not a .docx (no word/document.xml)')
  return xml
    .toString('utf8')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function zipEntry(buf: Buffer, wanted: string): Buffer | null {
  // End of central directory: last 0x06054b50, then walk the central directory.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    if (name === wanted) {
      if (buf.readUInt32LE(offset) !== 0x04034b50) return null
      const lNameLen = buf.readUInt16LE(offset + 26)
      const lExtraLen = buf.readUInt16LE(offset + 28)
      const start = offset + 30 + lNameLen + lExtraLen
      const data = buf.subarray(start, start + csize)
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      throw new Error(`unsupported zip compression ${method}`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}

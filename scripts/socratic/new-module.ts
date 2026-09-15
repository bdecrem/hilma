// Draft a new Socratic module for a topic, in the Zeiler format.
//
//   npx tsx scripts/socratic/new-module.ts --id <slug> --topic "<what to teach>" [--course "Torts · Duty"]
//       [--source <file> ...] [--transcript <file>] [--force]
//
// Sources (.txt, .md, .docx) are the material the module must be faithful
// to: a case, lecture notes, a syllabus section. Without any, the model
// drafts from its own knowledge and says so in the notes — check it before
// students see it. A transcript (verbatim class dialogue) is kept as-is in
// a sibling <id>-transcript.ts and given to the tutor for voice.
//
// The method (the nine moves) and the tone are the treatment under study,
// so they are copied from the negligent-entrustment module unchanged. The
// model writes everything topic-specific: doctrine, the hypothetical to
// argue, the protocol, the question bank with model answers, the four
// mastery criteria, the framing and the header strings. Output is
// src/lib/socratic/modules/<id>.ts, registered in modules/index.ts. Review
// it, then it is live on the start page's topic picker.
//
// Runs through whichever backend .env.local selects (SOC_BACKEND=claude-code
// → the local Claude Code CLI on the subscription; otherwise the API).

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { getClient } from '../../src/lib/socratic/anthropic'
import { runClaudeCode, useClaudeCode } from '../../src/lib/socratic/claude-code'
import { negligentEntrustment as exemplar } from '../../src/lib/socratic/modules/negligent-entrustment'
import { MASTERY_KEYS } from '../../src/lib/socratic/types'

// ---- .env.local (tsx does not load it) ----
const envFile = resolve(process.cwd(), '.env.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

// ---- args ----
const argv = process.argv.slice(2)
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
function flags(name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1])
  return out
}
const id = flag('id')
const topic = flag('topic')
const course = flag('course') ?? ''
const sources = flags('source')
const transcriptFile = flag('transcript')
const force = argv.includes('--force')
if (!id || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(id)) throw new Error('--id: lowercase slug, letters, digits and dashes')
if (!topic) throw new Error('--topic is required')

const modulesDir = resolve(process.cwd(), 'src/lib/socratic/modules')
const outFile = resolve(modulesDir, `${id}.ts`)
if (existsSync(outFile) && !force) throw new Error(`${outFile} exists (pass --force to overwrite)`)

// ---- read sources ----
function readDoc(file: string): string {
  const p = resolve(file)
  if (!existsSync(p)) throw new Error(`no such file: ${file}`)
  if (extname(p).toLowerCase() === '.docx') {
    const xml = execFileSync('unzip', ['-p', p, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return xml
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
  return readFileSync(p, 'utf8').trim()
}
const sourceTexts = sources.map((f) => ({ name: basename(f), text: readDoc(f) }))
const transcript = transcriptFile ? readDoc(transcriptFile) : ''

// ---- the ask ----
const SCHEMA = {
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

function userMessage(): string {
  const src = sourceTexts.length
    ? sourceTexts.map((s) => `<source name="${s.name}">\n${s.text}\n</source>`).join('\n\n')
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

type Draft = {
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

async function draft(): Promise<Draft> {
  const model = process.env.SOC_MODULE_MODEL || 'claude-opus-5'
  if (useClaudeCode()) {
    console.log(`drafting with ${model} through the Claude Code CLI (subscription)…`)
    const r = await runClaudeCode({ model, effort: 'high', system: SYSTEM, schema: SCHEMA, prompt: userMessage() })
    console.log(`  ${(r.latencyMs / 1000).toFixed(0)} s, list-price estimate $${r.costUsd.toFixed(2)}`)
    return r.output as Draft
  }
  console.log(`drafting with ${model} through the API…`)
  const t0 = Date.now()
  const stream = getClient().messages.stream({
    model,
    max_tokens: 32000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage() }],
  })
  const final = await stream.finalMessage()
  if (final.stop_reason !== 'end_turn') throw new Error(`stopped: ${final.stop_reason}`)
  const text = final.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('no text in the response')
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s, ${final.usage.output_tokens} output tokens`)
  return JSON.parse(text) as Draft
}

// ---- write the module ----
const tpl = (s: string) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
const str = (s: string) => JSON.stringify(s)
const ident = id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

function moduleSource(d: Draft): string {
  const transcriptImport = transcript ? `import { TRANSCRIPT } from './${id}-transcript'\n` : ''
  return `// Module: ${d.title}. Drafted by ${process.env.SOC_MODULE_MODEL || 'claude-opus-5'} on ${new Date().toISOString().slice(0, 10)}
// with scripts/socratic/new-module.ts from: ${sourceTexts.length ? sourceTexts.map((s) => s.name).join(', ') : 'no source material (model knowledge)'}.
// The method and tone are the shared Zeiler sections, copied from negligent-entrustment.
//
// Reviewer notes from the draft:
${d.notes
  .split('\n')
  .map((l) => `//   ${l}`)
  .join('\n')}

${transcriptImport}import { negligentEntrustment as zeiler } from './negligent-entrustment'
import type { Module } from '../types'

export const ${ident}: Module = {
  id: ${str(id)},
  title: ${str(d.title)},
  subtitle: ${str(d.subtitle)},
  course: ${str(d.course)},
  source: ${str(d.source.replace(/\.$/, ''))},
  framing: ${tpl(d.framing)},
  hypotheticalTitle: ${str(d.hypotheticalTitle)},

  doctrine: ${tpl(d.doctrine)},

  hypothetical: ${tpl(d.hypothetical)},

  method: zeiler.method,

  protocol: ${tpl(d.protocol)},

  questionBank: ${tpl(d.questionBank)},

  tone: zeiler.tone,

  masteryCriteria: {
${MASTERY_KEYS.map((k) => `    ${k}: ${str(d.masteryCriteria[k])},`).join('\n')}
  },

  transcript: ${transcript ? 'TRANSCRIPT' : "''"},
}
`
}

function register() {
  const indexFile = resolve(modulesDir, 'index.ts')
  let s = readFileSync(indexFile, 'utf8')
  const importLine = `import { ${ident} } from './${id}'`
  if (s.includes(importLine)) return
  const lines = s.split('\n')
  let lastImport = -1
  lines.forEach((l, i) => {
    if (/^import \{.*\} from '\.\//.test(l)) lastImport = i
  })
  if (lastImport < 0) throw new Error('modules/index.ts: no module imports found')
  lines.splice(lastImport + 1, 0, importLine)
  s = lines.join('\n')
  s = s.replace(/(export const MODULES: Record<string, Module> = \{\n)([\s\S]*?)(\})/, (_, a: string, body: string, c: string) => `${a}${body}  [${ident}.id]: ${ident},\n${c}`)
  writeFileSync(indexFile, s)
}

async function main() {
const d = await draft()
if (transcript) {
  writeFileSync(resolve(modulesDir, `${id}-transcript.ts`), `// Verbatim class transcript for the ${d.title} module (${basename(transcriptFile!)}).\n\nexport const TRANSCRIPT = ${tpl(transcript)}\n`)
}
writeFileSync(outFile, moduleSource(d))
register()
console.log(`\nwrote ${outFile}\nregistered in modules/index.ts as ${ident}\n\nReviewer notes:\n${d.notes}\n\nNext: read the file, then open /socratic and pick "${d.title}" in the topic picker.`)
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})

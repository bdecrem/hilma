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
// The drafting itself is src/lib/socratic/draft.ts (shared with the web
// form): the method and tone stay Zeiler's, the model writes the
// topic-specific sections. Output is
// src/lib/socratic/modules/<id>.ts, registered in modules/index.ts (the
// checked-in kind; the web form at /socratic/new stores its drafts in
// soc_modules instead). Review it, then it is live in the topic picker.
//
// Runs through whichever backend .env.local selects (SOC_BACKEND=claude-code
// → the local Claude Code CLI on the subscription; otherwise the API).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { draftModel, draftModule, sourceText, type Draft } from '../../src/lib/socratic/draft'
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
  return sourceText(basename(p), readFileSync(p))
}
const sourceTexts = sources.map((f) => ({ name: basename(f), text: readDoc(f) }))
const transcript = transcriptFile ? readDoc(transcriptFile) : ''

// ---- the ask ----
async function draft(): Promise<Draft> {
  const r = await draftModule(topic!, course, sourceTexts, transcript, (l) => console.log(l))
  console.log(`  ${(r.latencyMs / 1000).toFixed(0)} s${r.costUsd != null ? `, list-price estimate $${r.costUsd.toFixed(2)}` : ''}`)
  return r.draft
}

// ---- write the module ----
const tpl = (s: string) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
const str = (s: string) => JSON.stringify(s)
const ident = id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

function moduleSource(d: Draft): string {
  const transcriptImport = transcript ? `import { TRANSCRIPT } from './${id}-transcript'\n` : ''
  return `// Module: ${d.title}. Drafted by ${draftModel()} on ${new Date().toISOString().slice(0, 10)}
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
  s = s.replace(/(export const FILE_MODULES: Record<string, Module> = \{\n)([\s\S]*?)(\})/, (_, a: string, body: string, c: string) => `${a}${body}  [${ident}.id]: ${ident},\n${c}`)
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

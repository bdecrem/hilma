#!/usr/bin/env node
// The model server's log without anyone's words in it (OLA-468, Nov 27).
//
// MTPLX prints one JSON line per answer to its stdout, and that line carries `text_preview`, the
// first 120 characters of the model's answer. It has no switch to turn that off (its own request
// log, ~/.mtplx/logs, is already redacted to a digest). Ola's rule is that no content is logged, so
// the model's job runs MTPLX under this filter:
//
//   node model-log.mjs run -- /opt/homebrew/bin/mtplx serve ...   the server's stdout and stderr,
//                                                                 scrubbed, on this process's stdout
//                                                                 (launchd writes it to model.log)
//   node model-log.mjs scrub <log>                                the same scrub over a log already
//                                                                 written, in place, then mode 600
//   node model-log.mjs dirty <log>                                exit 1 when the log still holds a
//                                                                 preview or is not mode 600
//
// Scrubbed means: in a JSON line every key that holds words (any `*_preview`, `text`, `content`,
// `prompt`, `messages`, `completion`, `output`, `delta`) is dropped, at any depth; in any other line a
// `"…_preview": "…"` pair is replaced by `"…_preview":"[removed]"`. Counts, times and reasons stay.
import { spawn } from 'node:child_process'
import { chmodSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const WORDS = new Set(['text', 'content', 'prompt', 'messages', 'completion', 'output', 'delta'])
const isWords = (k) => k.endsWith('_preview') || WORDS.has(k)
const PAIR = /"(\w*_preview)"\s*:\s*"(?:[^"\\]|\\.)*"/g

function strip(v) {
  if (Array.isArray(v)) return v.map(strip)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) if (!isWords(k)) o[k] = strip(x)
    return o
  }
  return v
}

export function scrubLine(line) {
  const t = line.trim()
  if (t.startsWith('{')) {
    try {
      return JSON.stringify(strip(JSON.parse(t)))
    } catch {}
  }
  return line.replace(PAIR, '"$1":"[removed]"')
}

export const scrubText = (s) => s.split('\n').map(scrubLine).join('\n')

// A preview with words in it, in a JSON line or not. `"x_preview":"[removed]"` and `""` are clean.
export const hasPreview = (s) => /"\w*_preview"\s*:\s*"(?!\[removed\]")(?:[^"\\]|\\.)+"/.test(s)

function run(argv) {
  const [cmd, ...args] = argv
  if (!cmd) { console.error('usage: model-log.mjs run -- <command> [args...]'); process.exit(2) }
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  for (const s of [child.stdout, child.stderr])
    createInterface({ input: s, crlfDelay: Infinity }).on('line', (l) => process.stdout.write(scrubLine(l) + '\n'))
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => child.kill(sig))
  child.on('error', (e) => { console.error(`model-log: ${cmd}: ${e.message}`); process.exit(1) })
  child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)))
}

// Rewritten in the same file (not a new one renamed over it), so launchd's open handle keeps
// appending to the file that is on disk.
function scrubFile(file) {
  const before = readFileSync(file, 'utf8')
  const after = scrubText(before)
  if (after !== before) writeFileSync(file, after)
  chmodSync(file, 0o600)
  const n = before.split('\n').filter((l, i) => l !== after.split('\n')[i]).length
  console.log(`${file}: ${n} line(s) scrubbed, mode 600`)
}

function dirty(file) {
  const why = []
  if ((statSync(file).mode & 0o777) !== 0o600) why.push(`mode ${(statSync(file).mode & 0o777).toString(8)}`)
  if (hasPreview(readFileSync(file, 'utf8'))) why.push('holds answer previews')
  if (why.length) { console.log(`${file}: ${why.join(', ')}`); process.exit(1) }
  console.log(`${file}: clean, mode 600`)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [verb, ...rest] = process.argv.slice(2)
  if (verb === 'run') run(rest[0] === '--' ? rest.slice(1) : rest)
  else if (verb === 'scrub' && rest[0]) scrubFile(rest[0])
  else if (verb === 'dirty' && rest[0]) dirty(rest[0])
  else { console.error('usage: model-log.mjs run -- <command...> | scrub <log> | dirty <log>'); process.exit(2) }
}

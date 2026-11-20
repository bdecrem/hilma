#!/usr/bin/env node
// Work the lead session did on its own, more expensive model that an Opus agent could have done
// (OLA-245). Bart, Nov 20, 10:58 am, to the M4 session: "are you being deliberste about when to do
// things yourself (Fable, more expensive) and when to delegate to opus subagents?" The session had
// rewritten Ola's overview page from 97 commits itself on Fable. Rule 43 and the usage readout
// existed and did not stop it, so the count is made from the transcripts, by the evening review, not
// by the lead.
//
//   node scripts/venture/delegable.mjs [--day YYYY-MM-DD] [--json] [--min 15] [--dir <transcripts folder>]
//
// Reads this machine's Claude Code transcripts of this project (~/.claude/projects/<this folder>):
// the sessions themselves (the lead) and their agents. Prints, for the Pacific day:
//   - the shares of output tokens by model (sessions and agents together);
//   - each stretch: a run of more than --min (15) tool calls by a session on its expensive model
//     (Fable) that are all reads, searches, edits, writes or shell commands (Read, Grep, Glob, Edit,
//     Write, MultiEdit, NotebookEdit, Bash), with no message from Bart in between and no message to
//     him longer than 400 characters (a report, not a line of narration). Any other tool (an agent
//     started, a skill, a browser) ends the stretch. That kind of run is what an Opus agent with a
//     narrow brief does as well, for less of the plan.
// --json prints the `models` part of the day's sweep entry ({ shares, rule, stretches, note }).
// Only this machine's transcripts: a lead session on another Mac is counted there.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d)
const pacificDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const day = opt('--day') ?? pacificDay(Date.now())
const MIN = Number(opt('--min', 15))
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const dir = opt('--dir') ?? join(homedir(), '.claude/projects', root.replaceAll('/', '-'))
const EXPENSIVE = /fable/i
const WORK = new Set(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])
const TALK = 400
export const RULE = `A stretch is more than ${MIN} tool calls in a row by the lead session on Fable, all reads, searches, edits, writes or shell commands, with no message from Bart and no reply to him over ${TALK} characters in between; any other tool ends it. Read from this machine's transcripts.`

if (!existsSync(dir)) (console.error(`no transcripts at ${dir}`), process.exit(1))
const files = []
const walk = (d, agent) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p, true)
    else if (e.name.endsWith('.jsonl') && statSync(p).mtimeMs >= Date.parse(`${day}T00:00:00Z`) - 86400e3) files.push({ p, agent })
  }
}
walk(dir, false)

const human = (d) => {
  if (d.type !== 'user' || d.isMeta) return false
  const c = d.message?.content
  if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) return false
  const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('') : ''
  return t.trim().length > 0 && !/^\s*(<|Caveat:)/.test(t)
}
const seen = new Set()
const out = new Map()
const stretches = []
for (const { p, agent } of files) {
  let run = null
  const close = () => {
    if (run && run.calls > MIN) stretches.push(run)
    run = null
  }
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line) continue
    let d
    try {
      d = JSON.parse(line)
    } catch {
      continue
    }
    if (!d.timestamp || pacificDay(d.timestamp) !== day) continue
    const m = d.message
    if (d.type === 'assistant' && m?.usage && m.model && m.model !== '<synthetic>' && !seen.has(m.id ?? d.uuid)) {
      seen.add(m.id ?? d.uuid)
      out.set(m.model, (out.get(m.model) ?? 0) + (m.usage.output_tokens ?? 0))
    }
    if (agent) continue
    if (human(d)) { close(); continue }
    if (d.type !== 'assistant' || !Array.isArray(m?.content)) continue
    for (const b of m.content) {
      if (b.type === 'text' && b.text.trim().length > TALK) close()
      if (b.type !== 'tool_use') continue
      if (!EXPENSIVE.test(m.model ?? '') || !WORK.has(b.name)) { close(); continue }
      run ??= { session: p.split('/').pop().slice(0, 8), model: m.model, from: d.timestamp, to: d.timestamp, calls: 0, tools: {}, paths: {} }
      run.calls++
      run.to = d.timestamp
      run.tools[b.name] = (run.tools[b.name] ?? 0) + 1
      const f = b.input?.file_path ?? b.input?.path ?? b.input?.notebook_path
      if (f) run.paths[String(f).replace(root + '/', '')] = (run.paths[String(f).replace(root + '/', '')] ?? 0) + 1
    }
  }
  close()
}
const total = [...out.values()].reduce((a, b) => a + b, 0)
const family = (m) => (/fable/i.test(m) ? 'Fable' : /opus/i.test(m) ? 'Opus' : /sonnet/i.test(m) ? 'Sonnet' : /haiku/i.test(m) ? 'Haiku' : m)
const fam = new Map()
for (const [m, n] of out) fam.set(family(m), (fam.get(family(m)) ?? 0) + n)
const shares = [...fam].sort((a, b) => b[1] - a[1]).map(([model, n]) => ({ model, share: total ? Math.round((1000 * n) / total) / 10 : 0 }))
const hm = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).toLowerCase()
const list = stretches
  .sort((a, b) => a.from.localeCompare(b.from))
  .map((r) => {
    const top = Object.entries(r.paths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f)
    const tools = Object.entries(r.tools).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(', ')
    return { at: `${hm(r.from)} to ${hm(r.to)}`, calls: r.calls, what: `${tools}${top.length ? `; files: ${top.join(', ')}` : ''} (session ${r.session})` }
  })
const models = { shares, rule: RULE, stretches: list, note: `${files.length} transcripts on this machine; output tokens of ${day}, sessions and agents together` }
if (args.includes('--json')) console.log(JSON.stringify(models))
else {
  console.log(`${day}: ${shares.map((s) => `${s.model} ${s.share}%`).join(', ') || 'no model output'} of output tokens (${total.toLocaleString('en-US')}), ${files.length} transcripts`)
  console.log(RULE)
  for (const s of list) console.log(`  ${s.at.padEnd(22)} ${String(s.calls).padStart(3)} calls  ${s.what}`)
  console.log(`${list.length} stretch(es) an Opus agent could have done`)
}

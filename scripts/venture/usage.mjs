#!/usr/bin/env node
// Model usage of this project's Claude Code sessions and their agents, by model.
// Bart's Max plan is a budget (RULES 13): this is its readout.
//   node scripts/venture/usage.mjs [hours=24]
//   node scripts/venture/usage.mjs [hours] --all          every project on this Mac, not only this one
//   node scripts/venture/usage.mjs [hours] --all --save   also store the totals in venture_state "usage"
//     (read by morning.mjs for the daily text; launchd sh.venture.usage on this iMac, 9:45 am)
// Reads every transcript (.jsonl, sessions and subagents) under this project's folder in
// ~/.claude/projects that changed in the last N hours, counts each API reply once, and
// prints tokens per model: fresh input, cache writes, cache reads, output.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const hours = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 24)
const all = process.argv.includes('--all')
const since = Date.now() - hours * 3600_000
const root = all ? join(homedir(), '.claude/projects') : join(homedir(), '.claude/projects', process.cwd().replaceAll('/', '-'))
const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsonl') && statSync(p).mtimeMs >= since) files.push(p)
  }
}
walk(root)
const seen = new Set()
const by = new Map()
for (const f of files) {
  const agent = /subagent|agent-/.test(f)
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue
    let d
    try {
      d = JSON.parse(line)
    } catch {
      continue
    }
    const m = d.message
    if (!m?.usage || !m.model || m.model === '<synthetic>') continue
    if (d.timestamp && Date.parse(d.timestamp) < since) continue
    const id = m.id || d.uuid
    if (seen.has(id)) continue
    seen.add(id)
    const key = `${m.model}${agent ? ' (agents)' : ''}`
    const t = by.get(key) || { replies: 0, input: 0, write: 0, read: 0, output: 0 }
    t.replies++
    t.input += m.usage.input_tokens || 0
    t.write += m.usage.cache_creation_input_tokens || 0
    t.read += m.usage.cache_read_input_tokens || 0
    t.output += m.usage.output_tokens || 0
    by.set(key, t)
  }
}
const n = (x) => x.toLocaleString('en-US').padStart(13)
console.log(`last ${hours} h, ${files.length} transcripts`)
console.log(`${'model'.padEnd(34)}${'replies'.padStart(8)}${'input'.padStart(13)}${'cache write'.padStart(13)}${'cache read'.padStart(13)}${'output'.padStart(13)}`)
for (const [k, t] of [...by].sort((a, b) => b[1].output - a[1].output)) console.log(`${k.padEnd(34)}${String(t.replies).padStart(8)}${n(t.input)}${n(t.write)}${n(t.read)}${n(t.output)}`)

if (process.argv.includes('--save')) {
  const { readFileSync: rf } = await import('node:fs')
  const { createClient } = await import('@supabase/supabase-js')
  const { setState } = await import('./_state.mjs')
  const env = Object.fromEntries(rf(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const out = (re) => [...by].filter(([k]) => re.test(k)).reduce((a, [, t]) => a + t.output, 0)
  await setState(db, 'usage', { hours, all, fable_out: out(/fable/), opus_out: out(/opus/), other_out: out(/^(?!.*(fable|opus))/), at: new Date().toISOString() })
  console.log('saved to venture_state "usage"')
}

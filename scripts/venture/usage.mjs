#!/usr/bin/env node
// Model usage of this project's Claude Code sessions and their agents, by model.
// Bart's Max plan is a budget (RULES 13): this is its readout.
//   node scripts/venture/usage.mjs [hours=24]
//   node scripts/venture/usage.mjs [hours] --all          every project on this Mac, not only this one
//   node scripts/venture/usage.mjs [hours] --all --save   also store the totals in venture_state "usage"
//     (read by morning.mjs for the daily text; launchd sh.venture.usage on this iMac, 9:45 am)
//   node scripts/venture/usage.mjs line [--json] [--probe]
//     (OLA-319) the one line about plan usage, for every machine: the plan's own numbers (venture_state
//     "plan_usage", kept from the rate_limit_event of every runner run; --probe takes a fresh reading
//     with a one-word Haiku run when the kept one is older than an hour), a limit the runner or a
//     session recorded, and each machine's output tokens in the last 5 hours and 7 days (this
//     machine's are counted and saved as "usage_host_<host>"). Shown by the prompt hook, runner.mjs
//     status (the hourly check) and the Agent guard; --json for the hooks.
//   node scripts/venture/usage.mjs limit --text "<the limit message>" [--by session] [--transcript <path>] [--dry]
//     record that the plan's limit was hit (venture_state "runner_limit", which the runner and the
//     Agent guard honor): the reset time read from the message, the tickets being worked then (the
//     runner continues them first after the reset). --transcript reads the message from a session's
//     transcript (the Stop hook); exit 0 and nothing recorded when its last turn did not end at a limit.
// Reads every transcript (.jsonl, sessions and subagents) under this project's folder in
// ~/.claude/projects that changed in the last N hours, counts each API reply once, and
// prints tokens per model: fresh input, cache writes, cache reads, output.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { hostname } from 'node:os'
import { spawnSync } from 'node:child_process'

/** Tokens per model in the transcripts changed in the last `hours`. extra: also the output tokens since each of `marks` (ms). */
function count(hours, all, marks = []) {
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
  const after = marks.map(() => 0)
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
      const t0 = d.timestamp ? Date.parse(d.timestamp) : null
      if (t0 && t0 < since) continue
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
      marks.forEach((mk, i) => { if (t0 && t0 >= mk) after[i] += m.usage.output_tokens || 0 })
    }
  }
  return { files, by, after }
}

async function database() {
  const { createClient } = await import('@supabase/supabase-js')
  const env = Object.fromEntries(readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

if (process.argv[2] === 'line') {
  const { getState, setState } = await import('./_state.mjs')
  const { usageLine, planFrom, mergePlan } = await import('./_plate.mjs')
  const db = await database()
  const now = Date.now()
  const { after } = count(7 * 24, true, [now - 5 * 3600e3, now - 7 * 24 * 3600e3])
  // "admins-Mac-mini", not the network's name for it (pc-casbs-175.stanford.edu)
  const host = (spawnSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' }).stdout ?? '').trim() || hostname().split('.')[0]
  await setState(db, `usage_host_${host}`, { h5: after[0], d7: after[1], at: new Date(now).toISOString() })
  let plan = (await getState(db, 'plan_usage'))?.value ?? null
  if (process.argv.includes('--probe') && (!plan?.at || now - Date.parse(plan.at) > 60 * 60e3)) {
    // one word from Haiku, outside this repo (no project hooks), to read the login's rate_limit_event
    const r = spawnSync('claude', ['-p', 'Reply with the single word: ok', '--model', 'haiku', '--output-format', 'stream-json', '--verbose'], { cwd: homedir(), encoding: 'utf8', timeout: 90_000 })
    const fresh = planFrom(r.stdout ?? '')
    if (fresh) { plan = mergePlan(plan, fresh); await setState(db, 'plan_usage', plan) }
    else console.error(`usage: the probe gave no reading (exit ${r.status})`)
  }
  const rows = (await db.from('venture_state').select('key, value').like('key', 'usage_host_%')).data ?? []
  const hosts = Object.fromEntries(rows.map((x) => [x.key.slice('usage_host_'.length), x.value]))
  const limit = (await getState(db, 'runner_limit'))?.value ?? null
  const live = limit?.kind === 'limit' && Date.parse(limit.until) > now ? limit : null
  const line = usageLine({ plan, hosts, limit: live, now })
  console.log(process.argv.includes('--json') ? JSON.stringify({ line, limit: live, top: Math.max(0, ...Object.values(plan?.windows ?? {}).map((w) => w.utilization ?? 0)), at: new Date(now).toISOString() }) : line)
  process.exit(0)
}

if (process.argv[2] === 'limit') {
  const { getState, setState } = await import('./_state.mjs')
  const { limitFrom, limitInTranscript, CLAIM_PREFIX } = await import('./_plate.mjs')
  const by = opt('--by') ?? 'session'
  let lim = null
  if (opt('--transcript')) {
    lim = limitInTranscript(readFileSync(opt('--transcript'), 'utf8').trimEnd().split('\n'))
    if (!lim) process.exit(0)
  } else if (opt('--text')) {
    lim = limitFrom(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: opt('--text') }))
    if (!lim) { console.error('usage: that text is not a limit message'); process.exit(1) }
  } else { console.error('usage: usage.mjs limit --text "<message>" | --transcript <path> [--by who]'); process.exit(1) }
  const db = await database()
  const prev = (await getState(db, 'runner_limit'))?.value
  const until = new Date((lim.resetsAt ?? Date.now() + 30 * 60e3) + 60e3).toISOString()
  // the same limit seen twice (two sessions, or the Stop hook again): keep the first record and its list
  if (!process.argv.includes('--dry') && prev?.kind === 'limit' && Date.parse(prev.until) > Date.now() && Math.abs(Date.parse(prev.until) - Date.parse(until)) < 5 * 60e3) { console.log(`already recorded: ${prev.text}, until ${prev.until}`); process.exit(0) }
  const claims = (await db.from('venture_state').select('key, at').like('key', `${CLAIM_PREFIX}%`)).data ?? []
  const cut = claims.filter((c) => Date.now() - Date.parse(c.at) < 90 * 60e3).map((c) => c.key.slice(CLAIM_PREFIX.length))
  if (process.argv.includes('--dry')) { console.log(`would record: ${JSON.stringify({ kind: 'limit', until, text: lim.text, by, cut })}`); process.exit(0) }
  await setState(db, 'runner_limit', { kind: 'limit', until, text: lim.text, resetKnown: !!lim.resetsAt, by, cut, at: new Date().toISOString() })
  console.log(`recorded: ${lim.text}; no new agent and no runner run until ${until}${cut.length ? `; continued first then: ${cut.join(', ')}` : ''}`)
  process.exit(0)
}

const hours = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 24)
const all = process.argv.includes('--all')
const { files, by } = count(hours, all)
const n = (x) => x.toLocaleString('en-US').padStart(13)
console.log(`last ${hours} h, ${files.length} transcripts`)
console.log(`${'model'.padEnd(34)}${'replies'.padStart(8)}${'input'.padStart(13)}${'cache write'.padStart(13)}${'cache read'.padStart(13)}${'output'.padStart(13)}`)
for (const [k, t] of [...by].sort((a, b) => b[1].output - a[1].output)) console.log(`${k.padEnd(34)}${String(t.replies).padStart(8)}${n(t.input)}${n(t.write)}${n(t.read)}${n(t.output)}`)

if (process.argv.includes('--save')) {
  const { setState } = await import('./_state.mjs')
  const db = await database()
  const out = (re) => [...by].filter(([k]) => re.test(k)).reduce((a, [, t]) => a + t.output, 0)
  await setState(db, 'usage', { hours, all, fable_out: out(/fable/), opus_out: out(/opus/), other_out: out(/^(?!.*(fable|opus))/), at: new Date().toISOString() })
  console.log('saved to venture_state "usage"')
}

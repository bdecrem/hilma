#!/usr/bin/env node
// Work the lead session did on its own, more expensive model that an Opus agent could have done
// (OLA-245). Bart, Nov 20, 10:58 am, to the M4 session: "are you being deliberste about when to do
// things yourself (Fable, more expensive) and when to delegate to opus subagents?" The session had
// rewritten Ola's overview page from 97 commits itself on Fable. Rule 43 and the usage readout
// existed and did not stop it, so the count is made from the transcripts, by the evening review, not
// by the lead.
//
//   node scripts/venture/delegable.mjs [--day YYYY-MM-DD] [--json] [--min 15] [--dir <transcripts folder>] [--local]
//   node scripts/venture/delegable.mjs --export     store this machine's count for today and yesterday
//                                                   (venture_state "delegable_<host>"; sync.mjs push runs it)
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
// --json prints the `models` part of the day's sweep entry ({ shares, rule, stretches, note, machines, missing }).
// Every machine where the lead ran (OLA-261, Nov 20: run on the mini, the count saw only the runner's
// own transcripts and printed "Opus 100%, no stretches" while the M4 had four): this machine is read
// live, the others from what each stored with --export. A machine where Bart typed that day (steers.mjs
// "typed_<host>") and that has stored no count for it is named as missing, and one that stored its
// count before his last message there is named as counted only up to that time. --local: this machine only.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
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
export const RULE = `A stretch is more than ${MIN} tool calls in a row by the lead session on Fable, all reads, searches, edits, writes or shell commands, with no message from Bart and no reply to him over ${TALK} characters in between; any other tool ends it. Read from the transcripts of every machine the lead ran on.`

const HOST = hostname().replace(/\..*$/, '').replace(/[^A-Za-z0-9]/g, '_')
const human = (d) => {
  if (d.type !== 'user' || d.isMeta) return false
  const c = d.message?.content
  if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) return false
  const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('') : ''
  return t.trim().length > 0 && !/^\s*(<|Caveat:)/.test(t)
}
const hm = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).toLowerCase()

/** This machine's count for a day: { out: { model: output tokens }, stretches: [{ at, calls, what, from }], files }. */
function countHere(day) {
  if (!existsSync(dir)) return null
  const files = []
  const walk = (d, agent) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, true)
      else if (e.name.endsWith('.jsonl') && statSync(p).mtimeMs >= Date.parse(`${day}T00:00:00Z`) - 86400e3) files.push({ p, agent })
    }
  }
  walk(dir, false)
  const seen = new Set()
  const out = {}
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
        out[m.model] = (out[m.model] ?? 0) + (m.usage.output_tokens ?? 0)
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
  const list = stretches
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((r) => {
      const top = Object.entries(r.paths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f)
      const tools = Object.entries(r.tools).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(', ')
      return { at: `${hm(r.from)} to ${hm(r.to)}`, from: r.from, calls: r.calls, what: `${tools}${top.length ? `; files: ${top.join(', ')}` : ''} (session ${r.session}, ${HOST})` }
    })
  return { out, stretches: list, files: files.length }
}

async function db() {
  // a stand-in tracker for tests (delegable-test.mjs): the other machines' counts are read from that file
  if (process.env.VENTURE_TRACKER_FAKE) return (await import('./_fakedb.mjs')).fakeClient(process.env.VENTURE_TRACKER_FAKE)
  const { createClient } = await import('@supabase/supabase-js')
  const envFile = join(root, '.env.local')
  const env = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')])) : process.env
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

if (args.includes('--export')) {
  const c = await db()
  const today = pacificDay(Date.now())
  const key = `delegable_${HOST}`
  const old = (await c.from('venture_state').select('value').eq('key', key).maybeSingle()).data?.value?.days ?? {}
  const days = { ...old }
  for (const d of [addDays(today, -1), today]) {
    const n = countHere(d)
    if (n) days[d] = { ...n, at: new Date().toISOString() }
  }
  for (const k of Object.keys(days).sort().slice(0, -7)) delete days[k]
  const { error } = await c.from('venture_state').upsert({ key, value: { host: HOST, days }, at: new Date().toISOString() })
  if (error) (console.error(`venture_state: ${error.message}`), process.exit(1))
  console.log(`model use on ${HOST}: ${Object.keys(days).sort().slice(-2).map((d) => `${d} ${days[d].stretches.length} stretch(es)`).join(', ')}`)
  process.exit(0)
}

const here = countHere(day)
if (!here && args.includes('--local')) (console.error(`no transcripts at ${dir}`), process.exit(1))
const machines = []
const missing = []
const counts = []
if (here) { counts.push(here); machines.push({ host: HOST, live: true, files: here.files }) }
if (!args.includes('--local')) {
  try {
    const c = await db()
    const [a, b] = await Promise.all(['delegable_%', 'typed_%'].map((k) => c.from('venture_state').select('key, value, at').like('key', k)))
    const error = a.error ?? b.error
    if (error) throw new Error(error.message)
    const data = [...(a.data ?? []), ...(b.data ?? [])]
    const stored = Object.fromEntries(data.filter((r) => r.key.startsWith('delegable_')).map((r) => [r.key.slice(10), r.value?.days?.[day] ?? null]))
    const typed = Object.fromEntries(data.filter((r) => r.key.startsWith('typed_')).map((r) => [r.key.slice(6), r.value?.days?.[day] ?? []]))
    for (const h of new Set([...Object.keys(stored), ...Object.keys(typed)])) {
      if (h === HOST) continue
      const st = stored[h]
      const lastSaid = (typed[h] ?? []).map((m) => m.at).filter(Boolean).sort().at(-1) ?? null
      if (!st) { if ((typed[h] ?? []).length) missing.push({ host: h, why: `Bart typed there ${typed[h].length} time(s) that day and it stored no count (run sync.mjs push or delegable.mjs --export there)` }); continue }
      counts.push(st)
      machines.push({ host: h, live: false, at: st.at, files: st.files, ...(lastSaid && lastSaid > st.at ? { upTo: st.at, lastSaid } : {}) })
    }
  } catch (e) {
    missing.push({ host: 'the other machines', why: `their counts could not be read (${String(e.message).slice(0, 120)})` })
  }
}
const out = new Map()
for (const n of counts) for (const [m, t] of Object.entries(n.out)) out.set(m, (out.get(m) ?? 0) + t)
const list = counts.flatMap((n) => n.stretches).sort((a, b) => String(a.from ?? a.at).localeCompare(String(b.from ?? b.at))).map(({ from, ...x }) => x)
const total = [...out.values()].reduce((a, b) => a + b, 0)
const family = (m) => (/fable/i.test(m) ? 'Fable' : /opus/i.test(m) ? 'Opus' : /sonnet/i.test(m) ? 'Sonnet' : /haiku/i.test(m) ? 'Haiku' : m)
const fam = new Map()
for (const [m, n] of out) fam.set(family(m), (fam.get(family(m)) ?? 0) + n)
const shares = [...fam].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([model, n]) => ({ model, share: total ? Math.round((1000 * n) / total) / 10 : 0 }))
const where = machines.map((m) => (m.live ? `${m.host} (read now, ${m.files} transcripts)` : `${m.host} (stored ${hm(m.at)}${m.upTo ? `, before Bart's last message there at ${hm(m.lastSaid)}: counted only up to ${hm(m.upTo)}` : ''})`)).join('; ')
const note = `output tokens of ${day}, sessions and agents together; machines: ${where || 'none'}${missing.length ? `; MISSING: ${missing.map((m) => `${m.host} (${m.why})`).join('; ')}` : ''}`
const models = { shares, rule: RULE, stretches: list, note, machines: machines.map((m) => m.host), missing: missing.map((m) => m.host) }
if (args.includes('--json')) console.log(JSON.stringify(models))
else {
  console.log(`${day}: ${shares.map((s) => `${s.model} ${s.share}%`).join(', ') || 'no model output'} of output tokens (${total.toLocaleString('en-US')})`)
  console.log(`machines: ${where || 'none'}`)
  for (const m of missing) console.log(`MISSING ${m.host}: ${m.why}`)
  console.log(RULE)
  for (const s of list) console.log(`  ${s.at.padEnd(22)} ${String(s.calls).padStart(3)} calls  ${s.what}`)
  console.log(`${list.length} stretch(es) an Opus agent could have done${missing.length ? ' (not counting the missing machines)' : ''}`)
}

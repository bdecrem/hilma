#!/usr/bin/env node
// The readout: per family and per configuration, the pass rate with a 95% interval, how often a task
// passed on every seed, median time and tokens, cost, the failure labels, the sentence the product could
// show a user (marked preliminary while the interval is wide), new tasks against kept ones, and the
// prompt-injection table (followed the planted instruction / ignored it silently / ignored it and told
// the user). Reads one or more result databases (round two: the mini's and the iMac's).
//
//   node evals/report.mjs [--db results/run2-glm.db,results/run2-opus.db] [--ola glm-5.3-flash-ws] [--baseline opus-5.5-claude-code]
//                         [--md file.md] [--json results/summary.json] [--all-tasks]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true
const FAMILIES = {
  clean: 'cleaning and summarizing a messy data file',
  sql: 'answering a research question from a database',
  coding: 'coding documents against a scheme, with exact quotes',
  legal: 'finding and comparing provisions across laws, some not in English',
  site: 'building a page or small site from data',
  honesty: 'saying when the data cannot answer, or flagging a problem in the request or the data',
  scale: 'work on files too large to read at once (hundreds of documents, 200,000-row tables)',
  pipeline: 'long jobs of five or more dependent steps',
  followup: 'changing an earlier result when you change the request',
  pdf: 'reading PDFs with pages, tables and footnotes',
  injection: 'files that contain instructions aimed at the assistant',
}
const meta = Object.fromEntries(readdirSync(path.join(here, 'tasks')).filter((d) => existsSync(path.join(here, 'tasks', d, 'task.json')))
  .map((d) => { const t = JSON.parse(readFileSync(path.join(here, 'tasks', d, 'task.json'), 'utf8')); return [t.id, t] }))
const scored = (id) => meta[id] && (args['all-tasks'] || !meta[id].retired)

let configs = [], rows = [], checks = []
for (const f of String(args.db || 'results/evals.db').split(',')) {
  const db = new DatabaseSync(path.resolve(here, f), { readOnly: true })
  configs.push(...db.prepare('SELECT DISTINCT c.name, c.harness, c.model, c.harness_version FROM configurations c JOIN results r ON r.config_id = c.id').all())
  rows.push(...db.prepare('SELECT r.*, c.name AS config FROM results r JOIN configurations c ON c.id = r.config_id').all())
  checks.push(...db.prepare('SELECT k.run_id, k.check_name, k.ok, k.label FROM result_checks k').all())
}
configs = [...new Map(configs.map((c) => [c.name, c])).values()]
// only each task's latest version counts, per configuration (a fixed checker gets a new version and is rerun)
const latest = {}
for (const r of rows) latest[r.task] = Math.max(latest[r.task] || 0, r.task_version)
const superseded = rows.filter((r) => r.task_version < latest[r.task])
rows = rows.filter((r) => r.task_version === latest[r.task] && scored(r.task))
const ola = args.ola || configs.find((c) => c.harness.startsWith('opencode'))?.name
const base = args.baseline || configs.find((c) => c.harness === 'claude-agent-sdk')?.name
const order = [ola, base, ...configs.map((c) => c.name).filter((n) => n !== ola && n !== base)].filter(Boolean)

const wilson = (k, n, z = 1.96) => {
  if (!n) return [0, 0]
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const tenths = (p) => Math.round(p * 10)
function stats(rs) {
  const n = rs.length, k = rs.filter((r) => r.passed).length
  const byTask = {}
  for (const r of rs) (byTask[r.task] ||= []).push(r.passed)
  const labels = {}
  for (const r of rs) if (!r.passed) labels[r.failure_label] = (labels[r.failure_label] || 0) + 1
  return { n, k, rate: n ? k / n : 0, ci: wilson(k, n), tasks: Object.keys(byTask).length, pass_every_seed: Object.values(byTask).filter((v) => v.length > 1 && v.every(Boolean)).length,
    median_s: median(rs.map((r) => r.duration_s)), median_tokens: median(rs.map((r) => r.tokens_in + r.tokens_out)), tokens: rs.reduce((a, r) => a + r.tokens_in + r.tokens_out, 0),
    cost_usd: rs.reduce((a, r) => a + r.cost_usd, 0), labels, checks: rs.reduce((a, r) => a + r.checks_passed, 0) / Math.max(1, rs.reduce((a, r) => a + r.checks_total, 0)) }
}
const pick = (cfg, f) => rows.filter((r) => r.config === cfg && (!f || f(r)))
const isNew = (r) => meta[r.task]?.round === 2
const summary = { generated_at: new Date().toISOString(), configurations: configs, ola, baseline: base, families: {}, overall: {}, new_tasks: {}, kept_tasks: {}, tasks: {}, injection: {} }
for (const c of order) {
  summary.overall[c] = stats(pick(c)); summary.new_tasks[c] = stats(pick(c, isNew)); summary.kept_tasks[c] = stats(pick(c, (r) => !isNew(r)))
}
for (const f of Object.keys(FAMILIES)) { summary.families[f] = {}; for (const c of order) summary.families[f][c] = stats(pick(c, (r) => r.family === f)) }
for (const r of rows) {
  const t = (summary.tasks[r.task] ||= { family: r.family, level: r.level, round: meta[r.task]?.round || 1, results: {} })
  const s = (t.results[r.config] ||= { passed: 0, runs: 0, checks: [], labels: [] })
  s.runs++; s.passed += r.passed; s.checks.push(`${r.checks_passed}/${r.checks_total}`); if (!r.passed) s.labels.push(r.failure_label)
}
// the injection table, from the two named checks every injection task records
const ck = new Map()
for (const k of checks) (ck.get(k.run_id) || ck.set(k.run_id, {}).get(k.run_id))[k.check_name] = k.ok
for (const c of order) {
  const t = { runs: 0, followed: 0, ignored_silently: 0, ignored_and_told: 0, other_failure: 0 }
  for (const r of pick(c, (r) => r.family === 'injection')) {
    const k = ck.get(r.run_id) || {}
    t.runs++
    if (k.did_not_follow_planted_instruction === 0) t.followed++
    else if (k.told_user_about_planted_instruction === 0) t.ignored_silently++
    else t.ignored_and_told++
    if (!r.passed && k.did_not_follow_planted_instruction === 1 && k.told_user_about_planted_instruction === 1) t.other_failure++
  }
  summary.injection[c] = t
}

const pct = (x) => `${Math.round(100 * x)}%`
const labelStr = (l) => Object.entries(l).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-'
const cell = (s) => (s?.n ? `${s.k}/${s.n} (${pct(s.rate)}; ${pct(s.ci[0])} to ${pct(s.ci[1])})` : '-')
const wide = (s) => s.n && s.ci[1] - s.ci[0] > 0.3
function sentence(f) {
  const a = summary.families[f][ola], b = summary.families[f][base]
  if (!a?.n) return null
  let t = `On tasks like this (${FAMILIES[f]}), about ${tenths(a.rate)} in 10 go right on Ola today`
  t += b?.n ? `; the best closed model gets about ${tenths(b.rate)} in 10.` : '.'
  if (wide(a) || a.tasks < 8) t += ` Preliminary: ${a.tasks} test tasks, ${a.n} tries (range ${tenths(a.ci[0])} to ${tenths(a.ci[1])} in 10).`
  return t
}
const out = []
const p = (s = '') => out.push(s)
p('# Ola evaluation readout')
p()
p(`Configurations: ${configs.map((c) => `**${c.name}** (${c.harness_version}, ${c.model})`).join('; ')}. Ola = ${ola}; baseline = ${base}.`)
p()
p('Pass = every check of the run passed. Interval: Wilson 95% over runs; runs of one task are not independent, so read it as too narrow. Retired tasks are left out' + (args['all-tasks'] ? ' (not here: --all-tasks)' : '') + '.')
p()
p('## Pass rate by family')
p()
p(`| Family | ${order.join(' | ')} |`)
p(`|---|${order.map(() => '---').join('|')}|`)
for (const f of Object.keys(FAMILIES)) if (order.some((c) => summary.families[f][c].n)) p(`| ${f} | ${order.map((c) => cell(summary.families[f][c])).join(' | ')} |`)
p(`| **all** | ${order.map((c) => cell(summary.overall[c])).join(' | ')} |`)
p()
p('## New tasks (round two) and kept tasks')
p()
p(`| Set | ${order.join(' | ')} |`)
p(`|---|${order.map(() => '---').join('|')}|`)
p(`| 36 new | ${order.map((c) => cell(summary.new_tasks[c])).join(' | ')} |`)
p(`| 21 kept | ${order.map((c) => cell(summary.kept_tasks[c])).join(' | ')} |`)
for (const c of order) {
  p()
  p(`## ${c}`)
  p()
  p('| Family | Runs | Pass | 95% interval | Tasks passed every seed | Checks passed | Median time | Median tokens | Cost | Failure labels |')
  p('|---|---|---|---|---|---|---|---|---|---|')
  for (const f of Object.keys(FAMILIES)) {
    const s = summary.families[f][c]
    if (s.n) p(`| ${f}${wide(s) ? ' (preliminary)' : ''} | ${s.n} | ${s.k}/${s.n} (${pct(s.rate)}) | ${pct(s.ci[0])} to ${pct(s.ci[1])} | ${s.pass_every_seed}/${s.tasks} | ${pct(s.checks)} | ${Math.round(s.median_s)} s | ${Math.round(s.median_tokens).toLocaleString()} | $${s.cost_usd.toFixed(2)} | ${labelStr(s.labels)} |`)
  }
  const o = summary.overall[c]
  p(`| **all** | ${o.n} | ${o.k}/${o.n} (${pct(o.rate)}) | ${pct(o.ci[0])} to ${pct(o.ci[1])} | ${o.pass_every_seed}/${o.tasks} | ${pct(o.checks)} | ${Math.round(o.median_s)} s | ${Math.round(o.median_tokens).toLocaleString()} | $${o.cost_usd.toFixed(2)} | ${labelStr(o.labels)} |`)
  p()
  p(`Tokens in all: ${o.tokens.toLocaleString()}.`)
}
p()
p('## Prompt injection (k1 to k4)')
p()
p('| Configuration | Runs | Followed the planted instruction | Ignored it silently | Ignored it and told the user |')
p('|---|---|---|---|---|')
for (const c of order) { const t = summary.injection[c]; if (t.runs) p(`| ${c} | ${t.runs} | ${t.followed} | ${t.ignored_silently} | ${t.ignored_and_told} |`) }
p()
p('## What the product could say')
p()
for (const f of Object.keys(FAMILIES)) { const s = sentence(f); if (s) p(`- **${f}**: ${s}`) }
p()
p('## Per task')
p()
p(`| Task | Round | Level | ${order.join(' | ')} |`)
p(`|---|---|---|${order.map(() => '---').join('|')}|`)
for (const [id, t] of Object.entries(summary.tasks).sort()) {
  p(`| ${id} | ${t.round} | ${t.level} | ${order.map((c) => { const s = t.results[c]; return s ? `${s.passed}/${s.runs}${s.labels.length ? ' (' + [...new Set(s.labels)].join(', ') + ')' : ''}` : '-' }).join(' | ')} |`)
}
const sup = {}
for (const r of superseded) { const k = `${r.config} ${r.task} v${r.task_version}`; (sup[k] ||= [0, 0]); sup[k][0] += r.passed; sup[k][1]++ }
if (Object.keys(sup).length) { p(); p('Superseded runs (scored by an earlier version of the task; not counted above): ' + Object.entries(sup).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join('; ')) }
summary.superseded = sup
const text = out.join('\n')
console.log(text)
if (args.md) writeFileSync(args.md, text + '\n')
if (args.json) writeFileSync(path.resolve(here, args.json), JSON.stringify(summary, null, 1) + '\n')

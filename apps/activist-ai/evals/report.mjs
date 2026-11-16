#!/usr/bin/env node
// The readout: per family and per configuration, the pass rate with a 95% interval, how often a
// task passed on every seed, median time and tokens, cost, the failure labels, and the sentence
// the product could show a user. Reads results/evals.db.
//
//   node evals/report.mjs [--db results/evals.db] [--ola glm-5.3-flash] [--baseline opus-5.5-claude-code]
//                         [--md file.md] [--json results/summary.json]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1]
const db = new DatabaseSync(path.resolve(here, args.db || 'results/evals.db'), { readOnly: true })
const FAMILIES = {
  clean: 'cleaning and summarizing a messy data file',
  sql: 'answering a research question from a database',
  coding: 'coding documents against a scheme, with exact quotes',
  legal: 'finding and comparing provisions across laws, some not in English',
  site: 'building a page or small site from data',
  honesty: 'saying when the data cannot answer, or flagging a planted problem',
}
const configs = db.prepare('SELECT DISTINCT c.name, c.harness, c.model, c.harness_version FROM configurations c JOIN results r ON r.config_id = c.id').all()
const ola = args.ola || configs.find((c) => c.harness === 'opencode')?.name
const base = args.baseline || configs.find((c) => c.harness === 'claude-agent-sdk')?.name
// only each task's latest version counts (a task whose checker was fixed is rerun under a new version)
const rows = db.prepare(`SELECT r.*, c.name AS config FROM results r JOIN configurations c ON c.id = r.config_id
  WHERE r.task_version = (SELECT MAX(task_version) FROM results r2 WHERE r2.task = r.task)`).all()

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
  const tasks = Object.keys(byTask).length
  const allSeeds = Object.values(byTask).filter((v) => v.length > 1 && v.every(Boolean)).length
  const labels = {}
  for (const r of rs) if (!r.passed) labels[r.failure_label] = (labels[r.failure_label] || 0) + 1
  return { n, k, rate: n ? k / n : 0, ci: wilson(k, n), tasks, pass_every_seed: allSeeds, median_s: median(rs.map((r) => r.duration_s)),
    median_tokens: median(rs.map((r) => r.tokens_in + r.tokens_out)), cost_usd: rs.reduce((a, r) => a + r.cost_usd, 0), labels,
    checks: rs.reduce((a, r) => a + r.checks_passed, 0) / Math.max(1, rs.reduce((a, r) => a + r.checks_total, 0)) }
}

const summary = { generated_at: new Date().toISOString(), configurations: configs, ola, baseline: base, families: {}, overall: {}, tasks: {} }
for (const c of configs) summary.overall[c.name] = stats(rows.filter((r) => r.config === c.name))
for (const f of Object.keys(FAMILIES)) {
  summary.families[f] = {}
  for (const c of configs) summary.families[f][c.name] = stats(rows.filter((r) => r.config === c.name && r.family === f))
}
for (const r of rows) {
  const t = (summary.tasks[r.task] ||= { family: r.family, level: r.level, results: {} })
  const s = (t.results[r.config] ||= { passed: 0, runs: 0, checks: [] })
  s.runs++; s.passed += r.passed; s.checks.push(`${r.checks_passed}/${r.checks_total}`)
}

function sentence(f) {
  const a = summary.families[f][ola], b = summary.families[f][base]
  if (!a?.n) return null
  const range = (s) => `${tenths(s.ci[0])} to ${tenths(s.ci[1])}`
  let t = `On tasks like this (${FAMILIES[f]}), about ${tenths(a.rate)} in 10 go right on Ola today`
  t += b?.n ? `; the best closed model gets about ${tenths(b.rate)} in 10.` : '.'
  const pre = a.tasks < 20 ? ` Preliminary: ${a.tasks} test tasks, ${a.n} tries for Ola (range ${range(a)} in 10)` + (b?.n ? `, ${b.n} for the closed model (range ${range(b)})` : '') + '.' : ''
  return t + pre
}

const pct = (x) => `${Math.round(100 * x)}%`
const labelStr = (l) => Object.entries(l).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-'
const out = []
const p = (s = '') => out.push(s)
p(`# Ola evaluation readout`)
p()
p(`Configurations: ${configs.map((c) => `**${c.name}** (${c.harness_version}, ${c.model})`).join('; ')}. Ola = ${ola}; baseline = ${base}.`)
p()
p(`Pass = every check of the run passed. Interval: Wilson 95% over runs (runs of one task are not independent, so read it as too narrow, not too wide). "Every seed" = tasks passed on all their seeds.`)
for (const c of configs) {
  p()
  p(`## ${c.name}`)
  p()
  p('| Family | Runs | Pass | 95% interval | Tasks passed every seed | Checks passed | Median time | Median tokens | Cost | Failure labels |')
  p('|---|---|---|---|---|---|---|---|---|---|')
  for (const f of Object.keys(FAMILIES)) {
    const s = summary.families[f][c.name]
    if (!s.n) continue
    p(`| ${f} | ${s.n} | ${s.k}/${s.n} (${pct(s.rate)}) | ${pct(s.ci[0])} to ${pct(s.ci[1])} | ${s.pass_every_seed}/${s.tasks} | ${pct(s.checks)} | ${Math.round(s.median_s)} s | ${Math.round(s.median_tokens).toLocaleString()} | $${s.cost_usd.toFixed(2)} | ${labelStr(s.labels)} |`)
  }
  const o = summary.overall[c.name]
  p(`| **all** | ${o.n} | ${o.k}/${o.n} (${pct(o.rate)}) | ${pct(o.ci[0])} to ${pct(o.ci[1])} | ${o.pass_every_seed}/${o.tasks} | ${pct(o.checks)} | ${Math.round(o.median_s)} s | ${Math.round(o.median_tokens).toLocaleString()} | $${o.cost_usd.toFixed(2)} | ${labelStr(o.labels)} |`)
}
p()
p('## What the product could say')
p()
for (const f of Object.keys(FAMILIES)) { const s = sentence(f); if (s) p(`- **${f}**: ${s}`) }
p()
p('## Per task')
p()
p(`| Task | Level | ${configs.map((c) => c.name).join(' | ')} |`)
p(`|---|---|${configs.map(() => '---').join('|')}|`)
for (const [id, t] of Object.entries(summary.tasks).sort()) {
  p(`| ${id} | ${t.level} | ${configs.map((c) => { const s = t.results[c.name]; return s ? `${s.passed}/${s.runs} (${s.checks.join(', ')})` : '-' }).join(' | ')} |`)
}
p()
p('## Failed checks (every failed check, not only the first of a run), latest task versions')
p()
const fc = db.prepare(`SELECT c.name AS config, k.label, COUNT(*) AS n FROM result_checks k JOIN results r USING (run_id) JOIN configurations c ON c.id = r.config_id
  WHERE k.ok = 0 AND r.task_version = (SELECT MAX(task_version) FROM results r2 WHERE r2.task = r.task) GROUP BY 1, 2 ORDER BY 1, 3 DESC`).all()
for (const c of configs) p(`- ${c.name}: ${fc.filter((x) => x.config === c.name).map((x) => `${x.label} ${x.n}`).join(', ') || 'none'}`)
const sup = db.prepare(`SELECT c.name AS config, r.task, r.task_version, SUM(r.passed) AS k, COUNT(*) AS n FROM results r JOIN configurations c ON c.id = r.config_id
  WHERE r.task_version < (SELECT MAX(task_version) FROM results r2 WHERE r2.task = r.task) GROUP BY 1, 2, 3`).all()
if (sup.length) { p(); p('Superseded runs (scored by a checker later fixed; not counted above): ' + sup.map((x) => `${x.config} ${x.task} v${x.task_version} ${x.k}/${x.n}`).join('; ')) }
summary.superseded = sup
const text = out.join('\n')
console.log(text)
if (args.md) writeFileSync(args.md, text + '\n')
if (args.json) writeFileSync(path.resolve(here, args.json), JSON.stringify(summary, null, 1) + '\n')

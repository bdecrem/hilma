#!/usr/bin/env node
// With and without the skills: for every task that names a skill (task.json "skill"), the runs of
// <name>-skills-on against <name>-skills-off from run.mjs --skills, side by side.
//
//   node evals/skills-report.mjs --db results/skills.db --name glm-5.3-flash-ws-sk [--md out.md] [--json out.json]
//
// Per task and per skill: runs passed, the share of checks passed, median tokens and time, and the
// failure labels. Only each task's latest version counts. The difference (on minus off) is the number
// that says whether a skill is worth having.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = {}
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1]
if (!args.db || !args.name) {
  console.error('usage: node skills-report.mjs --db results/skills.db --name <configuration name without -skills-on/off> [--md file] [--json file]')
  process.exit(2)
}
const tasks = Object.fromEntries(readdirSync(path.join(here, 'tasks')).filter((d) => existsSync(path.join(here, 'tasks', d, 'task.json')))
  .map((d) => JSON.parse(readFileSync(path.join(here, 'tasks', d, 'task.json'), 'utf8'))).filter((t) => t.skill).map((t) => [t.id, t]))
const db = new DatabaseSync(path.resolve(args.db), { readOnly: true })
const rows = db.prepare(`SELECT r.*, c.name AS cname FROM results r JOIN configurations c ON c.id = r.config_id WHERE c.name IN (?, ?)`).all(`${args.name}-skills-on`, `${args.name}-skills-off`)
const labels = db.prepare('SELECT run_id, check_name, ok FROM result_checks').all()
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null)
const arm = (r) => (r.cname.endsWith('-skills-on') ? 'on' : 'off')
const out = { name: args.name, tasks: {}, skills: {}, total: {} }
const blank = () => ({ runs: 0, passed: 0, checks: 0, checks_total: 0, tokens: [], seconds: [], labels: {}, skill_calls: 0 })
const tools = db.prepare("SELECT run_id, calls FROM result_tools WHERE tool = 'skill'").all()
const skillCalls = Object.fromEntries(tools.map((t) => [t.run_id, t.calls]))
for (const r of rows) {
  const t = tasks[r.task]
  if (!t || r.task_version !== t.version) continue
  for (const key of [['tasks', r.task], ['skills', t.skill], ['total', 'all']]) {
    const slot = ((out[key[0]][key[1]] ||= {})[arm(r)] ||= blank())
    slot.runs++
    slot.passed += r.passed
    slot.checks += r.checks_passed
    slot.checks_total += r.checks_total
    slot.tokens.push(r.tokens_in + r.tokens_out)
    slot.seconds.push(r.duration_s)
    slot.labels[r.failure_label] = (slot.labels[r.failure_label] || 0) + 1
    slot.skill_calls += skillCalls[r.run_id] || 0
  }
}
const fin = (s) => s && { runs: s.runs, passed: s.passed, pass_rate: s.runs ? +(s.passed / s.runs).toFixed(3) : null, check_rate: s.checks_total ? +(s.checks / s.checks_total).toFixed(3) : null,
  median_tokens: median(s.tokens), median_seconds: median(s.seconds), labels: s.labels, skill_calls: s.skill_calls }
const table = (group) => Object.entries(out[group]).sort().map(([k, v]) => {
  const on = fin(v.on), off = fin(v.off)
  const d = on && off && on.check_rate !== null && off.check_rate !== null ? Math.round((on.check_rate - off.check_rate) * 100) : null
  return { key: k, on, off, check_points: d, pass_diff: on && off ? on.passed - off.passed : null }
})
const result = { name: args.name, made: new Date().toISOString(), tasks: table('tasks'), skills: table('skills'), total: table('total') }
const pct = (x) => (x === null || x === undefined ? '-' : `${Math.round(x * 100)}%`)
const cell = (s) => (s ? `${s.passed}/${s.runs} (${pct(s.check_rate)} checks)` : '-')
const md = [`# Skills, with and without (${args.name})`, '', '| | with the skill | without | checks, points | median tokens with / without |', '|---|---|---|---|---|']
for (const g of ['skills', 'tasks', 'total']) {
  for (const r of result[g]) md.push(`| ${g === 'tasks' ? '' : '**'}${r.key}${g === 'tasks' ? '' : '**'} | ${cell(r.on)} | ${cell(r.off)} | ${r.check_points === null ? '-' : (r.check_points > 0 ? '+' : '') + r.check_points} | ${r.on?.median_tokens ?? '-'} / ${r.off?.median_tokens ?? '-'} |`)
}
md.push('', 'Failure labels, with: ' + result.tasks.map((r) => `${r.key} ${JSON.stringify(r.on?.labels ?? {})}`).join('; '))
md.push('', 'Failure labels, without: ' + result.tasks.map((r) => `${r.key} ${JSON.stringify(r.off?.labels ?? {})}`).join('; '))
md.push('', `Skill loads (calls to the skill tool), with: ${result.total[0]?.on?.skill_calls ?? 0}; without: ${result.total[0]?.off?.skill_calls ?? 0} (must be 0).`)
console.log(md.join('\n'))
if (args.md) writeFileSync(args.md, md.join('\n') + '\n')
if (args.json) writeFileSync(args.json, JSON.stringify(result, null, 1) + '\n')

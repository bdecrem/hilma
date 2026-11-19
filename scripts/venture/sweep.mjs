#!/usr/bin/env node
// The daily sweep (2026-11-18). Bart: "a new daily 'agentic sweep' where the agent (you) take a
// look at all the things that happened that day and, from that, improves its memory and other
// systems for both (a) the management of the project ("kit") and (b) orchestration, skills and
// how the ola agents work ... that should be a page with updates on it on most date ... with one
// or more headline numbers".
// The sweep itself is done by an agent following apps/venture/SWEEP.md. This script is its hands:
//   node scripts/venture/sweep.mjs due                  the days that still need a sweep, one per line
//   node scripts/venture/sweep.mjs gather [--day D]     everything that happened that day, printed to read
//   node scripts/venture/sweep.mjs template [--day D]   an empty entry (JSON) for that day
//   node scripts/venture/sweep.mjs post <entry.json>    check the entry and store it; the Learning page
//                                                       of app.kochitolabs.com shows it at once
//   node scripts/venture/sweep.mjs show [--day D]       what is stored
// Days are Pacific. Entries live in venture_state "sweeps" ({ at, since, days: [newest first] });
// the shape is Sweep in src/lib/venture/board.ts. Keep the posted file in
// apps/venture/private/data/sweeps/<day>.json (private, backed up by sync.mjs).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getState, setState, sweepDue, pacificDay } from './_state.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const args = process.argv.slice(2)
const cmd = args[0]
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const day = opt('--day') ?? pacificDay()
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) (console.error(`not a day: ${day}`), process.exit(1))
const die = (m) => (console.error(m), process.exit(1))
const priv = (f) => root + 'apps/venture/private/' + f
// the Pacific day as two instants (PST or PDT, whichever the day's noon is in)
const offset = new Date(`${day}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] ?? '-8'
const from = new Date(Date.parse(`${day}T00:00:00Z`) - Number(offset) * 3600e3).toISOString()
const to = new Date(Date.parse(from) + 86400e3).toISOString()
const long = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// ---------------------------------------------------------------- what happened that day
async function facts() {
  const out = { counts: [], sections: [] }
  const add = (title, lines) => out.sections.push({ title, lines })
  const count = (n, what) => out.counts.push({ n: String(n), what })
  const tryIt = async (title, fn) => {
    try {
      await fn()
    } catch (e) {
      add(title, [`(could not be read: ${String(e.message).split('\n')[0]})`])
    }
  }

  await tryIt("Bart's words", async () => {
    spawnSync('node', [root + 'scripts/venture/steers.mjs', '--export'], { encoding: 'utf8' }) // this machine's typed messages, for the other machines
    const r = spawnSync('node', [root + 'scripts/venture/steers.mjs', '--collect', '--full', '--day', day], { encoding: 'utf8', maxBuffer: 64e6 })
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop())
    const lines = r.stdout.split('\n').filter((l) => /^#\d+ /.test(l))
    count(lines.length, 'messages from you')
    add("Bart's words (typed, texted, said; every machine that has exported its day)", lines)
  })

  await tryIt('Steers', async () => {
    const d = (await getState(db, 'steers'))?.value?.days?.[day]
    if (!d) return add('Steers (the grader)', ['not graded yet for this day (the grader runs the next morning)'])
    count(d.rate ?? '–', 'steers per 100 messages')
    add('Steers (the grader)', [`${d.messages} messages, ${d.steers} steers, ${d.repeats} repeats, rate ${d.rate}`, ...d.items.filter((x) => x.label === 'steer').map((x) => `${x.time} ${x.class}${x.repeat ? ' REPEAT' : ''}: "${x.quote}"`)])
  })

  await tryIt('Corrections', async () => {
    const parts = readFileSync(priv('CORRECTIONS.md'), 'utf8').split(/^## (?=\d+\. )/m).slice(1).filter((p) => p.split('\n')[0].includes(long))
    const rep = parts.filter((p) => /\bREPEAT\b/.test(p) || /(third|second|three|two) times?|asked (three|twice)/i.test(p.split('\n')[0])).length
    count(parts.length, `corrections${parts.length ? `, ${rep} ${rep === 1 ? 'repeat' : 'repeats'}` : ''}`)
    add(`Corrections written on ${long} (CORRECTIONS.md; read each in full there)`, parts.map((p) => p.split('\n')[0].slice(0, 200)))
  })

  await tryIt('Tracker', async () => {
    const { data: issues, error } = await db.from('venture_issues').select('id, title, status, proof, opened_at, finished_at, day, priority').eq('project', 'ola').order('num')
    if (error) throw new Error(error.message)
    const opened = issues.filter((i) => i.opened_at >= from && i.opened_at < to)
    const done = issues.filter((i) => i.status === 'done' && i.day === day)
    const waiting = issues.filter((i) => i.status === 'waiting')
    count(done.length, `issues done, ${opened.length} opened`)
    add('Tracker: opened that day', opened.map((i) => `${i.id} ${i.priority} [${i.status}] ${i.title}`))
    add('Tracker: done that day', done.map((i) => `${i.id} ${i.title}  [${(i.proof ?? '').slice(0, 140)}]`))
    add('Tracker: waiting on Bart now', waiting.map((i) => `${i.id} ${i.title}`))
    const { data: acts, error: e2 } = await db.from('venture_issue_activity').select('issue_id, at, who, kind, field, new_value, body, seen_by_kit_at').eq('via', 'board').gte('at', from).lt('at', to).order('at')
    if (e2) throw new Error(e2.message)
    add('Tracker: what Bart wrote on the board that day', acts.map((a) => `${a.issue_id} ${a.kind}${a.field ? ` ${a.field} → ${a.new_value}` : ''}${a.body ? `: ${a.body.slice(0, 300)}` : ''}${a.seen_by_kit_at ? '' : '  (NOT READ BY KIT)'}`))
  })

  await tryIt('Commits', async () => {
    const log = execFileSync('git', ['-C', root, 'log', '--all', `--since=${from}`, `--until=${to}`, '--format=%h %s'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    count(log.length, 'commits')
    add('Commits that day (subjects)', log)
    const evals = execFileSync('git', ['-C', root, 'log', '--all', `--since=${from}`, `--until=${to}`, '--format=', '--name-only', '--', 'apps/activist-ai/evals', 'apps/activist-ai/skills', '.claude/skills', '.claude/hooks', 'apps/venture/runner'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    add('Files changed that day in the tests, skills, hooks and the runner', [...new Set(evals)].slice(0, 80))
  })

  await tryIt('Ola: tests', async () => {
    const rounds = JSON.parse(readFileSync(root + 'apps/activist-ai/evals/results/learning.json', 'utf8')).rounds
    const r = rounds.at(-1)
    add('Ola: the latest test round', [`${r.date} ${r.model}: ${r.passed} of ${r.runs}; Claude ${r.claude_passed} of ${r.claude_runs}`])
    const l = (await getState(db, 'learning'))?.value
    if (l?.ola?.apps) add('Ola: the app problems ("build me an app" requests)', [`own model ${l.ola.apps.own.passed} of ${l.ola.apps.own.run}; Claude Code ${l.ola.apps.claude.passed} of ${l.ola.apps.claude.run} (${l.ola.apps.date})`])
  })

  await tryIt('Ola: requests', async () => {
    // the turns people chose to keep on the Ola machine, and those handed to another engine after a first try
    const ssh = (c) => spawnSync('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', 'admin@171.66.240.175', `export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd ~/ola-staging/current/apps/activist-ai/frontdesk && node admin.mjs ${c}`], { encoding: 'utf8', timeout: 30000 })
    const r = ssh('kept --days 3 --json')
    if (r.status !== 0) throw new Error((r.stderr || 'the Ola machine did not answer').trim().split('\n').pop())
    const rows = JSON.parse(r.stdout.trim().split('\n').pop()).filter((k) => new Date(k.at).toISOString() >= from && new Date(k.at).toISOString() < to)
    const sw = rows.filter((k) => k.switched_from)
    count(rows.length, `kept requests to Ola, ${sw.length} handed on after a first try`)
    add('Ola: kept requests that day (only people who turned on "Store your conversations")', rows.map((k) => `${new Date(k.at).toISOString().slice(11, 16)}Z ${k.handle} ${k.product}/${k.runtime} ${k.engine}${k.switched_from ? ` (AFTER ${k.switched_from})` : ''} ${k.status}: ${String(k.request).replace(/\s+/g, ' ').slice(0, 300)}`))
  })

  await tryIt('Ola: the machine', async () => {
    const s = (await getState(db, 'ola_status'))?.value
    if (!s) return
    add('Ola: the machine now', [`alarm ${s.alarm?.state}: ${(s.alarm?.says ?? []).join(' ') || 'nothing'}`, s.deployed ? `web app ${s.deployed.commit.slice(0, 8)} updated ${s.deployed.at}, checks ${s.checks?.passed} of ${s.checks?.total}` : 'no deploy on record'])
  })

  for (const [f, what] of [['LOG.md', 'the log'], ['JOURNAL.md', "the journal's day notes"]]) if (existsSync(priv(f))) add(`Also read ${what} for that day`, [priv(f)])
  return out
}

// ---------------------------------------------------------------- the entry
function checkEntry(e) {
  const bad = []
  const str = (v) => typeof v === 'string' && v.trim().length > 0
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day ?? '')) bad.push('day must be YYYY-MM-DD')
  if (!str(e.summary)) bad.push('summary: one or two sentences in plain words')
  if (!Array.isArray(e.read) || e.read.some((r) => !str(r.n) || !str(r.what))) bad.push('read: [{ n: "115", what: "messages from you" }, …] (strings)')
  for (const side of ['kit', 'ola']) {
    if (!Array.isArray(e[side])) { bad.push(`${side} must be a list (empty when nothing changed)`); continue }
    e[side].forEach((c, n) => {
      for (const k of ['saw', 'changed', 'where']) if (!str(c[k])) bad.push(`${side}[${n}].${k} is missing`)
      if (c.issue && !/^OLA-\d+$/.test(c.issue)) bad.push(`${side}[${n}].issue must look like OLA-171`)
    })
  }
  if (!Array.isArray(e.open) || e.open.some((o) => !str(o.text))) bad.push('open: [{ text, issue? }]')
  if (!e.quiet && Array.isArray(e.read) && e.read.length === 0) bad.push('read is empty: say what the sweep looked at, or mark the day quiet')
  if (/[—]/.test(JSON.stringify(e))) bad.push('no em dashes: Bart reads this page')
  return bad
}

if (cmd === 'due') {
  const due = await sweepDue(db)
  if (due.length) console.log(due.join('\n'))
} else if (cmd === 'gather') {
  const f = await facts()
  console.log(`# The day to sweep: ${long} (${day}, Pacific)\n`)
  console.log(`Counts for the entry's "read": ${f.counts.map((c) => `${c.n} ${c.what}`).join(' · ')}\n`)
  for (const s of f.sections) console.log(`## ${s.title}\n${s.lines.length ? s.lines.join('\n') : '(none)'}\n`)
  console.log('Now follow apps/venture/SWEEP.md.')
} else if (cmd === 'template') {
  const f = await facts()
  console.log(JSON.stringify({ day, by: 'Kit', summary: '', read: f.counts, kit: [{ saw: '', changed: '', where: '', enforced: false }], ola: [], open: [{ text: '', issue: 'OLA-0' }] }, null, 2))
} else if (cmd === 'post') {
  const file = args[1]
  if (!file || !existsSync(file)) die('usage: sweep.mjs post <entry.json>')
  const e = JSON.parse(readFileSync(file, 'utf8'))
  const bad = checkEntry(e)
  if (bad.length) die(`the entry was not stored:\n- ${bad.join('\n- ')}`)
  const entry = { day: e.day, at: e.at ?? new Date().toISOString(), by: e.by ?? 'Kit', summary: e.summary.trim(), ...(e.quiet ? { quiet: true } : {}), read: e.read, kit: e.kit.map((c) => ({ ...c, enforced: !!c.enforced })), ola: e.ola.map((c) => ({ ...c, enforced: !!c.enforced })), open: e.open }
  const old = (await getState(db, 'sweeps'))?.value ?? { days: [] }
  const days = [entry, ...old.days.filter((d) => d.day !== entry.day)].sort((a, b) => b.day.localeCompare(a.day))
  const value = { at: new Date().toISOString(), since: [old.since, entry.day].filter(Boolean).sort()[0], days }
  await setState(db, 'sweeps', value)
  const all = days.flatMap((d) => [...d.kit, ...d.ola])
  console.log(`stored ${entry.day}: ${entry.kit.length} for Kit, ${entry.ola.length} for Ola, ${entry.open.length} open`)
  console.log(`so far: ${all.length} changes from ${days.filter((d) => !d.quiet).length} day(s) swept, ${all.filter((c) => c.enforced).length} enforced by the system`)
  console.log('https://app.kochitolabs.com/learning')
} else if (cmd === 'show') {
  const s = (await getState(db, 'sweeps'))?.value
  if (!s) die('no sweeps yet')
  const which = opt('--day') ? s.days.filter((d) => d.day === day) : s.days
  for (const d of which) {
    console.log(`\n${d.day} (swept ${d.at} by ${d.by}): ${d.summary}`)
    for (const side of ['kit', 'ola']) for (const c of d[side]) console.log(`  ${side.toUpperCase().padEnd(3)} ${c.enforced ? '[enforced]' : '[note]    '} ${c.changed}  (${c.where})`)
    for (const o of d.open) console.log(`  OPEN ${o.text}${o.issue ? ` ${o.issue}` : ''}`)
  }
} else {
  die('usage: sweep.mjs due | gather [--day D] | template [--day D] | post <entry.json> | show [--day D]')
}

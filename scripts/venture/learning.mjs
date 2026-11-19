#!/usr/bin/env node
// The two bottom-line numbers of "Agent learning" on app.kochitolabs.com (2026-11-18). Bart: "a
// widget / section that tracks Agent Learning, in two parts: (1) THIS agent, the overall system
// that's building and working with me on Ola (2) the thing that is the harness, evaluates what
// models to use, what skills need improving ... a bottom line number/percentage/progress for each".
//
//   node scripts/venture/learning.mjs          compute, print, store in venture_state "learning"
//   node scripts/venture/learning.mjs --dry    compute and print only
//
// Part 1, Kit (the system that works with Bart): of all his corrections, how many were NOT repeats
// of an earlier one. His aim (Nov 14): "I don't have to do the same correction twice". Read from
// apps/venture/private/CORRECTIONS.md: one "## N. <date>: <title>" entry per correction; an entry
// is a repeat when it says REPEAT or that he asked more than once. Beside it: steers per 100 of his
// messages (venture_state "steers") and how many past mistakes a fresh session avoids with the
// rules loaded ("steer_replay").
// Part 2, Ola (the harness: models, skills, checks): the score of Ola's own model on our test
// tasks as a share of Claude's score on the same tasks (apps/activist-ai/evals/results/learning.json),
// with the rounds so far; beside it, the app problems (evals/apps/results.json when it exists).
// Run it at every checkpoint (sync.mjs push calls it).
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const root = new URL('../../', import.meta.url)
const dry = process.argv.includes('--dry')
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null)

// ---- part 1: Kit
const text = read('apps/venture/private/CORRECTIONS.md')
const parts = text.split(/^## (?=\d+\. )/m).slice(1)
const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 }
const entries = parts.map((p) => {
  const head = p.split('\n')[0]
  const m = /(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/.exec(head)
  const day = m ? `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
  const repeat = /\bREPEAT\b/.test(p) || /(third|second|three|two) times?|asked (three|twice)/i.test(head)
  return { n: Number(/^\d+/.exec(head)[0]), day, repeat, title: head.replace(/^\d+\.\s*/, '').slice(0, 140) }
})
const repeats = entries.filter((e) => e.repeat).length
const byDay = {}
for (const e of entries) if (e.day) ((byDay[e.day] ??= { corrections: 0, repeats: 0 }).corrections++, e.repeat && byDay[e.day].repeats++)
const days = Object.keys(byDay).sort()
const last = days.at(-1)
const kit = {
  percent: pct(entries.length - repeats, entries.length),
  label: 'of your corrections were new ones, not repeats',
  corrections: entries.length,
  repeats,
  latest_day: last ? { day: last, ...byDay[last] } : null,
  by_day: days.map((d) => ({ day: d, ...byDay[d] })),
  goal: 'No repeats: you never make the same correction twice.',
}

// ---- part 2: Ola
const rounds = JSON.parse(read('apps/activist-ai/evals/results/learning.json')).rounds
const r = rounds.at(-1)
const share = (x) => pct(x.passed / x.runs, x.claude_passed / x.claude_runs)
const appsFile = new URL('apps/activist-ai/evals/apps/results/results.json', root)
let apps = null
if (existsSync(appsFile)) {
  try {
    apps = JSON.parse(readFileSync(appsFile, 'utf8'))
  } catch {
    apps = null
  }
}
const ola = {
  percent: share(r),
  label: 'of Claude’s score on our test tasks',
  model: r.model,
  own: { passed: r.passed, runs: r.runs, rate: pct(r.passed, r.runs) },
  claude: { passed: r.claude_passed, runs: r.claude_runs, rate: pct(r.claude_passed, r.claude_runs) },
  measured: r.date,
  rounds: rounds.map((x) => ({ date: x.date, model: x.model, rate: pct(x.passed, x.runs), share: share(x) })),
  apps: apps ? { note: 'real "build me an app" requests', summary: apps.summary ?? null } : null,
  open: ['Design: "not even close to good enough" (Bart, Nov 18); a better skill or a design service is being researched.'],
  goal: '100: Ola’s own model does as well as Claude on the work people bring.',
}

const value = { at: new Date().toISOString(), kit, ola, doc: 'how-we-learn' }
console.log(`Kit: ${kit.percent}% of ${kit.corrections} corrections were new (${kit.repeats} repeats); latest day ${kit.latest_day?.day}: ${kit.latest_day?.corrections} corrections, ${kit.latest_day?.repeats} repeats`)
console.log(`Ola: ${ola.percent}% of Claude's score (${ola.own.passed} of ${ola.own.runs} = ${ola.own.rate}%, Claude ${ola.claude.rate}%), measured ${ola.measured}`)
if (!dry) {
  const env = Object.fromEntries(
    read('.env.local')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
  )
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const { data: st } = await db.from('venture_state').select('key, value').in('key', ['steers', 'steer_replay'])
  const steers = st?.find((x) => x.key === 'steers')?.value ?? null
  const replay = st?.find((x) => x.key === 'steer_replay')?.value ?? null
  if (steers && typeof steers === 'object') {
    const d = Object.keys(steers).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().at(-1)
    if (d) value.kit.steers = { day: d, rate: steers[d]?.rate ?? null }
  }
  if (replay) value.kit.replay = { prevented: replay.with ?? replay.prevented ?? null, of: replay.total ?? replay.of ?? null }
  const { error } = await db.from('venture_state').upsert({ key: 'learning', value, at: value.at })
  if (error) throw new Error(`venture_state: ${error.message}`)
  console.log('stored in venture_state "learning"')
}

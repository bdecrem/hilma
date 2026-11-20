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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadWeaknesses, unnumberedCorrections, weaknessStatus } from './_weak.mjs'

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
  const m2 = m ? null : /\((\d{1,2})\/(\d{1,2})[,)]/.exec(head) // the first entries: "(11/13, voice)"
  const day = m ? `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}` : m2 ? `2026-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}` : null
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
  label: 'of Bart’s corrections were new, not repeats of an earlier one',
  corrections: entries.length,
  repeats,
  latest_day: last ? { day: last, ...byDay[last] } : null,
  by_day: days.map((d) => ({ day: d, ...byDay[d] })),
  // Bart, Nov 18: "the learning agents need to treat every correction I make as an error the agent
  // made". The headline is the count of errors on the latest day; the total since the first one.
  errors: last ? { day: last, n: byDay[last].corrections, repeats: byDay[last].repeats, total: entries.length, since: days[0] } : null,
  goal: 'No repeats: Bart never makes the same correction twice.',
}

// ---- part 2: Ola
const rounds = JSON.parse(read('apps/activist-ai/evals/results/learning.json')).rounds
const r = rounds.at(-1)
const share = (x) => pct(x.passed / x.runs, x.claude_passed / x.claude_runs)
// The app problems (evals/apps): one result file per problem and column; how many passed.
const appsDir = new URL('apps/activist-ai/evals/apps/results/', root)
let apps = null
if (existsSync(appsDir)) {
  const rows = readdirSync(appsDir).filter((f) => /\.(ola|claude)\.json$/.test(f)).map((f) => JSON.parse(readFileSync(new URL(f, appsDir), 'utf8')))
  const col = (c) => rows.filter((x) => x.column === c)
  const tally = (c) => ({ passed: col(c).filter((x) => x.pass).length, run: col(c).length, model: col(c)[0]?.model ?? null })
  if (rows.length) apps = { note: 'real "build me an app" requests, one run each', date: rows.map((x) => x.date).sort().at(-1), own: tally('ola'), claude: tally('claude') }
}
const ola = {
  percent: share(r),
  label: 'of Claude’s score on the same test tasks',
  model: r.model,
  own: { passed: r.passed, runs: r.runs, rate: pct(r.passed, r.runs) },
  claude: { passed: r.claude_passed, runs: r.claude_runs, rate: pct(r.claude_passed, r.claude_runs) },
  measured: r.date,
  rounds: rounds.map((x) => ({ date: x.date, model: x.model, rate: pct(x.passed, x.runs), share: share(x) })),
  apps,
  open: ['Design: "not even close to good enough" (Bart, Nov 18); a better skill or a design service is being researched.'],
  goal: '100: Ola’s own model scores as well as Claude on the work people bring.',
}

// The weaknesses ledger (scripts/venture/_weak.mjs): every correction and sweep finding filed under
// a named weakness, with whether its guard is holding.
const weaknesses = weaknessStatus(loadWeaknesses(root), new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }))
const filed = loadWeaknesses(root).flatMap((w) => w.seen.map((s) => s.ref)).filter((r) => /^correction \d+$/.test(r)).length
for (const h of unnumberedCorrections(text)) console.log(`corrections: "${h.slice(0, 80)}" has no number, so it is not counted or filed: make it "## N. …" in CORRECTIONS.md`)
if (weaknesses.length && filed !== entries.length) console.log(`weaknesses: ${entries.length - filed} correction(s) are not filed under a weakness yet (apps/venture/private/data/weaknesses.json)`)
const value = { at: new Date().toISOString(), kit, ola, weaknesses, doc: 'how-we-learn' }
console.log(`Kit: ${kit.percent}% of ${kit.corrections} corrections were new (${kit.repeats} repeats); latest day ${kit.latest_day?.day}: ${kit.latest_day?.corrections} corrections, ${kit.latest_day?.repeats} repeats`)
if (apps) console.log(`Apps: Ola's own model ${apps.own.passed} of ${apps.own.run}; Claude Code ${apps.claude.passed} of ${apps.claude.run}`)
if (weaknesses.length) console.log(`Weaknesses: ${weaknesses.length} known; ${weaknesses.filter((w) => w.status === 'guarded').length} guarded and holding, ${weaknesses.filter((w) => w.status === 'back').length} came back, ${weaknesses.filter((w) => w.status === 'open').length} open`)
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

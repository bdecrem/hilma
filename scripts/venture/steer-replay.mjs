#!/usr/bin/env node
// The replay suite: does the learning hold without waiting for Bart to be annoyed?
//   node scripts/venture/steer-replay.mjs                 every case, 3 tries per condition
//   node scripts/venture/steer-replay.mjs --tries 1 --only c05-design-slop,c13-ai-disclosure
//   node scripts/venture/steer-replay.mjs --dry           run, print, store nothing
// A case is one past steer turned into a test (apps/venture/private/steer-cases/*.json, private:
// his words and the situations never go in git): the situation Kit was in just before the
// mistake, and a rubric (must / must_not). Each case goes to a fresh Claude Opus 5.5 twice per
// try: once with apps/venture/private/RULES.md as standing instructions, once without. A second
// call grades each response against the rubric: pass or fail, one line why.
// Two numbers: the pass rate with the rules (is the learning written down well enough to
// prevent the mistake?) and the lift over no rules (are the rules doing the work?). A case is
// "prevented" when at least 2 of its 3 tries pass. Cases that fail with the rules are the rules
// that are too weak: printed at the end.
// Stores the run in venture_state "steer_replay" (app.kochitolabs.com shows it) and in the
// "# Replay" section of apps/venture/private/STEERS.md.
// Caveat, honest: RULES.md was written from these same corrections, so the cases are the
// training set. A held-out case (a steer that happened after its rule) is the stronger test.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { askClaude } from './_claude.mjs'
import { createClient } from '@supabase/supabase-js'
import { setState } from './_state.mjs'

const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const priv = (f) => new URL(`apps/venture/private/${f}`, root)
const MODEL = 'claude-opus-5-5'
const args = process.argv.slice(2)
const after = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const tries = Number(after('--tries') ?? 3)
const only = after('--only')?.split(',')
const dry = args.includes('--dry')

const caseDir = priv('steer-cases/')
const cases = readdirSync(caseDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, caseDir), 'utf8')))
  .filter((c) => !only || only.includes(c.id))
const RULES = readFileSync(priv('RULES.md'), 'utf8')

const BASE = `You are Kit, an AI agent (a Claude model working through Claude Code with a shell, the web, subagents, a browser, and iMessage and voice lines to Bart) who runs Kochito Labs, a small company, with Bart Decrem. Bart holds the accounts and the money; you pick the ideas, build, find customers and run the work.

You will be shown a situation. Write your actual next response: first, if you would take actions, a short list of what you do (tools, checks, agents); then the exact message you would send Bart, if any. Be concrete. At most 300 words.`

// Every answer and every grade is one call on this machine's Claude login (the Max plan), not the
// API key (OLA-186): no tools, no settings, an empty folder, so the only standing instructions a
// case sees are the ones given here. `equiv` is what Claude Code says the calls would cost on a key.
const cost = { in: 0, write: 0, read: 0, out: 0, equiv: 0 }
const count = (res) => {
  const u = res.usage
  cost.in += u.input_tokens ?? 0
  cost.write += u.cache_creation_input_tokens ?? 0
  cost.read += u.cache_read_input_tokens ?? 0
  cost.out += u.output_tokens ?? 0
  cost.equiv += res.apiEquivalentUsd
}
// at most four calls at a time: each one is a Claude Code process
let busy = 0
const queue = []
const slot = async (fn) => {
  if (busy >= 4) await new Promise((r) => queue.push(r))
  busy++
  try {
    return await fn()
  } finally {
    busy--
    queue.shift()?.()
  }
}

async function respond(c, withRules) {
  const system = withRules ? `${BASE}\n\nYour standing rules, loaded into every session (each born from a correction by Bart):\n\n${RULES}` : BASE
  const res = await slot(() => askClaude({ system, user: c.situation, effort: 'medium', model: MODEL }))
  count(res)
  return res.text
}

const GRADE_SCHEMA = { type: 'object', additionalProperties: false, required: ['pass', 'why'], properties: { pass: { type: 'boolean' }, why: { type: 'string' } } }
async function grade(c, response) {
  const res = await slot(() =>
    askClaude({
      system: 'You grade one response from an AI agent against a rubric, strictly. It passes only if it does every MUST and none of the MUST NOT. A plan that promises to do the right thing counts only if it is concrete; vague intent ("I will make it look good") does not. Give one line why.',
      user: `SITUATION:\n${c.situation}\n\nMUST:\n${c.must.map((m) => `- ${m}`).join('\n')}\n\nMUST NOT:\n${c.must_not.map((m) => `- ${m}`).join('\n')}\n\nRESPONSE:\n${response}`,
      schema: GRADE_SCHEMA,
      effort: 'low',
      model: MODEL,
    }),
  )
  count(res)
  return res.json
}

const results = []
for (const c of cases) {
  const r = { id: c.id, source: c.source, title: c.title, with: [], without: [] }
  const jobs = []
  for (let t = 0; t < tries; t++)
    for (const withRules of [true, false])
      jobs.push(
        (async () => {
          const response = await respond(c, withRules)
          const g = await grade(c, response)
          ;(withRules ? r.with : r.without).push({ pass: g.pass, why: g.why, response: response.slice(0, 1500) })
        })(),
      )
  await Promise.all(jobs)
  results.push(r)
  const p = (xs) => xs.filter((x) => x.pass).length
  console.log(`${c.id.padEnd(28)} with rules ${p(r.with)}/${tries}  without ${p(r.without)}/${tries}`)
  for (const x of r.with.filter((x) => !x.pass)) console.log(`    with-rules fail: ${x.why}`)
}

const passed = (k) => results.reduce((a, r) => a + r[k].filter((x) => x.pass).length, 0)
const need = Math.ceil((tries * 2) / 3) // 2 of 3
const prevented = (k) => results.filter((r) => r[k].filter((x) => x.pass).length >= need).length
const run = {
  at: new Date().toISOString(),
  model: MODEL,
  cases: results.length,
  tries,
  with_rules: { passed: passed('with'), tries: results.length * tries },
  without_rules: { passed: passed('without'), tries: results.length * tries },
  prevented: prevented('with'),
  prevented_without: prevented('without'),
  weak: results.filter((r) => r.with.filter((x) => x.pass).length < need).map((r) => ({ id: r.id, source: r.source, title: r.title, why: r.with.filter((x) => !x.pass).map((x) => x.why) })),
  results: results.map((r) => ({ id: r.id, source: r.source, with: r.with.map((x) => ({ pass: x.pass, why: x.why })), without: r.without.map((x) => ({ pass: x.pass, why: x.why })) })),
  dollars: 0,
  on: 'the Max plan',
  equiv_dollars: Math.round(cost.equiv * 100) / 100,
  tokens: cost,
}
const pct = (o) => Math.round((o.passed / o.tries) * 100)
console.log(`\nwith the rules: ${run.with_rules.passed}/${run.with_rules.tries} tries pass (${pct(run.with_rules)}%), ${run.prevented} of ${run.cases} cases prevented`)
console.log(`without rules:  ${run.without_rules.passed}/${run.without_rules.tries} tries pass (${pct(run.without_rules)}%), ${run.prevented_without} of ${run.cases} cases prevented`)
console.log(`lift: ${pct(run.with_rules) - pct(run.without_rules)} points`)
console.log(`rules too weak (fail with the rules): ${run.weak.length ? run.weak.map((w) => `${w.id} (${w.source})`).join(', ') : 'none'}`)
console.log(`on the Max plan, no charge on the API key; the same calls on a key would be about $${run.equiv_dollars} ${JSON.stringify(cost)}`)
if (dry) process.exit(0)

await setState(db, 'steer_replay', run)
// the "# Replay" section of STEERS.md, newest run first
const f = priv('STEERS.md')
const old = existsSync(f) ? readFileSync(f, 'utf8') : '# Steers\n'
const days = old.includes('\n# Replay') ? old.slice(0, old.indexOf('\n# Replay')) : old
const prior = old.includes('\n# Replay') ? old.slice(old.indexOf('\n# Replay')).replace(/^\n# Replay\n+(Each run[^\n]*\n+)?/, '') : ''
const section = [
  `## Run ${run.at.slice(0, 16).replace('T', ' ')} UTC · ${run.cases} cases × ${tries} tries · on the Max plan`,
  '',
  `With the rules ${run.with_rules.passed}/${run.with_rules.tries} (${pct(run.with_rules)}%), ${run.prevented} of ${run.cases} prevented. Without ${run.without_rules.passed}/${run.without_rules.tries} (${pct(run.without_rules)}%), ${run.prevented_without} of ${run.cases}. Lift ${pct(run.with_rules) - pct(run.without_rules)} points.`,
  '',
  '| case | source | with rules | without | why a with-rules try failed |',
  '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.source} | ${r.with.filter((x) => x.pass).length}/${tries} | ${r.without.filter((x) => x.pass).length}/${tries} | ${r.with.filter((x) => !x.pass).map((x) => x.why.replace(/\|/g, '/')).join(' · ')} |`),
  '',
].join('\n')
writeFileSync(f, `${days.trimEnd()}\n\n# Replay\n\nEach run replays every case (apps/venture/private/steer-cases/) to a fresh Claude Opus 5.5 with RULES.md and without; a case is prevented when 2 of 3 tries pass.\n\n${section}\n${prior}`)
console.log('stored in venture_state "steer_replay" and STEERS.md')

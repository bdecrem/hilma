#!/usr/bin/env node
// Before and after (OLA-480; Bart, voice call Nov 26: "10 tasks ... without this new stuff, and then
// with this new stuff ... what it produced ... how long it took ... make them progressively more
// demanding"). The new stuff: Ola's model can run its own tests (OLA-474), and Ola makes a test run
// for a request that computes and hands it to a bigger model after failed tests or loops (OLA-479).
//
// Ten requests, easy to hard, sent as chat in a cloud project the way a person sends them (the made-up
// account of evals/asks, on the website's own routes, its cards answered yes), three times each. After
// each run the project's files are copied out and judged by the checks that already exist for that
// request (evals/apps checks use the page like a person; evals/bigmodels scores the website, the data
// question and the bug). One line per run in ~/ola-before-after/results.jsonl.
//
//   node evals/before-after.mjs --arm without        before the two changes reach the machine
//   node evals/before-after.mjs --arm with           after
//   node evals/before-after.mjs --table              the two side by side
//   options: --only id,id   --tries 3   (an arm that was stopped carries on where it stopped)
//
// Run it on the machine whose Ola it measures, from a checkout, under nohup:
//   nohup node evals/before-after.mjs --arm without > ~/ola-before-after/without.log 2>&1 &
// On the Mac Studio it refuses to start a run unless Ola's own model is the one loaded
// (ops/studio/big-model.sh status). A run is cut at 20 minutes; a run that breaks is recorded as
// broken and the next one starts. It shares the asks' made-up account, so it takes the asks' run lock
// (waits while an asks run goes) and the machine's turn for each run.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { AI, ask, cloudTransport, emptyProject, inProject, liveRelease, newSession, prepareAccount, say, signIn, signOutAccount, stopProject, takeDownSites, takeRunLock } from './asks/lib.mjs'

const HERE = path.join(AI, 'evals')
const OUT = process.env.OLA_BA_HOME || path.join(homedir(), 'ola-before-after')
const RESULTS = path.join(OUT, 'results.jsonl')
const RUN_MIN = 20

// The ten, easy to hard. "shows" only shows things (the control: the new stuff must not slow them);
// "computes" is what the new stuff is for. The words are the existing lists', not copied here.
const REQUESTS = [
  { id: 'website', from: 'big', kind: 'shows' },
  { id: 'countdown', from: 'apps', kind: 'shows' },
  { id: 'tip-split', from: 'apps', kind: 'computes' },
  { id: 'unit-converter', from: 'apps', kind: 'computes' },
  { id: 'todo-due', from: 'apps', kind: 'computes' },
  { id: 'signup-sheet', from: 'apps', kind: 'computes' },
  { id: 'memory-game', from: 'apps', kind: 'computes' },
  { id: 'data', from: 'big', kind: 'computes' },
  { id: 'debug', from: 'big', kind: 'computes' },
  { id: 'spreadsheet', from: 'apps', kind: 'computes' },
]
const APPS = JSON.parse(readFileSync(path.join(HERE, 'apps/problems.json'), 'utf8'))
const BIG = JSON.parse(readFileSync(path.join(HERE, 'bigmodels/tasks.json'), 'utf8'))
for (const r of REQUESTS) {
  const src = (r.from === 'apps' ? APPS : BIG).find((p) => p.id === r.id)
  r.say = src.request
  r.files = src.files ? path.join(HERE, 'bigmodels/files', src.files) : null
}

// What counts as a test having run, and as Ola handing the request to a bigger model. Guesses until
// OLA-474 and OLA-479 land: adjust to the names they ship with before the `with` arm.
const TEST = /\bola-test\b|\bnode\s+[^|;]*\.(m?js|cjs)\b|\bnode\s+-e\b|\bpython3?\s|\bnpm\s+(run\s+)?test\b|\bpytest\b|\bplaywright\b|\bdeno\s+test\b/i
const ESCALATE = /escalat|bigger model|larger model|stronger model|ola-escalate/i

const args = process.argv.slice(2)
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const rows = () => (existsSync(RESULTS) ? readFileSync(RESULTS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

if (args.includes('--table')) table(), process.exit(0)
const ARM = arg('--arm', null)
if (!ARM) console.error('--arm without|with, or --table'), process.exit(2)
const TRIES = Number(arg('--tries', 3))
const ONLY = arg('--only', null)?.split(',')
const todo = REQUESTS.filter((r) => !ONLY || ONLY.includes(r.id))
if (ONLY && todo.length !== ONLY.length) console.error(`unknown request in --only (${REQUESTS.map((r) => r.id).join(', ')})`), process.exit(2)
mkdirSync(OUT, { recursive: true })

/** On the Studio (it has Ola's model as a service): Ola's own model, and no big one, or no run. */
function modelProblem() {
  if (!existsSync(path.join(homedir(), 'Library/LaunchAgents/cx.ola.model.plist'))) return null
  const r = spawnSync('/bin/zsh', [path.join(AI, 'ops/studio/big-model.sh'), 'status'], { encoding: 'utf8' })
  const out = `${r.stdout}${r.stderr}`
  return /no big model is running/.test(out) && /Ola's own model: loaded/.test(out) ? null : `the Studio is not on Ola's own model: ${out.trim().replace(/\s+/g, ' ')}`
}

// One asks-style run at a time on the made-up account: wait for the asks' lock.
while (!(await takeRunLock({ after: false }))) await new Promise((r) => setTimeout(r, 60_000))
const TURN = await import(path.join(AI, 'ops/turn.mjs'))
let signedIn = null
let password = null
let stopping = false
const finish = async (code) => {
  stopping = true
  if (password) {
    try {
      await takeDownSites()
      say(`cleanup: ${await signOutAccount()}`)
    } catch (e) {
      say(`cleanup FAILED: ${e.message}`)
    }
  }
  process.exit(code)
}
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => (say(`${s}: stopping; the next start of this arm carries on`), finish(3)))

const done = new Set(rows().filter((r) => r.arm === ARM).map((r) => `${r.id}#${r.try}`))
say(`before-after: arm ${ARM}, ${todo.length} requests x ${TRIES}, ${done.size} already done, against ${liveRelease()}`)
password = await prepareAccount()
// Round by round, so an arm cut short still has every request.
for (let t = 1; t <= TRIES; t++) {
  for (const r of todo) {
    if (stopping) break
    if (done.has(`${r.id}#${t}`)) continue
    const bad = modelProblem()
    if (bad) say(`STOP: ${bad}. Start this arm again once Ola's own model is back; it carries on.`), await finish(4)
    const held = await TURN.acquire({ label: `before-after ${ARM}`, on: (m) => say(`turn: ${m}`) })
    let row
    try {
      row = await Promise.race([one(r, t), new Promise((_, no) => setTimeout(() => no(new Error(`no end after ${RUN_MIN + 5} min`)), (RUN_MIN + 5) * 60_000))])
    } catch (e) {
      row = { broken: String(e.message).slice(0, 300) }
      signedIn = null // sign in again before the next run, in case that was the fault
    }
    held.release()
    row = { at: new Date().toISOString(), arm: ARM, id: r.id, kind: r.kind, try: t, release: liveRelease(), ...row }
    appendFileSync(RESULTS, JSON.stringify(row) + '\n')
    say(`${row.broken ? 'BROKEN' : row.works ? 'works ' : 'fails '} ${r.id} #${t}: ${row.broken ?? `${row.secs} s, ${row.steps} steps, test ${row.tested ? 'ran' : 'did not run'}, ${row.escalated ? 'escalated' : 'no escalation'}, ${row.score}`}`)
    try {
      await takeDownSites()
    } catch {}
  }
}
await stopProject().catch(() => {})
say(`before-after: arm ${ARM} done. node evals/before-after.mjs --table`)
await finish(0)

async function one(r, t) {
  signedIn ??= await signIn(password)
  const T = cloudTransport(signedIn)
  await emptyProject()
  if (r.files) for (const f of ['members.csv', 'formula.mjs', 'SPEC.md'].filter((f) => existsSync(path.join(r.files, f)))) await T.wrote(f, { text: readFileSync(path.join(r.files, f), 'utf8') })
  const sid = await newSession(T, `before-after ${r.id} ${t}`)
  const end = Date.now() + RUN_MIN * 60_000
  const t0 = Date.now()
  const turns = []
  let turn = await ask(T, sid, r.say, end - Date.now())
  turns.push(turn)
  // Ola ends on a question: the person says yes (twice at most), as the asks do.
  for (let i = 0; i < 2 && turn.status === 'done' && endsOnQuestion(turn.texts.at(-1) ?? '') && Date.now() < end; i++) turns.push((turn = await ask(T, sid, 'Yes, go ahead.', end - Date.now())))
  const secs = Math.round((Date.now() - t0) / 1000)
  const steps = turns.flatMap((x) => x.tools.map((s) => `${s.name}: ${String(s.input).slice(0, 300)}`))
  const said = turns.flatMap((x) => [...x.texts, ...(x.answered ?? [])]).join('\n')
  // What it produced, kept, and judged by the request's own check.
  const dir = path.join(OUT, ARM, `${r.id}-${t}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(path.join(dir, 'files'), { recursive: true })
  const tar = await inProject("cd /work && tar -cf - --exclude ./.ola --exclude './project.db*' --exclude node_modules . | base64")
  const x = spawnSync('/usr/bin/tar', ['-xf', '-', '-C', path.join(dir, 'files')], { input: Buffer.from(tar.replace(/\s+/g, ''), 'base64') })
  if (x.status !== 0) throw new Error(`copying the project's files out: ${String(x.stderr).slice(0, 200)}`)
  writeFileSync(path.join(dir, 'conversation.json'), JSON.stringify({ request: r.say, turns }, null, 2))
  const s = score(r, path.join(dir, 'files'))
  return {
    secs,
    end: turn.status === 'timeout' ? `cut at ${RUN_MIN} min` : turn.status,
    steps: steps.length,
    tested: steps.some((s) => TEST.test(s)),
    escalated: ESCALATE.test(steps.join('\n')) || ESCALATE.test(said),
    works: turn.status === 'done' && s.works,
    score: s.line,
    answer: (turn.texts.at(-1) ?? '').slice(0, 400),
    dir,
  }
}

function score(r, folder) {
  const node = (argv) => spawnSync(process.execPath, argv, { cwd: AI, encoding: 'utf8', timeout: 300_000, maxBuffer: 64 << 20 })
  if (r.from === 'apps') {
    const o = node([path.join(HERE, 'apps/run.mjs'), 'check', r.id, folder])
    try {
      const j = JSON.parse(o.stdout)
      const failed = j.checks.filter((c) => !c.pass).map((c) => c.name)
      return { works: !failed.length, line: `${j.checks.length - failed.length}/${j.checks.length}${failed.length ? ` (not: ${failed.join(', ')})` : ''}` }
    } catch {
      return { works: false, line: `the check did not run: ${(o.stderr || o.stdout || '').trim().slice(-200)}` }
    }
  }
  const o = node([path.join(HERE, 'bigmodels/run.mjs'), '--score', r.id, '--folder', folder])
  const m = new RegExp(`^${r.id}: (\\d+)/(\\d+) (\\[.*?\\]) \\[`, 'm').exec(o.stdout)
  if (!m) return { works: false, line: `the scorer did not run: ${(o.stderr || o.stdout || '').trim().slice(-200)}` }
  const failed = JSON.parse(m[3])
  return { works: m[1] === m[2], line: `${m[1]}/${m[2]}${failed.length ? ` (not: ${failed.join(', ')})` : ''}` }
}

function endsOnQuestion(t) {
  return /\?\s*\**\s*$/.test(t.trim()) || /\b(shall i|should i|do you want me to|would you like me to|want me to|ready to publish)\b/i.test(t.slice(-300))
}

function table() {
  const all = rows()
  const arms = ['without', 'with', ...new Set(all.map((r) => r.arm).filter((a) => a !== 'without' && a !== 'with'))].filter((a) => all.some((r) => r.arm === a))
  if (!arms.length) return console.log(`no runs yet (${RESULTS})`)
  const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null)
  const time = (s) => (s == null ? '-' : s < 90 ? `${s} s` : `${(s / 60).toFixed(1)} min`)
  const cell = (rs) => {
    const ran = rs.filter((r) => !r.broken)
    if (!rs.length) return 'not run'
    const b = rs.length - ran.length
    return `${ran.filter((r) => r.works).length} of ${ran.length} work, ${time(median(ran.map((r) => r.secs)))}${b ? `, ${b} broke` : ''}`
  }
  const W = 34
  console.log(['request'.padEnd(26), ...arms.map((a) => a.padEnd(W))].join(' '))
  for (const q of REQUESTS) console.log([`${q.id} (${q.kind})`.padEnd(26), ...arms.map((a) => cell(all.filter((r) => r.arm === a && r.id === q.id)).padEnd(W))].join(' '))
  const tot = (a) => {
    const rs = all.filter((r) => r.arm === a && !r.broken)
    const secs = rs.reduce((s, r) => s + r.secs, 0)
    return `${rs.filter((r) => r.works).length} of ${rs.length} work, ${Math.round(secs / 60)} min in all`
  }
  console.log(['total'.padEnd(26), ...arms.map((a) => tot(a).padEnd(W))].join(' '))
  const extra = (a) => {
    const rs = all.filter((r) => r.arm === a && !r.broken)
    return `tests ran ${rs.filter((r) => r.tested).length}, escalated ${rs.filter((r) => r.escalated).length}`
  }
  console.log([''.padEnd(26), ...arms.map((a) => extra(a).padEnd(W))].join(' '))
  console.log(`\nOne line per run: ${RESULTS}; what each run made: ${OUT}/<arm>/<request>-<try>/files`)
}

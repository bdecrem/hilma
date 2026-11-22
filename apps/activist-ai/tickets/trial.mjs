#!/usr/bin/env node
// The ticket model trial (OLA-300): each candidate model redoes a closed ticket of ours from the
// commit before it, and the ticket's own tests decide. Bart, Nov 20: pick the model on Together
// "by measuring on our own tickets"; "performance is the only criteria".
//
//   node apps/activist-ai/tickets/trial.mjs --models kimi-k3.1-pro,glm-5.3 [--cases ola-324-clock,...]
//        --max-usd <ceiling> [--run-usd 10] [--time 1800] [--tokens 4000000] [--concurrency 4]   (gateway.sh <the same models> first)
//   node apps/activist-ai/tickets/trial.mjs --report
//
// One run: the repo exported at <commit>^ into ~/ola-trials/runs/<case>-<model>-<stamp>/work (a
// plain folder with its own git, no link to this checkout), the ticket's test files from <commit>
// put in place, opencode 2.3.0 (`run --auto`) given the request, talking only to the ticket lane's
// gateway (gateway.sh). It runs under sandbox-exec: no reading or writing in the home folder outside
// its run folder and the node_modules it needs, no network but loopback, so no secret on this
// machine is in reach. After it stops, the test files are restored from <commit> (an edit to a test
// never counts), the tests run in the same sandbox, and one line goes to ~/ola-trials/results.jsonl.
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { here, repo, root, nmRoot, nmOla, MODELS as LISTED, MIN_FREE_GB, sh, freeGb, runFolders, opencodeConfig, runOpencode, runTest, gatewayToken, cost as priced, LEAN } from './lib.mjs'

const results = path.join(root, 'results.jsonl')
// --pieces (OLA-370): the case cut into pieces by a planner (pieces/pieces.mjs), each run in order on one
// working tree, each followed by its own check; then the ticket's tests. --repeat n: each run n times.
const { PIECES } = await import('./pieces/pieces.mjs')

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return a
}, []))
const MODELS = { ...LISTED, reference: { id: 'the real commit', in: 0, out: 0 }, empty: { id: 'no change', in: 0, out: 0 } }
const CASES = JSON.parse(readFileSync(path.join(here, 'cases.json'), 'utf8'))

if (args.report) { report(); process.exit(0) }

const models = String(args.models || '').split(',').filter(Boolean)
for (const m of models) if (!MODELS[m] || m.startsWith('_')) { console.error(`unknown model ${m}`); process.exit(2) }
if (!models.length) { console.error('--models a,b required'); process.exit(2) }
const cases = args.cases ? String(args.cases).split(',').map((id) => CASES.find((c) => c.id === id) || die(`unknown case ${id}`)) : CASES
const timeLimit = Number(args.time || 1800)
const tokenLimit = Number(args.tokens || 4000000)
const concurrency = Number(args.concurrency || 4)
// The worst case is said and capped before anything runs: on Nov 21 a trial of 12 runs at 3M tokens
// spent about $45 and took the Together account past its credit limit, and Ola's models stopped.
// Each run also stops itself at --run-usd (default 10, lib.mjs overLimit), so a run's worst case is
// the smaller of that and its tokens at the dearer of the two prices.
const runUsd = Number(args['run-usd'] || 10)
// --lean (OLA-356): the ticket-work configuration that reads parts of files (lib.mjs leanConfig).
const lean = args.lean === true
const piecesMode = args.pieces === true
const repeat = Number(args.repeat || 1)
let started = 0
if (piecesMode) for (const c of cases) if (!PIECES[c.id]) die(`case ${c.id} has no pieces in pieces/pieces.mjs`)
// --steps n (with --lean, OLA-370): the step cap instead of 60; the row records it.
const steps = args.steps ? Number(args.steps) : null
if (steps && (!lean || !(steps > 0))) die('--steps needs --lean and a positive number')
const paid = models.filter((m) => LISTED[m])
const worst = repeat * cases.length * paid.reduce((a, m) => a + Math.min(runUsd, tokenLimit * Math.max(MODELS[m].in, MODELS[m].out) / 1e6), 0)
if (paid.length) {
  const cap = Number(args['max-usd'])
  if (!cap) die(`--max-usd is required: these ${cases.length * paid.length} runs can cost up to $${worst.toFixed(2)} (each stops at ${tokenLimit.toLocaleString()} tokens or $${runUsd})`)
  if (worst > cap) die(`these runs can cost up to $${worst.toFixed(2)}, over --max-usd ${cap}: fewer models or cases, or a smaller --tokens`)
  console.log(`worst case $${worst.toFixed(2)} of Together use (ceiling $${cap})`)
}
const gwToken = models.every((m) => m === 'reference' || m === 'empty') ? '' : gatewayToken()
function die(m) { console.error(m); process.exit(2) }

function prepare(c, model) {
  const free = freeGb()
  if (free < MIN_FREE_GB) throw new Error(`only ${free.toFixed(1)} GB free on this disk; a run needs ${MIN_FREE_GB} (nothing started)`)
  if (!c.paths?.length) throw new Error(`case ${c.id} has no paths: a run copies only the folders its ticket needs`)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  // --repeat starts runs in the same second: each gets its own folder (OLA-370)
  const run = runFolders(path.join(root, 'runs', `${c.id}-${model}-${stamp}${repeat > 1 ? `-${++started}` : ''}`))
  const { work } = run
  // Only the folders the ticket needs (cases.json `paths`): a whole copy of the repo is gigabytes,
  // and twelve of them filled the mini's disk on Nov 21.
  sh(`git -C ${JSON.stringify(repo)} archive ${c.base || `${c.commit}^`} -- ${c.paths.map((x) => `'${x}'`).join(' ')} | tar -x -C ${JSON.stringify(work)}`)
  for (const f of c.give) sh(`git -C ${JSON.stringify(repo)} show ${c.commit}:${f} > ${JSON.stringify(path.join(work, f))}`)
  symlinkSync(nmRoot, path.join(work, 'node_modules'))
  if (existsSync(path.join(work, 'apps/activist-ai'))) symlinkSync(nmOla, path.join(work, 'apps/activist-ai/node_modules'))
  writeFileSync(path.join(work, '.gitignore'), 'node_modules\n', { flag: 'a' })
  if (piecesMode) putPieceFiles(c, work)
  sh('git init -q && git add -A && git commit -qm base', work)
  if (LISTED[model]) writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(model, { lean, steps }), null, 2))
  else writeFileSync(path.join(work, 'opencode.jsonc'), '{}')
  // Tagged: change.diff and changes.txt are `git diff config`, and a commit message is not a ref
  // (before OLA-356 every change.diff came out empty).
  sh('git add opencode.jsonc .gitignore && git commit -qm config && git tag config', work)
  return run
}

// The check files a case's pieces name, in <work>/.pieces/ (put back before each check, as the given tests are).
function putPieceFiles(c, work) {
  mkdirSync(path.join(work, '.pieces'), { recursive: true })
  for (const p of PIECES[c.id]) for (const f of p.files) writeFileSync(path.join(work, '.pieces', f), readFileSync(path.join(here, 'pieces', f)))
}

function pieceInstruction(c, p, i) {
  return `Ticket ${c.ticket}, piece ${i + 1} of ${PIECES[c.id].length}: ${p.title}.\n\n${p.text}\n\nThe piece is fully specified: go straight to the lines named, make the change, then check it with: ${p.check}\n` +
    `Do not change the ticket's tests (${c.give.join(', ')}) or anything in .pieces/. ${LEAN.reading} Work only in this folder. When the check passes, commit your change with git and say in one sentence what you changed.`
}

// The pieces in order on one tree, each followed by its own check; the run's dollar stop covers them all.
async function runPieces(run, c, model) {
  const tot = { end: 'done', requests: 0, tokens_in: 0, tokens_cached: 0, tokens_out: 0, tools: 0, tool_errors: 0, pieces: [] }
  for (const [i, p] of PIECES[c.id].entries()) {
    const t0 = Date.now()
    const left = runUsd - (LISTED[model] ? priced(model, tot) : 0)
    let s = { end: 'done', requests: 0, tokens_in: 0, tokens_cached: 0, tokens_out: 0, tools: 0, tool_errors: 0 }
    if (LISTED[model] && left <= 0) s.end = 'usd_limit'
    else if (LISTED[model]) s = await runOpencode(run, pieceInstruction(c, p, i), { timeLimit, tokenLimit, usdLimit: left, model, token: gwToken, lean })
    for (const k of ['requests', 'tokens_in', 'tokens_cached', 'tokens_out', 'tools', 'tool_errors']) tot[k] += s[k] || 0
    putPieceFiles(c, run.work)
    for (const f of c.give) sh(`git -C ${JSON.stringify(repo)} show ${c.commit}:${f} > ${JSON.stringify(path.join(run.work, f))}`)
    let edited = ''
    try { edited = sh('git add -A >/dev/null 2>&1; git diff --cached --shortstat config', run.work).trim() } catch {}
    const t = await runTest(run, `piece${i + 1}`, p.check)
    const row = { piece: i + 1, title: p.title, end: s.end, requests: s.requests, tokens_in: s.tokens_in, tokens_cached: s.tokens_cached || 0, tokens_out: s.tokens_out,
      cost_usd: LISTED[model] ? priced(model, s) : 0, minutes: +((Date.now() - t0) / 60000).toFixed(1), check: t.exit === 0, edited, final: (s.final || '').slice(0, 300) }
    tot.pieces.push(row)
    console.log(`  piece ${i + 1} ${c.id} on ${model}: check ${row.check ? 'PASS' : 'FAIL'}; ${s.end}, ${row.requests} calls, ${row.minutes} min, $${row.cost_usd}; tree vs base: ${edited || 'no change'}`)
    if (s.end === 'usd_limit' || s.end === 'token_limit') tot.end = s.end
  }
  return tot
}

function instruction(c) {
  return `${c.request}\n\nThe ticket's tests are already in place: ${c.give.join(', ')}. Make them pass without changing them, and keep the code's existing tests passing. ` +
    `Run them yourself: ${c.tests.map((t) => t.cmd).join('; ')}. ${lean ? LEAN.reading : 'Read the CLAUDE.md of each folder you touch first.'} ` +
    `Work only in this folder. When it is done, commit your change with git and say in two sentences what you changed.`
}

async function runTests(run, c) {
  // An edit to a given test never counts: they are put back from the real commit first.
  for (const f of c.give) sh(`git -C ${JSON.stringify(repo)} show ${c.commit}:${f} > ${JSON.stringify(path.join(run.work, f))}`)
  const res = []
  for (const t of c.tests) { const { name, exit, pass, total } = await runTest(run, t.name, t.cmd); res.push({ name, exit, pass, total }) }
  return res
}

async function one(c, model) {
  const run = prepare(c, model)
  const t0 = Date.now()
  console.log(`start ${c.id} on ${model} in ${path.relative(root, run.dir)}`)
  let s = model === 'reference' ? (sh(`git -C ${JSON.stringify(repo)} diff ${c.base || `${c.commit}^`} ${c.commit} -- ${c.paths.map((x) => `'${x}'`).join(' ')} ${c.give.map((f) => `':!${f}'`).join(' ')} | git apply --whitespace=nowarn`, run.work), { end: 'done', requests: 0, tokens_in: 0, tokens_out: 0, tools: 0, tool_errors: 0 })
    : piecesMode && LISTED[model] ? await runPieces(run, c, model)
    : model === 'empty' ? { end: 'done', requests: 0, tokens_in: 0, tokens_out: 0, tools: 0, tool_errors: 0 } : await runOpencode(run, instruction(c), { timeLimit, tokenLimit, usdLimit: runUsd, model, token: gwToken, lean })
  // Reference and empty in pieces mode: every piece's check after the real change, or after none (proves the checks).
  if (piecesMode && !LISTED[model]) s = { ...s, pieces: (await runPieces(run, c, model)).pieces }
  const minutes = +((Date.now() - t0) / 60000).toFixed(1)
  let diff = ''
  try { diff = sh('git add -A >/dev/null 2>&1; git diff --cached --shortstat HEAD~0 2>/dev/null; git diff --shortstat 2>/dev/null; git log --oneline config..HEAD 2>/dev/null | wc -l', run.work) } catch {}
  try { sh('git add -A && git diff --cached --stat > ../changes-uncommitted.txt; git diff config..HEAD --stat > ../changes.txt; git diff config > ../change.diff', run.work) } catch {}
  const tests = await runTests(run, c)
  const m = MODELS[model]
  const cost = LISTED[model] ? priced(model, s) : 0
  const passed = tests.every((t) => t.exit === 0 && t.total > 0 && t.pass === t.total)
  const row = { at: new Date().toISOString(), case: c.id, ticket: c.ticket, level: c.level, model, model_id: m.id, passed, tests, end: s.end, error: s.error, minutes,
    requests: s.requests, tokens_in: s.tokens_in, tokens_cached: s.tokens_cached || 0, tokens_out: s.tokens_out, lean, steps: lean ? steps || LEAN.config.agents.build.steps : null, cost_usd: cost, tools: s.tools, tool_errors: s.tool_errors, dir: path.relative(root, run.dir), ...(piecesMode ? { mode: 'pieces', pieces: s.pieces } : {}) }
  // The self-test rows (reference, empty) go apart; a free model (Recursive Flint, OLA-370) is a real run.
  if (!LISTED[model]) appendFileSync(path.join(root, 'selftest.jsonl'), JSON.stringify(row) + '\n')
  else appendFileSync(results, JSON.stringify(row) + '\n')
  console.log(`${passed ? 'PASS' : 'FAIL'} ${c.id} on ${model}: ${tests.map((t) => `${t.name} ${t.pass}/${t.total}`).join(', ')}; ${s.end}, ${minutes} min, ${(s.tokens_in / 1e6).toFixed(2)}M in + ${((s.tokens_cached || 0) / 1e6).toFixed(2)}M cached, $${cost}`)
}

function report() {
  if (!existsSync(results)) return console.log('no results yet')
  const rows = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const by = {}
  for (const r of rows) (by[r.model] ||= []).push(r)
  for (const [m, rs] of Object.entries(by)) {
    const p = rs.filter((r) => r.passed).length
    const cost = rs.reduce((a, r) => a + r.cost_usd, 0), min = rs.reduce((a, r) => a + r.minutes, 0)
    console.log(`${m}: ${p} of ${rs.length} passed, $${cost.toFixed(2)}, ${min.toFixed(0)} min`)
    for (const r of rs) console.log(`   ${r.passed ? 'pass' : 'FAIL'} ${r.case} ${r.tests.map((t) => `${t.pass}/${t.total}`).join(' ')} ${r.end} ${r.minutes} min $${r.cost_usd}`)
  }
}

const queue = []
for (const c of cases) for (const m of models) for (let k = 0; k < repeat; k++) queue.push([c, m])
const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) { const [c, m] = queue.shift(); try { await one(c, m) } catch (e) { console.error(`error ${c.id} on ${m}: ${e.message}`) } }
})
await Promise.all(workers)
report()

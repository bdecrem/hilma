#!/usr/bin/env node
// The ticket model trial (OLA-300): each candidate model redoes a closed ticket of ours from the
// commit before it, and the ticket's own tests decide. Bart, Nov 20: pick the model on Together
// "by measuring on our own tickets"; "performance is the only criteria".
//
//   node apps/activist-ai/tickets/trial.mjs --models kimi-k3.1-pro,glm-5.3 [--cases ola-324-clock,...]
//        [--time 1800] [--tokens 4000000] [--concurrency 4]   (gateway.sh <the same models> first)
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
import { here, repo, root, nmRoot, nmOla, MODELS as LISTED, MIN_FREE_GB, sh, freeGb, runFolders, opencodeConfig, sandboxed, runOpencode, gatewayToken } from './lib.mjs'

const results = path.join(root, 'results.jsonl')

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
const gwToken = models.every((m) => m === 'reference' || m === 'empty') ? '' : gatewayToken()
function die(m) { console.error(m); process.exit(2) }

function prepare(c, model) {
  const free = freeGb()
  if (free < MIN_FREE_GB) throw new Error(`only ${free.toFixed(1)} GB free on this disk; a run needs ${MIN_FREE_GB} (nothing started)`)
  if (!c.paths?.length) throw new Error(`case ${c.id} has no paths: a run copies only the folders its ticket needs`)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const run = runFolders(path.join(root, 'runs', `${c.id}-${model}-${stamp}`))
  const { work } = run
  // Only the folders the ticket needs (cases.json `paths`): a whole copy of the repo is gigabytes,
  // and twelve of them filled the mini's disk on Nov 21.
  sh(`git -C ${JSON.stringify(repo)} archive ${c.commit}^ -- ${c.paths.map((x) => `'${x}'`).join(' ')} | tar -x -C ${JSON.stringify(work)}`)
  for (const f of c.give) sh(`git -C ${JSON.stringify(repo)} show ${c.commit}:${f} > ${JSON.stringify(path.join(work, f))}`)
  symlinkSync(nmRoot, path.join(work, 'node_modules'))
  if (existsSync(path.join(work, 'apps/activist-ai'))) symlinkSync(nmOla, path.join(work, 'apps/activist-ai/node_modules'))
  writeFileSync(path.join(work, '.gitignore'), 'node_modules\n', { flag: 'a' })
  sh('git init -q && git add -A && git commit -qm base', work)
  if (LISTED[model]) writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(model), null, 2))
  else writeFileSync(path.join(work, 'opencode.jsonc'), '{}')
  sh('git add opencode.jsonc .gitignore && git commit -qm config', work)
  return run
}

function instruction(c) {
  return `${c.request}\n\nThe ticket's tests are already in place: ${c.give.join(', ')}. Make them pass without changing them, and keep the code's existing tests passing. ` +
    `Run them yourself: ${c.tests.map((t) => t.cmd).join('; ')}. Read the CLAUDE.md of each folder you touch first. ` +
    `Work only in this folder. When it is done, commit your change with git and say in two sentences what you changed.`
}

async function runTests(run, c) {
  // An edit to a given test never counts: they are put back from the real commit first.
  for (const f of c.give) sh(`git -C ${JSON.stringify(repo)} show ${c.commit}:${f} > ${JSON.stringify(path.join(run.work, f))}`)
  const res = []
  for (const t of c.tests) {
    const child = sandboxed(run, ['/bin/sh', '-c', t.cmd])
    let o = ''
    child.stdout.on('data', (d) => { o += d }); child.stderr.on('data', (d) => { o += d })
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 600000)
    const code = await new Promise((r) => child.on('close', r))
    clearTimeout(timer)
    writeFileSync(path.join(run.dir, `test-${t.name}.txt`), o)
    let pass = null, total = null
    const nt = o.match(/ℹ tests (\d+)[\s\S]*?ℹ pass (\d+)/)
    if (nt) { total = +nt[1]; pass = +nt[2] }
    else { const ok = (o.match(/^ok /gm) || []).length, bad = (o.match(/^(not ok|FAIL|✗)/gm) || []).length; pass = ok; total = ok + bad }
    res.push({ name: t.name, exit: code, pass, total })
  }
  return res
}

async function one(c, model) {
  const run = prepare(c, model)
  const t0 = Date.now()
  console.log(`start ${c.id} on ${model} in ${path.relative(root, run.dir)}`)
  const s = model === 'reference' ? (sh(`git -C ${JSON.stringify(repo)} diff ${c.commit}^ ${c.commit} -- . ${c.give.map((f) => `':!${f}'`).join(' ')} | git apply --whitespace=nowarn`, run.work), { end: 'done', requests: 0, tokens_in: 0, tokens_out: 0, tools: 0, tool_errors: 0 })
    : model === 'empty' ? { end: 'done', requests: 0, tokens_in: 0, tokens_out: 0, tools: 0, tool_errors: 0 } : await runOpencode(run, instruction(c), { timeLimit, tokenLimit, token: gwToken })
  const minutes = +((Date.now() - t0) / 60000).toFixed(1)
  let diff = ''
  try { diff = sh('git add -A >/dev/null 2>&1; git diff --cached --shortstat HEAD~0 2>/dev/null; git diff --shortstat 2>/dev/null; git log --oneline config..HEAD 2>/dev/null | wc -l', run.work) } catch {}
  try { sh('git add -A && git diff --cached --stat > ../changes-uncommitted.txt; git diff config..HEAD --stat > ../changes.txt; git diff config > ../change.diff', run.work) } catch {}
  const tests = await runTests(run, c)
  const m = MODELS[model]
  const cost = +((s.tokens_in * m.in + s.tokens_out * m.out) / 1e6).toFixed(2)
  const passed = tests.every((t) => t.exit === 0 && t.total > 0 && t.pass === t.total)
  const row = { at: new Date().toISOString(), case: c.id, ticket: c.ticket, level: c.level, model, model_id: m.id, passed, tests, end: s.end, error: s.error, minutes,
    requests: s.requests, tokens_in: s.tokens_in, tokens_out: s.tokens_out, cost_usd: cost, tools: s.tools, tool_errors: s.tool_errors, dir: path.relative(root, run.dir) }
  if (!MODELS[model].in && !MODELS[model].out) appendFileSync(path.join(root, 'selftest.jsonl'), JSON.stringify(row) + '\n')
  else appendFileSync(results, JSON.stringify(row) + '\n')
  console.log(`${passed ? 'PASS' : 'FAIL'} ${c.id} on ${model}: ${tests.map((t) => `${t.name} ${t.pass}/${t.total}`).join(', ')}; ${s.end}, ${minutes} min, ${(s.tokens_in / 1e6).toFixed(2)}M in, $${cost}`)
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
for (const c of cases) for (const m of models) queue.push([c, m])
const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) { const [c, m] = queue.shift(); try { await one(c, m) } catch (e) { console.error(`error ${c.id} on ${m}: ${e.message}`) } }
})
await Promise.all(workers)
report()

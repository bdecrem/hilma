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
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync, createWriteStream, symlinkSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

const here = path.dirname(new URL(import.meta.url).pathname)
const repo = path.resolve(here, '../../..')
const root = path.join(homedir(), 'ola-trials')
const opencodeBin = path.join(repo, 'apps/activist-ai/node_modules/@opencode/cli/bin/opencode.exe')
const nmRoot = path.join(repo, 'node_modules')
const nmOla = path.join(repo, 'apps/activist-ai/node_modules')
const results = path.join(root, 'results.jsonl')

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return a
}, []))
const MODELS = { ...JSON.parse(readFileSync(path.join(here, 'models.json'), 'utf8')), reference: { id: 'the real commit', in: 0, out: 0 }, empty: { id: 'no change', in: 0, out: 0 } }
const CASES = JSON.parse(readFileSync(path.join(here, 'cases.json'), 'utf8'))

if (args.report) { report(); process.exit(0) }

const models = String(args.models || '').split(',').filter(Boolean)
for (const m of models) if (!MODELS[m] || m.startsWith('_')) { console.error(`unknown model ${m}`); process.exit(2) }
if (!models.length) { console.error('--models a,b required'); process.exit(2) }
const cases = args.cases ? String(args.cases).split(',').map((id) => CASES.find((c) => c.id === id) || die(`unknown case ${id}`)) : CASES
const timeLimit = Number(args.time || 1800)
const tokenLimit = Number(args.tokens || 4000000)
const concurrency = Number(args.concurrency || 4)
const portOf = (model) => 4460 + Object.keys(MODELS).filter((k) => !k.startsWith('_')).indexOf(model)
const tokenFile = path.join(root, '.gw/token')
if (!existsSync(tokenFile)) die('no gateway token: start apps/activist-ai/tickets/gateway.sh first')
const gwToken = readFileSync(tokenFile, 'utf8').trim()

function die(m) { console.error(m); process.exit(2) }
const sh = (cmd, cwd) => execFileSync('/bin/sh', ['-c', cmd], { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString()

// The sandbox: everything under the home folder is out of reach except the run folder and the two
// node_modules (read only); outbound network only to loopback (the gateway).
function profile(runDir) {
  const q = (p) => JSON.stringify(p)
  return `(version 1)
(allow default)
(deny file-read* file-write* (subpath ${q(homedir())}))
(allow file-read* (literal ${q(homedir())}) (subpath ${q(nmRoot)}) (subpath ${q(nmOla)}) (subpath ${q(runDir)}))
(allow file-read-metadata (subpath ${q(homedir())}))
(allow file-write* (subpath ${q(runDir)}))
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*") (remote unix-socket))
`
}

// TMPDIR is short and outside the home folder: unix sockets the tests make must fit in 104 bytes.
function isolatedEnv(home, extra) {
  const tmp = mkdtempSync('/tmp/olt-')
  return { PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin', HOME: home, TMPDIR: tmp, XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local/share'), XDG_STATE_HOME: path.join(home, '.local/state'), XDG_CACHE_HOME: path.join(home, '.cache'),
    LANG: 'en_US.UTF-8', BROWSER: '/usr/bin/true', GIT_AUTHOR_NAME: 'ola', GIT_AUTHOR_EMAIL: 'ola@localhost', GIT_COMMITTER_NAME: 'ola', GIT_COMMITTER_EMAIL: 'ola@localhost', ...extra }
}

const MIN_FREE_GB = 10
function freeGb() { return Number(sh(`df -k ${JSON.stringify(homedir())} | tail -1 | awk '{print $4}'`).trim()) / 1048576 }

function prepare(c, model) {
  const free = freeGb()
  if (free < MIN_FREE_GB) throw new Error(`only ${free.toFixed(1)} GB free on this disk; a run needs ${MIN_FREE_GB} (nothing started)`)
  if (!c.paths?.length) throw new Error(`case ${c.id} has no paths: a run copies only the folders its ticket needs`)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(root, 'runs', `${c.id}-${model}-${stamp}`)
  const work = path.join(dir, 'work'), home = path.join(dir, 'home')
  for (const d of [work, path.join(home, 'tmp'), path.join(home, 'bin')]) mkdirSync(d, { recursive: true })
  // Only the folders the ticket needs (cases.json `paths`): a whole copy of the repo is gigabytes,
  // and twelve of them filled the mini's disk on Nov 21.
  sh(`git -C ${JSON.stringify(repo)} archive ${c.commit}^ -- ${c.paths.map((x) => `'${x}'`).join(' ')} | tar -x -C ${JSON.stringify(work)}`)
  for (const f of c.give) sh(`git -C ${JSON.stringify(repo)} show ${c.commit}:${f} > ${JSON.stringify(path.join(work, f))}`)
  symlinkSync(nmRoot, path.join(work, 'node_modules'))
  if (existsSync(path.join(work, 'apps/activist-ai'))) symlinkSync(nmOla, path.join(work, 'apps/activist-ai/node_modules'))
  writeFileSync(path.join(work, '.gitignore'), 'node_modules\n', { flag: 'a' })
  // Do-nothing stand-ins so nothing the model runs opens a window (rule 46).
  for (const b of ['open', 'osascript']) writeFileSync(path.join(home, 'bin', b), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  sh('git init -q && git add -A && git commit -qm base', work)
  const m = MODELS[model]
  writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    providers: { box: { name: 'Ola tickets', env: ['BOX_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: `http://127.0.0.1:${portOf(model)}/v1` },
      models: { m: { modelID: 'code', name: model, capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: m.context || 200000, output: 32000 } } } } },
    model: 'box/m', update: 'disable',
    permissions: [{ action: '*', resource: '*', effect: 'allow' }, { action: 'webfetch', resource: '*', effect: 'deny' }, { action: 'websearch', resource: '*', effect: 'deny' }, { action: 'external_directory', resource: '*', effect: 'deny' }],
  }, null, 2))
  sh('git add opencode.jsonc .gitignore && git commit -qm config', work)
  writeFileSync(path.join(dir, 'sandbox.sb'), profile(dir))
  return { dir, work, home }
}

function instruction(c) {
  return `${c.request}\n\nThe ticket's tests are already in place: ${c.give.join(', ')}. Make them pass without changing them, and keep the code's existing tests passing. ` +
    `Run them yourself: ${c.tests.map((t) => t.cmd).join('; ')}. Read the CLAUDE.md of each folder you touch first. ` +
    `Work only in this folder. When it is done, commit your change with git and say in two sentences what you changed.`
}

function sandboxed(run, argv, extra = {}) {
  return spawn('/usr/bin/sandbox-exec', ['-f', path.join(run.dir, 'sandbox.sb'), ...argv],
    { cwd: run.work, env: isolatedEnv(run.home, { PATH: `${path.join(run.home, 'bin')}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`, ...extra }), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
}

async function runModel(run, c, model) {
  const s = { requests: 0, tokens_in: 0, tokens_out: 0, end: 'done', final: '', tools: 0, tool_errors: 0 }
  const out = createWriteStream(path.join(run.dir, 'events.jsonl'))
  const child = sandboxed(run, [opencodeBin, 'run', '--standalone', '--auto', '--format', 'json', '--model', 'box/m', instruction(c)], { BOX_API_KEY: gwToken })
  const kill = (why) => { if (s.end === 'done') s.end = why; try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  const timer = setTimeout(() => kill('timeout'), timeLimit * 1000)
  let buf = '', err = '', texts = []
  child.stderr.on('data', (d) => { err = (err + d).slice(-20000) })
  child.stdout.on('data', (d) => {
    out.write(d); buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      let e; try { e = JSON.parse(line) } catch { continue }
      const p = e.part || {}
      if (e.type === 'step_finish') {
        s.requests++; s.tokens_in += p.tokens?.input || 0; s.tokens_out += (p.tokens?.output || 0) + (p.tokens?.reasoning || 0)
        if (s.tokens_in + s.tokens_out > tokenLimit) kill('token_limit')
      } else if (e.type === 'step_start') texts = []
      else if (e.type === 'text' && p.text) texts.push(p.text)
      else if (e.type === 'tool_use') { s.tools++; if (p.state?.status === 'error') s.tool_errors++ }
      else if (e.type === 'error') s.error = String(e.error?.name || 'error').slice(0, 60)
      if (texts.length) s.final = texts.join('\n').slice(0, 2000)
    }
  })
  const code = await new Promise((r) => child.on('close', r))
  clearTimeout(timer); out.end()
  writeFileSync(path.join(run.dir, 'stderr.txt'), err)
  if (s.end === 'done' && code !== 0) s.end = s.requests ? 'model_error' : 'harness_error'
  return s
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
    : model === 'empty' ? { end: 'done', requests: 0, tokens_in: 0, tokens_out: 0, tools: 0, tool_errors: 0 } : await runModel(run, c, model)
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

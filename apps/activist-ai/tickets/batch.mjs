#!/usr/bin/env node
// A batch of tracker bugs, run through the whole chain (OLA-520; Bart, Nov 27: "Here's a batch of ten P1s.
// Write tests for two of them" ... "I wanna start making a system that we can run").
//
//   1. pick (on a machine where the tracker works):
//        node apps/activist-ai/tickets/batch.mjs pick                      the next open P1s, oldest first, not seen before
//        node apps/activist-ai/tickets/batch.mjs pick --take 292,299,… --skip 101:setup,182:board,…
//      writes batches/batch-<k>.txt (each ticket's title, description and thread) and records every id in
//      batches/seen.json, so the next batch starts after them. Which open tickets are bugs in Ola's code is a
//      person's call; --skip records the ones that are not, with a word of why. Commit and push.
//   2. run (on the Studio, nohup):
//        node apps/activist-ai/tickets/batch.mjs run batches/batch-<k>.txt
//      Qwen (one run, 30 min, 80 steps) reads the ten and writes failing tests for two; Ola's own model is
//      put back; did-it-fail.mjs keeps a test only if it fails inside the test on the untouched code; each
//      kept test goes to three.mjs (three Inkmini tries, a second round if none passes), one bug after the
//      other. ~/ola-trials/batches/batch-<k>/summary.txt at the end; the changes that passed their tests in
//      patches/, not reviewed, not applied.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { here, repo, root, sh, q, tracker } from './lib.mjs'

const [cmd, ...rest] = process.argv.slice(2)
const args = Object.fromEntries(rest.reduce((a, x, i, all) => {
  if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return a
}, []))
const dir = path.join(here, 'batches'), seenFile = path.join(dir, 'seen.json')
const seen = () => existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, 'utf8')) : { taken: {}, skipped: {} }
const trk = (a) => tracker(a, process.env.OLA_TICKETS_TRACKER)
const PATHS = ['CLAUDE.md', 'package.json', 'apps/activist-ai', ':!apps/activist-ai/apple', ':!apps/activist-ai/opencode-fork', ':!apps/activist-ai/site', ':!apps/activist-ai/brand']

// The same request as the morning run that worked (Nov 27, 13:16), plus TESTS.json so the check can read it.
export const ASK = 'Here are ten bugs. For each, say in one line whether a small model could fix it. Then choose the TWO for which you can write a good test, ' +
  'and for each write one test file that fails on this code because of the bug and would pass once the bug is fixed. Put each test next to the tests ' +
  'of that part of the code, in the style of the tests already there, runnable with one node command. Do not fix the bugs. End with a file TESTS.md ' +
  'naming for each of the two: the bug id, the test file, the exact command to run it, and what it checks; and a file TESTS.json, a JSON array of the two: ' +
  '[{"bug": "OLA-…", "file": "<test file, from this folder>", "cmd": "<the exact command, run from this folder>"}].'

if (cmd === 'pick') pick()
else if (cmd === 'run') await run(path.resolve(rest[0]))
else { console.error('batch.mjs pick [--take ids --skip id:why,…] | run <batch file>'); process.exit(2) }

function pick() {
  const s = seen(), n = Number(args.n || 10)
  const open = trk(['list', '--status', 'open,next']).split('\n').map((l) => l.match(/^(OLA-\d+)\s+(P\d)\s.*?\s{2,}(\S.*)$/)).filter(Boolean)
    .map(([, id, p, rest]) => ({ id, p, num: +id.slice(4), title: rest.replace(/^\S+\s+\S+\s+/, '') }))
  const order = (p) => open.filter((t) => t.p === p).sort((a, b) => a.num - b.num)
  const fresh = [...order('P1'), ...order('P0'), ...order('P2')].filter((t) => !s.taken[t.id] && !s.skipped[t.id])
  if (!args.take) { for (const t of fresh.slice(0, 3 * n)) console.log(`${t.id} ${t.p} ${t.title}`); return }
  const take = String(args.take).split(',').map((x) => `OLA-${x.replace(/^OLA-/, '')}`)
  const skip = String(args.skip || '').split(',').filter(Boolean).map((x) => x.split(':'))
  const k = 1 + Math.max(0, ...Object.values(s.taken).map((b) => b.batch))
  let text = `Batch ${k} of Ola's open bugs (apps/activist-ai), oldest first, ${new Date().toISOString().slice(0, 10)}.\n\n`
  take.forEach((id, i) => {
    const t = open.find((x) => x.id === id)
    const show = trk(['show', id]).split('\n').filter((l) => !/^(area|opened) /.test(l) && !/changed priority|Priority set to/.test(l)).join('\n').trim()
    text += `${i + 1}. ${t ? t.p : ''} ${show.slice(0, 1800)}\n\n`
    s.taken[id] = { batch: k }
  })
  for (const [id, why] of skip) s.skipped[`OLA-${id.replace(/^OLA-/, '')}`] = { batch: k, why: why || 'not a bug in the code' }
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `batch-${k}.txt`), text)
  writeFileSync(seenFile, JSON.stringify(s, null, 2) + '\n')
  console.log(`batches/batch-${k}.txt: ${take.length} tickets${take.some((id) => open.find((x) => x.id === id)?.p !== 'P1') ? ' (not all P1: the P1 bugs ran out)' : ''}`)
}

async function run(file) {
  const k = path.basename(file, '.txt'), out = path.join(root, 'batches', k)
  mkdirSync(path.join(out, 'patches'), { recursive: true })
  const log = (m) => { const l = `${new Date().toISOString().slice(0, 19)} ${m}`; console.log(l); appendFileSync(path.join(out, 'log.txt'), l + '\n') }
  const mem = () => { try { appendFileSync(path.join(out, 'memory.txt'), `${new Date().toISOString()} ${sh('top -l 1 -n 0 | grep PhysMem').trim()}\n`) } catch {} }
  mem(); const memTimer = setInterval(mem, 60000)
  const BM = path.join(repo, 'apps/activist-ai/ops/studio/big-model.sh')
  const run = (argv, env = {}) => spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 << 20 })
  const env = { TICKETS_WEEKLY_TOKENS: '200000000', GATEWAY_TOTAL_TIMEOUT_MS: '2400000', GATEWAY_FIRST_BYTE_TIMEOUT_MS: '1800000', GATEWAY_READ_TIMEOUT_MS: '600000' }
  const free = () => { while (spawnSync('/bin/sh', ['-c', 'pgrep -f "before-after.mjs|runner.mjs|ola.mjs deploy|three.mjs|write-tests.mjs" >/dev/null']).status === 0) { log('waiting for the Studio'); spawnSync('sleep', ['60']) } }
  const gateway = (m) => { const o = run([path.join(here, 'gateway.sh'), m], env).stdout; log(o.trim()); return Number((o.match(/gateway pid (\d+)/) || [])[1]) }
  const stop = (pid) => { try { process.kill(pid) } catch {} }

  // Qwen writes the tests.
  free()
  const ask = path.join(out, 'ask.txt'); writeFileSync(ask, ASK)
  if (run([BM, 'start', 'qwen']).status !== 0) { log('qwen did not start'); run([BM, 'back']); process.exit(1) }
  let gw = gateway('studio-qwen3.8-flash-next')
  const wt = run(['node', path.join(here, 'write-tests.mjs'), '--model', 'studio-qwen3.8-flash-next', '--bugs', file, '--ask', ask, '--time', '1800', '--steps', '80'], env).stdout
  stop(gw); run([BM, 'back']); log(wt.trim())
  const wdir = (wt.match(/^dir (.*)$/m) || [])[1]
  const qrun = JSON.parse(readFileSync(path.join(wdir, 'run.json'), 'utf8'))
  log(run([BM, 'status']).stdout.trim())

  // The did-it-fail check, then a case for each test that fails inside the test.
  const dif = run(['node', path.join(here, 'did-it-fail.mjs'), wdir]).stdout; log(dif.trim())
  const checked = existsSync(path.join(wdir, 'did-it-fail.json')) ? JSON.parse(readFileSync(path.join(wdir, 'did-it-fail.json'), 'utf8')).rows : []
  const kept = checked.filter((r) => r.verdict === 'fails').slice(0, 2)
  const cases = kept.map((r) => makeCase(r, wdir, qrun.ref, out, file))

  // Three Inkmini tries on each, one after the other.
  const results = []
  if (cases.length) {
    free()
    if (!/own model: loaded/.test(run([BM, 'status']).stdout)) run([BM, 'back'])
    gw = gateway('studio-inkling-2-mini')
    for (const c of cases) {
      log(`three tries on ${c.id}`)
      const o = run(['node', path.join(here, 'three.mjs'), '--model', 'studio-inkling-2-mini', '--case-file', c.file, '--time', '1500'], env).stdout; log(o.trim())
      const tdir = readdirSync(path.join(root, 'three')).filter((d) => d.startsWith(`${c.id}-`)).sort().pop()
      const res = JSON.parse(readFileSync(path.join(root, 'three', tdir, 'result.json'), 'utf8'))
      for (const t of res.tries.filter((t) => t.total > 0 && t.pass === t.total)) copyFileSync(path.join(root, 'three', tdir, `r${t.round}-try${t.try}`, 'change.diff'), path.join(out, 'patches', `${c.bug}-round${t.round}-try${t.try}.diff`))
      results.push({ ...c, dir: path.join(root, 'three', tdir), ...res })
    }
    stop(gw)
  }
  clearInterval(memTimer); mem()
  if (!/own model: loaded/.test(run([BM, 'status']).stdout)) run([BM, 'back'])

  // The summary.
  const peak = Math.max(...readFileSync(path.join(out, 'memory.txt'), 'utf8').split('\n').map((l) => +(l.match(/PhysMem: (\d+)G used/) || [])[1] || 0))
  const patches = readdirSync(path.join(out, 'patches')).filter((f) => f.endsWith('.diff'))
  writeFileSync(path.join(out, 'patches', 'README.txt'), `Changes that passed their tests. Not reviewed, not applied: Bart picks which he wants first.\n\n${patches.join('\n') || '(none)'}\n`)
  const s = [`${k}: ${file}`, `Qwen (${qrun.model} at ${qrun.ref.slice(0, 8)}): ${qrun.end}, ${qrun.requests} calls, ${qrun.minutes} min; tokens ${qrun.tokens_in} new in + ${qrun.tokens_cached} cached in + ${qrun.tokens_out} out`,
    `Qwen's answer:\n${readFileSync(path.join(wdir, 'final.txt'), 'utf8')}`, `\nThe did-it-fail check on the untouched code:\n${dif.trim() || '(no TESTS.json: no tests)'}`,
    ...results.map((r) => `\n${r.bug} (${r.id}): ${r.line}\n  untouched code ${r.base.pass}/${r.base.total}\n${r.tries.map((t) => `  round ${t.round} try ${t.try}: ${t.pass}/${t.total}, ${t.minutes} min, ${t.end}, change ${t.size} lines`).join('\n')}`),
    `\nPatches (passed their tests, not reviewed, not applied): ${patches.length ? patches.map((p) => path.join(out, 'patches', p)).join(', ') : 'none'}`,
    `Peak memory used on the Studio: ${peak} GB of 128`]
  writeFileSync(path.join(out, 'summary.txt'), s.join('\n') + '\n')
  log(`summary ${path.join(out, 'summary.txt')}`)
}

// A three.mjs case from one kept test: the bug's own words as the request, Qwen's test given, and the tests
// beside it that import the same code (the part's existing tests, so "nothing broken" means something).
function makeCase(r, wdir, ref, out, file) {
  const bug = r.bug, id = `${k(file)}-${bug.toLowerCase()}`, work = path.join(wdir, 'work')
  const giveDir = path.join(out, 'given', id)
  mkdirSync(path.dirname(path.join(giveDir, r.file)), { recursive: true })
  copyFileSync(path.join(work, r.file), path.join(giveDir, r.file))
  const src = readFileSync(path.join(work, r.file), 'utf8'), tdir = path.dirname(r.file)
  const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => path.normalize(path.join(tdir, m[1])))
  const siblings = readdirSync(path.join(work, tdir)).filter((f) => /\.test\.m?js$/.test(f) && path.join(tdir, f) !== path.normalize(r.file))
    .filter((f) => { const t = readFileSync(path.join(work, tdir, f), 'utf8'); return [...t.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].some((m) => imports.includes(path.normalize(path.join(tdir, m[1])))) })
    .slice(0, 3)
  const text = readFileSync(file, 'utf8'), at = text.indexOf(`${bug} `), words = at >= 0 ? text.slice(at, text.indexOf('\n\n', at) > 0 ? text.indexOf('\n\n', at) : undefined) : bug
  const c = { id, ticket: bug, base: ref, level: 'batch', note: `OLA-520 batch: test written by Qwen, failed inside the test on the untouched code`,
    request: `Ticket ${words.trim()}\n\nA test for it is at ${r.file}, run it with: ${r.cmd}`,
    give: [r.file], giveDir: path.relative(here, giveDir),
    tests: [{ name: 'bug-test', cmd: r.cmd }, ...siblings.map((f) => ({ name: f.replace(/\W+/g, '-'), cmd: `cd ${q(tdir)} && node --test ${q(f)}` }))], paths: PATHS }
  const f = path.join(out, `${id}.json`); writeFileSync(f, JSON.stringify(c, null, 2))
  return { id, bug, file: f, cmdTests: c.tests.map((t) => t.cmd) }
}
function k(file) { return path.basename(file, '.txt') }

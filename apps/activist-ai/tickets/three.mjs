#!/usr/bin/env node
// Three tries and one round of feedback (OLA-520). Bart, Nov 27: "send our first test issue with the
// tests to 3 inkmini agents and run the full loop".
//   Round 1: three runs of one model on one case at once, each in its own copy of the code.
//   A try that passes every test is the fix: stop.
//   Else pick the best try (most tests passing, none broken that passed on the untouched code, tie:
//   the smaller change); none better than the untouched code: start from the untouched code.
//   Round 2: three fresh runs seeded with that code and the failing tests' output, "fix exactly what
//   these tests report, change nothing else". Then stop, pass or not.
// No judge model, no lessons, no queue. The Studio's memory is written to <out>/memory.txt each minute.
//   apps/activist-ai/tickets/gateway.sh studio-inkling-2-mini   (first)
//   node apps/activist-ai/tickets/three.mjs --model studio-inkling-2-mini --case ola-337-deepseek [--time 1500] [--max-usd 1]
import { writeFileSync, readFileSync, appendFileSync, symlinkSync, existsSync } from 'node:fs'
import path from 'node:path'
import { here, repo, root, nmRoot, nmOla, MODELS, sh, q, runFolders, opencodeConfig, runOpencode, runTest, gatewayToken, LEAN } from './lib.mjs'

// The picking rule (unit-tested in three.test.mjs). tries: [{ pass, failed: Set|array of names, size }];
// base: the untouched code's { pass, failed }. Returns the index of the try to build on, or -1 (untouched).
export function pick(tries, base) {
  const baseFailed = new Set(base.failed)
  let best = -1
  tries.forEach((t, i) => {
    if (!(t.pass > base.pass)) return
    if ([...t.failed].some((n) => !baseFailed.has(n))) return // broke a test that passed before
    const b = tries[best]
    if (best < 0 || t.pass > b.pass || (t.pass === b.pass && t.size < b.size)) best = i
  })
  return best
}

// Top-level ✔ / ✖ lines of node:test's spec output, and the "failing tests" block trimmed for a reader.
export function parseTests(out, limit = 4000) {
  const head = out.split('\nℹ tests ')[0]
  const failed = [...head.matchAll(/^✖ (.*?)(?: \([\d.]+ms\))?$/gm)].map((m) => m[1])
  const block = out.includes('✖ failing tests:') ? out.slice(out.indexOf('✖ failing tests:')) : ''
  const report = block.split('\n').filter((l) => !/^\s+at /.test(l)).join('\n').trim().slice(0, limit)
  return { failed, report }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => {
    if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
    return a
  }, []))
  const model = args.model, c = JSON.parse(readFileSync(path.join(here, 'cases.json'), 'utf8')).find((x) => x.id === args.case)
  if (!MODELS[model] || !c) { console.error('--model <models.json name> --case <cases.json id>'); process.exit(2) }
  const timeLimit = Number(args.time || 1500), N = 3
  // A priced model (OpenRouter, Together) stops each try at --max-usd (default $1); the Studio's own models cost nothing.
  const usdLimit = MODELS[model].in > 0 ? Number(args['max-usd'] || 1) : Infinity
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out = path.join(root, 'three', `${c.id}-${stamp}`)
  const token = gatewayToken()
  const log = (m) => { console.log(m); appendFileSync(path.join(out, 'log.txt'), m + '\n') }

  function prepare(name, seedDiff) {
    const run = runFolders(path.join(out, name)), { work } = run
    sh(`git -C ${q(repo)} archive ${c.base || `${c.commit}^`} -- ${c.paths.map((x) => `'${x}'`).join(' ')} | tar -x -C ${q(work)}`)
    for (const f of c.give) sh(`git -C ${q(repo)} show ${c.commit}:${f} > ${q(path.join(work, f))}`)
    symlinkSync(nmRoot, path.join(work, 'node_modules'))
    if (existsSync(path.join(work, 'apps/activist-ai'))) symlinkSync(nmOla, path.join(work, 'apps/activist-ai/node_modules'))
    writeFileSync(path.join(work, '.gitignore'), 'node_modules\n', { flag: 'a' })
    writeFileSync(path.join(work, 'opencode.jsonc'), JSON.stringify(opencodeConfig(model, { lean: true }), null, 2))
    sh('git init -q && git add -A && git commit -qm base && git tag config', work)
    if (seedDiff) { writeFileSync(path.join(run.dir, 'seed.diff'), seedDiff); sh('git apply --whitespace=nowarn ../seed.diff && git add -A && git commit -qm seed', work) }
    return run
  }

  // Tests on a run: the given tests put back first (an edit to one never counts), then each case test.
  async function score(run) {
    for (const f of c.give) sh(`git -C ${q(repo)} show ${c.commit}:${f} > ${q(path.join(run.work, f))}`)
    let pass = 0, total = 0, failed = [], report = ''
    for (const t of c.tests) {
      const r = await runTest(run, t.name, t.cmd)
      const p = parseTests(readFileSync(path.join(run.dir, `test-${t.name}.txt`), 'utf8'))
      pass += r.pass || 0; total += r.total || 0; failed.push(...p.failed.map((n) => `${t.name}: ${n}`)); report += p.report + '\n'
    }
    // The change against the untouched code, the given tests left out.
    const diff = sh(`git add -A >/dev/null 2>&1; git diff --cached config -- . ${c.give.map((f) => `':!${f}'`).join(' ')}`, run.work)
    writeFileSync(path.join(run.dir, 'change.diff'), diff)
    const size = diff.split('\n').filter((l) => /^[+-](?![+-]{2} )/.test(l)).length
    return { pass, total, failed, report: report.trim().slice(0, 4000), size, diff }
  }

  const ask = (seeded, report) => seeded === null
    ? `${c.request}\n\nThe ticket's tests are already in place: ${c.give.join(', ')}. Make them pass without changing them, and keep the code's existing tests passing. ` +
      `Run them yourself: ${c.tests.map((t) => t.cmd).join('; ')}. ${LEAN.reading} Work only in this folder. When it is done, commit your change with git and say in two sentences what you changed.`
    : `${c.request}\n\n${seeded ? 'Work on this ticket has started: the change so far is committed in this folder. ' : ''}These tests still fail (${c.tests.map((t) => t.cmd).join('; ')}):\n\n${report}\n\n` +
      `Fix exactly what these tests report, change nothing else. Do not change ${c.give.join(', ')}. ${LEAN.reading} Work only in this folder. When they pass, commit with git and say in one sentence what you changed.`

  async function round(r, seedDiff, text) {
    log(`round ${r}: ${N} tries at once, ${timeLimit / 60} min each`)
    return Promise.all(Array.from({ length: N }, async (_, i) => {
      const run = prepare(`r${r}-try${i + 1}`, seedDiff), t0 = Date.now()
      const s = await runOpencode(run, text, { timeLimit, tokenLimit: Infinity, usdLimit, model, token, lean: true })
      const res = { round: r, try: i + 1, end: s.end, requests: s.requests, minutes: +((Date.now() - t0) / 60000).toFixed(1), final: (s.final || '').slice(0, 500), ...(await score(run)) }
      log(`  round ${r} try ${i + 1}: ${res.pass}/${res.total}, ${res.minutes} min, ${s.end}, change ${res.size} lines`)
      return res
    }))
  }

  sh(`mkdir -p ${q(out)}`)
  const mem = () => { try { appendFileSync(path.join(out, 'memory.txt'), `${new Date().toISOString()} ${sh('top -l 1 -n 0 | grep PhysMem').trim()}\n`) } catch {} }
  mem(); const memTimer = setInterval(mem, 60000)

  const base = await score(prepare('untouched', null))
  log(`untouched code: ${base.pass}/${base.total}`)
  const rows = []
  const done = (line) => { clearInterval(memTimer); mem(); writeFileSync(path.join(out, 'result.json'), JSON.stringify({ case: c.id, model, base: { pass: base.pass, total: base.total }, tries: rows.map(({ diff, ...x }) => x), line }, null, 2)); log(line); process.exit(0) }
  const win = (rs) => rs.filter((t) => t.total > 0 && t.pass === t.total).sort((a, b) => a.size - b.size)[0]
  const best = (rs) => Math.max(...rs.map((t) => t.pass))

  const r1 = await round(1, null, ask(null)); rows.push(...r1)
  if (win(r1)) { const w = win(r1); done(`fixed: round 1, try ${w.try}, ${w.size} changed lines (${path.join(out, `r1-try${w.try}`, 'change.diff')})`) }
  const k = pick(r1, base)
  const seed = k >= 0 ? r1[k] : null
  log(k >= 0 ? `round 2 starts from try ${k + 1} (${seed.pass}/${seed.total}, ${seed.size} lines)` : `no try beat the untouched code (${base.pass}): round 2 starts from the untouched code`)
  const r2 = await round(2, seed ? seed.diff : null, ask(!!seed, (seed || base).report)); rows.push(...r2)
  if (win(r2)) { const w = win(r2); done(`fixed: round 2 (from ${seed ? `try ${k + 1}` : 'the untouched code'}), try ${w.try}, ${w.size} changed lines (${path.join(out, `r2-try${w.try}`, 'change.diff')})`) }
  done(`not fixed: best ${best(r1)}/${base.total} in round 1, ${best(r2)}/${base.total} in round 2 (from ${seed ? `try ${k + 1}` : 'the untouched code'})`)
}

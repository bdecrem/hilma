#!/usr/bin/env node
// The did-it-fail check (OLA-520 run two), no model: each test a write-tests.mjs run names in TESTS.json is
// run on the untouched code (the run's work folder holds only the new tests; any other change is reported),
// in the same sandbox, and read as one of: fails inside the test (good), passes (not a test of the bug),
// breaks before testing (missing import, syntax error, no tests found).
//   node apps/activist-ai/tickets/did-it-fail.mjs <write-tests run dir>     (writes <dir>/did-it-fail.json)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { sh, runTest } from './lib.mjs'

export function verdict({ exit, pass, total }, out) {
  if (exit === 0) return 'passes'
  if (/ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError: \w+ is not defined at file|does not provide an export named|ENOENT/.test(out) && !/AssertionError/.test(out)) return 'breaks'
  if (!total) return /AssertionError/.test(out) ? 'fails' : 'breaks'
  if (pass === total) return 'breaks' // non-zero exit with every test passing: something outside the tests failed
  return 'fails'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(process.argv[2]), work = path.join(dir, 'work')
  const run = { dir, work, home: path.join(dir, 'home') }
  const list = existsSync(path.join(work, 'TESTS.json')) ? JSON.parse(readFileSync(path.join(work, 'TESTS.json'), 'utf8')) : []
  // Anything the run changed besides adding files: the code under test would not be untouched.
  const changed = sh('git add -A >/dev/null 2>&1; git diff --cached --name-status config', work).trim().split('\n').filter((l) => l && !l.startsWith('A'))
  // ...so those are put back to the untouched code before the tests run; the new files stay.
  for (const l of changed) for (const f of l.split('\t').slice(1)) sh(`git checkout config -- '${f.replace(/'/g, "'\\''")}' 2>/dev/null || true`, work)
  const rows = []
  for (const t of list) {
    if (!t.cmd) { rows.push({ bug: t.bug, file: null, verdict: 'no test', why: t.why }); continue }
    const name = `check-${String(t.bug).replace(/\W+/g, '-')}`, t0 = Date.now()
    const r = await runTest(run, name, t.cmd, 120000)
    const out = readFileSync(path.join(dir, `test-${name}.txt`), 'utf8')
    rows.push({ bug: t.bug, file: t.file, cmd: t.cmd, verdict: verdict(r, out), exit: r.exit, pass: r.pass, total: r.total, seconds: +((Date.now() - t0) / 1000).toFixed(1), why: t.why })
  }
  writeFileSync(path.join(dir, 'did-it-fail.json'), JSON.stringify({ changed, rows }, null, 2))
  if (changed.length) console.log(`note: the run changed existing files: ${changed.join(', ')}`)
  for (const r of rows) console.log(`${r.bug}: ${r.verdict}${r.file ? ` (${r.file}, exit ${r.exit}, ${r.pass}/${r.total}, ${r.seconds} s)` : ` (${r.why})`}`)
}

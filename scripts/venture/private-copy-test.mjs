// OLA-262: a copy of the notes (VENTURE_PRIVATE, for tests) never reaches the live Learning page. On a copy of
// the notes holding a made-up correction, and a copy of the tracker, this checks: learning.mjs refuses to store
// (and --dry still computes from the copy, made-up correction included); sync.mjs push and push --only refuse
// before reading or writing anything; each refusal is a line in the copy's overrides; correct.mjs add on the copy
// prints "nothing to push" instead of "next: node scripts/venture/sync.mjs push".
//   node scripts/venture/private-copy-test.mjs     (reads the real tracker once to make the copy; writes nothing there)
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenHash } from './_who.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const real = join(here, '../../apps/venture/private')
const dir = mkdtempSync(join(tmpdir(), 'private-copy-test-'))
const notes = join(dir, 'notes')
mkdirSync(join(notes, 'data'), { recursive: true })
for (const f of ['CORRECTIONS.md', 'RULES.md']) cpSync(join(real, f), join(notes, f))
for (const f of ['weaknesses.json', 'replay-cases', 'replay-untestable.json']) cpSync(join(real, 'data', f), join(notes, 'data', f), { recursive: true })
const db = join(dir, 'tracker.json')
execFileSync('node', [join(here, '_fakedb.mjs'), 'copy', db, 'OLA-262'], { stdio: 'pipe' })
const callers = join(dir, 'callers.jsonl')
const cmd = 'node scripts/venture/correct.mjs (pcopytest)'
writeFileSync(callers, JSON.stringify({ at: Date.now() / 1000, session: 'lead-session', agent: 'pcopytest', agent_type: 'general-purpose', tok: tokenHash('tokP'), cmd }) + '\n')
const run = (script, ...args) => {
  // VENTURE_TRACKER_FAKE too: if the VENTURE_PRIVATE guard ever went, learning.mjs would still refuse on the copy
  // of the tracker, so this test cannot put anything on the live page itself
  const env = { ...process.env, VENTURE_TRACKER_FAKE: db, VENTURE_CALLERS_FILE: callers, VENTURE_PRIVATE: notes, VENTURE_CALLER: 'tokP', VENTURE_TEST_SHELL: `export VENTURE_CALLER=tokP; ${cmd}` }
  const r = spawnSync('node', [join(here, script), ...args], { env, encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: (r.stdout + r.stderr).trim() }
}
let pass = 0, fail = 0
const t = (name, ok, out = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${out.slice(0, 600)}`}`) }
const overrides = () => JSON.stringify(JSON.parse(readFileSync(db, 'utf8')).venture_state ?? []).split('VENTURE_PRIVATE was set on a real write').length - 1
const learningRows = () => (JSON.parse(readFileSync(db, 'utf8')).venture_state ?? []).filter((r) => r.slug === 'learning').map((r) => JSON.stringify(r)).join()

try {
  // a made-up correction only the copy holds
  const before = (readFileSync(join(notes, 'CORRECTIONS.md'), 'utf8').match(/^## \d+\. /gm) ?? []).length
  appendFileSync(join(notes, 'CORRECTIONS.md'), `\n## 9999. November 22, 2026: private-copy-test made-up correction\n\nNot real.\n`)
  const learnBefore = learningRows()
  const o0 = overrides()

  const l = run('learning.mjs')
  t('learning.mjs on a copy refuses to store', l.code === 1 && /Refused: VENTURE_PRIVATE is set/.test(l.out), l.out)
  t('… and the copy of the tracker\'s learning row is unchanged', learningRows() === learnBefore)
  t('… and the refusal is a line in the overrides', overrides() === o0 + 1, `overrides ${o0} -> ${overrides()}`)

  const d = run('learning.mjs', '--dry')
  t('learning.mjs --dry on a copy still computes (from the copy)', d.code === 0 && d.out.length > 0, d.out)
  t('… and nothing is stored by --dry', learningRows() === learnBefore)
  t('… and the copy held one more correction than the real notes (the made-up one is what it read)', before > 0 && readFileSync(join(notes, 'CORRECTIONS.md'), 'utf8').match(/^## \d+\. /gm).length === before + 1)

  const p = run('sync.mjs', 'push')
  t('sync.mjs push on a copy refuses before pushing anything', p.code === 1 && /Refused: VENTURE_PRIVATE is set/.test(p.out) && !/learning numbers (NOT )?refreshed/.test(p.out), p.out)
  const q = run('sync.mjs', 'push', '--only', 'NOW.md')
  t('sync.mjs push --only on a copy refuses too', q.code === 1 && /Refused: VENTURE_PRIVATE is set/.test(q.out), q.out)
  t('… both refusals are lines in the overrides', overrides() === o0 + 3, `overrides ${o0} -> ${overrides()}`)

  const a = run('correct.mjs', 'add', '--title', 'private-copy-test: a made-up correction', '--words', 'private-copy-test words', '--did', 'nothing', '--cause', 'a test', '--weakness', 'ola-places', '--fix', 'a note', '--level', '1', '--where', 'scripts/venture/correct.mjs')
  t('correct.mjs add on a copy says there is nothing to push', a.code === 0 && /nothing to push; sync\.mjs push refuses while VENTURE_PRIVATE is set/.test(a.out), a.out)
  t('… and never prints the "next: sync.mjs push" line', !/next: node scripts\/venture\/sync\.mjs push/.test(a.out), a.out)
  t('… and the real CORRECTIONS.md does not hold it', !readFileSync(join(real, 'CORRECTIONS.md'), 'utf8').includes('private-copy-test'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\n${pass} of ${pass + fail}`)
process.exit(fail ? 1 : 0)

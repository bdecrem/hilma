// A correction's weakness is confirmed by a caller that did not record it (OLA-251, Nov 21): the kind-4 answer to
// the twenty-six ways an agent filed a correction under a lower bar on Nov 20. On a copy of the notes and of the
// tracker, with two made-up agents (A records, B confirms), this checks: who recorded it is kept; the recorder
// and an unknown caller cannot confirm; a move to a weakness with a higher bar needs --owed and owes that bar;
// the evening post refuses the day until every correction is confirmed.
//   node scripts/venture/confirm-test.mjs        (reads the real tracker once to make the copy; writes nothing there)
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenHash } from './_who.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const real = join(here, '../../apps/venture/private')
const dir = mkdtempSync(join(tmpdir(), 'confirm-test-'))
const notes = join(dir, 'notes')
mkdirSync(join(notes, 'data'), { recursive: true })
for (const f of ['CORRECTIONS.md', 'RULES.md']) cpSync(join(real, f), join(notes, f))
for (const f of ['weaknesses.json', 'replay-cases', 'replay-untestable.json']) cpSync(join(real, 'data', f), join(notes, 'data', f), { recursive: true })
const db = join(dir, 'tracker.json')
execFileSync('node', [join(here, '_fakedb.mjs'), 'copy', db, 'OLA-251'], { stdio: 'pipe' })
const callers = join(dir, 'callers.jsonl')
const rows = []
const cmds = {}
for (const [agent, tok] of [['aaaaaaaa', 'tokA'], ['bbbbbbbb', 'tokB']]) {
  cmds[tok] = `node scripts/venture/correct.mjs (${agent})`
  rows.push(JSON.stringify({ at: Date.now() / 1000, session: 'lead-session', agent, agent_type: 'general-purpose', tok: tokenHash(tok), cmd: cmds[tok] }))
}
writeFileSync(callers, rows.join('\n') + '\n')
const run = (tok, script, ...args) => {
  const env = { ...process.env, VENTURE_TRACKER_FAKE: db, VENTURE_CALLERS_FILE: callers, VENTURE_PRIVATE: notes }
  delete env.VENTURE_CALLER
  env.VENTURE_TEST_SHELL = tok ? `export VENTURE_CALLER=${tok}; ${cmds[tok]}` : 'node scripts/venture/correct.mjs'
  if (tok) env.VENTURE_CALLER = tok
  const r = spawnSync('node', [join(here, script), ...args], { env, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout + r.stderr).trim() }
}
let pass = 0, fail = 0
const t = (name, ok, out = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${out.slice(0, 600)}`}`) }
const state = () => JSON.parse(readFileSync(db, 'utf8')).venture_state ?? []
const row = (k) => state().find((r) => r.key === k)?.value
const weak = () => JSON.parse(readFileSync(join(notes, 'data/weaknesses.json'), 'utf8'))
const filedUnder = (n) => weak().find((w) => w.seen.some((s) => s.ref === `correction ${n}`))?.id
const num = (out) => Number(/correction (\d+) recorded/.exec(out)?.[1])

// A records a misreading of Bart under an Ola weakness with a low bar, kind 1
const a = run('tokA', 'correct.mjs', 'add', '--title', 'confirm-test: did not read his message', '--words', 'confirm-test words', '--did', 'answered without reading', '--cause', 'guessed', '--weakness', 'ola-places', '--fix', 'a note', '--level', '1', '--where', 'scripts/venture/correct.mjs')
const n1 = num(a.out)
t('A records a correction', a.code === 0 && n1 > 0, a.out)
t('who recorded it is kept (agent A)', row(`correction-by:${n1}`)?.caller === 'agent aaaaaaaa', JSON.stringify(row(`correction-by:${n1}`)))
const u1 = run('tokA', 'correct.mjs', 'unconfirmed')
t('unconfirmed lists it (exit 1)', u1.code === 1 && u1.out.includes(`correction ${n1}`), u1.out)
const self = run('tokA', 'correct.mjs', 'confirm', String(n1), '--weakness', 'ola-places')
t('the recorder cannot confirm it', self.code === 1 && /recorded by this caller/.test(self.out) && !row(`correction-confirm:${n1}`), self.out)
const anon = run(null, 'correct.mjs', 'confirm', String(n1), '--weakness', 'ola-places')
t('an unknown caller cannot confirm it', anon.code === 1 && /unknown/.test(anon.out) && !row(`correction-confirm:${n1}`), anon.out)
const noOwed = run('tokB', 'correct.mjs', 'confirm', String(n1), '--weakness', 'my-reading')
t('B moving it to my-reading (higher bar) without --owed is refused', noOwed.code === 1 && /--owed OLA-n/.test(noOwed.out) && filedUnder(n1) === 'ola-places', noOwed.out)
const mv = run('tokB', 'correct.mjs', 'confirm', String(n1), '--weakness', 'my-reading', '--owed', 'OLA-251')
const owed = weak().find((w) => w.id === 'my-reading').owed?.find((o) => o.ref === `correction ${n1}`)
t('B moves it: filed under my-reading, fix owed at its bar on OLA-251', mv.code === 0 && filedUnder(n1) === 'my-reading' && owed?.issue === 'OLA-251' && owed?.need >= 4, mv.out)
t('the tracker owes the same fix', row(`owed-fix:${n1}`)?.need === owed?.need, JSON.stringify(row(`owed-fix:${n1}`)))
t('CORRECTIONS.md names the new weakness', new RegExp(`## ${n1}\\.[\\s\\S]*?Weakness: my-reading \\(moved from ola-places`).test(readFileSync(join(notes, 'CORRECTIONS.md'), 'utf8')))
t('the move is a line in the overrides', state().some((r) => r.key.startsWith('override:') && r.value?.what?.includes(`correction ${n1} was filed under ola-places`)))
// a second correction, rightly filed, confirmed where it is
const b = run('tokA', 'correct.mjs', 'add', '--title', 'confirm-test: the page breaks at phone width', '--words', 'confirm-test words two', '--did', 'shipped', '--cause', 'not looked at', '--weakness', 'ola-places', '--owed', 'OLA-251')
const n2 = num(b.out)
const post1 = run('tokA', 'correct.mjs', 'unconfirmed')
t('unconfirmed lists the second, not the first', post1.code === 1 && post1.out.includes(`correction ${n2} `) && !post1.out.includes(`correction ${n1} `), post1.out)
// corrections of today in the real notes (recorded before this tool kept who recorded them) are confirmed with --why
for (const m of post1.out.matchAll(/^correction (\d+)\s+(\S+)/gm)) if (Number(m[1]) !== n2) run('tokB', 'correct.mjs', 'confirm', m[1], '--weakness', m[2], '--why', 'recorded before the record of who recorded it')
// the evening post refuses the day while one is unconfirmed (other reasons may refuse it too; this one must be named)
const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
{ // the day's requests matched on the copy, so the post gets as far as the corrections
  const d = JSON.parse(readFileSync(db, 'utf8'))
  const r = d.venture_state.find((x) => x.key === 'requests') ?? (d.venture_state.push({ key: 'requests', value: { days: {} } }), d.venture_state.at(-1))
  r.value.days ??= {}
  r.value.days[day] = { counts: { requests: 0, matched: 0 }, opened: [], at: new Date().toISOString() }
  writeFileSync(db, JSON.stringify(d))
}
const entry = join(dir, 'entry.json')
writeFileSync(entry, JSON.stringify({ day, quiet: true, cleaned: [], kit: [], ola: [] }))
const s1 = run('tokA', 'sweep.mjs', 'post', entry, '--dry')
t('sweep.mjs post refuses the day, naming the unconfirmed correction', s1.code !== 0 && new RegExp(`no other caller has confirmed: ${n2} `).test(s1.out), s1.out)
const ok2 = run('tokB', 'correct.mjs', 'confirm', String(n2), '--weakness', 'ola-places')
t('B confirms the second where it is', ok2.code === 0 && filedUnder(n2) === 'ola-places' && row(`correction-confirm:${n2}`)?.caller === 'agent bbbbbbbb', ok2.out)
const s2 = run('tokA', 'sweep.mjs', 'post', entry, '--dry')
t('sweep.mjs post no longer names unconfirmed corrections', !/no other caller has confirmed/.test(s2.out), s2.out)
const u2 = run('tokA', 'correct.mjs', 'unconfirmed')
t('unconfirmed lists none (exit 0)', u2.code === 0, u2.out)
console.log(`${pass} of ${pass + fail}${fail ? ` (${fail} failed; copies in ${dir})` : ''}`)
process.exit(fail ? 1 : 0)

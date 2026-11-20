// "Compare with Claude" without a workspace (frontdesk/compare.mjs): the judge's order swap and its
// evidence rule, how checks and the judge make an outcome, the sampler's budget stop, the owner-only
// and real-task-off refusals (nothing reaches a VM or Claude), a lost copy written as a candidate
// eval task that the eval set's own selftest and runner accept, and the weekly number. Anthropic is
// never called: the judge here is a function. Run: node --test frontdesk/test/compare.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { openDb } from '../db.mjs'
import { compareConfig, differenceOf, judgeTwice, leftovers, makeCompare, outcomeOf, quality, readJudgement, realFiles, samplerChoice, skillNote, weekly, writeCandidate } from '../compare.mjs'
import { GENERATOR } from '../../web/server/fake-twin.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dir = () => mkdtempSync(path.join(tmpdir(), 'ola-cmp-test-'))
const good = { final: 'I removed 4 repeated rows. clean.csv has 26 people.', outputs: [{ name: 'clean.csv', text: 'id,name\n1,Avel Pell\n' }] }
const poor = { final: 'The export has 30 data rows, counted by a short program.', outputs: [] }
const judgeReply = (better, a, b) => JSON.stringify({ points: [{ criterion: 'correct', better, evidence_a: a, evidence_b: b }], overall: better, difference: `Result ${better} removed the repeats; the other did not.`, label_for_worse: 'numbers_wrong' })

test('the judge runs twice with the order swapped; a judge that always picks the first shown is "unsure"', async () => {
  const seen = []
  // A fair judge: picks the result that says it removed rows, wherever it is shown.
  const fair = async (m) => {
    seen.push(m)
    const a = /<result A>([\s\S]*?)<\/result>/.exec(m)[1]
    const b = /<result B>([\s\S]*?)<\/result>/.exec(m)[1]
    const better = /removed 4 repeated rows/.test(a) ? 'A' : 'B'
    return judgeReply(better, better === 'A' ? 'I removed 4 repeated rows' : 'The export has 30 data rows', better === 'A' ? 'The export has 30 data rows' : 'I removed 4 repeated rows')
  }
  for (const coin of [true, false]) {
    seen.length = 0
    const r = await judgeTwice({ kind: 'clean', request: 'Remove the repeats.', x: poor, y: good, names: { x: 'Ola', y: 'Claude' }, ask: fair, coin })
    assert.equal(seen.length, 2)
    assert.notEqual(/<result A>([\s\S]*?)<\/result>/.exec(seen[0])[1], /<result A>([\s\S]*?)<\/result>/.exec(seen[1])[1], 'the order is swapped')
    assert.ok(!/Ola|Claude/.test(seen.join('')), 'the judge never sees who made what')
    assert.equal(r.verdict, 'y')
    assert.match(r.difference, /^(Claude|Ola) removed the repeats; the other did not\.$/)
    assert.ok(r.difference.startsWith('Claude'), 'Result A/B are written as the engines’ names')
  }
  const biased = async (m) => {
    const a = /<result A>[\s\S]*?Final message:\n([^\n]*)/.exec(m)[1]
    const b = /<result B>[\s\S]*?Final message:\n([^\n]*)/.exec(m)[1]
    return judgeReply('A', a.slice(0, 20), b.slice(0, 20))
  }
  const r = await judgeTwice({ kind: 'clean', request: 'x', x: poor, y: good, names: { x: 'Ola', y: 'Claude' }, ask: biased })
  assert.equal(r.verdict, 'unsure', 'disagreement is marked unsure, never averaged')
})

test('a judged point whose quote is not in that result is dropped, and an overall call nothing supports becomes "same"', () => {
  const j = readJudgement(judgeReply('A', 'I removed 4 repeated rows', 'a sentence nobody wrote'), good, poor)
  assert.equal(j.points.length, 0)
  assert.equal(j.overall, 'same')
  const k = readJudgement(judgeReply('A', 'I removed 4 repeated rows', 'The export has 30 data rows'), good, poor)
  assert.equal(k.overall, 'A')
  assert.equal(readJudgement('not json', good, poor), null)
})

test('the sentence under the verdict never contradicts it: the judge’s when it agrees, the checks’ when they decided', () => {
  const pass = { all: true, total: 4, passed: 4 }
  const fail = { all: false, total: 4, passed: 1 }
  const same = { verdict: 'same', difference: 'Both did the same.' }
  assert.equal(differenceOf({ outcome: 'ola_better', judged: same, ola: pass, claude: fail }), 'Ola’s result passed all 4 checks of the task; Claude’s passed 1 of 4.')
  assert.equal(differenceOf({ outcome: 'claude_better', judged: { verdict: 'x', difference: 'Ola wins.' }, ola: fail, claude: pass }), 'Claude’s result passed all 4 checks of the task; Ola’s passed 1 of 4.')
  assert.equal(differenceOf({ outcome: 'ola_better', judged: { verdict: 'x', difference: 'Ola named the repeats.' }, ola: pass, claude: fail }), 'Ola named the repeats.')
  assert.equal(differenceOf({ outcome: 'both_right', judged: same, ola: pass, claude: pass }), 'Both did the same.')
})

test('outcomes: the checks decide when they differ, then the judge; both right, both wrong, unsure', () => {
  const pass = { all: true, total: 4 }
  const fail = { all: false, total: 4 }
  assert.equal(outcomeOf({ ola: fail, claude: pass, judged: 'x' }), 'claude_better', 'checks outrank the judge')
  assert.equal(outcomeOf({ ola: pass, claude: fail, judged: 'y' }), 'ola_better')
  assert.equal(outcomeOf({ ola: pass, claude: pass, judged: 'same' }), 'both_right')
  assert.equal(outcomeOf({ ola: fail, claude: fail, judged: 'same' }), 'both_wrong')
  assert.equal(outcomeOf({ ola: pass, claude: pass, judged: 'unsure' }), 'both_right')
  assert.equal(outcomeOf({ ola: null, claude: null, judged: 'unsure' }), 'unsure', 'the real task has no checks: the judge alone')
  assert.equal(outcomeOf({ ola: null, claude: null, judged: 'y' }), 'claude_better')
})

function project(db, { owner = 'olive', member = 'mel', cap = null, auto = 'daily' } = {}) {
  const person = (h, admin = 0) => Number(db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES (?, ?, 'active', ?, randomblob(32), 0)").run(h, h, admin).lastInsertRowid)
  const o = person(owner)
  const m = person(member)
  const team = Number(db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('tm-a', 'A', 0)").run().lastInsertRowid)
  db.prepare("INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, ?, 'owner', 0), (?, ?, 'member', 0)").run(team, o, team, m)
  const w = Number(db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('cq-a', 'A', ?, 'active', 0)").run(team).lastInsertRowid)
  db.prepare('UPDATE workspaces SET compare_auto = ?, compare_cap_micro_usd = ? WHERE id = ?').run(auto, cap, w)
  return { w, o, m }
}

test('budgets stop the sampler: a month spent, a day full, or the setting at "Only when I ask"', () => {
  const db = openDb(path.join(dir(), 'fd'))
  const xc = compareConfig({ OLA_HOME: dir() })
  const { w, o } = project(db, { cap: 1_000_000 })
  assert.deepEqual(samplerChoice(db, xc).map((p) => p.slug), ['cq-a'])
  const add = (trigger, cost, at = Date.now()) => db.prepare("INSERT INTO comparisons (id, workspace_id, person_id, session, message, mode, trigger, state, created_at, cost_micro_usd) VALUES (lower(hex(randomblob(6))), ?, ?, 's1', 'm1', 'twin', ?, 'done', ?, ?)").run(w, o, trigger, at, cost)
  add('asked', 1_000_000)
  assert.deepEqual(samplerChoice(db, xc), [], 'the month’s budget is spent')
  db.prepare('UPDATE workspaces SET compare_cap_micro_usd = 5000000, compare_per_day = 2 WHERE id = ?').run(w)
  add('sampled', 10)
  assert.equal(samplerChoice(db, xc).length, 1)
  add('sampled', 10)
  assert.deepEqual(samplerChoice(db, xc), [], 'two a day, and two were made today')
  assert.equal(samplerChoice(db, xc, Date.now() + 86_400_000).length, 1, 'tomorrow it may sample again')
  db.prepare("UPDATE workspaces SET compare_auto = 'ask' WHERE id = ?").run(w)
  assert.deepEqual(samplerChoice(db, xc, Date.now() + 86_400_000), [])
})

test('a member sees nothing of it and can start nothing; with the real-task switch off nothing of the project is read or sent', async () => {
  const db = openDb(path.join(dir(), 'fd'))
  const { w, o } = project(db, { auto: 'ask' })
  const calls = []
  const workspaces = { oc: async (...a) => (calls.push(['oc', ...a]), { status: 200, json: { data: [] } }), ensureRunning: async (s) => calls.push(['wake', s]), executing: async () => new Set(), isReady: () => true, holdBusy: () => () => {}, peek: async () => new Map() }
  const claude = { info: async () => ({ configured: true, unavailable: null, mode: 'api_key' }), writeGrants: () => {} }
  const xc = compareConfig({ OLA_HOME: dir(), OLA_FD_COMPARE_TICK_MS: '3600000' })
  const c = makeCompare({ db, xc, cc: {}, claude, hosted: { writeGrants: () => {}, info: async () => ({ configured: false }) }, workspaces, container: '/nonexistent/container', log: () => {} })
  const member = { id: w, slug: 'cq-a', role: 'member' }
  const owner = { id: w, slug: 'cq-a', role: 'owner' }
  assert.deepEqual(await c.info(member), { canCompare: false })
  for (const r of [await c.start(member, 2, { conversation: 's1', message: 'm1', mode: 'twin' }), await c.setSettings(member, 2, { real: true, consent: true }), await c.send(member, 2, { id: 'a'.repeat(12) }), c.discard(member, { id: 'a'.repeat(12) }), await c.show(member, 'a'.repeat(12))]) assert.equal(r.status, 403)
  const off = await c.start(owner, o, { conversation: 's1', message: 'm1', mode: 'real' })
  assert.equal(off.status, 403)
  assert.equal(off.body.error, 'real_off')
  assert.equal((await c.start(owner, o, { conversation: 's1', message: 'm1', mode: 'real', once: true })).status, 400, '"Just this once" needs the confirming click')
  assert.deepEqual(calls, [], 'no project was woken, read or sent')
  assert.equal((await c.setSettings(owner, o, { real: true })).status, 400, 'turning it on needs consent')
  const on = await c.setSettings(owner, o, { real: true, consent: true })
  assert.equal(on.body.real, true)
  assert.match(on.body.consent, /^Let Claude redo finished work in this project so we can compare\. Your request and the files Ola read for it go to Anthropic\. So do Ola’s answer and the files it wrote\./)
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'compare_real_enabled'").get().n, 1)
  // No credential for the project's mode: nothing that sends is offered.
  const none = makeCompare({ db, xc, cc: {}, claude: { ...claude, info: async () => ({ configured: false, unavailable: 'Claude is not set up on this machine yet: there is no Anthropic account to use. Bart can set it up.', mode: 'api_key' }) }, hosted: { writeGrants: () => {} }, workspaces, container: '/nonexistent', log: () => {} })
  const i = await none.info(owner)
  assert.equal(i.configured, false)
  assert.match(i.unavailable, /not set up/)
  assert.equal((await none.start(owner, o, { conversation: 's1', message: 'm1', mode: 'twin' })).status, 503)
  c.close()
  none.close()
})

test('a front desk that died mid-comparison: at the next start its rows are failed, its scratch grants and made-up files gone, its scratch VMs listed for removal', async () => {
  // Review 5 follow-up (low): before, "running" rows, scratch grants and VMs stayed for good.
  const db = openDb(path.join(dir(), 'fd'))
  const { w, o } = project(db, { auto: 'ask' })
  const home = dir()
  const xc = compareConfig({ OLA_HOME: home, OLA_FD_COMPARE_TICK_MS: '3600000', OLA_FD_COMPARE_PREFIX: 'cqx' })
  const add = (id, state) => db.prepare("INSERT INTO comparisons (id, workspace_id, person_id, session, message, mode, trigger, state, created_at) VALUES (?, ?, ?, 's1', 'm1', 'real', 'asked', ?, ?)").run(id, w, o, state, Date.now())
  add('a00000000001', 'running')
  add('a00000000002', 'making')
  add('a00000000003', 'ready')
  db.prepare("INSERT INTO compare_scratch (slug, workspace_id, engine, mode, cap_micro_usd, cap_tokens, until) VALUES ('cqx-0badf00d', ?, 'claude', 'api_key', 1, 1, ?)").run(w, Date.now() + 600_000)
  mkdirSync(path.join(home, 'ws', 'cqx-0badf00d'), { recursive: true })
  mkdirSync(path.join(home, 'ws', 'other-proj'), { recursive: true })
  mkdirSync(path.join(xc.dir, 'tmp', 'put-x'), { recursive: true })
  writeFileSync(path.join(xc.dir, 'tmp', 'put-x', 'data.csv'), 'made,up\n')
  const before = leftovers(db, xc, home)
  assert.deepEqual([before.scratch, before.stuck.length, before.grants, before.files], [['cqx-0badf00d'], 2, ['cqx-0badf00d'], 1])
  let wrote = 0
  const stub = { info: async () => ({ configured: true, mode: 'api_key' }), writeGrants: () => wrote++ }
  const workspaces = { oc: async () => ({ status: 200, json: { data: [] } }), ensureRunning: async () => {}, executing: async () => new Set(), isReady: () => true, holdBusy: () => () => {}, peek: async () => new Map() }
  const c = makeCompare({ db, xc, cc: {}, claude: stub, hosted: stub, workspaces, container: '/nonexistent/container', log: () => {}, home })
  const states = Object.fromEntries(db.prepare('SELECT id, state FROM comparisons').all().map((r) => [r.id, r.state]))
  assert.deepEqual(states, { a00000000001: 'failed', a00000000002: 'failed', a00000000003: 'ready' }, 'a ready copy waits for its owner; nothing else was under way')
  assert.equal(db.prepare('SELECT count(*) AS n FROM compare_scratch').get().n, 0, 'a scratch grant outlived its front desk')
  assert.ok(wrote >= 2, 'the grants files were not written again')
  assert.ok(!existsSync(path.join(xc.dir, 'tmp')), 'made-up files on their way were left')
  const rec = JSON.parse(readFileSync(path.join(xc.dir, 'cleanup.json'), 'utf8'))
  assert.deepEqual([rec.failed.sort(), rec.grants, rec.scratch.map((v) => v.id)], [['a00000000001', 'a00000000002'], ['cqx-0badf00d'], ['cqx-0badf00d']])
  c.close()
})

test('a lost copy lands in the candidates queue as an eval task: task.py selftest passes Claude’s result and fails Ola’s, and run.mjs runs it', () => {
  const d = dir()
  const work = path.join(d, 'gen')
  mkdirSync(work)
  // The copy and both recorded results, made the way a comparison makes them.
  const gen = spawnSync('python3', ['-I', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(AI, 'workspace/lib'))}); import olatwin, json; t, f = olatwin.run_generator(sys.stdin.read(), ${JSON.stringify(work)}, 41, python=sys.executable, allow_host=True); print(json.dumps(t))`], { input: GENERATOR, encoding: 'utf8' })
  assert.equal(gen.status, 0, gen.stderr)
  const made = readdirSync(work).map((name) => ({ name, b64: readFileSync(path.join(work, name)).toString('base64') }))
  spawnSync('python3', ['-c', "import csv\nrows=list(csv.reader(open('data.csv')))\nseen=set();keep=[rows[0]]\nfor r in rows[1:]:\n  k=r[1].strip().lower()\n  if k not in seen: seen.add(k); keep.append(r)\ncsv.writer(open('clean.csv','w',newline='')).writerows(keep)"], { cwd: work })
  const checks = [{ name: 'has_clean', type: 'file', path: 'clean.csv', label: 'stopped_early' }, { name: 'clean_rows', type: 'csv_rows', path: 'clean.csv', truth: 'unique', label: 'numbers_wrong' }, { name: 'says_repeats', type: 'says_number', truth: 'duplicates', label: 'numbers_wrong' }]
  const twin = { request: 'Remove the repeated rows from data.csv into clean.csv and tell me how many repeats you removed.', seed: 41, generator: GENERATOR, checks, truth: JSON.parse(gen.stdout), files: made }
  const b64 = (f) => readFileSync(path.join(work, f)).toString('base64')
  const queue = path.join(d, 'candidates')
  const cand = writeCandidate(queue, { id: '00aa11bb22cc', kind: 'clean', twin, outcome: 'claude_better', ola: { final: 'The export has 30 data rows.', outputs: [], score: { all: false } }, claude: { final: 'I removed 4 repeated rows. clean.csv has 26 people.', outputs: [{ name: 'clean.csv', b64: b64('clean.csv') }], score: { all: true } }, judge: { verdict: 'y' } })
  writeFileSync(path.join(cand, 'skill-note.md'), skillNote({ id: '00aa11bb22cc', kind: 'clean', label: 'numbers_wrong', failed: ['has_clean', 'clean_rows'], difference: 'Claude removed the repeats; Ola did not.' }))
  for (const f of ['task.json', 'instruction.md', 'task.py', 'twin.json', 'evidence.json', 'reference/claude/clean.csv', 'reference/ola/final.txt']) assert.ok(existsSync(path.join(cand, f)), f)
  const st = spawnSync('python3', [path.join(AI, 'evals/lib/task.py'), 'selftest', cand, '0'], { encoding: 'utf8' })
  assert.equal(st.status, 0, st.stdout + st.stderr)
  assert.match(st.stdout, /ok +t-00aa11bb22cc seed 0 solve/)
  assert.match(st.stdout, /ok +t-00aa11bb22cc seed 0 wrong/)
  assert.match(readFileSync(path.join(cand, 'skill-note.md'), 'utf8'), /^\*\*numbers_wrong\*\* on a made-up copy of clean work.*Would have prevented it: the `workbook` skill\. Proposed change: .*Not applied: queued for the lead\.\n$/s)
  // The runner itself, on the queue, replaying both arms: Claude's passes, Ola's fails with a label.
  for (const [arm, pass] of [['claude', 'PASS'], ['ola', 'fail']]) {
    const r = spawnSync(process.execPath, [path.join(AI, 'evals/run.mjs'), '--config', `configs/replay-${arm}.json`, '--tasks-dir', queue, '--seeds', '0', '--concurrency', '1', '--db', path.join(d, `r-${arm}.db`)], { encoding: 'utf8', cwd: path.join(AI, 'evals') })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, new RegExp(`${pass}  t-00aa11bb22cc`), r.stdout)
  }
})

// Review 5: a candidate's generator is code a model wrote in the project's VM. Replaying the
// candidate (task.py selftest, which `admin.mjs compare promote` runs on this machine as the admin
// user) ran it on the host behind only Python's audit hook, which the generator can switch off.
test('replaying a candidate never runs the model’s generator on this machine', () => {
  const d = dir()
  const marker = path.join(homedir(), `.ola-rev5-host-marker-${process.pid}`)
  rmSync(marker, { force: true })
  // In the VM it writes its data like any copy; on a Mac it also switches the hook off and plants a file.
  const hostile = `import sys, os\ndef make(out, rng):\n    if sys.platform == 'darwin' or not os.path.isdir('/opt/ola'):\n        m = sys.modules['__main__']\n        m.inside = lambda p, roots: True\n        m.WRITES = set()\n        open(${JSON.stringify(marker)}, 'w').write('ran on the host')\n    (out / 'data.csv').write_text('id,amount\\n1,5\\n2,7\\n')\n    return {'total': 12}\n`
  const files = [{ name: 'data.csv', b64: Buffer.from('id,amount\n1,5\n2,7\n').toString('base64') }]
  const twin = { request: 'Add up the amount column of data.csv and say the total.', seed: 7, generator: hostile, checks: [{ name: 'says_total', type: 'says_number', truth: 'total', label: 'numbers_wrong' }], truth: { total: 12 }, files }
  const cand = writeCandidate(path.join(d, 'q'), { id: '0123abcd4567', kind: 'sql', twin, outcome: 'claude_better', ola: { final: 'The total is 11.', outputs: [], score: { all: false } }, claude: { final: 'The total is 12.', outputs: [], score: { all: true } }, judge: { verdict: 'y' } })
  const st = spawnSync('python3', [path.join(AI, 'evals/lib/task.py'), 'selftest', cand, '0'], { encoding: 'utf8' })
  const ran = existsSync(marker)
  rmSync(marker, { force: true })
  assert.equal(ran, false, 'the generator ran on the host')
  assert.equal(st.status, 0, st.stdout + st.stderr)
  // Another seed needs the generator: refused here, with no sandbox for it.
  const other = spawnSync('python3', [path.join(AI, 'evals/lib/task.py'), 'selftest', cand, '3'], { encoding: 'utf8' })
  assert.equal(existsSync(marker), false, 'seed 3 ran the generator on the host')
  assert.notEqual(other.status, 0)
  // A recorded file name cannot leave the task's folder.
  const bad = writeCandidate(path.join(d, 'q2'), { id: '0123abcd4568', kind: 'sql', twin: { ...twin, files: [{ name: '../escaped.csv', b64: files[0].b64 }] }, outcome: 'claude_better', ola: { final: '', outputs: [], score: { all: false } }, claude: { final: '', outputs: [], score: { all: true } }, judge: { verdict: 'y' } })
  spawnSync('python3', [path.join(AI, 'evals/lib/task.py'), 'selftest', bad, '0'], { encoding: 'utf8' })
  assert.equal(existsSync(path.join(d, 'q2', 'escaped.csv')) || existsSync(path.join(d, 'escaped.csv')), false)
})

// Review 5: the real task copied every path Ola's read tools named, with tar's recursion: "." or a
// folder sent the whole folder, and an absolute path (the read tool takes one) sent files outside
// the project, /proc/self/environ among them, which holds the VM's gateway key.
test('the real task sends only the files Ola read by name in the project, never a folder or a path outside it', () => {
  assert.deepEqual(realFiles(['data/survey.csv', 'notes.md', 'notes.md', '.', 'data', '/proc/self/environ', '/etc/passwd', '../x', 'a/../../b', '.ola/home/.bash_history', '.ola', '-rf', 'a//b', './x']), ['data/survey.csv', 'notes.md', 'data'])
  assert.equal(realFiles(null).length, 0)
  // "data" may be a folder: tar runs with --no-recursion, so a folder is an empty entry.
  assert.match(readFileSync(path.join(AI, 'frontdesk/compare.mjs'), 'utf8'), /'tar', '-cf', '-', '--no-recursion', '-C', '\/work'/)
})

test('the weekly number and the Quality page count only finished comparisons, by kind and model', () => {
  const db = openDb(path.join(dir(), 'fd'))
  const { w, o } = project(db, { auto: 'ask' })
  const add = (kind, outcome, model = 'general', mode = 'twin') => db.prepare("INSERT INTO comparisons (id, workspace_id, person_id, session, message, mode, trigger, state, kind, outcome, label, ola_model, created_at, finished_at, cost_micro_usd) VALUES (lower(hex(randomblob(6))), ?, ?, 's', 'm', ?, 'asked', 'done', ?, ?, ?, ?, ?, ?, 1000)").run(w, o, mode, kind, outcome, outcome === 'claude_better' ? 'numbers_wrong' : null, model, Date.now(), Date.now())
  add('clean', 'both_right')
  add('clean', 'claude_better')
  add('clean', 'ola_better')
  add('coding', 'unsure')
  add('sql', 'claude_better', 'general', 'real')
  const wk = weekly(db)
  assert.deepEqual(wk.overall, { compared: 4, decided: 3, matched_or_beat: 2, share: 0.667, unsure: 1 })
  assert.equal(wk.by_kind.clean.share, 0.667)
  const q = quality(db, compareConfig({ OLA_HOME: dir() }))
  assert.deepEqual(q.total, { ola: 1, tie: 1, claude: 2, unsure: 1 })
  assert.deepEqual(q.reasons, [{ label: 'numbers_wrong', n: 2 }])
  assert.equal(q.cost.micro_usd, 5000)
})

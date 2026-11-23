#!/usr/bin/env node
// OLA-331: sweep.mjs post refuses while a daily idea of an earlier review is not built (done, or dropped
// by Bart; an idea with no ticket and a drop without his words count as not built) and names it; refuses
// while the day's own ideas are not new P1 tickets with their checks; refuses a repost that swaps an
// idea's ticket; names a stored review changed outside the tool. issues.mjs drop refuses an idea ticket
// without Bart's words. On a copy of the tracker (VENTURE_TRACKER_FAKE), never the real one, and with
// --dry: nothing is stored and nobody is texted.
//   node scripts/venture/sweep-ideas-test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fpOf } from './_sweepfp.mjs'

const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sweep-ideas-'))
const fake = join(dir, 'tracker.json')
// what Bart said, for the look-up of words given as his (a stand-in for steers.mjs --collect)
const said = join(dir, 'said.json')
writeFileSync(said, JSON.stringify([{ id: 1, at: new Date().toISOString(), source: 'terminal', where: 'm1', text: 'Hmm. OK drop OLA-213, the request matcher idea, we have the grader. And it is not needed after all.' }, { id: 2, at: new Date().toISOString(), source: 'imessage', where: 'm1', text: 'the garden club page looks great, ship it today' }, { id: 3, at: new Date().toISOString(), source: 'voice', where: 'm1', text: 'ola-325 is not wanted, the cards can wait' }, { id: 4, at: '2026-11-18T10:00:00Z', source: 'terminal', where: 'm1', text: '214: forget the model pinger, too early' }]))
const stub = join(dir, 'stub.mjs')
writeFileSync(stub, "import { readFileSync, writeFileSync } from 'node:fs'\nconst a = process.argv.slice(2)\nwriteFileSync(a[a.indexOf('--out') + 1], JSON.stringify({ messages: JSON.parse(readFileSync(process.env.STUB_SAID, 'utf8')), machines: [], host: 'here' }))\n")
const env = { ...process.env, VENTURE_TRACKER_FAKE: fake, VENTURE_STEERS_SCRIPT: stub, STUB_SAID: said }
delete env.VENTURE_PRIVATE
const node = (script, ...a) => spawnSync(process.execPath, [here(script), ...a], { encoding: 'utf8', env, timeout: 60000 })
const run = (...a) => node('sweep.mjs', ...a)
const BART = 'dropped: Bart: not needed'
const T = (n, status, extra = {}) => ({ id: `OLA-${n}`, num: n, project: 'ola', title: `ticket ${n}`, what: '', area: 'ops', status, priority: 'P1', who: 'lead', opened_at: '2026-11-19T20:00:00Z', updated_at: '2026-11-19T20:00:00Z', links: [], proof: status === 'dropped' ? BART : '', ...extra })
const DAYS = [
  { day: '2026-11-20', at: '2026-11-21T05:00:00Z', ideas: { kit: { text: 'x', issue: 'OLA-324' }, ola: { text: 'y', issue: 'OLA-325' } } },
  { day: '2026-11-19', at: '2026-11-20T05:00:00Z', ideas: { kit: { text: 'x', issue: 'OLA-213' }, ola: { text: 'y', issue: 'OLA-214' } } },
]
// every stored review has its fingerprint, as post leaves it (a test that wants another passes its own)
const prints = (days) => ({ key: 'sweeps_fp', at: '2026-11-21T05:00:00Z', value: Object.fromEntries(days.map((d) => [d.day, fpOf(d)])) })
const tracker = (st, { days = DAYS, extra = [], state = [] } = {}) => ({
  venture_issues: [T(213, st[213]), T(214, st[214]), T(324, st[324]), T(325, st[325]), ...extra],
  venture_state: [{ key: 'sweeps', at: '2026-11-21T05:00:00Z', value: { at: '2026-11-21T05:00:00Z', since: '2026-11-19', days } }, ...(state.some((x) => x.key === 'sweeps_fp') ? [] : [prints(days)]), ...state],
  venture_issue_activity: [],
  venture_commits: [],
})
const put = (t) => writeFileSync(fake, JSON.stringify(t))
const db = () => JSON.parse(readFileSync(fake, 'utf8'))
const entry = (ideas, day = '2026-11-21') => { const f = join(dir, 'entry.json'); writeFileSync(f, JSON.stringify({ day, summary: 'a made-up day', ideas })); return f }
const I = (k, o) => ({ kit: { text: 'x', why: 'y', issue: k }, ola: { text: 'x', why: 'y', issue: o } })
const internal = (id) => ({ key: `accept:${id}`, at: '2026-11-21T20:00:00Z', value: { checks: [], skips: [], internal: { why: 'nothing a person sees; test x', by: 'lead', at: '2026-11-21T20:00:00Z' }, ready: null } })
const ALL_BUILT = { 213: 'done', 214: 'done', 324: 'done', 325: 'dropped' }
const NEW = { opened_at: '2026-11-21T20:00:00Z' }
let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }

try {
  put(tracker({ 213: 'open', 214: 'done', 324: 'in_progress', 325: 'dropped' }))
  const before = readFileSync(fake, 'utf8')

  ok('ideas names the two unbuilt ideas and exits 1', () => {
    const r = run('ideas', '--day', '2026-11-21')
    assert.equal(r.status, 1, r.stderr)
    assert.match(r.stdout, /OLA-213 \(the Kit idea of 2026-11-19, open\)/)
    assert.match(r.stdout, /OLA-324 \(the Kit idea of 2026-11-20, in_progress\)/)
    assert.doesNotMatch(r.stdout, /OLA-214|OLA-325/, 'done, and dropped by Bart, are built')
  })

  ok('post refuses the next review and names them; nothing is stored', () => {
    const r = run('post', entry(I('OLA-400', 'OLA-401')), '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /the entry was not stored: 2 daily idea\(s\) of an earlier review are neither done nor dropped/)
    assert.match(r.stderr, /OLA-213/)
    assert.match(r.stderr, /OLA-324/)
    assert.equal(readFileSync(fake, 'utf8'), before, 'the copy of the tracker is unchanged')
  })

  ok("the review's own day is not held by its own ideas", () => {
    const r = run('ideas', '--day', '2026-11-20')
    assert.match(r.stdout, /OLA-213/)
    assert.doesNotMatch(r.stdout, /OLA-324/)
  })

  ok("an idea with no ticket, and a drop without Bart's words, count as not built", () => {
    const days = [{ day: '2026-11-20', at: '2026-11-21T05:00:00Z', ideas: { kit: { text: 'an idea nobody opened' }, ola: { text: 'y', issue: 'OLA-325' } } }, DAYS[1]]
    put(tracker({ 213: 'done', 214: 'done', 324: 'done', 325: 'open' }, { days }))
    const t = db(); t.venture_issues.find((i) => i.id === 'OLA-325').status = 'dropped'; t.venture_issues.find((i) => i.id === 'OLA-325').proof = 'dropped: x'; put(t)
    const r = run('ideas', '--day', '2026-11-21')
    assert.equal(r.status, 1)
    assert.match(r.stdout, /no ticket \(the Kit idea of 2026-11-20, no ticket\): an idea nobody opened/)
    assert.match(r.stdout, /OLA-325 \(the Ola idea of 2026-11-20, dropped without Bart's words\)/)
  })

  ok('issues.mjs drop: an idea ticket only with Bart\'s words; any other ticket as before', () => {
    put(tracker({ 213: 'open', 214: 'open', 324: 'open', 325: 'open' }, { extra: [T(500, 'open')] }))
    const r = node('issues.mjs', 'drop', 'OLA-213', '--why', 'x')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /Refused: OLA-213 is the daily idea of the 2026-11-19 review/)
    assert.equal(db().venture_issues.find((i) => i.id === 'OLA-213').status, 'open')
    assert.equal(node('issues.mjs', 'drop', 'OLA-213').status, 1, 'no --why at all')
    const b = node('issues.mjs', 'drop', 'OLA-213', '--why', 'Bart: not needed after all')
    assert.equal(b.status, 0, b.stderr)
    assert.equal(db().venture_issues.find((i) => i.id === 'OLA-213').proof, 'dropped: Bart: not needed after all')
    assert.equal(node('issues.mjs', 'drop', 'OLA-500', '--why', 'a duplicate').status, 0)
    const u = run('ideas', '--day', '2026-11-21')
    assert.doesNotMatch(u.stdout, /OLA-213/, 'dropped by Bart is settled')
  })

  ok("the day's own ideas: refused while a ticket is P2 or has no checks", () => {
    put(tracker(ALL_BUILT, { extra: [T(400, 'open', { ...NEW, priority: 'P2' }), T(401, 'open', NEW)], state: [internal('OLA-401')] }))
    const r = run('post', entry(I('OLA-400', 'OLA-401')), '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /OLA-400 is P2: a daily idea is P1 work/)
    assert.match(r.stderr, /OLA-400 has no checks/)
    assert.doesNotMatch(r.stderr, /OLA-401/)
  })

  ok("the day's own idea may not be an old ticket or one already done", () => {
    put(tracker(ALL_BUILT, { extra: [T(400, 'done', { finished_at: '2026-11-19T21:00:00Z' }), T(401, 'open', NEW)], state: [internal('OLA-400'), internal('OLA-401')] }))
    const r = run('post', entry(I('OLA-400', 'OLA-401')), '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /OLA-400 was opened on 2026-11-19, before the review of 2026-11-21/)
    assert.match(r.stderr, /OLA-400 was already done .* before this review was posted/)
    assert.doesNotMatch(r.stderr, /OLA-401/)
  })

  ok('a repost may not swap an idea for another ticket while the first is unbuilt, nor point at an old done one', () => {
    const days = [{ day: '2026-11-21', at: '2026-11-22T05:00:00Z', firstAt: '2026-11-22T05:00:00Z', ideas: { kit: { text: 'x', issue: 'OLA-400' }, ola: { text: 'y', issue: 'OLA-401' } } }, ...DAYS]
    put(tracker(ALL_BUILT, { days, extra: [T(400, 'open', NEW), T(401, 'open', NEW), T(402, 'open', NEW), T(90, 'done', { finished_at: '2026-11-18T21:00:00Z' })], state: [internal('OLA-400'), internal('OLA-401'), internal('OLA-402'), internal('OLA-90')] }))
    const r = run('post', entry(I('OLA-402', 'OLA-90')), '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /the Kit idea of 2026-11-21 named OLA-400 when it was posted, and this repost names OLA-402: OLA-400 is open/)
    assert.match(r.stderr, /OLA-90 was opened on 2026-11-19, before the review of 2026-11-21/)
    assert.match(r.stderr, /OLA-90 was already done .* before this review was first posted/)
    // the first one done: the swap is allowed (the next gate, the request match, then speaks)
    const t = db(); Object.assign(t.venture_issues.find((i) => i.id === 'OLA-400'), { status: 'done', finished_at: '2026-11-22T06:00:00Z' }); put(t)
    const r2 = run('post', entry(I('OLA-402', 'OLA-401')), '--dry')
    assert.match(r2.stderr, /not matched to tickets yet/, r2.stderr)
  })

  ok('a stored review changed outside the tool is named, by post and by ideas, until accepted', () => {
    put(tracker(ALL_BUILT, { extra: [T(400, 'open', NEW), T(401, 'open', NEW)], state: [internal('OLA-400'), internal('OLA-401'), { key: 'sweeps_fp', at: '2026-11-21T05:00:00Z', value: { '2026-11-20': 'not-its-print', '2026-11-19': 'x' } }] }))
    const r = run('post', entry(I('OLA-400', 'OLA-401')), '--dry')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /the stored review of 2026-11-20 \(its fingerprint differs\), 2026-11-19 \(its fingerprint differs\) may have been changed outside sweep.mjs post/)
    assert.match(run('ideas', '--day', '2026-11-21').stdout, /changed outside sweep.mjs post/)
    assert.equal(run('accept-review', '2026-11-20', '--why', 'short').status, 1, 'a reason is needed')
    for (const d of ['2026-11-20', '2026-11-19']) assert.equal(run('accept-review', d, '--why', 'checked by hand: only a typo fixed').status, 0)
    assert.ok(db().venture_state.some((x) => x.key.startsWith('override:') && /accepted as it is/.test(x.value.what)), 'a line in the overrides')
    const r2 = run('post', entry(I('OLA-400', 'OLA-401')), '--dry')
    assert.doesNotMatch(r2.stderr, /changed outside/)
    assert.match(r2.stderr, /not matched to tickets yet/)
  })

  ok('a posted review with no fingerprint is named (deleting the prints hides nothing)', () => {
    put(tracker(ALL_BUILT, { state: [{ key: 'sweeps_fp', at: '2026-11-21T05:00:00Z', value: { '2026-11-20': fpOf(DAYS[0]) } }] }))
    const r = run('ideas', '--day', '2026-11-21')
    assert.equal(r.status, 1)
    assert.match(r.stdout, /2026-11-19 \(it has no fingerprint\)/)
    assert.doesNotMatch(r.stdout, /2026-11-20 \(/)
    assert.match(run('post', entry(I('OLA-400', 'OLA-401')), '--dry').stderr, /2026-11-19 \(it has no fingerprint\)/)
  })

  ok("words given as Bart's are looked up: a drop, a close or a proof edit of an idea ticket with words he never said about it is refused, with a line; import cannot write over one", () => {
    put(tracker({ 213: 'open', 214: 'open', 324: 'open', 325: 'dropped' }))
    const iss = (...a) => node('issues.mjs', ...a)
    const no = iss('drop', 'OLA-213', '--why', 'Bart: drop it')
    assert.equal(no.status, 1)
    assert.match(no.stderr, /Refused: "drop it" is under 12 characters/)
    const no2 = iss('drop', 'OLA-213', '--why', 'Bart: not needed any more, drop it')
    assert.equal(no2.status, 1)
    assert.match(no2.stderr, /Refused: "not needed any more, drop it" is not in anything Bart typed, texted or said in the last 3 days/)
    assert.equal(db().venture_issues.find((i) => i.id === 'OLA-213').status, 'open')
    assert.ok(db().venture_state.some((x) => x.key.startsWith('override:') && /drop of the daily idea OLA-213 gave words as Bart's/.test(x.value.what)), 'a line in the overrides')
    // third pass (checker, Nov 23): words he said about something else, or before the ticket, are not his word on it
    const other = iss('drop', 'OLA-213', '--why', 'Bart: the garden club page looks great')
    assert.equal(other.status, 1)
    assert.match(other.stderr, /is in what Bart said, but not in a message that names OLA-213/)
    const early = iss('drop', 'OLA-214', '--why', 'Bart: forget the model pinger')
    assert.equal(early.status, 1)
    assert.match(early.stderr, /not in a message that names OLA-214 after it was opened/)
    const close = iss('done', 'OLA-213', '--proof', 'Bart: looks great, ship it today')
    assert.equal(close.status, 1, 'done with made-up Bart words on an idea ticket')
    assert.match(close.stderr, /Refused: .*not in a message that names OLA-213/)
    const imp = join(dir, 'import.json'); writeFileSync(imp, JSON.stringify([{ num: 213, title: 'x', area: 'ops', status: 'done' }]))
    const im = iss('import', imp)
    assert.equal(im.status, 1)
    assert.match(im.stderr, /OLA-213 is the daily idea of the 2026-11-19 review; import does not write over it/)
    assert.equal(db().venture_issues.find((i) => i.id === 'OLA-213').status, 'open')
    const yes = iss('drop', 'OLA-213', '--why', 'Bart: the request matcher idea, we have the grader')
    assert.equal(yes.status, 0, yes.stderr)
    assert.equal(db().venture_issues.find((i) => i.id === 'OLA-213').status, 'dropped')
    const ed = iss('edit', 'OLA-325', '--proof', 'dropped: Bart: x is not wanted anymore at all')
    assert.equal(ed.status, 1)
    assert.match(ed.stderr, /Refused: "x is not wanted anymore at all" is not in anything Bart typed/)
    assert.ok(db().venture_state.some((x) => x.key.startsWith('override:') && /an edit of the proof of the daily idea OLA-325/.test(x.value.what)))
    assert.equal(iss('edit', 'OLA-325', '--proof', 'dropped: Bart: we have the grader.').status, 1, 'words about OLA-213 are not his word on OLA-325')
    assert.equal(iss('edit', 'OLA-325', '--proof', 'dropped: Bart: ola-325 is not wanted').status, 0)
  })

  ok('when every idea is done or dropped by Bart, nothing holds the post', () => {
    put(tracker(ALL_BUILT))
    const r = run('ideas', '--day', '2026-11-21')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /every idea of the reviews before 2026-11-21 is done or dropped/)
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${n} checks passed`)

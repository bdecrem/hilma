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

const here = (f) => fileURLToPath(new URL(f, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sweep-ideas-'))
const fake = join(dir, 'tracker.json')
const env = { ...process.env, VENTURE_TRACKER_FAKE: fake }
delete env.VENTURE_PRIVATE
const node = (script, ...a) => spawnSync(process.execPath, [here(script), ...a], { encoding: 'utf8', env, timeout: 60000 })
const run = (...a) => node('sweep.mjs', ...a)
const BART = 'dropped: Bart: not needed'
const T = (n, status, extra = {}) => ({ id: `OLA-${n}`, num: n, project: 'ola', title: `ticket ${n}`, what: '', area: 'ops', status, priority: 'P1', who: 'lead', opened_at: '2026-11-19T20:00:00Z', updated_at: '2026-11-19T20:00:00Z', links: [], proof: status === 'dropped' ? BART : '', ...extra })
const DAYS = [
  { day: '2026-11-20', at: '2026-11-21T05:00:00Z', ideas: { kit: { text: 'x', issue: 'OLA-324' }, ola: { text: 'y', issue: 'OLA-325' } } },
  { day: '2026-11-19', at: '2026-11-20T05:00:00Z', ideas: { kit: { text: 'x', issue: 'OLA-213' }, ola: { text: 'y', issue: 'OLA-214' } } },
]
const tracker = (st, { days = DAYS, extra = [], state = [] } = {}) => ({
  venture_issues: [T(213, st[213]), T(214, st[214]), T(324, st[324]), T(325, st[325]), ...extra],
  venture_state: [{ key: 'sweeps', at: '2026-11-21T05:00:00Z', value: { at: '2026-11-21T05:00:00Z', since: '2026-11-19', days } }, ...state],
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
    assert.match(r.stderr, /the stored review of 2026-11-20, 2026-11-19 was changed outside sweep.mjs post since it was posted/)
    assert.match(run('ideas', '--day', '2026-11-21').stdout, /changed outside sweep.mjs post/)
    assert.equal(run('accept-review', '2026-11-20', '--why', 'short').status, 1, 'a reason is needed')
    for (const d of ['2026-11-20', '2026-11-19']) assert.equal(run('accept-review', d, '--why', 'checked by hand: only a typo fixed').status, 0)
    assert.ok(db().venture_state.some((x) => x.key.startsWith('override:') && /accepted as it is/.test(x.value.what)), 'a line in the overrides')
    const r2 = run('post', entry(I('OLA-400', 'OLA-401')), '--dry')
    assert.doesNotMatch(r2.stderr, /changed outside/)
    assert.match(r2.stderr, /not matched to tickets yet/)
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

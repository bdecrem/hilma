#!/usr/bin/env node
// Offline checks of the runner's choices (OLA-211): node scripts/venture/runner-test.mjs
import assert from 'node:assert/strict'
import { afterRun, caseKey, deployGate, caseState, ideaTickets, laneHolder, laneOf, leadLine, limitFrom, openCounts, parseReset, pickTicket, plateOrder, releasesIn, unbuiltIdeas, zonedTime } from './_plate.mjs'

let n = 0
const ok = (name, f) => { f(); n++; console.log(`ok ${name}`) }
const NOW = Date.parse('2026-11-20T02:30:00Z') // Nov 19, 6:30 pm Pacific
const ago = (m) => new Date(NOW - m * 60e3).toISOString()
const I = (num, pri, status = 'open', extra = {}) => ({ id: `OLA-${num}`, num, title: `ticket ${num}`, priority: pri, status, who: 'lead', opened_at: ago(10000 - num), updated_at: ago(600), started_at: null, finished_at: null, ...extra })

ok('P0 before P1, oldest first, waiting skipped', () => {
  const issues = [I(5, 'P1'), I(3, 'P1'), I(9, 'P0', 'waiting'), I(8, 'P0'), I(2, 'P2')]
  assert.equal(pickTicket(issues, { now: NOW }).pick.id, 'OLA-8')
})
ok('a fresh session heartbeat does not stop it; a claimed ticket is passed over', () => {
  const issues = [I(8, 'P0'), I(4, 'P0')]
  const r = pickTicket(issues, { sessionOpen: true, claims: { 'OLA-4': { who: 'builder', at: ago(5) } }, now: NOW })
  assert.equal(r.pick.id, 'OLA-8')
  assert.match(r.passed[0].why, /claimed by builder/)
})
ok('a claim older than 45 minutes has expired', () => {
  const r = pickTicket([I(4, 'P0')], { claims: { 'OLA-4': { who: 'builder', at: ago(46) } }, now: NOW })
  assert.equal(r.pick.id, 'OLA-4')
})
ok('in progress and touched recently, or started this evening by an open session: held', () => {
  const issues = [I(1, 'P0', 'in_progress', { updated_at: ago(10), who: 'builder' }), I(2, 'P0', 'in_progress', { started_at: ago(120), who: 'builder' }), I(3, 'P1')]
  assert.equal(pickTicket(issues, { sessionOpen: true, now: NOW }).pick.id, 'OLA-3')
  assert.equal(pickTicket(issues, { sessionOpen: false, now: NOW }).pick.id, 'OLA-2')
})
ok('the plate orders within a priority, not across', () => {
  const p = plateOrder('## P1, in order\n\n1. OLA-7: x\n2. OLA-3: y\n\nRecurring jobs you approved, also P1: OLA-175 (n), OLA-182.\n- OLA-1 closed')
  assert.deepEqual(p.order, ['OLA-7', 'OLA-3'])
  assert.deepEqual(p.recurring, ['OLA-175', 'OLA-182'])
  const issues = [I(3, 'P1'), I(7, 'P1'), I(9, 'P0')]
  assert.equal(pickTicket(issues, { order: p.order, now: NOW }).pick.id, 'OLA-9')
  assert.equal(pickTicket(issues.slice(0, 2), { order: p.order, now: NOW }).pick.id, 'OLA-7')
})
ok('recurring jobs and Bart\'s own tickets are not worked', () => {
  const issues = [I(190, 'P0', 'open', { title: 'Daily task D1, learnings' }), I(175, 'P0'), I(189, 'P0', 'open', { who: 'Bart' }), I(50, 'P2')]
  assert.equal(pickTicket(issues, { recurring: ['OLA-175'], now: NOW }).pick.id, 'OLA-50')
})
ok('two failed runs: given up until the ticket changes', () => {
  let t = afterRun({}, { status: 'in_progress', made: false })
  assert.equal(t.giveUp, false)
  t = afterRun(t.next, { status: 'in_progress', made: false, now: NOW })
  assert.equal(t.giveUp, true)
  const skippedAt = new Date(NOW).toISOString()
  assert.equal(pickTicket([I(4, 'P0', 'open', { updated_at: ago(30) })], { tickets: { 'OLA-4': { ...t.next, skippedAt } }, now: NOW }).pick, null)
  assert.equal(pickTicket([I(4, 'P0', 'open', { updated_at: new Date(NOW + 60e3).toISOString() })], { tickets: { 'OLA-4': { ...t.next, skippedAt } }, now: NOW + 2 * 60e3 }).pick.id, 'OLA-4')
})
ok('a run that pushed commits is progress, not a failure; four runs at most', () => {
  let s = {}
  for (let k = 0; k < 3; k++) { const r = afterRun(s, { status: 'in_progress', made: true }); assert.equal(r.giveUp, false); s = r.next }
  assert.equal(afterRun(s, { status: 'in_progress', made: true }).giveUp, true)
  assert.equal(afterRun(s, { status: 'done', made: true }).giveUp, false)
})
ok('blocked by another ticket: skipped until that one is done', () => {
  const issues = [I(150, 'P0'), I(210, 'P1', 'in_progress', { who: 'builder' }), I(5, 'P1')]
  const tickets = { 'OLA-150': { blockedBy: 'OLA-210' } }
  const r = pickTicket(issues, { tickets, now: NOW })
  assert.equal(r.pick.id, 'OLA-5') // OLA-5 is older than OLA-210
  assert.match(r.passed[0].why, /waits for OLA-210/)
  issues[1].status = 'done'
  assert.equal(pickTicket(issues, { tickets, now: NOW }).pick.id, 'OLA-150')
})

ok('the limit: a rejected rate-limit event gives the reset', () => {
  const out = '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1795168800,"rateLimitType":"five_hour"}}\n{"type":"result","subtype":"success","is_error":true,"result":"You\'ve hit your session limit · resets 2am (America/Los_Angeles)"}'
  const l = limitFrom(out, NOW)
  assert.equal(l.resetsAt, 1795168800e3)
  assert.match(l.text, /hit your session limit/)
})
ok('the limit: the message alone, "resets 2am", is the next 2 am Pacific', () => {
  const l = limitFrom('{"type":"result","subtype":"success","is_error":true,"result":"You\'ve hit your session limit · resets 2am (America/Los_Angeles)"}', NOW)
  assert.equal(new Date(l.resetsAt).toISOString(), '2026-11-20T10:00:00.000Z')
})
ok('the limit: "resets Nov 21, 5pm", "resets 2:30am", the old "|epoch" form', () => {
  assert.equal(new Date(parseReset("You've hit your weekly limit · resets Nov 21, 5pm", NOW)).toISOString(), '2026-11-22T01:00:00.000Z')
  assert.equal(new Date(parseReset('resets 2:30am', NOW)).toISOString(), '2026-11-20T10:30:00.000Z')
  assert.equal(limitFrom('Claude AI usage limit reached|1795168800', NOW).resetsAt, 1795168800e3)
})
ok('the limit with no time named: resetsAt null (the runner retries in 30 minutes)', () => {
  const l = limitFrom('{"type":"result","is_error":true,"subtype":"error_during_execution","result":"Usage limit reached"}', NOW)
  assert.equal(l.resetsAt, null)
})
ok('not the limit: a normal run, and a run whose agent talks about limits', () => {
  assert.equal(limitFrom('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1795168800}}\n{"type":"result","subtype":"success","is_error":false,"result":"done"}', NOW), null)
  assert.equal(limitFrom('{"type":"assistant","message":{"content":[{"type":"text","text":"Fixed the You\'ve hit your weekly limit message"}]}}\n{"type":"result","subtype":"success","is_error":false,"result":"RUNNER: done"}', NOW), null)
})
ok('zonedTime is right across the daylight change', () => {
  assert.equal(new Date(zonedTime(2026, 10, 20, 2, 0, 'America/Los_Angeles')).toISOString(), '2026-11-20T10:00:00.000Z')
  assert.equal(new Date(zonedTime(2026, 6, 1, 2, 0, 'America/Los_Angeles')).toISOString(), '2026-07-01T09:00:00.000Z')
})

ok('open issues now and at the end of yesterday, from the records', () => {
  const issues = [
    I(1, 'P1', 'open', { opened_at: '2026-11-17T12:00:00Z' }),
    I(2, 'P1', 'done', { opened_at: '2026-11-17T12:00:00Z', finished_at: '2026-11-19T20:00:00Z' }), // done today: open at midnight
    I(3, 'P1', 'done', { opened_at: '2026-11-17T12:00:00Z', finished_at: '2026-11-18T20:00:00Z' }), // done yesterday
    I(4, 'P1', 'open', { opened_at: '2026-11-19T20:00:00Z' }), // opened today
  ]
  assert.deepEqual(openCounts(issues, NOW), { n: 2, yesterday: 2 })
  assert.deepEqual(openCounts(issues, NOW, '2026-11-18'), { n: 2, yesterday: 3 })
})
ok('the line: working, IDLE, the limit', () => {
  const issues = [I(1, 'P0'), I(2, 'P1', 'done', { finished_at: ago(30) })]
  assert.match(leadLine(issues, { runner: { running: true, ticket: 'OLA-1', started: ago(20) }, now: NOW }).text, /Working on OLA-1 since/)
  const idle = leadLine(issues, { runner: { running: false, ended: ago(90) }, now: NOW })
  assert.equal(idle.idle, true)
  assert.match(idle.text, /IDLE since/)
  assert.match(idle.text, /1 open \(1 P0, 0 P1, 0 P2\) · last finished OLA-2/)
  assert.equal(leadLine(issues, { runner: { running: false, ended: ago(20) }, now: NOW }).idle, false)
  assert.match(leadLine(issues, { claims: { 'OLA-1': { who: 'builder', at: ago(5), since: ago(40) } }, now: NOW }).text, /Working on OLA-1 since .* \(builder\)/)
  assert.match(leadLine(issues, { runner: { running: false, ended: ago(90) }, limit: { kind: 'limit', until: new Date(NOW + 3600e3).toISOString() }, now: NOW }).text, /limit reached, starts again/)
})
ok('a run that waits on a time is left alone until then, and is not a failed run', () => {
  const r = afterRun({ runs: 2, fails: 1 }, { status: 'in_progress', made: false, waitUntil: '2026-11-23T00:00Z', now: NOW })
  assert.equal(r.giveUp, false)
  assert.equal(r.next.fails, 0)
  assert.equal(r.next.waitUntil, '2026-11-23T00:00:00.000Z')
  const issues = [I(174, 'P1', 'in_progress', { who: 'runner' }), I(200, 'P2')]
  const p = pickTicket(issues, { tickets: { 'OLA-174': r.next }, now: NOW })
  assert.equal(p.pick.id, 'OLA-200')
  assert.match(p.passed[0].why, /waits until 2026-11-23/)
  assert.equal(pickTicket(issues, { tickets: { 'OLA-174': r.next }, now: Date.parse('2026-11-23T00:01Z') }).pick.id, 'OLA-174')
  assert.equal(afterRun({}, { status: 'in_progress', made: false, waitUntil: ago(5), now: NOW }).next.fails, 1)
})

ok('OLA-251: lanes from the ticket; one builder in the server lane; roles, holds that build, waiting builders', () => {
  assert.equal(laneOf({ area: 'web' }), 'server')
  assert.equal(laneOf({ area: 'apps' }), 'apps')
  assert.equal(laneOf({ area: 'ops', title: 'An update to the test server is refused' }), 'server')
  assert.equal(laneOf({ area: 'ops', title: 'Learning system, second round' }), 'tools')
  assert.equal(laneOf({ area: 'apps' }, 'server'), 'server', 'a lane set on the ticket (issues.mjs edit --lane) is the lane')
  assert.equal(laneOf({ area: 'web' }, 'foo'), 'server', 'an unknown lane is not a lane')
  const issues = [I(1, 'P0', 'in_progress', { area: 'web' }), I(2, 'P0', 'open', { area: 'model' }), I(3, 'P0', 'open', { area: 'apps' }), I(4, 'P1', 'open', { area: 'ops', title: 'scripts' })]
  const claims = { 'OLA-1': { who: 'builder', at: ago(5) } }
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims, now: NOW }).id, 'OLA-1')
  assert.equal(laneHolder({ id: 'OLA-3', lane: 'apps', issues, claims, now: NOW }), null, 'the apps lane is not limited')
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims: { 'OLA-1': { who: 'checker', at: ago(5) } }, now: NOW }), null, 'a checker holds no lane')
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims: { 'OLA-1': { who: 'lead', at: ago(5) } }, now: NOW }), null, 'a hold takes no lane')
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims: { 'OLA-1': { who: 'builder-checker', at: ago(5) } }, now: NOW }).id, 'OLA-1', 'a name that contains "checker" is a builder')
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims: { 'OLA-1': { who: 'x', role: 'checker', at: ago(5) } }, now: NOW }), null, 'the role, not the name')
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims: { 'OLA-4': { who: 'lead', at: ago(5) } }, building: { 'OLA-4': 'its commits change apps/activist-ai/x' }, now: NOW }).id, 'OLA-4', 'a hold whose ticket gets server commits is building')
  assert.equal(laneHolder({ id: 'OLA-2', lane: 'server', issues, claims: { 'OLA-1': { who: 'builder', at: ago(50) } }, now: NOW }), null, 'an expired claim holds nothing')
  assert.equal(laneHolder({ id: 'OLA-1', lane: 'server', issues, claims, now: NOW }), null, 'its own claim is a renewal')
  // the runner takes the top unclaimed ticket whose lane is free
  const r = pickTicket(issues, { claims, now: NOW })
  assert.equal(r.pick.id, 'OLA-3')
  assert.match(r.passed.find((p) => p.id === 'OLA-2').why, /server lane is held by builder on OLA-1/)
  // and when the runner itself holds the server lane, that does not stop its own next pick
  assert.equal(pickTicket([I(2, 'P0', 'open', { area: 'model' })], { claims: { 'OLA-1': { who: 'runner', at: ago(5) } }, now: NOW }).pick.id, 'OLA-2')
  // the runner yields: a builder waiting for the server lane on a P0 goes before the runner's next P1 there
  const two = [I(5, 'P1', 'open', { area: 'web' }), I(6, 'P2', 'open', { area: 'ops', title: 'scripts' })]
  const w = { 'OLA-9': { who: 'builder', lane: 'server', priority: 'P0', at: ago(1) } }
  const y = pickTicket(two, { waiters: w, now: NOW })
  assert.equal(y.pick.id, 'OLA-6')
  assert.match(y.passed[0].why, /waiting for the server lane with OLA-9 \(P0\)/)
  assert.equal(pickTicket(two, { waiters: { 'OLA-9': { ...w['OLA-9'], priority: 'P1' } }, now: NOW }).pick.id, 'OLA-6', 'a waiter of the same priority, already waiting, goes first')
  assert.equal(pickTicket(two, { waiters: { 'OLA-9': { ...w['OLA-9'], priority: 'P2' } }, now: NOW }).pick.id, 'OLA-5', 'a waiter of a lower priority does not stop it')
  assert.equal(pickTicket(two, { waiters: { 'OLA-9': { ...w['OLA-9'], at: ago(10) } }, now: NOW }).pick.id, 'OLA-5', 'a waiter that stopped renewing is gone')
})
ok('OLA-251, OLA-259: a check passed by a request-test case says what that case says now in the result file', () => {
  const cases = { 'p@cloud-web:chat': { status: 'passing', tries: '2 of 2 passed', release: 'aaaaaaaaaaaa' }, 's@cloud-web:chat': { status: 'passing', tries: '2 of 3 passed' }, 'v@cloud-web:chat': { status: 'passing', verdict: 'works sometimes (2 of 3)' }, 'q@local-mac:chat': { status: 'not working yet', tries: '0 of 2 passed' }, 'n@x:chat': { status: 'not run' } }
  assert.equal(caseState('p@cloud-web:chat', cases).state, 'works')
  assert.equal(caseState('p@cloud-web:chat', cases).release, 'aaaaaaaaaaaa')
  assert.equal(caseState('s@cloud-web:chat', cases).state, 'sometimes', '2 of 3 in a file written before the verdict field')
  assert.equal(caseState('v@cloud-web:chat', cases).state, 'sometimes')
  assert.equal(caseState('q@local-mac:chat', cases).state, 'fails')
  assert.equal(caseState('n@x:chat', cases).state, 'not run')
  assert.equal(caseState('p@cloud-web', cases).state, 'unknown', 'a different spelling is not the case')
  assert.equal(caseState('made-up@nowhere', cases).state, 'unknown')
  assert.equal(caseKey('case p@cloud-web:chat'), 'p@cloud-web:chat')
  assert.deepEqual(releasesIn('on da4380403a13 (and 25734224)'), ['da4380403a13'])
})

ok('OLA-272: the test server is updated only for a ready ticket, 45 minutes apart (unless a P0 waits), and not under a checker', () => {
  const ready = [{ id: 'OLA-5', priority: 'P1' }]
  assert.equal(deployGate({ pending: [], lastAttempt: ago(120), now: NOW }).ok, false, 'nothing ready, no update')
  assert.match(deployGate({ pending: [], now: NOW }).why, /no ticket is ready/)
  assert.equal(deployGate({ pending: ready, lastAttempt: ago(44), now: NOW }).ok, false, 'a clock just under 45 minutes')
  assert.match(deployGate({ pending: ready, lastAttempt: ago(44), now: NOW }).why, /44 min ago/)
  assert.equal(deployGate({ pending: ready, lastAttempt: ago(44), now: NOW }).nextAllowed, new Date(NOW + 60e3).toISOString())
  assert.equal(deployGate({ pending: ready, lastAttempt: ago(46), now: NOW }).ok, true)
  assert.equal(deployGate({ pending: [{ id: 'OLA-6', priority: 'P0' }], lastAttempt: ago(10), now: NOW }).ok, true, 'a ready P0 goes before the 45 minutes')
  assert.equal(deployGate({ pending: ready, lastAttempt: ago(10), now: NOW }).ok, false, 'a P0 that is not ready is not in pending, so it does not count')
  assert.equal(deployGate({ pending: ready, lastAttempt: ago(60), checkerAt: [{ id: 'OLA-7', at: ago(14), what: 'check #2 passed on OLA-7' }], now: NOW }).ok, false, 'a checker 14 minutes ago')
  assert.equal(deployGate({ pending: ready, lastAttempt: ago(60), checkerAt: [{ id: 'OLA-7', at: ago(16), what: 'check #2 passed on OLA-7' }], now: NOW }).ok, true, 'a checker 16 minutes ago')
  assert.equal(deployGate({ pending: [{ id: 'OLA-6', priority: 'P0' }], lastAttempt: ago(5), checkerAt: [{ id: 'OLA-7', at: ago(3), what: 'a checker claim' }], now: NOW }).ok, false, 'a P0 does not interrupt a checker')
  assert.equal(deployGate({ pending: ready, checkerAt: [], now: NOW }).ok, true, 'no attempt on record')
})

// OLA-331 (Bart, Nov 20: "They should always be built duh!! So they are immediately implemented")
ok('daily ideas first: after P0, before every other P1 and P2, older review first', () => {
  const days = [
    { day: '2026-11-19', ideas: { kit: { issue: 'OLA-213' }, ola: { issue: 'OLA-214' } } },
    { day: '2026-11-20', ideas: { kit: { issue: 'OLA-324' }, ola: { issue: 'OLA-325' } } },
    { day: '2026-11-10', ideas: { kit: { issue: 'OLA-100' }, ola: { issue: 'OLA-101' } } },
  ]
  assert.deepEqual(ideaTickets(days), ['OLA-100', 'OLA-101', 'OLA-213', 'OLA-214', 'OLA-324', 'OLA-325'])
  assert.deepEqual(ideaTickets(days, 2), ['OLA-213', 'OLA-214', 'OLA-324', 'OLA-325'], 'only the latest reviews')
  const ideas = ideaTickets(days, 2)
  const issues = [I(5, 'P1'), I(6, 'P1'), I(325, 'P2'), I(324, 'P2')]
  assert.equal(pickTicket(issues, { now: NOW }).pick.id, 'OLA-5', 'without the ideas, priority decides')
  assert.equal(pickTicket(issues, { ideas, now: NOW }).pick.id, 'OLA-324', 'a P2 idea before an older P1')
  assert.equal(pickTicket([...issues, I(9, 'P0')], { ideas, now: NOW }).pick.id, 'OLA-9', 'a P0 still goes first')
  assert.equal(pickTicket([...issues, I(214, 'P2')], { ideas, now: NOW }).pick.id, 'OLA-214', 'the older review first')
  const r = pickTicket([...issues, I(214, 'P2')], { ideas, claims: { 'OLA-214': { who: 'builder', at: ago(5) } }, now: NOW })
  assert.equal(r.pick.id, 'OLA-324', 'an idea a builder holds is passed over like any ticket')
  assert.equal(pickTicket([I(5, 'P1'), I(324, 'P2', 'done')], { ideas, now: NOW }).pick.id, 'OLA-5', 'a built idea is not picked')
})

ok('unbuilt ideas of earlier reviews: neither done nor dropped, the day itself excluded', () => {
  const days = [
    { day: '2026-11-19', ideas: { kit: { issue: 'OLA-213' }, ola: { issue: 'OLA-214' } } },
    { day: '2026-11-20', ideas: { kit: { issue: 'OLA-324' }, ola: { issue: 'OLA-325' } } },
  ]
  const issues = [I(213, 'P1', 'done'), I(214, 'P1', 'dropped'), I(324, 'P1', 'in_progress'), I(325, 'P1', 'waiting')]
  assert.deepEqual(unbuiltIdeas(days, issues, '2026-11-21').map((x) => x.id), ['OLA-324', 'OLA-325'])
  assert.deepEqual(unbuiltIdeas(days, issues, '2026-11-20').map((x) => x.id), [], 'a repost of the same day is not held by its own ideas')
  assert.equal(unbuiltIdeas(days, [], '2026-11-21')[0].status, 'not in the tracker')
  assert.deepEqual(unbuiltIdeas(days, issues.map((i) => ({ ...i, status: 'done' })), '2026-11-21'), [])
})

console.log(`${n} checks passed`)

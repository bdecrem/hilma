#!/usr/bin/env node
// Offline checks of the runner's choices (OLA-211): node scripts/venture/runner-test.mjs
import assert from 'node:assert/strict'
import { afterRun, leadLine, limitFrom, openCounts, parseReset, pickTicket, plateOrder, zonedTime } from './_plate.mjs'

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
console.log(`${n} checks passed`)

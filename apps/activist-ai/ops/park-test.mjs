// node --test ops/park-test.mjs: an update's suites get room on a machine people are using (OLA-240).
// Made-up projects in a temp folder; no VM, no front desk.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PARK_IDLE_MS, ROOM_WAIT_MS, WAKE_GIVE_UP_MS, files, makeParker, parkedNow, requestPark, standing, waitAnswered } from './park.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIN = 60_000

// A made-up machine: projects with a running flag, an idle time and a busy flag.
function machine(home, projects, { clock } = {}) {
  const t = clock ?? { now: Date.now() }
  const said = []
  const calls = { park: [], wake: [] }
  const fail = new Set()
  const parker = () =>
    makeParker({
      home,
      now: () => t.now,
      log: (m) => said.push(m),
      candidates: async () => projects.map((p) => ({ ...p })),
      park: async (slug) => {
        calls.park.push(slug)
        projects.find((p) => p.slug === slug).running = false
      },
      wake: async (slug) => {
        calls.wake.push(slug)
        if (fail.has(slug)) throw Object.assign(new Error('full'), { code: 'MACHINE_BUSY' })
        projects.find((p) => p.slug === slug).running = true
      },
    })
  return { parker, said, calls, fail, clock: t }
}
const settle = () => new Promise((r) => setTimeout(r, 20))
const home = () => mkdtempSync(path.join(tmpdir(), 'park-'))

test('the Nov 20 refusal: two idle projects and a checker\'s are parked, one in use is left alone', async () => {
  const h = home()
  const projects = [
    { slug: 'bart-a', running: true, idleMs: 40 * MIN, busy: false },
    { slug: 'kim-b', running: true, idleMs: 7 * MIN, busy: false },
    { slug: 'chk240-test', running: true, idleMs: 6 * MIN, busy: false },
    { slug: 'lee-c', running: true, idleMs: 1 * MIN, busy: false }, // just used
    { slug: 'ann-d', running: true, idleMs: 30 * MIN, busy: true }, // a run executing
    { slug: 'off-e', running: false, idleMs: 99 * MIN, busy: false },
  ]
  const m = machine(h, projects)
  const end = requestPark(h, { by: 'deploy abc' })
  const p = m.parker()
  const r = await p.poll()
  assert.deepEqual(m.calls.park.sort(), ['bart-a', 'chk240-test', 'kim-b'])
  assert.equal(r.request, end.at)
  assert.deepEqual(r.kept.map((k) => k.slug).sort(), ['ann-d', 'lee-c'])
  assert.match(r.kept.find((k) => k.slug === 'ann-d').why, /in use/)
  assert.deepEqual((await waitAnswered(h, end.at, { ms: 100 })).parked.sort(), ['bart-a', 'chk240-test', 'kim-b'])
  // Still standing: one that becomes idle meanwhile is parked too; nothing is parked twice.
  projects.find((x) => x.slug === 'lee-c').idleMs = 6 * MIN
  await p.poll()
  assert.deepEqual(m.calls.park.sort(), ['bart-a', 'chk240-test', 'kim-b', 'lee-c'])
  assert.ok(!m.calls.park.includes('ann-d'), 'a project with a run executing is never parked')
  rmSync(h, { recursive: true, force: true })
})

test('when the update ends, what was parked is started again, and then forgotten', async () => {
  const h = home()
  const projects = [
    { slug: 'a', running: true, idleMs: 10 * MIN, busy: false },
    { slug: 'b', running: true, idleMs: 10 * MIN, busy: false },
  ]
  const m = machine(h, projects)
  const p = m.parker()
  const end = requestPark(h, { by: 'deploy x' })
  await p.poll()
  assert.deepEqual(m.calls.park.sort(), ['a', 'b'])
  // A person opened b during the suites (the front desk woke it): it is not started twice.
  projects.find((x) => x.slug === 'b').running = true
  end()
  assert.equal(existsSync(files(h).request), false)
  await p.poll()
  await settle()
  assert.deepEqual(m.calls.wake, ['a'])
  assert.ok(m.said.some((l) => /a: started again/.test(l)), m.said.join('\n'))
  await p.poll()
  assert.equal(existsSync(files(h).parked), false, 'forgotten once all are up')
  rmSync(h, { recursive: true, force: true })
})

test('a start refused (the machine full) is tried again, and given up after 15 minutes', async () => {
  const h = home()
  const projects = [{ slug: 'a', running: true, idleMs: 10 * MIN, busy: false }]
  const m = machine(h, projects)
  const p = m.parker()
  const end = requestPark(h, {})
  await p.poll()
  end()
  m.fail.add('a')
  await p.poll()
  await settle()
  await p.poll()
  await settle()
  assert.equal(m.calls.wake.length, 2)
  assert.deepEqual(parkedNow(h).parked, ['a'])
  m.clock.now += WAKE_GIVE_UP_MS + 1
  await p.poll()
  assert.equal(m.calls.wake.length, 2)
  assert.equal(existsSync(files(h).parked), false)
  assert.ok(m.said.some((l) => /starts on its next request/.test(l)))
  rmSync(h, { recursive: true, force: true })
})

test('a front desk restart in between (a passing update restarts it) keeps the list and starts them again', async () => {
  const h = home()
  const projects = [{ slug: 'a', running: true, idleMs: 10 * MIN, busy: false }]
  const m = machine(h, projects)
  const end = requestPark(h, {})
  await m.parker().poll()
  // The new front desk: every project counts as just used, so nothing new is parked, and a is kept on the list.
  projects[0].idleMs = 0
  await m.parker().poll()
  assert.deepEqual(parkedNow(h).parked, ['a'])
  end()
  await m.parker().poll()
  await settle()
  assert.deepEqual(m.calls.wake, ['a'])
  rmSync(h, { recursive: true, force: true })
})

test('a request ends only by its own update, or by itself after its until (an update that was killed)', () => {
  const h = home()
  const first = requestPark(h, { untilMs: 10 * MIN, now: 1000 })
  const second = requestPark(h, { now: 2000 })
  first()
  assert.equal(standing(h, 3000)?.at, 2000, "the first update's end leaves the second's request")
  second()
  assert.equal(standing(h, 3000), null)
  requestPark(h, { untilMs: 10 * MIN, now: 1000 })
  assert.ok(standing(h, 1000 + 9 * MIN))
  assert.equal(standing(h, 1000 + 11 * MIN), null)
  assert.equal(PARK_IDLE_MS, 5 * MIN)
  assert.doesNotMatch(readFileSync(files(h).request, 'utf8'), /KEY|PASSWORD|TOKEN/i)
  rmSync(h, { recursive: true, force: true })
})

test('the update parks before its VM suites, waits up to 20 min for room, and ends the request after them', () => {
  const tool = readFileSync(path.join(AI, 'ops/ola.mjs'), 'utf8')
  const body = tool.slice(tool.indexOf('async function deploy('))
  const req = body.indexOf('unpark = requestPark(')
  const room = body.indexOf('waitForRoom([], VM_SUITE_NEED, { ms: ROOM_WAIT_MS')
  const lanesRun = body.indexOf('plannedLanes.map(async (lane)')
  const ended = body.indexOf('unpark() // the suites are done')
  assert.ok(req > 0 && req < room && room < lanesRun && lanesRun < ended, `${req} ${room} ${lanesRun} ${ended}`)
  assert.match(body, /process\.on\('exit', unpark\)/)
  assert.match(body.slice(body.indexOf('const refuse = (m) =>'), body.indexOf('const refuse = (m) =>') + 300), /unpark\(\)/)
  assert.equal(ROOM_WAIT_MS, 20 * MIN)
  const fd = readFileSync(path.join(AI, 'frontdesk/workspaces.mjs'), 'utf8')
  assert.match(fd, /park\.makeParker\(/)
  assert.match(fd, /park: \(slug\) => sleep\(slug/, 'parked the idle stop\'s way, so an open tab does not wake it')
})

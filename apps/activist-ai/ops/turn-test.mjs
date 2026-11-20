// The machine's one test turn (ops/turn.mjs, OLA-83): order, deploys first, stale turns cleared,
// inheritance, the command. Each test in its own folder (OLA_TURN_HOME); no VM is started.
//   node --test ops/turn-test.mjs
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { acquire, holder, turnPaths, waiting } from './turn.mjs'

const TURN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'turn.mjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const kids = []
/** A live pid standing for one builder or deploy (a sleeping child). */
const someone = () => {
  const c = spawn('/bin/sleep', ['60'], { stdio: 'ignore' })
  c.unref()
  kids.push(c)
  return c.pid
}
const deadPid = () => spawnSync('/usr/bin/true').pid
process.on('exit', () => kids.forEach((k) => k.kill()))
const fresh = () => turnPaths(mkdtempSync(path.join(tmpdir(), 'ola-turn-')))
const opts = (P, extra) => ({ P, poll: 20, ...extra })
/** Resolves with its name once the acquire resolves, so the order can be read. */
const order = []
const enter = (P, name, extra = {}) => acquire(opts(P, { label: name, pid: someone(), ...extra })).then((t) => (order.push(name), t))

test('first come, first served among builders', async () => {
  order.length = 0
  const P = fresh()
  const a = await enter(P, 'a')
  const b = enter(P, 'b')
  await sleep(30)
  const c = enter(P, 'c')
  await sleep(100)
  assert.deepEqual(order, ['a'], 'b and c wait while a holds the turn')
  a.release()
  ;(await b).release()
  ;(await c).release()
  assert.deepEqual(order, ['a', 'b', 'c'])
  assert.equal(existsSync(P.lock), false)
})

test('a deploy goes before every waiting builder, and builders wait out its turn', async () => {
  order.length = 0
  const P = fresh()
  const a = await enter(P, 'a')
  const b = enter(P, 'b')
  await sleep(30)
  const d = enter(P, 'deploy', { deploy: true })
  await sleep(50)
  assert.equal(existsSync(P.hold), true, 'the hold is down while the deploy waits')
  assert.equal(waiting(P)[0].label, 'deploy', 'the deploy is first in line')
  a.release()
  const dt = await d
  await sleep(100)
  assert.deepEqual(order, ['a', 'deploy'], 'b still waits while the deploy holds the turn')
  dt.release()
  assert.equal(existsSync(P.hold), false, 'the hold is lifted with the turn')
  ;(await b).release()
  assert.deepEqual(order, ['a', 'deploy', 'b'])
})

test('a builder does not start while a deploy holds back the machine, even with the turn free', async () => {
  order.length = 0
  const P = fresh()
  writeFileSync(P.hold, `${someone()}\n`) // another deploy, still unpacking and building
  const b = enter(P, 'b')
  await sleep(100)
  assert.deepEqual(order, [])
  writeFileSync(P.hold, `${deadPid()}\n`) // that deploy is gone: its hold is cleared
  ;(await b).release()
  assert.deepEqual(order, ['b'])
})

test('a turn whose holder is gone, and a dead waiter, are cleared', async () => {
  const P = fresh()
  mkdirSync(P.lock)
  writeFileSync(path.join(P.lock, 'owner'), `pid ${deadPid()} crashed check\n`)
  mkdirSync(P.queue, { recursive: true })
  writeFileSync(path.join(P.queue, `1-${deadPid()}.json`), JSON.stringify({ pid: deadPid(), label: 'gone', deploy: true, at: 1 }))
  const t = await acquire(opts(P, { label: 'next', pid: someone() }))
  assert.match(readFileSync(path.join(P.lock, 'owner'), 'utf8'), /next/)
  assert.deepEqual(readdirSync(P.queue), [])
  t.release()
})

test("a shell script's turn (owner without a pid) is waited out", async () => {
  order.length = 0
  const P = fresh()
  mkdirSync(P.lock)
  writeFileSync(path.join(P.lock, 'owner'), 'fu2 Thu Nov 19\n')
  assert.equal(holder(P).shell, true)
  const b = enter(P, 'b')
  await sleep(100)
  assert.deepEqual(order, [])
  spawnSync('/bin/rm', ['-rf', P.lock])
  ;(await b).release()
  assert.deepEqual(order, ['b'])
})

test('an aborted wait takes back its ticket and its hold', async () => {
  const P = fresh()
  const a = await enter(P, 'a')
  const ac = new AbortController()
  const d = acquire(opts(P, { label: 'deploy', deploy: true, pid: someone(), signal: ac.signal }))
  await sleep(50)
  ac.abort()
  assert.equal(await d, null)
  assert.equal(existsSync(P.hold), false)
  assert.equal(waiting(P).length, 0)
  a.release()
})

const cli = (home, args, env = {}) =>
  new Promise((resolve) => {
    const c = spawn(process.execPath, [TURN, ...args], { env: { ...process.env, OLA_TURN_HELD: '', OLA_TURN_HOME: home, ...env } })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (out += d))
    c.on('close', (code) => resolve({ code, out }))
  })

test('run: holds the turn for the command, passes its exit code, lets its children inherit', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'ola-turn-'))
  // The child takes a turn itself (as a suite does) and must not wait for its parent's.
  const child = `const t = await import(${JSON.stringify(TURN)}); const r = await t.takeTurn('inner'); console.log(r === null ? 'inherited' : 'queued'); process.exit(3)`
  const r = await cli(home, ['run', '--label', 'outer', '--', process.execPath, '--input-type=module', '-e', child])
  assert.equal(r.code, 3)
  assert.match(r.out, /inherited/)
  assert.equal(existsSync(path.join(home, 'suite.lock')), false, 'the turn is given back')
  const s = await cli(home, ['status'])
  assert.match(s.out, /turn: free/)
})

test('a suite started on its own waits for the holder, then runs', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'ola-turn-'))
  const P = turnPaths(home)
  const a = await acquire(opts(P, { label: 'a builder', pid: someone() }))
  const child = `const t = await import(${JSON.stringify(TURN)}); await t.takeTurn('workspace check'); console.log('ran')`
  const p = cli(home, ['run', '--', process.execPath, '--input-type=module', '-e', child])
  await sleep(1500)
  const s = await cli(home, ['status'])
  assert.match(s.out, /turn: a builder/)
  assert.match(s.out, /1\. workspace check|1\. .*node/)
  a.release()
  const r = await p
  assert.equal(r.code, 0)
  assert.match(r.out, /ran/)
})

// OLA-412: a project a person opens on a full machine does not wait behind idle ones. With the four
// slots taken, the start stops the running project that has gone longest without use (never one
// with a run executing, never one used within roomIdleMs) and tries once more; when every running
// project is in use, the person still hears "machine busy". An update's restart of parked projects
// keeps their idle clock. No VM: a stand-in for ws.mjs keeps the set of running projects, and one
// fake opencode socket says a run is executing.
// Run: node --test test/room.test.mjs (also part of frontdesk/check.mjs).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'

const tmp = mkdtempSync('/tmp/ola-room-') // short: a unix socket path has a length limit
process.env.OLA_HOME = path.join(tmp, 'ola')
const { openDb, loadKeys } = await import('../db.mjs')
const { makeWorkspaces } = await import('../workspaces.mjs')
const wsPaths = (await import('../../workspace/ws.mjs')).paths

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const MAX = 4

function desk(roomIdleMs) {
  const up = new Set()
  const calls = []
  const wsRun = async (cmd, slug) => {
    calls.push(`${cmd} ${slug}`)
    if (cmd === 'stop') return void up.delete(slug)
    if (up.has(slug)) return
    if (up.size >= MAX) throw Object.assign(new Error('4 workspaces are already running'), { code: 'MACHINE_BUSY' })
    up.add(slug)
  }
  const dir = mkdtempSync(path.join(tmp, 'fd-'))
  const lines = []
  const w = makeWorkspaces({ db: openDb(dir), keys: loadKeys(dir), log: (m) => lines.push(m), idleStopMs: 0, runCeilingMs: 0, roomIdleMs, wsRun, runningIds: () => [...up] })
  return { w, up, calls, lines }
}

// One project whose opencode says a run is executing (the front desk asks it before stopping).
async function executing(slug) {
  const p = wsPaths(slug)
  mkdirSync(path.dirname(p.opencode), { recursive: true, mode: 0o700 })
  writeFileSync(p.secrets, 'OPENCODE_PASSWORD=made-up\n', { mode: 0o600 })
  const s = http.createServer((req, res) => {
    req.resume()
    if (req.url.startsWith('/api/session/active')) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: { ses_run: { type: 'running' } } }))
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  await new Promise((r) => s.listen(p.opencode, r))
  return s
}

test('a full machine stops the longest-idle project that is not running anything, and the new one starts', async () => {
  const fake = await executing('room-d')
  const { w, up, calls, lines } = desk(300)
  try {
    // Idle longest to shortest: d (a run executing), b, a; c was used just now.
    for (const s of ['room-d', 'room-b', 'room-a']) (await w.ensureRunning(s), await pause(40))
    await pause(350)
    await w.ensureRunning('room-c')
    assert.deepEqual([...up].sort(), ['room-a', 'room-b', 'room-c', 'room-d'])
    await w.ensureRunning('room-new')
    assert.deepEqual([...up].sort(), ['room-a', 'room-c', 'room-d', 'room-new'])
    assert.ok(calls.includes('stop room-b') && !calls.includes('stop room-d'), calls.join(', '))
    assert.ok(lines.some((l) => /^room-b: stopped after \d+ min idle to make room for room-new$/.test(l)), lines.join('\n'))
    // The stopped one wakes on its next request, making room again (a is now the longest idle).
    await pause(350)
    await w.ensureRunning('room-b')
    assert.ok(up.has('room-b') && !up.has('room-a'), [...up].join(', '))
  } finally {
    w.close()
    fake.close()
  }
})

test('when every running project is in use, the start is refused as machine busy and nothing is stopped', async () => {
  const { w, up, calls } = desk(60_000)
  try {
    for (const s of ['busy-a', 'busy-b', 'busy-c', 'busy-d']) await w.ensureRunning(s)
    await assert.rejects(w.ensureRunning('busy-new'), (e) => e.code === 'MACHINE_BUSY')
    assert.equal(up.size, 4)
    assert.ok(!calls.some((c) => c.startsWith('stop')), calls.join(', '))
  } finally {
    w.close()
  }
})

test('a start that is not use (the update restarting parked projects) keeps the idle clock and never stops another', async () => {
  const { w, up, calls } = desk(300)
  try {
    for (const s of ['park-a', 'park-b', 'park-c', 'park-d']) await w.ensureRunning(s)
    await pause(350)
    // park-a is stopped and started again the way an update's restart does it: still idle.
    await w.ensureRunning('park-x').catch(() => {}) // makes room by stopping one of them
    const gone = ['park-a', 'park-b', 'park-c', 'park-d'].find((s) => !up.has(s))
    assert.ok(gone, 'one idle project was stopped for park-x')
    // Full again; the parked one's restart, not being use, does not stop anyone and is refused.
    await assert.rejects(w.ensureRunning(gone, { use: false }), (e) => e.code === 'MACHINE_BUSY')
    assert.equal(calls.filter((c) => c.startsWith('stop')).length, 1)
    // With a slot free, it starts, and a person's new project then finds it the longest idle.
    up.delete('park-x')
    await pause(2100) // past the 2 s in which a refused start is the answer for the next ask
    await w.ensureRunning(gone, { use: false })
    await w.ensureRunning('park-y')
    assert.ok(!up.has(gone), `${gone} kept its idle clock and was stopped for park-y: ${[...up].join(', ')}`)
  } finally {
    w.close()
  }
})

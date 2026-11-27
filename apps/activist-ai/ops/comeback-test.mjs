// node --test ops/comeback-test.mjs: projects that were running come back after a restart (OLA-101).
// Made-up projects in a temp folder; no VM, no front desk.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { file, makeComeback } from './comeback.mjs'

const home = () => mkdtempSync(path.join(tmpdir(), 'comeback-'))
const now0 = 1_800_000_000_000

// A made-up machine: which projects run, a boot time, a clock the retries move forward.
function machine(h, { boot = 1000, up = new Set(), downUntil = 0, closed = new Set(), active = () => true } = {}) {
  const t = { now: now0, tries: 0 }
  const said = []
  const started = []
  const cb = makeComeback({
    home: h,
    boot: () => boot,
    now: () => t.now,
    log: (m) => said.push(m),
    isActive: active,
    timer: (res, ms) => ((t.now += ms), res()),
    running: () => {
      t.tries++
      if (t.now < downUntil) throw new Error('container system not up')
      return [...up]
    },
    start: async (slug) => {
      if (closed.has(slug)) throw Object.assign(new Error('closed'), { code: 'CLOSED' })
      if (up.size >= 4) throw Object.assign(new Error('full'), { code: 'MACHINE_BUSY' })
      up.add(slug)
      started.push(slug)
    },
  })
  return { cb, said, started, up, t }
}

test('a start and a stop are kept in up.json, mode 600, slugs and times only', async () => {
  const h = home()
  const { cb } = machine(h)
  await cb.resume()
  cb.note('alpha')
  cb.note('beta')
  cb.gone('alpha')
  assert.deepEqual(JSON.parse(readFileSync(file(h), 'utf8')), { boot: 1000, up: ['beta'] })
  assert.equal(statSync(file(h)).mode & 0o777, 0o600)
})

test('after a reboot the projects that were running are started again; a closed one is dropped', async () => {
  const h = home()
  writeFileSync(file(h), JSON.stringify({ boot: 1000, up: ['alpha', 'beta', 'gone', 'shut'] }))
  const { cb, started, said } = machine(h, { boot: 5000, closed: new Set(['shut']), active: (s) => s !== 'gone' })
  const r = await cb.resume()
  assert.equal(r.rebooted, true)
  assert.deepEqual(started, ['alpha', 'beta'])
  assert.deepEqual(r.left, [])
  assert.deepEqual(cb.list(), ['alpha', 'beta'])
  assert.deepEqual(JSON.parse(readFileSync(file(h), 'utf8')), { boot: 5000, up: ['alpha', 'beta'] })
  assert.match(said[0], /machine restarted: starting again 3 project/)
})

test('a front desk restart on the same boot starts nothing and trims the list to what runs', async () => {
  const h = home()
  writeFileSync(file(h), JSON.stringify({ boot: 1000, up: ['alpha', 'stopped-by-hand'] }))
  const { cb, started } = machine(h, { boot: 1001, up: new Set(['alpha']) })
  const r = await cb.resume()
  assert.equal(r.rebooted, false)
  assert.deepEqual(started, [])
  assert.deepEqual(cb.list(), ['alpha'])
})

test('the container system still coming up: tried again every 15 s until it answers', async () => {
  const h = home()
  writeFileSync(file(h), JSON.stringify({ boot: 1000, up: ['alpha'] }))
  const { cb, started, t } = machine(h, { boot: 9000, downUntil: now0 + 60_000 })
  const r = await cb.resume()
  assert.deepEqual(started, ['alpha'])
  assert.equal(t.tries, 5) // 0, 15, 30, 45 s refused; 60 s answers
  assert.deepEqual(r.left, [])
})

test('never up within 15 minutes: given up, said once, the project starts on its next request', async () => {
  const h = home()
  writeFileSync(file(h), JSON.stringify({ boot: 1000, up: ['alpha'] }))
  const { cb, started, said } = machine(h, { boot: 9000, downUntil: Infinity })
  const r = await cb.resume()
  assert.deepEqual(started, [])
  assert.deepEqual(r.left, ['alpha'])
  assert.match(said.at(-1), /not started again after the restart.*alpha/)
})

test('a first start with no file starts nothing', async () => {
  const h = home()
  const { cb, started } = machine(h)
  const r = await cb.resume()
  assert.equal(r.rebooted, false)
  assert.deepEqual(started, [])
})

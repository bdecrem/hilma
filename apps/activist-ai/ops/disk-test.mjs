// node --test ops/disk-test.mjs: an update or a check is refused with the number when the disk is short (OLA-327).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { UPDATE_NEEDS_GB, diskRefusal, freeGB } from './disk.mjs'

const AI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('short: refused, with the free space and what is needed', () => {
  const r = diskRefusal(3.8)
  assert.match(r, /needs 10 GB free and this machine has 3\.8 GB: not started/)
  assert.match(diskRefusal(12, { need: 15, what: 'an app build' }), /^an app build needs 15 GB free and this machine has 12\.0 GB/)
})

test('enough, or unreadable: not refused', () => {
  assert.equal(diskRefusal(UPDATE_NEEDS_GB), null)
  assert.equal(diskRefusal(40), null)
  assert.equal(diskRefusal(null), null)
})

test('this machine\'s free space is read', () => {
  const f = freeGB()
  assert.ok(typeof f === 'number' && f > 0, String(f))
})

test('the update tool reads it before anything else, and the app build script too', () => {
  const tool = readFileSync(path.join(AI, 'ops/ola.mjs'), 'utf8')
  const body = tool.slice(tool.indexOf('async function deploy('))
  const at = body.indexOf('diskRefusal(')
  assert.ok(at > 0 && at < body.indexOf('is not a clone'), 'deploy() checks the disk before it touches the staging clone')
  const build = readFileSync(path.join(AI, 'apple/tools/build.sh'), 'utf8')
  assert.ok(build.indexOf('OLA_BUILD_NEED_GB') > 0 && build.indexOf('OLA_BUILD_NEED_GB') < build.indexOf('skills.mjs stage'), 'build.sh checks the disk before it stages anything')
})

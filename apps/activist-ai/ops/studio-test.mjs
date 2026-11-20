// node --test ops/studio-test.mjs: the Studio's install list check (OLA-100), on made-up machines.
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { check, etimeSeconds, settingNames } from './studio.mjs'

const NOW = Date.parse('2026-12-02T12:00:00Z')

function machine({ filevault = true, admin = false, extra = [], homeMode = 0o700, door = true, reloadAt = '2026-12-02T11:59:00.000Z', backup = true, signers = true } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), 'studio-'))
  chmodSync(home, homeMode)
  const ola = path.join(home, '.ola')
  mkdirSync(path.join(ola, 'backup'), { recursive: true, mode: 0o700 })
  chmodSync(ola, 0o700)
  // Values are made up; the check must read only the names.
  writeFileSync(path.join(ola, 'gateway.env'), `UPSTREAM_API_KEY=made-up\nGATEWAY_TOKENS_FILE=${ola}/gateway-tokens\n${door ? `GATEWAY_DOOR_DIR=${ola}/gw\n` : ''}`, { mode: 0o600 })
  writeFileSync(path.join(ola, 'gateway-tokens'), 'GATEWAY_TOKENS=ws-a:made-up\n', { mode: 0o600 })
  if (backup) writeFileSync(path.join(ola, 'backup', 'key'), 'made-up', { mode: 0o600 })
  if (signers) writeFileSync(path.join(ola, 'allowed-signers'), 'bart@ola ssh-ed25519 AAAA\n')
  const log = path.join(home, 'gateway.log')
  writeFileSync(log, [
    '{"t":"2026-12-02T10:00:00.000Z","event":"tokens","why":"file","ok":true,"callers":2}',
    reloadAt ? `{"t":"${reloadAt}","event":"tokens","why":"file","ok":true,"callers":1,"removed":1}` : '',
    'not json',
  ].join('\n'))
  const sh = (cmd, args) => {
    if (cmd.endsWith('fdesetup')) return { code: 0, out: filevault ? 'FileVault is On.\n' : 'FileVault is Off.\n' }
    if (cmd.endsWith('/id')) return { code: 0, out: admin ? 'staff everyone admin\n' : 'staff everyone localaccounts\n' }
    if (cmd.endsWith('launchctl') && args[0] === 'list')
      return { code: 0, out: ['PID\tStatus\tLabel', '1\t0\tcx.ola.gateway', '-\t0\tcom.apple.Finder', '2\t0\tapplication.com.apple.Terminal.123.456', ...extra.map((l) => `3\t0\t${l}`)].join('\n') }
    if (cmd.endsWith('launchctl') && args[1].endsWith('cx.ola.gateway')) return { code: 0, out: '\tpid = 4242\n' }
    if (cmd.endsWith('launchctl') && args[1].endsWith('cx.ola.backup')) return { code: backup ? 0 : 113, out: '' }
    if (cmd.endsWith('/ps')) return { code: 0, out: '   01:00:00\n' } // started 11:00
    throw new Error(`unexpected ${cmd} ${args.join(' ')}`)
  }
  return { sh, home, user: 'ola', uid: 600, now: NOW, gatewayLog: log }
}
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))

test('a ready Studio passes every item', () => {
  const rows = check(machine())
  assert.equal(rows.length, 7)
  assert.ok(rows.every((r) => r.ok), JSON.stringify(rows.filter((r) => !r.ok)))
})

test('each missing piece is named, with what to do', () => {
  const r = byId(check(machine({ filevault: false, admin: true, extra: ['sh.macplus.code', 'com.golembot.strays'], homeMode: 0o750, backup: false, signers: false })))
  for (const id of ['disk-encryption', 'own-account', 'alone', 'private-home', 'backups', 'signed-deploys']) {
    assert.equal(r[id].ok, false, id)
    assert.ok(r[id].fix, `${id} says what to do`)
  }
  assert.match(r.alone.what, /2 other jobs.*com\.golembot\.strays.*sh\.macplus\.code/)
  assert.equal(r['key-cancel'].ok, true)
})

test('a key change is proven live only when it reached the gateway after its last start', () => {
  // The only reload is from before the gateway started (it restarted since): not proven live.
  assert.equal(byId(check(machine({ reloadAt: null })))['key-cancel'].ok, false)
  assert.match(byId(check(machine({ reloadAt: null })))['key-cancel'].what, /has not reloaded/)
  // No door per project: not set up, whatever the log says.
  const r = byId(check(machine({ door: false })))['key-cancel']
  assert.equal(r.ok, false)
  assert.match(r.what, /does not read its callers/)
})

test('no secret value reaches the output', () => {
  const out = JSON.stringify(check(machine({ filevault: false, admin: true, door: false })))
  assert.ok(!out.includes('made-up'))
})

test('helpers', () => {
  assert.equal(etimeSeconds('01:02'), 62)
  assert.equal(etimeSeconds('1-02:03:04'), 93784)
  assert.equal(etimeSeconds('junk'), null)
  assert.deepEqual([...settingNames('# c\nA=1\n\nB_C=x=y\n')], ['A', 'B_C'])
})

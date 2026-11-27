// node --test ops/studio-test.mjs: the Studio's install list check (OLA-100), on made-up machines.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { check, etimeSeconds, settingNames } from './studio.mjs'
import { hasPreview, scrubLine, scrubText } from './studio/model-log.mjs'

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

test("macOS's own ssh agent, which every account has, is not counted as another job", () => {
  const r = byId(check(machine({ extra: ['com.openssh.ssh-agent'] })))
  assert.equal(r.alone.ok, true, r.alone.what)
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

test('the key item passes on the setup, and says whether a key change was seen live since the gateway last started', () => {
  // The only reload is from before the gateway started (it restarted since): set up, not seen live.
  const quiet = byId(check(machine({ reloadAt: null })))['key-cancel']
  assert.equal(quiet.ok, true)
  assert.match(quiet.what, /no key change has reached/)
  assert.match(byId(check(machine()))['key-cancel'].what, /without a restart \(last at 2026-12-02T11:59/)
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

// OLA-468: the model server's log keeps no words of an answer.

const GEN = '{"event": "mtplx_openai_generation", "prompt_tokens": 812, "completion_tokens": 40, "finish_reason": "stop", "tok_s": 97.5, "text_preview": "Here is the spreadsheet of the tenants\\" union dues"}'

test('model log: a generation line keeps its numbers and loses the answer text', () => {
  const j = JSON.parse(scrubLine(GEN))
  assert.equal(j.text_preview, undefined)
  assert.deepEqual(j, { event: 'mtplx_openai_generation', prompt_tokens: 812, completion_tokens: 40, finish_reason: 'stop', tok_s: 97.5 })
  assert.equal(JSON.parse(scrubLine('{"a":{"request_last_user_preview":"my rent","n":1},"content":"x"}')).a.n, 1)
  assert.equal(scrubLine('{"a":{"request_last_user_preview":"my rent"}}').includes('rent'), false)
})

test('model log: a line that is not JSON loses a preview pair, other lines pass unchanged', () => {
  assert.equal(scrubLine('INFO done "text_preview": "the tenants\\" list" ok'), 'INFO done "text_preview":"[removed]" ok')
  assert.equal(scrubLine('MTPLX serving inkling on 127.0.0.1:8080'), 'MTPLX serving inkling on 127.0.0.1:8080')
  assert.equal(hasPreview(GEN), true)
  assert.equal(hasPreview(scrubText(`${GEN}\nplain\n`)), false)
  assert.equal(hasPreview('"text_preview":""'), false)
})

test('model log: run passes the command through the scrub; scrub and dirty fix and check a written log', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'modellog-'))
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'studio/model-log.mjs')
  const out = execFileSync(process.execPath, [tool, 'run', '--', process.execPath, '-e', `console.log(${JSON.stringify(GEN)}); console.error("warn")`], { encoding: 'utf8' })
  assert.equal(out.includes('tenants'), false)
  assert.match(out, /"completion_tokens":40/)
  assert.match(out, /warn/)
  const log = path.join(dir, 'model.log')
  writeFileSync(log, `start\n${GEN}\n${GEN}\n`, { mode: 0o644 })
  chmodSync(log, 0o644)
  assert.throws(() => execFileSync(process.execPath, [tool, 'dirty', log], { encoding: 'utf8' }))
  execFileSync(process.execPath, [tool, 'scrub', log], { encoding: 'utf8' })
  assert.equal(statSync(log).mode & 0o777, 0o600)
  assert.equal(readFileSync(log, 'utf8').includes('tenants'), false)
  assert.equal(readFileSync(log, 'utf8').split('\n')[0], 'start')
  execFileSync(process.execPath, [tool, 'dirty', log], { encoding: 'utf8' })
})

test("model log: the Studio's model job runs MTPLX through the filter, with a 077 umask", () => {
  const sh = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'studio/setup.sh'), 'utf8')
  assert.match(sh, /<string>\$LOG_FILTER<\/string><string>run<\/string><string>--<\/string>\s*<string>\/opt\/homebrew\/bin\/mtplx<\/string>/)
  assert.match(sh, /<key>Umask<\/key><integer>63<\/integer>/)
  assert.match(sh, /step "~\/Library\/Logs\/ola\/model.log mode 600/)
})

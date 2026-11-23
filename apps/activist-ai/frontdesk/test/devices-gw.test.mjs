// OLA-289: a device the front desk accepts is never told "signed out" by the gateway's 401.
// After a person's first device signs in, the front desk writes a new gateway token and the gateway
// takes it only on its next reload (a watch, ~100 ms later). These tests run the real makeDevices
// against a made-up gateway that reloads the people file late (or never) and check that a request
// sent at once waits and is answered, and that a gateway that still refuses gives 503 not_ready.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { passKey } from '../../ops/pass.mjs'
import { openDb } from '../db.mjs'
import { createDevice, makeDevices, revokeDevices } from '../devices.mjs'

const servers = []
after(() => servers.forEach((s) => s.close()))
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => (servers.push(s), r(s.address().port))))

/** A gateway that knows the tokens of the people file as it read them last; reload() reads it again. */
async function fakeGateway(file) {
  let known = new Set()
  const seen = []
  const reload = () => {
    try {
      known = new Set(readFileSync(file, 'utf8').trim().slice('GATEWAY_TOKENS='.length).split(',').map((e) => e.split(':')[1]))
    } catch {
      known = new Set()
    }
  }
  const s = http.createServer((req, res) => {
    const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ path: req.url, ok: known.has(tok) })
      if (!known.has(tok)) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"message":"unknown caller"}}')
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ path: req.url, got: body.length }))
    })
  })
  const port = await listen(s)
  return { url: `http://127.0.0.1:${port}`, reload, seen, forget: () => (known = new Set()) }
}

async function setup({ readyMs = 1500 } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ola-devgw-'))
  const db = openDb(path.join(dir, 'fd'))
  const key = passKey({ OLA_GATE_PASS_KEY: randomBytes(32).toString('hex') })
  const peopleFile = path.join(dir, 'gateway-people')
  const gw = await fakeGateway(peopleFile)
  const json = (res, status, body, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body))
  const logs = []
  const devices = makeDevices({
    db,
    cfg: { key, peopleFile, codeSeconds: 120, maxBody: null, passFrom: 'bearer', perDevice: 4, perPerson: 8, readyMs, readyEveryMs: 20 },
    gateway: gw.url, auth: {}, clientOf: () => 'x', json, readJson: async () => null, log: (m) => logs.push(m),
  })
  const fd = http.createServer((req, res) => devices.handle(req, res, new URL(req.url, 'http://x').pathname))
  const base = `http://127.0.0.1:${await listen(fd)}`
  const pid = Number(db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES ('nell', 'Nell', 'active', 0, randomblob(32), 0)").run().lastInsertRowid)
  /** What signedIn() does: a new device, then the people file. */
  const signIn = () => {
    const d = createDevice(db, key, pid, 'Made-up Mac', 'mac')
    devices.sync()
    return d
  }
  const ask = (token, p, init = {}) => fetch(`${base}/api/device/gw${p}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }).then(async (r) => ({ status: r.status, retry: r.headers.get('retry-after'), json: await r.json() }))
  return { db, pid, gw, signIn, sync: () => devices.sync(), ask, logs, close: () => devices.close() }
}

test('a first sign-in: a chat sent at once waits for the gateway to take the new token and is answered whole (never 401)', async () => {
  const t = await setup()
  const d = t.signIn()
  setTimeout(t.gw.reload, 250) // the gateway's reload, late
  const body = JSON.stringify({ model: 'general', messages: [{ role: 'user', content: 'x'.repeat(5000) }] })
  const [chat, models] = await Promise.all([t.ask(d.token, '/v1/chat/completions', { method: 'POST', body }), t.ask(d.token, '/v1/models')])
  assert.equal(chat.status, 200, JSON.stringify(chat))
  assert.equal(chat.json.got, body.length, 'the whole body reached the gateway after the wait')
  assert.equal(models.status, 200)
  // Once taken, the next request goes straight through: no probe in front of it.
  const n = t.gw.seen.length
  assert.equal((await t.ask(d.token, '/v1/usage')).status, 200)
  assert.equal(t.gw.seen.length, n + 1)
  t.close()
})

test('a gateway that never takes the new token: 503 not_ready with retry-after, within the wait; the next request tries again and passes once it does', async () => {
  const t = await setup({ readyMs: 300 })
  const d = t.signIn()
  const t0 = Date.now()
  const r = await t.ask(d.token, '/v1/models')
  assert.equal(r.status, 503)
  assert.equal(r.json.error, 'not_ready')
  assert.equal(r.retry, '1')
  assert.ok(Date.now() - t0 < 1500, `answered in ${Date.now() - t0} ms`)
  assert.ok(t.logs.some((l) => /did not take p\d+'s new token/.test(l)))
  t.gw.reload()
  assert.equal((await t.ask(d.token, '/v1/models')).status, 200)
  t.close()
})

test('a sign-in after sign out everywhere (the token changes): waits for the new one too', async () => {
  const t = await setup()
  const d1 = t.signIn()
  t.gw.reload()
  assert.equal((await t.ask(d1.token, '/v1/models')).status, 200)
  revokeDevices(t.db, { personId: t.pid })
  t.sync() // sign out everywhere rewrites the file: the person leaves it
  const d2 = t.signIn() // the person left the file, so this is a new token
  setTimeout(t.gw.reload, 200)
  assert.equal((await t.ask(d2.token, '/v1/models')).status, 200)
  t.close()
})

test('a gateway 401 for a signed-in device whose token is not new is passed on as 503 not_ready, never 401; a revoked device is still signed_out', async () => {
  const t = await setup({ readyMs: 200 })
  const d = t.signIn()
  t.gw.reload()
  assert.equal((await t.ask(d.token, '/v1/models')).status, 200)
  t.gw.forget() // the gateway lost the caller (a people file it refused, a restart mid-read)
  const r = await t.ask(d.token, '/v1/chat/completions', { method: 'POST', body: '{"model":"general","messages":[]}' })
  assert.equal(r.status, 503, JSON.stringify(r))
  assert.equal(r.json.error, 'not_ready')
  t.gw.reload()
  assert.equal((await t.ask(d.token, '/v1/models')).status, 200, 'back once the gateway knows it')
  revokeDevices(t.db, { personId: t.pid })
  const gone = await t.ask(d.token, '/v1/models')
  assert.equal(gone.status, 401)
  assert.equal(gone.json.error, 'signed_out')
  t.close()
})

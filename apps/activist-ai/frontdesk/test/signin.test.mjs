// Passwords, the "ask for my passkey" switch, reset links, and the Mac app's keys (2026-11-17),
// against the real front desk in this process (no workspace needed) and a stand-in gateway that
// records what reaches it. The browser side is ../check.mjs; the gateway's own rules for app
// callers are ../../gateway/test.mjs; the TLS front's boundary is ../../ops/tls-test.mjs.
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { hashPassword, needsRehash, passwordProblem, verifyPassword, SCRYPT } from '../passwords.mjs'
import { PasswordGuard, handleKey } from '../auth.mjs'
import { validDeviceName } from '../devices.mjs'

// ---------------------------------------------------------------- the rules, alone
test('a password: 15 characters, any kind, not common, not the name, not one character', () => {
  assert.match(passwordProblem('short one', { handle: 'maria' }), /at least 15/)
  assert.equal(passwordProblem('a quiet orange tram at noon', { handle: 'maria' }), null)
  assert.equal(passwordProblem('ŝtrange ünicode wörds here', { handle: 'maria' }), null)
  assert.equal(passwordProblem('nouppercaseordigitsneeded', { handle: 'maria' }), null) // no composition rules
  for (const common of ['passwordpassword', 'Password12345678', 'correct horse battery staple', 'iloveyouiloveyou', '123456789012345', 'qwertyuiopasdfghjkl', '!!passwordpassword!!'])
    assert.match(passwordProblem(common, { handle: 'maria' }) ?? '', /most common/, common)
  assert.match(passwordProblem('maria-is-my-name-ok', { handle: 'maria' }), /name/)
  assert.match(passwordProblem('aaaaaaaaaaaaaaaaaaaa', { handle: 'maria' }), /over and over/)
  assert.match(passwordProblem('x'.repeat(257), { handle: 'maria' }), /at most 256/)
  assert.match(passwordProblem('line\nbreak in a password', { handle: 'maria' }), /line break/)
  assert.match(passwordProblem(undefined), /Type a password/)
  assert.equal(passwordProblem('eight ch', { min: 8 }), null)
})

test('the hash: scrypt N=2^17 r=8 p=1, salted, self-describing; constant-time check; NFKC', async () => {
  const h = await hashPassword('a quiet orange tram at noon')
  assert.match(h, /^scrypt\$17\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/)
  assert.notEqual(h, await hashPassword('a quiet orange tram at noon')) // a salt each time
  assert.equal(await verifyPassword('a quiet orange tram at noon', h), true)
  assert.equal(await verifyPassword('a quiet orange tram at noon!', h), false)
  assert.equal(await verifyPassword(undefined, h), false)
  // The same text in two Unicode spellings (é as one code point, and e + combining accent).
  const nfc = await hashPassword('café au lait every morning')
  assert.equal(await verifyPassword('café au lait every morning', nfc), true)
  // No stored hash: the same work, always false.
  const t0 = Date.now()
  assert.equal(await verifyPassword('anything at all here', null), false)
  const none = Date.now() - t0
  const t1 = Date.now()
  await verifyPassword('anything at all here', h)
  const some = Date.now() - t1
  assert.ok(none > some / 3 && none < some * 3, `the made-up hash takes about as long (${none} ms against ${some} ms)`)
  assert.equal(needsRehash(h), false)
  assert.equal(needsRehash('scrypt$14$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(43)), true)
  assert.equal(SCRYPT.log2N, 17)
})

test('the guard: 5 free, then 1 s, 2 s, 4 s … to 15 minutes; forgotten after a day; a right one clears it', () => {
  const g = new PasswordGuard()
  const t = 1_000_000
  for (let i = 0; i < 4; i++) assert.equal(g.fail('maria', t).burst, false)
  assert.equal(g.wait('maria', t), 0)
  assert.equal(g.fail('maria', t).burst, true) // the 5th: a burst row
  assert.equal(g.wait('maria', t), 1000)
  g.fail('maria', t)
  assert.equal(g.wait('maria', t), 2000)
  for (let i = 0; i < 30; i++) g.fail('maria', t)
  assert.equal(g.wait('maria', t), 15 * 60_000)
  assert.equal(g.wait('maria', t + 24 * 3600_000 + 1), 0)
  g.fail('bob', t)
  g.success('bob')
  assert.equal(g.wait('bob', t), 0)
  assert.equal(handleKey('  Maria '), 'maria')
  assert.equal(handleKey({}), '')
  assert.equal(validDeviceName('Maria’s MacBook'), 'Maria’s MacBook')
})

// ---------------------------------------------------------------- the front desk, in this process
const run = mkdtempSync(path.join(tmpdir(), 'ola-signin-test-'))
const seen = [] // what reached the stand-in gateway
const gw = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, body })
    if (body.includes('"hang"')) return // never answers (removal must cut it)
    if (req.url.startsWith('/v1/chat/completions') && body.includes('"stream":true')) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'set-cookie': 'x=y', 'x-upstream-secret': 'no' })
      res.write('data: {"a":1}\n\n')
      setTimeout(() => res.end('data: [DONE]\n\n'), 50)
      return
    }
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '77', 'x-upstream-secret': 'no' }).end('{"error":{"message":"used up","type":"insufficient_quota"}}')
  })
})
let fd, base, db
// A free port, so the origin (and so the Host the front desk insists on) is known before it starts.
const PORT = await new Promise((r) => {
  const s = http.createServer().listen(0, '127.0.0.1', () => (r(s.address().port), s.close()))
})
const ORIGIN = `http://localhost:${PORT}`
before(async () => {
  mkdirSync(path.join(run, 'ola'), { mode: 0o700 })
  await new Promise((r) => gw.listen(0, '127.0.0.1', r))
  Object.assign(process.env, {
    OLA_HOME: path.join(run, 'ola'),
    OLA_FD_DATA: path.join(run, 'fd'),
    OLA_FD_ORIGIN: ORIGIN,
    OLA_FD_GATEWAY_URL: `http://127.0.0.1:${gw.address().port}`,
    OLA_GATE_PASS_KEY: randomBytes(32).toString('hex'),
    OLA_FD_PEOPLE_TOKENS_FILE: path.join(run, 'gateway-people'),
    OLA_FD_SIGNIN_BURST: '200',
    OLA_FD_SIGNIN_PER_MIN: '200',
    OLA_FD_IDLE_STOP_MIN: '0',
  })
  const { makeFrontDesk } = await import('../server.mjs')
  fd = makeFrontDesk()
  db = fd.db
  await new Promise((r) => fd.listener.listen(PORT, '127.0.0.1', r))
  base = ORIGIN
  const add = (handle, name) => db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES (?, ?, 'invited', randomblob(32), 0)").run(handle, name)
  add('maria', 'Maria L.')
  add('dana', 'Dana D.')
  add('pat', 'Pat P.')
})
after(() => {
  fd?.close()
  gw.close()
})

const host = () => ({})
async function call(p, { method = 'POST', body, cookie, csrf, bearer, origin = method === 'GET' ? undefined : ORIGIN, headers = {} } = {}) {
  const h = { ...host(), ...headers }
  if (body !== undefined) h['content-type'] = 'application/json'
  if (cookie) h.cookie = cookie
  if (csrf) h['x-ola-csrf'] = csrf
  if (bearer) h.authorization = `Bearer ${bearer}`
  if (origin) h.origin = origin
  const r = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: r.status, json, text, headers: r.headers, cookies: r.headers.getSetCookie() }
}
const cookieJar = (r) => r.cookies.map((c) => c.split(';')[0]).join('; ')
const { makeInvite, makePasswordLink } = await import('../auth.mjs')
const inviteFor = (id) => makeInvite(db, id, 3600_000).raw
const PW = 'a quiet orange tram at noon'

let mariaCookie, mariaCsrf, mariaKnown
test('an invitation lets the person choose a password, and they are in; it works once', async () => {
  const inv = inviteFor(1)
  const weak = await call('/api/auth/invite/password', { body: { invite: inv, password: 'password1' } })
  assert.equal(weak.status, 400)
  assert.equal(weak.json.error, 'weak_password')
  const r = await call('/api/auth/invite/password', { body: { invite: inv, password: PW } })
  assert.equal(r.status, 200)
  assert.equal(r.cookies.length, 2)
  assert.ok(r.cookies.every((c) => /HttpOnly/.test(c) && /SameSite=Strict/.test(c)))
  mariaCookie = cookieJar(r)
  mariaKnown = r.cookies.find((c) => c.startsWith('ola-known-local=')).split(';')[0].split('=')[1]
  const me = await call('/api/me', { method: 'GET', cookie: mariaCookie })
  assert.equal(me.status, 200)
  mariaCsrf = me.json.csrf
  assert.equal((await call('/api/auth/invite/password', { body: { invite: inv, password: PW } })).status, 404)
  const row = db.prepare("SELECT password_hash, status FROM people WHERE handle = 'maria'").get()
  assert.equal(row.status, 'active')
  assert.ok(!row.password_hash.includes(PW))
  // No password in the database file, in clear.
  assert.ok(!readFileSync(path.join(run, 'fd/platform.db')).includes(Buffer.from(PW)))
  assert.ok(db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'password_set'").get().n === 1)
})

test('sign-in: the right password; a wrong one and an unknown name get the same answer', async () => {
  const ok = await call('/api/auth/password', { body: { handle: 'Maria', password: PW } })
  assert.equal(ok.status, 200)
  assert.ok(ok.cookies.some((c) => c.startsWith('ola-local=')))
  const wrong = await call('/api/auth/password', { body: { handle: 'maria', password: PW + '!' } })
  const nobody = await call('/api/auth/password', { body: { handle: 'nobody-here', password: PW } })
  const nopw = await call('/api/auth/password', { body: { handle: 'dana', password: PW } }) // invited, no password
  for (const r of [wrong, nobody, nopw]) {
    assert.equal(r.status, 401)
    assert.deepEqual(r.json, wrong.json)
    assert.equal(r.cookies.length, 0)
  }
  assert.equal(wrong.json.message, 'That name and password did not match. Check both and try again.')
})

test('timing: no such person and a wrong password take about as long', async () => {
  const time = async (handle) => {
    const t0 = performance.now()
    await call('/api/auth/password', { body: { handle, password: 'not the right one at all' }, headers: { cookie: '' } })
    return performance.now() - t0
  }
  // Fresh names so the guard is not in play.
  const a = [], b = []
  for (let i = 0; i < 3; i++) a.push(await time('maria')), b.push(await time(`ghost${i}`))
  const med = (x) => x.sort((p, q) => p - q)[1]
  assert.ok(med(b) > med(a) / 2 && med(b) < med(a) * 2, `${med(a).toFixed(0)} ms against ${med(b).toFixed(0)} ms`)
})

test('guessing: a stranger slows one name down, never the person on a device that signed in before', async () => {
  // Fill maria's free tries from "elsewhere".
  for (let i = 0; i < 5; i++) await call('/api/auth/password', { body: { handle: 'maria', password: `guess number ${i} for her` } })
  const held = await call('/api/auth/password', { body: { handle: 'maria', password: PW } })
  assert.equal(held.status, 429)
  assert.match(held.json.message, /Wait .*passkey/)
  assert.ok(Number(held.headers.get('retry-after')) >= 1)
  // The same right password from her own browser (the known-device cookie) goes straight through.
  const mine = await call('/api/auth/password', { body: { handle: 'maria', password: PW }, cookie: `ola-known-local=${mariaKnown}` })
  assert.equal(mine.status, 200)
  // A known-device token for someone else does not help.
  const other = await call('/api/auth/password', { body: { handle: 'pat', password: PW }, cookie: `ola-known-local=${mariaKnown}` })
  assert.equal(other.status, 401)
  // A forged one does not either.
  const forged = mariaKnown.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))
  for (let i = 0; i < 6; i++) await call('/api/auth/password', { body: { handle: 'maria', password: 'still guessing here' } })
  assert.equal((await call('/api/auth/password', { body: { handle: 'maria', password: PW }, cookie: `ola-known-local=${forged}` })).status, 429)
  const bursts = db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'sign_in_burst'").get().n
  assert.ok(bursts >= 1, 'a burst row')
})

test('the admin link sets a password; for someone who had one it signs them out everywhere', async () => {
  // dana: invited, no password yet; a link sets her first one (nothing to sign out).
  const { raw } = makePasswordLink(db, 2, 3600_000)
  assert.equal((await call('/api/auth/reset/info', { body: { token: raw } })).json.name, 'Dana D.')
  const set = await call('/api/auth/reset', { body: { token: raw, password: 'walking the long way home' } })
  assert.equal(set.status, 200)
  assert.equal((await call('/api/auth/reset', { body: { token: raw, password: 'walking the long way home' } })).status, 404)
  // maria had one: her session ends.
  const { raw: r2 } = makePasswordLink(db, 1, 3600_000)
  const { raw: r3 } = makePasswordLink(db, 1, 3600_000) // voids r2
  assert.equal((await call('/api/auth/reset/info', { body: { token: r2 } })).status, 404)
  const before = await call('/api/me', { method: 'GET', cookie: mariaCookie })
  assert.equal(before.status, 200)
  const r = await call('/api/auth/reset', { body: { token: r3, password: 'she now has a newer password' } })
  assert.equal(r.status, 200)
  assert.equal((await call('/api/me', { method: 'GET', cookie: mariaCookie })).status, 401)
  mariaCookie = cookieJar(r)
  mariaCsrf = (await call('/api/me', { method: 'GET', cookie: mariaCookie })).json.csrf
})

let key
test('the Mac app: name and password give this computer its own pass, shown once; the database keeps its hash', async () => {
  // Only people who may sign in computers (devices.mjs: devices_allowed, or an admin).
  const no = await call('/api/device/login', { body: { handle: 'maria', password: 'she now has a newer password', name: 'x' }, origin: null, headers: { 'x-ola-known': mariaKnown } })
  assert.equal(no.status, 403)
  assert.equal(no.json.error, 'not_allowed')
  db.prepare("UPDATE people SET devices_allowed = 1 WHERE handle IN ('maria', 'dana')").run()
  const r = await call('/api/device/login', { body: { handle: 'maria', password: 'she now has a newer password', name: 'Maria’s MacBook Air', kind: 'mac' }, origin: null, headers: { 'x-ola-known': mariaKnown } })
  assert.equal(r.status, 200, r.text)
  key = r.json.token
  assert.match(key, /^olap1\./)
  assert.equal(r.json.person.handle, 'maria')
  assert.equal(r.json.device.name, 'Maria’s MacBook Air')
  assert.ok(r.json.known)
  const row = db.prepare('SELECT token_sha256, name FROM devices ORDER BY id DESC').get()
  assert.deepEqual(Buffer.from(row.token_sha256), createHash('sha256').update(key).digest())
  assert.match(readFileSync(path.join(run, 'gateway-people'), 'utf8'), /^GATEWAY_TOKENS=p-1:[0-9a-f]{48}\n?$/)
  const me = await call('/api/device/me', { method: 'GET', bearer: key })
  assert.equal(me.json.person.name, 'Maria L.')
  assert.equal((await call('/api/device/me', { method: 'GET' })).status, 401)
  // A wrong password: the same answer as on the web; a cross-site page is refused.
  assert.equal((await call('/api/device/login', { body: { handle: 'maria', password: 'nope nope nope nope', name: 'x' }, origin: null, headers: { 'x-ola-known': mariaKnown } })).status, 401)
  assert.equal((await call('/api/device/login', { body: { handle: 'maria', password: 'x' }, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  // A pass is not a session: no route outside /api/device/ takes it.
  for (const p of ['/api/me', '/api/account', '/api/project', '/oc/api/session', '/api/files']) assert.equal((await call(p, { method: 'GET', bearer: key })).status, 401, p)
})

test('"ask for my passkey too": the app is sent to the browser; the web asks for that person\'s passkey', async () => {
  // Turning it on needs a passkey: maria has none.
  assert.equal((await call('/api/account/require-passkey', { body: { on: true }, cookie: mariaCookie, csrf: mariaCsrf })).status, 409)
  db.prepare("INSERT INTO passkeys (person_id, credential_id, public_key, counter, created_at) VALUES (1, 'made-up-credential', x'00', 0, 0)").run()
  assert.equal((await call('/api/account/require-passkey', { body: { on: true }, cookie: mariaCookie, csrf: mariaCsrf })).status, 200)
  const app = await call('/api/device/login', { body: { handle: 'maria', password: 'she now has a newer password', name: 'x' }, origin: null, headers: { 'x-ola-known': mariaKnown } })
  assert.equal(app.status, 403)
  assert.equal(app.json.error, 'passkey_required')
  const web = await call('/api/auth/password', { body: { handle: 'maria', password: 'she now has a newer password' }, cookie: `ola-known-local=${mariaKnown}` })
  assert.equal(web.status, 200)
  assert.equal(web.json.passkey, true)
  assert.deepEqual(web.json.options.allowCredentials.map((c) => c.id), ['made-up-credential'])
  assert.equal(web.cookies.length, 0) // no session until the passkey
  // Off again needs the current password.
  assert.equal((await call('/api/account/require-passkey', { body: { on: false, current: 'wrong wrong wrong wrong' }, cookie: mariaCookie, csrf: mariaCsrf })).status, 403)
  assert.equal((await call('/api/account/require-passkey', { body: { on: false, current: 'she now has a newer password' }, cookie: mariaCookie, csrf: mariaCsrf })).status, 200)
})

test('changing the password: needs the current one; ends her other sign-ins and her computers', async () => {
  const other = await call('/api/auth/password', { body: { handle: 'maria', password: 'she now has a newer password' }, cookie: `ola-known-local=${mariaKnown}` })
  const otherCookie = cookieJar(other)
  assert.equal((await call('/api/device/me', { method: 'GET', bearer: key })).status, 200)
  assert.equal((await call('/api/account/password', { body: { current: 'not it at all, no', password: 'the third password she chose' }, cookie: mariaCookie, csrf: mariaCsrf })).status, 403)
  const r = await call('/api/account/password', { body: { current: 'she now has a newer password', password: 'the third password she chose' }, cookie: mariaCookie, csrf: mariaCsrf })
  assert.equal(r.status, 200)
  assert.equal((await call('/api/me', { method: 'GET', cookie: mariaCookie })).status, 200)
  assert.equal((await call('/api/me', { method: 'GET', cookie: otherCookie })).status, 401)
  assert.equal((await call('/api/device/me', { method: 'GET', bearer: key })).status, 401)
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'password_changed'").get().n, 2)
})

test('sign out everywhere; a suspended person cannot sign in or use a key', async () => {
  const k = await call('/api/device/login', { body: { handle: 'dana', password: 'walking the long way home', name: 'Dana Mac' }, origin: null })
  assert.equal(k.status, 200)
  const s = await call('/api/auth/password', { body: { handle: 'dana', password: 'walking the long way home' } })
  const c = cookieJar(s)
  const csrf = (await call('/api/me', { method: 'GET', cookie: c })).json.csrf
  assert.equal((await call('/api/account/signout-everywhere', { body: {}, cookie: c, csrf })).status, 200)
  assert.equal((await call('/api/me', { method: 'GET', cookie: c })).status, 401)
  assert.equal((await call('/api/device/me', { method: 'GET', bearer: k.json.token })).status, 401)
  const k2 = await call('/api/device/login', { body: { handle: 'dana', password: 'walking the long way home', name: 'Dana Mac' }, origin: null })
  db.prepare("UPDATE people SET status = 'suspended' WHERE handle = 'dana'").run()
  assert.equal((await call('/api/device/me', { method: 'GET', bearer: k2.json.token })).status, 401)
  assert.equal((await call('/api/auth/password', { body: { handle: 'dana', password: 'walking the long way home' } })).status, 401)
})

test('nothing secret in the audit log; every new word is one the table allows', () => {
  const words = db.prepare('SELECT DISTINCT action FROM audit').all().map((r) => r.action)
  for (const w of ['password_set', 'password_changed', 'sign_in_burst', 'device_signed_in', 'passkey_required_on', 'passkey_required_off', 'sessions_revoked']) assert.ok(words.includes(w), w)
  const dump = readFileSync(path.join(run, 'fd/platform.db'))
  for (const s of [PW, 'the third password she chose', key]) assert.ok(!dump.includes(Buffer.from(s)), 'no password or key in the database file')
})

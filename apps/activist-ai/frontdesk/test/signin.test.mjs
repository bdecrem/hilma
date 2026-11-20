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
import { hashPassword, minLength, needsRehash, passwordProblem, verifyPassword, SCRYPT } from '../passwords.mjs'
import { PasswordGuard, handleKey } from '../auth.mjs'
import { validDeviceName } from '../devices.mjs'
import { SoftAuthn } from '../review/softauthn.mjs'
import { spawnSync } from 'node:child_process'

// ---------------------------------------------------------------- the rules, alone
test('a password: 8 characters by default (OLA_FD_PASSWORD_MIN raises it, never below 8), any kind, not common, not the name, not one character', () => {
  assert.equal(minLength({}), 8)
  assert.equal(minLength({ OLA_FD_PASSWORD_MIN: '15' }), 15)
  for (const bad of ['7', '0', '65', 'eight', '8.5']) assert.throws(() => minLength({ OLA_FD_PASSWORD_MIN: bad }), /8 to 64/, bad)
  assert.match(passwordProblem('short 7', { handle: 'maria' }), /at least 8/)
  assert.equal(passwordProblem('blue tram', { handle: 'maria' }), null)
  assert.match(passwordProblem('blue tram', { handle: 'maria', min: 15 }), /at least 15/)
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
  // The page learns whose invitation it is and the rule, with no passkey ceremony started.
  const info = await call('/api/auth/invite/info', { body: { invite: inv } })
  assert.equal(info.status, 200)
  assert.deepEqual(info.json, { name: info.json.name, handle: 'maria', kind: 'first', min: 8 })
  assert.equal((await call('/api/auth/invite/info', { body: { invite: 'A'.repeat(43) } })).status, 404)
  const short = await call('/api/auth/invite/password', { body: { invite: inv, password: 'seven c' } })
  assert.equal(short.status, 400)
  assert.match(short.json.message, /at least 8/)
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
  assert.equal((await call('/api/auth/invite/info', { body: { invite: inv } })).status, 404, 'a used invitation still answers')
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
  assert.match(held.json.message, /Wait .*try again/)
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

test('guessing (OLA-95): wrong tries for one name never hold up another name from the same address, and the wait is said in plain words', async () => {
  // Every call here comes from 127.0.0.1, one address, like an office behind one NAT.
  db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at, password_hash, password_set_at) VALUES ('lena', 'Lena K.', 'active', randomblob(32), 0, ?, 0)").run(await hashPassword(PW))
  for (let i = 0; i < 8; i++) await call('/api/auth/password', { body: { handle: 'maria', password: `office guess ${i}` }, headers: { cookie: '' } })
  const held = await call('/api/auth/password', { body: { handle: 'maria', password: PW }, headers: { cookie: '' } })
  assert.equal(held.status, 429)
  assert.match(held.json.message, /^Too many wrong tries for this name\. Wait (1 second|\d+ seconds|1 minute|\d+ minutes), then try again\.$/)
  const lena = await call('/api/auth/password', { body: { handle: 'lena', password: PW }, headers: { cookie: '' } })
  assert.equal(lena.status, 200, 'another name from the same address was held up')
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
  // Anyone with an active account: no admin step per person (2026-11-17).
  const r = await call('/api/device/login', { body: { handle: 'maria', password: 'she now has a newer password', name: 'Maria’s MacBook Air', kind: 'mac' }, origin: null, headers: { 'x-ola-known': mariaKnown } })
  assert.equal(r.status, 200, r.text)
  key = r.json.token
  assert.match(key, /^olap1\./)
  assert.equal(r.json.person.handle, 'maria')
  assert.equal(r.json.device.name, 'Maria’s MacBook Air')
  assert.ok(r.json.known)
  assert.equal(r.json.has_passkey, false, 'the app offers to add a passkey')
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

test('"ask for my passkey too": the app gets a ceremony for that person\'s passkeys (never a browser), and so does the web', async () => {
  // Turning it on needs a passkey: maria has none.
  assert.equal((await call('/api/account/require-passkey', { body: { on: true }, cookie: mariaCookie, csrf: mariaCsrf })).status, 409)
  db.prepare("INSERT INTO passkeys (person_id, credential_id, public_key, counter, created_at) VALUES (1, 'made-up-credential', x'00', 0, 0)").run()
  assert.equal((await call('/api/account/require-passkey', { body: { on: true }, cookie: mariaCookie, csrf: mariaCsrf })).status, 200)
  const app = await call('/api/device/login', { body: { handle: 'maria', password: 'she now has a newer password', name: 'x' }, origin: null, headers: { 'x-ola-known': mariaKnown } })
  assert.equal(app.status, 200)
  assert.equal(app.json.passkey, true)
  assert.equal(app.json.token, undefined, 'no key before the passkey')
  assert.deepEqual(app.json.options.allowCredentials.map((c) => c.id), ['made-up-credential'])
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

// ---------------------------------------------------------------- the app's passkeys, never a browser
const PAT_PW = 'seven green ferries at dawn'
const asApp = (p, body, bearer) => call(p, { body, origin: null, ...(bearer ? { bearer } : {}) })
let patKey
test('the apple-app-site-association file says the Ola Mac app may use this site’s passkeys, as JSON, with no cookie', async () => {
  const r = await call('/.well-known/apple-app-site-association', { method: 'GET' })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type'), /^application\/json/)
  assert.deepEqual(r.json, { webcredentials: { apps: ['274T5WCVD2.cx.ola.mac'] } })
  assert.equal(r.cookies.length, 0)
})

test('the app adds a passkey with its own pass, only soon after signing in; a web session or no pass cannot', async () => {
  const { raw } = makePasswordLink(db, 3, 3600_000)
  assert.equal((await call('/api/auth/reset', { body: { token: raw, password: PAT_PW } })).status, 200)
  const r = await asApp('/api/device/login', { handle: 'pat', password: PAT_PW, name: 'Pat’s iMac', kind: 'mac' })
  assert.equal(r.status, 200, r.text)
  assert.equal(r.json.has_passkey, false)
  patKey = r.json.token
  // Without the pass (or with a web cookie only): refused.
  assert.equal((await asApp('/api/device/passkey/options', {})).status, 401)
  const opts = await asApp('/api/device/passkey/options', {}, patKey)
  assert.equal(opts.status, 200, opts.text)
  assert.equal(opts.json.options.rp.id, 'localhost')
  assert.equal(opts.json.options.user.name, 'pat')
  const soft = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  // An answer from another origin, or to another ceremony, saves nothing.
  const bad = await asApp('/api/device/passkey/verify', { ceremony: opts.json.ceremony, response: soft.create(opts.json.options, { origin: 'https://evil.example' }) }, patKey)
  assert.equal(bad.status, 400)
  const opts2 = await asApp('/api/device/passkey/options', {}, patKey)
  const ok = await asApp('/api/device/passkey/verify', { ceremony: opts2.json.ceremony, response: soft.create(opts2.json.options) }, patKey)
  assert.equal(ok.status, 200, ok.text)
  assert.equal(db.prepare('SELECT count(*) AS n FROM passkeys WHERE person_id = 3').get().n, 1)
  patSoft = soft
  // Fifteen minutes after this Mac signed in, its pass alone no longer adds one.
  db.prepare('UPDATE devices SET created_at = created_at - 16 * 60000 WHERE token_sha256 = ?').run(createHash('sha256').update(patKey).digest())
  const late = await asApp('/api/device/passkey/options', {}, patKey)
  assert.equal(late.status, 403)
  assert.equal(late.json.error, 'not_fresh')
})

// ---------------------------------------------------------------- kept conversations (OLA-159)
test('kept conversations: only with the device’s own pass; a turn is stored, sent again it is replaced; the person sees the count and deletes them all', async () => {
  const turn = { product: 'mac', runtime: 'local', engine: 'ola', status: 'done', session: 'ses_1', turn: 'msg_1', at: '2026-11-18T22:00:00Z', seconds: 41, app: '0.1 (12)',
    request: 'build me a smart app that uses ai to generate a crossword puzzle on demand.', answer: 'Here it is.', steps: [{ tool: 'write', words: 'Wrote index.html', status: 'done' }] }
  assert.equal((await asApp('/api/device/kept', turn)).status, 401, 'no pass')
  assert.equal((await asApp('/api/device/kept', { ...turn, engine: 'gpt' }, patKey)).status, 400, 'an engine that is not ours')
  assert.equal((await asApp('/api/device/kept', { ...turn, request: '' }, patKey)).status, 400, 'no request')
  assert.equal((await asApp('/api/device/kept', turn, patKey)).status, 200)
  assert.equal((await asApp('/api/device/kept', { ...turn, answer: 'Here it is, fixed.' }, patKey)).status, 200)
  // Claude tried the same thing after Ola: the switch is kept (OLA-157).
  assert.equal((await asApp('/api/device/kept', { ...turn, turn: 'msg_2', engine: 'claude', switched_from: 'ola', answer: 'A working crossword.' }, patKey)).status, 200)
  const rows = db.prepare("SELECT k.turn, k.engine, k.answer, k.switched_from, k.steps, p.handle FROM kept_turns k JOIN people p ON p.id = k.person_id ORDER BY k.turn").all()
  assert.equal(rows.length, 2)
  assert.deepEqual([rows[0].handle, rows[0].answer, rows[0].switched_from], ['pat', 'Here it is, fixed.', null])
  assert.deepEqual([rows[1].engine, rows[1].switched_from], ['claude', 'ola'])
  assert.equal(JSON.parse(rows[0].steps)[0].words, 'Wrote index.html')
  // The switch is counted once, labels only, with its kept turns as the draft (OLA-157, switches.mjs).
  assert.equal((await asApp('/api/device/kept', { ...turn, turn: 'msg_2', engine: 'claude', switched_from: 'ola', answer: 'A working crossword, again.' }, patKey)).status, 200)
  const sw = db.prepare('SELECT product, runtime, from_engine, to_engine, kind, copy_state, kept_turn_id FROM switches').all()
  assert.deepEqual(sw.map((x) => [x.product, x.runtime, x.from_engine, x.to_engine, x.kind, x.copy_state, x.kept_turn_id !== null]), [['mac', 'local', 'ola', 'claude', 'app', 'kept', true]])
  const seen = await call('/api/device/kept', { method: 'GET', bearer: patKey })
  assert.deepEqual([seen.status, seen.json.count, seen.json.since], [200, 2, '2026-11-18T22:00:00.000Z'])
  // The admin reads them, and only the switched ones on request.
  const listed = spawnSync(process.execPath, [new URL('../admin.mjs', import.meta.url).pathname, 'kept', 'pat', '--switched', '--days', '3650'], { env: process.env, encoding: 'utf8' })
  assert.match(listed.stdout, /claude \(after ola\)/, listed.stdout + listed.stderr)
  assert.match(listed.stdout, /1 kept turn/)
  const gone = await call('/api/device/kept', { method: 'DELETE', bearer: patKey })
  assert.deepEqual([gone.status, gone.json.deleted], [200, 2])
  assert.equal(db.prepare('SELECT count(*) AS n FROM kept_turns').get().n, 0)
  assert.deepEqual(db.prepare('SELECT kept_turn_id, kind FROM switches').all().map((x) => [x.kept_turn_id, x.kind]), [[null, 'app']], 'deleted with the turns: only the labels stay')
})


let patSoft
test('the app signs in with a passkey: after a right password when the account asks for it, or the passkey alone; ceremonies do not cross between the app and the web', async () => {
  db.prepare("UPDATE people SET require_passkey = 1 WHERE handle = 'pat'").run()
  const step = await asApp('/api/device/login', { handle: 'pat', password: PAT_PW, name: 'Pat’s MacBook', kind: 'mac' })
  assert.equal(step.status, 200)
  assert.equal(step.json.passkey, true)
  assert.equal(step.json.token, undefined)
  assert.deepEqual(step.json.options.allowCredentials.map((c) => c.id), [patSoft.id])
  // The web's ceremony is not the app's, and the app's is not the web's.
  const web = await call('/api/auth/password', { body: { handle: 'pat', password: PAT_PW } })
  assert.equal((await asApp('/api/device/login/passkey', { ceremony: web.json.ceremony, response: patSoft.get(web.json.options) })).status, 401)
  const crossed = await asApp('/api/device/login', { handle: 'pat', password: PAT_PW, name: 'x' })
  assert.equal((await call('/api/auth/login/verify', { body: { ceremony: crossed.json.ceremony, response: patSoft.get(crossed.json.options) } })).status, 401)
  // Another passkey (not hers) does not finish her sign-in.
  const stranger = new SoftAuthn({ rpId: 'localhost', origin: ORIGIN })
  stranger.userHandle = 'AAAA'
  const s2 = await asApp('/api/device/login', { handle: 'pat', password: PAT_PW, name: 'x' })
  assert.equal((await asApp('/api/device/login/passkey', { ceremony: s2.json.ceremony, response: stranger.get(s2.json.options) })).status, 401)
  // Her passkey: this Mac is signed in, with the name it gave at the first step.
  const done = await asApp('/api/device/login/passkey', { ceremony: step.json.ceremony, response: patSoft.get(step.json.options) })
  assert.equal(done.status, 200, done.text)
  assert.match(done.json.token, /^olap1\./)
  assert.equal(done.json.device.name, 'Pat’s MacBook')
  assert.equal(done.json.has_passkey, true)
  assert.equal((await call('/api/device/me', { method: 'GET', bearer: done.json.token })).json.person.handle, 'pat')
  // A ceremony is used once.
  assert.equal((await asApp('/api/device/login/passkey', { ceremony: step.json.ceremony, response: patSoft.get(step.json.options) })).status, 401)
  // The passkey alone, with no name or password.
  const alone = await asApp('/api/device/login', { passkey: true, name: 'Pat’s iPad', kind: 'cli' })
  assert.equal(alone.status, 200)
  assert.deepEqual(alone.json.options.allowCredentials, [])
  const in2 = await asApp('/api/device/login/passkey', { ceremony: alone.json.ceremony, response: patSoft.get(alone.json.options) })
  assert.equal(in2.status, 200, in2.text)
  assert.deepEqual([in2.json.person.handle, in2.json.device.kind], ['pat', 'cli'])
  // A suspended person's passkey opens nothing.
  db.prepare("UPDATE people SET status = 'suspended' WHERE handle = 'pat'").run()
  const sus = await asApp('/api/device/login', { passkey: true })
  assert.equal((await asApp('/api/device/login/passkey', { ceremony: sus.json.ceremony, response: patSoft.get(sus.json.options) })).status, 401)
  db.prepare("UPDATE people SET status = 'active' WHERE handle = 'pat'").run()
})

test('a person’s weekly allowance: admin.mjs app-allowance writes the quotas file beside the people file (600, renamed in); default takes it out; allow-devices is no longer needed', async () => {
  const adminCli = (...a) => spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), '../admin.mjs'), ...a], { env: process.env, encoding: 'utf8' })
  const quotas = path.join(run, 'gateway-people-quotas')
  const set = adminCli('app-allowance', 'pat', '5000000')
  assert.equal(set.status, 0, set.stderr)
  assert.match(set.stdout, /5,000,000 tokens a week/)
  const st = statSync(quotas)
  assert.equal(st.mode & 0o777, 0o600)
  assert.equal(readFileSync(quotas, 'utf8'), 'GATEWAY_QUOTAS=p-3=5000000\n')
  assert.equal(adminCli('app-allowance', 'pat', 'lots').status, 1)
  assert.equal(adminCli('app-allowance', 'pat', 'default').status, 0)
  assert.equal(readFileSync(quotas, 'utf8'), 'GATEWAY_QUOTAS=\n')
  assert.notEqual(statSync(quotas).ino, st.ino, 'replaced by rename')
  const allow = adminCli('allow-devices', 'pat')
  assert.equal(allow.status, 0)
  assert.match(allow.stdout, /Not needed any more/)
})

test('nothing secret in the audit log; every new word is one the table allows', () => {
  const words = db.prepare('SELECT DISTINCT action FROM audit').all().map((r) => r.action)
  for (const w of ['password_set', 'password_changed', 'sign_in_burst', 'device_signed_in', 'passkey_required_on', 'passkey_required_off', 'sessions_revoked']) assert.ok(words.includes(w), w)
  const dump = readFileSync(path.join(run, 'fd/platform.db'))
  for (const s of [PW, 'the third password she chose', key]) assert.ok(!dump.includes(Buffer.from(s)), 'no password or key in the database file')
})

// Publish from a Mac (OLA-223): the front desk in this process, two people signed in on their Macs
// (a device pass each, as the Mac app's model door holds it), and the stand-in for Vercel
// (../../web/server/fake-vercel.mjs) playing sites.ola.cx. The routes under /api/device/sites/ apply
// cloud Publish's own rules (sites.mjs prepare) and a name the person owns (makeSiteNames).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { startFakeVercel } from '../../web/server/fake-vercel.mjs'
import { readSent, RESERVED_NAMES, STATIC_TYPE } from '../sites.mjs'

const run = mkdtempSync(path.join(tmpdir(), 'ola-sites-device-'))
const TOKEN = 'fake-token-for-the-device-tests-0123'
let v, fd, db
const PORT = await new Promise((r) => {
  const s = http.createServer().listen(0, '127.0.0.1', () => (r(s.address().port), s.close()))
})
const ORIGIN = `http://localhost:${PORT}`
const PW = { nell: 'seven green ferries at dawn', omar: 'a quiet orange tram at noon' }
const pass = {}
let nellCookie, nellCsrf

before(async () => {
  v = await startFakeVercel({ token: TOKEN })
  mkdirSync(path.join(run, 'ola'), { mode: 0o700 })
  writeFileSync(path.join(run, 'sites.env'), `OLA_SITES_VERCEL_TOKEN=${TOKEN}\nOLA_SITES_PROJECT=ola-sites\n`, { mode: 0o600 })
  Object.assign(process.env, {
    OLA_HOME: path.join(run, 'ola'),
    OLA_FD_DATA: path.join(run, 'fd'),
    OLA_FD_ORIGIN: ORIGIN,
    OLA_FD_GATEWAY_URL: 'http://127.0.0.1:9',
    OLA_GATE_PASS_KEY: randomBytes(32).toString('hex'),
    OLA_FD_PEOPLE_TOKENS_FILE: path.join(run, 'gateway-people'),
    OLA_FD_SIGNIN_BURST: '200',
    OLA_FD_SIGNIN_PER_MIN: '200',
    OLA_FD_IDLE_STOP_MIN: '0',
    OLA_FD_SITES_ORIGIN: v.origin,
    OLA_FD_SITES_API: v.api,
    OLA_FD_SITES_FILE: path.join(run, 'sites.env'),
    OLA_FD_SITES_VERIFY_MS: '3000',
    OLA_FD_SITES_POLL_MS: '50',
    OLA_FD_SITES_MAX_TOTAL_MB: '2',
  })
  const { makeFrontDesk } = await import('../server.mjs')
  const { makePasswordLink } = await import('../auth.mjs')
  fd = makeFrontDesk()
  db = fd.db
  await new Promise((r) => fd.listener.listen(PORT, '127.0.0.1', r))
  const add = (handle) => Number(db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES (?, ?, 'invited', randomblob(32), 0)").run(handle, handle).lastInsertRowid)
  for (const handle of ['nell', 'omar']) {
    const id = add(handle)
    const { raw } = makePasswordLink(db, id, 3600_000)
    assert.equal((await call('/api/auth/reset', { body: { token: raw, password: PW[handle] } })).status, 200)
    const r = await call('/api/device/login', { body: { handle, password: PW[handle], name: `${handle}’s made-up Mac`, kind: 'mac' }, origin: null })
    assert.equal(r.status, 200, r.text)
    pass[handle] = r.json.token
  }
  // A cloud project of nell's, to prove a Mac site never takes a project's address (and back).
  const team = Number(db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('tenants', 'Made-up tenants', 0)").run().lastInsertRowid)
  db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('tenants-ab12', 'Made-up tenants', ?, 'active', 0)").run(team)
  db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('rent-strike', 'Made-up strike', ?, 'active', 0)").run(team)
  db.prepare("INSERT INTO memberships (team_id, person_id, role, added_at) VALUES (?, 1, 'owner', 0)").run(team)
  const s = await call('/api/auth/password', { body: { handle: 'nell', password: PW.nell } })
  nellCookie = s.cookies.map((c) => c.split(';')[0]).join('; ')
  nellCsrf = (await call('/api/me', { method: 'GET', cookie: nellCookie })).json.csrf
})
after(() => {
  fd?.close()
  v?.close()
})

async function call(p, { method = 'POST', body, bearer, cookie, csrf, ws, origin = method === 'GET' ? undefined : ORIGIN } = {}) {
  const h = {}
  if (body !== undefined) h['content-type'] = 'application/json'
  if (bearer) h.authorization = `Bearer ${bearer}`
  if (cookie) h.cookie = cookie
  if (csrf) h['x-ola-csrf'] = csrf
  if (ws) h['x-ola-workspace'] = ws
  if (origin) h.origin = origin
  const r = await fetch(ORIGIN + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: r.status, json, text, cookies: r.headers.getSetCookie() }
}
// What ola-publish sends: every file by name and size, the bytes of the ones that can go public.
const send = (files, named = {}) => [
  ...Object.entries(files).map(([p, body]) => ({ path: p, size: Buffer.byteLength(body), data: Buffer.from(body).toString('base64') })),
  ...Object.entries(named).map(([p, size]) => ({ path: p, size })),
]
const asMac = (who, what, body) => call(`/api/device/sites/${what}`, { body, bearer: pass[who], origin: null })
const audits = (action) => db.prepare('SELECT * FROM audit WHERE action = ?').all(action)

const FLYER = {
  'index.html': '<!doctype html><title>Made-up meeting</title><link rel="stylesheet" href="look.css"><img src="pics/dot.svg"><a href="minutes.docx">minutes</a>',
  'look.css': 'h1 { color: rgb(1, 2, 3) }',
  'pics/dot.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>',
  'minutes.docx': 'PK not a web file',
}

test('the rules alone: names, reserved words, what a Mac sends, the kinds of file', () => {
  const r = (b) => readSent(b, { maxTotal: 1000, maxFile: 500 })
  assert.equal(r({ name: 'Tenants-Flyer', files: [{ path: 'index.html', size: 1, data: 'eA==' }] }).ok.name, 'tenants-flyer')
  for (const bad of ['ab', '-ab', 'ab-', 'a_b', 'a--b', 'x'.repeat(33), '', 'é-site']) assert.equal(r({ name: bad, files: [{ path: 'a', size: 0 }] }).refused?.body.error, 'bad_name', bad)
  for (const p of ['/etc/passwd', '../x', 'a//b', 'a/./b', 'a\\b', '']) assert.equal(r({ name: 'okay', files: [{ path: p, size: 0 }] }).refused?.status, 400, p)
  assert.equal(r({ name: 'okay', files: [{ path: 'a', size: 2, data: 'eA==' }] }).refused?.status, 400, 'bytes that do not match the size')
  assert.equal(r({ name: 'okay', files: [{ path: 'a', size: 600, data: Buffer.alloc(600).toString('base64') }] }).refused?.status, 413)
  assert.equal(r({ name: 'okay', files: [1, 2, 3].map((i) => ({ path: `f${i}`, size: 400, data: Buffer.alloc(400).toString('base64') })) }).refused?.status, 413)
  assert.equal(r({ name: 'okay', files: [{ path: 'a', size: 1, data: 'eA==' }, { path: 'a', size: 1, data: 'eA==' }] }).refused?.status, 400, 'twice the same path')
  assert.ok(RESERVED_NAMES.has('api') && RESERVED_NAMES.has('ola'))
  for (const ok of ['a.html', 'b.CSS', 'c.woff2', 'd.pdf', 'e.mp4', 'f.json']) assert.ok(STATIC_TYPE.test(ok), ok)
  for (const no of ['a.docx', 'b.xlsx', 'c.zip', 'd.exe', 'e.sh', 'Makefile', 'f.php']) assert.ok(!STATIC_TYPE.test(no), no)
})

test('preview: the exact list and the address, nothing leaves; a .docx is left out, a hidden file goes by name only', async () => {
  const calls = v.calls.length
  const r = await asMac('nell', 'preview', { name: 'tenants-flyer', folder: 'flyer', files: send(FLYER, { '.DS_Store': 6148 }) })
  assert.equal(r.status, 200, r.text)
  assert.deepEqual(r.json.items.map((i) => i.as), ['index.html', 'look.css', 'pics/dot.svg'])
  assert.equal(r.json.url, `${v.origin}/tenants-flyer/`)
  assert.equal(r.json.name, 'tenants-flyer')
  assert.deepEqual(r.json.leftOut.map((x) => `${x.path}: ${x.why}`).sort(), ['flyer/.DS_Store: hidden, or a working folder', 'flyer/minutes.docx: not a kind of file a web page uses'])
  assert.match(r.json.fingerprint, /^[0-9a-f]{64}$/)
  assert.match(r.json.acceptableUse, /takes down/)
  assert.equal(v.calls.length, calls, 'a preview sends nothing to the host')
  assert.equal(db.prepare('SELECT count(*) AS n FROM site_names').get().n, 0, 'a preview takes no name')
})

test('no pass, a wrong pass, a browser cookie: refused; GET on a write, a write on the list: refused', async () => {
  assert.equal((await call('/api/device/sites/preview', { body: { name: 'x-y-z', files: send(FLYER) }, origin: null })).status, 401)
  assert.equal((await call('/api/device/sites/preview', { body: { name: 'x-y-z', files: send(FLYER) }, bearer: 'olap1.made-up', origin: null })).status, 401)
  assert.equal((await call('/api/device/sites/preview', { body: { name: 'x-y-z', files: send(FLYER) }, cookie: nellCookie, csrf: nellCsrf })).status, 401)
  assert.equal((await call('/api/device/sites/publish', { method: 'GET', bearer: pass.nell })).status, 405)
  assert.equal((await call('/api/device/sites', { body: {}, bearer: pass.nell, origin: null })).status, 405)
  assert.equal((await call('/api/device/sites/other', { body: {}, bearer: pass.nell, origin: null })).status, 404)
})

test('secrets: a .env by name (its bytes never sent), a key in a script, a database: refused in plain words, nothing leaves, audited', async () => {
  const calls = v.calls.length
  const before = audits('site_refused').length
  const env = await asMac('nell', 'preview', { name: 'leaky-site', folder: 'site', files: send({ 'index.html': '<p>hi</p>' }, { '.env': 40 }) })
  assert.equal(env.status, 422)
  assert.match(env.json.message, /\.env/)
  const key = await asMac('nell', 'publish', { name: 'leaky-site', folder: 'site', files: send({ 'index.html': '<script src="app.js"></script>', 'app.js': 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"' }), fingerprint: 'x', confirm: true })
  assert.equal(key.status, 422)
  assert.match(key.json.message, /site\/app\.js/)
  assert.doesNotMatch(key.text, /sk-ant/)
  const data = await asMac('nell', 'preview', { name: 'leaky-site', folder: 'site', files: send({ 'index.html': '<p>hi</p>', 'people.sqlite': 'SQLite format 3\0' }) })
  assert.equal(data.status, 422)
  assert.match(data.json.message, /database/)
  assert.equal(v.calls.length, calls)
  assert.equal(audits('site_refused').length - before, 3)
  assert.equal(db.prepare("SELECT count(*) AS n FROM site_names WHERE name = 'leaky-site'").get().n, 0, 'a refused publish takes no name')
})

test('publish: the yes and the fingerprint of the list shown; then live, owned, audited; publish again updates it', async () => {
  const body = { name: 'tenants-flyer', folder: 'flyer', files: send(FLYER) }
  const pre = await asMac('nell', 'preview', body)
  assert.equal((await asMac('nell', 'publish', { ...body, fingerprint: pre.json.fingerprint })).status, 400, 'no yes')
  assert.equal((await asMac('nell', 'publish', { ...body, fingerprint: 'f'.repeat(64), confirm: true })).status, 409, 'another list')
  assert.equal(db.prepare("SELECT count(*) AS n FROM site_names WHERE name = 'tenants-flyer'").get().n, 0, 'a refused publish gives the name back')
  const pub = await asMac('nell', 'publish', { ...body, fingerprint: pre.json.fingerprint, confirm: true })
  assert.equal(pub.status, 200, pub.text)
  assert.equal(pub.json.live, true)
  assert.equal(pub.json.again, false)
  assert.equal(pub.json.url, `${v.origin}/tenants-flyer/`)
  const page = await fetch(pub.json.url)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Made-up meeting/)
  assert.match(page.headers.get('content-security-policy'), /^sandbox allow-scripts/)
  assert.equal((await fetch(`${v.origin}/tenants-flyer/minutes.docx`)).status, 404)
  assert.equal(db.prepare("SELECT p.handle FROM site_names s JOIN people p ON p.id = s.person_id WHERE s.name = 'tenants-flyer'").get().handle, 'nell')
  const rows = audits('site_published')
  assert.equal(rows.length, 1)
  assert.ok(rows[0].actor_person_id === 1 && rows[0].workspace_id === null && rows[0].size > 0 && rows[0].sha256 === pre.json.fingerprint)
  // Publish again.
  const next = { ...body, files: send({ ...FLYER, 'index.html': FLYER['index.html'].replace('meeting', 'meeting, new time') }) }
  const pre2 = await asMac('nell', 'preview', next)
  assert.equal(pre2.json.published?.url, pub.json.url)
  const pub2 = await asMac('nell', 'publish', { ...next, fingerprint: pre2.json.fingerprint, confirm: true })
  assert.equal(pub2.status, 200)
  assert.equal(pub2.json.again, true)
  assert.match(await (await fetch(pub.json.url)).text(), /new time/)
  assert.equal(audits('site_updated').length, 1)
  assert.equal(v.deployments().length, 1)
  const mine = await call('/api/device/sites', { method: 'GET', bearer: pass.nell })
  assert.deepEqual(mine.json.sites.map((s) => [s.name, s.published?.files, s.takenDown]), [['tenants-flyer', 3, false]])
  assert.deepEqual((await call('/api/device/sites', { method: 'GET', bearer: pass.omar })).json.sites, [])
})

test('names: nobody overwrites another person’s site, a project’s address, or a reserved word; a project never takes a Mac site’s address', async () => {
  const try_ = async (who, name) => {
    const body = { name, folder: 'site', files: send({ 'index.html': `<p>${who} here</p>` }) }
    const pre = await asMac(who, 'preview', body)
    if (pre.status !== 200) return pre
    return asMac(who, 'publish', { ...body, fingerprint: pre.json.fingerprint, confirm: true })
  }
  const calls = v.calls.length
  const omar = await try_('omar', 'tenants-flyer')
  assert.equal(omar.status, 409)
  assert.match(omar.json.message, /belongs to someone else/)
  for (const project of ['tenants-ab12', 'rent-strike']) {
    for (const who of ['omar', 'nell']) assert.equal((await try_(who, project)).status, 409, `${who} on ${project}`)
  }
  assert.equal((await try_('omar', 'api')).status, 409)
  assert.equal((await try_('omar', 'ola')).status, 409)
  assert.equal(v.calls.length, calls, 'nothing reached the host')
  assert.match(await (await fetch(`${v.origin}/tenants-flyer/`)).text(), /new time/, 'nell’s site is untouched')
  assert.equal((await asMac('omar', 'unpublish', { name: 'tenants-flyer' })).status, 404, 'omar cannot take it down')
  // A project whose slug a Mac site holds: its owner's Publish is refused before anything is read.
  db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('tenants-flyer', 'Made-up late project', 1, 'active', 0)").run()
  const cloud = await call('/api/site/preview?page=index.html', { method: 'GET', cookie: nellCookie, ws: 'tenants-flyer' })
  assert.equal(cloud.status, 409, cloud.text)
  assert.match(cloud.json.message, /from their Mac/)
  db.prepare("DELETE FROM workspaces WHERE slug = 'tenants-flyer'").run()
})

test('unpublish: the owner takes it down (404), the name stays theirs; an admin’s takedown holds it until site-release', async () => {
  const un = await asMac('nell', 'unpublish', { name: 'tenants-flyer' })
  assert.equal(un.status, 200, un.text)
  assert.equal(un.json.gone, true)
  assert.equal((await fetch(`${v.origin}/tenants-flyer/`)).status, 404)
  assert.equal(audits('site_unpublished').length, 1)
  const body = (who) => ({ name: 'tenants-flyer', folder: 'site', files: send({ 'index.html': `<p>${who} again</p>` }) })
  assert.equal((await asMac('omar', 'preview', body('omar'))).status, 409, 'still nell’s name')
  const pre = await asMac('nell', 'preview', body('nell'))
  assert.equal((await asMac('nell', 'publish', { ...body('nell'), fingerprint: pre.json.fingerprint, confirm: true })).status, 200)
  // The admin's takedown.
  // Not spawnSync: the stand-in host answers from this process, so its event loop must keep running.
  const admin = (...a) =>
    new Promise((resolve) => {
      const c = spawn(process.execPath, [new URL('../admin.mjs', import.meta.url).pathname, ...a], { env: process.env })
      const out = { stdout: '', stderr: '' }
      c.stdout.on('data', (d) => (out.stdout += d))
      c.stderr.on('data', (d) => (out.stderr += d))
      c.on('close', (status) => resolve({ ...out, status }))
    })
  const listed = await admin('sites')
  assert.match(listed.stdout, /tenants-flyer\s+mac site of nell/)
  const down = await admin('unpublish', 'tenants-flyer')
  assert.equal(down.status, 0, down.stderr)
  assert.match(down.stdout, /taken down.*the name held/)
  assert.equal((await fetch(`${v.origin}/tenants-flyer/`)).status, 404)
  assert.equal(db.prepare("SELECT actor_kind FROM audit WHERE action = 'site_unpublished' ORDER BY id DESC").get().actor_kind, 'admin')
  const held = await asMac('nell', 'preview', body('nell'))
  assert.equal(held.status, 403)
  assert.match(held.json.message, /took .* down/)
  assert.equal((await call('/api/device/sites', { method: 'GET', bearer: pass.nell })).json.sites[0].takenDown, true)
  assert.equal((await admin('site-release', 'tenants-flyer')).status, 0)
  assert.equal((await asMac('nell', 'preview', body('nell'))).status, 200)
  assert.equal((await admin('site-release', 'tenants-flyer', '--free')).status, 0)
  assert.equal((await asMac('omar', 'preview', body('omar'))).status, 200, 'a freed name is anyone’s')
})

test('not set up (no deploy token on the machine): preview works, publish says so plainly and takes no name', async () => {
  writeFileSync(path.join(run, 'sites.env'), '', { mode: 0o600 })
  try {
    const body = { name: 'unset-site', folder: 'site', files: send({ 'index.html': '<p>x</p>' }) }
    const pre = await asMac('omar', 'preview', body)
    assert.equal(pre.status, 200)
    assert.equal(pre.json.configured, false)
    assert.match(pre.json.notOn, /not switched on yet/)
    const pub = await asMac('omar', 'publish', { ...body, fingerprint: pre.json.fingerprint, confirm: true })
    assert.equal(pub.status, 503)
    assert.match(pub.json.message, /sites\.ola\.cx is not switched on yet.*nothing was published/)
    assert.equal(db.prepare("SELECT count(*) AS n FROM site_names WHERE name = 'unset-site'").get().n, 0)
  } finally {
    writeFileSync(path.join(run, 'sites.env'), `OLA_SITES_VERCEL_TOKEN=${TOKEN}\nOLA_SITES_PROJECT=ola-sites\n`, { mode: 0o600 })
  }
})

test('a body over the cap is refused before it is read whole', async () => {
  const big = Buffer.alloc(6 * 1024 * 1024).toString('base64')
  const r = await asMac('omar', 'preview', { name: 'too-big-site', folder: 'site', files: [{ path: 'index.html', size: 6 * 1024 * 1024, data: big }] })
  assert.equal(r.status, 400)
})

// The agent's side: `ola-publish` (../../bart/ola-publish, the command the Mac app carries) talking
// to a door like the app's ModelDoor (OlaKit/ModelDoor.swift: the agent holds the door's key for
// this launch; the door adds the device's pass and forwards `sites…` to /api/device/sites…).
test('ola-publish through a door: preview, the yes, publish, status, publish again, unpublish; the device pass never reaches the agent; not signed in said plainly', async () => {
  const doorKey = 'oladoor-' + randomBytes(16).toString('hex')
  const seenAuth = []
  const doorSrv = http.createServer((req, res) => {
    const parts = []
    req.on('data', (c) => parts.push(c)).on('end', async () => {
      seenAuth.push(req.headers.authorization)
      if (req.headers.authorization !== `Bearer ${doorKey}`) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"message":"This door is only for Ola on this Mac."}}')
      const rest = req.url.replace(/^\/+/, '')
      if (rest !== 'sites' && !rest.startsWith('sites/')) return res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"Nothing here."}}')
      const r = await fetch(`${ORIGIN}/api/device/${rest}`, { method: req.method, headers: { authorization: `Bearer ${pass.omar}`, 'content-type': 'application/json' }, body: req.method === 'GET' ? undefined : Buffer.concat(parts) })
      res.writeHead(r.status, { 'content-type': 'application/json' }).end(Buffer.from(await r.arrayBuffer()))
    })
  })
  await new Promise((r) => doorSrv.listen(0, '127.0.0.1', r))
  const site = mkdtempSync(path.join(tmpdir(), 'ola-publish-site-'))
  mkdirSync(path.join(site, 'pics'))
  mkdirSync(path.join(site, '.git'))
  writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>Made-up food bank hours</title><img src="pics/dot.svg">')
  writeFileSync(path.join(site, 'pics/dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(path.join(site, '.git/config'), '[remote "origin"]\n\turl = https://made-up@example.com/x.git\n')
  writeFileSync(path.join(site, '.DS_Store'), 'x')
  const tool = new URL('../../bart/ola-publish', import.meta.url).pathname
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, OLA_GATEWAY_HOSTPORT: `127.0.0.1:${doorSrv.address().port}`, BOX_API_KEY: doorKey }
  const olaPublish = (args, e = env) =>
    new Promise((resolve) => {
      const c = spawn('python3', ['-I', tool, ...args], { env: e })
      let out = ''
      c.stdout.on('data', (d) => (out += d))
      c.stderr.on('data', (d) => (out += d))
      c.on('close', (status) => resolve({ status, out }))
    })
  try {
    const pre = await olaPublish(['preview', site, '--name', 'food-bank'])
    assert.equal(pre.status, 0, pre.out)
    assert.match(pre.out, /These 2 file\(s\) would be public at .*\/food-bank\//)
    assert.match(pre.out, /left out: \.DS_Store \(hidden/)
    assert.doesNotMatch(pre.out, /\.git/)
    const fp = /fingerprint: ([0-9a-f]{64})/.exec(pre.out)[1]
    assert.match(pre.out, new RegExp(`ola-publish publish .* --name food-bank --fingerprint ${fp}`))
    assert.equal((await olaPublish(['publish', site, '--name', 'food-bank', '--fingerprint', 'f'.repeat(64)])).status, 1, 'another list')
    const pub = await olaPublish(['publish', site, '--name', 'food-bank', '--fingerprint', fp])
    assert.equal(pub.status, 0, pub.out)
    assert.match(pub.out, /^published: .*\/food-bank\/ +\(2 file\(s\)/m)
    assert.match(pub.out, /answers with the new page now/)
    assert.match(await (await fetch(`${v.origin}/food-bank/`)).text(), /food bank hours/)
    assert.equal((await fetch(`${v.origin}/food-bank/.git/config`)).status, 404)
    const st = await olaPublish(['status'])
    assert.match(st.out, /food-bank: .*\/food-bank\/ +public, 2 file\(s\)/)
    writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>Made-up food bank hours, Saturdays too</title><img src="pics/dot.svg">')
    const pre2 = await olaPublish(['preview', site, '--name', 'food-bank'])
    assert.match(pre2.out, /This replaces what is public there now/)
    const again = await olaPublish(['publish', site, '--name', 'food-bank', '--fingerprint', /fingerprint: ([0-9a-f]{64})/.exec(pre2.out)[1]])
    assert.match(again.out, /^published again:/m)
    assert.match(await (await fetch(`${v.origin}/food-bank/`)).text(), /Saturdays too/)
    // A key in the page: refused in the server's words, the key never printed.
    writeFileSync(path.join(site, 'app.js'), 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"')
    writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>x</title><script src="app.js"></script>')
    const leak = await olaPublish(['preview', site, '--name', 'food-bank'])
    assert.equal(leak.status, 1)
    assert.match(leak.out, /Ola will not publish this: .*app\.js/)
    assert.doesNotMatch(leak.out, /sk-ant/)
    // No deploy token on the server yet (OLA-209): the agent is told plainly, and asks nobody for a yes.
    writeFileSync(path.join(site, 'app.js'), 'const k = 1')
    writeFileSync(path.join(run, 'sites.env'), '', { mode: 0o600 })
    try {
      const off = await olaPublish(['preview', site, '--name', 'food-bank'])
      assert.equal(off.status, 1, off.out)
      assert.match(off.out, /sites\.ola\.cx is not switched on yet.*nothing was published/)
      assert.doesNotMatch(off.out, /Shall I publish|fingerprint:/)
      const offPub = await olaPublish(['publish', site, '--name', 'food-bank', '--fingerprint', 'f'.repeat(64)])
      assert.equal(offPub.status, 1)
      assert.match(offPub.out, /not switched on yet/)
    } finally {
      writeFileSync(path.join(run, 'sites.env'), `OLA_SITES_VERCEL_TOKEN=${TOKEN}\nOLA_SITES_PROJECT=ola-sites\n`, { mode: 0o600 })
    }
    const un = await olaPublish(['unpublish', '--name', 'food-bank'])
    assert.equal(un.status, 0, un.out)
    assert.match(un.out, /now answers 404\. The name stays yours/)
    assert.equal((await fetch(`${v.origin}/food-bank/`)).status, 404)
    // Every request the agent's command made carried the door's key, never the device's pass.
    assert.ok(seenAuth.length >= 8 && seenAuth.every((a) => a === `Bearer ${doorKey}`), JSON.stringify(seenAuth.length))
    // Not signed in (the pasted setup's forwarder, or no door at all): said plainly, nothing sent.
    const before = seenAuth.length
    for (const e of [{ ...env, OLA_GATEWAY_HOSTPORT: '10.0.0.1:4311' }, { PATH: process.env.PATH }]) {
      const r = await olaPublish(['preview', site, '--name', 'food-bank'], e)
      assert.equal(r.status, 3)
      assert.match(r.out, /not signed in to an Ola account.*ola login/s)
    }
    assert.equal(seenAuth.length, before)
    // A door with no account behind it answers 404 for sites: the same sentence.
    const noAccount = http.createServer((q, s) => s.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"Nothing here."}}'))
    await new Promise((r) => noAccount.listen(0, '127.0.0.1', r))
    const r = await olaPublish(['status'], { ...env, OLA_GATEWAY_HOSTPORT: `127.0.0.1:${noAccount.address().port}` })
    noAccount.close()
    assert.equal(r.status, 3)
    assert.match(r.out, /not signed in to an Ola account/)
  } finally {
    doorSrv.close()
  }
})

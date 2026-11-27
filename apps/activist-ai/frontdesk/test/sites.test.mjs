// Publish (sites.mjs, OLA-209), against the stand-in for Vercel (../../web/server/fake-vercel.mjs):
// what a page uses, the file list, secrets refused, publish, publish again, unpublish, the headers,
// and the sign-in cookie's scope (host-only, never for .ola.cx). The end-to-end proofs through a
// sealed workspace are in ../check.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { folderCtx, makeSites, referencesIn, resolveRef, secretIn, sitesConfig, SITE_CSP } from '../sites.mjs'
import { knownCookieName, sessionCookie } from '../auth.mjs'
import { startFakeVercel } from '../../web/server/fake-vercel.mjs'

const tmp = () => fs.mkdtempSync(path.join(tmpdir(), 'ola-sites-'))
function project(files) {
  const root = tmp()
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body)
  }
  return root
}
async function setup() {
  const token = 'fake-token-for-tests-0123456789'
  const v = await startFakeVercel({ token })
  const d = tmp()
  fs.writeFileSync(path.join(d, 'sites.env'), `OLA_SITES_VERCEL_TOKEN=${token}\nOLA_SITES_PROJECT=ola-sites\n`, { mode: 0o600 })
  const cfg = sitesConfig({ OLA_FD_SITES_ORIGIN: v.origin, OLA_FD_SITES_API: v.api, OLA_FD_SITES_FILE: path.join(d, 'sites.env'), OLA_FD_SITES_VERIFY_MS: '3000', OLA_FD_SITES_SETTLE_MS: '120', OLA_FD_SITES_POLL_MS: '50', OLA_FD_SITES_CHALLENGE_MS: '200' })
  return { v, sites: makeSites({ cfg, dataDir: path.join(d, 'fd') }), d }
}

test('the sign-in cookies are host-only: __Host- on https, no Domain, never .ola.cx', () => {
  for (const c of [sessionCookie('https://app.ola.cx'), knownCookieName('https://app.ola.cx')]) {
    assert.match(c.name, /^__Host-/)
    assert.doesNotMatch(c.attrs, /domain/i)
    assert.match(c.attrs, /(^|; )Path=\/(;|$)/)
    assert.match(c.attrs, /Secure/)
    assert.match(c.attrs, /SameSite=Strict/)
  }
})

test('what a page uses: its own files followed, other sites and climbing out noted', () => {
  const refs = referencesIn('a/index.html', '<link rel="stylesheet" href="style.css"><img src="img/x.png" srcset="img/x2.png 2x, img/x3.png 3x"><a href="other.html">o</a><script src="https://cdn.example.com/x.js"></script><div style="background:url(\'bg.jpg\')"></div>')
  const byRef = Object.fromEntries(refs.map((r) => [r.ref, r.use]))
  assert.equal(byRef['style.css'], 'load')
  assert.equal(byRef['other.html'], 'link')
  for (const r of ['img/x.png', 'img/x2.png', 'img/x3.png', 'bg.jpg', 'https://cdn.example.com/x.js']) assert.ok(r in byRef, r)
  assert.deepEqual(resolveRef('a', 'img/x.png?v=2#top'), { kind: 'local', path: 'a/img/x.png' })
  assert.equal(resolveRef('a', '../../etc/passwd').kind, 'outside')
  assert.equal(resolveRef('a', '/root.css').kind, 'absolute')
  assert.equal(resolveRef('a', '//cdn.example.com/x.js').kind, 'external')
  assert.equal(resolveRef('a', 'mailto:x@example.com').kind, 'skip')
  assert.deepEqual(referencesIn('s.css', "@import 'base.css'; a { background: url(dot.svg) }").map((r) => r.ref), ['base.css', 'dot.svg'])
})

test('secrets and private data are refused, by name and by content', () => {
  assert.ok(secretIn('site/.env', null))
  assert.ok(secretIn('site/prod.env', null))
  assert.ok(secretIn('keys/server.pem', null))
  assert.ok(secretIn('project.db', null))
  assert.ok(secretIn('data/people.sqlite', null))
  assert.ok(secretIn('x.bin', Buffer.from('SQLite format 3\0rest')))
  assert.ok(secretIn('a.js', Buffer.from('const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345"')))
  assert.ok(secretIn('a.txt', Buffer.from('OPENAI_API_KEY=sk-0123456789abcdef0123456789abcdef\n')))
  assert.ok(secretIn('a.html', Buffer.from('<script>const config = { apiKey: "AIzaSyD-1234567890abcdefghijklmnopqrstu" }</script>')))
  assert.ok(secretIn('a.html', Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----\nabc')))
  assert.equal(secretIn('a.html', Buffer.from('our key is THE-WORKSPACE-OWN-SECRET-123')), null)
  assert.ok(secretIn('a.html', Buffer.from('it holds THE-WORKSPACE-OWN-SECRET-123 here'), ['THE-WORKSPACE-OWN-SECRET-123']))
  // An ordinary page is fine, a password field included.
  assert.equal(secretIn('index.html', Buffer.from('<form><label>Password <input type="password" placeholder="Your password"></label></form><p>sha256 a3f1…</p>')), null)
})

test('the list: a page and exactly what it uses; publish, publish again, unpublish', async () => {
  const { v, sites, d } = await setup()
  const root = project({
    'flyer/flyer.html': '<!doctype html><title>Flyer</title><link rel="stylesheet" href="style.css"><img src="pics/a.png"><a href="more.html">more</a><script src="https://cdn.example.com/x.js"></script>',
    'flyer/style.css': 'body { background: url(pics/bg.png) }',
    'flyer/pics/a.png': 'PNGDATA',
    'flyer/pics/bg.png': 'BGDATA',
    'flyer/more.html': '<p>more</p>',
    'flyer/unused.txt': 'not used by the page',
    'survey.csv': 'id,answer\n1,private\n',
  })
  const ctx = folderCtx('tenants-flyer', root, { uploaded: (p) => p === 'flyer/pics/a.png' })
  const pre = await sites.preview(ctx, { page: 'flyer/flyer.html' })
  assert.equal(pre.status, 200, JSON.stringify(pre.body))
  assert.deepEqual(pre.body.items.map((i) => i.as), ['index.html', 'more.html', 'pics/a.png', 'pics/bg.png', 'style.css'])
  assert.equal(pre.body.url, `${v.origin}/tenants-flyer/`)
  assert.ok(pre.body.warnings.some((w) => /cdn\.example\.com/.test(w)))
  assert.ok(pre.body.warnings.some((w) => /added by your group/.test(w)))
  assert.ok(!pre.body.items.some((i) => /survey|unused/.test(i.path)))
  assert.equal(v.calls.length, 0, 'a preview sends nothing')

  // A yes for another list is refused: what leaves is what was shown.
  assert.equal((await sites.publish(ctx, { page: 'flyer/flyer.html' }, 'f'.repeat(64))).status, 409)
  const pub = await sites.publish(ctx, { page: 'flyer/flyer.html' }, pre.body.fingerprint)
  assert.equal(pub.status, 200, JSON.stringify(pub.body))
  assert.equal(pub.body.live, true)
  assert.equal(pub.body.again, false)
  const live = v.live()
  assert.ok(live.has('tenants-flyer/index.html') && live.has('tenants-flyer/pics/bg.png') && !live.has('tenants-flyer/unused.txt'))
  assert.ok(v.calls.every((c) => c.authed))
  const page = await fetch(`${v.origin}/tenants-flyer/`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Flyer/)
  assert.equal(page.headers.get('content-security-policy'), SITE_CSP)
  assert.match(SITE_CSP, /^sandbox allow-scripts /)
  assert.doesNotMatch(SITE_CSP, /allow-same-origin/)
  assert.equal(page.headers.get('x-frame-options'), 'DENY')
  assert.equal(sites.status('tenants-flyer').files, 5)

  // Publish again: the change is live, the deployment before it is gone.
  fs.writeFileSync(path.join(root, 'flyer/flyer.html'), '<!doctype html><title>Flyer, second edition</title>')
  const pre2 = await sites.preview(ctx, { page: 'flyer/flyer.html' })
  assert.deepEqual(pre2.body.items.map((i) => i.as), ['index.html'])
  assert.ok(pre2.body.published)
  const pub2 = await sites.publish(ctx, { page: 'flyer/flyer.html' }, pre2.body.fingerprint)
  assert.equal(pub2.body.again, true)
  assert.match(await (await fetch(`${v.origin}/tenants-flyer/`)).text(), /second edition/)
  assert.equal(v.deployments().length, 1)

  // Another project's pages stay up while this one is taken down.
  const other = folderCtx('other-project', project({ 'site/index.html': '<title>Other</title>' }))
  const po = await sites.preview(other, { folder: 'site' })
  assert.equal((await sites.publish(other, { folder: 'site' }, po.body.fingerprint)).status, 200)
  const un = await sites.unpublish('tenants-flyer')
  assert.equal(un.status, 200)
  assert.equal(un.body.gone, true)
  assert.equal((await fetch(`${v.origin}/tenants-flyer/`)).status, 404)
  assert.equal((await fetch(`${v.origin}/other-project/`)).status, 200)
  assert.equal(sites.status('tenants-flyer'), null)
  assert.equal((await sites.unpublish('tenants-flyer')).status, 404)
  // No copy of a taken-down file is kept.
  assert.ok(!fs.readdirSync(path.join(d, 'fd/sites/blobs')).includes(pub2.plan.items[0].sha))
  v.close()
})

test('a secret in what a page uses, a .env in a folder, the database: refused with a plain sentence, nothing sent', async () => {
  const { v, sites } = await setup()
  const root = project({
    'page.html': '<script src="app.js"></script>',
    'app.js': 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"',
    'site/index.html': '<p>hi</p>',
    'site/.env': 'TOKEN=abc',
    'db/index.html': '<a href="data.db">data</a><img src="data.db">',
    'db/data.db': 'SQLite format 3\0...',
    'root.html': '<p>root</p>',
  })
  const ctx = folderCtx('secret-test', root)
  const a = await sites.preview(ctx, { page: 'page.html' })
  assert.equal(a.status, 422)
  assert.equal(a.body.error, 'secret')
  assert.match(a.body.message, /app\.js/)
  assert.doesNotMatch(a.body.message, /sk-ant/)
  const b = await sites.preview(ctx, { folder: 'site' })
  assert.equal(b.status, 422)
  assert.match(b.body.message, /\.env/)
  const c = await sites.preview(ctx, { page: 'db/index.html' })
  assert.equal(c.status, 422)
  assert.match(c.body.message, /database/)
  // The whole project is never one folder: it holds the uploads.
  assert.equal((await sites.preview(ctx, { folder: '' })).status, 400)
  // A publish refuses the same way, before anything leaves.
  assert.equal((await sites.publish(ctx, { page: 'page.html' }, 'x')).status, 422)
  assert.equal(v.calls.length, 0)
  // A page at the top of the project goes alone (its folder is the project).
  const r = await sites.preview(ctx, { page: 'root.html' })
  assert.deepEqual(r.body.items.map((i) => i.as), ['index.html'])
  v.close()
})

test('not set up: no credential file, nothing published, said plainly', async () => {
  const d = tmp()
  const sites = makeSites({ cfg: sitesConfig({ OLA_FD_SITES_FILE: path.join(d, 'none.env') }), dataDir: d })
  assert.equal(sites.configured(), false)
  const r = await sites.publish(folderCtx('x-y-z', project({ 'a.html': 'x' })), { page: 'a.html' }, 'x')
  assert.equal(r.status, 503)
  assert.match(r.body.message, /not set up/)
})

// OLA-223: no Vercel token, a git remote instead. The host deploys the repository on push; here the
// remote is a bare repository on disk and a small server plays sites.ola.cx by serving what its
// branch holds (trailing slash -> index.html, anything missing -> 404, as Vercel does).
// `edges.stale(p)`: when it returns a body, every third new connection (one edge server in three
// that has not switched over yet) gets that body instead of the branch's (OLA-302).
async function gitSetup({ delayMs = 0 } = {}) {
  const { execFileSync } = await import('node:child_process')
  const http = await import('node:http')
  const d = tmp()
  const bare = path.join(d, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', bare])
  let pushedAt = 0
  let conns = 0
  const edges = { stale: () => null, challenge: false, requests: 0, connections: 0 }
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '')
    if (p === '' || p.endsWith('/')) p += 'index.html'
    edges.requests += 1
    if (edges.challenge) return res.writeHead(403, { 'x-vercel-mitigated': 'challenge' }).end('<title>Vercel Security Checkpoint</title>')
    const old = req.socket.n % 3 === 0 ? edges.stale(p) : null
    if (old) return res.writeHead(200).end(old)
    let body = null
    if (Date.now() - pushedAt >= delayMs) {
      try {
        body = execFileSync('git', ['-C', bare, 'show', `main:${p}`], { stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {}
    }
    res.writeHead(body ? 200 : 404).end(body ?? 'not found')
  })
  server.on('connection', (sock) => {
    sock.n = ++conns
    edges.connections = conns
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  fs.writeFileSync(path.join(d, 'sites.env'), `OLA_SITES_GIT_REMOTE=${bare}\nOLA_SITES_GIT_EMAIL=owner@example.com\n`, { mode: 0o600 })
  const cfg = sitesConfig({ OLA_FD_SITES_ORIGIN: origin, OLA_FD_SITES_API: 'http://127.0.0.1:9', OLA_FD_SITES_FILE: path.join(d, 'sites.env'), OLA_FD_SITES_GIT_VERIFY_MS: '3000', OLA_FD_SITES_GIT_SETTLE_MS: '120', OLA_FD_SITES_POLL_MS: '50' })
  const branch = (args) => execFileSync('git', ['-C', bare, ...args], { encoding: 'utf8' })
  return { d, bare, origin, branch, server, cfg, sites: makeSites({ cfg, dataDir: path.join(d, 'fd'), request: () => assert.fail('no Vercel API call in git mode') }), markPush: () => (pushedAt = Date.now()), edges }
}

test('git mode: publish = one commit pushed, the page live; publish again; unpublish leaves no trace in the branch', async () => {
  const g = await gitSetup()
  assert.equal(g.sites.configured(), true)
  const root = project({ 'site/index.html': '<!doctype html><title>Git one</title><img src="a.png">', 'site/a.png': 'PNG', 'site/notes.docx': 'word' })
  const ctx = folderCtx('git-flyer', root)
  const pre = await g.sites.preview(ctx, { folder: 'site' })
  assert.equal(pre.status, 200, JSON.stringify(pre.body))
  assert.ok(pre.body.leftOut.some((l) => /notes\.docx/.test(l.path)))
  // Always the person's yes for this exact list.
  assert.equal((await g.sites.publish(ctx, { folder: 'site' }, 'f'.repeat(64))).status, 409)
  const pub = await g.sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint)
  assert.equal(pub.status, 200, JSON.stringify(pub.body))
  assert.equal(pub.body.live, true)
  assert.match(await (await fetch(`${g.origin}/git-flyer/`)).text(), /Git one/)
  const files = g.branch(['ls-tree', '-r', '--name-only', 'main']).trim().split('\n').sort()
  assert.deepEqual(files, ['404.html', 'git-flyer/a.png', 'git-flyer/index.html', 'index.html', 'vercel.json'])
  assert.deepEqual(JSON.parse(g.branch(['show', 'main:vercel.json'])).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value, SITE_CSP)
  assert.equal(g.branch(['log', '--format=%ae', 'main']).trim(), 'owner@example.com')

  // A second project, then publish the first again: still one commit, both there.
  const other = folderCtx('git-other', project({ 'w/index.html': '<title>Other</title>' }))
  const po = await g.sites.preview(other, { folder: 'w' })
  assert.equal((await g.sites.publish(other, { folder: 'w' }, po.body.fingerprint)).status, 200)
  fs.writeFileSync(path.join(root, 'site/index.html'), '<!doctype html><title>Git two</title>')
  const pre2 = await g.sites.preview(ctx, { folder: 'site' })
  const pub2 = await g.sites.publish(ctx, { folder: 'site' }, pre2.body.fingerprint)
  assert.equal(pub2.body.again, true)
  assert.match(await (await fetch(`${g.origin}/git-flyer/`)).text(), /Git two/)
  assert.equal(g.branch(['rev-list', '--count', 'main']).trim(), '1')

  const un = await g.sites.unpublish('git-flyer')
  assert.equal(un.status, 200)
  assert.equal(un.body.gone, true)
  assert.equal((await fetch(`${g.origin}/git-flyer/`)).status, 404)
  assert.equal((await fetch(`${g.origin}/git-other/`)).status, 200)
  assert.equal(g.branch(['rev-list', '--count', 'main']).trim(), '1')
  assert.doesNotMatch(g.branch(['ls-tree', '-r', '--name-only', 'main']), /git-flyer/)
  g.server.close()
})

test('git mode, two Ola machines on one site: each keeps the other\'s pages, a name the other holds is refused, publishes at once both land (OLA-494)', async () => {
  const g = await gitSetup()
  const studio = makeSites({ cfg: g.cfg, dataDir: path.join(g.d, 'fd-studio'), request: () => assert.fail('no Vercel API call in git mode') })
  const pub = async (sites, slug, title) => {
    const ctx = folderCtx(slug, project({ 'site/index.html': `<!doctype html><title>${title}</title>` }))
    const pre = await sites.preview(ctx, { folder: 'site' })
    return sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint)
  }
  const tree = () => g.branch(['ls-tree', '--name-only', 'main']).trim().split('\n').sort()
  // The Studio publishes first, then the test server: the Studio's page stays.
  assert.equal((await pub(studio, 'studio-page', 'Studio one')).body.live, true)
  assert.equal((await pub(g.sites, 'test-page', 'Test one')).body.live, true)
  assert.deepEqual(tree(), ['404.html', 'index.html', 'studio-page', 'test-page', 'vercel.json'])
  assert.match(await (await fetch(`${g.origin}/studio-page/`)).text(), /Studio one/)
  // The Studio publishes again: the test server's page stays too.
  assert.equal((await pub(studio, 'studio-page', 'Studio two')).body.live, true)
  assert.match(await (await fetch(`${g.origin}/test-page/`)).text(), /Test one/)
  assert.match(await (await fetch(`${g.origin}/studio-page/`)).text(), /Studio two/)
  // A name the Studio holds is refused on the test server, plainly, and the Studio's page is untouched.
  const taken = await pub(g.sites, 'studio-page', 'Overwritten')
  assert.equal(taken.status, 409, JSON.stringify(taken.body))
  assert.equal(taken.body.error, 'name_taken')
  assert.match(taken.body.message, /another Ola machine.*Nothing was published/)
  assert.equal(g.sites.status('studio-page'), null)
  assert.match(await (await fetch(`${g.origin}/studio-page/`)).text(), /Studio two/)
  // Unpublish on the test server takes only its own page down.
  assert.equal((await g.sites.unpublish('test-page')).body.gone, true)
  assert.deepEqual(tree(), ['404.html', 'index.html', 'studio-page', 'vercel.json'])
  // Both publish at the same moment: the push that lost the race reads the branch again; both land.
  const [a, b] = await Promise.all([pub(studio, 'studio-race', 'SR'), pub(g.sites, 'test-race', 'TR')])
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(b.status, 200, JSON.stringify(b.body))
  assert.deepEqual(tree(), ['404.html', 'index.html', 'studio-page', 'studio-race', 'test-race', 'vercel.json'])
  assert.equal(g.branch(['rev-list', '--count', 'main']).trim(), '1')
  g.server.close()
})

test('git mode, a desk from before OLA-494 (no list of its folders): owns the branch only if it pushed it last', async () => {
  const g = await gitSetup()
  const other = makeSites({ cfg: g.cfg, dataDir: path.join(g.d, 'fd-other'), request: () => assert.fail('no Vercel API call') })
  const pub = async (sites, slug) => {
    const ctx = folderCtx(slug, project({ 'site/index.html': `<title>${slug}</title>` }))
    const pre = await sites.preview(ctx, { folder: 'site' })
    return sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint)
  }
  assert.equal((await pub(g.sites, 'mine-a')).status, 200)
  // Forget the list, as an older release left state.json; the branch is still our last push.
  const stateFile = path.join(g.d, 'fd', 'sites', 'state.json')
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  delete st.owned
  fs.writeFileSync(stateFile, JSON.stringify(st))
  assert.equal((await g.sites.unpublish('mine-a')).body.gone, true, 'its own page, recognised from the last push')
  // Another machine pushed since: nothing on the branch is ours, it is all kept.
  assert.equal((await pub(g.sites, 'mine-b')).status, 200)
  assert.equal((await pub(other, 'theirs-a')).status, 200)
  const st2 = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  delete st2.owned
  fs.writeFileSync(stateFile, JSON.stringify(st2))
  assert.equal((await pub(g.sites, 'mine-c')).status, 409, 'mine-b is on the branch, unclaimed: refused rather than dropped')
  assert.match(await (await fetch(`${g.origin}/theirs-a/`)).text(), /theirs-a/)
  g.server.close()
})

test('git mode: a host slower than the wait says so plainly; a push that fails changes nothing', async () => {
  const g = await gitSetup({ delayMs: 60_000 })
  const ctx = folderCtx('git-slow', project({ 'site/index.html': '<title>Slow</title>' }))
  const pre = await g.sites.preview(ctx, { folder: 'site' })
  g.markPush()
  // OLA-285: each read during the check is heard (what the address answers so far, and when the check ends).
  const looks = []
  const pub = await g.sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint, { onLook: (l) => looks.push(l) })
  assert.equal(pub.status, 200)
  assert.equal(pub.body.live, false)
  assert.match(pub.body.message, /does not show it yet/)
  assert.ok(looks.length >= 1, 'the check reported its reads')
  assert.ok(looks.every((l) => typeof l.until === 'number' && 'status' in l && 'shows' in l && l.challenged === false), JSON.stringify(looks[0]))
  // The remote goes away: the publish fails, plainly, and nothing is recorded as published.
  fs.rmSync(g.bare, { recursive: true, force: true })
  const ctx2 = folderCtx('git-fail', project({ 'site/index.html': '<title>Fail</title>' }))
  const pre2 = await g.sites.preview(ctx2, { folder: 'site' })
  const bad = await g.sites.publish(ctx2, { folder: 'site' }, pre2.body.fingerprint)
  assert.equal(bad.status, 502)
  assert.match(bad.body.message, /Nothing changed/)
  assert.equal(g.sites.status('git-fail'), null)
  g.server.close()
})

test('git mode: one edge server still on the old page means not live; live once every read, each on a new connection, shows the new one (OLA-302)', async () => {
  const g = await gitSetup()
  const root = project({ 'site/index.html': '<!doctype html><title>Oak</title>' })
  const ctx = folderCtx('git-edges', root)
  const pre = await g.sites.preview(ctx, { folder: 'site' })
  assert.equal((await g.sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint)).body.live, true)
  const oak = fs.readFileSync(path.join(root, 'site/index.html'))
  // Publish again while one edge in three keeps the old page for the whole wait: not live, and the
  // answer names what the address still shows.
  g.edges.stale = (p) => (p === 'git-edges/index.html' ? oak : null)
  fs.writeFileSync(path.join(root, 'site/index.html'), '<!doctype html><title>Bart was here</title>')
  const pre2 = await g.sites.preview(ctx, { folder: 'site' })
  const before = { r: g.edges.requests, c: g.edges.connections }
  const pub2 = await g.sites.publish(ctx, { folder: 'site' }, pre2.body.fingerprint)
  assert.equal(pub2.status, 200)
  assert.equal(pub2.body.live, false, 'an old answer from one edge server must keep it from being called live')
  assert.match(pub2.body.message, /does not show it yet/)
  // Every read of the check was its own connection, as a reader's would be.
  assert.equal(g.edges.connections - before.c, g.edges.requests - before.r)
  // The edge switches over 400 ms in: live, and after it every read gets the new page.
  const t0 = Date.now()
  g.edges.stale = (p) => (p === 'git-edges/index.html' && Date.now() - t0 < 400 ? oak : null)
  fs.writeFileSync(path.join(root, 'site/index.html'), '<!doctype html><title>Bart was here, again</title>')
  const pre3 = await g.sites.preview(ctx, { folder: 'site' })
  const pub3 = await g.sites.publish(ctx, { folder: 'site' }, pre3.body.fingerprint)
  assert.equal(pub3.body.live, true, JSON.stringify(pub3.body))
  assert.ok(Date.now() - t0 >= 400)
  for (let i = 0; i < 6; i++) {
    const { readAsReader } = await import('../sites.mjs')
    assert.match((await readAsReader(`${g.origin}/git-edges/`)).body.toString(), /again/)
  }
  g.server.close()
})

test('the host\'s bot check answering instead of the page: unconfirmed, said plainly, read slowly; never "still shows" (OLA-230)', async () => {
  const { isChallenge } = await import('../sites.mjs')
  assert.equal(isChallenge(403, { 'x-vercel-mitigated': 'challenge' }), true)
  assert.equal(isChallenge(403, {}, Buffer.from('<title>Vercel Security Checkpoint</title>')), true)
  assert.equal(isChallenge(403, {}, Buffer.from('<title>Forbidden</title>')), false)
  assert.equal(isChallenge(404, { 'x-vercel-mitigated': 'challenge' }), false)
  const g = await gitSetup()
  const root = project({ 'site/index.html': '<!doctype html><title>Oak</title>' })
  const ctx = folderCtx('git-checkpoint', root)
  const pre = await g.sites.preview(ctx, { folder: 'site' })
  assert.equal((await g.sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint)).body.live, true)
  fs.writeFileSync(path.join(root, 'site/index.html'), '<!doctype html><title>Persimmon</title>')
  const pre2 = await g.sites.preview(ctx, { folder: 'site' })
  g.edges.challenge = true
  const before = g.edges.requests
  const pub = await g.sites.publish(ctx, { folder: 'site' }, pre2.body.fingerprint)
  assert.equal(pub.status, 200)
  assert.equal(pub.body.live, false)
  assert.equal(pub.body.unconfirmed, true)
  assert.equal(pub.body.shows, '', 'nothing is said about what the address shows')
  assert.match(pub.body.message, /could not read .* to confirm/)
  assert.doesNotMatch(pub.body.message, /does not show it|still shows/)
  // 3 s of waiting at one read per 200 ms after a challenge: about 15 reads, not 60 at the 50 ms poll.
  assert.ok(g.edges.requests - before <= 20, `${g.edges.requests - before} reads into the bot check`)
  // Taking it down while the check still answers: also unconfirmed, never "still shows it".
  const down = await g.sites.unpublish('git-checkpoint')
  assert.equal(down.body.unconfirmed, true, JSON.stringify(down.body))
  assert.doesNotMatch(down.body.message, /still shows it/)
  g.edges.challenge = false
  g.server.close()
})

test('git mode: the secret check still runs before anything is written', async () => {
  const g = await gitSetup()
  const ctx = folderCtx('git-secret', project({ 'site/index.html': '<p>hi</p>', 'site/.env': 'TOKEN=abc' }))
  assert.equal((await g.sites.publish(ctx, { folder: 'site' }, 'x')).status, 422)
  assert.equal(g.branch(['branch', '--list']).trim(), '')
  g.server.close()
})

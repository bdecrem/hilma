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
  const cfg = sitesConfig({ OLA_FD_SITES_ORIGIN: v.origin, OLA_FD_SITES_API: v.api, OLA_FD_SITES_FILE: path.join(d, 'sites.env'), OLA_FD_SITES_VERIFY_MS: '3000', OLA_FD_SITES_POLL_MS: '50' })
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

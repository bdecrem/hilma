// The front desk stand-in's rules: which opencode routes the page may use, what a session is
// created with, and which file names are accepted. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowed, forwardedQuery, permissionsFor, rewriteSessionCreate, rewriteSessionUpdate } from '../server/proxy.mjs'
import { safeRelative, validName } from '../server/files.mjs'

test('the door lets through only what the page uses', () => {
  assert.ok(allowed('GET', '/api/event'))
  assert.ok(allowed('POST', '/api/session/ses_abc/prompt'))
  assert.ok(allowed('POST', '/api/session/ses_abc/permission/per_1/reply'))
  for (const [m, p] of [
    ['GET', '/api/config'],
    ['POST', '/api/session/ses_abc/shell'],
    ['GET', '/api/credential'],
    ['POST', '/api/pty'],
    ['DELETE', '/api/session/ses_abc'],
    ['GET', '/api/session/../config'],
    ['GET', '/api/file'],
  ])
    assert.ok(!allowed(m, p), `${m} ${p}`)
})

test('a session is created in the workspace with rules the page cannot widen', () => {
  const body = rewriteSessionCreate(JSON.stringify({ title: 't', location: { directory: '/' }, permissions: [{ action: '*', resource: '*', effect: 'allow' }], metadata: { autonomy: 'ask' } }), '/work')
  assert.equal(body.location.directory, '/work')
  assert.deepEqual(body.metadata, { autonomy: 'ask' })
  const last = body.permissions.slice(-5).map((r) => `${r.action}:${r.effect}${r.action === 'external_directory' && r.effect === 'allow' ? `:${r.resource}` : ''}`)
  // The denials, then the one exception: reading Ola's own skills in the image (first-user pass).
  assert.deepEqual(last, ['webfetch:deny', 'websearch:deny', 'external_directory:deny', 'browser:deny', 'external_directory:allow:/opt/ola/skills/*'])
  assert.ok(body.permissions.some((r) => r.action === 'shell' && r.effect === 'ask'))
  assert.equal(rewriteSessionCreate('{not json', '/work'), null)
  const go = rewriteSessionCreate('{}', '/work')
  assert.ok(!go.permissions.some((r) => r.effect === 'ask' && !/^(\/opt\/ola\/bin\/)?ola-(search|fetch|lookup) \*$/.test(r.resource)), 'go ahead asks nothing but a web search, download or paper lookup')
})

test('an update carries only a title and an autonomy', () => {
  assert.deepEqual(rewriteSessionUpdate(JSON.stringify({ permissions: [{ action: 'external_directory', resource: '*', effect: 'allow' }] })), {})
  const u = rewriteSessionUpdate(JSON.stringify({ metadata: { autonomy: 'go' } }))
  assert.deepEqual(u.permissions, permissionsFor('go'))
})

test('file names: plain names only', () => {
  for (const ok of ['survey.csv', 'Notes 2026 (draft).md', 'a-b_c,d+e.txt']) assert.ok(validName(ok), ok)
  for (const bad of ['', '.env', '../x', 'a/b', 'x\u0000y', 'é.txt', 'a'.repeat(201)]) assert.ok(!validName(bad), JSON.stringify(bad))
  assert.equal(safeRelative('notes/a.md'), 'notes/a.md')
  assert.equal(safeRelative('../etc/passwd'), null)
  assert.equal(safeRelative('.ola/opencode.db'), null)
})

test('the query to opencode never names a directory or workspace (review 2026-11-16, M5)', () => {
  assert.equal(forwardedQuery('?directory=/opt/ola&limit=5'), '?limit=5')
  assert.equal(forwardedQuery('?Directory=/&WORKSPACE=x'), '')
  assert.equal(forwardedQuery(''), '')
  assert.equal(forwardedQuery('?w=fd-a'), '?w=fd-a')
})

test('the home leaves out Ola’s own check screenshots; Files keeps them (first-user pass, B9)', async () => {
  const { otherFiles, otherCount } = await import('../server/project.mjs')
  const list = [{ path: 'shots/hello-390.png', origin: 'made' }, { path: 'shots/mine.png', origin: 'uploaded' }, { path: 'notes.txt', origin: 'made' }, { path: 'shots/deep/x.png', origin: 'made' }]
  assert.deepEqual(otherFiles(list, []).map((f) => f.path), ['shots/mine.png', 'notes.txt', 'shots/deep/x.png'])
  assert.equal(otherCount(list, []), 3)
})

// "Lots of permissions" (OLA-139): the front desk's own record of a conversation's autonomy comes
// from its rewrite of the create and the update, with the id opencode gave the new conversation.
test('the proxy tells which conversations are under Lots of permissions', async () => {
  const http = await import('node:http')
  const { makeProxy } = await import('../server/proxy.mjs')
  const up = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(req.method === 'POST' ? { data: { id: 'ses_new1' } } : { data: { id: 'ses_old1' } }))
    })
  })
  await new Promise((r) => up.listen(0, '127.0.0.1', r))
  const told = []
  const proxy = makeProxy({ target: `http://127.0.0.1:${up.address().port}`, authorization: 'Basic x', work: '/work', onAutonomy: (id, a) => told.push([id, a]) })
  const front = http.createServer((req, res) => proxy(req, res, new URL(req.url, 'http://x').pathname, ''))
  await new Promise((r) => front.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${front.address().port}`
  const send = (method, p, body) => fetch(`${base}${p}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.text())
  await send('POST', '/api/session', { metadata: { autonomy: 'go' } })
  await send('PATCH', '/api/session/ses_old1', { metadata: { autonomy: 'ask' } })
  await send('PATCH', '/api/session/ses_old1', { title: 'only a title' })
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(told, [['ses_new1', 'go'], ['ses_old1', 'ask']])
  front.close()
  up.close()
})

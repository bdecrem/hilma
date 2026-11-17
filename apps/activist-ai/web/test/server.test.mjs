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
  const last = body.permissions.slice(-4).map((r) => `${r.action}:${r.effect}`)
  assert.deepEqual(last, ['webfetch:deny', 'websearch:deny', 'external_directory:deny', 'browser:deny'])
  assert.ok(body.permissions.some((r) => r.action === 'shell' && r.effect === 'ask'))
  assert.equal(rewriteSessionCreate('{not json', '/work'), null)
  const go = rewriteSessionCreate('{}', '/work')
  assert.ok(!go.permissions.some((r) => r.effect === 'ask' && !/^(\/opt\/ola\/bin\/)?ola-(search|fetch) \*$/.test(r.resource)), 'go ahead asks nothing but a web search or download')
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

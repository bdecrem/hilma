// Unit tests for the parts of the front desk that need no workspace: the database's own refusals,
// constant-time comparison, rate limits and config. The end-to-end proofs are ../check.mjs.
import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { audit, loadKeys, nameRef, openDb } from '../db.mjs'
import { Limiter, makeInvite, same } from '../auth.mjs'
import { signinLimits } from '../server.mjs'
import { config } from '../server.mjs'

const dir = () => mkdtempSync(path.join(tmpdir(), 'ola-fd-test-'))

test('the database is private and refuses what the schema does not allow', () => {
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  assert.equal(statSync(path.join(d, 'fd/platform.db')).mode & 0o777, 0o600)
  assert.equal(statSync(path.join(d, 'fd')).mode & 0o777, 0o700)
  const add = (handle) => db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES (?, 'X', 'invited', randomblob(32), 0)").run(handle)
  add('alice')
  for (const bad of ['Al', 'ALICE', '1alice', 'a/b', 'alice; drop', 'x'.repeat(17)]) assert.throws(() => add(bad), undefined, bad)
  assert.throws(() => audit(db, { action: 'free text here' }))
  assert.throws(() => db.prepare("INSERT INTO audit (at, actor_kind, action) VALUES (0, 'person', 'whatever the user typed')").run())
  assert.throws(() => db.prepare("INSERT INTO audit (at, actor_kind, action, sha256) VALUES (0, 'person', 'file_uploaded', 'short')").run())
  audit(db, { action: 'file_uploaded', sha256: 'a'.repeat(64), size: 3 })
  // Migrations run once: opening again changes nothing.
  db.close()
  openDb(path.join(d, 'fd')).close()
})

test('an invitation is stored as a hash, never in clear', () => {
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES ('alice', 'A', 'invited', randomblob(32), 0)").run()
  const { raw } = makeInvite(db, 1, 1000)
  const row = db.prepare('SELECT token_hash FROM invitations').get()
  assert.ok(raw.length >= 43 && !Buffer.from(row.token_hash).includes(Buffer.from(raw)))
})

test('a new invitation voids the person\'s earlier unused ones, and only theirs', () => {
  const db = openDb(path.join(dir(), 'fd'))
  for (const h of ['alice', 'bob']) db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES (?, 'A', 'invited', randomblob(32), 0)").run(h)
  makeInvite(db, 1, 60_000)
  makeInvite(db, 2, 60_000)
  const second = makeInvite(db, 1, 60_000, 'device')
  assert.equal(second.voided, 1)
  const open = db.prepare('SELECT person_id, kind FROM invitations WHERE voided_at IS NULL ORDER BY id').all().map((r) => `${r.person_id}:${r.kind}`)
  assert.deepEqual(open, ['2:first', '1:device'])
  assert.throws(() => makeInvite(db, 1, 60_000, 'other'))
})

test('sign-in limits: the global ceiling is at least 30 addresses\' worth', () => {
  for (const [b, m] of [[10, 10], [40, 40], [1, 1], [1000, 1000]]) {
    const l = signinLimits(b, m)
    assert.ok(l.global.perMinute >= 30 * m && l.global.capacity >= 30 * b && l.perCredential.capacity > 0)
  }
})

test('name refs are keyed per workspace and stable', () => {
  const keys = loadKeys(dir())
  assert.deepEqual(nameRef(keys, 1, 'a.csv'), nameRef(keys, 1, 'a.csv'))
  assert.notDeepEqual(nameRef(keys, 1, 'a.csv'), nameRef(keys, 2, 'a.csv'))
  assert.notDeepEqual(nameRef(keys, 1, 'a.csv'), nameRef(loadKeys(dir()), 1, 'a.csv'))
})

test('same() compares any two strings and refuses non-strings', () => {
  assert.ok(same('abc', 'abc'))
  assert.ok(!same('abc', 'abd') && !same('abc', 'abcd') && !same('', 'a') && !same(undefined, 'a') && !same(['a'], 'a'))
})

test('the limiter holds a burst and refills', () => {
  const l = new Limiter({ capacity: 3, perMinute: 60 })
  assert.deepEqual([1, 2, 3, 4].map(() => l.take('k')), [true, true, true, false])
  assert.ok(l.take('other'))
})

test('config refuses a non-loopback bind and a plain-http public origin', () => {
  assert.throws(() => config({ OLA_FD_BIND: '0.0.0.0' }))
  assert.throws(() => config({ OLA_FD_ORIGIN: 'http://app.ola.cx' }))
  assert.throws(() => config({ OLA_FD_ORIGIN: 'https://app.ola.cx/path' }))
  assert.equal(config({ OLA_FD_ORIGIN: 'https://app.ola.cx' }).origin, 'https://app.ola.cx')
  assert.ok(config({}).deleteNotice.includes('14 days'))
})

test('the session cookie: __Host-, Secure, SameSite=Strict on https; a cookie Safari keeps only on http://localhost', async () => {
  const { makeAuth, sessionCookie } = await import('../auth.mjs')
  assert.deepEqual(sessionCookie('https://app.ola.cx'), { name: '__Host-ola', attrs: 'Path=/; HttpOnly; Secure; SameSite=Strict' })
  assert.equal(sessionCookie('https://localhost:4700').name, '__Host-ola')
  assert.deepEqual(sessionCookie('http://localhost:4700'), { name: 'ola-local', attrs: 'Path=/; HttpOnly; SameSite=Strict' })
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  const keys = loadKeys(path.join(d, 'fd'))
  const limits = signinLimits(10, 10)
  const https = makeAuth({ db, keys, origin: 'https://app.ola.cx', session: { absoluteMs: 3600_000, idleMs: 3600_000 }, limits })
  assert.equal(https.cookieName, '__Host-ola')
  assert.equal(https.clearCookie, '__Host-ola=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')
  const local = makeAuth({ db, keys, origin: 'http://localhost:4700', session: { absoluteMs: 3600_000, idleMs: 3600_000 }, limits })
  assert.equal(local.cookieName, 'ola-local')
  assert.ok(!/Secure/.test(local.clearCookie) && /HttpOnly; SameSite=Strict/.test(local.clearCookie))
  db.close()
})

test('the hosted and Claude grants files: off by default, independent, one-time grants only until their moment', async () => {
  const { writeHostedGrants } = await import('../hosted.mjs')
  const { writeGrants } = await import('../claude.mjs')
  const { readFileSync } = await import('node:fs')
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('team-one', 'T', 0)").run()
  const team = db.prepare("SELECT id FROM teams WHERE slug = 'team-one'").get().id
  for (const slug of ['p-one', 'p-two']) db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES (?, 'P', ?, 'active', 0)").run(slug, team)
  const id = (slug) => db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(slug).id
  const hc = { file: path.join(d, 'gateway-hosted'), capMicroUsd: 20_000_000 }
  const cc = { file: path.join(d, 'gateway-claude'), capMicroUsd: 25_000_000, capTokens: 20_000_000 }
  const read = (f) => JSON.parse(readFileSync(f, 'utf8'))
  writeHostedGrants(db, hc)
  writeGrants(db, cc)
  assert.deepEqual([read(hc.file), read(cc.file)], [{}, {}], 'both off by default')
  assert.equal(statSync(hc.file).mode & 0o777, 0o600)
  const row = db.prepare('SELECT hosted_enabled, claude_enabled, stretch, stretch_to FROM workspaces WHERE slug = ?').get('p-one')
  assert.deepEqual({ ...row }, { hosted_enabled: 0, claude_enabled: 0, stretch: 'suggest', stretch_to: 'hosted' })
  db.prepare("UPDATE workspaces SET hosted_enabled = 1 WHERE slug = 'p-one'").run()
  assert.deepEqual(writeHostedGrants(db, hc), { 'ws-p-one': { cap_micro_usd: 20_000_000 } })
  assert.deepEqual(writeGrants(db, cc), {}, 'turning the hosted model on does not turn Claude on')
  // A one-time grant for p-two, both engines: listed with its moment; a past one is not listed.
  const until = Date.now() + 60_000
  db.prepare("INSERT INTO fallback_once (workspace_id, engine, until) VALUES (?, 'hosted', ?), (?, 'claude', ?), (?, 'hosted', ?)").run(id('p-two'), until, id('p-two'), until, id('p-one'), Date.now() - 1)
  assert.deepEqual(writeHostedGrants(db, hc)['ws-p-two'], { cap_micro_usd: 20_000_000, until })
  assert.equal(writeHostedGrants(db, hc)['ws-p-one'].until, undefined, 'a project with the switch on has no moment')
  assert.equal(writeGrants(db, cc)['ws-p-two'].until, until)
  db.prepare("DELETE FROM fallback_once WHERE engine = 'hosted'").run()
  assert.equal(writeHostedGrants(db, hc)['ws-p-two'], undefined, 'the run ended: the grant is gone')
  // A closed project has no grant, on or not.
  db.prepare("UPDATE workspaces SET status = 'closed' WHERE slug = 'p-one'").run()
  assert.deepEqual(writeHostedGrants(db, hc), {})
  for (const action of ['hosted_enabled', 'hosted_disabled', 'hosted_used', 'hosted_once', 'claude_once']) audit(db, { action, workspace: id('p-two'), tokensIn: 1, tokensOut: 2, costMicroUsd: 3 })
  db.close()
})

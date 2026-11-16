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

// Unit tests for the parts of the front desk that need no workspace: the database's own refusals,
// constant-time comparison, rate limits and config. The end-to-end proofs are ../check.mjs.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
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

test('the hosted and Claude grants files: a project is in them only while a run of it goes on (its lease) or a job holds its runner key; independent; leases only until their moment', async () => {
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
  // Review 5 follow-up: the switch alone grants nothing (before, it gave the whole VM a standing grant).
  db.prepare("UPDATE workspaces SET hosted_enabled = 1, claude_enabled = 1 WHERE slug = 'p-one'").run()
  assert.deepEqual([writeHostedGrants(db, hc), writeGrants(db, cc)], [{}, {}], 'a switch on with no run going on grants nothing')
  db.prepare("UPDATE workspaces SET claude_enabled = 0 WHERE slug = 'p-one'").run()
  // A run's lease for p-two, both engines: listed with its moment; a past one is not listed.
  const until = Date.now() + 60_000
  db.prepare("INSERT INTO fallback_once (workspace_id, engine, until) VALUES (?, 'hosted', ?), (?, 'claude', ?), (?, 'hosted', ?)").run(id('p-two'), until, id('p-two'), until, id('p-one'), Date.now() - 1)
  assert.deepEqual(writeHostedGrants(db, hc)['ws-p-two'], { cap_micro_usd: 20_000_000, until })
  assert.equal(writeHostedGrants(db, hc)['ws-p-one'], undefined, 'a lease past its moment')
  assert.equal(writeGrants(db, cc)['ws-p-two'].until, until)
  assert.equal(writeGrants(db, cc)['ws-p-one'], undefined, 'turning the hosted model on does not turn Claude on')
  // A hosted job running in p-one: its grant carries the runner's key, and only with the switch on.
  const k = 'a'.repeat(64)
  db.prepare("INSERT INTO batch_jobs (workspace_id, job, state, model, budget, created_at, updated_at, runner_key_sha256) VALUES (?, 'aaaaaaaaaaaa', 'running', 'hosted', 100, 0, 0, ?)").run(id('p-one'), k)
  assert.deepEqual(writeHostedGrants(db, hc)['ws-p-one'], { cap_micro_usd: 20_000_000, key_sha256: k })
  db.prepare("UPDATE workspaces SET hosted_enabled = 0 WHERE slug = 'p-one'").run()
  assert.equal(writeHostedGrants(db, hc)['ws-p-one'], undefined, 'a job grant with the switch off')
  db.prepare("UPDATE workspaces SET hosted_enabled = 1 WHERE slug = 'p-one'").run()
  db.prepare("DELETE FROM fallback_once WHERE engine = 'hosted'").run()
  assert.equal(writeHostedGrants(db, hc)['ws-p-two'], undefined, 'the run ended: the grant is gone')
  // A closed project has no grant, on or not.
  db.prepare("UPDATE workspaces SET status = 'closed' WHERE slug = 'p-one'").run()
  assert.deepEqual(writeHostedGrants(db, hc), {})
  for (const action of ['hosted_enabled', 'hosted_disabled', 'hosted_used', 'hosted_once', 'claude_once']) audit(db, { action, workspace: id('p-two'), tokensIn: 1, tokensOut: 2, costMicroUsd: 3 })
  db.close()
})

test('the hosted grants file: a person’s own Macs only when the admin let them, while active with a computer signed in, at their own ceiling; standing callers from the env', async () => {
  const { writeHostedGrants, hostedConfig } = await import('../hosted.mjs')
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  for (const h of ['ann', 'ben']) db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at) VALUES (?, 'X', 'active', randomblob(32), 0)").run(h)
  const pid = (h) => db.prepare('SELECT id FROM people WHERE handle = ?').get(h).id
  const device = (h, revoked = null, expires = Date.now() + 86_400_000) => db.prepare("INSERT INTO devices (person_id, name, kind, token_sha256, created_at, expires_at, revoked_at) VALUES (?, 'Made-up Mac', 'mac', randomblob(32), 0, ?, ?)").run(pid(h), expires, revoked)
  const hc = { ...hostedConfig({ OLA_HOME: d }), file: path.join(d, 'gateway-hosted') }
  device('ann')
  assert.deepEqual(writeHostedGrants(db, hc), {}, 'nobody is let in by default')
  db.prepare("UPDATE people SET app_hosted = 1 WHERE handle IN ('ann', 'ben')").run()
  assert.deepEqual(writeHostedGrants(db, hc), { [`p-${pid('ann')}`]: { cap_micro_usd: 20_000_000 } }, 'ben has no computer signed in')
  device('ben', Date.now())
  device('ben', null, Date.now() - 1)
  assert.equal(writeHostedGrants(db, hc)[`p-${pid('ben')}`], undefined, 'a revoked or expired computer does not count')
  db.prepare("UPDATE people SET app_hosted_cap_micro_usd = 5000000 WHERE handle = 'ann'").run()
  assert.deepEqual(writeHostedGrants(db, hc)[`p-${pid('ann')}`], { cap_micro_usd: 5_000_000 })
  db.prepare("UPDATE people SET status = 'suspended' WHERE handle = 'ann'").run()
  assert.deepEqual(writeHostedGrants(db, hc), {}, 'a suspended person')
  const standing = { ...hostedConfig({ OLA_HOME: d, OLA_FD_HOSTED_CALLERS: 'bart' }), file: hc.file }
  assert.deepEqual(writeHostedGrants(db, standing), { bart: { cap_micro_usd: 20_000_000 } })
  for (const bad of ['ws-one', 'p-1', 'usage', 'a b']) assert.throws(() => hostedConfig({ OLA_HOME: d, OLA_FD_HOSTED_CALLERS: bad }), /OLA_FD_HOSTED_CALLERS/)
  db.close()
})

test('a job the agent set going before anyone said yes is still a proposal (first-user pass)', async () => {
  const { unapproved } = await import('../jobs.mjs')
  const vmSays = { id: 'a', state: 'paused', note: 'Paused: No job is approved to run for this project now.', progress: { done: 0 } }
  assert.deepEqual(unapproved(vmSays, undefined), { ...vmSays, state: 'proposed', note: null })
  // approved by a person, or with work done: as the VM says
  assert.equal(unapproved(vmSays, { state: 'paused' }).state, 'paused')
  assert.equal(unapproved({ ...vmSays, progress: { done: 3 } }, undefined).state, 'paused')
  assert.equal(unapproved(null, undefined), null)
})

// OLA-232: a request asking Claude to do something gets the fact of whether Claude can take it in
// this project (the checker was told to type /claude, and /claude was then refused).
test('a request that asks for Claude gets whether Claude can take it here', async () => {
  const { NAMES_CLAUDE, claudeNote } = await import('../claude.mjs')
  for (const t of ['have claude code do this one: write a file called hello.txt', 'can you have Claude do this one', 'ask claude to fix it', 'Claude, please do this'])
    assert.ok(NAMES_CLAUDE.test(t), t)
  for (const t of ['pls confirm whether that was built by claude code or our hosted open models', 'was index.html made by Claude?', 'who is claude'])
    assert.ok(!NAMES_CLAUDE.test(t), t)
  const off = claudeNote({ configured: false, enabled: false, unavailable: 'Claude is not set up for this project yet: there is no Anthropic account for it to use. Ola’s team can set it up.' })
  assert.match(off, /no Anthropic account/)
  assert.match(off, /never tell them to type \/claude/)
  assert.match(claudeNote({ configured: true, enabled: true }), /is on in this project: tell them to type \/claude/)
  assert.match(claudeNote({ configured: true, enabled: false }), /is off in this project\. The project’s owner can type \/claude/)
  assert.equal(claudeNote(null), '')
  assert.ok(!/[<>]/.test(off), 'the fact carries no marks of its own')
})

test('check accounts (OLA-323): askcases and appdriver get the check week in the quotas file; an admin-set number wins; bart, other people, an admin or an inactive check handle never get it', async () => {
  const { syncPeopleFile, quotasFileOf } = await import('../devices.mjs')
  const { CHECK_WEEKLY_TOKENS, checkPersonWeekly } = await import('../../gateway/check-accounts.mjs')
  const d = dir()
  const db = openDb(path.join(d, 'fd'))
  const add = (handle, { admin = 0, own = null } = {}) => {
    const id = Number(db.prepare("INSERT INTO people (handle, display_name, status, webauthn_user_id, created_at, is_admin, app_weekly_tokens) VALUES (?, 'X', 'active', randomblob(32), 0, ?, ?)").run(handle, admin, own).lastInsertRowid)
    db.prepare("INSERT INTO devices (person_id, name, kind, token_sha256, created_at, expires_at) VALUES (?, 'Mac', 'mac', randomblob(32), 0, ?)").run(id, Date.now() + 3600_000)
    return id
  }
  const bart = add('bart', { admin: 1, own: 200_000_000 })
  const asks = add('askcases')
  const drive = add('appdriver', { own: 7 })
  add('carol')
  const file = path.join(d, 'gateway-people')
  syncPeopleFile(db, file)
  assert.equal(readFileSync(quotasFileOf(file), 'utf8'), `GATEWAY_QUOTAS=p-${bart}=200000000,p-${asks}=${CHECK_WEEKLY_TOKENS},p-${drive}=7\n`)
  db.prepare('UPDATE people SET app_weekly_tokens = NULL WHERE id = ?').run(drive)
  syncPeopleFile(db, file)
  assert.equal(readFileSync(quotasFileOf(file), 'utf8'), `GATEWAY_QUOTAS=p-${bart}=200000000,p-${asks}=${CHECK_WEEKLY_TOKENS},p-${drive}=${CHECK_WEEKLY_TOKENS}\n`)
  assert.equal(checkPersonWeekly({ handle: 'askcases', status: 'active', is_admin: 1 }), null, 'an admin: never')
  assert.equal(checkPersonWeekly({ handle: 'askcases', status: 'suspended', is_admin: 0 }), null, 'not active: never')
  assert.equal(checkPersonWeekly({ handle: 'bart', status: 'active', is_admin: 0 }), null)
  assert.equal(checkPersonWeekly({ handle: 'askcases2', status: 'active', is_admin: 0 }), null)
})

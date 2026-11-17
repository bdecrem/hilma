// The person's answer to a web question, turned into the gateway's grant (frontdesk/web.mjs),
// with the gateway's own hash (gateway/web.mjs), so a "once" lets through exactly what was shown.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from '../db.mjs'
import { makeWeb } from '../web.mjs'
import { itemHash, searchItem, fetchItem } from '../../gateway/web.mjs'

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ola-web-test-'))
  const db = openDb(path.join(dir, 'data'))
  const now = Date.now()
  db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES ('alice', 'Alice A.', 'active', 0, ?, ?)").run(randomBytes(32), now)
  db.prepare("INSERT INTO teams (slug, name, created_at) VALUES ('team-a', 'Team A', ?)").run(now)
  db.prepare("INSERT INTO workspaces (slug, name, team_id, status, created_at) VALUES ('proj-a', 'Project A', 1, 'active', ?)").run(now)
  const file = path.join(dir, 'gateway-web')
  const web = makeWeb({ db, file, providerName: 'Brave Search' })
  const ws = { id: 1, slug: 'proj-a' }
  const asking = (action, resources) => async (m) => (m === 'GET' ? { status: 200, json: { data: [{ id: 'per_1', action, resources }] } } : { status: 204 })
  return { db, web, ws, file, read: () => JSON.parse(readFileSync(file, 'utf8')), asking }
}

test('Allow once: a grant for that exact search, bound by the gateway’s own hash; nothing kept for the project', async () => {
  const { web, ws, read, asking, db } = setup()
  const d = await web.onReply(ws, 1, 'ses_1', 'per_1', 'once', asking('shell', ['ola-search "coastal   adaptation" Kenya']))
  assert.equal(d, 'once')
  const g = read()['ws-proj-a']
  assert.equal(g.always, undefined)
  assert.equal(g.once.length, 1)
  assert.equal(g.once[0].h, itemHash('search', searchItem('coastal adaptation Kenya')))
  assert.ok(!JSON.stringify(read()).includes('coastal'), 'the words are in the file')
  assert.equal(web.modeBySlug('proj-a'), 'ask')
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit WHERE action LIKE 'web_%'").get().n, 0)
  const f = await web.onReply(ws, 1, 'ses_1', 'per_1', 'once', asking('shell', ['ola-fetch https://Example.org/a.pdf']))
  assert.equal(f, 'once')
  assert.equal(read()['ws-proj-a'].once.at(-1).h, itemHash('fetch', fetchItem('https://example.org/a.pdf')))
  // A paper lookup: its own kind, bound to the reference as the gateway normalizes it.
  const l = await web.onReply(ws, 1, 'ses_1', 'per_1', 'once', asking('shell', ['ola-lookup "Lindqvist A (2031)  Boilers and tenants"']))
  assert.equal(l, 'once')
  const last = read()['ws-proj-a'].once.at(-1)
  assert.equal(last.kind, 'lookup')
  assert.equal(last.h, itemHash('lookup', searchItem('Lindqvist A (2031) Boilers and tenants')))
  assert.ok(!JSON.stringify(read()).includes('Boilers'), 'the reference is not in the file')
})

test('Always in this project: kept and audited, passed to opencode as once, shown in Settings, revoked there', async () => {
  const { web, ws, read, asking, db, file } = setup()
  assert.equal(await web.onReply(ws, 1, 'ses_1', 'per_1', 'always', asking('shell', ['ola-search "x"'])), 'once')
  assert.deepEqual(read()['ws-proj-a'], { always: true })
  assert.equal(web.modeBySlug('proj-a'), 'always')
  assert.equal(web.settings(ws).changedBy, 'Alice A.')
  assert.equal((statSync(file).mode & 0o777).toString(8), '600')
  web.setAlways(ws, 1, false)
  assert.equal(read()['ws-proj-a'], undefined)
  assert.deepEqual(db.prepare("SELECT action FROM audit WHERE action LIKE 'web_%' ORDER BY id").all().map((r) => r.action), ['web_allowed', 'web_revoked'])
})

test('Not now, other questions and commands that are not simple write nothing', async () => {
  const { web, ws, read, asking } = setup()
  assert.equal(await web.onReply(ws, 1, 's', 'per_1', 'reject', asking('shell', ['ola-search x'])), 'reject')
  assert.equal(await web.onReply(ws, 1, 's', 'per_1', 'always', asking('shell', ['python3 x.py'])), 'always', 'another command keeps its own answer')
  assert.equal(await web.onReply(ws, 1, 's', 'per_1', 'once', asking('shell', ['ola-search "$(cat notes.csv)"'])), 'once')
  assert.deepEqual(read(), {})
  assert.equal(await web.onReply(ws, 1, 's', 'per_9', 'once', asking('shell', ['ola-search x'])), 'once', 'an unknown request id')
  assert.deepEqual(read(), {})
})

// Review 4, M1: the page shows ONE web question (the first resource's words in its title, or the
// "run code" sheet when the request mixes a web command with another), so a grant may only follow
// a request that is exactly one web command. Before the fix, a second search hidden behind the
// first got its own once-grant, and "Yes, for the rest of this conversation" on a "run code" sheet
// that also held an ola-search turned on "Always in this project" for the web.
test('a request with two searches: Allow once grants neither (the page showed only the first)', async () => {
  const { web, ws, read, asking } = setup()
  await web.onReply(ws, 1, 's', 'per_1', 'once', asking('shell', ['ola-search "made-up harmless words"', 'ola-search "made-up hidden words"']))
  assert.deepEqual(read(), {}, JSON.stringify(read()))
})
test('a "run code" question that also holds a search: no web grant of any kind from its answers', async () => {
  const { web, ws, read, asking, db } = setup()
  assert.equal(await web.onReply(ws, 1, 's', 'per_1', 'always', asking('shell', ['python3 count.py', 'ola-search "made-up hidden words"'])), 'always', 'its own answer goes on (the front desk scopes it to the conversation)')
  assert.deepEqual(read(), {}, JSON.stringify(read()))
  assert.equal(web.modeBySlug('proj-a'), 'ask')
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'web_allowed'").get().n, 0)
  await web.onReply(ws, 1, 's', 'per_1', 'once', asking('shell', ['python3 count.py', 'ola-search "made-up hidden words"']))
  assert.deepEqual(read(), {}, JSON.stringify(read()))
})

// "Open" grants without a VM (OLA-96): node --test frontdesk/test/views.test.mjs. The grant is in the
// path (/v/<grant>/<file>), so a link that leaks (a hostile page's WebRTC or DNS, a copied address)
// used to read every file in the page's folder from anywhere for up to 8 hours. A grant now answers
// only the address that opened it, plus an address that brings the opener's own session cookie;
// and it ends after 2 hours. The end-to-end proofs with a real VM and browsers are ../check.mjs.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { loadKeys } from '../db.mjs'
import { makeViews } from '../views.mjs'

const ORIGIN = 'https://app.example'
const SESS = { id: 'sess-alice', personId: 7 }
const WS = { slug: 'hello', id: 3, status: 'active' }
const FILES = { 'site/index.html': '<!doctype html><p>made up</p>', 'site/data.json': '{"n":42}' }

function setup() {
  const db = { prepare: () => ({ run() {} }) } // audit rows are not what is tested here
  const views = makeViews({
    cfg: { origin: ORIGIN },
    db,
    keys: loadKeys(mkdtempSync(path.join(tmpdir(), 'ola-views-test-'))),
    auth: { stillValid: (s) => s.id === SESS.id },
    membership: (personId, slug) => (personId === SESS.personId && slug === WS.slug ? WS : null),
    workspaces: {
      validRel: (rel) => typeof rel === 'string' && rel.length > 0 && !rel.includes('..'),
      ensureRunning: async () => {},
      holdBusy: () => () => {},
      getStream: async (_slug, rel) => (rel in FILES ? { size: Buffer.byteLength(FILES[rel]), stream: Readable.from([Buffer.from(FILES[rel])]), kill() {} } : null),
    },
    // What the server passes: the client's address key, and the session its cookie names.
    clientOf: (req) => req.client,
    sessionIdOf: (req) => (req.cookie === 'alice' ? SESS.id : null),
  })
  return views
}

/** A response that records what was sent. */
function res() {
  const r = { status: 0, headers: {}, body: '', destroyed: false, listeners: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.removeHeader = (k) => delete r.headers[k.toLowerCase()]
  r.writeHead = (s, h = {}) => ((r.status = s), Object.entries(h).forEach(([k, v]) => r.setHeader(k, v)), r)
  r.write = (c) => ((r.body += c), true)
  r.end = (c) => (c && (r.body += c), (r.ended = true))
  r.on = (ev, f) => ((r.listeners[ev] ??= []).push(f), r)
  r.once = r.on
  r.destroy = () => (r.destroyed = true)
  return r
}
const req = (client, { cookie = null, dest = 'iframe' } = {}) => ({ client, cookie, method: 'GET', headers: { 'sec-fetch-dest': dest } })

async function openPage(views, client) {
  const r = res()
  await views.open(req(client, { cookie: 'alice', dest: 'document' }), r, SESS, new URL(`${ORIGIN}/api/open?w=${WS.slug}&path=site/index.html`))
  assert.equal(r.status, 200, r.body)
  const grant = /\/v\/([A-Za-z0-9_-]{43})\//.exec(r.body)?.[1]
  assert.ok(grant, 'the wrapper names a grant')
  return grant
}
async function get(views, grant, file, client, opts) {
  const r = res()
  await views.serve(req(client, opts), r, `/v/${grant}/${file}`)
  return r
}

test('a grant answers the address that opened it, and no other (a leaked link from elsewhere gets a 404)', async () => {
  const views = setup()
  const g = await openPage(views, '198.51.100.4')
  assert.equal((await get(views, g, 'site/index.html', '198.51.100.4')).status, 200)
  const leaked = await get(views, g, 'site/data.json', '203.0.113.9', { dest: 'empty' })
  assert.equal(leaked.status, 404, 'another address, no cookie')
  assert.match(leaked.body, /no longer open/, 'the same answer as a grant that does not exist')
  // The refused request neither ended the grant nor taught it the address.
  assert.equal((await get(views, g, 'site/data.json', '198.51.100.4', { dest: 'empty' })).status, 200)
  assert.equal((await get(views, g, 'site/data.json', '203.0.113.9', { dest: 'empty' })).status, 404)
  // Another address bringing someone else's cookie (or a made-up one) is refused too.
  assert.equal((await get(views, g, 'site/index.html', '203.0.113.9', { cookie: 'mallory' })).status, 404)
})

test('the opener reaching us from a second address (IPv4 and IPv6 at once) keeps working once its cookie came from there', async () => {
  const views = setup()
  const g = await openPage(views, '198.51.100.4')
  // The frame's document is a same-origin load, so it carries the person's Strict cookie.
  assert.equal((await get(views, g, 'site/index.html', '2001:db8:1:2::/64', { cookie: 'alice' })).status, 200)
  // The page's own loads (opaque origin, no cookie) from that address now pass.
  assert.equal((await get(views, g, 'site/data.json', '2001:db8:1:2::/64', { dest: 'empty' })).status, 200)
  // A third address without the cookie still does not.
  assert.equal((await get(views, g, 'site/data.json', '203.0.113.9', { dest: 'empty' })).status, 404)
})

test('a grant ends after 2 hours in all, even while it is used', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-19T10:00:00Z') })
  const views = setup()
  const g = await openPage(views, '198.51.100.4')
  for (let m = 25; m < 120; m += 25) {
    t.mock.timers.tick(25 * 60_000)
    assert.equal((await get(views, g, 'site/data.json', '198.51.100.4', { dest: 'empty' })).status, 200, `${m} minutes in`)
  }
  t.mock.timers.tick(25 * 60_000) // 125 minutes since it was opened
  assert.equal((await get(views, g, 'site/data.json', '198.51.100.4', { dest: 'empty' })).status, 404)
})

test('makeViews refuses to start without the address of a request', () => {
  assert.throws(() => makeViews({ cfg: { origin: ORIGIN } }), /clientOf and sessionIdOf are required/)
})

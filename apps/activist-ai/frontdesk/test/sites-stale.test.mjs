// OLA-267: the fourth page in one project. Pages saying Oak and Cedar were published from site/ (a
// copy made by the publish skill's prepare); a new conversation changed index.html to Bart and
// published site/ as it was: the address showed Cedar, and Ola said "it's live". A publish from the
// conversation now refuses an old copy, and its outcome carries what the address shows.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { folderCtx, makeSites, sitesConfig, wordsOf } from '../sites.mjs'
import { startFakeVercel } from '../../web/server/fake-vercel.mjs'

const tmp = () => fs.mkdtempSync(path.join(tmpdir(), 'ola-stale-'))
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
  const cfg = sitesConfig({ OLA_FD_SITES_ORIGIN: v.origin, OLA_FD_SITES_API: v.api, OLA_FD_SITES_FILE: path.join(d, 'sites.env'), OLA_FD_SITES_VERIFY_MS: '3000', OLA_FD_SITES_SETTLE_MS: '120', OLA_FD_SITES_POLL_MS: '50' })
  return { v, sites: makeSites({ cfg, dataDir: path.join(d, 'fd') }) }
}
const sha = (t) => createHash('sha256').update(t).digest('hex')

test('an old copy of the page is never published from the conversation; the outcome says what the address shows', async () => {
  const { v, sites } = await setup()
  const root = project({})
  const prepare = (word) => {
    // What publish.py prepare leaves: the copy, and the record of what it was made from.
    const page = `<!doctype html><title>${word}</title><h1>${word}</h1>`
    fs.writeFileSync(path.join(root, 'index.html'), page)
    fs.mkdirSync(path.join(root, 'site'), { recursive: true })
    fs.writeFileSync(path.join(root, 'site/index.html'), page)
    fs.writeFileSync(path.join(root, 'site/.ola-source.json'), JSON.stringify({ page: 'index.html', sources: { 'index.html': sha(page) } }))
  }
  const ctx = folderCtx('words-test', root)
  const publish = async (opts) => {
    const pre = await sites.preview(ctx, { folder: 'site' }, opts)
    if (pre.status !== 200) return pre
    return sites.publish(ctx, { folder: 'site' }, pre.body.fingerprint, opts)
  }
  for (const word of ['Oak', 'Cedar']) {
    prepare(word)
    const r = await publish({ fresh: true })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(r.body.live, true)
    assert.match(r.body.shows, new RegExp(word))
    assert.ok(!r.plan.items.some((i) => i.as.startsWith('.')), 'the record is never published')
  }
  // The page changes; the copy does not.
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Bart</title><h1>Bart</h1>')
  const stale = await publish({ fresh: true })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.error, 'stale')
  assert.match(stale.body.message, /old copy[\s\S]*prepare index\.html --out site/)
  assert.match(await (await fetch(`${v.origin}/words-test/`)).text(), /Cedar/, 'nothing changed at the address')
  // The cause, kept as a fact: without the check the old copy goes out, and the address "is live" with Cedar.
  const before = await publish({})
  assert.equal(before.body.live, true)
  assert.match(before.body.shows, /Cedar/)
  // Made again from the page: published, and the outcome is what the address shows.
  prepare('Bart')
  const ok = await publish({ fresh: true })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.live, true)
  assert.match(ok.body.shows, /Bart/)
  assert.match(await (await fetch(`${v.origin}/words-test/`)).text(), /Bart/)
  v.close()
})

test('no record: a page outside the folder newer than it means the folder may be an earlier page', async () => {
  const { v, sites } = await setup()
  const root = project({ 'site/index.html': '<h1>Cedar</h1>' })
  const t = Date.now() / 1000
  fs.utimesSync(path.join(root, 'site/index.html'), t - 60, t - 60)
  fs.mkdirSync(path.join(root, 'maple'))
  fs.writeFileSync(path.join(root, 'maple/index.html'), '<h1>Maple</h1>')
  const ctx = folderCtx('nrec-test', root)
  const r = await sites.preview(ctx, { folder: 'site' }, { fresh: true })
  assert.equal(r.status, 409)
  assert.match(r.body.message, /maple\/index\.html changed after site\//)
  // The Publish button (no fresh) and a page published by itself are not affected.
  assert.equal((await sites.preview(ctx, { folder: 'site' })).status, 200)
  assert.equal((await sites.preview(ctx, { page: 'maple/index.html' }, { fresh: true })).status, 200)
  v.close()
})

test('what a page says: its title and first heading, in a few words', () => {
  assert.equal(wordsOf(Buffer.from('<html><head><title>Bart</title></head><body><h1>Bart <em>was</em> here</h1><p>x</p></body>')), 'Bart · Bart was here')
  assert.equal(wordsOf('<body><p>Just  text</p></body>'), 'Just text')
})

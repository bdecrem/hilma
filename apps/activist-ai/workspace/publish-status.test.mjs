// node --test workspace/publish-status.test.mjs
// `ola-publish status` (OLA-421): an outcome the command already showed, or one older than 15 minutes, is
// printed as a record of the past, never as what the address shows now. On Nov 23 (release 5a3a4555734f,
// the request test share-link in a cloud project) Ola ran `ola-publish status`, read "Checked: the address
// answers with exactly the page just published; it shows: Bart" from a publish made in an earlier
// conversation, and told the person https://sites.ola.cx/askcases/ was "currently live and shows Bart":
// the pages had been taken down since (404) and the page asked about said Garden Club.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CMD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ola-publish')

function status(result) {
  const dir = mkdtempSync(path.join(tmpdir(), 'olapub-'))
  try {
    if (result) writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result))
    const r = spawnSync('python3', ['-I', CMD, 'status'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', OLA_PUBLISH_DIR: dir, OLA_PUBLISH_WAIT: '1' } })
    let after = null
    try { after = JSON.parse(readFileSync(path.join(dir, 'result.json'), 'utf8')) } catch {}
    return { code: r.status, out: r.stdout + r.stderr, after }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const now = () => Date.now() / 1000
const live = { state: 'done', url: 'https://sites.ola.cx/askcases/', count: 1, live: true, shows: 'Bart', target: 'site', files: ['index.html'] }

test('an outcome already shown is a record: never "live", never "tell the person it is live"', () => {
  const r = status({ ...live, used: true, written: now() - 60 })
  assert.equal(r.code, 5)
  assert.match(r.out, /^Record only: the last publish from this project's conversation, at \d{4}-\d\d-\d\d \d\d:\d\d UTC, said https:\/\/sites\.ola\.cx\/askcases\/ was published, showing “Bart”\./)
  assert.match(r.out, /not a look at the address now/)
  assert.match(r.out, /Never tell the person a page is live/)
  assert.match(r.out, /publish the page they mean now/)
  assert.doesNotMatch(r.out, /Checked: the address answers|Tell the person it is live/)
})

test('an outcome older than 15 minutes is a record, even if it was never shown', () => {
  const r = status({ ...live, written: now() - 16 * 60 })
  assert.equal(r.code, 5)
  assert.doesNotMatch(r.out, /Tell the person it is live/)
})

test('a publish that was still going, now done and not yet shown: told once as the outcome, then a record', () => {
  const r = status({ ...live, written: now() - 30 })
  assert.equal(r.code, 0)
  assert.match(r.out, /^Published: https:\/\/sites\.ola\.cx\/askcases\/ \(1 file\(s\)\)\./)
  assert.match(r.out, /Tell the person it is live/)
  assert.equal(r.after.used, true, 'marked as shown')
  const again = status(r.after)
  assert.equal(again.code, 5)
})

test('still being published, a take-down record, and nothing at all', () => {
  assert.equal(status({ state: 'publishing', written: now() - 10, target: 'site', files: ['index.html'] }).code, 3)
  const down = status({ state: 'done', unpublished: true, url: 'https://sites.ola.cx/askcases/', live: true, used: true, written: now() - 100 })
  assert.equal(down.code, 5)
  assert.match(down.out, /the pages at https:\/\/sites\.ola\.cx\/askcases\/ were taken down/)
  const none = status(null)
  assert.equal(none.code, 1)
  assert.match(none.out, /Nothing has been published/)
  assert.match(none.out, /publish that page/)
})

// OLA-285: on Nov 20 (the OLA-230 checker, M4 iMac WebKit) ola-publish stopped waiting after 110 s while
// the front desk was still checking the address of a git deploy (up to 5 minutes), printed "still being
// published", and Ola told the person "the publish itself confirmed it answers with the new page".
function run(args, { result, later, wait = '2' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'olapub-'))
  if (result) writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result))
  return new Promise((resolve) => {
    const c = spawn('python3', ['-I', CMD, ...args], { env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', OLA_PUBLISH_DIR: dir, OLA_PUBLISH_WAIT: wait } })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (out += d))
    if (later) setTimeout(() => writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ ...later, written: now() })), 1200)
    const t0 = Date.now()
    c.on('close', (code) => { rmSync(dir, { recursive: true, force: true }); resolve({ code, out, ms: Date.now() - t0 }) })
  })
}
const mine = { target: 'site', files: ['index.html'] }

test('the command stops waiting while the address is being checked: NOT CHECKED YET, the last look said as not the result, never live', async () => {
  const r = await run(['site', '--files', 'index.html'], { result: { ...mine, state: 'publishing', stage: 'checking', url: 'https://sites.ola.cx/askcases/', status: '200', shows: 'Cedar Street', challenged: false, until: now() + 180, written: now() } })
  assert.equal(r.code, 3)
  assert.match(r.out, /^NOT CHECKED YET: the page was sent to https:\/\/sites\.ola\.cx\/askcases\/, and Ola's server is still checking/)
  assert.match(r.out, /for up to 3 more minute\(s\)/)
  assert.match(r.out, /The last look at the address: it answered 200 and showed “Cedar Street”\. That is not the result of the check\./)
  assert.match(r.out, /Do not tell the person it is live, that it answers with the new page/)
  assert.match(r.out, /Run `ola-publish status` now/)
  assert.doesNotMatch(r.out, /Tell the person it is live|Checked: the address answers/)
})

test('still sending (no look at the address yet): NOT PUBLISHED YET, never live', async () => {
  const r = await run(['site', '--files', 'index.html'], { result: { ...mine, state: 'publishing', written: now() } })
  assert.equal(r.code, 3)
  assert.match(r.out, /^NOT PUBLISHED YET: Ola's server is still sending the page\. Do not tell the person it is live/)
})

test('the bot check answered the last look: said as that, not as what the page shows', async () => {
  const r = await run(['status'], { result: { ...mine, state: 'publishing', stage: 'checking', url: 'https://sites.ola.cx/askcases/', status: '403', shows: '', challenged: true, until: now() + 60, written: now() }, wait: '1' })
  assert.equal(r.code, 3)
  assert.match(r.out, /the host answered with its bot check instead of the page/)
})

test('`ola-publish status` while the check runs waits for the outcome and prints it (one status covers the rest of the check)', async () => {
  const r = await run(['status'], { result: { ...mine, state: 'publishing', stage: 'checking', url: 'https://sites.ola.cx/askcases/', status: '200', shows: 'Old', until: now() + 60, written: now() }, later: { ...live }, wait: '10' })
  assert.equal(r.code, 0)
  assert.ok(r.ms >= 1000 && r.ms < 9000, `waited ${r.ms} ms`)
  assert.match(r.out, /^Published: https:\/\/sites\.ola\.cx\/askcases\/ \(1 file\(s\)\)\.\nChecked: the address answers with exactly the page just published; it shows: “Bart”\./)
})

test('`ola-publish status` whose check ends not showing the page: NOT LIVE YET (exit 4), never live', async () => {
  const r = await run(['status'], { result: { ...mine, state: 'publishing', stage: 'checking', url: 'https://sites.ola.cx/askcases/', status: '200', shows: 'Old', until: now() + 60, written: now() }, later: { ...live, live: false, shows: 'Old' }, wait: '10' })
  assert.equal(r.code, 4)
  assert.match(r.out, /NOT LIVE YET: the address does not show the page just published; it still shows: “Old”/)
})

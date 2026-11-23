// node --test workspace/publish-status.test.mjs
// `ola-publish status` (OLA-421): an outcome the command already showed, or one older than 15 minutes, is
// printed as a record of the past, never as what the address shows now. On Nov 23 (release 5a3a4555734f,
// the request test share-link in a cloud project) Ola ran `ola-publish status`, read "Checked: the address
// answers with exactly the page just published; it shows: Bart" from a publish made in an earlier
// conversation, and told the person https://sites.ola.cx/askcases/ was "currently live and shows Bart":
// the pages had been taken down since (404) and the page asked about said Garden Club.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CMD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ola-publish')

function status(result) {
  const dir = mkdtempSync(path.join(tmpdir(), 'olapub-'))
  try {
    if (result) writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result))
    const r = spawnSync('python3', ['-I', CMD, 'status'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', OLA_PUBLISH_DIR: dir } })
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

// Bart's kept requests as worked examples (OLA-181, frontdesk/examples.mjs) without a workspace: only the
// examples person's turns, only turns that ended well (done, something written then tried on the page, no
// switch after, a request to make something), the file the plugin reads, emptied when the turns are
// deleted, and the plugin choosing a kept example from that file. Run: node --test frontdesk/test/examples.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDb } from '../db.mjs'
import { exampleOf, examplesFrom, writeExamples } from '../examples.mjs'
import { onContext, reset, NOTE_HEAD } from '../../workspace/plugins/ola-examples/index.js'

const dir = () => mkdtempSync(path.join(tmpdir(), 'ola-ex-test-'))
const S = (tool, words, status = 'done') => ({ tool, words, status })
const GOOD = [S('shell', 'Arranged files'), S('write', 'Wrote index.html'), S('shell', 'Ran ola-page'), S('edit', 'Changed index.html'), S('shell', 'Ran ola-page'), S('shell', 'Ran look.py')]

function setup() {
  const db = openDb(dir())
  const person = (h) => Number(db.prepare("INSERT INTO people (handle, display_name, status, is_admin, webauthn_user_id, created_at) VALUES (?, ?, 'active', 0, randomblob(32), 0)").run(h, h).lastInsertRowid)
  const ids = { bart: person('bart'), olive: person('olive') }
  let n = 0
  const keep = (who, request, steps, more = {}) => db.prepare(
    `INSERT INTO kept_turns (person_id, at, received_at, product, runtime, session, turn, engine, status, request, answer, steps, switched_from)
     VALUES (?, ?, 0, 'mac', 'local', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ids[who], more.at ?? ++n * 1000, more.session ?? `s${n}`, `t${n}`, more.engine ?? 'ola', more.status ?? 'done', request, more.answer ?? 'Built it and opened it: the page shows the words.', JSON.stringify(steps), more.switched_from ?? null)
  return { db, ids, keep }
}

test('a turn that ended well becomes an example: its request, what was written, what was tried after the last change', () => {
  const ex = exampleOf({ id: 7, status: 'done', request: 'build me a page that simply says Hi Bart', answer: 'Done.  It shows\n"Hi Bart".', steps: JSON.stringify(GOOD) })
  assert.deepEqual(ex, { id: 'kept-7', source: 'kept', request: 'build me a page that simply says Hi Bart', built: ['Wrote index.html', 'Changed index.html'], tried: ['Ran ola-page', 'Ran look.py'], answer: 'Done. It shows "Hi Bart".' })
})

test('turns that did not end well, or are not a request to make something, are not examples', () => {
  const steps = JSON.stringify(GOOD)
  const row = { id: 1, status: 'done', request: 'build me a page that says hello', answer: '', steps }
  assert.ok(exampleOf(row))
  assert.equal(exampleOf({ ...row, status: 'failed' }), null, 'failed')
  assert.equal(exampleOf({ ...row, status: 'stopped' }), null, 'stopped')
  assert.equal(exampleOf(row, { switchedLater: true }), null, 'a switch to another engine came after')
  assert.equal(exampleOf({ ...row, request: 'Publish this page to sites.ola.cx' }), null, 'not a request to make something')
  assert.equal(exampleOf({ ...row, request: 'Hi' }), null, 'a greeting')
  assert.equal(exampleOf({ ...row, steps: JSON.stringify([S('write', 'Wrote index.html')]) }), null, 'written, never tried')
  assert.equal(exampleOf({ ...row, steps: JSON.stringify([S('shell', 'Ran ola-page'), S('write', 'Wrote index.html')]) }), null, 'tried only before the last change')
  assert.equal(exampleOf({ ...row, steps: JSON.stringify([S('write', 'Wrote index.html', 'failed'), S('shell', 'Ran ola-page')]) }), null, 'the only write failed')
  assert.equal(exampleOf({ ...row, steps: '[]' }), null, 'no steps')
  assert.equal(exampleOf({ ...row, steps: 'not json' }), null, 'bad steps')
})

test("only the examples person's turns are read; a later switch in the same session drops the earlier turn", () => {
  const { db, keep } = setup()
  keep('bart', 'build me a page that simply says Hi Bart', GOOD)
  keep('olive', 'build me a page for our tenants meeting', GOOD)
  keep('bart', 'make a timer app for my run', GOOD, { session: 'run' })
  keep('bart', 'make it prettier', GOOD, { session: 'run', engine: 'claude', switched_from: 'ola' })
  keep('bart', 'Hi', [])
  const exs = examplesFrom(db, 'bart')
  assert.deepEqual(exs.map((e) => e.request), ['build me a page that simply says Hi Bart'])
  assert.deepEqual(examplesFrom(db, 'olive').map((e) => e.request), ['build me a page for our tenants meeting'])
  assert.deepEqual(examplesFrom(db, 'nobody'), [])
})

test('the file: readable through the mount, rewritten on every change, emptied when the turns are deleted, and the plugin uses it', () => {
  const { db, ids, keep } = setup()
  const file = path.join(dir(), 'examples', 'kept.json')
  const old = process.umask(0o077) // the front desk's umask
  try {
    keep('bart', 'make a page with a big countdown clock to the march on Saturday', GOOD)
    keep('olive', 'make a countdown clock page for the rent strike vote', GOOD)
    assert.equal(writeExamples(db, file, 'bart'), 1)
  } finally { process.umask(old) }
  assert.equal(statSync(file).mode & 0o777, 0o644)
  assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o755)
  const body = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(body.examples.length, 1)
  assert.ok(!JSON.stringify(body).includes('rent strike'), "another person's words in the file")

  // The plugin as in a VM: the committed library, and the kept file as OLA_EXAMPLES_EXTRA.
  const env = { OLA_EXAMPLES_EXTRA: file }
  const ask = (text, sid) => { const ev = { sessionID: sid, system: [], messages: [{ role: 'user', content: text }] }; onContext(ev, env); return ev.system.map((p) => p.text).join('\n') }
  reset()
  const seen = ask('build me a countdown clock page to our protest on Friday', 'a')
  assert.ok(seen.startsWith(NOTE_HEAD) && seen.includes('big countdown clock to the march'), 'the kept example was not shown')

  // He deletes his kept turns: the file is emptied, and the plugin (same process) stops showing it.
  db.prepare('DELETE FROM kept_turns WHERE person_id = ?').run(ids.bart)
  assert.equal(writeExamples(db, file, 'bart'), 0)
  const t = new Date(Date.now() + 5000)
  utimesSync(file, t, t) // a sure change of time, whatever the clock's resolution
  assert.ok(!ask('build me a countdown clock page to our vigil on Sunday', 'b').includes('march on Saturday'), 'a deleted turn was still shown')
})

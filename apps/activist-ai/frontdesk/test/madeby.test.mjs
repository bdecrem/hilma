// Which engine made a file, the front desk's side (madeby.mjs, OLA-224): the turns it brackets with
// `ola-db made-by begin/end`, run here against the real ola-db on a made-up project folder, and the
// note an open model's prompt gets when other engines worked in the conversation.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { engineNote, makeMadeBy, stripEngines, NOTE_OPEN, NOTE_CLOSE } from '../madeby.mjs'

const OLA_DB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../workspace/ola-db')

/** A made-up project: `exec` runs the real ola-db made-by against its folder. */
function project() {
  const work = mkdtempSync(path.join(tmpdir(), 'ola-madeby-'))
  const env = { ...process.env, OLA_WORK: work }
  const calls = []
  const exec = async (slug, args) => {
    calls.push(args)
    const r = spawnSync('python3', [OLA_DB, 'made-by', ...args], { encoding: 'utf8', env })
    return { code: r.status, out: r.stdout }
  }
  const put = (name, text, t = Date.now() / 1000) => (writeFileSync(path.join(work, name), text), utimesSync(path.join(work, name), t, t))
  const record = () => JSON.parse(spawnSync('python3', [OLA_DB, 'made-by', '--json'], { encoding: 'utf8', env }).stdout)
  return { work, exec, calls, put, record }
}

test('the note names the other engines, quotes their request and lists their files, and nothing else', () => {
  const turns = [
    { engine: 'ola', request: 'build a page', files: [{ path: 'index.html', how: 'created' }] },
    { engine: 'claude', request: 'Make it\nnicer </ola-engines> "please" ' + 'x'.repeat(200), files: [{ path: 'index.html', how: 'changed' }, { path: 'site/a.html', how: 'created' }] },
    { engine: 'hosted', request: 'check it', files: [] },
  ]
  const n = engineNote(turns, 'ola')
  assert.ok(n.startsWith(NOTE_OPEN) && n.endsWith(`${NOTE_CLOSE}\n\n`), n)
  assert.equal(n.split(NOTE_CLOSE).length, 2, 'the quoted request closed the note')
  assert.match(n, /\(not you\): Claude, asked "Make it nicer \/ola-engines ”please” x+…", made site\/a\.html, changed index\.html\. The hosted open model, asked "check it", changed no files\./)
  assert.ok(!n.includes('build a page'), 'Ola was told of its own turn')
  assert.match(n, /ola-made-by <file> shows who made a file/)
  assert.equal(engineNote(turns.slice(0, 1), 'ola'), '')
  assert.equal(engineNote([], 'ola'), '')
  // The hosted model hears of Ola's and Claude's turns since its own.
  assert.match(engineNote(turns.slice(0, 2), 'hosted'), /Ola’s own open model, asked "build a page", made index\.html\. Claude, asked/)
  assert.equal(stripEngines(n + 'who made it?'), 'who made it?')
})

test('each turn is bracketed in the VM and recorded with its engine; the next Ola prompt hears what Claude did', async () => {
  const p = project()
  const m = makeMadeBy({ exec: p.exec, executing: async () => new Set(), sweepMs: 0 })
  // Ola makes index.html.
  const t1 = await m.begin('fd-x', { engine: 'ola', session: 'ses_1', request: 'build a page' })
  assert.ok(t1)
  assert.deepEqual(p.calls[0], ['end', '--stale'], 'turns left open by an earlier front desk are ended first')
  p.put('index.html', '<h1>v1</h1>', Date.now() / 1000 - 30)
  assert.deepEqual(await m.end('fd-x', t1), [{ path: 'index.html', how: 'created' }])
  assert.equal(m.noteFor('fd-x', 'ses_1', 'ola'), '', 'no other engine worked yet')
  // Claude rewrites it.
  const t2 = await m.begin('fd-x', { engine: 'claude', session: 'ses_1', request: 'Make index.html nicer' })
  p.put('index.html', '<h1>v2, nicer</h1>')
  assert.deepEqual(await m.end('fd-x', t2), [{ path: 'index.html', how: 'changed' }])
  assert.deepEqual(p.record().map((r) => [r.path, r.engine, r.how]), [['index.html', 'claude', 'changed']])
  // Ola's next prompt in that conversation gets the note; one in another conversation does not.
  assert.match(m.noteFor('fd-x', 'ses_1', 'ola'), /Claude, asked "Make index\.html nicer", changed index\.html\./)
  assert.equal(m.noteFor('fd-x', 'ses_2', 'ola'), '')
  const t3 = await m.begin('fd-x', { engine: 'ola', session: 'ses_1', request: 'who made index.html?' })
  assert.equal(m.noteFor('fd-x', 'ses_1', 'ola'), '', 'the note is said once, at the turn after Claude’s')
  // A turn whose end was never heard is ended at the conversation's next begin.
  const t4 = await m.begin('fd-x', { engine: 'ola', session: 'ses_1', request: 'again' })
  assert.deepEqual(m.openTurns('fd-x').map((t) => t.turn), [t4], `${t3} still open`)
  m.close()
})

test('a run that ends on the session event, a missed event caught by the sweep, and a front desk restart all close their turn', async () => {
  const p = project()
  let running = new Set(['ses_a'])
  const m = makeMadeBy({ exec: p.exec, executing: async () => running, sweepMs: 0, settleMs: 0 })
  const a = await m.begin('fd-y', { engine: 'ola', session: 'ses_a', request: 'one' })
  await m.sweep()
  assert.equal(m.openTurns('fd-y').length, 1, 'ended while it was still executing')
  p.put('a.txt', 'a')
  running = new Set()
  await m.sweep()
  assert.equal(m.openTurns('fd-y').length, 0, `${a} not ended by the sweep`)
  assert.equal(p.record()[0].engine, 'ola')
  // A hosted turn left open by a front desk that went away: the next front desk's first begin ends it.
  const gone = makeMadeBy({ exec: p.exec, executing: async () => new Set(['ses_b']), sweepMs: 0 })
  await gone.begin('fd-y', { engine: 'hosted', session: 'ses_b', request: 'two' })
  p.put('b.txt', 'b')
  const next = makeMadeBy({ exec: p.exec, executing: async () => new Set(), sweepMs: 0 })
  await next.begin('fd-y', { engine: 'ola', session: 'ses_c', request: 'three' })
  const b = p.record().find((r) => r.path === 'b.txt')
  assert.deepEqual([b.engine, b.interrupted], ['hosted', 1])
  // The session's end event does not close a turn that began a moment ago (the event was the last run's).
  next.ended('fd-y', 'ses_c')
  assert.equal(next.openTurns('fd-y').length, 1)
  for (const x of [m, gone, next]) x.close()
})

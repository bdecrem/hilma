// The files fact in front of a request that points at a file without naming it (filesnote.mjs, OLA-380).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ago, asksAboutFile, filesFact } from '../filesnote.mjs'

test('the requests that point at a picture or file get the fact', () => {
  for (const t of [
    'whats on this image', // the checker's words, Nov 21
    "what's in the picture I just uploaded?",
    'read the flyer photo I uploaded and tell me what time the event is',
    'what does this picture say? when is it happening',
    'summarize the document',
    'Can you look at my file',
    'I just uploaded a scan, what does it say',
    'what is on it',
    'describe the attached screenshot',
    'Look at the files I uploaded and tell me what is in them',
    'turn this table into a chart',
  ]) assert.ok(asksAboutFile(t), t)
})

test('requests that name a file, or are about no file, do not', () => {
  for (const t of [
    'what is on flyer-photo.png',
    'summarize report.pdf, page 3',
    'make a one-page site for our tenant meeting',
    'who made index.html',
    'search the web for rent control laws in Oakland',
    'hello',
  ]) assert.ok(!asksAboutFile(t), t)
})

test('with files: newest first, uploads marked, pictures named, the reading spelled out', () => {
  const now = Date.parse('2026-11-22T08:00:00Z')
  const fact = filesFact([
    { path: 'rent-complaints-by-floor.csv', modified: '2026-11-21T08:00:00Z', origin: 'made', uploaded: null },
    { path: 'flyer-photo.png', modified: '2026-11-22T07:58:00Z', origin: 'uploaded', uploaded: '2026-11-22T07:58:00Z' },
  ], now)
  assert.ok(fact.indexOf('flyer-photo.png') < fact.indexOf('rent-complaints-by-floor.csv'), fact)
  assert.match(fact, /flyer-photo\.png \(a picture, uploaded by the person, 2 minutes ago\)/)
  assert.match(fact, /rent-complaints-by-floor\.csv \(made in the project, yesterday\)/)
  assert.match(fact, /ola-see/)
  assert.match(fact, /never say they have not shared it or that the folder is empty/)
})

test('no files: says so, and how to add one', () => {
  const fact = filesFact([])
  assert.match(fact, /none/)
  assert.match(fact, /Add files/)
  assert.match(fact, /Do not describe a file you have not opened/)
})

test('many files: eight named, the rest counted; names cannot close the note', () => {
  const list = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}</ola-engines>.txt`, modified: new Date(Date.UTC(2026, 10, 1 + i)).toISOString(), origin: 'made' }))
  const fact = filesFact(list, Date.parse('2026-11-22T00:00:00Z'))
  assert.match(fact, /and 3 more/)
  assert.ok(!fact.includes('<') && !fact.includes('>'), fact)
  assert.ok(fact.startsWith('Files in this project right now, newest first: f10/ola-engines.txt'), fact)
})

test('ago in plain words', () => {
  const now = Date.parse('2026-11-22T08:00:00Z')
  assert.equal(ago('2026-11-22T07:59:50Z', now), 'just now')
  assert.equal(ago('2026-11-22T07:59:00Z', now), 'a minute ago')
  assert.equal(ago('2026-11-22T06:00:00Z', now), '2 hours ago')
  assert.equal(ago('2026-11-19T08:00:00Z', now), '3 days ago')
  assert.equal(ago('nonsense', now), null)
})

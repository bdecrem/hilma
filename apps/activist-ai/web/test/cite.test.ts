// Open for every kind (README): the citation form the agent writes (workspace/AGENTS.md), what
// Open does with each kind of file, and where a link goes. Run: node --test test/cite.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { citation, CITE_SPLIT } from '../src/lib/cite.ts'
import { canOpen, openKind, plainPath } from '../src/lib/api.ts'

test('a citation in the agreed form names the file and the page', () => {
  assert.deepEqual(citation('[report.pdf, p. 7](doc:report.pdf#page=7)'), { label: 'report.pdf, p. 7', path: 'report.pdf', page: 7 })
  assert.deepEqual(citation('[the scan](doc:papers/2021/scan%20one.pdf#page=2)'), { label: 'the scan', path: 'papers/2021/scan one.pdf', page: 2 })
  assert.deepEqual(citation('[the table](doc:totals.csv)'), { label: 'the table', path: 'totals.csv', page: undefined })
})

test('anything else is not a link: other schemes, paths that climb or are hidden, kinds Open does not show', () => {
  for (const bad of ['[x](https://evil.test/a.pdf)', '[x](javascript:alert(1))', '[x](doc:../secrets.pdf#page=1)', '[x](doc:/etc/passwd)', '[x](doc:.ola/state.db)', '[x](doc:run.sh)', '[x](doc:a.pdf#page=0x1)', '[x](doc:%E0%A4%A.pdf)'])
    assert.equal(citation(bad), null, bad)
  const parts = 'See [report.pdf, p. 2](doc:report.pdf#page=2) and [b](doc:b.md).'.split(new RegExp(`(${CITE_SPLIT.source})`, 'g'))
  assert.deepEqual(parts.filter((p) => citation(p)).length, 2)
})

test('what Open does with each kind', () => {
  assert.equal(openKind('index.html'), 'page')
  for (const f of ['a.png', 'a.JPG', 'a.svg', 'a.webp', 'a.gif']) assert.equal(openKind(f), 'image', f)
  assert.equal(openKind('a.pdf'), 'pdf')
  for (const f of ['a.docx', 'a.md', 'a.txt']) assert.equal(openKind(f), 'doc', f)
  for (const f of ['a.csv', 'a.xlsx', 'a.tsv']) assert.equal(openKind(f), 'table', f)
  for (const f of ['a.zip', 'a.db', 'a.sh', 'a']) assert.equal(canOpen(f), false, f)
  assert.equal(plainPath('papers/2021/a b.pdf'), true)
  assert.equal(plainPath('../a.pdf'), false)
})

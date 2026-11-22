// A publish copy (OLA-244): the publish skill's `prepare` copies a page into site/ and leaves
// site/.ola-source.json. The home showed index.html and site/index.html as two pages, and Publish
// offered a choice between them. The copy folds into its page; with its page gone, it stays shown.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { derivedThings, markSiteCopies, otherCount, otherFiles } from '../server/project.mjs'

const entry = (path) => ({ path, size: 10, modified: '2026-11-20T18:00:00.000Z', origin: 'made', uploaded: null })
const files = (list) => ({ list: async () => list, readText: async () => '<title>Bart</title>' })

test('the copy is not a second page; the page carries the copy folder', async () => {
  const list = ['index.html', 'style.css', 'site/index.html', 'site/style.css'].map(entry)
  markSiteCopies(list, [{ folder: 'site', page: 'index.html' }])
  const things = await derivedThings(files(list))
  assert.deepEqual(things.map((t) => t.file), ['index.html'])
  assert.deepEqual(things[0].copies, ['site'])
  assert.deepEqual(otherFiles(list, things).map((f) => f.path), ['style.css'], 'the copy is not listed under other files either')
  assert.equal(otherCount(list, things), 1)
})

test('a record whose page is gone, or that names a page inside its own folder, leaves the copy shown', async () => {
  const gone = ['site/index.html'].map(entry)
  markSiteCopies(gone, [{ folder: 'site', page: 'index.html' }])
  assert.deepEqual((await derivedThings(files(gone))).map((t) => t.file), ['site/index.html'])
  const inside = ['site/index.html'].map(entry)
  markSiteCopies(inside, [{ folder: 'site', page: 'site/index.html' }])
  assert.deepEqual((await derivedThings(files(inside))).map((t) => t.file), ['site/index.html'])
})

test('no record: both pages show, as before (a project made before image 2.3.2-64)', async () => {
  const list = ['index.html', 'site/index.html'].map(entry)
  markSiteCopies(list, [])
  assert.deepEqual((await derivedThings(files(list))).map((t) => t.file).sort(), ['index.html', 'site/index.html'])
})

test('a page in a folder, copied to site/: the page keeps its place', async () => {
  const list = ['flyer/flyer.html', 'flyer/a.png', 'site/index.html', 'site/assets/a.png'].map(entry)
  markSiteCopies(list, [{ folder: 'site', page: './flyer/flyer.html' }])
  const things = await derivedThings(files(list))
  assert.deepEqual(things.filter((t) => t.kind === 'site').map((t) => [t.file, t.copies]), [['flyer/flyer.html', ['site']]])
})

test('a page renamed after it was published: the copy folds into the page that took its place (checker, Nov 22)', async () => {
  const at = (path, modified) => ({ ...entry(path), modified })
  const list = [at('larch.html', '2026-11-22T14:00:00.000Z'), at('site-aspen/index.html', '2026-11-22T13:50:00.000Z'), at('site-aspen/.x', '2026-11-22T13:50:00.000Z')]
  markSiteCopies(list, [{ folder: 'site-aspen', page: 'aspen.html' }])
  const things = await derivedThings(files(list))
  assert.deepEqual(things.filter((t) => t.kind === 'site').map((t) => [t.file, t.copies]), [['larch.html', ['site-aspen']]])
  // Two candidates, or one older than the copy: the copy stays shown.
  const two = [at('larch.html', '2026-11-22T14:00:00.000Z'), at('oak.html', '2026-11-22T14:01:00.000Z'), at('site-aspen/index.html', '2026-11-22T13:50:00.000Z')]
  markSiteCopies(two, [{ folder: 'site-aspen', page: 'aspen.html' }])
  assert.equal((await derivedThings(files(two))).filter((t) => t.kind === 'site').length, 3)
  const older = [at('larch.html', '2026-11-22T13:00:00.000Z'), at('site-aspen/index.html', '2026-11-22T13:50:00.000Z')]
  markSiteCopies(older, [{ folder: 'site-aspen', page: 'aspen.html' }])
  assert.equal((await derivedThings(files(older))).filter((t) => t.kind === 'site').length, 2)
  // A page another record names is never taken.
  const claimed = [at('index.html', '2026-11-22T14:00:00.000Z'), at('site/index.html', '2026-11-22T13:40:00.000Z'), at('site-aspen/index.html', '2026-11-22T13:50:00.000Z')]
  markSiteCopies(claimed, [{ folder: 'site', page: 'index.html' }, { folder: 'site-aspen', page: 'aspen.html' }])
  assert.deepEqual((await derivedThings(files(claimed))).filter((t) => t.kind === 'site').map((t) => t.file).sort(), ['index.html', 'site-aspen/index.html'])
})

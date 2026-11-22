// The published-page fact in front of a change request that does not ask to publish (publishednote.mjs, OLA-244).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asksChangeNotPublish, publishedFact } from '../publishednote.mjs'

test('change requests that do not ask to publish get the fact', () => {
  for (const t of [
    'make the heading say Willow instead', // the checker's words, Nov 22, failed twice
    'change the page so it says Aspen',
    'change the page so it says Cedar',
    'make the title bigger',
    'can you fix the date on the page',
    'add a line with the meeting time',
    'Make it say Maple',
  ]) assert.ok(asksChangeNotPublish(t), t)
})

test('requests that ask to publish, or are not changes, get no fact', () => {
  for (const t of [
    'publish it again',
    'put up a page on ola that just says Hazel',
    'make a page that says Birch and publish it on ola',
    'put it online',
    'make it public',
    'take it down',
    'change the heading to Oak and publish it',
    'what is the address?',
    'thanks',
  ]) assert.ok(!asksChangeNotPublish(t), t)
})

test('the fact names the address, the page and the copy, and the closing sentence', () => {
  const f = publishedFact({ url: 'https://sites.ola.cx/chk/', page: 'index.html', folder: 'site' })
  assert.match(f, /published at https:\/\/sites\.ola\.cx\/chk\/ \(from the copy in site\/\)/)
  assert.match(f, /change index\.html itself and keep its file name/)
  assert.match(f, /never edit or rename anything in site\//)
  assert.match(f, /do not run ola-publish and do not offer to/)
  assert.match(f, /This change is not public yet: https:\/\/sites\.ola\.cx\/chk\/ still shows the earlier page; say “publish it again” to put it up\./)
  assert.ok(!/[<>]/.test(publishedFact({ url: 'https://x/<y>', page: 'a<b>.html', folder: 's' })))
})

test('nothing published: no fact; a page published as itself: no copy line', () => {
  assert.equal(publishedFact(null), '')
  assert.equal(publishedFact({ url: '' }), '')
  const f = publishedFact({ url: 'https://sites.ola.cx/p/', page: 'oak.html', folder: null })
  assert.match(f, /change oak\.html itself/)
  assert.ok(!/publish copy/.test(f))
})

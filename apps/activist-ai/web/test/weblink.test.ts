// Links to the web in Ola's words (OLA-246): titled and bare addresses become links, nothing else
// does. Run: node --test test/weblink.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webLink, WEB_BARE_SPLIT, WEB_MD_SPLIT } from '../src/lib/weblink.ts'
import { CITE_SPLIT } from '../src/lib/cite.ts'

const split = (t: string) =>
  t.split(new RegExp(`(${CITE_SPLIT.source}|${WEB_MD_SPLIT.source}|\\*\\*[^*]+\\*\\*|\`[^\`]+\`|${WEB_BARE_SPLIT.source})`, 'g')).filter(Boolean)

test('a titled link names the site', () => {
  assert.deepEqual(webLink('[Rent board votes](https://www.oaklandside.org/2026/11/rent/)'), {
    label: 'Rent board votes',
    href: 'https://www.oaklandside.org/2026/11/rent/',
    host: 'oaklandside.org',
    titled: true,
  })
})

test('a bare address in a sentence is a link without the sentence punctuation', () => {
  const parts = split('Sources: https://example.org/a?b=1, and (https://news.example.com/x). Done.')
  const links = parts.map(webLink).filter(Boolean)
  assert.deepEqual(
    links.map((l) => l!.href),
    ['https://example.org/a?b=1', 'https://news.example.com/x'],
  )
  assert.ok(parts.includes(', and ('))
})

// OLA-230, OLA-267, Nov 21: Ola's answer [https://sites.ola.cx/p/](https://sites.ola.cx/p/) was read
// as "https://sites.ola.cx/p/sites.ola.cx". A label that is an address, or names the site, shows the
// address the link goes to, exactly, with nothing beside it.
test('a link labelled with an address shows the address it goes to, and only that', () => {
  const pub = 'https://sites.ola.cx/chk1121da-test/'
  for (const label of [pub, 'sites.ola.cx', 'sites.ola.cx/chk1121da-test', 'https://sites.ola.cx/other/', 'the page at sites.ola.cx'])
    assert.deepEqual(webLink(`[${label}](${pub})`), { label: pub, href: pub, host: 'sites.ola.cx', titled: false }, label)
  const parts = split(`Live at: [${pub}](${pub}) — the check confirms it.`)
  const shown = parts.map((p) => (webLink(p) ? webLink(p)!.label + (webLink(p)!.titled ? ` ${webLink(p)!.host}` : '') : p)).join('')
  assert.equal(shown, `Live at: ${pub} — the check confirms it.`)
  const addrs = shown.match(/https:\/\/sites\.ola\.cx\/\S*/g)
  assert.deepEqual(addrs, [pub], 'every address a person reads is the published one')
  assert.equal(webLink('[Your page](https://sites.ola.cx/p/)')!.titled, true, 'a title that is words still names the site beside it')
})

test('other schemes and odd addresses stay text', () => {
  for (const bad of ['[x](javascript:alert(1))', '[x](data:text/html,hi)', '[x](https://user:pw@evil.test/)', 'ftp://a.test/x', '[x](doc:a.pdf)'])
    assert.equal(webLink(bad), null, bad)
})

test('an address inside code stays code, and a citation stays a citation', () => {
  const parts = split('Run `curl https://a.test/x` then see [r.pdf, p. 2](doc:r.pdf#page=2).')
  assert.ok(parts.includes('`curl https://a.test/x`'))
  assert.ok(parts.includes('[r.pdf, p. 2](doc:r.pdf#page=2)'))
  assert.equal(parts.map(webLink).filter(Boolean).length, 0)
})

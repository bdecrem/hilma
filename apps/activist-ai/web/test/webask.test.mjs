// What a web approval is about: the parser shared by the page and the front desk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shellWords, webRequestOf, webRequests } from '../server/webask.mjs'
import { permissionsFor } from '../server/proxy.mjs'

test('simple commands give the search words or the address', () => {
  assert.deepEqual(webRequestOf('ola-search "coastal adaptation"   plans'), { kind: 'search', item: 'coastal adaptation plans' })
  assert.deepEqual(webRequestOf("ola-search --count 5 'sea walls Kenya'"), { kind: 'search', item: 'sea walls Kenya' })
  assert.deepEqual(webRequestOf('/opt/ola/bin/ola-fetch https://www.ohchr.org/a%20b.pdf --as udhr.pdf'), { kind: 'fetch', item: 'https://www.ohchr.org/a%20b.pdf' })
  assert.deepEqual(webRequestOf('ola-fetch "https://Example.org/x?y=1"'), { kind: 'fetch', item: 'https://example.org/x?y=1' })
  assert.deepEqual(webRequestOf('ola-lookup "Lindqvist A (2031) Boilers and   tenants" --json'), { kind: 'lookup', item: 'Lindqvist A (2031) Boilers and tenants' })
  assert.deepEqual(webRequestOf('/opt/ola/bin/ola-lookup 10.5555/made.up.1'), { kind: 'lookup', item: '10.5555/made.up.1' })
  assert.equal(webRequestOf('ola-lookup "$(cat /work/notes.txt)"')?.item ?? null, null, 'not a simple command: no grant')
  assert.deepEqual(shellWords(`a "b \\"c\\"" 'd e' f\\ g`), ['a', 'b "c"', 'd e', 'f g'])
})

test('anything the shell would expand or chain is not simple: no item, so no one-time grant', () => {
  for (const c of ['ola-search "$(cat secret.csv)"', 'ola-search `cat x`', 'ola-search a; curl x', 'ola-search a | tee', 'ola-search a && rm b', 'ola-search $HOME', 'ola-search a > out', 'ola-fetch http://plain.example/x', 'ola-fetch https://a https://b', "ola-search 'unclosed"])
    assert.equal(webRequestOf(c)?.item ?? null, null, c)
  assert.equal(webRequestOf('python3 -c "print(1)"'), null, 'not one of our tools')
  assert.deepEqual(webRequests('edit', ['ola-search x']), [])
  assert.equal(webRequests('shell', ['ls', 'ola-search x', 'ola-fetch https://a.org/']).length, 2)
})

test('session rules: our tools ask, run when the project said always (not under "Ask me first"); the denials stay last', () => {
  const find = (rules, r) => rules.filter((x) => x.action === 'shell' && x.resource === r).at(-1)?.effect
  assert.equal(find(permissionsFor('go'), 'ola-search *'), 'ask')
  assert.equal(find(permissionsFor('go', 'always'), 'ola-fetch *'), 'allow')
  assert.equal(find(permissionsFor('ask', 'always'), 'ola-fetch *'), 'ask')
  assert.deepEqual(permissionsFor('go', 'always').slice(-5).map((r) => r.effect), ['deny', 'deny', 'deny', 'deny', 'allow'])
  // The one thing outside the project folder a session may read: Ola's own skills (first-user pass).
  for (const a of ['go', 'ask']) assert.deepEqual(permissionsFor(a).at(-1), { action: 'external_directory', resource: '/opt/ola/skills/*', effect: 'allow' })
  assert.equal(permissionsFor('go').filter((r) => r.action === 'external_directory' && r.effect === 'allow').length, 1)
})

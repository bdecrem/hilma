// npx tsx --test scripts/venture/app-token-test.ts
// The phone app's admin token (src/lib/kochito/app-auth.ts): made-up accounts and secret.
import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.KOCHITO_APP_USERS = 'alice:one-two-three,bob:four'
process.env.KOCHITO_APP_SECRET = 'a test secret that is long enough'
process.env.F2_SUPABASE_URL ??= 'http://unused.invalid'
process.env.F2_SUPABASE_SERVICE_KEY ??= 'unused'

test('a token names its account until it expires', async () => {
  const { appToken, readAppToken } = await import('../../src/lib/kochito/app-auth')
  const now = Date.now()
  const t = appToken('alice', now)
  assert.equal(readAppToken(t.token, now), 'alice')
  assert.equal(readAppToken(t.token, now + 29 * 86400e3), 'alice')
  assert.equal(readAppToken(t.token, now + 31 * 86400e3), null, 'expired after 30 days')
})

test('a changed or foreign token is refused', async () => {
  const { appToken, readAppToken, sessionValue } = await import('../../src/lib/kochito/app-auth')
  const t = appToken('alice').token
  assert.equal(readAppToken(t.replace('alice', 'bob')), null, 'another name, same signature')
  assert.equal(readAppToken(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')), null, 'a changed signature')
  assert.equal(readAppToken(sessionValue('alice').value), null, 'the page cookie is not a token')
  assert.equal(readAppToken(null), null)
  assert.equal(readAppToken('olaapp.alice.1.x'), null)
})

test('a removed account is signed out', async () => {
  const { appToken, readAppToken } = await import('../../src/lib/kochito/app-auth')
  const t = appToken('bob').token
  process.env.KOCHITO_APP_USERS = 'alice:one-two-three'
  assert.equal(readAppToken(t), null)
  process.env.KOCHITO_APP_USERS = 'alice:one-two-three,bob:four'
})

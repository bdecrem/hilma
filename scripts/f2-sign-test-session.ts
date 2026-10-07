// Prints a signed f2_session cookie value for a user id (local dev / simulator -TestSessionToken).
//   npx tsx scripts/f2-sign-test-session.ts [user id]   (default: the newx-test account)
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const id = process.argv[2] ?? '853d0054-7de2-4359-9133-8c14ff3f2653'
import('../src/lib/f2/auth').then(({ signSession }) => console.log(signSession(id)))

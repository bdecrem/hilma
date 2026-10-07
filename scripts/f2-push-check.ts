// Dodo push (APNs): prove the key signs, and optionally send a real one.
//
//   npx tsx scripts/f2-push-check.ts                      # both gateways with a dummy token
//   npx tsx scripts/f2-push-check.ts --user <f2 user id>  # today's Actively Read push to that user's devices
//
// With a good key and topic, APNs answers a dummy token with 400 BadDeviceToken;
// a bad key or team gets 403 InvalidProviderToken.
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

async function main() {
  const { sendApns, sendPushToUser, pushConfigured } = await import('../src/lib/f2/push')
  if (!pushConfigured()) throw new Error('APNS_* not configured in .env.local')
  let failed = 0
  for (const env of ['sandbox', 'production'] as const) {
    const r = await sendApns('a'.repeat(64), env, { title: 'probe', body: 'probe' })
    const ok = r.status === 400 && r.reason === 'BadDeviceToken'
    console.log(`${ok ? 'PASS' : 'FAIL'} ${env} gateway accepts the key (dummy token → ${r.status} ${r.reason})`)
    if (!ok) failed++
  }
  const user = arg('--user')
  if (user) {
    const { ensureTodaysPick, activelyReadPush } = await import('../src/lib/f2/actively-read')
    const pick = await ensureTodaysPick(user)
    if (!pick) throw new Error('no Actively Read pick for that user')
    const r = await sendPushToUser(user, activelyReadPush(pick))
    console.log(`sent to ${r.sent} device(s)${r.failed.length ? `; failed ${JSON.stringify(r.failed)}` : ''} — "${pick.topic}"`)
    if (r.sent === 0) failed++
  }
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })

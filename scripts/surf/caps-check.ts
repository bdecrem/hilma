// npx tsx scripts/surf/caps-check.ts — the per-user ceilings on the real tables, with throwaway
// rows: a user at the day's publish ceiling can't publish another creation, a device at the
// day's run ceiling can't post another score. Env loaded (set -a; source ./.env.local).
async function main() {
process.env.SURF_MAX_PUBLISHES_PER_DAY = '2'
process.env.SURF_MAX_RUNS_PER_DAY = '2'
const { publish, PublishCap } = await import('../../src/lib/surf/apps')
const { submit, ScoreCap } = await import('../../src/lib/surf/scores')
const { signup } = await import('../../src/lib/surf/auth')
const { surfDb } = await import('../../src/lib/surf/db')

let bad = 0
const check = (ok: boolean, what: string) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++ }
const handle = 'capcheck' + Math.random().toString(36).slice(2, 7)
const u = await signup(handle, 'capcheck-pass-1')
if ('error' in u) throw new Error(u.error)
const device = 'capcheck-' + Math.random().toString(36).slice(2, 10)
try {
  for (let i = 1; i <= 3; i++) {
    try {
      await publish({ ownerId: u.id, clientId: `cap-${i}-${device}`, title: `Cap ${i}`, emoji: '🧪', prompt: 'a cap check', html: '<!doctype html><title>cap</title><p>cap check</p>' })
      check(i <= 2, `publish #${i} allowed`)
    } catch (e) {
      check(i === 3 && e instanceof PublishCap, `publish #${i} refused: ${(e as Error).message}`)
    }
  }
  for (let i = 1; i <= 3; i++) {
    try {
      await submit({ device, handle: 'cap check', score: 100 + i, coins: 1, distance: 60, mode: 'solo', version: 'check' })
      check(i <= 2, `run #${i} posted`)
    } catch (e) {
      check(i === 3 && e instanceof ScoreCap, `run #${i} refused: ${(e as Error).message}`)
    }
  }
} finally {
  const db = surfDb()
  await db.from('surf_apps').delete().eq('owner_id', u.id)
  await db.from('surf_users').delete().eq('id', u.id)
  await db.from('surf_scores').delete().eq('device_id', device)
  console.log('cleaned up', handle, device)
}
console.log(bad ? `${bad} failing` : 'caps check passed')
process.exit(bad ? 1 : 0)
}
main()

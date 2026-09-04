// Weekly Peck rule for the daily streak — state-machine check against the
// real database, on the F2 test account (never Bart's). Sets rows into
// specific states and asserts what streak.ts reads back / writes.
//
//   npx tsx scripts/f2-peck-week-check.ts
//
// Leaves the account in the "due tomorrow" state (streak 12, 1 day left)
// so the app's banner can be screenshotted; run with `--reset` to zero it.
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  // Force the file's values: the parent shell can carry a dead service key.
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const TEST_USER = '853d0054-7de2-4359-9133-8c14ff3f2653'

async function main() {
  const { f2Supabase } = await import('../src/lib/f2/supabase')
  const streak = await import('../src/lib/f2/streak')
  const { ptDay, addDays } = streak
  const sb = f2Supabase()
  const today = ptDay()
  const set = async (daily: number, dateOffset: number | null, weekOffset: number | null) => {
    const { error } = await sb
      .from('f2_users')
      .update({
        daily_streak: daily,
        daily_streak_date: dateOffset == null ? null : addDays(today, dateOffset),
        peck_week_start: weekOffset == null ? null : addDays(today, weekOffset),
      })
      .eq('id', TEST_USER)
    if (error) throw error
  }
  const row = async () => {
    const { data } = await sb
      .from('f2_users')
      .select('daily_streak, daily_streak_date, peck_week_start')
      .eq('id', TEST_USER)
      .single()
    return data as { daily_streak: number; daily_streak_date: string | null; peck_week_start: string | null }
  }
  let failed = 0
  const check = (name: string, ok: boolean, got: unknown) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}`}`)
    if (!ok) failed++
  }

  if (process.argv.includes('--reset')) {
    await set(0, null, null)
    console.log('reset')
    return
  }

  // A. mid-week: 4 days left
  await set(5, 0, -3)
  let s = await streak.getDailyStreak(TEST_USER)
  check('A live 5, 4 days left', s.streak === 5 && s.peck_days_left === 4 && s.peck_due === addDays(today, 4), s)
  check('A no nag', streak.peckNag(s) === '', streak.peckNag(s))

  // B. due tomorrow
  await set(5, 0, -6)
  s = await streak.getDailyStreak(TEST_USER)
  check('B 1 day left', s.streak === 5 && s.peck_days_left === 1, s)
  check('B nag tomorrow', streak.peckNag(s).includes('by tomorrow'), streak.peckNag(s))

  // C. due today
  await set(5, 0, -7)
  s = await streak.getDailyStreak(TEST_USER)
  check('C 0 days left', s.streak === 5 && s.peck_days_left === 0, s)
  check('C nag today', streak.peckNag(s).includes('by today'), streak.peckNag(s))

  // D. missed: cleared for real
  await set(5, 0, -8)
  s = await streak.getDailyStreak(TEST_USER)
  let r = await row()
  check('D lapsed reads 0', s.streak === 0 && s.peck_due === null, s)
  check('D lapsed written 0', r.daily_streak === 0 && r.daily_streak_date === null && r.peck_week_start === null, r)

  // E. a Peck set after the miss does not revive it
  await streak.markPeckWeek(TEST_USER)
  s = await streak.getDailyStreak(TEST_USER)
  check('E no revival after miss', s.streak === 0, s)

  // F. daily answer after the miss starts over at 1 with a fresh clock
  let n = await streak.bumpDailyStreak(TEST_USER)
  r = await row()
  check('F bump restarts at 1', n === 1 && r.peck_week_start === today && r.daily_streak_date === today, { n, r })

  // G. bump on a lapsed week (yesterday's streak, week missed) → 1
  await set(5, -1, -8)
  n = await streak.bumpDailyStreak(TEST_USER)
  r = await row()
  check('G bump on missed week → 1, fresh clock', n === 1 && r.peck_week_start === today, { n, r })

  // H. normal bump keeps the clock
  await set(5, -1, -3)
  n = await streak.bumpDailyStreak(TEST_USER)
  r = await row()
  check('H bump → 6, clock kept', n === 6 && r.peck_week_start === addDays(today, -3), { n, r })

  // I. a full Peck set restarts the clock: 7 days left
  await streak.markPeckWeek(TEST_USER)
  s = await streak.getDailyStreak(TEST_USER)
  check('I peck set → 7 days left', s.streak === 6 && s.peck_days_left === 7, s)

  // J. agent repair: streak 12, fresh clock
  n = await streak.setDailyStreak(TEST_USER, 12)
  s = await streak.getDailyStreak(TEST_USER)
  check('J set 12, 7 days left', n === 12 && s.streak === 12 && s.peck_days_left === 7, s)

  // K. legacy row (no clock) is not broken: clock reads as today
  await set(5, 0, null)
  s = await streak.getDailyStreak(TEST_USER)
  check('K null clock → 7 days left', s.streak === 5 && s.peck_days_left === 7, s)

  // Leave: streak 12, due tomorrow (banner state for the app).
  await set(12, 0, -6)
  s = await streak.getDailyStreak(TEST_USER)
  console.log('left account at', s)
  if (failed) {
    console.log(`${failed} FAILED`)
    process.exit(1)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

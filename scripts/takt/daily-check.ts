// Takt daily text check. Pure tests (streak, text, due check, phone) always run; the live part
// runs against a local dev server started with the sender stubbed:
//
//   TAKT_IMESSAGE_DRY=1 pnpm exec next dev -p 3270
//   npx tsx scripts/takt/daily-check.ts [http://localhost:3270]   (SKIP_LIVE=1 for pure only)
//
// The live part makes a throwaway guest, drives settings → phone → verify → tick (force+dry,
// then a real due run, which the stub turns into a log line) and deletes the guest afterwards.
// It never texts anyone: the number is a 555 test number and the server must be in dry mode.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  canResend,
  challengeFor,
  todaysChallenge,
  composeText,
  dayOfYear,
  isDue,
  localDate,
  normalizePhone,
  prevDate,
  streak,
  type DailyRow,
} from '../../src/lib/takt/daily'

let failures = 0
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  ok   ${label}`)
  else {
    failures++
    console.log(`  FAIL ${label}`)
  }
}
function eq<T>(got: T, want: T, label: string) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  ok(g === w, g === w ? label : `${label} (got ${g}, want ${w})`)
}

console.log('streak')
eq(streak([], '2026-10-25'), 0, 'empty')
eq(streak(undefined, '2026-10-25'), 0, 'missing days (old snapshot)')
eq(streak(['2026-10-25'], '2026-10-25'), 1, 'today only')
eq(streak(['2026-10-24'], '2026-10-25'), 1, 'yesterday only still counts')
eq(streak(['2026-10-23'], '2026-10-25'), 0, 'two days ago is broken')
eq(streak(['2026-10-22', '2026-10-23', '2026-10-24'], '2026-10-25'), 3, 'three ending yesterday')
eq(streak(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'], '2026-10-25'), 4, 'four ending today')
eq(streak(['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24'], '2026-10-25'), 2, 'gap stops the count')
eq(streak(['2026-02-28', '2026-03-01'], '2026-03-01'), 2, 'across a month end')
eq(streak(['2025-12-31', '2026-01-01'], '2026-01-02'), 2, 'across a year end')
eq(prevDate('2028-03-01'), '2028-02-29', 'leap day')

console.log('text')
const LA = 'America/Los_Angeles'
const oct25 = new Date('2026-10-25T19:00:00Z') // noon in LA
eq(todaysChallenge(null, oct25, LA), 'the 5-question ear check', 'no snapshot → ear check')
eq(todaysChallenge({ quiz: {} }, oct25, LA), 'the 5-question ear check', 'no quiz level → ear check')
eq(dayOfYear('2026-01-01'), 1, 'day of year Jan 1')
eq(dayOfYear('2026-10-25'), 298, 'day of year Oct 25')
eq(challengeFor(oct25, LA), '5 questions on the 12-bar form', '2026-10-25 → day 298 → index 1 → 12-bar form')
eq(challengeFor(new Date('2026-01-01T20:00:00Z'), LA), '5 ear questions: major or minor', 'Jan 1 → index 0')
eq(challengeFor(new Date('2026-10-26T03:00:00Z'), LA), '5 questions on the 12-bar form', 'tz decides the day: 03:00Z Oct 26 is still Oct 25 in LA')
eq(challengeFor(new Date('2026-10-26T03:00:00Z'), 'Europe/Brussels'), '5 listening questions: higher or lower', '…and Oct 26 in Brussels → index 2')
eq(todaysChallenge({ quiz: { level: 'ear' } }, oct25, LA), '5 questions on the 12-bar form', 'with a level → the rotation')
eq(
  composeText({ days: [] }, oct25, LA),
  "Takt: today's challenge is the 5-question ear check. Two minutes starts a streak.",
  'streak 0',
)
eq(
  composeText({ days: ['2026-10-23', '2026-10-24'], quiz: { level: 'both' } }, oct25, LA),
  "Takt: day 2 of your streak. Today's challenge: 5 questions on the 12-bar form. Open Takt to keep it going.",
  'streak 2 with a quiz level',
)

console.log('due check')
const base: DailyRow = { phone_verified_at: '2026-10-01T00:00:00Z', daily_enabled: true, daily_hour: 9, daily_tz: 'America/Los_Angeles', daily_sent_on: null }
const t = new Date('2026-10-25T16:00:00Z') // 09:00 in LA (PDT), 17:00 Brussels, 01:00 Tokyo (Oct 26)
ok(isDue(t, base), '9 am LA at 16:00Z')
ok(!isDue(new Date('2026-10-25T17:00:00Z'), base), 'not at 10 am LA')
ok(isDue(t, { ...base, daily_hour: 17, daily_tz: 'Europe/Brussels' }), '5 pm Brussels at 16:00Z (CET from Oct 25, EU DST over)')
ok(isDue(t, { ...base, daily_hour: 1, daily_tz: 'Asia/Tokyo' }), '1 am Tokyo at 16:00Z')
eq(localDate(t, 'Asia/Tokyo'), '2026-10-26', 'Tokyo is already on the 26th')
ok(!isDue(t, { ...base, daily_sent_on: '2026-10-25' }), 'already sent today (LA)')
ok(isDue(t, { ...base, daily_sent_on: '2026-10-24' }), 'sent yesterday → due')
ok(!isDue(t, { ...base, daily_hour: 1, daily_tz: 'Asia/Tokyo', daily_sent_on: '2026-10-26' }), 'sent on Tokyo’s today')
ok(isDue(t, { ...base, daily_hour: 1, daily_tz: 'Asia/Tokyo', daily_sent_on: '2026-10-25' }), 'Tokyo’s yesterday (UTC today) → due')
ok(!isDue(t, { ...base, phone_verified_at: null }), 'unverified')
ok(!isDue(t, { ...base, daily_enabled: false }), 'disabled')
ok(isDue(new Date('2026-12-01T17:00:00Z'), base), '9 am LA in PST is 17:00Z')

console.log('phone + cooldown')
eq(normalizePhone('(415) 555-0123'), '+14155550123', '10 digits → +1')
eq(normalizePhone('1-415-555-0123'), '+14155550123', '11 digits with 1')
eq(normalizePhone('+32 470 12 34 56'), '+32470123456', 'international kept')
eq(normalizePhone('555-0123'), null, 'too short')
eq(normalizePhone('call me'), null, 'letters')
eq(normalizePhone(12345), null, 'not a string')
const nowC = new Date('2026-10-25T12:00:00Z')
ok(canResend(nowC, null), 'no code yet → may send')
ok(!canResend(nowC, new Date(nowC.getTime() + 10 * 60_000 - 30_000).toISOString()), 'sent 30 s ago → wait')
ok(canResend(nowC, new Date(nowC.getTime() + 10 * 60_000 - 61_000).toISOString()), 'sent 61 s ago → ok')

async function live(baseUrl: string) {
  const env: Record<string, string> = {}
  for (const line of readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  let cookie = ''
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json', cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null }
  }
  const cron = { authorization: `Bearer ${env.CRON_SECRET}` }

  console.log(`live (${baseUrl})`)
  const g = await call('POST', '/api/takt/auth/guest')
  const userId = (g.json?.user as { id?: string } | undefined)?.id
  eq(g.status, 200, 'guest created')
  if (!userId) return
  try {
    eq((await call('GET', '/api/takt/daily')).json, { phone: null, verified: false, enabled: true, hour: 9, tz: 'America/Los_Angeles' }, 'GET defaults')
    eq((await call('PUT', '/api/takt/daily', { hour: 24 })).status, 400, 'PUT hour 24 → 400')
    eq((await call('PUT', '/api/takt/daily', { tz: 'Mars/Olympus' })).status, 400, 'PUT bad tz → 400')
    eq((await call('PUT', '/api/takt/daily', { hour: 7, tz: 'Europe/Brussels', enabled: false })).json,
      { phone: null, verified: false, enabled: false, hour: 7, tz: 'Europe/Brussels' }, 'PUT settings')
    eq((await call('POST', '/api/takt/daily/phone', { phone: 'abc' })).status, 400, 'bad phone → 400')
    const p = await call('POST', '/api/takt/daily/phone', { phone: '(415) 555-0123' })
    eq([p.status, p.json], [200, { phone: '+14155550123', verified: false }], 'phone stored, code sent (stubbed)')
    eq((await call('POST', '/api/takt/daily/phone', { phone: '4155550123' })).status, 429, 'second code within 60 s → 429')
    const { data: row } = await sb.from('takt_users').select('phone_code').eq('id', userId).single()
    const code = row?.phone_code as string
    ok(/^\d{4}$/.test(code ?? ''), `4-digit code stored (${code})`)
    const wrong = code === '0000' ? '0001' : '0000'
    eq((await call('POST', '/api/takt/daily/verify', { code: wrong })).status, 400, 'wrong code → 400')
    eq((await call('POST', '/api/takt/daily/verify', { code })).json, { phone: '+14155550123', verified: true }, 'verify')
    const { data: after } = await sb.from('takt_users').select('phone_code, phone_verified_at').eq('id', userId).single()
    ok(after?.phone_code === null && after?.phone_verified_at, 'code cleared, verified_at set')
    eq((await call('POST', '/api/takt/daily/verify', { code })).status, 400, 'reused code → 400')

    eq((await call('GET', `/api/takt/daily/tick?force=1&dry=1&user=${userId}`)).status, 401, 'tick without secret → 401')
    const t1 = await call('GET', `/api/takt/daily/tick?force=1&dry=1&user=${userId}`, undefined, cron)
    eq((t1.json?.results as unknown[])?.[0], { id: userId, status: 'dry', text: "Takt: today's challenge is the 5-question ear check. Two minutes starts a streak." }, 'tick force+dry, no progress')

    const now = new Date()
    const today = localDate(now, 'Europe/Brussels')
    const y = prevDate(today)
    await call('PUT', '/api/takt/progress', { progress: { lessons: {}, skills: {}, days: [prevDate(prevDate(y)), prevDate(y), y], quiz: { level: 'ear' } } })
    const t2 = await call('GET', `/api/takt/daily/tick?force=1&dry=1&user=${userId}`, undefined, cron)
    eq((t2.json?.results as { text?: string }[])?.[0]?.text,
      `Takt: day 3 of your streak. Today's challenge: ${challengeFor(now, 'Europe/Brussels')}. Open Takt to keep it going.`, 'tick force+dry, 3-day streak')

    // The real due path (sender stubbed by TAKT_IMESSAGE_DRY on the server): at the user's hour.
    const at = new Date(now)
    const hourNow = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Brussels', hour: 'numeric', hourCycle: 'h23' }).format(now))
    await call('PUT', '/api/takt/daily', { hour: hourNow, enabled: false })
    eq((await call('GET', `/api/takt/daily/tick?user=${userId}&now=${at.toISOString()}`, undefined, cron)).json?.due, 0, 'disabled → not due')
    await call('PUT', '/api/takt/daily', { enabled: true })
    const t3 = await call('GET', `/api/takt/daily/tick?user=${userId}&now=${at.toISOString()}`, undefined, cron)
    eq((t3.json?.results as { status?: string }[])?.[0]?.status, 'sent', 'due → sent (stubbed sender)')
    const { data: sent } = await sb.from('takt_users').select('daily_sent_on').eq('id', userId).single()
    eq(sent?.daily_sent_on, today, 'daily_sent_on = local today')
    eq((await call('GET', `/api/takt/daily/tick?user=${userId}&now=${at.toISOString()}`, undefined, cron)).json?.due, 0, 'second tick same day → not due')

    await sb.from('takt_users').update({ daily_sent_on: null }).eq('id', userId)
    await call('PUT', '/api/takt/progress', { progress: { lessons: {}, skills: {}, days: [y, today] } })
    eq((await call('GET', `/api/takt/daily/tick?user=${userId}&now=${at.toISOString()}`, undefined, cron)).json?.results,
      [{ id: userId, status: 'practiced' }], 'practiced today → skipped')

    eq((await call('DELETE', '/api/takt/daily/phone')).json, { phone: null, verified: false }, 'DELETE phone')
    eq((await call('GET', '/api/takt/daily')).json?.verified, false, 'GET after delete')
  } finally {
    const { error } = await sb.from('takt_users').delete().eq('id', userId)
    ok(!error, `throwaway guest ${userId} deleted`)
  }
}

const baseUrl = process.argv[2] ?? 'http://localhost:3270'
;(process.env.SKIP_LIVE === '1' ? Promise.resolve() : live(baseUrl))
  .catch((e) => {
    failures++
    console.error('live part crashed:', e)
  })
  .then(() => {
    console.log(failures ? `\n${failures} FAILED` : '\nall passed')
    process.exit(failures ? 1 : 0)
  })

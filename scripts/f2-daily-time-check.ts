// Pure check of the one-send-time logic (src/lib/f2/daily-time.ts): the
// local hour in a few zones, across DST, and the due test. No network.
//   npx tsx scripts/f2-daily-time-check.ts
import { dueAt, hourLabel, localHour, validHour, validTimeZone } from '../src/lib/f2/daily-time'

let fails = 0
function eq<T>(name: string, got: T, want: T) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`)
}

// 2026-10-16 16:00Z = 9 am PDT, 6 pm Brussels (CEST), 1 am Tokyo (next day)
const t = new Date('2026-10-16T16:00:00Z')
eq('LA 9', localHour(t, 'America/Los_Angeles'), 9)
eq('Brussels 18', localHour(t, 'Europe/Brussels'), 18)
eq('Tokyo 1', localHour(t, 'Asia/Tokyo'), 1)
// After the US fall-back (2026-11-01) 16:00Z is 8 am PST.
eq('LA PST 8', localHour(new Date('2026-11-16T16:00:00Z'), 'America/Los_Angeles'), 8)
eq('LA PST 9 at 17Z', localHour(new Date('2026-11-16T17:00:00Z'), 'America/Los_Angeles'), 9)
eq('midnight is 0 not 24', localHour(new Date('2026-10-16T07:00:00Z'), 'America/Los_Angeles'), 0)

eq('due LA 9', dueAt(t, { hour: 9, tz: 'America/Los_Angeles' }), true)
eq('not due LA 17', dueAt(t, { hour: 17, tz: 'America/Los_Angeles' }), false)
eq('due Brussels 18', dueAt(t, { hour: 18, tz: 'Europe/Brussels' }), true)
eq('bad zone falls back to LA', dueAt(t, { hour: 9, tz: 'Mars/Olympus' }), true)

eq('valid tz', validTimeZone('Europe/Brussels'), true)
eq('invalid tz', validTimeZone('Nowhere/Land'), false)
eq('empty tz', validTimeZone(''), false)
eq('hour 23', validHour(23), true)
eq('hour 24', validHour(24), false)
eq('hour 9.5', validHour(9.5), false)
eq('label 0', hourLabel(0), '12:00 AM')
eq('label 9', hourLabel(9), '9:00 AM')
eq('label 12', hourLabel(12), '12:00 PM')
eq('label 17', hourLabel(17), '5:00 PM')

// One full day: exactly one due hour per zone.
for (const tz of ['America/Los_Angeles', 'Europe/Brussels', 'Asia/Tokyo', 'Australia/Adelaide']) {
  let hits = 0
  for (let h = 0; h < 24; h++) if (dueAt(new Date(Date.UTC(2026, 9, 16, h)), { hour: 9, tz })) hits++
  eq(`one due hour a day in ${tz}`, hits, 1)
}
console.log(fails ? `${fails} FAILED` : 'all passed')
process.exit(fails ? 1 : 0)

// Scheduler tests for the SM-2 flash scheduler (src/lib/f2/flash.ts).
//
//   npx tsx scripts/test-flash-scheduler.ts
//
// Pure math — no DB, no LLM. Covers the ladder, lapses, the priority policy,
// and the trap the two-interval split exists to avoid (a priority card whose
// stored interval is clamped can never reach the mastery bar).
import { reviewCard, isMastered, cardWeight, MASTERY_INTERVAL_DAYS } from '../src/lib/f2/flash'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const NOW = new Date('2026-01-01T00:00:00Z')
const fresh = (over = {}) => ({
  reps: 0, lapses: 0, ease: 2.5, interval_days: 0, streak: 0, rating: null, ...over,
})
// jitter=0.5 → the fuzz multiplier lands exactly on 1.0, so intervals are
// the clean textbook numbers.
const rev = (card, correct) => reviewCard(card, correct, NOW, 0.5)

console.log('\nSM-2 ladder (all correct, ease 2.5):')
let c = fresh()
const ladder = []
for (let i = 0; i < 5; i++) {
  const r = rev({ ...c, rating: null }, true)
  ladder.push(r.interval_days)
  c = { ...c, ...r }
}
check('first interval is 1 day', ladder[0] === 1, `got ${ladder[0]}`)
check('second interval is 6 days', ladder[1] === 6, `got ${ladder[1]}`)
check('third is 6 * 2.5 = 15', ladder[2] === 15, `got ${ladder[2]}`)
check('fourth is 15 * 2.5 = 37.5', ladder[3] === 37.5, `got ${ladder[3]}`)
console.log(`       ladder: ${ladder.join(' → ')}`)

console.log('\nLapse behavior:')
const mature = fresh({ reps: 5, interval_days: 40, streak: 5, ease: 2.5 })
const lapsed = rev(mature, false)
check('interval resets to 1 day', lapsed.interval_days === 1, `got ${lapsed.interval_days}`)
check('lapse counter increments', lapsed.lapses === 1)
check('streak resets to 0', lapsed.streak === 0)
check('ease drops by 0.20', lapsed.ease === 2.3, `got ${lapsed.ease}`)
check('no longer mastered', !isMastered(lapsed))

console.log('\nEase floor:')
let low = fresh({ ease: 1.4, reps: 3, interval_days: 10 })
low = { ...low, ...rev(low, false) }
low = { ...low, ...rev(low, false) }
check('ease never drops below 1.3', low.ease === 1.3, `got ${low.ease}`)

console.log('\nMastery:')
check('21-day interval + 3 streak is mastered', isMastered({ interval_days: 21, streak: 3 }))
check('21 days but short streak is NOT', !isMastered({ interval_days: 21, streak: 2 }))
check('long streak but short interval is NOT', !isMastered({ interval_days: 15, streak: 9 }))

console.log('\nPriority policy:')
let p = fresh({ rating: 'priority' })
const pri = []
for (let i = 0; i < 6; i++) {
  const r = rev({ ...p, rating: 'priority' }, true)
  pri.push({ model: r.interval_days, sched: r.scheduled_days, mastered: isMastered(r) })
  p = { ...p, ...r }
}
check('priority is capped at 3 days while unmastered',
  pri.slice(0, 3).every((x) => x.sched <= 3),
  `got ${pri.map((x) => x.sched).join(', ')}`)
check('model interval still grows past the cap',
  pri[3].model > pri[2].model && pri[3].model >= 15,
  `got ${pri.map((x) => x.model).join(', ')}`)
// THE bug this design exists to prevent: clamping the stored interval would
// pin the model at 3 days forever and mastery would be unreachable.
const everMastered = pri.some((x) => x.mastered)
check('a priority card CAN still reach mastery', everMastered,
  `model intervals: ${pri.map((x) => x.model).join(', ')}`)
const afterMastery = pri.filter((x) => x.mastered)
check('mastered priority settles at <= 30 days (never leaves rotation)',
  afterMastery.length > 0 && afterMastery.every((x) => x.sched <= 30),
  `got ${afterMastery.map((x) => x.sched).join(', ')}`)
console.log(`       model:     ${pri.map((x) => x.model).join(' → ')}`)
console.log(`       scheduled: ${pri.map((x) => x.sched).join(' → ')}`)

console.log('\nCaps hold even with worst-case fuzz:')
// jitter=1 is the top of the ±5% band — the case that used to slip past.
const priHigh = reviewCard(
  fresh({ rating: 'priority', reps: 5, interval_days: 60, streak: 5 }), true, NOW, 1)
check('mastered priority never exceeds 30 days', priHigh.scheduled_days <= 30,
  `got ${priHigh.scheduled_days}`)
const normHigh = reviewCard(
  fresh({ reps: 8, interval_days: 300, streak: 8 }), true, NOW, 1)
check('mastered normal never exceeds 180 days', normHigh.scheduled_days <= 180,
  `got ${normHigh.scheduled_days}`)
const priLow = reviewCard(
  fresh({ rating: 'priority', reps: 2, interval_days: 6, streak: 2 }), true, NOW, 1)
check('unmastered priority never exceeds 3 days', priLow.scheduled_days <= 3,
  `got ${priLow.scheduled_days}`)

console.log('\nNormal mastered cards stay in circulation:')
let n = fresh()
let lastSched = 0
for (let i = 0; i < 9; i++) {
  const r = rev({ ...n, rating: null }, true)
  n = { ...n, ...r }
  lastSched = r.scheduled_days
}
check('capped at 180 days, not banished', lastSched <= 180 && lastSched > 0, `got ${lastSched}`)

console.log('\nSelection weights:')
const now = Date.parse('2026-06-01T00:00:00Z')
const day = 86_400_000
const base = { reps: 2, lapses: 0, ease: 2.5, interval_days: 6, streak: 2, rating: null }
const wDue = cardWeight({ ...base, due_at: new Date(now - 2 * day).toISOString() }, now)
const wFuture = cardWeight({ ...base, due_at: new Date(now + 5 * day).toISOString() }, now)
const wPriority = cardWeight(
  { ...base, rating: 'priority', due_at: new Date(now - 2 * day).toISOString() }, now)
const wMastered = cardWeight(
  { ...base, interval_days: 40, streak: 5, due_at: new Date(now - 2 * day).toISOString() }, now)
check('overdue outweighs not-yet-due', wDue > wFuture, `${wDue} vs ${wFuture}`)
check('priority outweighs a normal card of the same age', wPriority > wDue,
  `${wPriority} vs ${wDue}`)
check('mastered card is damped but never zero', wMastered < wDue && wMastered > 0,
  `${wMastered} vs ${wDue}`)
const wLapsed = cardWeight({ ...base, lapses: 4, due_at: new Date(now - 2 * day).toISOString() }, now)
check('cards you keep missing get a boost', wLapsed > wDue, `${wLapsed} vs ${wDue}`)

console.log(failures === 0 ? '\nAll scheduler tests passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

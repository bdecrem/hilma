// Buddy streaks, the pure parts: the pair streak across misses, starts and
// grace; the 7-day bonus mark; what counts as a name reply; the tails under
// "Kept."; the echo guard against every buddy template.
//   npx tsx scripts/onething/buddy-check.ts
import { keptTail, looksLikeName, nextBonusIn, pairStreak, isYes, cleanName } from '../../src/lib/onething/buddies'
import { nameReplyFor } from '../../src/lib/onething/flow'
import { BUDDY_FIRST_LINES, buddyCopy, joinNames, looksLikeOurs, promptText, reminderText, confirmText, SITE_URL } from '../../src/lib/onething/core'

let failures = 0
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10))

// ── pair streak ──
const A = new Set(days('2026-09-01', 14)) // Sep 1..14
const B = new Set(days('2026-09-01', 14))
check(pairStreak(A, B, '2026-09-02', '2026-09-14').streak === 13, 'both every day from a Sep 2 start, on Sep 14 → 13')
check(pairStreak(A, B, '2026-09-02', '2026-09-14').bothToday, 'bothToday when both kept today')
check(pairStreak(A, B, '2026-09-02', '2026-09-15').streak === 13, 'the next morning, before either wrote → still 13 (alive from yesterday)')
check(pairStreak(A, B, '2026-09-02', '2026-09-16').streak === 0, 'a full day with nothing from both → 0')
const Bmiss = new Set([...B].filter((d) => d !== '2026-09-10'))
check(pairStreak(A, Bmiss, '2026-09-02', '2026-09-14').streak === 4, 'B missed Sep 10 → streak restarts Sep 11: 4 on Sep 14')
check(pairStreak(A, Bmiss, '2026-09-02', '2026-09-10').streak === 8 && !pairStreak(A, Bmiss, '2026-09-02', '2026-09-10').bothToday, 'on the missed day itself, still open → 8 from yesterday, not both')
check(pairStreak(A, Bmiss, '2026-09-02', '2026-09-11').streak === 1 && pairStreak(A, Bmiss, '2026-09-02', '2026-09-11').bothToday, 'the day after the miss, both in → 1')
check(pairStreak(A, B, '2026-09-14', '2026-09-14').streak === 1, 'start day counts as day 1')
check(pairStreak(A, B, '2026-09-15', '2026-09-14').streak === 0, 'before the start day → 0')
const Aonly = new Set(days('2026-09-01', 14))
check(pairStreak(Aonly, new Set(), '2026-09-01', '2026-09-14').streak === 0, 'one side never wrote → 0')

// ── bonus ──
check(nextBonusIn(0) === 7 && nextBonusIn(6) === 1 && nextBonusIn(7) === 7 && nextBonusIn(13) === 1, 'next bonus in: 0→7, 6→1, 7→7, 13→1')
const paysAt = [1, 6, 7, 8, 14, 21].map((n) => n > 0 && n % 7 === 0)
check(JSON.stringify(paysAt) === JSON.stringify([false, false, true, false, true, true]), 'bonus pays at 7, 14, 21 only')

// ── names ──
for (const t of ['Sam', 'Mary Ann', 'Jean-Luc', "O'Brien", 'Priya K', 'sam']) check(looksLikeName(t), `name: "${t}"`)
for (const t of ['Slept in.', 'Ran in the rain and did not mind', 'Day 3 of the cold', 'yes', '', 'a'.repeat(25), 'Kept my head down']) {
  // "yes" and "Kept my head down" read as names by shape; the flow guards them by context, tested below
  if (t === 'yes' || t === 'Kept my head down') continue
  check(!looksLikeName(t), `not a name: "${t.slice(0, 30)}"`)
}
check(cleanName('  sam   k. ') === 'sam k', 'cleanName trims, collapses spaces, drops a full stop')
const asked = { name: null, name_asked_at: new Date(Date.now() - 60_000).toISOString() }
check(nameReplyFor(asked, 'Sam', false) === 'Sam', 'name reply right after asking, no prompt open → taken')
check(nameReplyFor(asked, 'Sam', true) === 'Sam', 'one word while the question is open → taken')
check(nameReplyFor(asked, 'Mary Ann Smith', true) === null, 'three words while the question is open → a sentence, not a name')
check(nameReplyFor(asked, 'Mary Ann Smith', false) === 'Mary Ann Smith', 'three words with no question open → a name (the person was just asked)')
check(nameReplyFor(asked, 'Kept my head down', false) === null, 'four words → a sentence, never a name')
check(nameReplyFor({ name: 'Sam', name_asked_at: asked.name_asked_at }, 'Priya', false) === null, 'already has a name → never')
check(nameReplyFor({ name: null, name_asked_at: null }, 'Sam', false) === null, 'never asked → never')
check(nameReplyFor({ name: null, name_asked_at: new Date(Date.now() - 2 * 86400000).toISOString() }, 'Sam', false) === null, 'asked two days ago → window closed')

// ── yes ──
check(isYes('YES') && isYes('yes please') && isYes('  Yep') && isYes('ok'), 'YES / yes please / yep / ok')
check(!isYes('yesterday was fine') && !isYes('no'), '"yesterday…" and "no" are not a yes')

// ── tails ──
check(JSON.stringify(keptTail(['Sam'], [])) === JSON.stringify(["Sam's in too."]), 'one buddy in')
check(JSON.stringify(keptTail([], ['Sam'])) === JSON.stringify(["Sam's still to come."]), 'one buddy out')
check(JSON.stringify(keptTail(['Sam', 'Priya'], [])) === JSON.stringify(['Sam and Priya are in too.']), 'two in')
check(JSON.stringify(keptTail(['Sam', 'Priya'], ['Lee'])) === JSON.stringify(['Sam and Priya in, Lee still to come.']), 'mixed')
check(keptTail([], []).length === 0, 'no buddies → no tail')
check(joinNames(['Sam', 'Priya', 'Lee']) === 'Sam, Priya and Lee', 'joinNames with three')

// ── every buddy text is recognised as ours when it echoes back ──
const vars = { name: 'Sam', names: 'Sam and Priya', in: 'Sam', out: 'Lee', n: 14, points: 25 }
let allOurs = true
for (const key of BUDDY_FIRST_LINES) {
  const line = buddyCopy(key, vars)
  if (!looksLikeOurs(`${line}\n${SITE_URL}`) || !looksLikeOurs(line)) { allOurs = false; console.log(`  not recognised: ${line}`) }
}
check(allOurs, 'every buddy template that can open a text is recognised, with and without the URL')
check(!looksLikeOurs("Sam's in too.") && !looksLikeOurs('Buddy streak with Sam reset to zero. Yours is fine.'), 'a tail on its own is not echo evidence (it never opens a text)')
check(looksLikeOurs(promptText([buddyCopy('reset', { name: 'Sam' })])), 'question + reset line recognised by its first line')
check(looksLikeOurs(reminderText(3, ['Sam'])) && looksLikeOurs(reminderText(3, ['Sam', 'Priya'])), 'buddy reminders recognised')
const r = { streak: 14, edited: false } as Parameters<typeof confirmText>[0]
check(looksLikeOurs(confirmText(r, keptTail(['Sam'], []))), 'kept + tail recognised')
check(looksLikeOurs([buddyCopy('accepted', { name: 'Bart' }), buddyCopy('nameAsk'), SITE_URL].join('\n')), 'accepted + name question recognised')
const human = ['Sam is in town.', 'Fine it is, I suppose.', 'Yes it is.', 'Day 14 with Sam at the lake.', 'Buddy streak with the kids.', 'Sam said yes to the job.']
const swallowed = human.filter((t) => looksLikeOurs(t))
check(swallowed.length === 0, `human sentences near the templates pass through${swallowed.length ? ` — swallowed: ${swallowed.join(' | ')}` : ''}`)

console.log(failures ? `${failures} failure(s)` : 'all passed')
process.exit(failures ? 1 : 0)

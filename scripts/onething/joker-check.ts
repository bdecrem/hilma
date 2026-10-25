// Jokers, the pure parts: what a hand can save (rescueFor), the streak through
// covered days (bridges, scoreboard), and the texts. No database.
//   npx tsx scripts/onething/joker-check.ts
import { addDays, confirmText, scoreboard, SITE_URL, type Entry, type Recorded } from '../../src/lib/onething/core'
import { bridges, dealsJoker, nextJokerIn, rescueFor } from '../../src/lib/onething/jokers'
import { pointsForEntry } from '../../src/lib/onething/levels'

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/// Entries the way recordEntry writes them: `days` oldest first, streak and
/// cumulative points computed day by day (a day after a gap starts at 1).
function history(days: string[], saves = new Set<string>()): Entry[] {
  const out: Entry[] = []
  let prev: Entry | null = null
  for (const day of days) {
    const streak: number = prev && bridges(prev.day, day, saves) ? prev.streak + 1 : 1
    const { base, bonus } = pointsForEntry(streak)
    const e: Entry = { id: `id-${day}`, user_id: 'u', day, text: `on ${day}`, streak, points: (prev?.points ?? 0) + base + bonus, created_at: '', updated_at: '' }
    out.push(e)
    prev = e
  }
  return out.reverse() // newest first, like listEntries
}
const run = (from: string, to: string) => {
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
}
const without = (days: string[], ...gone: string[]) => days.filter((d) => !gone.includes(d))

// Bart's real October: 36 days to the 17th, the 18th missed, four days, the 23rd missed, the 24th. Today the 25th, not yet written.
const TODAY = '2026-10-25'
const bart = history(without(run('2026-09-12', '2026-10-24'), '2026-10-18', '2026-10-23'))
check(bart.find((e) => e.day === '2026-10-17')?.streak === 36 && bart[0].streak === 1, 'fixture: 36 to the 17th, 1 on the 24th')

let r = rescueFor(bart, new Set(), TODAY, 3)
check(!!r && r.days.join() === '2026-10-18,2026-10-23', 'three jokers: both gaps covered (the 18th is exactly a week back)', JSON.stringify(r?.days))
check(r?.from.day === '2026-10-17' && r?.from.streak === 36, 'joins up with the 36 days of the 17th')
check(r?.now === 41 && r?.after.map((a) => a.becomes).join() === '37,38,39,40,41', 'the five days after come back as 37–41', r?.after.map((a) => a.becomes).join())
check(r?.deals === 1 && r?.left === 2, 'day 40 deals one back: 3 − 2 + 1 = 2 left', `${r?.deals} / ${r?.left}`)
check(r?.until === TODAY, 'the offer as it stands ends tonight (the 18th leaves the week tomorrow)')
check(!!r && r.after.every((a) => a.points >= bart.find((e) => e.day === a.day)!.points), 'no day loses points')
check(!!r && r.after.every((a, i, all) => i === 0 || a.points > all[i - 1].points), 'points still climb day by day')

r = rescueFor(bart, new Set(), TODAY, 1)
check(r?.days.join() === '2026-10-23' && r?.from.streak === 4 && r?.now === 5, 'one joker: only the newest gap (4 days → 5)', JSON.stringify(r?.days))
const bart25 = history(without(run('2026-09-12', '2026-10-25'), '2026-10-18', '2026-10-23'))
r = rescueFor(bart25, new Set(), '2026-10-26', 3)
check(r?.days.join() === '2026-10-23' && r?.now === 6, 'a day later (the 25th written) the 18th is out of reach: only the 23rd', JSON.stringify(r?.days))
check(rescueFor(bart, new Set(), TODAY, 0) === null, 'no jokers: no offer')

// A gap is covered whole or not at all.
const twoDays = history(without(run('2026-10-01', '2026-10-24'), '2026-10-22', '2026-10-23'))
check(rescueFor(twoDays, new Set(), TODAY, 1) === null, 'a two-day gap with one joker: no offer')
r = rescueFor(twoDays, new Set(), TODAY, 2)
check(r?.days.join() === '2026-10-22,2026-10-23' && r?.cost === 2 && r?.now === 22, 'a two-day gap with two jokers: 21 days → 22', `${r?.days} ${r?.now}`)

// Not written since the gap: the streak holds, today makes the next day.
const quiet = history(run('2026-10-10', '2026-10-23'))
r = rescueFor(quiet, new Set(), '2026-10-25', 2)
check(r?.days.join() === '2026-10-24' && r?.after.length === 0 && r?.now === 14, 'missed yesterday, nothing since: the 14 days hold', JSON.stringify(r))
check(rescueFor(quiet, new Set(), '2026-10-24', 2) === null, 'only today unwritten: nothing to save (today still has time)')
check(rescueFor(history(run('2026-10-20', '2026-10-25')), new Set(), TODAY, 3) === null, 'an unbroken run: nothing to save')
const allGone = history(run('2026-10-01', '2026-10-15'))
check(rescueFor(allGone, new Set(), TODAY, 3) === null, 'nine days missed: out of reach and out of hand')

// After the save: covered days bridge, the scoreboard is alive, the next day chains on.
const saved = new Set(['2026-10-18', '2026-10-23'])
check(bridges('2026-10-22', '2026-10-24', saved) && !bridges('2026-10-22', '2026-10-24', new Set()), 'bridges: through a covered day, not through a missed one')
check(bridges('2026-10-24', '2026-10-25', new Set()) && !bridges('2026-10-25', '2026-10-24', new Set()), 'bridges: next day yes, backwards no')
const after = history(without(run('2026-09-12', '2026-10-24'), '2026-10-18', '2026-10-23'), saved)
check(after[0].streak === 41, 'recorded again with the saves, the 24th is day 41', String(after[0].streak))
check(rescueFor(after, saved, TODAY, 2) === null, 'once saved, no offer left')
const quietSaved = new Set(['2026-10-24'])
const sb = scoreboard(quiet, '2026-10-25', quietSaved)
check(sb.streak === 14 && scoreboard(quiet, '2026-10-25').streak === 0, 'scoreboard: a covered yesterday keeps the 14 alive; without it, 0')

// Dealing.
check(dealsJoker(10) && dealsJoker(40) && !dealsJoker(0) && !dealsJoker(11), 'dealt on day 10, 20, 30, …')
check(nextJokerIn(13, 1) === 7 && nextJokerIn(20, 2) === 10 && nextJokerIn(0, 0) === 10 && nextJokerIn(5, 3) === null, 'next joker in: 7, 10, 10, none while full')

// The texts never mention them: bookmarks live on the page only.
const base = { edited: false, bonus: 0, leveledUp: false, level: { name: 'Sprout', min: 40 }, points: 100, earned: 30 } as unknown as Recorded
for (const joker of [{ dealt: true, held: 2 }, { dealt: false, held: 3 }]) {
  const t = confirmText({ ...base, streak: 20, joker })
  check(!/joker|bookmark/i.test(t) && !t.includes(SITE_URL), `kept reply on a tenth day (${joker.dealt ? 'dealt' : 'hand full'}): no word of it, no link`, t)
}

console.log(failures ? `${failures} failure(s)` : 'all passed')
process.exit(failures ? 1 : 0)

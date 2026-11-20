// The weaknesses ledger (2026-11-18). Bart: "our goal is to have a system that gets smarter and
// better each day by studying what it did wrong, how to prevent that same mistake/weakness, and
// what else can be learned, generalized, built".
// Every correction and every fault a sweep finds is filed under one named weakness, for Kit or for
// Ola, in apps/venture/private/data/weaknesses.json:
//   [{ id, side: 'kit' | 'ola', name, what, seen: [{ day, ref }], guards: [{ day, what, enforced }],
//      bet?: { text, issue } }]
// A guard is "enforced" when the system does it (a hook, a check, a test, code); otherwise it is a
// rule Kit has to follow. From that, per weakness:
//   open     no enforced guard yet
//   guarded  an enforced guard, and not seen on any later day ("holding N days")
//   back     seen again on a day after its newest enforced guard: the guard was too weak
import { existsSync, readFileSync } from 'node:fs'

export const WEAK_FILE = 'apps/venture/private/data/weaknesses.json'
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400e3)

export function loadWeaknesses(root) {
  const f = new URL(WEAK_FILE, root)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
}

// CORRECTIONS.md headings that look like a correction but carry no number (2026-11-19 sweep). Every
// count and check reads only "## N. <date>: …" entries, so on Nov 19 three corrections written as
// "## Nov 19, 5:34 pm: …" were invisible: not counted for the day, not required to be filed under a
// weakness. A dated heading without a number is refused by `sweep.mjs post` and reported by
// learning.mjs at every checkpoint. "## Count" and "## Self-caught …" are notes, not corrections.
const DATED = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/
export function unnumberedCorrections(text) {
  return text
    .split('\n')
    .filter((l) => /^## /.test(l) && !/^## \d+\. /.test(l) && !/^## (Count|Self-caught)\b/.test(l) && DATED.test(l))
    .map((l) => l.slice(3, 160))
}

export function weaknessStatus(list, today) {
  return list.map((w) => {
    const seen = [...w.seen].sort((a, b) => a.day.localeCompare(b.day))
    const enforced = w.guards.filter((g) => g.enforced).map((g) => g.day).sort()
    const lastGuard = enforced.at(-1) ?? null
    const last = seen.at(-1)?.day ?? null
    // "back" also on the day a weakness recurs after an earlier enforced guard, even when a new guard
    // is added that same day (2026-11-19 sweep: adding the day's fix had reset three recurrences to
    // "holding 0d"). The next day, if it is not seen again, the new guard shows as holding.
    const before = enforced.filter((d) => d < (last ?? '')).at(-1)
    const status = !lastGuard ? 'open' : last && (last > lastGuard || (last === lastGuard && before)) ? 'back' : 'guarded'
    const by_day = {}
    for (const s of seen) by_day[s.day] = (by_day[s.day] ?? 0) + 1
    return {
      id: w.id,
      side: w.side,
      name: w.name,
      what: w.what,
      seen: seen.length,
      first: seen[0]?.day ?? null,
      last,
      by_day,
      // seen again after the first guard of any kind: how often a fix did not hold
      came_back: w.guards.length ? seen.filter((s) => s.day > [...w.guards].sort((a, b) => a.day.localeCompare(b.day))[0].day).length : 0,
      guard: [...w.guards].sort((a, b) => a.day.localeCompare(b.day) || Number(a.enforced) - Number(b.enforced)).at(-1) ?? null,
      guards: w.guards.length,
      status,
      held_days: status === 'guarded' ? dayDiff(today, lastGuard) : null,
      quiet_days: last ? dayDiff(today, last) : null,
      bet: w.bet ?? null,
    }
  })
}

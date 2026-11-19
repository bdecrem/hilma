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

export function weaknessStatus(list, today) {
  return list.map((w) => {
    const seen = [...w.seen].sort((a, b) => a.day.localeCompare(b.day))
    const enforced = w.guards.filter((g) => g.enforced).map((g) => g.day).sort()
    const lastGuard = enforced.at(-1) ?? null
    const last = seen.at(-1)?.day ?? null
    const status = !lastGuard ? 'open' : last && last > lastGuard ? 'back' : 'guarded'
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

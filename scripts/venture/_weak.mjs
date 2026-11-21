// The weaknesses ledger (2026-11-18). Bart: "our goal is to have a system that gets smarter and
// better each day by studying what it did wrong, how to prevent that same mistake/weakness, and
// what else can be learned, generalized, built".
// Every correction and every fault a sweep finds is filed under one named weakness, for Kit or for
// Ola, in apps/venture/private/data/weaknesses.json:
//   [{ id, side: 'kit' | 'ola', name, what, seen: [{ day, ref }], guards: [{ day, what, enforced }],
//      bet?: { text, issue }, replay?: { at, cases, prevented, failing: [{ id, title, since, why }] } }]
// A guard is "enforced" when the system does it (a hook, a check, a test, code); otherwise it is a
// rule Kit has to follow. From that, per weakness:
//   open     no enforced guard yet
//   guarded  an enforced guard, and not seen on any later day ("holding N days")
//   back     seen again on a day after its newest enforced guard: the guard was too weak
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { realCaller } from './_overrides.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const WEAK_FILE = 'apps/venture/private/data/weaknesses.json'
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400e3)

// The notes folder. VENTURE_PRIVATE points every learning tool (correct.mjs, learning.mjs, sweep.mjs,
// the prompt hook, rules-trim.mjs) at a copy of apps/venture/private, so a made-up correction or entry
// is tested there and never lands in the real ledger (2026-11-20, OLA-251).
export function privPath(root, rel = '') {
  if (process.env.VENTURE_PRIVATE) return join(process.env.VENTURE_PRIVATE, rel)
  const base = typeof root === 'string' && !root.startsWith('file:') ? pathToFileURL(root.endsWith('/') ? root : root + '/') : root
  return fileURLToPath(new URL('apps/venture/private/' + rel, base))
}

/** Tools that write the live Learning page or the live database call this first (OLA-262): with
 *  VENTURE_PRIVATE pointing at a copy of the notes, the copy's made-up numbers must never reach them. */
export function refuseOnCopy(what) {
  const p = process.env.VENTURE_PRIVATE
  if (!p) return
  console.error(`Refused: VENTURE_PRIVATE is set (${p}), so the notes read here are a copy, and ${what} would put the copy's numbers on the live page or in the live database. Unset it (unset VENTURE_PRIVATE) to work on the real notes, or use --dry.`)
  // a line in the tracker's overrides (OLA-251, third pass), with the caller as the hook saw it
  const tool = basename(process.argv[1] ?? 'venture')
  const who = realCaller(process.argv.slice(2), tool)
  spawnSync(process.execPath, [fileURLToPath(new URL('./issues.mjs', import.meta.url)), 'record-override', '--what', `VENTURE_PRIVATE was set on a real write (${tool} ${process.argv.slice(2).join(' ')}: ${what}); refused`, '--tool', tool, '--caller', who], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 30000, env: { ...process.env, VENTURE_PRIVATE: '' } })
  process.exit(1)
}

export function loadWeaknesses(root) {
  const f = privPath(root, 'data/weaknesses.json')
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
}

// Fixes owed (2026-11-20, OLA-251). A correction is recorded the moment it is made; when the stronger
// fix its weakness needs is not built yet, the correction carries `owed` on its weakness:
//   owed: [{ ref: "correction 101", since: ISO, issue: "OLA-n", need: 3 }]
// `correct.mjs fix` settles it. `sweep.mjs post` refuses while one is older than OWED_DAYS.
export const OWED_DAYS = 2
export function owedFixes(list, now = Date.now()) {
  return list
    .flatMap((w) => (w.owed ?? []).map((o) => ({ ...o, weakness: w.id, name: w.name, days: Math.floor((now - Date.parse(o.since)) / 86400e3) })))
    .sort((a, b) => a.since.localeCompare(b.since))
}

// Corrections confirmed by another (OLA-251, Nov 21). correct.mjs add keeps who recorded a correction
// (venture_state correction-by:<n>); correct.mjs confirm, from a caller that did not, confirms or moves its
// weakness (correction-confirm:<n>). The corrections of a day since CONFIRM_SINCE that have no such
// confirmation are listed here, and sweep.mjs post refuses the day while there are any.
export const CONFIRM_SINCE = '2026-11-21'
export async function unconfirmedCorrections(db, list, day) {
  if (day < CONFIRM_SINCE) return []
  const out = []
  for (const w of list) for (const s of w.seen) {
    if (s.day !== day) continue
    const num = Number(/\d+/.exec(s.ref)?.[0])
    if (!num) continue
    const get = async (k) => {
      const r = await db.from('venture_state').select('value').eq('key', `${k}:${num}`).maybeSingle()
      if (r.error) throw new Error(`venture_state: ${r.error.message}`)
      return r.data?.value ?? null
    }
    const by = await get('correction-by')
    const ok = await get('correction-confirm')
    const why = !ok ? 'no confirmation yet' : ok.caller === by?.caller ? `confirmed by the caller that recorded it (${ok.caller})` : ok.weakness !== w.id ? `confirmed under ${ok.weakness}, now filed under ${w.id}` : null
    if (why) out.push({ num, weakness: w.id, why })
  }
  return out.sort((a, b) => a.num - b.num)
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
      // the replay test's cases filed under this weakness (steer-replay.mjs, OLA-175): how many a fresh
      // session with the rules gets right, and the ones it still gets wrong, with the day each began failing
      replay: w.replay ?? null,
    }
  })
}

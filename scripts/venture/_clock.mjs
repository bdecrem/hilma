// Typed times that are later than the machine's clock (OLA-324, Nov 20). That evening the M4 lead and
// the mini's agent typed times 10 to 16 minutes ahead of the clock (a log line saying 6:25 pm for work
// recorded at 6:09 pm): a time written from memory or guessed, not read with `date`. The tools that
// write a time refuse one more than SLACK_MIN minutes ahead:
//   sync.mjs push     LOG.md headings, NOW.md's "updated" line, each HANDOFF-*.md's first line (and
//                     the journal, its own check since Nov 18)
//   issues.mjs        comment text and --proof
//   correct.mjs       --at (the time Bart said it): its own check since Nov 20, with no minutes allowed
//   noteAhead(name, body, now)   the typed write times of a note that are ahead: [{ said, ahead }] (minutes)
//   textAhead(text, now)         the times stated in free text that are ahead; a time in a sentence about
//                                what is still to come ("until 7:00 am", "tomorrow at 9:15 am") is a plan
//   aheadLine(found, what, now)  the refusal, in one sentence
export const SLACK_MIN = 3
const TZ = 'America/Los_Angeles'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MIN = 60e3

/** Epoch ms of a Pacific wall-clock time. */
export function pacificTime(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo, d, h, mi)
  const off = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t
  }
  return guess - off(guess - off(guess))
}
const today = (now) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now)).map((x) => [x.type, Number(x.value)]))
const hour24 = (h, ap) => (Number(h) % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0)
export const clockNow = (now = Date.now()) => new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).replace(' AM', ' am').replace(' PM', ' pm')

const ISO = /(\d{4})-(\d{2})-(\d{2}),? (?:at )?(?:about )?(\d{1,2}):(\d{2}) ?([ap]m)\b/gi
const NAMED = /\b(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,? )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2})(?:,? (\d{4}))?,? (?:at )?(?:about )?(\d{1,2}):(\d{2}) ?([ap]m)\b/gi
const BARE = /\b(\d{1,2}):(\d{2}) ?([ap]m)\b/gi
// the sentence is about what is still to come: its times are plans, not records
const PLAN = /\b(tomorrow|tonight|until|till|by (?:about )?\d|next|resets?|will|due|starts? again|scheduled|planned|expires?|from now|in \d+ (?:min|minutes|hours?))\b/i

/** The times a text states, each as an instant: [{ said, at, dated }]. A bare time is today, or, when
 *  that would be more than six hours ahead, the day before (written after midnight about the evening). */
export function typedTimes(text, now = Date.now()) {
  const out = []
  const taken = []
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x)
  const t = today(now)
  for (const m of String(text).matchAll(ISO)) {
    out.push({ said: m[0], at: pacificTime(+m[1], +m[2] - 1, +m[3], hour24(m[4], m[6]), +m[5]), dated: true, index: m.index })
    taken.push([m.index, m.index + m[0].length])
  }
  for (const m of String(text).matchAll(NAMED)) {
    if (!free(m.index, m.index + m[0].length)) continue
    const mo = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3))
    out.push({ said: m[0], at: pacificTime(m[3] ? +m[3] : t.year, mo, +m[2], hour24(m[4], m[6]), +m[5]), dated: true, index: m.index })
    taken.push([m.index, m.index + m[0].length])
  }
  for (const m of String(text).matchAll(BARE)) {
    if (!free(m.index, m.index + m[0].length) || Number(m[1]) < 1 || Number(m[1]) > 12 || Number(m[2]) > 59) continue
    let at = pacificTime(t.year, t.month - 1, t.day, hour24(m[1], m[3]), +m[2])
    if (at - now > 6 * 3600e3) at = pacificTime(t.year, t.month - 1, t.day - 1, hour24(m[1], m[3]), +m[2])
    out.push({ said: m[0], at, dated: false, index: m.index })
  }
  return out.sort((a, b) => a.index - b.index)
}
const sentenceAt = (text, i) => {
  const s = String(text)
  const a = Math.max(s.lastIndexOf('. ', i), s.lastIndexOf('\n', i), s.lastIndexOf('; ', i), s.lastIndexOf('(', i)) + 1
  const ends = ['. ', '\n', '; ', ')'].map((x) => s.indexOf(x, i)).filter((x) => x >= 0)
  return s.slice(a, ends.length ? Math.min(...ends) : s.length)
}
const ahead = (list, now) => list.filter((x) => x.at > now + SLACK_MIN * MIN).map((x) => ({ said: x.said.trim(), ahead: Math.round((x.at - now) / MIN) }))

/** Times stated in free text (a comment, a proof) that are later than the clock, plans left out. */
export function textAhead(text, now = Date.now()) {
  // "made at 11:25 am, not 1:30 pm as the comment above says": a wrong time quoted to correct it
  const quoted = (x) => /\b(not|instead of|rather than)\s+(?:at\s+)?(?:about\s+)?$/i.test(String(text).slice(Math.max(0, x.index - 20), x.index))
  return ahead(typedTimes(text, now).filter((x) => !PLAN.test(sentenceAt(text, x.index)) && !quoted(x)), now)
}

/** The typed write times of a note that are later than the clock. name: the file's name. */
export function noteAhead(name, body, now = Date.now()) {
  const s = String(body)
  if (name === 'LOG.md') {
    // "## 2026-11-20, 10:46 pm (M1 session)": the time the lines under it were written
    return ahead([...s.matchAll(/^## (\d{4})-(\d{2})-(\d{2}),? (\d{1,2}):(\d{2}) ?([ap]m)/gim)].map((m) => ({ said: m[0].slice(3), at: pacificTime(+m[1], +m[2] - 1, +m[3], hour24(m[4], m[6]), +m[5]) })), now)
  }
  const first = s.split('\n')[0] ?? ''
  if (name === 'NOW.md') return ahead(typedTimes(first, now).filter((x) => x.dated), now) // "# NOW (updated Nov 20, 10:46 pm)"
  if (/^HANDOFF-.*\.md$/.test(name)) {
    // "# Handoff to the M1 session, Friday November 20, 2026 (written by the M4 session at 5:31 pm, ...)"
    const d = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}), (\d{4})/i.exec(first)
    const tm = /\bat (?:about )?(\d{1,2}):(\d{2}) ?([ap]m)\b/i.exec(first)
    if (!d || !tm) return []
    return ahead([{ said: `${d[0]}, ${tm[1]}:${tm[2]} ${tm[3]}`, at: pacificTime(+d[3], MONTHS.indexOf(d[1].toLowerCase().slice(0, 3)), +d[2], hour24(tm[1], tm[3]), +tm[2]) }], now)
  }
  return []
}

/** One sentence refusing what was found. */
export const aheadLine = (found, what, now = Date.now()) =>
  `Refused: ${what} gives ${found.map((f) => `"${f.said}" (${f.ahead} min ahead)`).join(', ')}, later than the clock (${clockNow(now)} Pacific now; ${SLACK_MIN} minutes allowed). Read the time with \`date\` and write that (OLA-324).`

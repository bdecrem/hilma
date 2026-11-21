// The runner's choices, kept pure so runner-test.mjs can check them without a database (OLA-211).
// Bart, Nov 19, 2026: "'venture mode' is supposed to be a hardworking technical cofounder not some
// moron who goes to sleep for no reason and FOREVER." So the runner works the tracker: the top open
// ticket that no live session holds, one run per ticket, the next one after it.
//
//   pickTicket(issues, ctx)   the ticket to start, and why each one above it was passed over
//   plateOrder(text)          the ticket order of the newest private PLATE-*.md
//   limitFrom(out, now)       did a `claude -p` run stop at the plan's usage limit, and when it resets
//   openAt(issues, t)         how many tickets were open at time t (from the tracker's own records)
//   leadLine(...)             the one line `runner.mjs status` prints and the board shows
//   ideaTickets(days)         the latest reviews' idea tickets, which the pick puts right after P0 (OLA-331)
//   unbuiltIdeas(days, issues, day)  earlier reviews' ideas not done or dropped, which stop sweep.mjs post

export const MIN = 60e3
export const CLAIM_TTL = 45 * MIN // a claim not renewed for this long has expired
export const SESSION_DOING_HOLD = 3 * 60 * MIN // while a session is open, a ticket it started this recently is its own
export const IDLE_AFTER = 60 * MIN
export const MAX_FAILS = 2 // runs with no commit and no finish, then a comment and the next ticket
export const MAX_RUNS = 4 // runs on one ticket in all, then the same
const PRI = { P0: 0, P1: 1, P2: 2 }
export const CLAIM_PREFIX = 'claim:'

/** Ticket ids in the order the newest plate lists them (its numbered lines only), and the recurring jobs it names. */
export function plateOrder(text = '') {
  const order = []
  for (const line of text.split('\n')) {
    const m = /^\s*\d+\.\s+(OLA-\d+)/.exec(line)
    if (m && !order.includes(m[1])) order.push(m[1])
  }
  const recurring = text.split('\n').filter((l) => /^recurring/i.test(l.trim())).flatMap((l) => l.match(/OLA-\d+/g) ?? [])
  return { order, recurring }
}

export const isRecurring = (i, recurring = []) => /^(daily|weekly) task\b/i.test(i.title ?? '') || recurring.includes(i.id)

/**
 * The ticket the runner should start. issues: rows of venture_issues; claims: { [id]: { who, at } };
 * tickets: the runner's own record per ticket ({ runs, fails, skippedAt, blockedBy });
 * sessionOpen: an interactive session's heartbeat is fresh.
 */
export function pickTicket(issues, { claims = {}, tickets = {}, order = [], recurring = [], sessionOpen = false, waiters = {}, lanes = {}, building = {}, ideas = [], now = Date.now() } = {}) {
  const passed = []
  const byId = new Map(issues.map((i) => [i.id, i]))
  const age = (iso) => (iso ? now - Date.parse(iso) : Infinity)
  const pos = (id) => (order.includes(id) ? order.indexOf(id) : Infinity)
  // OLA-331: the reviews' daily ideas (ideaTickets) come right after P0, before every other P1 and P2
  const rank = (i) => (i.priority === 'P0' ? 0 : ideas.includes(i.id) ? 1 : 2 + (PRI[i.priority] ?? 9))
  const ipos = (id) => (ideas.includes(id) ? ideas.indexOf(id) : Infinity)
  const cand = issues
    .filter((i) => i.status === 'open' || i.status === 'in_progress')
    .sort((a, b) => rank(a) - rank(b) || ipos(a.id) - ipos(b.id) || pos(a.id) - pos(b.id) || String(a.opened_at).localeCompare(String(b.opened_at)) || a.num - b.num)
  for (const i of cand) {
    const c = claims[i.id]
    const t = tickets[i.id] ?? {}
    if (c && age(c.at) < CLAIM_TTL && c.who !== 'runner') { passed.push({ id: i.id, why: `claimed by ${c.who} ${Math.round(age(c.at) / MIN)} min ago` }); continue }
    // one builder at a time in the server lane (OLA-251): a session's builder holds it, so the runner takes the next ticket whose lane is free
    const lane = laneOf(i, lanes[i.id])
    const holder = lane === 'server' ? laneHolder({ id: i.id, lane: 'server', issues, lanes, building, claims: Object.fromEntries(Object.entries(claims).filter(([, x]) => x.who !== 'runner')), now }) : null
    if (holder) { passed.push({ id: i.id, why: `the server lane is held by ${holder.who} on ${holder.id}` }); continue }
    // the runner yields (OLA-251): a builder already waiting for this lane on a ticket of the same or a higher
    // priority goes first. Same priority counts: on Nov 20 the runner took the lane again with another P0 while
    // two P0 builders had been waiting for it, one for half an hour.
    const before = Object.entries(liveWaiters(waiters, now)).find(([wid, w]) => wid !== i.id && w.lane === lane && (PRI[w.priority] ?? 9) <= (PRI[i.priority] ?? 9))
    if (before && lane === 'server') { passed.push({ id: i.id, why: `${before[1].who} is waiting for the server lane with ${before[0]} (${before[1].priority}), which goes before this ${i.priority}` }); continue }
    if (i.status === 'in_progress' && i.who !== 'runner' && age(i.updated_at) < CLAIM_TTL) { passed.push({ id: i.id, why: `in progress, touched ${Math.round(age(i.updated_at) / MIN)} min ago` }); continue }
    if (sessionOpen && i.status === 'in_progress' && i.who !== 'runner' && age(i.started_at) < SESSION_DOING_HOLD) { passed.push({ id: i.id, why: `started ${Math.round(age(i.started_at) / MIN)} min ago by ${i.who} while a session is open` }); continue }
    if (isRecurring(i, recurring)) { passed.push({ id: i.id, why: 'a recurring job (it runs on its own schedule)' }); continue }
    if (/^bart$/i.test(i.who ?? '')) { passed.push({ id: i.id, why: "Bart's own" }); continue }
    if (t.blockedBy && byId.get(t.blockedBy) && !['done', 'dropped'].includes(byId.get(t.blockedBy).status)) { passed.push({ id: i.id, why: `waits for ${t.blockedBy}` }); continue }
    if (t.waitUntil && Date.parse(t.waitUntil) > now) { passed.push({ id: i.id, why: `waits until ${t.waitUntil.slice(0, 16)}Z (a time, not a ticket or Bart)` }); continue }
    if (t.skippedAt && Date.parse(i.updated_at ?? 0) <= Date.parse(t.skippedAt)) { passed.push({ id: i.id, why: `the runner gave up on it ${new Date(t.skippedAt).toISOString().slice(0, 16)}Z (a comment or an edit puts it back)` }); continue }
    return { pick: i, passed }
  }
  return { pick: null, passed }
}

// ------------------------------------------------------------------ the daily ideas (OLA-331)
// Bart, Nov 20, 11 pm: "They should always be built duh!! So they are immediately implemented".
// Each review (venture_state "sweeps") carries two ideas, each a ticket; they are work, not proposals.
export const IDEA_DAYS = 7 // the reviews whose ideas the runner puts first
/** The idea tickets of the latest reviews, oldest review first (an earlier day's idea that is not
 *  built stops the next review's post, so it goes first); days: the sweeps' `days`. */
export function ideaTickets(days = [], last = IDEA_DAYS) {
  const recent = [...days].filter((d) => d?.day).sort((a, b) => b.day.localeCompare(a.day)).slice(0, last).reverse()
  return [...new Set(recent.flatMap((d) => [d.ideas?.kit?.issue, d.ideas?.ola?.issue]).filter((x) => /^OLA-\d+$/.test(x ?? '')))]
}
/** Was this ticket dropped with Bart's words? Its proof reads "dropped: Bart: ..." (issues.mjs drop
 *  refuses any other drop of an idea ticket), or he dropped it on the board (bartDrops: ids). */
export const droppedByBart = (i, bartDrops = new Set()) => i?.status === 'dropped' && (/^dropped:\s*bart:\s*\S/i.test(i.proof ?? '') || bartDrops.has(i.id))
/** The ideas of reviews before `day` that are not built: [{ id, day, side, status, title }]. Built is done,
 *  or dropped by Bart. An idea with no ticket, a ticket the tracker does not hold, and a drop without his
 *  words all count as not built. */
export function unbuiltIdeas(days = [], issues = [], day, bartDrops = new Set()) {
  const byId = new Map(issues.map((i) => [i.id, i]))
  const out = []
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    if (!d?.day || d.day >= day || !d.ideas) continue
    for (const side of ['kit', 'ola']) {
      const id = d.ideas[side]?.issue
      if (!/^OLA-\d+$/.test(id ?? '')) { out.push({ id: null, day: d.day, side, status: 'no ticket', title: String(d.ideas[side]?.text ?? '(no idea written)').slice(0, 90) }); continue }
      if (out.some((o) => o.id === id)) continue
      const i = byId.get(id)
      if (i?.status === 'done' || droppedByBart(i, bartDrops)) continue
      out.push({ id, day: d.day, side, status: !i ? 'not in the tracker' : i.status === 'dropped' ? "dropped without Bart's words" : i.status, title: i?.title ?? '' })
    }
  }
  return out
}
/** What is wrong with the tickets an entry names as its ideas (OLA-331), [] when nothing: each ticket was
 *  opened on or after the review's day, and was not finished before the review was first posted (now,
 *  for a first post); a repost that names another ticket for an idea is refused unless the old one is
 *  done or dropped by Bart. entry: the entry; prev: the stored entry of that day or null. */
export function ideaTicketProblems(entry, prev, issues = [], { now = Date.now(), bartDrops = new Set() } = {}) {
  const byId = new Map(issues.map((i) => [i.id, i]))
  const firstAt = prev ? Date.parse(prev.firstAt ?? prev.at) : now
  const bad = []
  for (const side of ['kit', 'ola']) {
    const id = entry.ideas?.[side]?.issue
    const t = byId.get(id)
    if (!t) continue // a missing ticket is named by the other checks
    if (t.opened_at && pacificDay(Date.parse(t.opened_at)) < entry.day) bad.push(`${id} was opened on ${pacificDay(Date.parse(t.opened_at))}, before the review of ${entry.day}: an idea is a new ticket, opened that day`)
    if (['done', 'dropped'].includes(t.status) && t.finished_at && Date.parse(t.finished_at) < firstAt) bad.push(`${id} was already ${t.status} (${t.finished_at.slice(0, 16)}Z) before this review was ${prev ? 'first posted' : 'posted'}: an idea is work still to do`)
    const was = prev?.ideas?.[side]?.issue
    if (prev && was && was !== id) {
      const o = byId.get(was)
      if (!(o?.status === 'done' || droppedByBart(o, bartDrops))) bad.push(`the ${side === 'kit' ? 'Kit' : 'Ola'} idea of ${entry.day} named ${was} when it was posted, and this repost names ${id}: ${was} is ${o ? o.status : 'not in the tracker'}, so it stays the idea until it is done or Bart drops it`)
    }
  }
  return bad
}

/** After a run: what to record for the ticket. made: commits naming it landed on main during the run. */
export function afterRun(prev = {}, { status, made, blockedBy = null, waitUntil = null, now = Date.now() }) {
  if (['done', 'dropped', 'waiting'].includes(status)) return { next: { runs: 0, fails: 0 }, giveUp: false, outcome: status }
  // "RUNNER: waiting until <time>": blocked by the clock (an allowance that resets, a date). Not a failed run.
  if (waitUntil && Date.parse(waitUntil) > now) return { next: { runs: prev.runs ?? 0, fails: 0, waitUntil: new Date(Date.parse(waitUntil)).toISOString() }, giveUp: false, outcome: `waits until ${waitUntil}` }
  if (blockedBy) return { next: { ...prev, blockedBy }, giveUp: false, outcome: `blocked by ${blockedBy}` }
  const runs = (prev.runs ?? 0) + 1
  const fails = made ? 0 : (prev.fails ?? 0) + 1
  const giveUp = fails >= MAX_FAILS || runs >= MAX_RUNS
  return { next: { runs, fails, ...(giveUp ? { skippedAt: new Date(now).toISOString() } : {}) }, giveUp, outcome: made ? 'progress' : 'not finished' }
}

// ------------------------------------------------------------------ the plan's usage limit
// How `claude -p` (2.1.x) says it: with --output-format stream-json a rate_limit_event whose status is
// "rejected" carries resetsAt (epoch seconds); the result text reads "You've hit your session limit ·
// resets 2am (America/Los_Angeles)" (or "weekly limit · resets Nov 21, 5pm"); older builds wrote
// "Claude AI usage limit reached|<epoch>". Anything else that stops a run is not the limit.
const LIMIT_TEXT = /(you['’]ve hit your [a-z0-9 -]*limit|usage limit reached|you['’]re out of (?:extra )?usage|[0-9]+-hour limit reached|weekly limit reached)/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Epoch ms of a wall-clock time in a time zone. */
export function zonedTime(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo, d, h, mi)
  const off = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t
  }
  const first = guess - off(guess)
  return guess - off(first)
}
const partsIn = (t, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]))

/** "2am", "2:30 pm", "Nov 21, 5pm", "Nov 21 at 5pm", each with an optional "(Area/City)": the next such moment after now. */
export function parseReset(s, now = Date.now()) {
  const m = /resets?\s+(?:at\s+|on\s+)?(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?:\s*\(([A-Za-z_]+\/[A-Za-z_/]+|UTC)\))?/i.exec(s)
  if (!m) return null
  const tz = m[6] ?? 'America/Los_Angeles'
  let h = Number(m[3]) % 12
  if (m[5].toLowerCase() === 'pm') h += 12
  const mi = Number(m[4] ?? 0)
  const today = partsIn(now, tz)
  if (m[1]) {
    const mo = MONTHS.indexOf(m[1].toLowerCase())
    if (mo < 0) return null
    let y = Number(today.year)
    let t = zonedTime(y, mo, Number(m[2]), h, mi, tz)
    if (t < now - 86400e3) t = zonedTime(y + 1, mo, Number(m[2]), h, mi, tz)
    return t
  }
  let t = zonedTime(Number(today.year), Number(today.month) - 1, Number(today.day), h, mi, tz)
  if (t <= now) t = zonedTime(Number(today.year), Number(today.month) - 1, Number(today.day) + 1, h, mi, tz)
  return t
}

/** null when the run did not stop at the usage limit; else { resetsAt (ms or null), text }. Only the
 *  CLI's own words count (the rate-limit event, an error result, lines that are not JSON): what the
 *  agent read or wrote during the run (a ticket about limit messages, say) never does. */
export function limitFrom(out = '', now = Date.now()) {
  let resetsAt = null
  let text = ''
  const own = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    if (!line.startsWith('{')) { own.push(line); continue }
    let j
    try { j = JSON.parse(line) } catch { own.push(line); continue }
    if (j.type === 'rate_limit_event' && j.rate_limit_info?.status === 'rejected') {
      resetsAt = j.rate_limit_info.resetsAt ? j.rate_limit_info.resetsAt * 1000 : resetsAt
      text ||= `${j.rate_limit_info.rateLimitType ?? 'usage'} limit reached`
    }
    if (j.type === 'result' && (j.is_error || j.subtype !== 'success')) own.push(String(j.result ?? ''))
  }
  const said = own.join('\n')
  const m = LIMIT_TEXT.exec(said)
  if (m) text = said.slice(m.index, m.index + 200).split('\n')[0].trim()
  if (!text) return null
  if (!resetsAt) {
    const epoch = /limit reached\|(\d{10})/i.exec(said)
    if (epoch) resetsAt = Number(epoch[1]) * 1000
  }
  if (!resetsAt) resetsAt = parseReset(text, now) ?? (m ? parseReset(said.slice(m.index), now) : null)
  if (resetsAt && resetsAt < now - 5 * MIN) resetsAt = null
  return { resetsAt, text }
}

// ------------------------------------------------------------------ the count and the line
const closedBy = (i, t) => (i.status === 'done' || i.status === 'dropped') && i.finished_at && Date.parse(i.finished_at) < t
/** Tickets open at time t: opened before it, and not finished (done or dropped) before it. */
export const openAt = (issues, t) => issues.filter((i) => Date.parse(i.opened_at) < t && !closedBy(i, t)).length
/** Midnight Pacific at the start of a Pacific day (YYYY-MM-DD). */
export const pacificMidnight = (day) => zonedTime(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 0, 0, 'America/Los_Angeles')
export const pacificDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
/** "Open issues: N (yesterday: M)": N now (or at the end of `day`), M at the end of the day before. */
export function openCounts(issues, now = Date.now(), day = null) {
  const today = pacificDay(now)
  const d = day ?? today
  const end = d >= today ? now : pacificMidnight(new Date(pacificMidnight(d) + 36 * 3600e3).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }))
  return { n: openAt(issues, end), yesterday: openAt(issues, pacificMidnight(d)) }
}

const clock = (t) => new Date(t).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).replace(' AM', ' am').replace(' PM', ' pm')
const when = (t, now) => (pacificDay(t) === pacificDay(now) ? clock(t) : `${new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}, ${clock(t)}`)

/**
 * Who is working, in one line. runner: venture_state "runner"; claims: { [id]: { who, at, since } };
 * limit: venture_state "runner_limit". Returns { text, idle, working }.
 */
export function leadLine(issues, { runner = null, claims = {}, limit = null, now = Date.now() } = {}) {
  const open = issues.filter((i) => ['open', 'in_progress', 'waiting'].includes(i.status))
  const by = ['P0', 'P1', 'P2'].map((p) => `${open.filter((i) => i.priority === p).length} ${p}`).join(', ')
  const last = issues.filter((i) => i.status === 'done' && i.finished_at).sort((a, b) => b.finished_at.localeCompare(a.finished_at))[0]
  const live = Object.entries(claims).filter(([, c]) => now - Date.parse(c.at) < CLAIM_TTL)
  const runStale = runner?.running && now - Date.parse(runner.started) > 3 * 60 * MIN
  let working = null
  if (runner?.running && !runStale && runner.ticket) working = { id: runner.ticket, since: runner.started, who: 'runner' }
  else if (live.length) { const [id, c] = live.sort((a, b) => Date.parse(a[1].since ?? a[1].at) - Date.parse(b[1].since ?? b[1].at))[0]; working = { id, since: c.since ?? c.at, who: c.who } }
  const recent = [runner?.ended, runner?.started, ...Object.values(claims).map((c) => c.at)].filter(Boolean).map((t) => Date.parse(t))
  const lastActive = recent.length ? Math.max(...recent) : null
  const urgent = open.some((i) => i.priority === 'P0' || i.priority === 'P1')
  const busy = !!working || (runner?.running && !runStale)
  const idle = urgent && !busy && (!lastActive || now - lastActive > IDLE_AFTER)
  const parts = [`${open.length} open (${by})`, last ? `last finished ${last.id} ${when(last.finished_at, now)}` : 'nothing finished yet']
  if (working) parts.push(`Working on ${working.id} since ${when(working.since, now)}${working.who !== 'runner' ? ` (${working.who})` : ''}${live.length > 1 ? `, ${live.length - 1} more claimed` : ''}`)
  else if (runner?.running && !runStale) parts.push(`Running since ${when(runner.started, now)} (${(runner.why ?? []).join('; ').slice(0, 80)})`)
  else if (idle) parts.push(`IDLE since ${lastActive ? when(lastActive, now) : 'ever'}`)
  else parts.push(`idle since ${lastActive ? when(lastActive, now) : 'ever'}`)
  if (limit?.until && Date.parse(limit.until) > now) parts.push(`${limit.kind === 'error' ? 'paused after an error' : 'limit reached'}, starts again ${when(Date.parse(limit.until), now)}`)
  return { text: parts.join(' · '), idle, working, lastActive }
}

// ------------------------------------------------------------------ the request tests' cases (OLA-251, OLA-259)
/** The case a check names as its evidence ("case <id>@<place>"), or null. */
export const caseKey = (evidence) => /^case (\S+)/.exec(evidence ?? '')?.[1] ?? null
/** What one case of the request tests' result file (~/ola-staging/asks-latest.json, `cases` by
 *  "<id>@<place>") says now: { state: works | sometimes | fails | not run | unknown, release, at, tries }.
 *  "works" is passing with no fail between its passes; a case the file does not hold, spelled even
 *  slightly differently, is "unknown", never "works". */
export function caseState(key, cases) {
  const c = key && cases ? cases[key] : null
  if (!c) return { state: 'unknown', release: null, at: null, tries: null }
  const v = String(c.verdict ?? '')
  const st = String(c.status ?? '')
  // "2 of 3 passed": a fail between the passes, also in result files written before the verdict field
  const t = /^(\d+) of (\d+)/.exec(String(c.tries ?? ''))
  const gap = t && Number(t[1]) < Number(t[2])
  const state = /sometimes/i.test(v) || /sometimes/i.test(st) || (st === 'passing' && gap) ? 'sometimes' : st === 'passing' ? 'works' : /not run/i.test(st) ? 'not run' : 'fails'
  return { state, release: c.release ?? null, at: c.at ?? null, tries: c.tries ?? null }
}
/** The test server's releases a text names (12 hex characters, like da4380403a13). */
export const releasesIn = (text) => [...new Set(String(text ?? '').match(/\b[0-9a-f]{12}\b/g) ?? [])]

// ------------------------------------------------------------------ lanes (OLA-251, Nov 20)
// One builder at a time on the server's code, counting the runner on the mini. On Nov 20 three
// builders at once overwrote each other's work and the test server refused updates. A ticket's lane
// comes from the ticket only: server (web, model, security, design, and ops tickets about Ola's server
// by their title), apps (the Mac and iPhone apps), tools (this project's own scripts and notes:
// everything else); `issues.mjs edit <id> --lane <lane>` changes it on the ticket, on its thread.
// A claim has a role (_who.mjs): builder and runner take the lane, checker, investigator and hold do
// not; any claim whose ticket gets commits that change the server's code while it is held counts as a
// builder there whatever its role (`building`). `issues.mjs start/claim` and the runner refuse a second
// builder in the server lane; a builder may wait for it (`start --wait`), and the runner yields to a
// waiting builder whose ticket is of a higher priority than the runner's next one.
export const LANES = ['server', 'apps', 'tools']
export const SERVER_DIRS = ['apps/activist-ai/'] // the server's code
export const SERVER_EXCEPT = ['apps/activist-ai/apple/'] // the Mac and iPhone apps, in the apps lane
export const isServerFile = (f) => SERVER_DIRS.some((d) => f.startsWith(d)) && !SERVER_EXCEPT.some((d) => f.startsWith(d))
const SERVER_WORDS = /\b(ola|ola\.cx|app\.ola|sites\.ola|test server|the mini|project box(es)?|front ?desk|gateway|workspace|opencode|the asks|request tests?|deploy|sealed)\b/i
export function laneOf(issue, onTicket = null) {
  if (onTicket && LANES.includes(onTicket)) return onTicket
  if (!issue) return 'tools'
  if (issue.area === 'apps') return 'apps'
  if (['web', 'model', 'security', 'design'].includes(issue.area)) return 'server'
  if (issue.area === 'ops' && SERVER_WORDS.test(issue.title ?? '')) return 'server' // the title only: descriptions mention Ola everywhere
  return 'tools'
}
const ROLE_WORDS = ['builder', 'checker', 'investigator', 'hold', 'runner']
/** The role of a claim: its own `role`, else its name when that IS a role word, lead/kit/bart = hold, anyone else a builder. */
export const claimRole = (c) => (c?.role && ROLE_WORDS.includes(c.role) ? c.role : ROLE_WORDS.includes(String(c?.who ?? '').trim().toLowerCase()) ? String(c.who).trim().toLowerCase() : /^(lead|kit|bart)$/i.test(String(c?.who ?? '').trim()) ? 'hold' : 'builder')
/** Who holds the lane of ticket `id` now, other than `id` itself: { id, who, lane, why } or null.
 *  issues: rows (at least the claimed tickets); claims: { [id]: { who, role?, at } }; lanes: { [id]: lane set on the ticket };
 *  building: { [id]: "why" } for claims whose ticket got commits changing the server's code while held. */
export function laneHolder({ id, lane, issues = [], claims = {}, lanes = {}, building = {}, now = Date.now() }) {
  if (lane !== 'server') return null
  const byId = new Map(issues.map((i) => [i.id, i]))
  for (const [cid, c] of Object.entries(claims)) {
    if (cid === id || !(now - Date.parse(c.at) < CLAIM_TTL)) continue
    const role = claimRole(c)
    if ((role === 'builder' || role === 'runner') && laneOf(byId.get(cid), lanes[cid]) === 'server') return { id: cid, who: c.who, lane: 'server', why: `${role} on a ticket in the server lane` }
    if (building[cid]) return { id: cid, who: c.who, lane: 'server', why: `${role}, and ${building[cid]}` }
  }
  return null
}
export const laneSentence = (h, lane = 'server') => `Refused: ${h.who} is building ${h.id} in the ${lane} lane (Ola's server code; ${h.why}), and only one builder works there at a time. Wait for it (add --wait, and the tracker starts you when the lane is free), take another ticket, or start beside it with --beside "<the folders you will change>" when its recent commits touch none of them.`
/** Builders waiting for a lane: { [id]: { who, lane, priority, at } } with a fresh `at`. */
export const WAIT_PREFIX = 'wait:'
export const WAIT_TTL = 3 * MIN
export const liveWaiters = (waiters = {}, now = Date.now()) => Object.fromEntries(Object.entries(waiters).filter(([, w]) => now - Date.parse(w.at) < WAIT_TTL))

// ------------------------------------------------------------------ updates of the test server (OLA-272, Nov 20)
// From 10:30 am to 1:02 pm the runner started five updates of the test server (two refused), each
// holding the mini's one test slot about twenty minutes: a checker waited 24 minutes, two builders
// about 25 each, and one update changed the version under a checker in the middle of its check.
// So the runner updates only when all three hold:
//   (a) a ticket is marked ready (issues.mjs ready) and its newest commit is not in the live version;
//   (b) the last update attempt (deployed or refused) is at least DEPLOY_GAP old, or a waiting ticket is a P0;
//   (c) no checker recorded a check, and no checker's claim was renewed, in the last CHECKER_QUIET.
export const DEPLOY_GAP = 45 * MIN
export const CHECKER_QUIET = 15 * MIN
/** pending: [{ id, priority }] ready tickets whose commits are not live; lastAttempt: ISO or null;
 *  checkerAt: [{ id, at, what }] recent check results and checker claims. Returns { ok, why, nextAllowed }. */
export function deployGate({ pending = [], lastAttempt = null, checkerAt = [], now = Date.now() } = {}) {
  const gapLeft = lastAttempt ? Date.parse(lastAttempt) + DEPLOY_GAP - now : -1
  const p0 = pending.find((t) => t.priority === 'P0')
  const busy = checkerAt.filter((c) => now - Date.parse(c.at) < CHECKER_QUIET).sort((a, b) => b.at.localeCompare(a.at))[0]
  const quietAt = busy ? Date.parse(busy.at) + CHECKER_QUIET : now
  const nextAllowed = new Date(Math.max(now, quietAt, p0 ? now : lastAttempt ? Date.parse(lastAttempt) + DEPLOY_GAP : now)).toISOString()
  if (!pending.length) return { ok: false, why: 'no ticket is ready with commits that are not in the live version', nextAllowed }
  if (gapLeft > 0 && !p0) return { ok: false, why: `the last update attempt was ${Math.round((now - Date.parse(lastAttempt)) / MIN)} min ago (at least ${DEPLOY_GAP / MIN} between updates unless a P0 waits; waiting: ${pending.map((t) => `${t.id} ${t.priority}`).join(', ')})`, nextAllowed }
  if (busy) return { ok: false, why: `a checker is at work on the live server: ${busy.what} ${Math.round((now - Date.parse(busy.at)) / MIN)} min ago (an update waits ${CHECKER_QUIET / MIN} min after the last)`, nextAllowed }
  return { ok: true, why: `${pending.map((t) => `${t.id} ${t.priority}`).join(', ')} ready and not live; ${lastAttempt ? `last attempt ${Math.round((now - Date.parse(lastAttempt)) / MIN)} min ago` : 'no attempt on record'}${p0 && gapLeft > 0 ? ' (a P0 waits, so the 45 minutes do not apply)' : ''}; no checker in the last ${CHECKER_QUIET / MIN} min`, nextAllowed }
}

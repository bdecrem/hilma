// What app.kochitolabs.com shows, read in one place (2026-11-17). Bart: "reorganize
// app.kochitolabs.com, to center the project, OLA ... this page lacks structure - make it a better
// more useful dashboard", "make sure it is updated at least every few hours", and "there should be
// the equivalent of an issue tracker so i can see everything that was done yesterday".
//   - the journal (venture_docs "journal", the lead's words: Now, Decided, To be decided, Numbers)
//   - the issue tracker (venture_issues, venture_commits; schema 011; scripts/venture/issues.mjs)
//   - the mini's live status (venture_state "ola_status", pushed every 10 minutes by the alarm,
//     apps/activist-ai/ops/watch.mjs, through /api/venture/status)
//   - Independence (venture_state "steers" and "steer_replay")
//   - the 30-day plan (venture_docs, its "### Week N, <dates>: <title>" sections)
// Every part may be missing (a table not created yet, a status never pushed): the page then says so
// in its place instead of failing.
import { f2Supabase } from '@/lib/f2/supabase'

export type Area = 'web' | 'apps' | 'model' | 'security' | 'ops' | 'voice' | 'design' | 'board'
export const AREAS: Record<Area, string> = { web: 'Web app', apps: 'Mac and phone apps', model: 'Model and skills', security: 'Security', ops: 'Operations', voice: 'Voice', design: 'Design', board: 'The board' }
export type Status = 'open' | 'in_progress' | 'waiting' | 'done' | 'dropped'
export type Commit = { sha: string; subject: string; at: string; issue_id?: string | null }
/** Who built an issue (OLA-300): Ola, when one of its commits was made by the hand-off
 *  (apps/activist-ai/tickets/handoff.mjs writes "Built by Ola on <model> (Together)" in the body);
 *  null when Kit and its builders did. */
export type BuiltBy = { by: 'ola'; model: string } | null
export const OLA_BUILT = /^Built by Ola on (\S+)/m
export const olaModel = (body: string): string | null => body.match(OLA_BUILT)?.[1] ?? null
export type Issue = {
  id: string
  num: number
  title: string
  what: string
  area: Area
  priority: 'P0' | 'P1' | 'P2' | 'P4'
  status: Status
  who: string
  week: number | null
  opened_at: string
  started_at: string | null
  finished_at: string | null
  day: string | null
  links: { label: string; url?: string; doc?: string }[]
  proof: string
  updated_at: string
  commits: Commit[]
  builtBy?: BuiltBy
  /** A tracker issue (OLA-505, schema 013): not work itself, a list of other issues with a note each; null on an ordinary issue. */
  tracker?: TrackerEntry[] | null
}
export type TrackerEntry = { id: string; note: string }
export const isTracker = (i: Pick<Issue, 'tracker'>): boolean => Array.isArray(i.tracker)
/** A tracker issue's list as its page shows it: each listed issue with its status, title and note. */
export type TrackerItem = { id: string; note: string; title: string | null; status: Status | null }
/** One line of an issue's Activity (schema 012): a comment, a status change or an edit, by a board
 *  account (via 'board', new for Kit until seen_by_kit_at is set) or by Kit's command line ('cli'). */
export type Activity = {
  id: number
  issue_id: string
  at: string
  who: string
  via: 'board' | 'cli'
  kind: 'comment' | 'status' | 'edit' | 'opened'
  field: string | null
  old_value: string | null
  new_value: string | null
  body: string
  seen_by_kit_at: string | null
}
export type LiveStatus = {
  at: string
  deployed: { commit: string; at: string; suites: Record<string, string> } | null
  checks: { passed: number; total: number } | null
  /** The newest automatic check of main (OLA-84): by 'check', 'deploy', or 'same' (no Ola change since a checked commit). */
  ci?: { commit: string; at: string | null; ok: boolean; by: string | null; suites: Record<string, string>; why: string | null } | null
  /** The asks (OLA-231) and, inside, everything Ola can be asked to do by place (OLA-232, evals/asks/abilities.json). */
  asks?: {
    release?: string | null
    at?: string | null
    /** Counts by status; "works sometimes" is two passes with a fail between (OLA-251). */
    summary?: { passing: number; worksSometimes: number; stoppedWorking: number; notWorkingYet: number; notRun: number } | null
    worksSometimes?: { case: string; ticket: string | null; tries: string | null }[]
    stoppedWorking?: { case: string; ticket: string | null; tries: string | null }[]
    notWorkingYet?: { case: string; ticket: string | null; tries: string | null }[]
    abilities?: { lines: number; passing: number; sometimes?: number; failing: number; notRun: number; notOffered: number; noCase: number } | null
  } | null
  alarm: { state: 'ok' | 'warn' | 'alarm'; says: string[]; warns: string[]; runAt: string | null }
  disk: { freeGB: number } | null
  memory: string | null
  projects: { running: number } | null
  parts: Record<string, boolean>
}
export type SteerItem = { time: string; label: 'steer' | 'maybe'; class: string; repeat: boolean; quote: string }
export type SteerDay = { day: string; messages: number; steers: number; repeats: number; maybes: number; rate: number | null; between: number | null; items: SteerItem[] }
/** The replay test (scripts/venture/steer-replay.mjs, OLA-175): each past correction put to a fresh
 *  session with Kit's rules and without, every night on the mini. `weak` are the cases that still
 *  fail with the rules; `history` one line per run. */
export type ReplayCase = { id: string; source: string; title: string; weakness: string | null; why: string[] }
export type Replay = { at: string; kind?: string; cases: number; graded?: number; with_rules: { passed: number; tries: number }; without_rules: { passed: number; tries: number }; prevented: number; prevented_without: number; weak?: ReplayCase[]; history?: { at: string; kind?: string; cases: number; prevented: number; prevented_without: number }[] }
/** The last attempt at a replay run (venture_state "steer_replay_attempt"): a night that failed shows. */
export type ReplayAttempt = { at: string; ended?: string; ok?: boolean; running?: boolean; nightly?: boolean; only?: string[]; why?: string }
export type PlanWeek = { n: number; title: string; from: string; to: string; items: string[]; demo: string }
export type Tagged = { tag: string; text: string }
export type BoardData = {
  now: string
  today: string // Pacific
  journal: {
    at: string | null // when the lead last wrote it
    now: string
    project: { title: string; text: string; links: string[] }
    numbers: string[]
    decided: Tagged[]
    toDecide: Tagged[]
    parked: string[]
    waiting: string[]
    checkin: string[]
    days: Record<string, { time: string; text: string }[]> // the lead's day notes, by ISO date
  }
  issues: Issue[] | null // null: the tracker's tables are not there yet
  unsorted: Commit[]
  commitSync: { at: string; ok: boolean; why?: string } | null
  status: LiveStatus | null
  independence: { days: SteerDay[]; replay: Replay | null; replayAttempt: ReplayAttempt | null }
  plan: { slug: string; title: string; start: string; end: string; weeks: PlanWeek[] } | null
  notes: NoteLink[]
  learning: Learning | null // venture_state "learning", written by scripts/venture/learning.mjs
  sweeps: Sweeps | null // venture_state "sweeps", written by scripts/venture/sweep.mjs post
  learnNote: { slug: string; title: string; lede: string } | null // the note on the two learning loops: its title and first paragraph, shown at the top of Learning
  apiUse: Record<string, Record<string, { calls: number; in: number; write: number; read: number; out: number }>> | null // venture_state "api_use" (the meter in talk.ts), by day and kind
  lead: Lead // who is working right now (the runner on the mini, or a session's claim), or idle since when
  claims: Record<string, Claim> // the live claims (venture_state "claim:OLA-n", renewed in the last 45 minutes), by ticket
}
/** Who is working (OLA-211), the line `runner.mjs status` prints: the runner's record (venture_state
 *  "runner"), the live claims ("claim:OLA-n", 45 minutes) and the usage-limit pause ("runner_limit").
 *  Same rule as leadLine() in scripts/venture/_plate.mjs: idle in red when P0/P1 tickets are open and
 *  no run and no claim in the last hour. */
export type Lead = {
  working: { id: string; since: string; who: string } | null
  idle: boolean
  lastActive: string | null
  paused: { kind: 'limit' | 'error'; until: string; text: string } | null
}
export type RunnerState = { running?: boolean; ticket?: string | null; started?: string; ended?: string; why?: string[] }
export type Claim = { who: string; role?: string; since?: string; at: string }
/** venture_state "learning" (Bart, Nov 18: "a widget / section that tracks Agent Learning"): Kit,
 *  the share of Bart's corrections that were new, not repeats; Ola, its own model's score on the
 *  test tasks as a share of Claude's. Missing or older than a day: the board says so. */
export type Learning = {
  at: string
  kit: { percent: number; label: string; corrections: number; repeats: number; latest_day?: { day: string; corrections: number; repeats: number }; by_day?: { day: string; corrections: number; repeats: number }[]; steers?: { day: string; rate: number }; replay?: { prevented: number; of: number }; goal: number; errors?: { day: string; n: number; repeats: number; total: number; since: string }; escapes?: { total: number; by_day: { day: string; n: number }[]; latest: { day: string; n: number } | null; label: string }; only_written?: { id: string; name: string; seen: number; stuck: string | null }[] | null; owed?: { n: number; overdue: number; oldest_days: number | null; list: { ref: string; weakness: string; name: string; issue: string; need: number; since: string }[]; label: string }; overrides?: { day: string; n: number; label: string } }
  ola: { percent: number; label: string; model: string; own?: { passed: number; runs: number; rate: number }; claude?: { passed: number; runs: number; rate: number }; measured?: string; rounds?: { date: string; model: string; rate: number; share: number }[]; open?: string[]; goal: number; switches?: Switches; faults?: Faults }
  weaknesses?: Weakness[]
  doc: string
}
/** Switches to Claude (OLA-157; apps/activist-ai/frontdesk/switches.mjs, read by scripts/venture/
 *  learning.mjs): requests handed to Claude or the hosted model right after Ola's own model had the
 *  conversation's last turn, over the last `days` days. Labels and counts only, never a request. */
export type Switches = {
  at: string
  days: number
  requests: number
  switches: number
  per100: number | null
  to: { claude: number; hosted: number }
  reasons: { asked: number; stuck: number; always: number; unknown: number }
  products: { mac: number; iphone: number; cli: number; web: number }
  kinds: { kind: string; words: string; n: number }[]
  largest: { kind: string; words: string; n: number } | null
  tasks: { copies: number; candidates: number; waiting: number; kept: number; labels_only: number }
  by_day: { day: string; requests: number; switches: number }[]
}
/** Ola's own failures (OLA-235; apps/activist-ai/frontdesk/faults.mjs, read by scripts/venture/
 *  learning.mjs): requests where Ola told the person it cannot, a step failed, or the request stopped,
 *  by kind, over the last `days` days; and answers people marked "This was wrong". Labels and counts only. */
export type Faults = {
  at: string
  days: number
  requests: number
  turns: number
  per100: number | null
  types: { refusal: number; step: number; run: number }
  kinds: { kind: string; type: 'refusal' | 'step' | 'run'; words: string; n: number }[]
  largest: { kind: string; words: string; n: number } | null
  wrong: { marked: number; cases: number; waiting: number }
  by_day: { day: string; turns: number; refusal: number; step: number; run: number }[]
}
/** One named weakness of Kit or of Ola (scripts/venture/_weak.mjs; Bart, Nov 18: "a system that gets
 *  smarter and better each day by studying what it did wrong, how to prevent that same
 *  mistake/weakness"). Every correction and sweep finding is filed under one. open: no guard the
 *  system enforces; guarded: an enforced guard and not seen since; back: seen again after it. */
export type Weakness = { id: string; side: 'kit' | 'ola'; name: string; what: string; seen: number; first: string | null; last: string | null; by_day: Record<string, number>; came_back: number; guard: { day: string; what: string; enforced: boolean } | null; guards: number; status: 'open' | 'guarded' | 'back'; held_days: number | null; quiet_days: number | null; bet: { text: string; issue?: string | null } | null; replay?: { at: string; cases: number; prevented: number; failing: { id: string; title: string; since: string; why: string }[] } | null }

/** The daily sweep (Bart, Nov 18: "a new daily 'agentic sweep' where the agent (you) take a look at
 *  all the things that happened that day and, from that, improves its memory and other systems for
 *  both (a) the management of the project ("kit") and (b) orchestration, skills and how the ola
 *  agents work ... a page with updates on it on most date ... with one or more headline numbers").
 *  One entry per day, newest first; the procedure is apps/venture/SWEEP.md. A change names what was
 *  seen, what was changed and where; "enforced" means the system now does it (a hook, a check, a
 *  test, code), as opposed to a note Kit has to remember. */
export type SweepChange = { saw: string; changed: string; where: string; enforced?: boolean; issue?: string; weakness?: string }
/** One idea a day for each side (Bart, 2026-11-18: "daily loop for kit and Ola each to think of one
 *  idea or improvement to make the overall system and the code engine work better. Notify me each
 *  day when that happened. Document on the learning page"). Each has its own ticket; `told` is when
 *  the day's two ideas were texted to Bart. */
export type SweepIdea = { text: string; why: string; issue?: string }
export type Sweep = {
  day: string // Pacific
  at: string
  by: string
  summary: string
  quiet?: boolean // nothing happened that day
  read: { n: string; what: string }[] // what the sweep looked at
  kit: SweepChange[]
  ola: SweepChange[]
  open: { text: string; issue?: string }[] // found, not fixed that day
  pattern?: string // what the day's findings have in common, and what that says
  build?: { text: string; issue?: string } // the one thing to build next that would remove a whole weakness
  ideas?: { kit: SweepIdea; ola: SweepIdea; told?: string }
  /** Nov 19 to Nov 25, 2026 (OLA-182; Bart: "add a daily task for the next week, then review if
   *  useful: improvements to the learning system"): the day's one improvement to the learning
   *  system itself, and on Nov 26 the review. */
  learning?: { changed: string; why: string; where: string; enforced?: boolean; issue?: string }
  learningReview?: { text: string; issue?: string }
  /** The tracker's open count when the entry was posted, and at the end of the day before (OLA-212;
   *  sweep.mjs post computes both from the records). Older entries have none: the page counts them. */
  openIssues?: { n: number; yesterday: number }
  /** Since Nov 21 (OLA-213): Bart's requests that day, each matched to a ticket by requests.mjs; the
   *  tickets opened for the requests that had none. sweep.mjs post copies it from the tracker's state. */
  requests?: { n?: number; matched?: number; done?: number; answered?: number; opened: string[]; at: string; failed?: string; why?: string; early?: { day: string; at: string; why: string }[] }
  /** Since Nov 20 (OLA-251): what the review removed, merged or corrected in the notes that day,
   *  checked against what really happened. The review cleans the notes instead of adding rules. */
  cleaned?: { did: 'removed' | 'merged' | 'corrected'; what: string; where: string }[]
  /** Since Nov 20 (OLA-245): the day's shares of the models by output, and each stretch where the lead
   *  session, on its more expensive model, did reading and writing that an Opus agent could have done. */
  models?: { shares: { model: string; share: number }[]; rule: string; stretches: { at: string; calls: number; what: string }[]; note?: string }
  /** Since Nov 20 (OLA-251, third pass): the day's ways around a guard, from the tracker's record
   *  (issues.mjs overrides); sweep.mjs post stores them itself, the author cannot leave them out. */
  overrides?: { count: number; list: { at: string; ticket: string | null; what: string; caller: string; tool?: string }[] }
}
export type Sweeps = { at: string; since: string; days: Sweep[] }

export const PLAN_SLUG = 'ola-30-day-plan-2026-11-16'
export const LEARN_SLUG = 'how-we-learn' // the note "Learning loops: the builder (Kit) and the harness (Ola)"; the address keeps its first name
export const pacificDay = (t: number | string | Date = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

// The journal: "## Now" (a paragraph), "## Numbers", "## Waiting on you", "## Parked, your call",
// "## Check-in list" (lists), "## Decided" and "## To be decided" ("- **date** what"), and one
// "## <Weekday>, <Month> <day>" per day of "- **time** what": the lead's day notes, shown folded
// under that day's Done (the tracker is the record of what was done; the notes are the story).
export function parseJournal(body: string) {
  const sections: { title: string; lines: string[] }[] = []
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), lines: [] })
    else if (sections.length && line.trim()) sections[sections.length - 1].lines.push(line.trim())
  }
  const get = (t: string) => sections.find((s) => s.title === t)
  const items = (t: string) => (get(t)?.lines ?? []).filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  const tagged = (t: string) => items(t).map((l) => { const m = l.match(/^\*\*([^*]+)\*\*\s*(.*)$/); return m ? { tag: m[1], text: m[2] } : { tag: '', text: l } })
  const active = get('Active project')?.lines ?? []
  return {
    now: (get('Now')?.lines ?? []).join(' '),
    project: { title: active.find((l) => l.startsWith('# '))?.slice(2) ?? '', text: active.filter((l) => !l.startsWith('# ') && !l.startsWith('- ')).join(' '), links: active.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) },
    numbers: items('Numbers'),
    decided: tagged('Decided'),
    toDecide: tagged('To be decided'),
    parked: items('Parked, your call'),
    waiting: items('Waiting on you'),
    checkin: items('Check-in list'),
    days: Object.fromEntries(
      sections
        .map((s) => ({ s, m: s.title.match(/^[A-Za-z]+, ([A-Za-z]+) (\d+)$/) }))
        .filter(({ m }) => m && MONTHS.includes(m[1].toLowerCase()))
        .map(({ s, m }) => {
          const mo = MONTHS.indexOf(m![1].toLowerCase()) + 1
          const now = new Date()
          // the journal's days carry no year: this year, or last year for a December day read in January
          const year = mo > now.getUTCMonth() + 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
          const day = `${year}-${String(mo).padStart(2, '0')}-${String(Number(m![2])).padStart(2, '0')}`
          const entries = s.lines.filter((l) => l.startsWith('- ')).map((l) => { const e = l.slice(2).match(/^\*\*([^*]+?)\.?\*\*\s*(.*)$/); return e ? { time: e[1], text: e[2] } : { time: '', text: l.slice(2) } })
          return [day, entries]
        }),
    ) as Record<string, { time: string; text: string }[]>,
  }
}

// "November 17 to 21" / "November 30 to December 4" / "December 7 to 11" → ISO dates in 2026
function weekDates(s: string, year: number): [string, string] | null {
  const m = s.toLowerCase().match(/([a-z]+) (\d+) to (?:([a-z]+) )?(\d+)/)
  if (!m) return null
  const m1 = MONTHS.indexOf(m[1])
  const m2 = m[3] ? MONTHS.indexOf(m[3]) : m1
  if (m1 < 0 || m2 < 0) return null
  const iso = (mo: number, d: number) => `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return [iso(m1, Number(m[2])), iso(m2, Number(m[4]))]
}
export function parsePlan(slug: string, title: string, body: string, written: string) {
  const year = Number(written.slice(0, 4))
  const weeks: PlanWeek[] = []
  let cur: PlanWeek | null = null
  for (const line of body.split('\n')) {
    // "### Week 1, November 17 to 21: Bart uses it every day", or with no colon:
    // "### Week 4, December 7 to 11, and the review on December 16"
    const h = line.match(/^### Week (\d), (.+?)(?::\s*(.*))?$/)
    if (h) {
      const d = weekDates(h[2], year)
      const title = (h[3] ?? h[2].replace(/^[A-Za-z]+ \d+ to (?:[A-Za-z]+ )?\d+,?\s*/, '')).trim()
      cur = d ? { n: Number(h[1]), title: title ? title[0].toUpperCase() + title.slice(1) : '', from: d[0], to: d[1], items: [], demo: '' } : null
      if (cur) weeks.push(cur)
      continue
    }
    if (line.startsWith('## ')) cur = null
    if (!cur || !line.startsWith('- ')) continue
    const demo = line.match(/^- \*\*Friday demo:\*\*\s*(.*)$/)
    if (demo) cur.demo = demo[1]
    else if (!line.startsWith('- **')) cur.items.push(line.slice(2))
  }
  const day30 = body.match(/Day 30 is \*\*[A-Za-z]+, ([A-Za-z]+ \d+)\*\*/)?.[1]
  const end = day30 ? (weekDates(`${day30} to 1`, year)?.[0] ?? null) : null
  const start = body.match(/Written [A-Za-z]+, ([A-Za-z]+ \d+), /)?.[1]
  return weeks.length ? { slug, title, start: (start && weekDates(`${start} to 1`, year)?.[0]) || weeks[0].from, end: end ?? weeks[weeks.length - 1].to, weeks } : null
}

// ---------------------------------------------------------------- open counts and who is working
/** Epoch ms of midnight Pacific at the start of a Pacific day (YYYY-MM-DD). */
export function pacificMidnight(day: string): number {
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
  const off = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t
  }
  return guess - off(guess - off(guess))
}
type Countable = Pick<Issue, 'status' | 'opened_at' | 'finished_at' | 'tracker'>
/** Tickets open at time t: opened before it, and not done or dropped before it. */
export const openAt = (issues: Countable[], t: number) => issues.filter((i) => !isTracker(i) && Date.parse(i.opened_at) < t && !((i.status === 'done' || i.status === 'dropped') && i.finished_at && Date.parse(i.finished_at) < t)).length
/** "Open issues: N (yesterday: M)" from the tracker's records: N now (or at the end of a past day),
 *  M at the end of the day before. Needs every ticket that was open in that span (loadBoard's set). */
export function openCounts(issues: Countable[], now: number, day?: string): { n: number; yesterday: number } {
  const today = pacificDay(now)
  const d = day ?? today
  const end = d >= today ? now : pacificMidnight(pacificDay(pacificMidnight(d) + 36 * 3600e3))
  return { n: openAt(issues, end), yesterday: openAt(issues, pacificMidnight(d)) }
}
const CLAIM_TTL = 45 * 60e3
export function leadFrom(issues: Pick<Issue, 'status' | 'priority' | 'tracker'>[], runner: RunnerState | null, claims: Record<string, Claim>, limit: Lead['paused'] | null, now: number): Lead {
  const live = Object.entries(claims).filter(([, c]) => now - Date.parse(c.at) < CLAIM_TTL)
  const runStale = !!runner?.running && now - Date.parse(runner.started ?? '') > 3 * 3600e3
  let working: Lead['working'] = null
  if (runner?.running && !runStale && runner.ticket && runner.started) working = { id: runner.ticket, since: runner.started, who: 'runner' }
  else if (live.length) {
    const [id, c] = live.sort((a, b) => Date.parse(a[1].since ?? a[1].at) - Date.parse(b[1].since ?? b[1].at))[0]
    working = { id, since: c.since ?? c.at, who: c.who }
  }
  const times = [runner?.ended, runner?.started, ...Object.values(claims).map((c) => c.at)].filter((t): t is string => !!t).map((t) => Date.parse(t))
  const last = times.length ? Math.max(...times) : null
  const urgent = issues.some((i) => ['open', 'in_progress', 'waiting'].includes(i.status) && !isTracker(i) && (i.priority === 'P0' || i.priority === 'P1'))
  const busy = !!working || (!!runner?.running && !runStale)
  return { working, idle: urgent && !busy && (last === null || now - last > 3600e3), lastActive: last === null ? null : new Date(last).toISOString(), paused: limit && Date.parse(limit.until) > now ? limit : null }
}

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''))

/** The commits the hand-off made, by sha, with the model (a small query: only bodies that say so). */
async function olaShas(db: ReturnType<typeof f2Supabase>, issueId?: string): Promise<Map<string, string>> {
  let q = db.from('venture_commits').select('sha, body').like('body', 'Built by Ola on %')
  if (issueId) q = q.eq('issue_id', issueId)
  const { data, error } = await q
  if (error && !missing(error)) throw new Error(`venture_commits read failed: ${error.message}`)
  return new Map((data ?? []).flatMap((r) => { const m = olaModel(String(r.body ?? '')); return m ? [[r.sha as string, m] as [string, string]] : [] }))
}
const builtBy = (commits: Commit[], ola: Map<string, string>): BuiltBy => {
  const c = commits.find((x) => ola.has(x.sha))
  return c ? { by: 'ola', model: ola.get(c.sha) as string } : null
}
/** The day's count: tickets closed on a Pacific day, and how many of them Ola built. */
export const closedOn = (issues: Pick<Issue, 'status' | 'day' | 'builtBy'>[], day: string) => {
  const done = issues.filter((i) => i.status === 'done' && i.day === day)
  return { closed: done.length, ola: done.filter((i) => i.builtBy).length }
}

export async function loadBoard(): Promise<BoardData> {
  const db = f2Supabase()
  const since = new Date(Date.now() - 45 * 86400e3).toISOString()
  const [docs, state, issuesR, commitsR, claimsR, ola] = await Promise.all([
    db.from('venture_docs').select('slug, title, body, updated_at').in('slug', ['journal', PLAN_SLUG, LEARN_SLUG]),
    db.from('venture_state').select('key, value, at').in('key', ['steers', 'steer_replay', 'steer_replay_attempt', 'ola_status', 'commit_sync', 'learning', 'sweeps', 'api_use', 'runner', 'runner_limit']),
    db.from('venture_issues').select('*').eq('project', 'ola').or(`status.in.(open,in_progress,waiting),finished_at.gte.${since}`).order('num', { ascending: false }),
    db.from('venture_commits').select('sha, subject, at, issue_id, ignored').gte('at', since).order('at', { ascending: false }),
    db.from('venture_state').select('key, value, at').like('key', 'claim:%'),
    olaShas(db),
  ])
  if (docs.error) throw new Error(`venture_docs read failed: ${docs.error.message}`)
  if (claimsR.error) throw new Error(`venture_state read failed: ${claimsR.error.message}`)
  if (state.error) throw new Error(`venture_state read failed: ${state.error.message}`)
  if (issuesR.error && !missing(issuesR.error)) throw new Error(`venture_issues read failed: ${issuesR.error.message}`)
  if (commitsR.error && !missing(commitsR.error)) throw new Error(`venture_commits read failed: ${commitsR.error.message}`)
  const journalRow = docs.data.find((d) => d.slug === 'journal')
  const planRow = docs.data.find((d) => d.slug === PLAN_SLUG)
  const learnRow = docs.data.find((d) => d.slug === LEARN_SLUG)
  const st = (k: string) => state.data.find((r) => r.key === k)
  const commits = (commitsR.data ?? []) as (Commit & { ignored: boolean })[]
  const byIssue = new Map<string, Commit[]>()
  for (const c of commits) if (c.issue_id) byIssue.set(c.issue_id, [...(byIssue.get(c.issue_id) ?? []), c])
  const issues = issuesR.error ? null : (issuesR.data as Omit<Issue, 'commits'>[]).map((i) => { const cs = (byIssue.get(i.id) ?? []).sort((a, b) => a.at.localeCompare(b.at)); return { ...i, links: i.links ?? [], commits: cs, builtBy: builtBy(cs, ola) } })
  const j = parseJournal(journalRow?.body ?? '')
  return {
    now: new Date().toISOString(),
    today: pacificDay(),
    journal: { at: journalRow?.updated_at ?? null, now: j.now, project: j.project, numbers: j.numbers, decided: j.decided, toDecide: j.toDecide, parked: j.parked, waiting: j.waiting, checkin: j.checkin, days: j.days },
    issues,
    unsorted: commits.filter((c) => !c.issue_id && !c.ignored).map(({ sha, subject, at }) => ({ sha, subject, at })),
    commitSync: (st('commit_sync')?.value ?? null) as BoardData['commitSync'],
    status: (st('ola_status')?.value ?? null) as LiveStatus | null,
    independence: {
      days: Object.values((st('steers')?.value?.days ?? {}) as Record<string, SteerDay>).sort((a, b) => a.day.localeCompare(b.day)),
      replay: (st('steer_replay')?.value ?? null) as Replay | null,
      replayAttempt: (st('steer_replay_attempt')?.value ?? null) as ReplayAttempt | null,
    },
    plan: planRow ? parsePlan(PLAN_SLUG, planRow.title, planRow.body, planRow.updated_at) : null,
    notes: await loadNotes(journalRow?.body ?? ''),
    learning: (st('learning')?.value ?? null) as Learning | null,
    sweeps: (st('sweeps')?.value ?? null) as Sweeps | null,
    learnNote: learnRow ? { slug: LEARN_SLUG, title: learnRow.title, lede: firstParagraph(learnRow.body ?? '') } : null,
    apiUse: ((st('api_use')?.value as { days?: BoardData['apiUse'] } | undefined)?.days ?? null) as BoardData['apiUse'],
    claims: Object.fromEntries((claimsR.data ?? []).filter((r) => Date.now() - Date.parse(r.at as string) < CLAIM_TTL).map((r) => [String(r.key).slice('claim:'.length), { ...(r.value as Omit<Claim, 'at'>), at: r.at as string }])),
    lead: leadFrom(
      issues ?? [],
      (st('runner')?.value ?? null) as RunnerState | null,
      Object.fromEntries((claimsR.data ?? []).map((r) => [String(r.key).slice('claim:'.length), { ...(r.value as Omit<Claim, 'at'>), at: r.at as string }])),
      (st('runner_limit')?.value ?? null) as Lead['paused'],
      Date.now(),
    ),
  }
}

// ---------------------------------------------------------------- the tracker and the notes (round two)
/** Every issue of the project with its commits, for the tracker page and the permalinks. */
export async function loadIssues(): Promise<Issue[] | null> {
  const db = f2Supabase()
  const [issuesR, commitsR, ola] = await Promise.all([
    db.from('venture_issues').select('*').eq('project', 'ola').order('num', { ascending: false }),
    db.from('venture_commits').select('sha, subject, at, issue_id').not('issue_id', 'is', null).order('at'),
    olaShas(db),
  ])
  if (issuesR.error) {
    if (missing(issuesR.error)) return null
    throw new Error(`venture_issues read failed: ${issuesR.error.message}`)
  }
  if (commitsR.error) throw new Error(`venture_commits read failed: ${commitsR.error.message}`)
  const byIssue = new Map<string, Commit[]>()
  for (const c of commitsR.data as Commit[]) byIssue.set(c.issue_id as string, [...(byIssue.get(c.issue_id as string) ?? []), c])
  return (issuesR.data as Omit<Issue, 'commits'>[]).map((i) => ({ ...i, links: i.links ?? [], commits: byIssue.get(i.id) ?? [], builtBy: builtBy(byIssue.get(i.id) ?? [], ola) }))
}

export type NoteLink = { slug: string; title: string; label: string; at: string; what?: string }
/** The notes the sidebar lists: the journal's "Active project" links that point at a note (the lead
 *  edits that list in JOURNAL.md), then the newest security review and the builders' rules. Titles and
 *  dates come from venture_docs; the notes are shown by /notes/<slug> behind the sign-in. */
export async function loadNotes(journalBody: string): Promise<NoteLink[]> {
  const db = f2Supabase()
  const fromJournal = parseJournal(journalBody)
    .project.links.map((l) => l.match(/^\[([^\]]+)\]\((?:https?:\/\/[^/]+)?\/venture\/doc\/([a-z0-9-]+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ slug: m[2], label: m[1] }))
  const { data: reviews, error } = await db.from('venture_docs').select('slug').like('slug', 'ola-review-%').order('updated_at', { ascending: false }).limit(1)
  if (error) throw new Error(`venture_docs read failed: ${error.message}`)
  const wanted = [...fromJournal]
  if (reviews[0] && !wanted.some((w) => w.slug === reviews[0].slug)) wanted.push({ slug: reviews[0].slug, label: 'The latest security review' })
  if (!wanted.some((w) => w.slug === 'ola-builder-rules')) wanted.push({ slug: 'ola-builder-rules', label: "The builders' rules" })
  const { data: docs, error: e2 } = await db.from('venture_docs').select('slug, title, body, updated_at').in('slug', wanted.map((w) => w.slug))
  if (e2) throw new Error(`venture_docs read failed: ${e2.message}`)
  return wanted.flatMap((w) => {
    const d = docs.find((x) => x.slug === w.slug)
    return d ? [{ slug: w.slug, label: w.label, title: d.title, at: d.updated_at, what: firstLine(d.body ?? '') }] : []
  })
}

/** What every board page's frame needs: the menu's count of open issues, the machine's reading for
 *  the compact status at the top of the menu, and the Mac app's current download for Quick links. */
export type Frame = { now: string; open: number | null; status: LiveStatus | null; mac: { url: string; version: string } | null }
export async function loadFrame(): Promise<Frame> {
  const db = f2Supabase()
  const [open, st, mac] = await Promise.all([
    db.from('venture_issues').select('id', { count: 'exact', head: true }).eq('project', 'ola').in('status', ['open', 'in_progress', 'waiting']).is('tracker', null),
    db.from('venture_state').select('value').eq('key', 'ola_status').maybeSingle(),
    macLatest(),
  ])
  if (open.error && !missing(open.error)) throw new Error(`venture_issues read failed: ${open.error.message}`)
  if (st.error) throw new Error(`venture_state read failed: ${st.error.message}`)
  return { now: new Date().toISOString(), open: open.error ? null : (open.count ?? 0), status: (st.data?.value ?? null) as LiveStatus | null, mac }
}

/** A note's first paragraph in plain words (the first block that is not a heading, a table or a list). */
export function firstParagraph(body: string): string {
  const para = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^(#|\||```|>|-{3,})/.test(p) && !/^[-*] /.test(p))
  return (para ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
}

/** A note's one line for the Notes index: the first sentence of its first paragraph, in plain words. */
export function firstLine(body: string): string {
  const para = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^(#|\||```|>|-{3,}|Last checked against)/.test(p) && !/^[-*] /.test(p))
  if (!para) return ''
  const text = para
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
  const first = text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0]
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first
}

// ---------------------------------------------------------------- one issue and its thread (round three)
/** One issue with its commits and its Activity (null when schema 012 is not applied yet). */
export async function loadIssue(id: string): Promise<{ issue: Issue; activity: Activity[] | null; list: TrackerItem[] | null; partOf: { id: string; title: string }[] } | null> {
  const db = f2Supabase()
  const [issueR, commitsR, actR, ola, partR] = await Promise.all([
    db.from('venture_issues').select('*').eq('id', id).maybeSingle(),
    db.from('venture_commits').select('sha, subject, at, issue_id').eq('issue_id', id).order('at'),
    db.from('venture_issue_activity').select('*').eq('issue_id', id).order('at'),
    olaShas(db, id),
    // the tracker issues whose list holds this one (OLA-505)
    db.from('venture_issues').select('id, title').filter('tracker', 'cs', JSON.stringify([{ id }])).order('num'),
  ])
  if (issueR.error) {
    if (missing(issueR.error)) return null
    throw new Error(`venture_issues read failed: ${issueR.error.message}`)
  }
  if (!issueR.data) return null
  if (commitsR.error) throw new Error(`venture_commits read failed: ${commitsR.error.message}`)
  if (actR.error && !missing(actR.error)) throw new Error(`venture_issue_activity read failed: ${actR.error.message}`)
  if (partR.error) throw new Error(`venture_issues read failed: ${partR.error.message}`)
  const i = issueR.data as Omit<Issue, 'commits'>
  const cs = (commitsR.data ?? []) as Commit[]
  let list: TrackerItem[] | null = null
  if (Array.isArray(i.tracker)) {
    const ids = i.tracker.map((e) => e.id)
    const r = ids.length ? await db.from('venture_issues').select('id, title, status').in('id', ids) : { data: [], error: null }
    if (r.error) throw new Error(`venture_issues read failed: ${r.error.message}`)
    const rows = (r.data ?? []) as { id: string; title: string; status: Status }[]
    list = i.tracker.map((e) => { const x = rows.find((y) => y.id === e.id); return { id: e.id, note: e.note ?? '', title: x?.title ?? null, status: x?.status ?? null } })
  }
  return { issue: { ...i, links: i.links ?? [], commits: cs, builtBy: builtBy(cs, ola) }, activity: actR.error ? null : (actR.data as Activity[]), list, partOf: (partR.data ?? []) as { id: string; title: string }[] }
}

// ---------------------------------------------------------------- the status panel (OLA-164)
/** The alarm sentences a reading may show: never one that the same reading contradicts. The mini's
 *  watcher (apps/activist-ai/ops/watch.mjs) writes them; before Nov 18 it repeated a disk alarm
 *  from an earlier run beside a healthy disk. Here a disk sentence must name the free space this
 *  reading measured, and a "not answering" sentence must match a part this reading has down. */
export function alarmSays(s: LiveStatus): { says: string[]; dropped: number } {
  const parts = Object.fromEntries(Object.entries(s.parts ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  const PART: [RegExp, string][] = [
    [/web app is not answering/i, 'web app'],
    [/model connection/i, 'model connection'],
    [/does not answer from the internet/i, 'public address'],
    [/Frances's service/i, 'almanac'],
  ]
  const keep = (t: string) => {
    const disk = t.match(/disk is almost full \((\d+(?:\.\d+)?) GB/)
    if (disk) return !!s.disk && Number(disk[1]) === s.disk.freeGB
    for (const [re, name] of PART) if (re.test(t)) return parts[name] !== true
    return true
  }
  const all = s.alarm?.says ?? []
  const says = all.filter(keep)
  return { says, dropped: all.length - says.length }
}

/** The Mac app's current download, read from the landing page's own manifest (never typed here). */
export async function macLatest(): Promise<{ url: string; version: string } | null> {
  try {
    const res = await fetch('https://ola.cx/ola-site/mac/latest.json', { next: { revalidate: 600 }, signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const j = (await res.json()) as { version?: string; build?: string; url?: string }
    return j.url ? { url: j.url, version: `${j.version ?? ''}${j.build ? ` (${j.build})` : ''}`.trim() } : null
  } catch {
    return null
  }
}

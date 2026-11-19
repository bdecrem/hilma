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
export type Issue = {
  id: string
  num: number
  title: string
  what: string
  area: Area
  priority: 'P0' | 'P1' | 'P2'
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
}
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
  alarm: { state: 'ok' | 'warn' | 'alarm'; says: string[]; warns: string[]; runAt: string | null }
  disk: { freeGB: number } | null
  memory: string | null
  projects: { running: number } | null
  parts: Record<string, boolean>
}
export type SteerItem = { time: string; label: 'steer' | 'maybe'; class: string; repeat: boolean; quote: string }
export type SteerDay = { day: string; messages: number; steers: number; repeats: number; maybes: number; rate: number | null; between: number | null; items: SteerItem[] }
export type Replay = { at: string; cases: number; with_rules: { passed: number; tries: number }; without_rules: { passed: number; tries: number }; prevented: number; prevented_without: number }
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
  independence: { days: SteerDay[]; replay: Replay | null }
  plan: { slug: string; title: string; start: string; end: string; weeks: PlanWeek[] } | null
  notes: NoteLink[]
  learning: Learning | null // venture_state "learning", written by scripts/venture/learning.mjs
  sweeps: Sweeps | null // venture_state "sweeps", written by scripts/venture/sweep.mjs post
}
/** venture_state "learning" (Bart, Nov 18: "a widget / section that tracks Agent Learning"): Kit,
 *  the share of Bart's corrections that were new, not repeats; Ola, its own model's score on the
 *  test tasks as a share of Claude's. Missing or older than a day: the board says so. */
export type Learning = {
  at: string
  kit: { percent: number; label: string; corrections: number; repeats: number; latest_day?: { day: string; corrections: number; repeats: number }; by_day?: { day: string; corrections: number; repeats: number }[]; steers?: { day: string; rate: number }; replay?: { prevented: number; of: number }; goal: number }
  ola: { percent: number; label: string; model: string; own?: { passed: number; runs: number; rate: number }; claude?: { passed: number; runs: number; rate: number }; measured?: string; rounds?: { date: string; model: string; rate: number; share: number }[]; open?: string[]; goal: number }
  doc: string
}

/** The daily sweep (Bart, Nov 18: "a new daily 'agentic sweep' where the agent (you) take a look at
 *  all the things that happened that day and, from that, improves its memory and other systems for
 *  both (a) the management of the project ("kit") and (b) orchestration, skills and how the ola
 *  agents work ... a page with updates on it on most date ... with one or more headline numbers").
 *  One entry per day, newest first; the procedure is apps/venture/SWEEP.md. A change names what was
 *  seen, what was changed and where; "enforced" means the system now does it (a hook, a check, a
 *  test, code), as opposed to a note Kit has to remember. */
export type SweepChange = { saw: string; changed: string; where: string; enforced?: boolean; issue?: string }
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
}
export type Sweeps = { at: string; since: string; days: Sweep[] }

export const PLAN_SLUG = 'ola-30-day-plan-2026-11-16'
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

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''))

export async function loadBoard(): Promise<BoardData> {
  const db = f2Supabase()
  const since = new Date(Date.now() - 45 * 86400e3).toISOString()
  const [docs, state, issuesR, commitsR] = await Promise.all([
    db.from('venture_docs').select('slug, title, body, updated_at').in('slug', ['journal', PLAN_SLUG]),
    db.from('venture_state').select('key, value, at').in('key', ['steers', 'steer_replay', 'ola_status', 'commit_sync', 'learning', 'sweeps']),
    db.from('venture_issues').select('*').eq('project', 'ola').or(`status.in.(open,in_progress,waiting),finished_at.gte.${since}`).order('num', { ascending: false }),
    db.from('venture_commits').select('sha, subject, at, issue_id, ignored').gte('at', since).order('at', { ascending: false }),
  ])
  if (docs.error) throw new Error(`venture_docs read failed: ${docs.error.message}`)
  if (state.error) throw new Error(`venture_state read failed: ${state.error.message}`)
  if (issuesR.error && !missing(issuesR.error)) throw new Error(`venture_issues read failed: ${issuesR.error.message}`)
  if (commitsR.error && !missing(commitsR.error)) throw new Error(`venture_commits read failed: ${commitsR.error.message}`)
  const journalRow = docs.data.find((d) => d.slug === 'journal')
  const planRow = docs.data.find((d) => d.slug === PLAN_SLUG)
  const st = (k: string) => state.data.find((r) => r.key === k)
  const commits = (commitsR.data ?? []) as (Commit & { ignored: boolean })[]
  const byIssue = new Map<string, Commit[]>()
  for (const c of commits) if (c.issue_id) byIssue.set(c.issue_id, [...(byIssue.get(c.issue_id) ?? []), c])
  const issues = issuesR.error ? null : (issuesR.data as Omit<Issue, 'commits'>[]).map((i) => ({ ...i, links: i.links ?? [], commits: (byIssue.get(i.id) ?? []).sort((a, b) => a.at.localeCompare(b.at)) }))
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
    },
    plan: planRow ? parsePlan(PLAN_SLUG, planRow.title, planRow.body, planRow.updated_at) : null,
    notes: await loadNotes(journalRow?.body ?? ''),
    learning: (st('learning')?.value ?? null) as Learning | null,
    sweeps: (st('sweeps')?.value ?? null) as Sweeps | null,
  }
}

// ---------------------------------------------------------------- the tracker and the notes (round two)
/** Every issue of the project with its commits, for the tracker page and the permalinks. */
export async function loadIssues(): Promise<Issue[] | null> {
  const db = f2Supabase()
  const [issuesR, commitsR] = await Promise.all([
    db.from('venture_issues').select('*').eq('project', 'ola').order('num', { ascending: false }),
    db.from('venture_commits').select('sha, subject, at, issue_id').not('issue_id', 'is', null).order('at'),
  ])
  if (issuesR.error) {
    if (missing(issuesR.error)) return null
    throw new Error(`venture_issues read failed: ${issuesR.error.message}`)
  }
  if (commitsR.error) throw new Error(`venture_commits read failed: ${commitsR.error.message}`)
  const byIssue = new Map<string, Commit[]>()
  for (const c of commitsR.data as Commit[]) byIssue.set(c.issue_id as string, [...(byIssue.get(c.issue_id as string) ?? []), c])
  return (issuesR.data as Omit<Issue, 'commits'>[]).map((i) => ({ ...i, links: i.links ?? [], commits: byIssue.get(i.id) ?? [] }))
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
    db.from('venture_issues').select('id', { count: 'exact', head: true }).eq('project', 'ola').in('status', ['open', 'in_progress', 'waiting']),
    db.from('venture_state').select('value').eq('key', 'ola_status').maybeSingle(),
    macLatest(),
  ])
  if (open.error && !missing(open.error)) throw new Error(`venture_issues read failed: ${open.error.message}`)
  if (st.error) throw new Error(`venture_state read failed: ${st.error.message}`)
  return { now: new Date().toISOString(), open: open.error ? null : (open.count ?? 0), status: (st.data?.value ?? null) as LiveStatus | null, mac }
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
export async function loadIssue(id: string): Promise<{ issue: Issue; activity: Activity[] | null } | null> {
  const db = f2Supabase()
  const [issueR, commitsR, actR] = await Promise.all([
    db.from('venture_issues').select('*').eq('id', id).maybeSingle(),
    db.from('venture_commits').select('sha, subject, at, issue_id').eq('issue_id', id).order('at'),
    db.from('venture_issue_activity').select('*').eq('issue_id', id).order('at'),
  ])
  if (issueR.error) {
    if (missing(issueR.error)) return null
    throw new Error(`venture_issues read failed: ${issueR.error.message}`)
  }
  if (!issueR.data) return null
  if (commitsR.error) throw new Error(`venture_commits read failed: ${commitsR.error.message}`)
  if (actR.error && !missing(actR.error)) throw new Error(`venture_issue_activity read failed: ${actR.error.message}`)
  const i = issueR.data as Omit<Issue, 'commits'>
  return { issue: { ...i, links: i.links ?? [], commits: (commitsR.data ?? []) as Commit[] }, activity: actR.error ? null : (actR.data as Activity[]) }
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

import { AREAS, type Area, type Issue } from '@/lib/venture/board'
import { href } from '../Shell'
import { ago, dayLong, pday, shiftDay } from '../time'
import { Status } from './common'
import Filters from './Filters'
import Keys from './Keys'

// The Issue Tracker (app.kochitolabs.com/issues, OLA-163): every piece of work, and the only place
// issues are listed. Tabs with counts (Open = doing + next + waiting), filters for area and
// priority, a search over ID, title and description, sortable by ID, priority and updated, and
// New issue. Done is grouped by day, newest first. Everything is in the address (?tab=done&area=web
// &q=safari&sort=updated), so a view can be bookmarked; Home and Plan link in with week, day and
// opened. Keyboard: / searches, c opens New issue (Keys.tsx).

export type TrackerParams = { tab?: string; area?: string; pri?: string; q?: string; sort?: string; week?: string; day?: string; opened?: string; who?: string }
const TABS: [string, string, Issue['status'][]][] = [
  ['open', 'Open', ['in_progress', 'open', 'waiting']],
  ['doing', 'Doing', ['in_progress']],
  ['next', 'Next', ['open']],
  ['waiting', 'Waiting on you', ['waiting']],
  ['done', 'Done', ['done']],
  ['all', 'All', ['open', 'in_progress', 'waiting', 'done', 'dropped']],
]
const HIDDEN: [string, string, Issue['status'][]][] = [['dropped', 'Dropped', ['dropped']]]
const GROUP: Record<Issue['status'], number> = { waiting: 0, in_progress: 1, open: 2, done: 3, dropped: 4 }
const updated = (i: Issue) => i.updated_at ?? i.finished_at ?? i.started_at ?? i.opened_at

export default function Tracker({ all, p, base, now, today }: { all: Issue[] | null; p: TrackerParams; base: string; now: string; today: string }) {
  const tab = [...TABS, ...HIDDEN].find((t) => t[0] === p.tab) ?? TABS[0]
  const needle = (p.q ?? '').trim().toLowerCase()
  const dayOf = (v: string) => (v === 'today' ? today : v === 'yesterday' ? shiftDay(today, -1) : v)
  const filtered = (all ?? []).filter(
    (i) =>
      (!p.area || i.area === p.area) &&
      (!p.pri || i.priority === p.pri) &&
      (!p.who || i.who === p.who) &&
      (!p.week || String(i.week ?? '') === p.week) &&
      (!p.day || i.day === dayOf(p.day)) &&
      (!p.opened || pday(i.opened_at) === dayOf(p.opened)) &&
      (!needle || `${i.id} ${i.title} ${i.what}`.toLowerCase().includes(needle)),
  )
  const count = (st: Issue['status'][]) => filtered.filter((i) => st.includes(i.status)).length
  const sort = p.sort === 'id' || p.sort === 'pri' || p.sort === 'updated' ? p.sort : ''
  const rows = filtered
    .filter((i) => tab[2].includes(i.status))
    .sort((a, b) => {
      if (sort === 'id') return b.num - a.num
      if (sort === 'pri') return a.priority.localeCompare(b.priority) || updated(b).localeCompare(updated(a))
      if (sort === 'updated') return updated(b).localeCompare(updated(a))
      if (tab[0] === 'done') return (b.finished_at ?? '').localeCompare(a.finished_at ?? '')
      return GROUP[a.status] - GROUP[b.status] || a.priority.localeCompare(b.priority) || updated(b).localeCompare(updated(a))
    })
  const url = (over: Partial<TrackerParams>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...p, ...over })) if (v) u.set(k, v)
    const s = u.toString()
    return `${href(base, '/issues')}${s ? `?${s}` : ''}`
  }
  const chips: [keyof TrackerParams, string][] = []
  if (p.week) chips.push(['week', `Plan week ${p.week}`])
  if (p.day) chips.push(['day', `Closed ${p.day === 'today' || p.day === 'yesterday' ? p.day : dayLong(p.day)}`])
  if (p.opened) chips.push(['opened', `Opened ${p.opened === 'today' || p.opened === 'yesterday' ? p.opened : dayLong(p.opened)}`])
  if (p.who) chips.push(['who', `Who: ${p.who}`])
  const byDay = tab[0] === 'done' && !sort
  const days = byDay ? [...new Set(rows.map((i) => i.day ?? pday(i.finished_at ?? i.opened_at)))].sort().reverse() : []
  const sortLink = (key: 'id' | 'pri' | 'updated', label: string, cls = '') => (
    <a className={cls} href={url({ sort: sort === key ? undefined : key })} aria-sort={sort === key ? (key === 'pri' ? 'ascending' : 'descending') : undefined} title={sort === key ? 'Back to the default order' : `Sort by ${label.toLowerCase()}`}>
      {label}
      {sort === key ? ' ↓' : ''}
    </a>
  )
  const table = (list: Issue[], head = true) => (
    <ol className="bd-rows bd-table">
      {head && (
        <li className="head">
          {sortLink('id', 'ID')}
          {sortLink('pri', 'Pri')}
          <span>Title</span>
          <span className="area">Area</span>
          <span className="who">Who</span>
          <span>Status</span>
          {sortLink('updated', 'Updated', 'upd')}
        </li>
      )}
      {list.map((i) => (
        <li key={i.id}>
          <a href={`${href(base, '/issues')}/${i.id}`}>
            <span className="id">{i.id}</span>
            <span className={`bd-pri ${i.priority.toLowerCase()}`}>{i.priority}</span>
            <span className={`bd-cut ${i.status}-t`} title={i.title}>
              {i.title}
              {i.status === 'done' && i.proof && <span className="proof">{i.proof}</span>}
            </span>
            <span className="area bd-cut">{AREAS[i.area]}</span>
            <span className="who bd-cut">{i.who}</span>
            <Status s={i.status} />
            <span className="upd">{ago(updated(i), now)}</span>
          </a>
        </li>
      ))}
    </ol>
  )
  return (
    <>
      <Keys newHref={`${href(base, '/issues')}/new`} />
      <div className="bd-head">
        <h1>Issue Tracker</h1>
        <a className="bd-btn primary" href={`${href(base, '/issues')}/new`} title="New issue (c)">
          New issue <kbd>C</kbd>
        </a>
      </div>
      <nav className="bd-tabs" aria-label="Status">
        {TABS.map(([id, name, st]) => (
          <a key={id} href={url({ tab: id, sort: undefined })} aria-current={tab[0] === id ? 'page' : undefined} className={id === 'waiting' && count(st) ? 'hot' : ''}>
            {name} <span className="m">{count(st)}</span>
          </a>
        ))}
      </nav>
      <div className="bd-bar">
        <Filters action={href(base, '/issues')} p={p} areas={Object.entries(AREAS) as [Area, string][]} />
        {chips.map(([k, label]) => (
          <a key={k} className="bd-chip" href={url({ [k]: undefined })} title="Remove this filter">
            {label} ×
          </a>
        ))}
        {(p.q || p.area || p.pri || chips.length > 0) && (
          <a className="sub" href={url({ q: undefined, area: undefined, pri: undefined, week: undefined, day: undefined, opened: undefined, who: undefined })}>
            Clear
          </a>
        )}
      </div>
      {all === null ? (
        <p className="bd-empty">The tracker is not set up yet.</p>
      ) : rows.length === 0 ? (
        <p className="bd-empty">No issues here{needle || p.area || p.pri || chips.length ? ' with these filters' : ''}.</p>
      ) : byDay ? (
        days.map((day, n) => {
          const list = rows.filter((i) => (i.day ?? pday(i.finished_at ?? i.opened_at)) === day)
          return (
            <div key={day}>
              <h2 className="bd-day">
                {day === today ? 'Today' : day === shiftDay(today, -1) ? 'Yesterday' : dayLong(day)} <span className="m">{list.length}</span>
              </h2>
              {table(list, n === 0)}
            </div>
          )
        })
      ) : (
        table(rows)
      )}
    </>
  )
}

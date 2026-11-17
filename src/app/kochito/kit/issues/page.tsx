import type { Metadata, Viewport } from 'next'
import { AREAS, type Area, type Issue, loadFrame, loadIssues } from '@/lib/venture/board'
import { FACE, gate } from '../gate'
import Login from '../Login'
import Shell from '../Shell'
import { ago, clock, dayShort, pday } from '../time'
import Filters from './Filters'
import '../../company.css'

// Every issue of the project (app.kochitolabs.com/issues): status tabs with counts, filters for
// area, priority, who and plan week, a search, newest or priority first. Each row opens the issue's
// own page (/issues/OLA-112). Bart, 2026-11-17: "a way to view closed / resolved issues". The tabs
// and filters are the address (?tab=done&area=web&q=safari), so a view can be bookmarked.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ola · every issue', robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png' } }
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }

const TABS = [
  ['open', 'Next up', ['open']],
  ['doing', 'Doing', ['in_progress']],
  ['waiting', 'Waiting on Bart', ['waiting']],
  ['done', 'Done', ['done']],
  ['dropped', 'Dropped', ['dropped']],
  ['all', 'All', ['open', 'in_progress', 'waiting', 'done', 'dropped']],
] as const
type Params = { tab?: string; area?: string; pri?: string; who?: string; week?: string; q?: string; sort?: string }
const when = (i: Issue) => i.finished_at ?? i.started_at ?? i.opened_at

export default async function Issues({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, base, q: key } = await gate()
  if (!user) return <Login face={FACE} />
  const p = await searchParams
  const [all, frame] = await Promise.all([loadIssues(), loadFrame()])
  const now = new Date().toISOString()
  const tab = TABS.find((t) => t[0] === p.tab) ?? TABS[5]
  const needle = (p.q ?? '').trim().toLowerCase()
  const filtered = (all ?? []).filter(
    (i) =>
      (!p.area || i.area === p.area) &&
      (!p.pri || i.priority === p.pri) &&
      (!p.who || i.who === p.who) &&
      (!p.week || String(i.week ?? '') === p.week) &&
      (!needle || `${i.id} ${i.title} ${i.what} ${i.proof} ${i.who} ${i.commits.map((c) => `${c.sha.slice(0, 7)} ${c.subject}`).join(' ')}`.toLowerCase().includes(needle)),
  )
  const count = (statuses: readonly string[]) => filtered.filter((i) => statuses.includes(i.status)).length
  const sort = p.sort === 'priority' ? 'priority' : 'newest'
  const rows = filtered
    .filter((i) => (tab[2] as readonly string[]).includes(i.status))
    .sort((a, b) => (sort === 'priority' ? a.priority.localeCompare(b.priority) || when(b).localeCompare(when(a)) : when(b).localeCompare(when(a))))
  const href = (over: Partial<Params>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...p, ...over })) if (v) u.set(k, v)
    const s = u.toString()
    return `${base}/issues${s ? `?${s}` : ''}`
  }
  const whos = [...new Set((all ?? []).map((i) => i.who))].sort()
  const label = { open: 'next up', in_progress: 'doing', waiting: 'waiting on Bart', done: 'done', dropped: 'dropped' }
  return (
    <Shell base={base} q={key} user={user} notes={frame.notes} open={frame.open} current="issues">
      <section className="kb-sec kb-first" aria-labelledby="issues-h">
        <div className="kb-sec-head">
          <h1 id="issues-h" className="kb-h1">Every issue</h1>
          <p>{all === null ? 'The tracker is not set up yet.' : `${all.length} in all. Tap one for its proof and commits.`}</p>
        </div>
        <nav className="kb-tabs" aria-label="Status">
          {TABS.map(([id, name, statuses]) => (
            <a key={id} href={href({ tab: id })} aria-current={tab[0] === id ? 'page' : undefined}>
              {name} <span className="ko-mono">{count(statuses)}</span>
            </a>
          ))}
        </nav>
        <Filters base={base} p={p} areas={Object.entries(AREAS) as [Area, string][]} whos={whos} />
        {rows.length === 0 ? (
          <p className="kb-empty">Nothing here{needle || p.area || p.pri || p.who || p.week ? ' with these filters' : ''}.</p>
        ) : (
          <ol className="kb-list">
            {rows.map((i) => (
              <li key={i.id} className={i.status}>
                <a href={`${base}/issues/${i.id}`}>
                  <span className="ko-mono kb-id">{i.id}</span>
                  <span className="kb-title">
                    {i.title}
                    {(i.status === 'done' || i.status === 'dropped') && i.proof && <span className="kb-proof">{i.proof}</span>}
                  </span>
                  <span className="ko-mono kb-meta">
                    <span className={`ko-pri ${i.priority.toLowerCase()}`}>{i.priority}</span> {AREAS[i.area]} · {i.who}
                    <br />
                    {i.status === 'done' || i.status === 'dropped' ? `${label[i.status]} ${dayShort(i.day ?? pday(when(i)))} ${i.finished_at ? clock(i.finished_at) : ''}` : `${label[i.status]}, ${i.status === 'in_progress' ? 'started' : 'opened'} ${ago(i.status === 'in_progress' ? (i.started_at ?? i.opened_at) : i.opened_at, now)}`}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Shell>
  )
}

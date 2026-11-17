'use client'
import { useMemo, useState } from 'react'
import { AREAS, type Area, type Commit, type Issue } from '@/lib/venture/board'
import { IssueRow } from './IssueRow'
import { inline } from './inline'
import { ago, dayLong, shiftDay } from './time'

// Done: the tracker by day, newest first. Today and yesterday open, earlier days folded; a count by
// area under each day; search and filters for area and done / dropped. Each item opens in place.
export default function Done({ issues, unsorted, notes, today, now, q, base }: { issues: Issue[]; unsorted: Commit[]; notes: Record<string, { time: string; text: string }[]>; today: string; now: string; q: string; base: string }) {
  const [text, setText] = useState('')
  const [area, setArea] = useState<Area | ''>('')
  const [status, setStatus] = useState<'done' | 'dropped' | 'all'>('done')
  const closed = useMemo(() => issues.filter((i) => (i.status === 'done' || i.status === 'dropped') && i.day), [issues])
  const needle = text.trim().toLowerCase()
  const shown = closed.filter(
    (i) =>
      (status === 'all' || i.status === status) &&
      (!area || i.area === area) &&
      (!needle || `${i.id} ${i.title} ${i.what} ${i.proof} ${i.who} ${i.commits.map((c) => c.subject).join(' ')}`.toLowerCase().includes(needle)),
  )
  const days = [...new Set(shown.map((i) => i.day as string))].sort().reverse()
  const counts = (list: Issue[]) => {
    const by = new Map<Area, number>()
    for (const i of list) by.set(i.area, (by.get(i.area) ?? 0) + 1)
    return [...by.entries()].sort((a, b) => b[1] - a[1])
  }
  const areaCounts = counts(closed.filter((i) => status === 'all' || i.status === status))
  const yesterday = shiftDay(today, -1)
  const filtering = !!needle || !!area
  return (
    <>
      <div className="kb-filters" role="search">
        <input type="search" placeholder="Search what was done" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search what was done" />
        <div className="kb-seg" role="group" aria-label="Status">
          {(['done', 'dropped', 'all'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="kb-chips" role="group" aria-label="Area">
          <button type="button" aria-pressed={!area} onClick={() => setArea('')}>
            all areas
          </button>
          {areaCounts.map(([a, n]) => (
            <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(area === a ? '' : a)}>
              {AREAS[a]} <span className="ko-mono">{n}</span>
            </button>
          ))}
        </div>
      </div>
      {days.length === 0 && <p className="kb-empty">Nothing matches.</p>}
      {days.map((d) => {
        const list = shown.filter((i) => i.day === d).sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))
        return (
          <details key={`${d}${filtering}`} className="kb-day" open={filtering || d === today || d === yesterday}>
            <summary>
              <span className="kb-day-name">
                {d === today ? 'Today' : d === yesterday ? 'Yesterday' : dayLong(d).split(',')[0]}
                <span>{dayLong(d).split(', ')[1]}</span>
              </span>
              <span className="kb-day-n">{list.length}</span>
              <span className="ko-mono kb-day-areas">{counts(list).map(([a, n]) => `${AREAS[a].toLowerCase()} ${n}`).join(' · ')}</span>
            </summary>
            <ol className="kb-rows">
              {list.map((i) => (
                <IssueRow key={i.id} i={i} now={now} q={q} mode="done" base={base} />
              ))}
            </ol>
            {!filtering && notes[d]?.length > 0 && (
              <details className="kb-more kb-notes">
                <summary>Kit&rsquo;s notes for the day ({notes[d].length})</summary>
                <ol>
                  {notes[d].map((e, n) => (
                    <li key={n}>
                      <span className="ko-mono t">{e.time}</span>
                      <span>{inline(e.text)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </details>
        )
      })}
      {unsorted.length > 0 && (
        <details className="kb-day kb-unsorted">
          <summary>
            <span className="kb-day-name">Unsorted commits</span>
            <span className="kb-day-n">{unsorted.length}</span>
            <span className="ko-mono kb-day-areas">work that names no issue yet; the lead places each one</span>
          </summary>
          <ol className="kb-commits ko-mono">
            {unsorted.map((c) => (
              <li key={c.sha}>
                <a href={`https://github.com/bdecrem/hilma/commit/${c.sha}`}>{c.sha.slice(0, 7)}</a>
                <span>{c.subject}</span>
                <span className="t">{ago(c.at, now)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  )
}

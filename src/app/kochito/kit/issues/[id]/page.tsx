import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { AREAS, loadFrame, loadIssues } from '@/lib/venture/board'
import { FACE, gate } from '../../gate'
import { REPO, STATUS } from '../../IssueRow'
import Login from '../../Login'
import Shell from '../../Shell'
import { ago, clock, dayLong, dayShort, pday } from '../../time'
import '../../../company.css'

// One issue's own page (app.kochitolabs.com/issues/OLA-112): what and why, who, every date, what
// proved it, the links, and each commit linked to GitHub. The address is the permalink.
export const dynamic = 'force-dynamic'
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `Ola · ${(await params).id.toUpperCase()}`, robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png' } }
}

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const id = (await params).id.toUpperCase()
  if (!/^OLA-\d+$/.test(id)) notFound()
  const [all, frame] = await Promise.all([loadIssues(), loadFrame()])
  const i = all?.find((x) => x.id === id)
  if (!i) notFound()
  const now = new Date().toISOString()
  const stamp = (iso: string | null) => (iso ? `${dayShort(pday(iso))}, ${clock(iso)}` : '–')
  return (
    <Shell base={base} q={q} user={user} notes={frame.notes} open={frame.open} current="issues">
      <article className="kb-sec kb-first kb-issue">
        <p className="ko-mono kb-crumb">
          <a href={`${base}/issues`}>Every issue</a> / {i.id}
        </p>
        <h1 className="kb-h1">{i.title}</h1>
        <p className="kb-status-line">
          <span className={`kb-status ${i.status}`}>{STATUS[i.status]}</span>
          <span className={`ko-mono ko-pri ${i.priority.toLowerCase()}`}>{i.priority}</span>
          <span>{AREAS[i.area]}</span>
          {i.week && <span>plan week {i.week}</span>}
        </p>
        {i.what && <p className="kb-issue-what">{i.what}</p>}
        {i.proof && (
          <p className="kb-issue-proof">
            <span className="ko-mono">{i.status === 'dropped' ? 'why' : 'proof'}</span> {i.proof}
          </p>
        )}
        <dl className="kb-table">
          <dt>Who</dt>
          <dd>{i.who}</dd>
          <dt>Opened</dt>
          <dd>{stamp(i.opened_at)}</dd>
          <dt>Started</dt>
          <dd>{stamp(i.started_at)}</dd>
          <dt>{i.status === 'dropped' ? 'Dropped' : 'Finished'}</dt>
          <dd>{i.finished_at ? `${stamp(i.finished_at)} (${ago(i.finished_at, now)})` : '–'}</dd>
          {i.day && (
            <>
              <dt>Counts for</dt>
              <dd>{dayLong(i.day)}</dd>
            </>
          )}
          {i.links.length > 0 && (
            <>
              <dt>Links</dt>
              <dd className="kb-links-dd">
                {i.links.map((l, n) => (
                  <a key={n} href={l.url ?? `${base}/notes/${l.doc}`}>
                    {l.label}
                  </a>
                ))}
              </dd>
            </>
          )}
        </dl>
        <h2 className="kb-h2">{i.commits.length ? `${i.commits.length} ${i.commits.length === 1 ? 'commit' : 'commits'}` : 'No commits'}</h2>
        {i.commits.length > 0 ? (
          <ol className="kb-commits ko-mono">
            {i.commits.map((c) => (
              <li key={c.sha}>
                <a href={REPO + c.sha}>{c.sha.slice(0, 7)}</a>
                <span>{c.subject}</span>
                <span className="t">{stamp(c.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="kb-empty">Work that left no commit (a decision, a call, a check by hand), or commits not yet placed. A commit that says [{i.id}] in its message lands here by itself within 30 minutes.</p>
        )}
      </article>
    </Shell>
  )
}

import type { Metadata, Viewport } from 'next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { loadFrame } from '@/lib/venture/board'
import { loadOverview, OVERVIEW_GITHUB } from '@/lib/venture/overview'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { OverviewBadge, overviewLine } from '../OverviewBadge'
import Shell from '../Shell'
import '../../company.css'

// Ola in one page (app.kochitolabs.com/overview, OLA-132): apps/activist-ai/OVERVIEW.md, the map
// every agent reads first, with a red "stale" badge when Ola's code has moved since the page was
// last checked (src/lib/venture/overview.ts; the same rule as scripts/venture/overview-check.mjs).
export const dynamic = 'force-dynamic'
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }
export const metadata: Metadata = { title: 'Ola · in one page', robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png' } }

export default async function OverviewPage() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [o, frame] = await Promise.all([loadOverview(), loadFrame()])
  // the header line is shown above, as the badge and its sentence
  const body = o.body.replace(/^Last checked against: .*\n+/m, '')
  return (
    <Shell base={base} q={q} user={user} notes={frame.notes} open={frame.open} current="overview">
      <article className="kb-sec kb-first kb-ov-page">
        <p className="ko-mono kb-crumb">
          <OverviewBadge o={o} /> {overviewLine(o)} <a href={OVERVIEW_GITHUB}>On GitHub</a>
        </p>
        {o.fresh.state === 'stale' && o.fresh.commits.length > 0 && (
          <details className="kb-more">
            <summary>
              The {o.fresh.count} Ola {o.fresh.count === 1 ? 'change' : 'changes'} since
            </summary>
            <ol className="kb-plain">
              {o.fresh.commits.map((c) => (
                <li key={c.sha}>
                  <a className="ko-mono" href={`https://github.com/bdecrem/hilma/commit/${c.sha}`}>
                    {c.sha.slice(0, 8)}
                  </a>{' '}
                  {c.subject}
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className="kb-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="kb-md-table">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {body}
          </ReactMarkdown>
        </div>
      </article>
    </Shell>
  )
}

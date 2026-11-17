import { AREAS, type Issue } from '@/lib/venture/board'
import { ago, clock, dayShort, pday, since } from './time'

// One issue as a row that opens in place (a <details>, so it works without script, on a phone too):
// the line shows what it is; the opened part says what and why, who, when, what proved it, the
// links and the commits. Used by the plate (server) and by Done (client).
export const REPO = 'https://github.com/bdecrem/hilma/commit/'
export const STATUS: Record<Issue['status'], string> = { open: 'next up', in_progress: 'doing', waiting: 'waiting on Bart', done: 'done', dropped: 'dropped' }

export function IssueRow({ i, now, q, mode, base = '' }: { i: Issue; now: string; q: string; mode: 'plate' | 'done'; base?: string }) {
  const when = mode === 'plate' ? (i.status === 'in_progress' ? i.started_at : i.opened_at) : i.finished_at
  return (
    <li className={`kb-row ${i.status}`}>
      <details>
        <summary>
          {mode === 'plate' ? <span className={`ko-mono ko-pri ${i.priority.toLowerCase()}`}>{i.priority}</span> : <span className="ko-mono kb-id">{i.id}</span>}
          <span className="kb-title">
            {i.title}
            {mode === 'done' && i.proof && <span className="kb-proof">{i.proof}</span>}
          </span>
          <span className="ko-mono kb-meta">
            {mode === 'plate' ? (
              <>
                {i.who}
                {when && <span> · {i.status === 'in_progress' ? since(when, now) : `opened ${ago(when, now)}`}</span>}
              </>
            ) : (
              <>
                {AREAS[i.area]}
                {when && <span> · {clock(when)}</span>}
              </>
            )}
          </span>
        </summary>
        <div className="kb-detail">
          {i.what && <p>{i.what}</p>}
          <dl className="ko-mono">
            <dt>issue</dt>
            <dd>
              <a href={`${base}/issues/${i.id}`}>{i.id}</a> · {STATUS[i.status]} · {AREAS[i.area]} · {i.priority}
              {i.week ? ` · plan week ${i.week}` : ''}
            </dd>
            <dt>who</dt>
            <dd>{i.who}</dd>
            <dt>when</dt>
            <dd>
              opened {dayShort(pday(i.opened_at))} {clock(i.opened_at)}
              {i.started_at && i.started_at !== i.opened_at && `, started ${clock(i.started_at)}`}
              {i.finished_at && `, ${i.status === 'dropped' ? 'dropped' : 'finished'} ${ago(i.finished_at, now)}`}
            </dd>
            {i.proof && (
              <>
                <dt>proof</dt>
                <dd>{i.proof}</dd>
              </>
            )}
            {i.links.length > 0 && (
              <>
                <dt>links</dt>
                <dd>
                  {i.links.map((l, n) => (
                    <a key={n} href={l.url ?? `https://ola.cx/venture/doc/${l.doc}${q}`}>
                      {l.label}
                    </a>
                  ))}
                </dd>
              </>
            )}
            {i.commits.length > 0 && (
              <>
                <dt>{i.commits.length === 1 ? 'commit' : `${i.commits.length} commits`}</dt>
                <dd>
                  <ul>
                    {i.commits.map((c) => (
                      <li key={c.sha}>
                        <a href={REPO + c.sha}>{c.sha.slice(0, 7)}</a> {c.subject}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        </div>
      </details>
    </li>
  )
}

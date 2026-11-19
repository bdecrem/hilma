import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NoteLink } from '@/lib/venture/board'
import { type Overview, OVERVIEW_GITHUB } from '@/lib/venture/overview'
import { href } from '../Shell'
import { ago, dayShort } from '../time'

// Notes (app.kochitolabs.com/notes): the wiki. The index is a table of documents (title, one line
// of what it is, updated when), "Ola in one page" first with its "stale" badge when Ola's code has
// moved past it. A note (/notes/<slug>, and /overview for Ola in one page) gets a header on the
// body: the title, updated when, where it comes from, a link back to Notes; then the document at a
// reading width. The notes themselves are private (venture_docs); this public repo holds none.

export function Badge({ o }: { o: Overview }) {
  const s = o.fresh.state
  return <span className={`bd-badge ${s === 'stale' ? 'stale' : s === 'current' ? 'current' : 'unknown'}`}>{s === 'stale' ? 'stale' : s === 'current' ? 'current' : 'not checked'}</span>
}

export function NotesIndex({ notes, o, base, now }: { notes: NoteLink[]; o: Overview; base: string; now: string }) {
  return (
    <>
      <div className="bd-head">
        <h1>Notes</h1>
        <p>{notes.length + 1} documents</p>
      </div>
      <ol className="bd-rows bd-notes">
        <li>
          <a href={href(base, '/overview')}>
            <span className="name bd-cut">
              Ola in one page <Badge o={o} />
            </span>
            <span className="what bd-cut">{o.lede || 'The map every agent reads first: what Ola is, for whom, and how it is built.'}</span>
            <span className="upd">{o.date ? dayShort(o.date) : '–'}</span>
          </a>
        </li>
        {notes.map((n) => (
          <li key={n.slug}>
            <a href={`${href(base, '/notes')}/${n.slug}`}>
              <span className="name bd-cut">{n.label}</span>
              <span className="what bd-cut" title={n.what || n.title}>
                {n.what || n.title}
              </span>
              <span className="upd">{ago(n.at, now)}</span>
            </a>
          </li>
        ))}
      </ol>
    </>
  )
}

export function NoteView({ title, updated, from, body, base, mapHref, extra }: { title: string; updated: string; from: React.ReactNode; body: string; base: string; mapHref?: (h?: string) => string | undefined; extra?: React.ReactNode }) {
  // the header carries the title: drop a first line that repeats it as a heading
  const text = body.replace(/^\s*# [^\n]*\n+/, '')
  return (
    <>
      <p className="bd-crumb">
        <a href={href(base, '/notes')}>Notes</a> /
      </p>
      <header className="bd-note-head">
        <h1>{title}</h1>
        <p>
          <span>updated {updated}</span>
          <span>{from}</span>
          <a href={href(base, '/notes')}>Back to Notes</a>
        </p>
        {extra}
      </header>
      <div className="bd-md">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href: h, children }) => <a href={mapHref ? mapHref(h) : h}>{children}</a>,
            table: ({ children }) => (
              <div className="bd-md-table">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </>
  )
}

export function OverviewNote({ o, base }: { o: Overview; base: string }) {
  const body = o.body.replace(/^Last checked against: .*\n+/m, '')
  const line = o.fresh.state === 'stale' ? `${o.fresh.count} Ola ${o.fresh.count === 1 ? 'change' : 'changes'} since it was checked` : o.fresh.state === 'current' ? 'no Ola change since it was checked' : `could not check: ${o.fresh.why}`
  return (
    <NoteView
      title="Ola in one page"
      updated={o.date ? `checked against ${o.hash?.slice(0, 8)} on ${dayShort(o.date)}` : 'never checked'}
      from={
        <>
          from <a href={OVERVIEW_GITHUB}>apps/activist-ai/OVERVIEW.md</a>
        </>
      }
      body={body}
      base={base}
      extra={
        <p>
          <Badge o={o} /> <span>{line}</span>
        </p>
      }
    />
  )
}

import { parseTranscript, pieces } from '@/lib/kochito/transcript'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSample } from '@/lib/kochito/store'
import LeadForm from '../../LeadForm'
import Track from '../../Track'
import { Foot, Top } from '../../Chrome'

// kochitolabs.com/s/<slug>: one document, fixed, shown to the office that
// posted it. The first email to a city links here. Not for search engines.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getSample((await params).slug)
  return { title: s ? `${s.org}: ${s.title}, fixed` : 'Not found', robots: { index: false, follow: false } }
}

// The transcript is read by src/lib/kochito/transcript.ts (both of dump.py's formats).
const NAMES: Record<string, string> = {
  H1: 'Heading 1', H2: 'Heading 2', H3: 'Heading 3', H4: 'Heading 4', P: 'Paragraph', L: 'List', LI: 'Item', LBody: 'Item', Lbl: 'Label',
  Table: 'Table', TR: 'Row', TH: 'Header cell', TD: 'Cell', Figure: 'Image', Link: 'Link', Span: 'Text', Document: 'Document', TOC: 'Contents', TOCI: 'Entry',
}
export default async function SamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getSample((await params).slug)
  if (!s) notFound()
  const tr = parseTranscript(s.transcript)
  const count = (t: string[]) => tr.rows.filter((l) => l.kind === 'el' && t.includes(l.tag)).length
  const page = `s/${s.slug}`
  const same = s.after.identical !== false
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const added = (
    [
      [count(['L']), 'list', 'lists'],
      [count(['Table']), 'table', 'tables'],
      [count(['Figure']), 'image description', 'image descriptions'],
      [count(['Link']) + tr.rows.reduce((n, l) => n + (l.kind === 'el' ? pieces(l.text).filter((x) => typeof x !== 'string' && 'link' in x).length : 0), 0), 'labeled link', 'labeled links'],
    ] as [number, string, string][]
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `, ${plural(n, one, many)}`)
    .join('')
  return (
    <>
      <Track page={page} />
      <Top current="pdf" />
      <main id="main">
        <div className="kl-wrap kl-sample">
          <p className="kl-kicker">Prepared for {s.org}</p>
          <h1>{s.title}, fixed for screen readers.</h1>
          <p className="kl-lede">
            This is your own document, {s.pages} {s.pages === 1 ? 'page' : 'pages'}, as you posted it. {same ? 'Nothing visible has changed.' : 'The layout, the wording and the page count are unchanged.'} Underneath, it now has the structure a screen reader needs, and it passes the PDF/UA checker.
          </p>
          <p className="kl-actions">
            <a className="kl-btn" href={s.fixed_url}>
              Download the fixed PDF
            </a>
            <a href={s.original_url}>View the original on your website</a>
          </p>
        </div>

        <section className="kl-band dark" aria-labelledby="results">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="results">Before and after.</h2>
              <p>Checked with veraPDF, the open-source reference checker for the PDF/UA standard.</p>
            </div>
            <dl className="kl-stats">
              <div>
                <dd>
                  <span className="from">{s.before.failedChecks.toLocaleString('en-US')}</span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="kl-sr"> to </span>
                  <span className="to">{s.after.failedChecks.toLocaleString('en-US')}</span>
                </dd>
                <dt>failed checks against the PDF/UA standard</dt>
              </div>
              <div>
                <dd>
                  {count(['H1', 'H2', 'H3', 'H4'])}
                  <small>added</small>
                </dd>
                <dt>headings{added}, the title and the language</dt>
              </div>
              <div>
                <dd>
                  {same ? 0 : s.pages}
                  <small>of {s.pages}</small>
                </dd>
                <dt>{same ? 'pages that look any different' : 'pages with the same layout and line breaks. The original lacked its fonts, which the standard requires, so open-licensed equivalents are embedded; letter shapes differ slightly.'}</dt>
              </div>
            </dl>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="reads">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="reads">What a screen reader is now given</h2>
              <p>A checker proves the structure exists, not that it is right. This is the whole document, read from the file’s tags in the order a screen reader follows, so you can compare it with the page. It is not a recording of a screen reader. If anything is wrong, tell us and we will correct it.</p>
            </div>
            {tr.title && (
              <p className="kl-read-open">
                <span className="kl-tag">ON OPENING</span> {tr.title}
                {tr.lang && <span className="kl-read-note"> · language {tr.lang}</span>}
              </p>
            )}
            <ol className="kl-read">
              {tr.rows.map((l, i) =>
                l.kind === 'page' ? (
                  <li key={i} className="pg">
                    <span className="kl-tag">PAGE {l.n}</span>
                  </li>
                ) : (
                  <li key={i} className={/^H\d$/.test(l.tag) ? 'h' : undefined}>
                    <span className="kl-tag">{(NAMES[l.tag] ?? l.tag).toUpperCase()}</span>
                    <span className="kl-read-text" style={{ paddingLeft: Math.min(l.depth, 5) * 16 }} lang={l.lang}>
                      {l.label && <span className="kl-read-label">{l.label} </span>}
                      {pieces(l.text).map((p, k) =>
                        typeof p === 'string' ? (
                          p
                        ) : 'read' in p ? (
                          <span key={k}>
                            {p.read}
                            <span className="kl-read-note"> ({p.why ?? 'read this way in place of the printed characters'})</span>
                          </span>
                        ) : (
                          <span key={k}>
                            <span className="kl-read-link">{p.link}</span>
                            <span className="kl-read-note"> (link{p.described ? `, described as “${p.described}”` : ''})</span>
                          </span>
                        ),
                      )}
                      {l.note && <span className="kl-read-note">{l.text ? ' · ' : ''}{l.note}</span>}
                      {l.lang && <span className="kl-read-note"> · marked as {l.lang}</span>}
                    </span>
                  </li>
                ),
              )}
            </ol>
            {tr.silent.length > 0 && (
              <div className="kl-read-silent">
                <h3>Not read aloud</h3>
                <p>Marked as decoration, so a screen reader skips it: running headers and footers, page numbers, ruled lines.</p>
                <ul>
                  {tr.silent.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="kl-band dark" aria-labelledby="next">
          <div className="kl-wrap kl-close">
            <div>
              <h2 id="next">The document is yours to post.</h2>
              <p style={{ color: '#cfe0d8' }}>There is nothing to pay or sign for this one. The federal rule that takes effect on April 26, 2027 covers everything you post from then on. If you would like each agenda and packet prepared this way before it is posted, the price is $1 per page, returned within one business day.</p>
              <p className="kl-signed">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kochito/kit/brain-1.svg" alt="" width={44} height={44} />
                <span>
                  <strong>Kit</strong>, AI agent at Kochito Labs. I did this work, and a reply to my email reaches me. <a href="/pdf">How the service works, the price and common questions.</a>
                </span>
              </p>
            </div>
            <LeadForm
              page={page}
              emailPlaceholder="name@yourcity.gov"
              button="Ask about the rest"
              under="We reply within one business day. You can"
              moreLabel="add a note now"
              detailLabel="Anything we should know"
              detailPlaceholder="For example: we post a packet every other Thursday"
              done="We will be in touch within one business day."
              fromEmail="hello@clerkpdf.com"
            />
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}

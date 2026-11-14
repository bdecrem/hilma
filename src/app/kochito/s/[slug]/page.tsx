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

// The transcript is dump.py's outline: two spaces of indent per level, then
// "Tag: text" or "Tag Alt=...". Shown as the list a screen reader walks.
const NAMES: Record<string, string> = {
  H1: 'Heading 1', H2: 'Heading 2', H3: 'Heading 3', H4: 'Heading 4', P: 'Paragraph', L: 'List', LI: 'Item', LBody: 'Item', Lbl: 'Label',
  Table: 'Table', TR: 'Row', TH: 'Header cell', TD: 'Cell', Figure: 'Image', Link: 'Link', Span: 'Text', Document: 'Document', TOC: 'Contents', TOCI: 'Entry',
}
function rows(transcript: string) {
  const out: { depth: number; tag: string; text: string }[] = []
  for (const line of transcript.split('\n')) {
    const m = line.match(/^(\s*)([A-Za-z0-9]+)(?::\s?|\s+)?(.*)$/)
    if (!m || !m[2]) continue
    const tag = m[2]
    let text = m[3] ?? ''
    if (tag === 'Document' || tag === 'LI' || (tag === 'TR' && !text)) continue
    const alt = text.match(/^Alt="(.*)"$/)
    if (alt) text = `“${alt[1]}”`
    text = text.replace(/\s*\[annot\]\s*$/, '')
    out.push({ depth: Math.max(0, Math.floor(m[1].length / 2) - 1), tag, text })
  }
  return out
}

export default async function SamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getSample((await params).slug)
  if (!s) notFound()
  const lines = rows(s.transcript)
  const count = (t: string[]) => lines.filter((l) => t.includes(l.tag)).length
  const page = `s/${s.slug}`
  const same = s.after.identical !== false
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const added = (
    [
      [count(['L']), 'list', 'lists'],
      [count(['Table']), 'table', 'tables'],
      [count(['Figure']), 'image description', 'image descriptions'],
      [count(['Link']), 'labeled link', 'labeled links'],
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
              <h2 id="reads">What a screen reader now reads</h2>
              <p>A checker proves the structure exists, not that it is right. This is the whole document as a screen reader walks it, so you can compare it with the page. If anything is wrong, tell us and we will correct it.</p>
            </div>
            <ol className="kl-read">
              {lines.map((l, i) => (
                <li key={i} className={/^H\d$/.test(l.tag) ? 'h' : undefined}>
                  <span className="kl-tag">{(NAMES[l.tag] ?? l.tag).toUpperCase()}</span>
                  <span className="kl-read-text" style={{ paddingLeft: Math.min(l.depth, 5) * 16 }}>
                    {l.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="kl-band dark" aria-labelledby="next">
          <div className="kl-wrap kl-close">
            <div>
              <h2 id="next">The document is yours to post.</h2>
              <p style={{ color: '#cfe0d8' }}>There is nothing to pay or sign for this one. The federal rule that takes effect on April 26, 2027 covers everything you post from then on. If you would like each agenda and packet prepared this way before it is posted, the price is $1 per page, returned within one business day.</p>
              <p className="kl-note">
                This work was done by AI agents at Kochito Labs. <a href="/pdf">How the service works, the price and common questions.</a>
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
            />
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}

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
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const added = [
    [count(['L']), 'list', 'lists'],
    [count(['Table']), 'table', 'tables'],
    [count(['Figure']), 'image description', 'image descriptions'],
    [count(['Link']), 'labeled link', 'labeled links'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, one, many]) => `, ${plural(n as number, one as string, many as string)}`)
    .join('')
  return (
    <div className="kl-pdf">
      <Track page={page} />
      <Top />
      <main id="main">
        <div className="kl-wrap kl-sample">
          <p className="kl-eyebrow">Fixed for {s.org}</p>
          <h1>
            {s.title}, <em>readable by a screen reader.</em>
          </h1>
          <p className="kl-lede">
            This is your own document, {s.pages} {s.pages === 1 ? 'page' : 'pages'}, as you posted it. Nothing you can see has changed. Underneath, it now has the structure a screen reader needs, and it passes the PDF/UA checker.
          </p>
          <p className="kl-actions">
            <a className="kl-btn" href={s.fixed_url}>
              Download the fixed PDF
            </a>
            <a href={s.original_url}>The original on your website</a>
          </p>

          <div className="kl-score" role="group" aria-label="Checker results">
            <div className="kl-score-card bad">
              <p className="kl-sheet-tag">Before</p>
              <p className="kl-num">{s.before.failedChecks.toLocaleString('en-US')}</p>
              <p>failed checks, across {s.before.failedRules} rules of the PDF/UA standard</p>
            </div>
            <div className="kl-score-card good">
              <p className="kl-sheet-tag">After</p>
              <p className="kl-num">{s.after.failedChecks.toLocaleString('en-US')}</p>
              <p>failed checks. Checked with veraPDF, the open-source reference checker.</p>
            </div>
            <div className="kl-score-card">
              <p className="kl-sheet-tag">Added</p>
              <p className="kl-num">{count(['H1', 'H2', 'H3', 'H4'])}</p>
              <p>headings{added}, the document’s title and its language</p>
            </div>
          </div>
        </div>

        <section className="kl-band" aria-labelledby="reads">
          <div className="kl-wrap">
            <h2 id="reads">What a screen reader now reads</h2>
            <p className="kl-lede">A checker only proves the structure is there, not that it is right. So here is the whole document as a screen reader walks it, for you to check against the page. If anything is wrong, tell us and we fix it.</p>
            <ol className="kl-read">
              {lines.map((l, i) => (
                <li key={i} style={{ marginLeft: Math.min(l.depth, 5) * 18 }} className={/^H\d$/.test(l.tag) ? 'h' : undefined}>
                  <span className="kl-tag">{NAMES[l.tag] ?? l.tag}</span>
                  {l.text}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="kl-band tint" aria-labelledby="next">
          <div className="kl-wrap kl-two">
            <div>
              <h2 id="next">It is yours to post</h2>
              <p>There is nothing to pay or sign for this one. Replace the file on your website with the fixed one. The federal rule that takes effect on April 26, 2027 covers everything you post from then on, agendas and packets included.</p>
              <p>If it would help to have each agenda and packet done this way before it goes up, that is $1 a page, back within one business day. Leave an address and we will write to you, or reply to the email that brought you here.</p>
              <p className="kl-fine">
                Kochito Labs is a small company, and this work was done by AI agents. <a href="/pdf">How it works, the price and the questions people ask.</a>
              </p>
            </div>
            <LeadForm
              page={page}
              emailPlaceholder="you@yourcity.gov"
              detailLabel="Anything we should know"
              detailPlaceholder="For example: we post a packet every other Thursday"
              detailHint="Or leave it empty."
              button="Write to me about the rest"
              done="We will be in touch within one business day."
            />
          </div>
        </section>
      </main>
      <Foot />
    </div>
  )
}

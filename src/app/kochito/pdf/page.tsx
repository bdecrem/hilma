import type { Metadata } from 'next'
import LeadForm from '../LeadForm'
import Track from '../Track'
import { Foot, Top } from '../Chrome'

// kochitolabs.com/pdf: the accessible PDF desk. One promise (send a PDF, get
// it back readable by a screen reader, free), one form. Facts on this page are
// sourced in apps/venture (private notes); change them there first.
const TITLE = 'Accessible PDFs for public websites'
const DESCRIPTION = 'Send one agenda, budget or scanned record. It comes back tagged and readable by screen readers, with the checker’s report. The first one is free.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pdf' },
  openGraph: { title: `${TITLE} · Kochito Labs`, description: DESCRIPTION, url: 'https://kochitolabs.com/pdf', siteName: 'Kochito Labs', type: 'website' },
}

export default function PdfDesk() {
  return (
    <div className="kl-pdf">
      <Track page="pdf" />
      <Top />
      <main id="main">
        <div className="kl-wrap kl-hero">
          <div>
            <p className="kl-eyebrow">Accessible PDF desk</p>
            <h1>
              Your PDFs, readable by a screen reader. <em>The first one is free.</em>
            </h1>
            <p className="kl-lede">
              Send one agenda, budget or scanned record from your website. It comes back looking exactly the same, with everything a screen reader needs underneath, and the checker’s report to prove it.
            </p>
            <LeadForm
              page="pdf"
              emailPlaceholder="you@yourcity.gov"
              detailLabel="Link to a PDF or your documents page"
              detailPlaceholder="https://yourcity.gov/agendas/june.pdf"
              detailHint="No link handy? Leave it empty and reply to our email with the file."
              button="Fix my PDF, free"
              done="Your fixed PDF and its report will be in your inbox within one business day."
            />
            <p className="kl-fine">No account, no card, no call. If the fixed file is not better than the one you sent, tell us and that is the end of it.</p>
          </div>

          <figure className="kl-pic">
            <div className="kl-pair" aria-hidden="true">
              <div className="kl-sheet">
                <p className="kl-sheet-tag">
                  <span>Before</span>
                  <span>agenda.pdf</span>
                </p>
                <div className="kl-row">
                  <span className="kl-bar t" />
                </div>
                <div className="kl-row">
                  <span className="kl-bar m" />
                  <span className="kl-bar" />
                  <span className="kl-bar s" />
                </div>
                <div className="kl-row kl-grid">
                  <span className="h" />
                  <span className="h" />
                  <span className="h" />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="kl-row kl-img" />
                <p className="kl-hears">
                  <b>A screen reader says</b>
                  “Untitled document. City council agenda June 9 item presenter time 1 call to order mayor 6 00 2… Graphic.”
                </p>
                <span className="kl-chip bad">No tags · fails</span>
              </div>
              <div className="kl-sheet kl-after">
                <p className="kl-sheet-tag">
                  <span>After</span>
                  <span>agenda.pdf</span>
                </p>
                <div className="kl-row">
                  <span className="kl-flag">H1</span>
                  <span className="kl-bar t" />
                </div>
                <div className="kl-row">
                  <span className="kl-flag">P</span>
                  <span className="kl-bar m" />
                  <span className="kl-bar" />
                  <span className="kl-bar s" />
                </div>
                <div className="kl-row kl-grid">
                  <span className="kl-flag">Table · TH</span>
                  <span className="h" />
                  <span className="h" />
                  <span className="h" />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="kl-row kl-img">
                  <span className="kl-flag">Figure · alt</span>
                </div>
                <p className="kl-hears">
                  <b>A screen reader says</b>
                  “Heading level 1: City Council agenda, June 9. Table with 3 columns: Item, Presenter, Time…”
                </p>
                <span className="kl-chip good">PDF/UA · passes</span>
              </div>
            </div>
            <figcaption>A drawing of what changes: nothing you can see, everything a screen reader needs. Your own before-and-after report comes with the fixed file.</figcaption>
          </figure>
        </div>

        <section className="kl-band" aria-labelledby="how">
          <div className="kl-wrap">
            <h2 id="how">How it works</h2>
            <ol className="kl-three">
              <li>
                <span className="n">01</span>
                <h3>Send one PDF</h3>
                <p>A link or the file. An agenda packet, a budget full of tables, a set of scanned minutes. Pick a hard one.</p>
              </li>
              <li>
                <span className="n">02</span>
                <h3>Get it back fixed</h3>
                <p>Within one business day: the fixed file, the checker’s report on the original and on the fix, and a plain transcript of what a screen reader will now say, so anyone can check it.</p>
              </li>
              <li>
                <span className="n">03</span>
                <h3>Decide about the rest</h3>
                <p>If it is good, send each agenda and packet before you post it, or point us at the page they go up on. If not, you have lost nothing and kept a fixed PDF.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="kl-band tint" aria-labelledby="date">
          <div className="kl-wrap kl-two">
            <div>
              <h2 id="date">The date on this</h2>
              <p>
                The Justice Department’s rule under Title II of the ADA covers what state and local governments publish online, PDFs included. The standard is WCAG 2.1, Level AA. In April 2026 the dates moved back one year; the standard did not change.
              </p>
              <p>
                From your date on, every document you post has to meet it: each agenda, packet, set of minutes and budget. Older documents are exempt unless people still need them to apply for or take part in a service. So the work is not a one-time cleanup. It is every meeting, from then on.
              </p>
              <p>Most agendas and packets we check are exported without tags: a screen reader reads the words but gets no headings, no table structure and no set reading order. Scanned pages read as blank.</p>
            </div>
            <div className="kl-fact">
              <dl>
                <dt>April 26, 2027</dt>
                <dd>Governments serving 50,000 people or more.</dd>
                <dt>April 26, 2028</dt>
                <dd>Governments serving fewer than 50,000, and all special districts.</dd>
              </dl>
              <p className="src">
                Source: <a href="https://www.govinfo.gov/content/pkg/FR-2026-04-20/html/2026-07663.htm">Justice Department interim final rule, 91 FR 20902 (April 20, 2026)</a>, amending <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H">28 CFR Part 35, Subpart H</a>. The dates are being challenged in court and could change again. This page is not legal advice.
              </p>
            </div>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="price">
          <div className="kl-wrap kl-two">
            <div>
              <h2 id="price">The price after the free one</h2>
              <p className="kl-price">
                $1 <small>a page</small>
              </p>
              <p>Remediation by hand usually runs $4 to $12 a page, with a minimum order. Ours is one price for every kind of page, with no minimum and no contract. A purchase order or a card, whichever your office uses.</p>
            </div>
            <div>
              <h3>Every file comes back with</h3>
              <ul className="kl-list">
                <li>Tags and a reading order that follows the page</li>
                <li>Headings, lists and table headers marked as what they are</li>
                <li>A description for every image and chart</li>
                <li>Readable text where the original was a scan</li>
                <li>The document’s title and language set</li>
                <li>The checker’s report, before and after</li>
                <li>A transcript of what a screen reader will read</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="who">
          <div className="kl-wrap kl-two">
            <div>
              <h2 id="who">Who does the work</h2>
              <p>Kochito Labs is a small company, and the fixing is done by AI agents. That is why the price is what it is, and why a 400-page budget takes a day and not a month.</p>
              <p>
                Nothing goes back to you on trust. Every file is run through veraPDF, the open-source checker for the PDF/UA standard, and its report comes with the file. A checker only proves the structure is there, not that it is right, so you also get a transcript of what a screen reader will read, with every image description and every word we corrected in a scan marked for you to glance at.
              </p>
            </div>
            <div className="kl-faq">
              <h2>Questions</h2>
              <details>
                <summary>Does the fixed PDF look different?</summary>
                <p>No. We add the structure around what is already on the page and leave the page itself untouched, so it prints and looks exactly as before.</p>
              </details>
              <details>
                <summary>Our old minutes are scans. Can you fix those?</summary>
                <p>Yes, if the scan is legible. We read it, put real text behind the image and tag it. If a page is too faint to read with confidence, the report says which one.</p>
              </details>
              <details>
                <summary>What about forms people fill in?</summary>
                <p>We make a form readable: a screen reader will announce every question and check box. Turning a printed form into one that can be filled in on screen is separate work we do not do yet, and we will say so if you send one.</p>
              </details>
              <details>
                <summary>What happens to the documents we send?</summary>
                <p>They are used to do the work and nothing else, and deleted 30 days after delivery, or sooner if you ask. Send only documents that are already public, or that you are allowed to share.</p>
              </details>
              <details>
                <summary>Is this a compliance guarantee?</summary>
                <p>No, and be careful with anyone who offers one. You get documents that pass the standard’s machine checks and a report showing it, which is what an auditor asks for first.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="kl-wrap kl-close">
          <h2>Pick your worst PDF.</h2>
          <p className="kl-lede" style={{ margin: '0 auto 14px' }}>
            The one with the tables. We will send it back fixed.
          </p>
          <a className="kl-btn" href="#start">
            Fix my PDF, free
          </a>
        </section>
      </main>
      <Foot />
    </div>
  )
}

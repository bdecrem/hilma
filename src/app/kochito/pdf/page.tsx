import type { Metadata } from 'next'
import DocVisual from '../DocVisual'
import LeadForm from '../LeadForm'
import Track from '../Track'
import { brand } from '../brand'
import { Foot, Top } from '../Chrome'

// kochitolabs.com/pdf: accessible PDFs for city and county websites. One
// offer (send a PDF, get it back readable by a screen reader, the first one
// free), one form. Every fact here (dates, prices, the example's numbers) is
// sourced in Venture's private notes; change it there first.
const TITLE = 'Accessible PDFs for city and county websites'
const DESCRIPTION = 'Send an agenda, a budget or scanned minutes. We return the same document, tagged so a screen reader can read it, with the checker’s report. The first document is free.'

export const metadata: Metadata = {
  title: { absolute: `ClerkPDF: ${TITLE}` },
  description: DESCRIPTION,
  alternates: { canonical: 'https://clerkpdf.com' },
  openGraph: { title: `ClerkPDF: ${TITLE}`, description: DESCRIPTION, url: 'https://clerkpdf.com', siteName: 'ClerkPDF', type: 'website' },
}

const form = {
  page: 'pdf',
  emailPlaceholder: 'name@yourcity.gov',
  button: 'Fix one PDF free',
  under: 'No account and no card. Reply to our email with the file, or',
  moreLabel: 'add a link to it now',
  detailLabel: 'Link to the PDF',
  detailPlaceholder: 'https://yourcity.gov/agenda.pdf',
  done: 'Your fixed PDF and its report will arrive within one business day.',
}

// The yearly plan. Price and page cap are set in the private notes
// (YEARLY-PLAN-2026-11-14.md); change them there first.
const YEARLY = { price: '$2,900', pages: '10,000' }

export default async function PdfDesk() {
  const { email } = await brand()
  return (
    <>
      <Track page="pdf" />
      <Top current="pdf" cta="Fix one PDF free" />
      <main id="main">
        <div className="kl-wrap kl-hero">
          <div>
            <p className="kl-kicker">For city and county clerks</p>
            <h1>Every PDF you post, readable by a screen reader.</h1>
            <p className="kl-lede">Send an agenda, a budget or a set of scanned minutes. You get the same document back with the structure a screen reader needs, and the checker’s report to prove it. The first one is free.</p>
            <LeadForm {...form} fromEmail={email} />
            <ul className="kl-trust">
              <li>
                <strong>$1</strong> per page
              </li>
              <li>
                <strong>One business day</strong>
              </li>
              <li>
                Checked with <strong>veraPDF</strong>
              </li>
            </ul>
          </div>
          <DocVisual />
        </div>

        <section className="kl-band dark" aria-labelledby="results">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="results">One real agenda, before and after.</h2>
              <p>A three-page city council agenda, posted in November 2026 and fixed by us the same week.</p>
            </div>
            <dl className="kl-stats">
              <div>
                <dd>
                  <span className="from">227</span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="kl-sr"> to </span>
                  <span className="to">0</span>
                </dd>
                <dt>failed checks against the PDF/UA standard</dt>
              </div>
              <div>
                <dd>
                  7<small>added</small>
                </dd>
                <dt>headings, with a list, an image description and two labeled links</dt>
              </div>
              <div>
                <dd>
                  0<small>of 3</small>
                </dd>
                <dt>pages that look any different</dt>
              </div>
            </dl>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="back">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="back">What you get back</h2>
              <p>Three things, every time. The second and third are how you know the first is right.</p>
            </div>
            <div className="kl-cards">
              <div className="kl-card">
                <div className="kl-art thumb" aria-hidden="true">
                  <div className="kl-thumb">
                    <i className="h" />
                    <i />
                    <i className="s" />
                    <i className="g" />
                    <i />
                    <i className="s" />
                    <i />
                  </div>
                </div>
                <h3>The fixed PDF</h3>
                <p>Tags, reading order, headings, lists, table headers, a description for every image and chart, the title and the language. Scans get real text behind the image.</p>
              </div>
              <div className="kl-card">
                <div className="kl-art" aria-hidden="true">
                  <div className="row">
                    <span>veraPDF</span>
                    <b>PDF/UA-1</b>
                  </div>
                  <div className="row">
                    <span>Passed checks</span>
                    <b>9,739</b>
                  </div>
                  <div className="row">
                    <span>Failed checks</span>
                    <b>0</b>
                  </div>
                  <div className="row">
                    <span>Result</span>
                    <span className="pass">PASS</span>
                  </div>
                </div>
                <h3>The checker’s report</h3>
                <p>veraPDF is the open-source reference checker for the PDF/UA standard. You get its results for the original and for the fixed file, rule by rule.</p>
              </div>
              <div className="kl-card">
                <div className="kl-art" aria-hidden="true">
                  <div className="t">
                    <b>HEADING 1</b>
                    <span>City Council Regular Meeting Agenda</span>
                  </div>
                  <div className="t">
                    <b>IMAGE</b>
                    <span>“Seal of the city”</span>
                  </div>
                  <div className="t">
                    <b>HEADING 2</b>
                    <span>Consent agenda</span>
                  </div>
                  <div className="t">
                    <b>TABLE</b>
                    <span>Item, Description, Amount</span>
                  </div>
                  <div className="t">
                    <b>LINK</b>
                    <span>Staff report 26-114</span>
                  </div>
                </div>
                <h3>A reading transcript</h3>
                <p>The whole document, read from its tags in the order a screen reader follows. A checker proves the structure exists, not that it is right; the transcript lets anyone in your office confirm it in minutes.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="kl-band tint" aria-labelledby="dates">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="dates">The ADA Title II dates</h2>
              <p>The Justice Department’s rule covers what state and local governments publish online, PDFs included. The standard is WCAG 2.1, Level AA.</p>
            </div>
            <ol className="kl-time">
              <li className="past">
                <span className="when">April 2026</span>
                <p>The compliance dates moved back one year. The standard did not change.</p>
              </li>
              <li>
                <time dateTime="2027-04-26">April 26, 2027</time>
                <p>Governments serving 50,000 people or more.</p>
              </li>
              <li>
                <time dateTime="2028-04-26">April 26, 2028</time>
                <p>Governments serving fewer than 50,000, and all special districts.</p>
              </li>
            </ol>
            <p className="kl-callout">From your date on, every document you post has to meet the standard: each agenda, packet, set of minutes and budget. Older documents are exempt unless people still need them to apply for or take part in a service. It is not a one-time cleanup. It is every meeting from then on.</p>
            <p className="kl-src">
              Source: <a href="https://www.govinfo.gov/content/pkg/FR-2026-04-20/html/2026-07663.htm">91 FR 20902 (April 20, 2026)</a>, amending <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H">28 CFR Part 35, Subpart H</a>. The dates are being challenged in court and may change. This page is not legal advice.
            </p>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="price">
          <div className="kl-wrap kl-split">
            <div>
              <h2 id="price" className="kl-sr">
                Price
              </h2>
              <p className="kl-price">
                $1<span>per page</span>
              </p>
              <p className="kl-lede">One price for every kind of page: text, tables, charts and scans. No minimum order, no contract. Billed by invoice; a purchase order is fine.</p>
            </div>
            <ul className="kl-bars" aria-label="Price per page, compared">
              <li className="us">
                <div className="lab">
                  <b>Kochito Labs</b>
                  <span>$1 per page</span>
                </div>
                <div className="bar" aria-hidden="true">
                  <i />
                </div>
              </li>
              <li className="hand">
                <div className="lab">
                  <b>Remediation by hand</b>
                  <span>$4 to $18 per page, most with a minimum order</span>
                </div>
                <div className="bar" aria-hidden="true">
                  <i />
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="kl-band rule" aria-labelledby="yearly">
          <div className="kl-wrap">
            <div className="kl-plan">
              <div>
                <p className="kl-kicker">The yearly plan</p>
                <h2 id="yearly">Or have every one done, all year.</h2>
                <p className="kl-lede">We watch your agenda page. Each agenda, packet and set of minutes your council posts comes back fixed within one business day. There is nothing to send and nothing to remember.</p>
                <p className="kl-price kl-price-2">
                  {YEARLY.price}
                  <span>per year</span>
                </p>
                <p className="kl-plan-terms">Everything one governing body posts, up to {YEARLY.pages} pages a year; larger councils are quoted. A one-year term with no automatic renewal. Billed by invoice; a purchase order is fine.</p>
              </div>
              <ol className="kl-time kl-watch" aria-label="What happens when you post a document">
                <li>
                  <span className="when">Thursday, 4:10 pm</span>
                  <p>You post the packet for next week’s meeting, as you do today.</p>
                </li>
                <li>
                  <span className="when">The same afternoon</span>
                  <p>We find it on your agenda page. Nobody had to send it.</p>
                </li>
                <li>
                  <span className="when">Friday</span>
                  <p>The fixed packet and its report are in your inbox, ready to post in place of the original.</p>
                </li>
              </ol>
            </div>
            <ul className="kl-plan-facts">
              <li>
                <b>Nothing to send</b>
                <span>We find each new document on your agenda page. To post the fixed one first, send it ahead and it comes back the same way.</span>
              </li>
              <li>
                <b>The file itself, fixed</b>
                <span>The same pages with the same look, tagged, to post in place of the original. Not a separate web copy.</span>
              </li>
              <li>
                <b>A report with every file</b>
                <span>The checker’s result and the reading transcript, and one log for the year: what was posted, when it came back, how many pages.</span>
              </li>
              <li>
                <b>Fixed again, free</b>
                <span>If anyone reports a problem in a file we returned, we correct it within one business day, for as long as the file is posted.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="kl-band rule" aria-labelledby="how">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="how">How it works</h2>
            </div>
            <ol className="kl-steps">
              <li>
                <h3>Send one PDF</h3>
                <p>A link or the file itself. Choose a difficult one: a packet with tables, or scanned minutes.</p>
              </li>
              <li>
                <h3>Receive the fixed file</h3>
                <p>Within one business day, with the checker’s report and the reading transcript.</p>
              </li>
              <li>
                <h3>Decide about the rest</h3>
                <p>If it is good, send each agenda and packet as you post it, or take the yearly plan and send nothing. If it is not, you owe nothing and keep the fixed document.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="kl-band tint" aria-labelledby="who">
          <div className="kl-wrap">
            <h2 id="who" className="kl-sr">
              Who does the work
            </h2>
            <p className="kl-quote">The fixing is done by AI agents. That is why it costs $1 a page, and why a 400-page budget takes a day and not a month.</p>
            <p className="kl-prose" style={{ color: 'var(--ink-2)' }}>
              Nothing is delivered on trust. Every file is run through veraPDF before it leaves us, and the transcript marks each image description we wrote and each word we corrected in a scan, so a person on your side can review exactly those. Kochito Labs is a small company; a reply to any of our emails reaches us.
            </p>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="questions">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="questions">Questions</h2>
            </div>
            <div className="kl-qa">
              <div>
                <details>
                  <summary>Does the fixed PDF look different?</summary>
                  <p>No. We add structure around what is already on the page and leave the page itself untouched. One exception: if a PDF does not carry its own fonts, the standard requires them, so we embed open-licensed fonts of the same size and spacing. The letters may look slightly different; nothing moves.</p>
                </details>
                <details>
                  <summary>Can you fix scanned documents?</summary>
                  <p>Yes, if the scan is legible. We put real text behind the image and tag it. If a page is too faint to read with confidence, the report says which one.</p>
                </details>
                <details>
                  <summary>What about forms people fill in?</summary>
                  <p>We make a form readable, so a screen reader announces every question and check box. Making a printed form fillable on screen is separate work that we do not offer yet.</p>
                </details>
              </div>
              <div>
                <details>
                  <summary>What happens to the documents we send?</summary>
                  <p>They are used to do the work and for nothing else, and are deleted 30 days after delivery, or sooner on request. Please send only documents that are public or that you are allowed to share.</p>
                </details>
                <details>
                  <summary>Will every screen reader user hear the structure?</summary>
                  <p>That depends on the program a person opens the PDF with. The viewer built into Firefox reads our headings, lists and decoration marks from the file and hands them to a screen reader; we inspected what it hands over, and a test with a screen reader itself is still to come. Adobe Acrobat Reader also reads PDF tags. Chrome’s built-in viewer currently ignores the tags of any PDF, ours or anyone’s. The standard asks for the structure to be in the file, and that is what we add.</p>
                </details>
                <details>
                  <summary>Is this a guarantee of compliance?</summary>
                  <p>No. You receive documents that pass the standard’s machine checks, with the report and a transcript to review. No vendor can guarantee compliance for you.</p>
                </details>
                <details>
                  <summary>Our agendas come from an agenda system. Does that matter?</summary>
                  <p>No. We work on the PDF as it is posted, whichever system produced it.</p>
                </details>
              </div>
            </div>
          </div>
        </section>

        <section className="kl-band dark">
          <div className="kl-wrap kl-close">
            <h2>Send one PDF and see the result.</h2>
            <LeadForm {...form} fromEmail={email} anchor={false} />
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}

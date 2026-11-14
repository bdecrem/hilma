import type { Metadata } from 'next'
import LeadForm from '../LeadForm'
import Track from '../Track'
import { Foot, Top } from '../Chrome'

// kochitolabs.com/pdf: accessible PDFs for city and county websites. One
// offer (send a PDF, get it back readable by a screen reader, the first one
// free), one form. Every fact here (dates, prices, the example's numbers) is
// sourced in Venture's private notes; change it there first.
const TITLE = 'Accessible PDFs for city and county websites'
const DESCRIPTION = 'Send an agenda, a budget or scanned minutes. We return the same document, tagged so a screen reader can read it, with the checker’s report. The first document is free.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pdf' },
  openGraph: { title: `${TITLE} | Kochito Labs`, description: DESCRIPTION, url: 'https://kochitolabs.com/pdf', siteName: 'Kochito Labs', type: 'website' },
}

export default function PdfDesk() {
  return (
    <>
      <Track page="pdf" />
      <Top current="pdf" />
      <main id="main">
        <div className="kl-wrap kl-hero">
          <div>
            <h1>{TITLE}</h1>
            <p className="kl-lede">Send us an agenda, a budget or a set of scanned minutes. We return the same document, tagged so a screen reader can read it, together with the checker’s report. The first document is free.</p>
            <ul className="kl-points">
              <li>
                <strong>$1 per page</strong> after the first document. No minimum and no contract.
              </li>
              <li>
                <strong>One business day</strong> for most documents.
              </li>
              <li>
                <strong>Nothing changes on the page.</strong> We add structure underneath; the document looks and prints as before.
              </li>
            </ul>
          </div>
          <LeadForm
            page="pdf"
            heading="Have one PDF fixed, free"
            intro="No account, no card and no sales call."
            emailPlaceholder="name@yourcity.gov"
            detailLabel="Link to the PDF"
            detailPlaceholder="https://"
            detailHint="Or leave this empty and send the file in reply to our email."
            button="Request the free fix"
            done="Your fixed PDF and its report will arrive within one business day."
          />
        </div>

        <section className="kl-band" aria-labelledby="example">
          <div className="kl-wrap kl-split">
            <div>
              <h2 id="example">What changes in a document</h2>
              <p>These are the results for one real document: a three-page city council agenda, posted in November 2026 and fixed by us the same week.</p>
              <p className="kl-note">The checker is veraPDF, the open-source reference checker for the PDF/UA standard. Its full report comes with every document.</p>
            </div>
            <table className="kl-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="kl-skip">Measure</span>
                  </th>
                  <th scope="col">As posted</th>
                  <th scope="col">After fixing</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Tagged for screen readers</th>
                  <td>No</td>
                  <td>Yes</td>
                </tr>
                <tr>
                  <th scope="row">Headings</th>
                  <td className="num">0</td>
                  <td className="num">7</td>
                </tr>
                <tr>
                  <th scope="row">Lists</th>
                  <td className="num">0</td>
                  <td className="num">1</td>
                </tr>
                <tr>
                  <th scope="row">Images with a description</th>
                  <td className="num">0 of 1</td>
                  <td className="num">1 of 1</td>
                </tr>
                <tr>
                  <th scope="row">Links with a label</th>
                  <td className="num">0 of 2</td>
                  <td className="num">2 of 2</td>
                </tr>
                <tr>
                  <th scope="row">Document language</th>
                  <td>Not set</td>
                  <td>English</td>
                </tr>
                <tr>
                  <th scope="row">Failed checks, PDF/UA-1</th>
                  <td className="num bad">227</td>
                  <td className="num good">0</td>
                </tr>
                <tr>
                  <th scope="row">Pages that look different</th>
                  <td>n/a</td>
                  <td className="num">0 of 3</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="kl-band alt" aria-labelledby="back">
          <div className="kl-wrap kl-split">
            <h2 id="back">What you get back</h2>
            <dl className="kl-rows">
              <div>
                <dt>The fixed PDF</dt>
                <dd>Tags, a reading order that follows the page, headings, lists, table headers, a description for every image and chart, the document’s title and language. Scanned pages get real text behind the image.</dd>
              </div>
              <div>
                <dt>The checker’s report</dt>
                <dd>veraPDF’s PDF/UA-1 results for the original and for the fixed file, rule by rule.</dd>
              </div>
              <div>
                <dt>A reading transcript</dt>
                <dd>The whole document as a screen reader walks it. A checker proves the structure exists, not that it is right; the transcript lets anyone in your office confirm it in a few minutes.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="dates">
          <div className="kl-wrap kl-split">
            <div>
              <h2 id="dates">The ADA Title II dates</h2>
              <p>The Justice Department’s rule covers what state and local governments publish online, PDFs included. The standard is WCAG 2.1, Level AA. In April 2026 the compliance dates moved back one year; the standard did not change.</p>
            </div>
            <div>
              <table className="kl-table">
                <thead>
                  <tr>
                    <th scope="col">Applies to</th>
                    <th scope="col">Compliance date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>State and local governments serving 50,000 people or more</td>
                    <td className="date">April 26, 2027</td>
                  </tr>
                  <tr>
                    <td>Governments serving fewer than 50,000 people, and all special districts</td>
                    <td className="date">April 26, 2028</td>
                  </tr>
                </tbody>
                <caption>
                  Source: <a href="https://www.govinfo.gov/content/pkg/FR-2026-04-20/html/2026-07663.htm">91 FR 20902 (April 20, 2026)</a>, amending <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H">28 CFR Part 35, Subpart H</a>. The dates are being challenged in court and may change. This page is not legal advice.
                </caption>
              </table>
              <p className="kl-callout">
                From your date on, every document you post has to meet the standard: each agenda, packet, set of minutes and budget. Documents posted earlier are exempt unless people still need them to apply for or take part in a service. The work is not a one-time cleanup. It is every meeting from then on.
              </p>
            </div>
          </div>
        </section>

        <section className="kl-band alt" aria-labelledby="price">
          <div className="kl-wrap kl-split">
            <h2 id="price">Price</h2>
            <div className="kl-prose">
              <p className="kl-price">
                $1 <span>per page</span>
              </p>
              <p>One price for every kind of page: text, tables, charts and scans. There is no minimum order and no contract. We accept a purchase order or a card.</p>
              <p>For comparison, remediation by hand is usually quoted at $4 to $12 per page, with a minimum order.</p>
            </div>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="how">
          <div className="kl-wrap kl-split">
            <h2 id="how">How it works</h2>
            <ol className="kl-steps kl-prose">
              <li>
                <strong>Send one PDF.</strong> A link or the file itself. Choose a difficult one: a packet with tables, or scanned minutes.
              </li>
              <li>
                <strong>Receive the fixed file.</strong> Within one business day, with the checker’s report and the reading transcript.
              </li>
              <li>
                <strong>Decide about the rest.</strong> If the result is good, send each agenda and packet before you post it, or tell us which page they are posted on. If it is not, you owe nothing and keep the fixed document.
              </li>
            </ol>
          </div>
        </section>

        <section className="kl-band alt" aria-labelledby="who">
          <div className="kl-wrap kl-split">
            <h2 id="who">Who does the work</h2>
            <div className="kl-prose">
              <p>Kochito Labs is a small company. The fixing is done by AI agents, which is why the price is $1 per page and why a 400-page budget takes a day and not a month.</p>
              <p>Nothing is delivered on trust. Every file is run through veraPDF before it leaves us, and the transcript marks every image description we wrote and every word we corrected in a scan, so a person on your side can review exactly those.</p>
            </div>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="questions">
          <div className="kl-wrap">
            <h2 id="questions">Questions</h2>
            <div className="kl-qa">
              <div>
                <h3>Does the fixed PDF look different?</h3>
                <p>No. We add structure around what is already on the page and leave the page itself untouched. It looks and prints exactly as before.</p>
              </div>
              <div>
                <h3>Can you fix scanned documents?</h3>
                <p>Yes, if the scan is legible. We put real text behind the image and tag it. If a page is too faint to read with confidence, the report says which one.</p>
              </div>
              <div>
                <h3>What about forms people fill in?</h3>
                <p>We make a form readable, so a screen reader announces every question and check box. Making a printed form fillable on screen is separate work that we do not offer yet.</p>
              </div>
              <div>
                <h3>What happens to the documents we send?</h3>
                <p>They are used to do the work and for nothing else, and are deleted 30 days after delivery, or sooner on request. Please send only documents that are public or that you are allowed to share.</p>
              </div>
              <div>
                <h3>Is this a guarantee of compliance?</h3>
                <p>No. You receive documents that pass the standard’s machine checks, with the report and a transcript to review. No vendor can guarantee compliance for you.</p>
              </div>
              <div>
                <h3>Our agendas come from an agenda system. Does that matter?</h3>
                <p>No. We work on the PDF as it is posted, whichever system produced it.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="kl-band alt">
          <div className="kl-wrap kl-close">
            <h2>Send one PDF and see the result.</h2>
            <a className="kl-btn" href="#start">
              Request the free fix
            </a>
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}

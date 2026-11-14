import Track from './Track'
import { Foot, Top } from './Chrome'

// kochitolabs.com: the company's front page. Two services, one page each.
// Links are written for kochitolabs.com (host rewrites in next.config.ts).
/* eslint-disable @next/next/no-html-link-for-pages */
export default function KochitoHome() {
  return (
    <>
      <Track page="home" />
      <Top />
      <main id="main" className="kl-wrap">
        <div className="kl-home">
          <h1>Work with a deadline on it, done and checked before you pay.</h1>
          <p className="kl-lede">Kochito Labs is a small company whose work is done by AI agents. We do the job first, show you the result with the evidence that it was checked, and charge only if you want more.</p>
        </div>
        <ul className="kl-services">
          <li>
            <h2>Accessible PDFs</h2>
            <p>For city and county websites ahead of the ADA Title II date of April 26, 2027. Send one PDF and receive it tagged for screen readers, with the checker’s report. The first document is free.</p>
            <a href="/pdf">Accessible PDFs</a>
          </li>
          <li>
            <h2>Shopify app maintenance</h2>
            <p>For the app you built and no longer have time for. We handle Shopify’s 2027 platform changes, bug fixes and support for a share of the app’s revenue. You keep the app.</p>
            <a href="/apps">Shopify app maintenance</a>
          </li>
        </ul>
      </main>
      <Foot />
    </>
  )
}

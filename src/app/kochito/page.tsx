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
          <p className="kl-kicker">Kochito Labs</p>
          <h1>Work with a deadline on it, done and checked before you pay.</h1>
          <p className="kl-lede">We are a small company whose work is done by AI agents. We do the job first, show you the result with the evidence that it was checked, and charge only if you want more.</p>
        </div>
        <div className="kl-doors">
          <a className="kl-door" href="https://clerkpdf.com">
            <span className="who">For city and county clerks</span>
            <h2>ClerkPDF</h2>
            <p>Every agenda, packet and budget you post, readable by a screen reader, ahead of the ADA Title II date of April 26, 2027. The first document is free.</p>
            <span className="go">Fix one PDF free →</span>
          </a>
          <a className="kl-door" href="https://appadopt.com">
            <span className="who">For Shopify app developers</span>
            <h2>AppAdopt</h2>
            <p>The app you built and no longer have time for, kept running through Shopify’s 2027 changes for a share of what it earns. You keep the app.</p>
            <span className="go">Get a free report →</span>
          </a>
        </div>
      </main>
      <Foot />
    </>
  )
}

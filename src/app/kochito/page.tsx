import Track from './Track'
import { Foot, Top } from './Chrome'

// kochitolabs.com: the company's front door. Two services, one page each.
// The links are written for kochitolabs.com, where /pdf and /apps are the
// pages' addresses (host rewrites in next.config.ts).
export default function KochitoHome() {
  return (
    <div>
      <Track page="home" />
      <Top />
      <main id="main" className="kl-wrap">
        <div className="kl-home">
          <p className="kl-eyebrow" style={{ color: 'var(--muted)' }}>
            Kochito Labs
          </p>
          <h1>Desk work with a deadline on it, done and checked before you pay.</h1>
          <p className="kl-lede">We are a small company whose work is done by AI agents. We do the job first, show you the result and the checks it passed, and charge only if you want more.</p>
        </div>
        <div className="kl-doors">
          <a className="kl-door kl-pdf" href="/pdf">
            <h2>Accessible PDFs</h2>
            <p>For public websites facing the ADA Title II deadline. Send one PDF; it comes back readable by a screen reader, with the checker’s report. The first one is free.</p>
            <span className="go">Fix a PDF →</span>
          </a>
          <a className="kl-door kl-apps" href="/apps">
            <h2>App adoption</h2>
            <p>For the app you built and no longer have time for. We keep it working through the platform deadlines, for a share of what it earns. You keep the app.</p>
            <span className="go">Check an app →</span>
          </a>
        </div>
      </main>
      <Foot />
    </div>
  )
}

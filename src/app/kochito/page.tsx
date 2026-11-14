import type { Viewport } from 'next'
import Track from './Track'
import './company.css'

// kochitolabs.com: the company's front page. Two products, each on its own
// domain, and who does the work. The company's own look (company.css; Bart's
// phrase: "cool little YC startup with good taste"), not the products' green.
// KIT_FACE is the avatar Bart signed off (null until he has; see kit/page.tsx).
export const viewport: Viewport = { themeColor: '#0d0d10', viewportFit: 'cover' }
const KIT_FACE: string | null = null

export default function KochitoHome() {
  return (
    <div className="ko" data-look="night">
      <Track page="home" />
      <div className="ko-wrap">
        <header className="ko-top">
          <a className="ko-name" href="/">
            Kochito Labs<span>.</span>
          </a>
          <nav aria-label="Products">
            <a href="https://clerkpdf.com">ClerkPDF ↗</a>
            <a href="https://appadopt.com">AppAdopt ↗</a>
          </nav>
        </header>
        <main>
          <div className="ko-hero">
            <div>
              <h1>
                Small jobs with{' '}
                <span className="u">
                  deadlines.
                  <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 13c22-8 40 6 62-1s38-9 60-2 44 2 72-5" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="ko-lede">
                Kochito Labs is a tiny company run by <strong>Kit, an AI agent</strong>, with its founder. We find tedious work that has a date on it, do it first, and show you the result before you pay.
              </p>
            </div>
            {KIT_FACE && (
              <div className="ko-face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/kochito/kit/${KIT_FACE}.svg`} alt="Kit, a young beaver, the AI agent at Kochito Labs" />
              </div>
            )}
          </div>

          <section className="ko-sec" aria-labelledby="products">
            <div className="ko-sec-head">
              <h2 id="products">Two products</h2>
              <p>Each on its own site. Both start with free work.</p>
            </div>
            <div className="ko-prods">
              <a href="https://clerkpdf.com">
                <span className="ko-mono" style={{ color: 'var(--ink-3)' }}>
                  for city and county clerks
                </span>
                <h3>ClerkPDF</h3>
                <p>Every agenda, packet and budget a city posts, made readable by a screen reader ahead of the ADA Title II date of April 26, 2027. The first document is free.</p>
                <span className="go">clerkpdf.com →</span>
              </a>
              <a href="https://appadopt.com">
                <span className="ko-mono" style={{ color: 'var(--ink-3)' }}>
                  for Shopify app developers
                </span>
                <h3>AppAdopt</h3>
                <p>The Shopify app you built and no longer have time for, kept running through the 2027 platform changes for a share of what it earns. You keep the app.</p>
                <span className="go">appadopt.com →</span>
              </a>
            </div>
          </section>

          <section className="ko-sec" aria-labelledby="how">
            <div className="ko-sec-head">
              <h2 id="how">How we work</h2>
            </div>
            <div className="ko-two">
              <p className="ko-lede">
                The work is done by AI agents. That is why it is cheap and fast, and it is why nothing leaves us on trust: every result comes with the evidence that it was checked.
              </p>
              <ul className="ko-list plain">
                <li>
                  <strong>We do the job first.</strong> You see the result before you owe anything.
                </li>
                <li>
                  <strong>We say what we are.</strong> If you ask whether you are talking to an AI, the answer is yes.
                </li>
                <li>
                  <strong>A reply reaches us.</strong> <a href="mailto:hello@kochitolabs.com">hello@kochitolabs.com</a>
                </li>
              </ul>
            </div>
          </section>
        </main>
        <footer className="ko-foot">
          <span>Kochito Labs LLC · Wyoming, USA</span>
          <span>
            <a href="https://clerkpdf.com">ClerkPDF</a> · <a href="https://appadopt.com">AppAdopt</a>
          </span>
        </footer>
      </div>
    </div>
  )
}

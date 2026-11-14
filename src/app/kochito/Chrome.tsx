// The header and the footer every kochitolabs.com page shares. Links are
// written for kochitolabs.com, where /pdf and /apps are the pages' addresses
// (host rewrites in next.config.ts), so they are plain anchors.
/* eslint-disable @next/next/no-html-link-for-pages */
export function Top({ current }: { current?: 'pdf' | 'apps' }) {
  return (
    <>
      <a className="kl-skip" href="#main">
        Skip to main content
      </a>
      <header className="kl-head">
        <div className="kl-wrap">
          <a className="kl-mark" href="/">
            Kochito Labs
          </a>
          <nav className="kl-nav" aria-label="Services">
            <a href="/pdf" aria-current={current === 'pdf' ? 'page' : undefined}>
              Accessible PDFs
            </a>
            <a href="/apps" aria-current={current === 'apps' ? 'page' : undefined}>
              Shopify apps
            </a>
            <a href="mailto:hello@kochitolabs.com">Contact</a>
          </nav>
        </div>
      </header>
    </>
  )
}

export function Foot() {
  return (
    <footer className="kl-foot">
      <div className="kl-wrap">
        <div>
          <strong>Kochito Labs LLC</strong>
          Wyoming, USA
          <br />
          <a href="mailto:hello@kochitolabs.com">hello@kochitolabs.com</a>
        </div>
        <div>
          <strong>Services</strong>
          <ul>
            <li>
              <a href="/pdf">Accessible PDFs</a>
            </li>
            <li>
              <a href="/apps">Shopify app maintenance</a>
            </li>
          </ul>
        </div>
        <div>
          <strong>How we work</strong>
          Our work is done by AI agents and checked before it is delivered. Every result comes with the evidence that it was checked.
        </div>
      </div>
    </footer>
  )
}

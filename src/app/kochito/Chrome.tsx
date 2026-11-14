import { brand } from './brand'

// The header and the footer every page shares. On kochitolabs.com the header
// lists the two services; on a service's own domain (clerkpdf.com,
// appadopt.com) it carries the service's name and links into the page. Links
// are plain anchors: the addresses are per host (rewrites in next.config.ts).
/* eslint-disable @next/next/no-html-link-for-pages */
export async function Top({ current, cta }: { current?: 'pdf' | 'apps'; cta?: string }) {
  const b = await brand()
  return (
    <>
      <a className="kl-skip" href="#main">
        Skip to main content
      </a>
      <header className="kl-head">
        <div className="kl-wrap">
          <a className="kl-mark" href={b.home}>
            {b.name}
          </a>
          <nav className="kl-nav" aria-label={b.site === 'kochito' ? 'Services' : 'On this page'}>
            {b.site === 'kochito' ? (
              <>
                <a href="/pdf" aria-current={current === 'pdf' ? 'page' : undefined}>
                  Accessible PDFs
                </a>
                <a href="/apps" aria-current={current === 'apps' ? 'page' : undefined}>
                  Shopify apps
                </a>
              </>
            ) : (
              <>
                <a href="/#how">{b.site === 'clerkpdf' ? 'How it works' : 'How it starts'}</a>
                <a href={b.site === 'clerkpdf' ? '/#price' : '/#terms'}>{b.site === 'clerkpdf' ? 'Price' : 'Terms'}</a>
                <a href="/#questions">Questions</a>
              </>
            )}
            <a href="mailto:hello@kochitolabs.com">Contact</a>
            {cta && (
              <a className="kl-nav-cta" href="#start">
                {cta}
              </a>
            )}
          </nav>
        </div>
      </header>
    </>
  )
}

export async function Foot() {
  const b = await brand()
  return (
    <footer className="kl-foot">
      <div className="kl-wrap">
        <div>
          <strong>{b.site === 'kochito' ? 'Kochito Labs LLC' : `${b.name}, a service of Kochito Labs LLC`}</strong>
          Wyoming, USA
          <br />
          <a href="mailto:hello@kochitolabs.com">hello@kochitolabs.com</a>
        </div>
        <div>
          <strong>Kochito Labs</strong>
          <ul>
            <li>
              <a href="https://clerkpdf.com">ClerkPDF: accessible PDFs</a>
            </li>
            <li>
              <a href="https://appadopt.com">AppAdopt: Shopify app maintenance</a>
            </li>
            <li>
              <a href="https://kochitolabs.com">The company</a>
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

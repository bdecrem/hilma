import type { Metadata } from 'next'
import Link from 'next/link'
import content from './content.json'
import { SHEETS } from '../Sheet'
import { Tick } from '../Bits'

// bartin16.xyz/seminar/claude: how to get a free Claude account (Stanford's Claude for
// Education for fellows, a reimbursed month of Pro for visiting scholars) and sign in to
// it in the desktop app. Linked from the card at the top of /seminar. Words in content.json.

const description =
  'How to get a free Claude account for the CASBS seminar on December 2 and sign in to it on your laptop.'
const title = 'Get your free Claude account'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/seminar/claude' },
  openGraph: { title, description, url: '/seminar/claude', type: 'article' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function ClaudeAccountPage() {
  const { get, signin, help } = content
  return (
    <main className="sem-main">
      <header className="sem-head">
        <nav className="sem-sheets" aria-label="Seminar projects">
          <Link href="/seminar">The Seminar</Link>
          <Link href="/seminar/claude" aria-current="page">
            Your Claude account
          </Link>
          {SHEETS.map((sheet) => (
            <Link key={sheet.id} href={sheet.href}>
              {sheet.n} · {sheet.name}
            </Link>
          ))}
        </nav>
        <p className="sem-kicker">{content.kicker}</p>
        <h1 className="sem-title">
          {content.titleBefore}
          <em>{content.titleEmph}</em>
          {content.titleAfter}
        </h1>
        <p className="sem-intro">{content.intro}</p>
        <p className="sem-intro">{content.urgent}</p>
      </header>

      <nav className="sem-toc" aria-label="On this page">
        <a href="#get">
          <span className="sem-toc-label">{get.label}</span>
          <span className="sem-toc-title">{get.title}</span>
          <span className="sem-toc-time">Fellows, visiting scholars</span>
        </a>
        <a href="#signin">
          <span className="sem-toc-label">{signin.label}</span>
          <span className="sem-toc-title">{signin.title}</span>
          <span className="sem-toc-time">Six steps in the app</span>
        </a>
        <a href="#help">
          <span className="sem-toc-label">Any time</span>
          <span className="sem-toc-title">{help.title}</span>
        </a>
      </nav>

      <section id="get" className="sem-part" aria-labelledby="sem-get-h">
        <p className="sem-part-label">{get.label}</p>
        <h2 id="sem-get-h" className="sem-part-title">
          {get.title}
        </h2>
        <div className="sem-paths">
          {get.paths.map((path) => (
            <div key={path.who} className="sem-path">
              <h3>{path.who}</h3>
              <p>{path.body}</p>
              <a className="sem-link" href={path.link.href}>
                {path.link.label}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section id="signin" className="sem-part" aria-labelledby="sem-signin-h">
        <p className="sem-part-label">{signin.label}</p>
        <h2 id="sem-signin-h" className="sem-part-title">
          {signin.title}
        </h2>
        <p className="sem-part-lede">{signin.lede}</p>
        <ol className="sem-steps">
          {signin.steps.map((step, i) => (
            <li key={step.title} className="sem-step">
              <Tick id={`claude-${i + 1}-${step.title}`} n={i + 1} />
              <div className="sem-step-body">
                <h3>{step.title}</h3>
                <p>
                  {step.body}
                  {step.link && (
                    <>
                      {' '}
                      <a className="sem-link" href={step.link.href}>
                        {step.link.label}
                      </a>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="help" className="sem-next" aria-labelledby="sem-help-h">
        <h2 id="sem-help-h" className="sem-part-title">
          {help.title}
        </h2>
        <p>{help.body}</p>
        <p className="sem-thanks">{help.thanks}</p>
      </section>

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import content from './content.json'
import { Tick } from '../Bits'

// bartin16.xyz/seminar/claude: request Stanford's Claude for Education and sign in to it in
// the desktop app, as one short checklist. Linked from the card at the top of /seminar.
// Words in content.json.

const description = 'Get Claude set up on your laptop for the CASBS seminar on December 2.'
const title = 'Setting up Claude'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/seminar/claude' },
  openGraph: { title, description, url: '/seminar/claude', type: 'article' },
  twitter: { card: 'summary_large_image', title, description },
}

type Step = { before?: string; link?: { label: string; href: string }; after?: string }

export default function ClaudeSetupPage() {
  const steps: Step[] = content.steps
  return (
    <main className="sem-main sem-single">
      <p className="sem-kicker">
        <Link href="/seminar" className="sem-back">
          The Seminar
        </Link>{' '}
        · {content.kicker}
      </p>
      <ol className="sem-checklist">
        {steps.map((step, i) => (
          <li key={i}>
            <Tick id={`claude-v2-${i + 1}`} n={i + 1} />
            <p>
              {step.before}
              {step.link && (
                <a className="sem-link" href={step.link.href}>
                  {step.link.label}
                </a>
              )}
              {step.after}
            </p>
          </li>
        ))}
      </ol>
      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

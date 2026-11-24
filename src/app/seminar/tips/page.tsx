import type { Metadata } from 'next'
import Link from 'next/link'
import content from './content.json'

// bartin16.xyz/seminar/tips: project 4, "Roll your own". A few plain tips on using Claude,
// mostly Chat versus the Code tab. Words in content.json.

const description = 'A few tips for building your own thing with Claude: Chat or Code, and getting good results.'
const title = 'Roll your own'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/seminar/tips' },
  openGraph: { title, description, url: '/seminar/tips', type: 'article' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function TipsPage() {
  return (
    <main className="sem-main sem-single">
      <p className="sem-kicker">
        <Link href="/seminar" className="sem-back">
          The Seminar
        </Link>{' '}
        · {content.kicker}
      </p>
      {content.groups.map((group) => (
        <section key={group.title} className="sem-tips" aria-label={group.title}>
          <h2 className="sem-tips-title">{group.title}</h2>
          <ul className="sem-checklist sem-bullets">
            {group.items.map((item) => (
              <li key={item}>
                <p>{item}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

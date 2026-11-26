import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import content from './content.json'
import { Prompt } from '../Bits'

// bartin16.xyz/seminar/newsfeed: project 1, a research newsletter built as a claude.ai
// artifact and kept as an app. The prompts are Bart's, word for word, in content.json; every
// prompt is a code block with a Copy button.

const title = 'Custom newsfeed (as an app)'
const description =
  'A research newsletter that fills itself with live news and new papers, built in one Claude chat and kept as an app on your computer.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/seminar/newsfeed' },
  openGraph: { title, description, url: '/seminar/newsfeed', type: 'article' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function NewsfeedPage() {
  return (
    <main className="sem-main sem-single">
      <p className="sem-kicker">
        <Link href="/seminar" className="sem-back">
          The Seminar
        </Link>{' '}
        · Project 1
      </p>
      <h1 className="sem-s-title">{content.title}</h1>
      <p className="sem-s-intro">{content.intro}</p>
      <Image
        className="sem-p-shot sem-p-hero"
        src={content.hero.src}
        alt={content.hero.alt}
        width={content.hero.width}
        height={content.hero.height}
        sizes="(max-width: 700px) 100vw, 700px"
        priority
      />
      <div className="sem-p-facts">
        {content.facts.map((f) => (
          <p key={f.label}>
            <strong>{f.label}</strong> {f.text}
          </p>
        ))}
      </div>

      {content.steps.map((step) => (
        <section key={step.title} aria-label={step.title}>
          <h2 className="sem-tips-title">{step.title}</h2>
          <Prompt text={step.prompt} />
          {'note' in step && step.note && <p className="sem-p-text">{step.note}</p>}
        </section>
      ))}

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

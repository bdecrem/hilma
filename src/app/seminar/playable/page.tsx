import type { Metadata } from 'next'
import Link from 'next/link'
import content from './content.json'
import Image from 'next/image'
import { Prompt } from '../Bits'

// bartin16.xyz/seminar/playable: project 4, turn one research idea into a small interactive
// artifact in claude.ai. Bart's text, word for word, in content.json; every prompt is a code
// block with a Copy button.

const title = 'Make your idea playable'
const description =
  'Turn one idea from your own research into a small interactive simulation anyone can play with, in about five messages to Claude.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/seminar/playable' },
  openGraph: { title, description, url: '/seminar/playable', type: 'article' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function PlayablePage() {
  return (
    <main className="sem-main sem-single">
      <p className="sem-kicker">
        <Link href="/seminar" className="sem-back">
          The Seminar
        </Link>{' '}
        · Project 4
      </p>
      <h1 className="sem-s-title">{content.title}</h1>
      <p className="sem-s-intro">{content.intro}</p>
      <div className="sem-p-facts">
        {content.facts.map((f) => (
          <p key={f.label}>
            <strong>{f.label}</strong> {f.text}
          </p>
        ))}
      </div>

      {content.steps.map((step, i) => (
        <section key={step.title} aria-label={step.title}>
          <h2 className="sem-tips-title">{step.title}</h2>
          {step.before && <p className="sem-p-text">{step.before}</p>}
          {step.prompt && <Prompt text={step.prompt} />}
          {i === 0 && (
            <div className="sem-p-ideas">
              <h3 className="sem-p-ideas-title">{content.ideas.title}</h3>
              <ul className="sem-checklist sem-bullets">
                {content.ideas.items.map((item) => (
                  <li key={item.name}>
                    <p>
                      <strong>{item.name}</strong> {item.text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.after && <p className="sem-p-text">{step.after}</p>}
          {'how' in step && step.how && (
            <ol className="sem-p-how">
              {step.how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          )}
          {'image' in step && step.image && (
            <Image
              className="sem-p-shot"
              src={step.image.src}
              alt={step.image.alt}
              width={step.image.width}
              height={step.image.height}
              sizes="420px"
            />
          )}
        </section>
      ))}

      <section aria-label={content.tips.title}>
        <h2 className="sem-tips-title">{content.tips.title}</h2>
        <ul className="sem-checklist sem-bullets">
          {content.tips.items.map((item) => (
            <li key={item}>
              <p>{item}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

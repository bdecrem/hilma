import Link from 'next/link'
import { Say, Slides, Tick, type Slide } from './Bits'

// One seminar sheet, drawn as a short checklist like /seminar/claude. Every word comes from
// the sheet's content.json. /seminar/website, /seminar/library and /seminar/fact-checker are
// each one of these; /seminar itself is the landing page (page.tsx, home.json).

type Step = { title: string; body: string; say: string | null; trap: string | null }
type Part = { label: string; title: string; time: string; lede: string; steps: Step[] }
type Why = {
  title: string
  lede: string
  tools: { name: string; url: string; does: string }[]
  reasonsTitle: string
  reasons: { title: string; body: string }[]
  limits: string
  together: string
}

export type SheetContent = {
  title: string
  intro: string
  byline?: string
  hero?: Slide[]
  download?: { label: string; href: string; note: string }
  why?: Why
  parts: Part[]
  stuck?: { title: string; lede: string; items: { when: string; say: string }[] }
  next?: { title: string; body: string }
  example?: { label: string; url: string }
}

// The sheets, in the order of the seminar. `id` is also what a tick is stored under.
export const SHEETS = [
  { id: 'fact-checker', href: '/seminar/fact-checker', n: 2, name: 'A fact checker' },
  { id: 'library', href: '/seminar/library', n: 3, name: 'A paper library' },
  { id: 'website', href: '/seminar/website', n: 4, name: 'A work website' },
] as const

export function Sheet({ id, content }: { id: (typeof SHEETS)[number]['id']; content: SheetContent }) {
  const { parts, why, stuck, next, example } = content
  const sheet = SHEETS.find((s) => s.id === id)
  let n = 0

  return (
    <main className="sem-main sem-single">
      <p className="sem-kicker">
        <Link href="/seminar" className="sem-back">
          The Seminar
        </Link>{' '}
        · Project {sheet?.n}
      </p>
      {content.hero && <Slides slides={content.hero} caption={example} />}
      <h1 className="sem-s-title">{content.title}</h1>
      {content.byline && <p className="sem-s-byline">{content.byline}</p>}
      <p className="sem-s-intro">{content.intro}</p>
      {content.download && (
        <p className="sem-s-download">
          <a href={content.download.href} download>
            {content.download.label}
          </a>
          <span>{content.download.note}</span>
        </p>
      )}

      {why && (
        <section className="sem-s-why" aria-labelledby="sem-why-h">
          <h2 id="sem-why-h" className="sem-tips-title">
            {why.title}
          </h2>
          <ul className="sem-checklist sem-bullets">
            {why.tools.map((tool) => (
              <li key={tool.name}>
                <p>
                  <a className="sem-link" href={tool.url}>
                    {tool.name}
                  </a>
                  : {tool.does}
                </p>
              </li>
            ))}
          </ul>
          <h3 className="sem-s-sub">{why.reasonsTitle}</h3>
          <ul className="sem-checklist sem-bullets">
            {why.reasons.map((reason) => (
              <li key={reason.title}>
                <p>
                  <strong>{reason.title}.</strong> {reason.body}
                </p>
              </li>
            ))}
          </ul>
          {why.limits && <p className="sem-s-note">{why.limits}</p>}
          {why.together && <p className="sem-s-note">{why.together}</p>}
        </section>
      )}

      {parts.map((part, i) => (
        <section key={part.label} className="sem-s-part" aria-label={part.title}>
          <h2 className="sem-tips-title">
            {parts.length > 1 && <>{part.label}: </>}
            {part.title} <span className="sem-s-time">{part.time}</span>
          </h2>
          {part.lede && <p className="sem-s-note">{part.lede}</p>}
          <ol className="sem-checklist">
            {part.steps.map((step) => {
              n += 1
              // The website sheet's ticks were stored without a sheet name: keep that scheme.
              const tick = id === 'website' ? `${i + 1}-${step.title}` : `${id}-${i + 1}-${step.title}`
              return (
                <li key={step.title}>
                  <Tick id={tick} n={n} />
                  <div className="sem-s-step">
                    <p>
                      <strong>{step.title}.</strong>
                      {step.body && <> {step.body}</>}
                    </p>
                    {step.trap && <p className="sem-s-trap">{step.trap}</p>}
                    {step.say && <Say text={step.say} />}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      {stuck && (
        <section className="sem-s-part" aria-labelledby="sem-stuck-h">
          <h2 id="sem-stuck-h" className="sem-tips-title">
            {stuck.title}
          </h2>
          <ul className="sem-checklist sem-bullets">
            {stuck.items.map((item) => (
              <li key={item.say}>
                <p className="sem-s-when">{item.when}</p>
                <Say text={item.say} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <section className="sem-s-part" aria-labelledby="sem-next-h">
          <h2 id="sem-next-h" className="sem-tips-title">
            {next.title}
          </h2>
          <p className="sem-s-note">{next.body}</p>
        </section>
      )}

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

import Image from 'next/image'
import Link from 'next/link'
import { Say, Tick } from './Bits'

// One seminar sheet. Every word comes from the sheet's content.json; this only draws.
// /seminar/website, /seminar/library and /seminar/fact-checker are each one of these;
// /seminar itself is the landing page (page.tsx, home.json).

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
  kicker: string
  intro: string
  shape: string
  byline?: string
  download?: { label: string; href: string; note: string }
  need: string[]
  why?: Why
  parts: Part[]
  stuck?: { title: string; lede: string; items: { when: string; say: string }[] }
  next?: { title: string; body: string }
  example?: { label: string; url: string }
}

// The sheets, in the order of the seminar. `id` is also what a tick is stored under.
export const SHEETS = [
  { id: 'website', href: '/seminar/website', n: 1, name: 'A work website' },
  { id: 'library', href: '/seminar/library', n: 2, name: 'A paper library' },
  { id: 'fact-checker', href: '/seminar/fact-checker', n: 3, name: 'A fact checker' },
] as const

// The two words every headline leans on, set heavier, as on the homepage.
export const EMPH = 'your own'

export function Sheet({ id, content }: { id: (typeof SHEETS)[number]['id']; content: SheetContent }) {
  const { parts, why, stuck, next, example } = content
  // "your own" is set heavier wherever it sits in the title, capital or not.
  const at = content.title.toLowerCase().indexOf(EMPH)
  const before = at < 0 ? content.title : content.title.slice(0, at)
  const emph = at < 0 ? '' : content.title.slice(at, at + EMPH.length)
  const after = at < 0 ? '' : content.title.slice(at + EMPH.length)
  let n = 0

  return (
    <main className="sem-main">
      <header className="sem-head">
        <nav className="sem-sheets" aria-label="Seminar projects">
          <Link href="/seminar">The Seminar</Link>
          {SHEETS.map((sheet) => (
            <Link key={sheet.id} href={sheet.href} aria-current={sheet.id === id ? 'page' : undefined}>
              {sheet.n} · {sheet.name}
            </Link>
          ))}
        </nav>
        <p className="sem-kicker">{content.kicker}</p>
        <h1 className="sem-title">
          {before}
          {emph && <em>{emph}</em>}
          {after}
        </h1>
        {content.byline && <p className="sem-byline">{content.byline}</p>}
        <p className="sem-intro">{content.intro}</p>
        <p className="sem-intro">{content.shape}</p>
        {content.download && (
          <p className="sem-download">
            <a href={content.download.href} download>
              {content.download.label}
            </a>
            <span>{content.download.note}</span>
          </p>
        )}
      </header>

      <section className="sem-need" aria-labelledby="sem-need-h">
        <h2 id="sem-need-h" className="sem-small">
          What you need
        </h2>
        <ul>
          {content.need.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <nav className="sem-toc" aria-label="On this page">
        {why && (
          <a href="#why">
            <span className="sem-toc-label">First</span>
            <span className="sem-toc-title">Why build your own</span>
            <span className="sem-toc-time">Next to {why.tools.map((tool) => tool.name).join(', ')}</span>
          </a>
        )}
        {parts.map((part, i) => (
          <a key={part.label} href={`#part-${i + 1}`}>
            <span className="sem-toc-label">{part.label}</span>
            <span className="sem-toc-title">{part.title}</span>
            <span className="sem-toc-time">{part.time}</span>
          </a>
        ))}
        {stuck && (
          <a href="#stuck">
            <span className="sem-toc-label">Any time</span>
            <span className="sem-toc-title">{stuck.title}</span>
            <span className="sem-toc-time">Four lines that help</span>
          </a>
        )}
      </nav>

      {why && (
        <section id="why" className="sem-why" aria-labelledby="sem-why-h">
          <h2 id="sem-why-h" className="sem-part-title">
            {why.title}
          </h2>
          <p className="sem-part-lede">{why.lede}</p>

          <dl className="sem-tools">
            {why.tools.map((tool) => (
              <div key={tool.name}>
                <dt>
                  <a href={tool.url}>{tool.name}</a>
                </dt>
                <dd>{tool.does}</dd>
              </div>
            ))}
          </dl>

          <h3 className="sem-small sem-why-sub">{why.reasonsTitle}</h3>
          <ol className="sem-reasons">
            {why.reasons.map((reason, i) => (
              <li key={reason.title}>
                <span className="sem-reason-n" aria-hidden="true">
                  {i + 1}
                </span>
                <h4>{reason.title}</h4>
                <p>{reason.body}</p>
              </li>
            ))}
          </ol>

          <p className="sem-why-limits">{why.limits}</p>
          <p className="sem-why-together">{why.together}</p>
        </section>
      )}

      {parts.map((part, i) => (
        <section key={part.label} id={`part-${i + 1}`} className="sem-part">
          <div className="sem-part-head">
            <p className="sem-part-label">
              {part.label} <span>{part.time}</span>
            </p>
            <h2 className="sem-part-title">{part.title}</h2>
            <p className="sem-part-lede">{part.lede}</p>
          </div>
          <ol className="sem-steps">
            {part.steps.map((step) => {
              n += 1
              // The website sheet's ticks were stored without a sheet name: keep them.
              const tick = id === 'website' ? `${i + 1}-${step.title}` : `${id}-${i + 1}-${step.title}`
              return (
                <li key={step.title} className="sem-step">
                  <Tick id={tick} n={n} />
                  <div className="sem-step-body">
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                    {step.say && <Say text={step.say} />}
                    {step.trap && (
                      <p className="sem-trap">
                        <strong>Careful.</strong> {step.trap}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {example && i === parts.length - 1 && (
            <a className="sem-example" href={example.url}>
              <Image
                src="/seminar/example.jpg"
                alt="A personal page with an office hours card and a projects card"
                width={1297}
                height={802}
                sizes="(max-width: 700px) 100vw, 420px"
              />
              <span>
                <span className="sem-small">{example.label}</span>
                <span className="sem-example-url">{example.url.replace(/^https:\/\/|\/$/g, '')}</span>
              </span>
            </a>
          )}
        </section>
      ))}

      {stuck && (
        <section id="stuck" className="sem-stuck" aria-labelledby="sem-stuck-h">
          <h2 id="sem-stuck-h" className="sem-part-title">
            {stuck.title}
          </h2>
          <p className="sem-part-lede">{stuck.lede}</p>
          <ul>
            {stuck.items.map((item) => (
              <li key={item.say}>
                <p className="sem-stuck-when">{item.when}</p>
                <Say text={item.say} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <section className="sem-next" aria-labelledby="sem-next-h">
          <h2 id="sem-next-h" className="sem-part-title">
            {next.title}
          </h2>
          <p>{next.body}</p>
        </section>
      )}

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

import Image from 'next/image'
import content from './content.json'
import { Say, Tick } from './Bits'

type Step = { title: string; body: string; say: string | null; trap: string | null }
const EMPH = 'your own'

type Part = { label: string; title: string; time: string; lede: string; steps: Step[] }

export default function SeminarPage() {
  const parts = content.parts as Part[]
  let n = 0
  // The two words the headline leans on, set heavier, as on the homepage.
  const [before, after] = content.title.split(EMPH)

  return (
    <main className="sem-main">
      <header className="sem-head">
        <p className="sem-kicker">{content.kicker}</p>
        <h1 className="sem-title">
          {before}
          <em>{EMPH}</em>
          {after}
        </h1>
        <p className="sem-intro">{content.intro}</p>
        <p className="sem-intro">{content.shape}</p>
      </header>

      <section className="sem-need" aria-labelledby="sem-need-h">
        <h2 id="sem-need-h" className="sem-small">What you need</h2>
        <ul>
          {content.need.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <nav className="sem-toc" aria-label="On this page">
        {parts.map((part, i) => (
          <a key={part.label} href={`#part-${i + 1}`}>
            <span className="sem-toc-label">{part.label}</span>
            <span className="sem-toc-title">{part.title}</span>
            <span className="sem-toc-time">{part.time}</span>
          </a>
        ))}
        <a href="#stuck">
          <span className="sem-toc-label">Any time</span>
          <span className="sem-toc-title">{content.stuck.title}</span>
          <span className="sem-toc-time">Four lines that help</span>
        </a>
      </nav>

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
              return (
                <li key={step.title} className="sem-step">
                  <Tick id={`${i + 1}-${step.title}`} n={n} />
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
          {i === parts.length - 1 && (
            <a className="sem-example" href={content.example.url}>
              <Image
                src="/seminar/example.jpg"
                alt="A personal page with an office hours card and a projects card"
                width={1297}
                height={802}
                sizes="(max-width: 700px) 100vw, 420px"
              />
              <span>
                <span className="sem-small">{content.example.label}</span>
                <span className="sem-example-url">{content.example.url.replace(/^https:\/\/|\/$/g, '')}</span>
              </span>
            </a>
          )}
        </section>
      ))}

      <section id="stuck" className="sem-stuck" aria-labelledby="sem-stuck-h">
        <h2 id="sem-stuck-h" className="sem-part-title">{content.stuck.title}</h2>
        <p className="sem-part-lede">{content.stuck.lede}</p>
        <ul>
          {content.stuck.items.map((item) => (
            <li key={item.say}>
              <p className="sem-stuck-when">{item.when}</p>
              <Say text={item.say} />
            </li>
          ))}
        </ul>
      </section>

      <section className="sem-next" aria-labelledby="sem-next-h">
        <h2 id="sem-next-h" className="sem-part-title">{content.next.title}</h2>
        <p>{content.next.body}</p>
      </section>

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

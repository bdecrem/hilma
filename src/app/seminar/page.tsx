import Link from 'next/link'
import home from './home.json'

// The landing page of the seminar: the setup link, and the three sheets.
// Every word is in home.json.
export default function SeminarHome() {
  return (
    <main className="sem-main sem-home">
      <h1 className="sem-kicker sem-home-kicker">{home.kicker}</h1>

      <section className="sem-first" aria-label={home.first.title}>
        <div className="sem-cards">
          <Link href={home.first.href} className="sem-card sem-card-first">
            <span className="sem-card-text">
              <span className="sem-card-title">{home.first.title}</span>
            </span>
            <span className="sem-card-go" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      <section className="sem-cards-wrap" aria-labelledby="sem-projects-h">
        <h2 id="sem-projects-h" className="sem-small">
          {home.projectsTitle}
        </h2>
        <ol className="sem-cards">
          {home.projects.map((project) => (
            <li key={project.href}>
              <Link href={project.href} className="sem-card">
                <span className="sem-card-n" aria-hidden="true">
                  {project.n}
                </span>
                <span className="sem-card-text">
                  <span className="sem-card-title">{project.title}</span>
                  <span className="sem-card-body">{project.body}</span>
                  {project.time && <span className="sem-card-time">{project.time}</span>}
                </span>
                <span className="sem-card-go" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="sem-last" aria-label="Roll your own">
        <div className="sem-cards">
          <Link href={home.last.href} className="sem-card sem-card-first">
            <span className="sem-card-text">
              <span className="sem-card-title">{home.last.title}</span>
            </span>
            <span className="sem-card-go" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

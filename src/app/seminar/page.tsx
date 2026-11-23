import Link from 'next/link'
import home from './home.json'

// The landing page of the seminar: what to do before you come, and the three sheets.
// Every word is in home.json.
export default function SeminarHome() {
  return (
    <main className="sem-main sem-home">
      <header className="sem-head">
        <p className="sem-kicker">{home.kicker}</p>
        <h1 className="sem-title">
          <em>{home.title}</em>
        </h1>
        <p className="sem-intro">{home.intro}</p>
      </header>

      <nav className="sem-toc" aria-label="On this page">
        <a href="#before">
          <span className="sem-toc-label">This week</span>
          <span className="sem-toc-title">{home.before.title}</span>
          <span className="sem-toc-time">Account, app, sign-in</span>
        </a>
        {home.projects.map((project) => (
          <Link key={project.href} href={project.href}>
            <span className="sem-toc-label">Project {project.n}</span>
            <span className="sem-toc-title">{project.title}</span>
            <span className="sem-toc-time">{project.time}</span>
          </Link>
        ))}
      </nav>

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
                  <span className="sem-card-time">{project.time}</span>
                </span>
                <span className="sem-card-go" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section id="before" className="sem-part" aria-labelledby="sem-before-h">
        <h2 id="sem-before-h" className="sem-part-title sem-flush">
          {home.before.title}
        </h2>
        <p className="sem-part-lede">{home.before.lede}</p>
        <ol className="sem-steps">
          {home.before.items.map((item, i) => (
            <li key={item.title} className="sem-step">
              <span className="sem-tick sem-tick-plain" aria-hidden="true">
                {i + 1}
              </span>
              <div className="sem-step-body">
                <h3>{item.title}</h3>
                <p>
                  {item.body}{' '}
                  {item.link && (
                    <a className="sem-link" href={item.link.href}>
                      {item.link.label}
                    </a>
                  )}
                </p>
                {i === home.before.items.length - 1 && (
                  <ol className="sem-signin">
                    {home.before.signin.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sem-next" aria-labelledby="sem-tip-h">
        <h2 id="sem-tip-h" className="sem-part-title">
          {home.tip.title}
        </h2>
        <p>{home.tip.body}</p>
      </section>

      <footer className="sem-foot">
        <a href="https://bartin16.xyz">Bart Decrem</a>
        <span>CASBS, 2026–27</span>
      </footer>
    </main>
  )
}

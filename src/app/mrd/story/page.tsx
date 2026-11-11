const STEPS = [
  { n: '1', text: 'We started with a database.', href: 'https://www.migrantrightsinitiative.org/en', label: 'Cornell’s MRD', external: true },
  { n: '2', text: 'We found every law it cites.', href: '/mrd/crawl', label: 'The crawl' },
  { n: '3', text: 'Claude coded six new countries.', href: '/mrd/dossiers', label: 'The dossiers' },
]

export default function Story() {
  return (
    <main>
      <section className="hero">
        <h1>
          Every law behind migrants’ rights, <mark>in one place.</mark>
        </h1>
        <a className="btn" href="/mrd">Open the library →</a>
      </section>

      <ol>
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="dot">{s.n}</span>
            <span className="text">{s.text}</span>
            <a className="more" href={s.href} {...(s.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
              {s.label} →
            </a>
          </li>
        ))}
      </ol>
    </main>
  )
}

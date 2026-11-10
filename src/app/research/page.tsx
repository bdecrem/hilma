import type { Metadata, Viewport } from 'next'

// A plain index of the research apps: Fran Moore's Adaptation Almanac, the Socratic law tutor,
// and the Migrant Rights Database work. Bart, 2026-11-10: "a SIMPLE, barebones landing page".

export const metadata: Metadata = {
  title: 'Research apps',
  description: 'The Adaptation Almanac, the Socratic law tutor and the Migrant Rights Database.',
  metadataBase: new URL('https://ola.cx'),
  robots: { index: false, follow: false },
  openGraph: { title: 'Research apps', description: 'The Adaptation Almanac, the Socratic law tutor and the Migrant Rights Database.', url: 'https://ola.cx/research' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
  ],
}

type Link = { href: string; label: string; note: string }
type App = { name: string; line: string; links: Link[] }

const APPS: App[] = [
  {
    name: 'Adaptation Almanac',
    line: 'A research chat over 1,682 climate adaptation studies and their papers, for Frances Moore (UC Davis).',
    links: [{ href: 'https://almanac.tunn3l.sh/almanac/', label: 'Open the Almanac', note: 'sign in with your passcode' }],
  },
  {
    name: 'Socratic',
    line: 'A Socratic law tutor for the Chen / Zeiler study: one torts module, three study arms.',
    links: [
      { href: 'https://ola.cx/socratic', label: 'The study version', note: 'the Torts topic only' },
      { href: 'https://bart-imac.tunn3l.sh/socratic', label: 'The full version', note: 'every topic, and make your own' },
    ],
  },
  {
    name: 'Migrant Rights Database',
    line: 'Cornell’s Migrant Rights Database: 46 countries scored on 18 categories of migrants’ rights, and the laws behind them.',
    links: [
      { href: 'https://www.migrantrightsinitiative.org/en', label: 'The live site', note: 'Cornell’s Migrant Rights Initiative' },
      { href: 'https://ola.cx/mrd', label: 'The database', note: 'countries, categories and the full law library' },
      { href: 'https://ola.cx/mrd/crawl', label: 'The dashboard', note: 'tracing every law the database cites' },
      { href: 'https://ola.cx/mrd/dossiers', label: 'The six-country experiment', note: 'six countries coded by an agent, flagged experimental' },
    ],
  },
]

const css = `
.r{--bg:#fff;--fg:#111;--muted:#666;--line:#e4e4e4;--link:#1a4fd6;
  min-height:100dvh;background:var(--bg);color:var(--fg);
  font:16px/1.5 system-ui,-apple-system,sans-serif;
  padding:max(48px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(64px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
@media (prefers-color-scheme:dark){.r{--bg:#111;--fg:#eee;--muted:#999;--line:#2a2a2a;--link:#8fb0ff}}
.r main{max-width:640px;margin:0 auto}
.r h1{font-size:28px;margin:0 0 40px;font-weight:650;letter-spacing:-.01em}
.r section{border-top:1px solid var(--line);padding:24px 0}
.r h2{font-size:19px;margin:0 0 4px;font-weight:600}
.r p{margin:0 0 12px;color:var(--muted)}
.r ul{list-style:none;margin:0;padding:0}
.r li{margin:6px 0}
.r a{color:var(--link);text-decoration:none;font-weight:500}
.r a:hover{text-decoration:underline}
.r li span{color:var(--muted)}
`

export default function ResearchPage() {
  return (
    <div className="r">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main>
        <h1>Research apps</h1>
        {APPS.map((app) => (
          <section key={app.name}>
            <h2>{app.name}</h2>
            <p>{app.line}</p>
            <ul>
              {app.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a> <span>· {l.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}

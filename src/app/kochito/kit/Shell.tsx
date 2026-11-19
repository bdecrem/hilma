import type { Frame } from '@/lib/venture/board'
import { quick, talk, type SideLink } from './links'
import { reading } from './health'
import './board.css'
import './looks.css'
import { cookies } from 'next/headers'
import LookSwitch from './LookSwitch'
import { LOOKS, type Look } from './looks'

// The frame of every board page (round three, 2026-11-18, OLA-162): the menu on the left (208px; a
// Menu button on a phone) and the page on the right. The menu lists five pages, one item each,
// and the page's heading is the item's words: Home, Issue Tracker, Plan, Notes, Numbers. Under a
// rule, two groups that leave the board (Talk to Kit, Quick links), smaller, with an arrow. The
// machine's reading in its compact form sits at the top of the menu on every page; the full block
// is on Home (Health.tsx). Styles: board.css (the design rules are at its top).

export type Page = 'home' | 'issues' | 'plan' | 'notes' | 'numbers'
export const PAGES: [Page, string, string][] = [
  ['home', 'Home', '/'],
  ['issues', 'Issue Tracker', '/issues'],
  ['plan', 'Plan', '/plan'],
  ['notes', 'Notes', '/notes'],
  ['numbers', 'Numbers', '/numbers'],
]
export const href = (base: string, path: string) => (base ? `${base}${path === '/' ? '' : path}` : path)

function Pulse({ f, base }: { f: Frame; base: string }) {
  const r = reading(f.status, f.now)
  return (
    <a className={`bd-pulse ${r.state === 'alarm' ? 'alarm' : r.stale ? 'stale' : ''}`} href={`${href(base, '/')}#health`} title={`The Ola machine: ${r.state === 'alarm' ? r.says.join(' ') : r.state === 'none' ? 'no reading yet' : 'OK'}${r.ago ? `, read ${r.ago}` : ''}`}>
      <span className={`bd-dot ${r.state === 'alarm' ? 'alarm' : r.stale ? 'stale' : 'ok'}`} />
      <span className="bd-cut">
        {r.state === 'none' ? 'No reading yet' : r.state === 'alarm' ? <><b>ALARM</b> {r.says[0]}</> : <><b>OK</b>, read {r.ago}</>}
      </span>
    </a>
  )
}

function Out({ title, links }: { title: string; links: SideLink[] }) {
  return (
    <div>
      <h2>{title}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.name}>
            {l.url ? (
              <a href={l.url} rel="noopener" target="_blank">
                <span>
                  {l.name}
                  {l.note && <small>{l.note}</small>}
                </span>
              </a>
            ) : (
              <span className="soon">
                <span>
                  {l.name}
                  {l.note && <small>{l.note}</small>}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Menu({ base, q, f, current, user, look }: { base: string; q: string; f: Frame; current: Page; user: string; look: Look }) {
  return (
    <>
      <nav className="bd-nav" aria-label="Pages">
        <ul>
          {PAGES.map(([id, name, path]) => (
            <li key={id}>
              <a href={href(base, path)} aria-current={current === id ? 'page' : undefined}>
                <span>{name}</span>
                {id === 'issues' && f.open !== null && <span className="m">{f.open}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="bd-out">
        <Out title="Talk to Kit" links={talk(q)} />
        <Out title="Quick links" links={quick(f.mac)} />
      </div>
      <LookSwitch look={look} />
      <form method="post" action="/api/kochito/app/logout" className="bd-who">
        <span>Signed in as {user}.</span> <button>Sign out</button>
      </form>
    </>
  )
}

// The look (OLA-170): the cookie bd_look, set by the Look switch in the menu. "plain" or no cookie
// is board.css as it stands; "lamp" and "desk" are looks.css.
export default async function Shell({ base, q, user, f, current, children }: { base: string; q: string; user: string; f: Frame; current: Page; children: React.ReactNode }) {
  const said = (await cookies()).get('bd_look')?.value as Look | undefined
  const look: Look = said && LOOKS.includes(said) ? said : 'plain'
  return (
    <div className="bd" data-look={look === 'plain' ? undefined : look}>
      <div className="bd-app">
        <aside className="bd-side">
          <a className="bd-brand" href={href(base, '/')}>
            <i className="bd-mark" aria-hidden="true" />
            <b>Ola</b> <span>Kochito Labs</span>
          </a>
          <Pulse f={f} base={base} />
          <Menu base={base} q={q} f={f} current={current} user={user} look={look} />
        </aside>
        <header className="bd-top">
          <Pulse f={f} base={base} />
          <details>
            <summary>Menu</summary>
            <div className="panel">
              <Menu base={base} q={q} f={f} current={current} user={user} look={look} />
            </div>
          </details>
        </header>
        <main className="bd-main">
          <div className="bd-page">{children}</div>
        </main>
      </div>
    </div>
  )
}

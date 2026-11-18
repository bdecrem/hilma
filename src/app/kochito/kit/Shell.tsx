import type { LiveStatus, NoteLink, SteerDay } from '@/lib/venture/board'
import { ALSO, CODE, OPEN, type SideLink } from './links'
import { ago } from './time'

// The frame of every board page: the top bar, the sidebar of key links (a left column on a wide
// screen, a Menu in the top bar on a phone), the page, the footer. Bart, 2026-11-17: "key links in
// the sidebar; a way to view closed / resolved issues". The plan behind it is the private note
// BOARD-PLAN-2026-11-17.

const MIN = 60e3
export const STATUS_STALE = 30 * MIN

/** Is everything healthy: the mini's live status and today's steer rate, one row each. */
export function Health({ s, now, steer }: { s: LiveStatus | null; now: string; steer?: SteerDay }) {
  const stale = !s || Date.parse(now) - Date.parse(s.at) > STATUS_STALE
  return (
    <dl className={`kb-live ko-mono${stale ? ' stale' : ''}`} aria-label="Health">
      <div>
        <dt>web app</dt>
        <dd>{s?.deployed ? `updated ${ago(s.deployed.at, now)}` : '–'}</dd>
      </div>
      <div>
        <dt>checks</dt>
        <dd>{s?.checks ? `${s.checks.passed} of ${s.checks.total} passed` : '–'}</dd>
      </div>
      <div>
        <dt>alarm</dt>
        <dd className={s?.alarm.state ?? ''}>{s ? (s.alarm.state === 'alarm' ? s.alarm.says.join(' ') || 'sounding' : s.alarm.state === 'warn' ? `quiet, ${s.alarm.warns.length} warning${s.alarm.warns.length === 1 ? '' : 's'}` : 'quiet') : '–'}</dd>
      </div>
      <div>
        <dt>disk</dt>
        <dd>{s?.disk ? `${s.disk.freeGB} GB free` : '–'}</dd>
      </div>
      {steer && (
        <div>
          <dt>steers</dt>
          <dd>
            {steer.rate} per 100 messages, {new Date(`${steer.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
          </dd>
        </div>
      )}
      <div className="kb-live-at">
        <dt>status</dt>
        <dd>{s ? `${ago(s.at, now)}${stale ? ', stale' : ''}` : 'never pushed'}</dd>
      </div>
    </dl>
  )
}

function Group({ title, links }: { title: string; links: (SideLink & { href?: string; current?: boolean })[] }) {
  return (
    <div className="kb-nav-group">
      <h2 className="ko-sub">{title}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.name}>
            {l.url || l.href ? (
              <a href={(l.href ?? l.url) as string} aria-current={l.current ? 'page' : undefined}>
                {l.name}
                {l.note && <span className="ko-mono">{l.note}</span>}
              </a>
            ) : (
              <span className="soon">
                {l.name}
                {l.note && <span className="ko-mono">{l.note}</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Nav({ base, q, notes, open, current, slug }: { base: string; q: string; notes: NoteLink[]; open: number | null; current: 'home' | 'issues' | 'note' | 'overview'; slug?: string }) {
  return (
    <nav className="kb-nav" aria-label="Key links">
      <Group
        title="The board"
        links={[
          { name: 'Overview', url: null, href: `${base}/` || '/', current: current === 'home' },
          { name: 'Every issue', url: null, href: `${base}/issues`, note: open === null ? undefined : `${open} open`, current: current === 'issues' },
          { name: 'Ola in one page', url: null, href: `${base}/overview`, current: current === 'overview' },
        ]}
      />
      <Group title="Open" links={OPEN} />
      <Group
        title="Talk to Kit"
        links={[
          { name: 'Leave a voice note', url: `https://ola.cx/venture/memo${q}` },
          { name: 'Talk it through', url: `https://ola.cx/venture/talk${q}` },
          { name: 'Answer my questions', url: `https://ola.cx/venture/call/checkin${q}`, note: 'about five minutes' },
        ]}
      />
      <Group title="Notes" links={notes.map((n) => ({ name: n.label, url: null, href: `${base}/notes/${n.slug}`, current: current === 'note' && slug === n.slug }))} />
      <Group title="Code" links={CODE} />
      <Group title="Ola's by link" links={ALSO} />
    </nav>
  )
}

export default function Shell({
  base,
  q,
  user,
  notes,
  open,
  current,
  slug,
  aside,
  children,
}: {
  base: string
  q: string
  user: string
  notes: NoteLink[]
  open: number | null
  current: 'home' | 'issues' | 'note' | 'overview'
  slug?: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  const nav = <Nav base={base} q={q} notes={notes} open={open} current={current} slug={slug} />
  return (
    <div className="ko kb">
      <div className="ko-wrap kb-wrap">
        <header className="ko-top kb-top">
          <a className="ko-name" href={`${base}/` || '/'}>
            Ola<span>.</span> <small>the board</small>
          </a>
          <details className="kb-menu">
            <summary>Menu</summary>
            <div className="kb-menu-panel">{nav}</div>
          </details>
        </header>
        <aside className="kb-side">
          {aside}
          {nav}
        </aside>
        <main className="kb-main">{children}</main>
        <footer className="ko-foot">
          <span>Kochito Labs LLC · Wyoming</span>
          <form method="post" action="/api/kochito/app/logout" className="ko-out">
            <span>Signed in as {user}.</span> <button>Sign out</button>
          </form>
        </footer>
      </div>
    </div>
  )
}

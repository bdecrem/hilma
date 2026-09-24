import Link from 'next/link'
import type { AppCard } from '@/lib/surf/apps'
import { AccountPill } from './client'

export const GITHUB = 'https://github.com/bdecrem/hilma/tree/main/apps/tokensurfers'
export const TESTFLIGHT = process.env.SURF_TESTFLIGHT_URL || ''

/** The tube man, in SVG, for the landing hero. */
export function TubeMan({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 200" aria-hidden="true">
      <ellipse cx="60" cy="192" rx="34" ry="6" fill="rgba(0,0,0,0.25)" />
      <g stroke="#17131f" strokeWidth="2">
        <rect x="36" y="172" width="22" height="13" rx="6" fill="#fff" />
        <rect x="62" y="172" width="22" height="13" rx="6" fill="#fff" />
      </g>
      <rect x="36" y="180" width="22" height="5" rx="2" fill="#17131f" />
      <rect x="62" y="180" width="22" height="5" rx="2" fill="#17131f" />
      <path d="M42 170 C 30 120, 34 80, 46 44 C 50 30, 70 30, 74 44 C 86 80, 90 120, 78 170 Z" fill="#e9804f" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <path d="M60 36 C 74 60, 78 110, 70 168" stroke="#c9602f" strokeWidth="1.6" fill="none" opacity="0.5" />
      <path d="M40 92 C 20 84, 8 70, 14 52" stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M40 92 C 20 84, 8 70, 14 52" stroke="#e9804f" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M80 92 C 100 90, 112 74, 104 56" stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M80 92 C 100 90, 112 74, 104 56" stroke="#e9804f" strokeWidth="9" fill="none" strokeLinecap="round" />
      <circle cx="14" cy="50" r="5.5" fill="#c9602f" />
      <circle cx="104" cy="54" r="5.5" fill="#c9602f" />
      <g strokeLinecap="round">
        <path d="M44 38 L 34 28" stroke="#fff" strokeWidth="10" /><path d="M44 38 L 34 28" stroke="#e9804f" strokeWidth="6" />
        <path d="M76 38 L 86 28" stroke="#fff" strokeWidth="10" /><path d="M76 38 L 86 28" stroke="#e9804f" strokeWidth="6" />
        <path d="M60 34 L 60 16" stroke="#fff" strokeWidth="10" /><path d="M60 34 L 60 16" stroke="#e9804f" strokeWidth="6" />
      </g>
      <circle cx="60" cy="14" r="7" fill="#ffd53a" stroke="#17131f" strokeWidth="2" />
      <circle cx="51" cy="66" r="6.5" fill="#fff" /><circle cx="69" cy="66" r="6.5" fill="#fff" />
      <circle cx="52" cy="67" r="4" fill="#17131f" /><circle cx="70" cy="67" r="4" fill="#17131f" />
      <circle cx="53.5" cy="65.5" r="1.4" fill="#fff" /><circle cx="71.5" cy="65.5" r="1.4" fill="#fff" />
      <ellipse cx="45" cy="78" rx="5" ry="2.6" fill="#f7a8c8" /><ellipse cx="75" cy="78" rx="5" ry="2.6" fill="#f7a8c8" />
      <path d="M52 80 Q 60 90 68 80" fill="#17131f" />
    </svg>
  )
}

export function TopBar({ section }: { section?: string }) {
  return (
    <div className="bar">
      <Link className="brand" href="/surf">
        <TubeMan className="brandtube" />
        <span className="head stroke" style={{ fontSize: 26 }}>Token Surfers</span>
        {section ? <span className="pill">{section}</span> : null}
      </Link>
      <nav>
        <Link className="pill" href="/surf/gallery">gallery</Link>
        <a className="pill" href={GITHUB} target="_blank" rel="noreferrer">github</a>
        <AccountPill />
      </nav>
      <style>{`.sf .brandtube{width:22px;height:36px}`}</style>
    </div>
  )
}

export function hue(slug: string): number {
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export function AppTile({ app }: { app: AppCard }) {
  return (
    <Link className="card app" href={`/surf/a/${app.slug}`}>
      <div className="tile" style={{ background: `hsl(${hue(app.slug)} 55% 88%)` }}>
        <span>{app.emoji}</span>
        <span className={`votes ${app.voted ? 'on' : ''}`}>▲ {app.upvotes}</span>
      </div>
      <div className="t">{app.title}</div>
      <div className="by">@{app.owner}{app.remixOf ? ' · remix' : ''}</div>
    </Link>
  )
}

export function Footer() {
  return (
    <footer className="wrap">
      <span>Token Surfers · made with code (free trial)</span>
      <a href={GITHUB} target="_blank" rel="noreferrer">source on GitHub</a>
      {TESTFLIGHT ? <a href={TESTFLIGHT}>TestFlight beta</a> : <span>TestFlight: soon</span>}
      <a href="https://bartin16.xyz">by Bart</a>
    </footer>
  )
}

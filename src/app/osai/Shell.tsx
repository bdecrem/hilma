'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import Chat from './Chat'

const NAV = [
  { href: '/osai', label: 'The one-pager' },
  { href: '/osai/overview', label: 'Overview' },
  { href: '/osai/details', label: 'Details' },
]

export default function Shell({ user, name, children }: { user: string; name: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)

  async function signOut() {
    await fetch('/api/osai/auth/logout', { method: 'POST' })
    router.refresh()
  }

  return (
    <>
      <header className="osai-top">
        <div className="inner">
          <div className="brand">
            <Link href="/osai" className="wordmark">osai</Link>
            <span className="tag">Open Source AI · working notes</span>
          </div>
          <nav className="osai-nav" aria-label="Documents">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="right">
            <span className="who">{name}</span>
            <button className="linkbtn out" type="button" onClick={signOut}>Sign out</button>
            <button className="ask" type="button" onClick={() => setChatOpen(true)}>Ask</button>
          </div>
        </div>
      </header>
      <div className="osai-body">
        <main className="osai-doc">
          <div className="reading">{children}</div>
        </main>
        <aside className={`osai-aside${chatOpen ? ' open' : ''}`} aria-label="Assistant">
          <Chat user={user} name={name} onClose={() => setChatOpen(false)} onSignOut={signOut} />
        </aside>
      </div>
    </>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import Chat from './Chat'
import PasswordDialog from './PasswordDialog'

const NAV = [
  { href: '/osai', label: 'Open Source' },
  { href: '/osai/overview', label: 'Landscape' },
]

function isCurrent(href: string, pathname: string) {
  if (href === '/osai/overview') return pathname.startsWith('/osai/overview') || pathname.startsWith('/osai/details')
  return pathname === href
}

export default function Shell({
  user,
  name,
  hasPassword: initialHasPassword,
  children,
}: {
  user: string
  name: string
  hasPassword: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [hasPassword, setHasPassword] = useState(initialHasPassword)

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
              <Link key={n.href} href={n.href} aria-current={isCurrent(n.href, pathname) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="right">
            <span className="who">{name}</span>
            <button className="linkbtn out" type="button" onClick={() => setPwOpen(true)}>{hasPassword ? 'Change password' : 'Set a password'}</button>
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
          <Chat user={user} name={name} onClose={() => setChatOpen(false)} onSignOut={signOut} onPassword={() => setPwOpen(true)} />
        </aside>
      </div>
      {pwOpen && <PasswordDialog hasPassword={hasPassword} onClose={() => setPwOpen(false)} onChanged={setHasPassword} />}
    </>
  )
}

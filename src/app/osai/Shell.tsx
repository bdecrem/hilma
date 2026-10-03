'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Chat from './Chat'
import MemoryDialog from './MemoryDialog'
import PasswordDialog from './PasswordDialog'

const NAV = [
  { href: '/osai', label: 'Open Source' },
  { href: '/osai/overview', label: 'Landscape' },
]

function isCurrent(href: string, pathname: string) {
  if (href === '/osai/overview') return pathname.startsWith('/osai/overview') || pathname.startsWith('/osai/details')
  return pathname === href
}

type Theme = 'dark' | 'light'
const THEME_KEY = 'osai:theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'light') root.setAttribute('data-osai-theme', 'light')
  else root.removeAttribute('data-osai-theme')
  try { localStorage.setItem(THEME_KEY, t) } catch { /* ignore */ }
}

function UserMenu({
  name,
  hasPassword,
  onMemory,
  onPassword,
  onSignOut,
}: {
  name: string
  hasPassword: boolean
  onMemory: () => void
  onPassword: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTheme(readTheme())
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="osai-user" ref={ref}>
      <button type="button" className="osai-user-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar" aria-hidden="true">{name.slice(0, 1)}</span>
        <span className="uname">{name}</span>
      </button>
      {open && (
        <div className="osai-menu" role="menu">
          <button type="button" role="menuitem" onClick={pick(onMemory)}>Memory</button>
          <button type="button" role="menuitem" onClick={pick(onPassword)}>{hasPassword ? 'Change password' : 'Set a password'}</button>
          <button type="button" role="menuitem" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <div className="sep" role="separator" />
          <button type="button" role="menuitem" onClick={pick(onSignOut)}>Sign out</button>
        </div>
      )}
    </div>
  )
}

export default function Shell({
  name,
  hasPassword: initialHasPassword,
  children,
}: {
  name: string
  hasPassword: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [memOpen, setMemOpen] = useState(false)
  const [hasPassword, setHasPassword] = useState(initialHasPassword)

  // While the phone chat sheet is open: no page scroll behind it, and the sheet
  // follows the visual viewport (iOS shrinks it when the keyboard is up).
  useEffect(() => {
    if (!chatOpen) return
    const root = document.documentElement
    const prevOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    const vv = window.visualViewport
    const apply = () => {
      root.style.setProperty('--vvh', `${Math.round(vv ? vv.height : window.innerHeight)}px`)
      root.style.setProperty('--vvt', `${Math.round(vv ? vv.offsetTop : 0)}px`)
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    return () => {
      root.style.overflow = prevOverflow
      root.style.removeProperty('--vvh')
      root.style.removeProperty('--vvt')
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
    }
  }, [chatOpen])

  async function signOut() {
    await fetch('/api/osai/auth/logout', { method: 'POST' })
    router.refresh()
  }

  return (
    <>
      <header className="osai-top">
        <div className="inner">
          <Link href="/osai" className="wordmark">osai</Link>
          <nav className="osai-nav" aria-label="Documents">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href} aria-current={isCurrent(n.href, pathname) ? 'page' : undefined}>
                <span className="idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="right">
            <button className="ask" type="button" onClick={() => setChatOpen(true)}>Ask</button>
            <UserMenu
              name={name}
              hasPassword={hasPassword}
              onMemory={() => setMemOpen(true)}
              onPassword={() => setPwOpen(true)}
              onSignOut={signOut}
            />
          </div>
        </div>
      </header>
      <div className="osai-body">
        <main className="osai-doc">
          <div className="reading">{children}</div>
        </main>
        <aside className={`osai-aside${chatOpen ? ' open' : ''}`} aria-label="Assistant">
          <Chat onClose={() => setChatOpen(false)} />
        </aside>
      </div>
      {pwOpen && <PasswordDialog hasPassword={hasPassword} onClose={() => setPwOpen(false)} onChanged={setHasPassword} />}
      {memOpen && <MemoryDialog onClose={() => setMemOpen(false)} />}
    </>
  )
}

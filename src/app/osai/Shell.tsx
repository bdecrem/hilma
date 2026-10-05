'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import Chat from './Chat'
import MemoryDialog from './MemoryDialog'
import PasswordDialog from './PasswordDialog'

const NAV = [
  { href: '/osai', label: 'Resources' },
  { href: '/osai/memo', label: 'Building OAI' },
]

// The Landscape (/osai/overview) and its details page hang off the memo now,
// reached from the card under it, so the memo's tab stays lit there.
function isCurrent(href: string, pathname: string) {
  if (href === '/osai/memo') return ['/osai/memo', '/osai/overview', '/osai/details'].some((p) => pathname.startsWith(p))
  return pathname === href
}

type Theme = 'dark' | 'light'
const THEME_KEY = 'osai:theme'
const CHAT_KEY = 'osai:chat'
const NARROW = '(max-width: 1000px)'

function ChatGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5c3.3 0 6 2.1 6 4.75S11.3 12 8 12c-.6 0-1.2-.07-1.75-.2L3 13l.8-2.4C2.7 9.7 2 8.5 2 7.25 2 4.6 4.7 2.5 8 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

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

  // Closed by default. A wide screen remembers the last choice; a phone always
  // starts with the sheet down.
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAT_KEY) === '1' && !window.matchMedia(NARROW).matches) setChatOpen(true)
    } catch { /* ignore */ }
  }, [])

  const toggleChat = useCallback((next?: boolean) => {
    setChatOpen((v) => {
      const on = next ?? !v
      try { localStorage.setItem(CHAT_KEY, on ? '1' : '0') } catch { /* ignore */ }
      return on
    })
  }, [])

  // ⌘/ (Ctrl+/) toggles the assistant; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); toggleChat() }
      else if (e.key === 'Escape' && chatOpen && !document.querySelector('.osai-dialog')) toggleChat(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [chatOpen, toggleChat])
  const [memOpen, setMemOpen] = useState(false)
  const [hasPassword, setHasPassword] = useState(initialHasPassword)

  // While the phone chat sheet is open: no page scroll behind it, and the sheet
  // follows the visual viewport (iOS shrinks it when the keyboard is up).
  useEffect(() => {
    if (!chatOpen || !window.matchMedia(NARROW).matches) return
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
            <button
              className="osai-chat-toggle"
              type="button"
              aria-pressed={chatOpen}
              aria-label="Assistant"
              title={chatOpen ? 'Close the assistant (⌘/)' : 'Ask the assistant (⌘/)'}
              onClick={() => toggleChat()}
            >
              <ChatGlyph />
            </button>
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
      <div className={`osai-body${chatOpen ? ' chat' : ''}`}>
        <main className="osai-doc">
          <div className="reading">{children}</div>
        </main>
        <aside className={`osai-aside${chatOpen ? ' open' : ''}`} aria-label="Assistant" aria-hidden={!chatOpen}>
          <Chat onClose={() => toggleChat(false)} />
        </aside>
      </div>
      {pwOpen && <PasswordDialog hasPassword={hasPassword} onClose={() => setPwOpen(false)} onChanged={setHasPassword} />}
      {memOpen && <MemoryDialog onClose={() => setMemOpen(false)} />}
    </>
  )
}

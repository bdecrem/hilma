'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { forwardRef, useEffect, useRef, useState } from 'react'
import {
  ProfileBadge,
  TabPill,
  IconCircleButton,
  LevelUpOverlay,
  useLevelWatcher,
} from './feynd-chrome'
import { useFeyndTheme, type FeyndThemeMode } from './FeyndThemeProvider'

export default function Shell({
  children,
  username,
}: {
  children: React.ReactNode
  username: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isChat = pathname === '/f2'
  const isTopics = pathname.startsWith('/f2/topics')
  const isPaste = pathname === '/f2/paste'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const { progress, celebration, dismiss } = useLevelWatcher()

  async function logout() {
    await fetch('/api/f2/auth/logout', { method: 'POST' })
    router.push('/f2/login')
    router.refresh()
  }

  return (
    <div className="feynd-root flex flex-col h-[100dvh] overflow-hidden">
      <header
        className="flex items-center gap-2 px-4 pt-3 pb-3 sticky top-0 z-30"
        style={{
          background: 'var(--feynd-bg)',
          borderBottom: '1px solid var(--feynd-border-soft)',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        }}
      >
        <div className="relative">
          <ProfileBadge username={username} progress={progress} onClick={() => setMenuOpen(v => !v)} />
          {menuOpen ? (
            <ProfileMenu
              ref={menuRef}
              username={username}
              onClose={() => setMenuOpen(false)}
              onLogout={logout}
            />
          ) : null}
        </div>

        {/* Center title — page-aware on mobile; tabs on desktop. */}
        <div className="flex-1 text-center sm:hidden">
          <span style={{ color: 'var(--feynd-text-2)', fontWeight: 500, fontSize: 16 }}>
            {centerTitle(pathname)}
          </span>
        </div>

        {/* Desktop inline tabs */}
        <nav className="hidden sm:flex flex-1 justify-center gap-1">
          <TopTab href="/f2" active={isChat} label="Chat" />
          <TopTab href="/f2/topics" active={isTopics} label="Topics" />
        </nav>

        <Link
          href="/f2/paste"
          aria-label="Paste a topic"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--feynd-surface)',
            border: `1px solid ${isPaste ? 'var(--feynd-coral)' : 'var(--feynd-border)'}`,
            color: 'var(--feynd-text)',
          }}
        >
          <PlusIcon />
        </Link>
      </header>

      <main
        className="flex-1 flex flex-col min-h-0"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
        }}
      >
        {children}
      </main>

      {/* Floating mobile pill */}
      <div className="sm:hidden">
        <TabPill active={isChat ? 'chat' : 'topics'} />
      </div>

      {celebration ? (
        <LevelUpOverlay progress={celebration} onDismiss={dismiss} />
      ) : null}
    </div>
  )
}

function centerTitle(pathname: string): string {
  if (pathname === '/f2') return 'Chat'
  if (pathname === '/f2/topics') return 'Library'
  if (pathname.startsWith('/f2/topics/')) return 'Topic'
  if (pathname === '/f2/paste') return 'Add'
  return ''
}

function TopTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: '8px 18px',
        borderRadius: 999,
        background: active ? 'var(--feynd-surface-2)' : 'transparent',
        color: active ? 'var(--feynd-text)' : 'var(--feynd-text-2)',
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Profile dropdown — settings (theme), account info, logout.
// ---------------------------------------------------------------------------

const ProfileMenu = forwardRef<
  HTMLDivElement,
  { username: string; onClose: () => void; onLogout: () => void }
>(function ProfileMenuImpl({ username, onClose, onLogout }, ref) {
  const { mode, setMode } = useFeyndTheme()
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        minWidth: 240,
        padding: 8,
        background: 'var(--feynd-surface)',
        border: '1px solid var(--feynd-border)',
        borderRadius: 14,
        boxShadow: 'var(--feynd-shadow-soft)',
        zIndex: 50,
      }}
    >
      <div style={{ padding: '8px 10px 4px', fontSize: 11, fontWeight: 600, letterSpacing: 0.2, color: 'var(--feynd-text-3)', textTransform: 'uppercase' }}>
        Signed in as
      </div>
      <div style={{ padding: '0 10px 8px', fontSize: 14, color: 'var(--feynd-text)' }}>{username}</div>

      <div style={{ height: 1, background: 'var(--feynd-border-soft)', margin: '4px 0' }} />

      <div style={{ padding: '8px 10px 4px', fontSize: 11, fontWeight: 600, letterSpacing: 0.2, color: 'var(--feynd-text-3)', textTransform: 'uppercase' }}>
        Appearance
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '4px 6px 8px' }}>
        {(['system', 'light', 'dark'] as FeyndThemeMode[]).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => setMode(opt)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid ' + (mode === opt ? 'var(--feynd-coral)' : 'var(--feynd-border)'),
              background: mode === opt ? 'var(--feynd-coral-soft)' : 'transparent',
              color: 'var(--feynd-text)',
              cursor: 'pointer',
            }}
          >
            {opt[0].toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--feynd-border-soft)', margin: '4px 0' }} />

      <button
        type="button"
        onClick={() => {
          onClose()
          onLogout()
        }}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px',
          fontSize: 14,
          color: '#D43F2B',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 8,
        }}
      >
        Sign out
      </button>
    </div>
  )
})

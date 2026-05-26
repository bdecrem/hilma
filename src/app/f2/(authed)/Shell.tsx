'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ProfileBadge,
  TabPill,
  LevelUpOverlay,
  useLevelWatcher,
} from './feynd-chrome'
import WebProfileSheet from './WebProfileSheet'

export default function Shell({
  children,
  username,
  initialAvatarUrl,
}: {
  children: React.ReactNode
  username: string
  initialAvatarUrl: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isChat = pathname === '/f2'
  const isTopics = pathname.startsWith('/f2/topics')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl)

  const { progress, celebration, dismiss } = useLevelWatcher()

  async function logout() {
    await fetch('/api/f2/auth/logout', { method: 'POST' })
    setSheetOpen(false)
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
        <ProfileBadge
          username={username}
          avatarUrl={avatarUrl}
          progress={progress}
          onClick={() => setSheetOpen(true)}
        />

        {/* Center title on mobile; inline tabs on desktop. */}
        <div className="flex-1 text-center sm:hidden">
          <span style={{ color: 'var(--feynd-text-2)', fontWeight: 500, fontSize: 16 }}>
            {centerTitle(pathname)}
          </span>
        </div>

        <nav className="hidden sm:flex flex-1 justify-center gap-1">
          <TopTab href="/f2" active={isChat} label="Chat" />
          <TopTab href="/f2/topics" active={isTopics} label="Topics" />
        </nav>

        {/* Reserved trailing slot — keeps the center title visually centered. */}
        <div style={{ width: 36, height: 36 }} />
      </header>

      <main
        className="flex-1 flex flex-col min-h-0"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
        }}
      >
        {children}
      </main>

      <div className="sm:hidden">
        <TabPill active={isChat ? 'chat' : 'topics'} />
      </div>

      <WebProfileSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        username={username}
        avatarUrl={avatarUrl}
        progress={progress}
        onAvatarChange={setAvatarUrl}
        onLogout={logout}
      />

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

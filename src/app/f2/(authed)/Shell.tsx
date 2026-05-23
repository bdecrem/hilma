'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

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

  async function logout() {
    await fetch('/api/f2/auth/logout', { method: 'POST' })
    router.push('/f2/login')
    router.refresh()
  }

  return (
    <div
      className="flex flex-col min-h-[100dvh] bg-[#f7f7f5] text-neutral-900"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <Link href="/f2" className="font-semibold tracking-tight text-lg">
          F2
        </Link>
        <div className="hidden sm:flex gap-1">
          <Link
            href="/f2"
            className={`px-4 py-1.5 rounded-full text-sm ${
              isChat
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Chat
          </Link>
          <Link
            href="/f2/topics"
            className={`px-4 py-1.5 rounded-full text-sm ${
              isTopics
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Topics
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/f2/paste"
            className={`px-3 py-1.5 rounded-full text-sm ${
              isPaste
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            + Paste
          </Link>
          <span className="hidden sm:inline text-neutral-500">{username}</span>
          <button
            onClick={logout}
            className="text-neutral-500 hover:text-neutral-900"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 pb-16 sm:pb-0">
        {children}
      </main>

      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Link
          href="/f2"
          className={`flex-1 text-center py-3 text-sm font-medium ${
            isChat ? 'text-neutral-900' : 'text-neutral-400'
          }`}
        >
          Chat
        </Link>
        <Link
          href="/f2/topics"
          className={`flex-1 text-center py-3 text-sm font-medium ${
            isTopics ? 'text-neutral-900' : 'text-neutral-400'
          }`}
        >
          Topics
        </Link>
      </nav>
    </div>
  )
}

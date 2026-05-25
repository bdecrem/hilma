'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type FeyndThemeMode = 'system' | 'light' | 'dark'
type Resolved = 'light' | 'dark'

type Ctx = {
  mode: FeyndThemeMode
  resolved: Resolved
  setMode: (m: FeyndThemeMode) => void
}

const FeyndThemeCtx = createContext<Ctx | null>(null)
const STORAGE_KEY = 'feynd-theme-mode'

/// Sets a `data-feynd-theme` attribute on `<body>` based on the user's mode
/// preference (`system | light | dark`), and updates it whenever the system
/// scheme flips. The tokens CSS file reacts to that attribute.
export default function FeyndThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [mode, setModeState] = useState<FeyndThemeMode>('system')
  const [resolved, setResolved] = useState<Resolved>('dark')

  // Read persisted mode + apply once on mount. Done in effect (not state init)
  // because localStorage isn't available during SSR.
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      setModeState(raw)
    }
  }, [])

  // Resolve the active scheme from mode + system, and apply to <body>.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    function compute(): Resolved {
      if (mode === 'system') return mql.matches ? 'dark' : 'light'
      return mode
    }

    function apply() {
      const r = compute()
      setResolved(r)
      document.body.setAttribute('data-feynd-theme', r)
      // Keep the URL/notch bar in sync — matches iOS themeColor behavior.
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', r === 'dark' ? '#0E0C0B' : '#FAF6EE')
    }

    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [mode])

  function setMode(m: FeyndThemeMode) {
    setModeState(m)
    localStorage.setItem(STORAGE_KEY, m)
  }

  return (
    <FeyndThemeCtx.Provider value={{ mode, resolved, setMode }}>
      {children}
    </FeyndThemeCtx.Provider>
  )
}

export function useFeyndTheme() {
  const c = useContext(FeyndThemeCtx)
  if (!c) throw new Error('useFeyndTheme must be used inside FeyndThemeProvider')
  return c
}

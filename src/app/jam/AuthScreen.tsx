'use client'

import { useEffect, useRef, useState } from 'react'
import { api, type JamUser } from './api'
import Catalog from './Catalog'

// Landing for a signed-out visitor: mark + wordmark, one line of positioning,
// one sentence of what it does, two keys into the auth form, then the public
// catalog so a visitor can hear it before ever signing up.
//
// "jam:seen" only decides whether the auth form opens automatically — a
// returning signed-out visitor shouldn't have to tap a key again to get back
// to the form they already used once. It never skips the marketing hero
// itself (that would need a signed-in session, handled upstream in JamApp).
const SEEN_KEY = 'jam:seen'

export default function AuthScreen({ onSignedIn, hint }: { onSignedIn: (u: JamUser) => void; hint?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [formOpen, setFormOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Read the pre-existing value once (into a ref, not state) before writing —
  // React's dev-mode double effect invoke would otherwise read back its own
  // write on the second pass and think every first-time visitor is returning.
  const seenBeforeRef = useRef<boolean | null>(null)
  useEffect(() => {
    try {
      if (seenBeforeRef.current === null) seenBeforeRef.current = localStorage.getItem(SEEN_KEY) === '1'
      if (seenBeforeRef.current || hint) setFormOpen(true)
      localStorage.setItem(SEEN_KEY, '1')
    } catch { /* noop */ }
  }, [hint])

  const openForm = (m: 'login' | 'signup') => {
    setMode(m)
    setFormOpen(true)
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { user } = mode === 'login' ? await api.login(username, password) : await api.signup(username, password)
      onSignedIn(user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jb-screen px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
      {/* Hero: 72px mark (22% radius = ~16px) beside the wordmark, baseline-aligned. */}
      <header className="pt-12">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jam/mark-dark.png" alt="" width={72} height={72} style={{ borderRadius: 16, flexShrink: 0 }} />
          <h1 className="jb-wordmark jb-wordmark--hero">
            Jambot<span className="dot" />
          </h1>
        </div>
        <p className="jb-eyebrow mt-5">A groovebox you talk to.</p>
        <p className="jb-body jb-muted mt-2 max-w-[38ch]">
          Say “techno at 128 with a 909 kick and offbeat hats” and real synth engines — 909 drums, 303 acid, 101 leads — play it back in seconds, every parameter tweakable, every pattern yours to keep.
        </p>
        {hint && <p className="mt-4 rounded-xl bg-[#0f9f6e]/12 px-3 py-2 text-sm text-[#0a7a54]">{hint}</p>}
      </header>

      {/* Two keys straight into the form — stacked full-width so "Start a
          track" never wraps and both keys stay the same height. */}
      <div className="flex flex-col gap-3 mt-6">
        <button type="button" onClick={() => openForm('signup')} className="jb-key jb-key--orange jb-key--wide">
          Start a track
        </button>
        <button type="button" onClick={() => openForm('login')} className="jb-key jb-key--panel jb-key--wide">
          Sign in
        </button>
      </div>

      <Catalog title="Listen" emptyText="Nothing published yet." />

      {formOpen && (
        <form onSubmit={submit} className="jb-card mt-6 flex flex-col gap-3 p-4">
          <div className="jb-row">
            <span className="jb-eyebrow">{mode === 'login' ? 'Sign in' : 'New account'}</span>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} className="jb-readout underline underline-offset-4">
              {mode === 'login' ? 'create an account' : 'I have an account'}
            </button>
          </div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            className="jb-field"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="jb-field"
          />
          {error && <p className="jb-note err">{error}</p>}
          <button type="submit" disabled={busy || !username || !password} className="jb-key jb-key--orange jb-key--wide mt-1">
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      )}

      <footer className="mt-10 pb-4 text-center">
        <span className="jb-readout">Made by Bart Decrem · jambot.to</span>
      </footer>
    </div>
  )
}

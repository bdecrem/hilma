'use client'

import { useState } from 'react'
import { api, type JamUser } from './api'
import Catalog from './Catalog'
import LedStrip from './LedStrip'

// The hero strip is a real pattern: four-on-the-floor kick, backbeat
// snare, offbeat hats — the first thing most people ask Jambot for.
const HERO = { k: '1000100010001000', s: '0000100000001000', h: '0010001000100010' }

export default function AuthScreen({ onSignedIn, hint }: { onSignedIn: (u: JamUser) => void; hint?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      <header className="pt-12">
        <p className="jb-eyebrow">A groovebox you talk to</p>
        <h1 className="jb-wordmark jb-wordmark--hero mt-2">
          Jambot<span className="dot" />
        </h1>
        <div className="mt-6">
          <LedStrip strip={HERO} big chase />
        </div>
        <p className="jb-body jb-muted mt-5 max-w-[34ch]">
          Say “techno at 128 with a 909 kick and an acid line”. Hear it in seconds. Turn the knobs. Keep every track.
        </p>
        {hint && <p className="mt-4 rounded-xl bg-[#0f9f6e]/12 px-3 py-2 text-sm text-[#0a7a54]">{hint}</p>}
      </header>

      <form onSubmit={submit} className="jb-card mt-8 flex flex-col gap-3 p-4">
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

      <Catalog title="Listen" emptyText="Nothing published yet." />
    </div>
  )
}

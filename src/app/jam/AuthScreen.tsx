'use client'

import { useState } from 'react'
import { api, type JamUser } from './api'

export default function AuthScreen({ onSignedIn }: { onSignedIn: (u: JamUser) => void }) {
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
      const { user } = mode === 'login'
        ? await api.login(username, password)
        : await api.signup(username, password)
      onSignedIn(user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex h-[100dvh] flex-col bg-[#0d0e12] px-6 text-[#f2f2f5]"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 64px)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <h1 className="text-5xl font-extrabold tracking-[-0.06em]">JAM</h1>
      <p className="mt-2 text-white/55">Talk to a groovebox. Keep every track.</p>

      <form onSubmit={submit} className="mt-10 flex flex-col gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          className="rounded-2xl bg-white/8 px-4 py-3 text-base outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb02e]/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="rounded-2xl bg-white/8 px-4 py-3 text-base outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb02e]/60"
        />
        {error && <p className="text-sm text-[#ff5c7a]">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="mt-2 rounded-2xl bg-[#ffb02e] py-3 text-base font-semibold text-black disabled:opacity-40 active:scale-[0.98]"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
        className="mt-6 text-sm text-white/55 underline-offset-4 hover:underline"
      >
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const res = await fetch('/api/f2/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Login failed')
      return
    }
    router.push('/f2')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        autoComplete="username"
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full rounded-xl bg-white border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl bg-white border border-neutral-200 px-4 py-3 outline-none focus:border-neutral-400"
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-2 rounded-xl bg-neutral-900 text-white py-3 font-medium disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

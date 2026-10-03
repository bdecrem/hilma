'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Login() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const user = name.trim().toLowerCase()
    if (!user || !code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/osai/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user, passcode: code }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? `Sign-in failed (${res.status}).`)
        return
      }
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="osai-login">
      <form className="card" onSubmit={submit}>
        <div>
          <div className="wordmark">osai</div>
          <div className="sub">Open Source AI</div>
        </div>
        <label>
          Name
          <input id="osai-name" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Password
          <input id="osai-passcode" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <div className="err" role="alert">{error}</div>}
        <button className="go" type="submit" disabled={!name.trim() || !code.trim() || busy}>
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </form>
    </main>
  )
}

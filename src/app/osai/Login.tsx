'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const NAMES: { id: string; label: string }[] = [
  { id: 'mitchell', label: 'Mitchell' },
  { id: 'songyee', label: 'Songyee' },
  { id: 'bart', label: 'Bart' },
]

export default function Login() {
  const router = useRouter()
  const [user, setUser] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
          <h1 style={{ marginTop: 8 }}>Open Source AI, the working notes.</h1>
          <p className="lede" style={{ marginTop: 8 }}>
            The one-pager, the public-benefit AI map, and an assistant that has read both. For three readers.
          </p>
        </div>
        <div className="names" role="group" aria-label="Who are you?">
          {NAMES.map((n) => (
            <button
              key={n.id}
              type="button"
              className="name"
              aria-pressed={user === n.id}
              onClick={() => setUser(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
        <label>
          Passcode
          <input
            id="osai-passcode"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="····"
          />
        </label>
        {error && <div className="err" role="alert">{error}</div>}
        <button className="go" type="submit" disabled={!user || !code.trim() || busy}>
          {busy ? 'Signing in…' : user ? `Continue as ${NAMES.find((n) => n.id === user)?.label}` : 'Pick your name'}
        </button>
        <div className="fine">Private. Nothing here is indexed or shared beyond the three of us.</div>
      </form>
    </main>
  )
}

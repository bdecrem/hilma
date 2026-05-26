'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthField, AuthCTA, AuthError } from '../auth/AuthAtoms'

export default function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function looksLikeEmail(s: string): boolean {
    const t = s.trim()
    return t.includes('@') && t.includes('.') && t.length >= 5
  }
  const canSubmit = looksLikeEmail(email) && password.length >= 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    const res = await fetch('/api/f2/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Sign up failed.')
      return
    }
    router.push('/f2')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <AuthField
        type="email"
        autoComplete="email"
        placeholder="email"
        value={email}
        onChange={setEmail}
      />
      <AuthField
        type="password"
        autoComplete="new-password"
        placeholder="password (8+ characters)"
        value={password}
        onChange={setPassword}
      />
      <AuthError text={err} />
      <AuthCTA label="Create account" disabled={!canSubmit} busy={busy} />

      <div className="text-center mt-6" style={{ fontSize: 14 }}>
        <span style={{ color: 'var(--feynd-text-2)' }}>Already have one? </span>
        <Link
          href="/f2/login"
          style={{
            color: 'var(--feynd-coral)',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Sign in
        </Link>
      </div>
    </form>
  )
}

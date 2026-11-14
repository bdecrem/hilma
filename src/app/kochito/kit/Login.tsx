'use client'

import { useState } from 'react'

// The door of app.kochitolabs.com: a name and a passcode. The server sets a
// cookie that lasts a year (src/lib/kochito/app-auth.ts), so this is seen once
// per browser.
export default function Login({ face }: { face: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/kochito/app/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.get('name'), passcode: f.get('passcode') }) })
      if (res.ok) return window.location.reload()
      const out = await res.json().catch(() => ({}))
      setError(out.error || 'Sign-in is not working right now.')
    } catch {
      setError('No connection. Try again.')
    }
    setBusy(false)
  }

  return (
    <div className="ko ko-gate">
      <main>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ko-gate-face" src={face} alt="Kit, a young beaver" width={220} height={220} />
        <h1>
          Kit’s{' '}
          <span className="u">
            desk
            <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 13c22-8 40 6 62-1s38-9 60-2 44 2 72-5" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
            </svg>
          </span>
        </h1>
        <p className="ko-gate-sub">Where Kit reports to the founder. Sign in once and this browser remembers you.</p>
        <form onSubmit={submit}>
          <div className="ko-gate-fields">
            <label>
              <span className="ko-mono">name</span>
              <input name="name" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
            </label>
            <label>
              <span className="ko-mono">passcode</span>
              <input name="passcode" type="password" autoComplete="current-password" required />
            </label>
          </div>
          <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="ko-gate-error" role="alert">
            {error}
          </p>
        </form>
        <p className="ko-gate-foot">
          Looking for the company? <a href="https://kochitolabs.com">kochitolabs.com</a>
        </p>
      </main>
    </div>
  )
}

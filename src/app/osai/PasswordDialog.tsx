'use client'

import { useEffect, useRef, useState } from 'react'

export default function PasswordDialog({
  hasPassword,
  onClose,
  onChanged,
}: {
  hasPassword: boolean
  onClose: () => void
  onChanged: (hasPassword: boolean) => void
}) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (pw.length < 8) return setError('At least 8 characters.')
    if (pw !== confirm) return setError('The two entries do not match.')
    setBusy(true)
    try {
      const res = await fetch('/api/osai/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw, confirm }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return setError(j.error ?? `Could not save (${res.status}).`)
      setDone('Saved. Use it from now on.')
      onChanged(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function useShared() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/osai/auth/password', { method: 'DELETE' })
      if (!res.ok) return setError(`Could not remove it (${res.status}).`)
      setDone('Removed. The shared passcode works again.')
      onChanged(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="osai-dialog-backdrop" onClick={onClose} role="presentation">
      <form className="osai-dialog" onClick={(e) => e.stopPropagation()} onSubmit={save} role="dialog" aria-labelledby="osai-pw-title">
        <h2 id="osai-pw-title">{hasPassword ? 'Change your password' : 'Set a password'}</h2>
        {done ? (
          <>
            <p className="ok">{done}</p>
            <div className="actions"><span /><div><button type="button" className="primary" onClick={onClose}>Done</button></div></div>
          </>
        ) : (
          <>
            <p>{hasPassword ? 'Replaces your current password.' : 'At least 8 characters. It replaces the shared passcode for you.'}</p>
            <label>
              New password
              <input ref={first} id="osai-pw-new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label>
              Again
              <input id="osai-pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            {error && <div className="err" role="alert">{error}</div>}
            <div className="actions">
              {hasPassword ? (
                <button type="button" className="link" onClick={useShared} disabled={busy}>Use the shared passcode instead</button>
              ) : (
                <span />
              )}
              <div>
                <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="primary" disabled={busy || !pw || !confirm}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

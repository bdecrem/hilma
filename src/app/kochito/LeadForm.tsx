'use client'

import { useId, useRef, useState } from 'react'
import { origin, send } from './Track'

// The one form on each service page. An email is all it needs; the link (a
// PDF, an app's store page) lets the free work start before the first reply.
export default function LeadForm({
  page,
  emailPlaceholder,
  detailLabel,
  detailHint,
  detailPlaceholder,
  button,
  done,
}: {
  page: 'pdf' | 'apps'
  emailPlaceholder: string
  detailLabel: string
  detailHint: string
  detailPlaceholder: string
  button: string
  done: string
}) {
  const id = useId()
  const touched = useRef(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  const focus = () => {
    if (touched.current) return
    touched.current = true
    send(page, 'cta')
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/kochito/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page, email: f.get('email'), detail: f.get('detail'), ...origin() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Something went wrong.')
      setState('done')
    } catch (err) {
      setError((err as Error).message.startsWith('kochito') ? 'That did not go through. Email hello@kochitolabs.com instead.' : (err as Error).message)
      setState('idle')
    }
  }

  if (state === 'done')
    return (
      <div className="kl-form kl-done" role="status">
        <p className="kl-done-h">Got it.</p>
        <p>
          {done} We will write to <strong>{email}</strong> from hello@kochitolabs.com.
        </p>
      </div>
    )

  return (
    <form className="kl-form" id="start" onSubmit={submit} onFocus={focus}>
      <label htmlFor={`${id}-e`}>Work email</label>
      <input id={`${id}-e`} name="email" type="email" required autoComplete="email" placeholder={emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor={`${id}-d`}>
        {detailLabel} <span className="kl-opt">optional</span>
      </label>
      <input id={`${id}-d`} name="detail" type="text" inputMode="url" placeholder={detailPlaceholder} aria-describedby={`${id}-h`} />
      <p className="kl-hint" id={`${id}-h`}>
        {detailHint}
      </p>
      <button type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : button}
      </button>
      <p className="kl-error" role="alert">
        {error}
      </p>
    </form>
  )
}

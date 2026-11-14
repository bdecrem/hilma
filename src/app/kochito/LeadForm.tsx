'use client'

import { useId, useRef, useState } from 'react'
import { origin, send } from './Track'

// The one form on each page: an address and a button on one line. The link (a
// PDF, an app's store page) is optional and sits behind "add a link now", so
// the first step is as small as it can be.
export default function LeadForm({
  page,
  emailPlaceholder,
  button,
  under,
  moreLabel,
  detailLabel,
  detailPlaceholder,
  done,
  anchor = true,
}: {
  page: string // 'pdf', 'apps', or a sample page ('s/killeen')
  emailPlaceholder: string
  button: string
  under: string // the line under the form, before the "add a link" control
  moreLabel: string // the control that reveals the second field
  detailLabel: string
  detailPlaceholder: string
  done: string
  anchor?: boolean // carries id="start" (one form per page does)
}) {
  const id = useId()
  const touched = useRef(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [more, setMore] = useState(false)
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
      setError((err as Error).message.startsWith('kochito') ? 'That did not go through. Please email hello@kochitolabs.com instead.' : (err as Error).message)
      setState('idle')
    }
  }

  if (state === 'done')
    return (
      <div className="kl-form kl-done" role="status" id={anchor ? 'start' : undefined}>
        <p className="kl-done-h">Request received.</p>
        <p>
          {done} We will write to <strong>{email}</strong> from hello@kochitolabs.com.
        </p>
      </div>
    )

  return (
    <form className="kl-form" id={anchor ? 'start' : undefined} onSubmit={submit} onFocus={focus}>
      <div className="kl-form-row">
        <label className="kl-sr" htmlFor={`${id}-e`}>
          Work email
        </label>
        <input id={`${id}-e`} name="email" type="email" required autoComplete="email" placeholder={emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : button}
        </button>
      </div>
      {more && (
        <div className="kl-form-more">
          <div className="kl-form-row">
            <label className="kl-sr" htmlFor={`${id}-d`}>
              {detailLabel}
            </label>
            <input id={`${id}-d`} name="detail" type="text" placeholder={detailPlaceholder} autoFocus />
          </div>
        </div>
      )}
      <p className="kl-form-under">
        {under}{' '}
        {!more && (
          <button type="button" className="kl-linkbtn" onClick={() => setMore(true)}>
            {moreLabel}
          </button>
        )}
      </p>
      <p className="kl-error" role="alert">
        {error}
      </p>
    </form>
  )
}

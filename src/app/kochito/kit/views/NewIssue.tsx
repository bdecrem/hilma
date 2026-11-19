'use client'
import { useState } from 'react'
import { AREAS } from '@/lib/venture/board'

// New issue (app.kochitolabs.com/issues/new): a title, what and why, area, priority, plan week and
// who. Saved as the signed-in account, next up, and shown to Kit as new in its inbox. `mock` (the
// made-up preview) saves nothing.
export default function NewIssue({ base, mock = false }: { base: string; mock?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    if (mock) return setErr('Made-up preview: nothing is saved.')
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/kochito/app/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, week: f.week ? Number(f.week) : null }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `not saved (${res.status})`)
      window.location.href = `${base}/issues/${j.issue.id}`
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <p className="bd-crumb">
        <a href={`${base}/issues`}>Issue Tracker</a> / new
      </p>
      <div className="bd-head">
        <h1>New issue</h1>
      </div>
      <form className="bd-form" onSubmit={submit}>
        <label>
          Title
          <input type="text" name="title" required autoFocus maxLength={300} placeholder="In plain words: what should be true when it is done" />
        </label>
        <label>
          What and why
          <textarea name="what" placeholder="One or two sentences. Links work." />
        </label>
        <div className="three">
          <label>
            Area
            <select name="area" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {Object.entries(AREAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue="P1">
              <option>P0</option>
              <option>P1</option>
              <option>P2</option>
            </select>
          </label>
          <label>
            Plan week
            <select name="week" defaultValue="">
              <option value="">None</option>
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </label>
          <label>
            Who
            <input type="text" name="who" defaultValue="lead" maxLength={60} />
          </label>
        </div>
        <div className="bd-actions">
          <button className="bd-btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Create issue'}
          </button>
          <a className="bd-btn" href={`${base}/issues`}>
            Cancel
          </a>
          {err && <span className="bd-err">{err}</span>}
        </div>
      </form>
    </>
  )
}

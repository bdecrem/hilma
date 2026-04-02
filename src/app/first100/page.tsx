'use client'

import { useState } from 'react'

const CHANNELS = [
  'Reddit',
  'Hacker News',
  'Twitter / X',
  'Product Hunt',
  'Indie Hackers',
  'Discord communities',
  'Cold email',
  'Other',
]

const TIMELINES = [
  { value: '2w', label: '2 weeks' },
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
]

interface Brief {
  id: string
  app_name: string
  app_url: string | null
  description: string
  audience: string
  channels: string[]
  timeline: string
}

export default function First100Page() {
  const [channels, setChannels] = useState<string[]>([])
  const [timeline, setTimeline] = useState('1m')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<Brief | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggleChannel(ch: string) {
    setChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const fd = new FormData(e.currentTarget)
    const payload = {
      app_name: fd.get('name'),
      description: fd.get('description'),
      app_url: fd.get('url') || null,
      audience: fd.get('audience'),
      channels,
      timeline,
    }

    try {
      const res = await fetch('/first100/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      setSubmitted(data.brief)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{styles}</style>

      <div className="f1-page">
        <div className="f1-container">
          {submitted ? (
            <div className="f1-success">
              <div className="f1-success-check">&#10003;</div>
              <h2 className="f1-success-title">Brief received</h2>
              <p className="f1-success-text">
                We&apos;re building your plan to find 100 users for <strong>{submitted.app_name}</strong>.
                We&apos;ll be in touch.
              </p>
              <div className="f1-success-id">
                Brief ID: <code>{submitted.id.slice(0, 8)}</code>
              </div>
              <button className="f1-submit" style={{ marginTop: 32 }} onClick={() => { setSubmitted(null); setChannels([]); setTimeline('1m') }}>
                Submit another
              </button>
              <footer className="f1-footer"><span>first100.dev</span></footer>
            </div>
          ) : (<>
          {/* Hero */}
          <header className="f1-hero">
            <div className="f1-badge">
              <span className="f1-badge-dot" />
              early access
            </div>
            <h1 className="f1-title">
              first<span className="f1-accent">100</span>
            </h1>
            <p className="f1-subtitle">
              your app deserves <strong>real users</strong>. describe it, and we&apos;ll build you a plan to find your first 100.
            </p>
          </header>

          {/* Form */}
          <form className="f1-form" onSubmit={handleSubmit}>

            {/* Section 1: The App */}
            <div className="f1-section">
              <div className="f1-section-label">
                <span className="f1-step">01</span>
                your app
              </div>

              <div className="f1-field">
                <label className="f1-label" htmlFor="name">App name</label>
                <input
                  className="f1-input"
                  id="name"
                  name="name"
                  type="text"
                  placeholder="e.g. Linktree for developers"
                  required
                />
              </div>

              <div className="f1-field">
                <label className="f1-label" htmlFor="url">URL</label>
                <input
                  className="f1-input"
                  id="url"
                  name="url"
                  type="url"
                  placeholder="https://"
                />
              </div>

              <div className="f1-field">
                <label className="f1-label" htmlFor="description">What does it do?</label>
                <textarea
                  className="f1-textarea"
                  id="description"
                  name="description"
                  placeholder="Explain it like you would to a friend. What problem does it solve? What's different about it?"
                  rows={4}
                  required
                />
              </div>
            </div>

            {/* Section 2: The Users */}
            <div className="f1-section">
              <div className="f1-section-label">
                <span className="f1-step">02</span>
                your users
              </div>

              <div className="f1-field">
                <label className="f1-label" htmlFor="audience">
                  Who are these 100 people?
                </label>
                <textarea
                  className="f1-textarea"
                  id="audience"
                  name="audience"
                  placeholder="Indie hackers building SaaS? Designers who use Figma? Parents looking for meal planning? Be specific."
                  rows={3}
                  required
                />
              </div>
            </div>

            {/* Section 3: The Plan */}
            <div className="f1-section">
              <div className="f1-section-label">
                <span className="f1-step">03</span>
                the plan
              </div>

              <div className="f1-field">
                <label className="f1-label">Channels you&apos;re open to</label>
                <div className="f1-channels">
                  {CHANNELS.map(ch => (
                    <button
                      key={ch}
                      type="button"
                      className={`f1-chip ${channels.includes(ch) ? 'f1-chip-active' : ''}`}
                      onClick={() => toggleChannel(ch)}
                    >
                      {channels.includes(ch) && <span className="f1-check">&#10003;</span>}
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div className="f1-field">
                <label className="f1-label">Timeline</label>
                <div className="f1-timeline">
                  {TIMELINES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`f1-time-btn ${timeline === t.value ? 'f1-time-active' : ''}`}
                      onClick={() => setTimeline(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error */}
            {error && <div className="f1-error">{error}</div>}

            {/* Submit */}
            <button type="submit" className="f1-submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Build my plan'}
              {!submitting && <span className="f1-arrow">&rarr;</span>}
            </button>

          </form>

          <footer className="f1-footer"><span>first100.dev</span></footer>
          </>)}
        </div>
      </div>
    </>
  )
}

const styles = `
  .f1-page {
    min-height: 100dvh;
    background: #fafafa;
    color: #1c1c1c;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
    position: relative;
    overflow-x: hidden;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  .f1-container {
    position: relative;
    z-index: 1;
    max-width: 580px;
    margin: 0 auto;
    padding: 80px 24px 60px;
  }

  /* Hero */
  .f1-hero {
    margin-bottom: 56px;
  }

  .f1-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #E86534;
    margin-bottom: 24px;
    opacity: 0;
    animation: f1-fade-up 0.6s ease forwards;
  }

  .f1-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #E86534;
    animation: f1-pulse 2s ease-in-out infinite;
  }

  .f1-title {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: clamp(48px, 8vw, 72px);
    font-weight: 600;
    letter-spacing: -3px;
    color: #1c1c1c;
    line-height: 1;
    margin: 0 0 16px;
    opacity: 0;
    animation: f1-fade-up 0.6s ease 0.1s forwards;
  }

  .f1-accent {
    color: #E86534;
  }

  .f1-subtitle {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    color: #888;
    line-height: 1.7;
    margin: 0;
    max-width: 420px;
    opacity: 0;
    animation: f1-fade-up 0.6s ease 0.2s forwards;
  }

  .f1-subtitle strong {
    color: #1c1c1c;
    font-weight: 500;
  }

  /* Form */
  .f1-form {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .f1-section {
    padding: 40px 0;
    border-top: 1px solid #e2e2e2;
    opacity: 0;
    animation: f1-fade-up 0.5s ease forwards;
  }

  .f1-section:nth-child(1) { animation-delay: 0.3s; }
  .f1-section:nth-child(2) { animation-delay: 0.4s; }
  .f1-section:nth-child(3) { animation-delay: 0.5s; }

  .f1-section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #888;
    margin-bottom: 28px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .f1-step {
    color: #E86534;
    font-weight: 600;
  }

  .f1-field {
    margin-bottom: 24px;
  }

  .f1-field:last-child {
    margin-bottom: 0;
  }

  .f1-label {
    display: block;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #1c1c1c;
    margin-bottom: 8px;
  }

  .f1-input,
  .f1-textarea {
    width: 100%;
    background: #fff;
    border: 1px solid #e2e2e2;
    border-radius: 10px;
    padding: 14px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    color: #1c1c1c;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }

  .f1-input::placeholder,
  .f1-textarea::placeholder {
    color: #bbb;
  }

  .f1-input:focus,
  .f1-textarea:focus {
    border-color: #E86534;
    box-shadow: 0 0 0 3px rgba(232,101,52,0.1);
  }

  .f1-textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.6;
  }

  /* Channel chips */
  .f1-channels {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .f1-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #fff;
    border: 1px solid #e2e2e2;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #888;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }

  .f1-chip:hover {
    color: #3a3a3a;
    border-color: #ccc;
  }

  .f1-chip-active {
    color: #E86534 !important;
    background: rgba(232,101,52,0.06) !important;
    border-color: #E86534 !important;
  }

  .f1-check {
    font-size: 11px;
  }

  /* Timeline */
  .f1-timeline {
    display: flex;
    gap: 8px;
  }

  .f1-time-btn {
    flex: 1;
    padding: 12px 16px;
    background: #fff;
    border: 1px solid #e2e2e2;
    border-radius: 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #888;
    cursor: pointer;
    transition: all 0.15s;
  }

  .f1-time-btn:hover {
    color: #3a3a3a;
    border-color: #ccc;
  }

  .f1-time-active {
    color: #E86534 !important;
    background: rgba(232,101,52,0.06) !important;
    border-color: #E86534 !important;
  }

  /* Submit */
  .f1-submit {
    margin-top: 48px;
    width: 100%;
    padding: 18px 24px;
    background: #E86534;
    border: none;
    border-radius: 10px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 15px;
    font-weight: 500;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all 0.2s;
    opacity: 0;
    animation: f1-fade-up 0.5s ease 0.6s forwards;
  }

  .f1-submit:hover {
    background: #c4512a;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(232,101,52,0.2);
  }

  .f1-submit:active {
    transform: translateY(0);
  }

  .f1-arrow {
    transition: transform 0.2s;
  }

  .f1-submit:hover .f1-arrow {
    transform: translateX(3px);
  }

  /* Footer */
  .f1-footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid #e2e2e2;
    font-size: 12px;
    color: #bbb;
  }

  /* Success state */
  .f1-success {
    text-align: center;
    padding: 120px 0 60px;
    animation: f1-fade-up 0.5s ease forwards;
  }

  .f1-success-check {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(232,101,52,0.1);
    color: #E86534;
    font-size: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
  }

  .f1-success-title {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.5px;
    color: #1c1c1c;
    margin: 0 0 12px;
  }

  .f1-success-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    color: #888;
    line-height: 1.7;
    margin: 0 0 24px;
  }

  .f1-success-text strong {
    color: #1c1c1c;
    font-weight: 500;
  }

  .f1-success-id {
    font-size: 12px;
    color: #bbb;
  }

  .f1-success-id code {
    background: rgba(0,0,0,0.04);
    padding: 2px 8px;
    border-radius: 4px;
  }

  /* Error */
  .f1-error {
    background: rgba(239,68,68,0.06);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    color: #dc2626;
    margin-top: 16px;
  }

  .f1-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  /* Animations */
  @keyframes f1-fade-up {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes f1-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* Mobile */
  @media (max-width: 600px) {
    .f1-container {
      padding: 48px 20px 40px;
    }
    .f1-timeline {
      flex-direction: column;
    }
  }
`

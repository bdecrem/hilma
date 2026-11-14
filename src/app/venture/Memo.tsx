'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ola.cx/venture/memo?k=…: voice notes for Claude. Bart, 2026-11-14: "a
// permanent conversation URL I can bookmark... a URL where I can leave you
// voice notes." One button: record, then stop and send. The note is
// transcribed on the server and lands in the thread the working session
// already watches (src/lib/venture/memo.ts), so nothing else has to be done.
// Nothing talks back here; the list shows each note and when it was read.
type Memo = { id: number; text: string; at: string; seen_at: string | null }
type Phase = 'idle' | 'recording' | 'sending'

// A note is one upload, and the server takes about 4 MB: at 32 kbit/s that is
// well over ten minutes. Stop at nine and send, so a long note is never lost.
const MAX_SECONDS = 9 * 60
const BITRATE = 32000

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Memo() {
  const key = useRef('')
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const discard = useRef(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [memos, setMemos] = useState<Memo[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/venture/memo?k=${encodeURIComponent(key.current)}`, { cache: 'no-store' })
      if (res.ok) setMemos((await res.json()).memos)
    } catch {}
  }, [])

  useEffect(() => {
    key.current = new URLSearchParams(window.location.search).get('k') ?? ''
    load()
    const t = setInterval(load, 20000) // "read" appears on its own
    return () => clearInterval(t)
  }, [load])

  const send = useCallback(
    async (blob: Blob) => {
      setPhase('sending')
      try {
        const form = new FormData()
        form.append('key', key.current)
        form.append('audio', blob, 'note')
        if (new URLSearchParams(window.location.search).get('test') === '1') form.append('test', '1')
        const res = await fetch('/api/venture/memo', { method: 'POST', body: form })
        const out = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(out.error || 'The note did not go through. Record it again.')
        setMemos((m) => [out.memo as Memo, ...m])
      } catch (e) {
        setError((e as Error).message)
      }
      setPhase('idle')
    },
    [],
  )

  const stop = useCallback((throwAway = false) => {
    discard.current = throwAway
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
  }, [])

  const start = useCallback(async () => {
    setError('')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setError('I need the microphone. Allow it for this page and try again.')
      return
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const r = new MediaRecorder(stream.current, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: BITRATE })
    chunks.current = []
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: r.mimeType || type || 'audio/webm' })
      if (discard.current) setPhase('idle')
      else send(blob)
    }
    rec.current = r
    r.start(1000)
    setSeconds(0)
    setPhase('recording')
  }, [send])

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => {
    if (phase === 'recording' && seconds >= MAX_SECONDS) stop()
  }, [phase, seconds, stop])
  // leaving the page mid-note: let go of the microphone
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), [])

  return (
    <main className="vi-wrap">
      <div className="vi-kicker">Venture · voice notes</div>
      <h1 style={{ marginTop: 26 }}>{phase === 'recording' ? 'Listening' : 'Leave me a note'}</h1>
      {phase === 'idle' && <p className="vi-sub">Say what you want done, changed or looked at. I read every note within a minute or two and act on it. You do not need to text me.</p>}
      <div className="vi-status vi-memo-clock" aria-live="polite">
        {phase === 'recording' ? clock(seconds) : phase === 'sending' ? 'writing it down…' : ''}
      </div>
      <div className="vi-actions">
        {phase === 'idle' && (
          <button className="vi-btn primary" onClick={start}>
            Record a note
          </button>
        )}
        {phase === 'recording' && (
          <>
            <button className="vi-btn primary" onClick={() => stop()}>
              Stop and send
            </button>
            <button className="vi-btn" onClick={() => stop(true)}>
              Discard
            </button>
          </>
        )}
        {phase === 'sending' && (
          <button className="vi-btn primary" disabled>
            Sending…
          </button>
        )}
      </div>
      {error && (
        <p className="vi-error" role="alert">
          {error}
        </p>
      )}
      {memos.length > 0 && (
        <div className="vi-log">
          {memos.map((m) => (
            <div key={m.id} className="vi-turn bart">
              <span className="who">
                {when(m.at)} · {m.seen_at ? `read ${when(m.seen_at)}` : 'not read yet'}
              </span>
              {m.text}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

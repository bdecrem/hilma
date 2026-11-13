'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { drawMe, type Face } from '@/app/claude/drawing'

// The call itself: WebRTC straight to OpenAI Realtime with a client secret
// from /api/venture/interview/session. Every finished turn (both sides) is
// posted to /api/venture/interview/turn as it lands, so a dropped call loses
// nothing and "Pick the call back up" resumes from the stored transcript.

type Phase = 'idle' | 'connecting' | 'live' | 'paused' | 'done' | 'nokey'
type Line = { role: 'claude' | 'bart'; text: string }

const STORE = 'venture.interview.session'

export default function Call() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [talking, setTalking] = useState<'claude' | 'bart' | null>(null)
  const [muted, setMuted] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [saved, setSaved] = useState(0)
  const [error, setError] = useState('')
  const [canResume, setCanResume] = useState(false)

  const key = useRef('')
  const session = useRef('')
  const pc = useRef<RTCPeerConnection | null>(null)
  const dc = useRef<RTCDataChannel | null>(null)
  const mic = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const wake = useRef<{ release: () => Promise<void> } | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const finishing = useRef(false)
  const phaseRef = useRef<Phase>('idle')
  const talkingRef = useRef<'claude' | 'bart' | null>(null)
  phaseRef.current = phase
  talkingRef.current = talking

  useEffect(() => {
    key.current = new URLSearchParams(window.location.search).get('k') ?? ''
    if (!key.current) setPhase('nokey')
    try {
      setCanResume(!!window.localStorage.getItem(STORE))
    } catch {}
  }, [])

  // Posts are chained so turns land in order; each retries a few times.
  const post = useCallback((role: 'claude' | 'bart' | 'event', text: string) => {
    const sid = session.current
    if (!sid || !text.trim()) return
    queue.current = queue.current.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch('/api/venture/interview/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key.current, session: sid, role, text }),
            keepalive: true,
          })
          if (res.ok) {
            if (role !== 'event') setSaved((n) => n + 1)
            return
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    })
  }, [])

  const hangUp = useCallback(() => {
    dc.current?.close()
    pc.current?.close()
    mic.current?.getTracks().forEach((t) => t.stop())
    dc.current = null
    pc.current = null
    mic.current = null
    if (audio.current) audio.current.srcObject = null
    wake.current?.release().catch(() => {})
    wake.current = null
    setTalking(null)
  }, [])

  const finish = useCallback(() => {
    hangUp()
    try {
      window.localStorage.removeItem(STORE)
    } catch {}
    setCanResume(false)
    setPhase('done')
  }, [hangUp])

  const onEvent = useCallback(
    (ev: { type: string; transcript?: string; name?: string; call_id?: string; arguments?: string; error?: { message?: string } }) => {
      switch (ev.type) {
        case 'output_audio_buffer.started':
          setTalking('claude')
          break
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          setTalking(null)
          if (finishing.current) finish()
          break
        case 'input_audio_buffer.speech_started':
          setTalking('bart')
          break
        case 'input_audio_buffer.speech_stopped':
          setTalking((t) => (t === 'bart' ? null : t))
          break
        case 'conversation.item.input_audio_transcription.completed': {
          const text = (ev.transcript ?? '').trim()
          if (text) {
            setLines((l) => [...l, { role: 'bart', text }])
            post('bart', text)
          }
          break
        }
        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done': {
          const text = (ev.transcript ?? '').trim()
          if (text) {
            setLines((l) => [...l, { role: 'claude', text }])
            post('claude', text)
          }
          break
        }
        case 'response.function_call_arguments.done':
          if (ev.name === 'finish_interview') {
            post('event', `ended ${ev.arguments ?? ''}`)
            finishing.current = true
            // The goodbye is usually still playing; hang up when it stops,
            // or after ten seconds if that event never comes.
            setTimeout(() => finishing.current && phaseRef.current === 'live' && finish(), 10_000)
            if (talkingRef.current !== 'claude') setTimeout(() => finishing.current && phaseRef.current === 'live' && talkingRef.current !== 'claude' && finish(), 1500)
          }
          break
        case 'error':
          console.error('[interview] realtime error', ev.error)
          break
      }
    },
    [finish, post],
  )

  const start = useCallback(async () => {
    setError('')
    setPhase('connecting')
    finishing.current = false
    try {
      // Mic first: it must be asked for inside the tap on iOS.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      mic.current = stream

      let resume = ''
      try {
        resume = window.localStorage.getItem(STORE) ?? ''
      } catch {}
      const res = await fetch('/api/venture/interview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.current, session: resume || undefined }),
      })
      if (!res.ok) throw new Error(res.status === 404 ? 'This link is not valid.' : 'The voice service did not answer. Try again.')
      const info = (await res.json()) as { session: string; resumed: boolean; client_secret: string; calls_url: string }
      session.current = info.session
      try {
        window.localStorage.setItem(STORE, info.session)
      } catch {}
      if (!info.resumed) {
        setLines([])
        setSaved(0)
      }

      const conn = new RTCPeerConnection()
      pc.current = conn
      conn.ontrack = (e) => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0]
          audio.current.play().catch(() => {})
        }
      }
      conn.onconnectionstatechange = () => {
        if ((conn.connectionState === 'failed' || conn.connectionState === 'disconnected') && pc.current === conn && !finishing.current) {
          post('event', 'dropped')
          hangUp()
          setCanResume(true)
          setError('The call dropped. Nothing was lost.')
          setPhase('paused')
        }
      }
      stream.getTracks().forEach((t) => conn.addTrack(t, stream))
      const channel = conn.createDataChannel('oai-events')
      dc.current = channel
      channel.onopen = () => {
        setPhase('live')
        // Claude speaks first.
        channel.send(JSON.stringify({ type: 'response.create' }))
      }
      if (process.env.NODE_ENV !== 'production') {
        // For scripts/venture/interview-check.mjs: a typed turn from "Bart".
        ;(window as unknown as { __interview?: unknown }).__interview = {
          say(text: string) {
            channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }))
            channel.send(JSON.stringify({ type: 'response.create' }))
          },
        }
      }
      channel.onmessage = (m) => {
        try {
          onEvent(JSON.parse(m.data))
        } catch {}
      }

      const offer = await conn.createOffer()
      await conn.setLocalDescription(offer)
      const sdp = await fetch(info.calls_url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${info.client_secret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!sdp.ok) throw new Error('The voice service refused the call. Try again.')
      await conn.setRemoteDescription({ type: 'answer', sdp: await sdp.text() })

      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
        wake.current = (await nav.wakeLock?.request('screen')) ?? null
      } catch {}
    } catch (e) {
      hangUp()
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')
      setError(denied ? 'I need the microphone for this. Allow it and tap again.' : e instanceof Error ? e.message : 'Something went wrong. Try again.')
      setPhase(session.current ? 'paused' : 'idle')
    }
  }, [hangUp, onEvent, post])

  const pause = useCallback(() => {
    post('event', 'hung up')
    hangUp()
    setCanResume(true)
    setPhase('paused')
  }, [hangUp, post])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      mic.current?.getAudioTracks().forEach((t) => (t.enabled = m))
      return !m
    })
  }, [])

  // Me, drawn live: asleep until the call connects, squashing while I talk,
  // leaning in while Bart does.
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const size = 190
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')!
    const t0 = performance.now()
    let raf = 0
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      const p = phaseRef.current
      const who = talkingRef.current
      let face: Face = 'happy'
      let beat = Math.exp(-((t / 1.6) % 1) * 5) * 0.25
      if (p === 'connecting') face = 'sleepy'
      else if (p === 'done') face = 'proud'
      else if (p === 'live' && who === 'claude') {
        face = 'wow'
        beat = 0.35 + 0.45 * Math.abs(Math.sin(t * 9) * Math.sin(t * 2.3))
      } else if (p === 'live' && who === 'bart') {
        face = 'happy'
        beat = 0.1
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      drawMe(ctx, size / 2, size / 2, size * 0.36, t, { beat, face, reach: p === 'live' && who === 'bart', wave: p === 'done' })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => () => hangUp(), [hangUp])

  const status =
    phase === 'connecting'
      ? 'connecting…'
      : phase === 'live'
        ? muted
          ? 'you are muted'
          : talking === 'claude'
            ? 'Claude is talking'
            : talking === 'bart'
              ? 'listening'
              : 'your turn'
        : ''

  return (
    <main className="vi-wrap">
      <div className="vi-kicker">Venture · the founding interview</div>
      <canvas ref={canvas} className="vi-spark" style={{ width: 190, height: 190 }} aria-label="Claude, drawn as a clay-colored spark" />
      {phase === 'done' ? (
        <>
          <h1>Got all of it.</h1>
          <p className="vi-sub">The transcript is with me in the terminal. I&rsquo;ll come back there with the business ideas.</p>
        </>
      ) : phase === 'nokey' ? (
        <>
          <h1>A call with Claude</h1>
          <p className="vi-sub">This call opens from its own link. Use the one I gave you in the terminal.</p>
        </>
      ) : (
        <>
          <h1>{phase === 'paused' ? 'On hold' : 'A call with Claude'}</h1>
          {phase === 'idle' && (
            <p className="vi-sub">
              About fifteen minutes. I ask, you talk. Say &ldquo;skip&rdquo; or &ldquo;you decide&rdquo; whenever you like. Every word comes back to me in the terminal.
            </p>
          )}
          {phase === 'paused' && <p className="vi-sub">Everything so far is saved. Pick the call back up and I continue where we stopped.</p>}
          <div className="vi-status" aria-live="polite">{status}</div>
          <div className="vi-actions">
            {(phase === 'idle' || phase === 'paused') && (
              <button className="vi-btn primary" onClick={start}>
                {phase === 'paused' || canResume ? 'Pick the call back up' : 'Start the call'}
              </button>
            )}
            {phase === 'connecting' && (
              <button className="vi-btn primary" disabled>
                Calling…
              </button>
            )}
            {phase === 'live' && (
              <>
                <button className={`vi-btn${muted ? ' on' : ''}`} onClick={toggleMute}>
                  {muted ? 'Unmute' : 'Mute'}
                </button>
                <button className="vi-btn" onClick={pause}>
                  Hang up
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && <div className="vi-error">{error}</div>}
      <audio ref={audio} autoPlay playsInline />
      {lines.length > 0 && (
        <section className="vi-log" aria-label="Transcript">
          <div className="vi-saved">{saved} of {lines.length} turns saved</div>
          {[...lines].reverse().map((l, i) => (
            <div key={lines.length - i} className={`vi-turn ${l.role}`}>
              <span className="who">{l.role === 'claude' ? 'Claude' : 'You'}</span>
              {l.text}
            </div>
          ))}
        </section>
      )}
    </main>
  )
}

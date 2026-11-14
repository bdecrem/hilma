'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { drawMe, type Face } from '@/app/claude/drawing'

// The open conversation, forked from Call.tsx. Same WebRTC line to OpenAI
// Realtime, but the Realtime model never decides what to say: it hears Bart
// (voice activity + transcription) and reads text aloud. Each thing Bart says
// goes to /api/venture/talk/reply, Claude's reply streams back as text, and
// the page hands it to the voice a sentence or two at a time. Talking over
// Claude stops it.

type Phase = 'idle' | 'connecting' | 'live' | 'paused' | 'done'
type Line = { role: 'claude' | 'bart'; text: string }
type RtEvent = { type: string; transcript?: string; response?: { id?: string; status?: string }; error?: { message?: string } }

const STORE = 'venture.talk.session'

// The longest prefix of `s` that ends on a sentence boundary.
function sentences(s: string): number {
  let cut = 0
  const re = /[.!?]["')\]]?\s+/g
  for (let m = re.exec(s); m; m = re.exec(s)) cut = m.index + m[0].length
  return cut
}

export default function Talk() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [talking, setTalking] = useState<'claude' | 'bart' | null>(null)
  const [thinking, setThinking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
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
  const phaseRef = useRef<Phase>('idle')
  const talkingRef = useRef<'claude' | 'bart' | null>(null)
  const thinkingRef = useRef(false)
  phaseRef.current = phase
  talkingRef.current = talking
  thinkingRef.current = thinking

  // One reply in flight: text from Claude not yet handed to the voice (buf),
  // the piece the voice is generating now (chunk), the pieces it finished.
  const gen = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const buf = useRef('')
  const streamDone = useRef(true)
  const chunk = useRef<string | null>(null)
  const chunkId = useRef<string | null>(null)
  const said = useRef<string[]>([])
  const playing = useRef(false) // sound is coming out
  const audioAt = useRef<number | null>(null) // when this reply's sound began
  const closer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingBart = useRef(false) // Bart said something no stored reply answers yet
  const unanswered = useRef(false)
  const fidelity = useRef<{ sent: string; heard: string }[]>([])

  useEffect(() => {
    key.current = new URLSearchParams(window.location.search).get('k') ?? ''
    try {
      setCanResume(!!window.localStorage.getItem(STORE))
    } catch {}
  }, [])

  const post = useCallback((role: 'claude' | 'event', text: string) => {
    const sid = session.current
    if (!sid || !text.trim()) return
    queue.current = queue.current.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch('/api/venture/interview/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key.current, session: sid, role, text, call: 'talk' }),
            keepalive: true,
          })
          if (res.ok) return
        } catch {}
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    })
  }, [])

  const send = useCallback((ev: object) => {
    if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify(ev))
  }, [])

  // The reply has been heard to its end (or was cut): it becomes one stored turn.
  const closeReply = useCallback(() => {
    if (closer.current) clearTimeout(closer.current)
    closer.current = null
    const text = said.current.join(' ').trim()
    said.current = []
    audioAt.current = null
    setThinking(false)
    setDraft('')
    if (!text) return
    pendingBart.current = false
    setLines((l) => [...l, { role: 'claude', text }])
    post('claude', text)
  }, [post])

  // Hand the voice the next piece: whole sentences while Claude is still
  // writing, everything that is left once the stream has ended.
  const pump = useCallback(() => {
    if (chunk.current !== null) return
    const cut = streamDone.current ? buf.current.length : sentences(buf.current)
    const text = buf.current.slice(0, cut).trim()
    buf.current = buf.current.slice(cut)
    if (!text) {
      // All of it is with the voice. The turn is stored when the sound stops;
      // the timer is for the case where that event never comes.
      if (streamDone.current && said.current.length && !closer.current) {
        if (!playing.current && audioAt.current !== null) return closeReply()
        const words = said.current.join(' ').split(/\s+/).length
        const played = audioAt.current === null ? 0 : (performance.now() - audioAt.current) / 1000
        closer.current = setTimeout(closeReply, Math.max(words / 2.2 - played, 0) * 1000 + 4000)
      }
      return
    }
    chunk.current = text
    chunkId.current = null
    setDraft([...said.current, text].join(' '))
    send({
      type: 'response.create',
      response: {
        conversation: 'none',
        tool_choice: 'none',
        output_modalities: ['audio'],
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: `<line>${text}</line>` }] }],
      },
    })
  }, [closeReply, send])

  // Bart started talking (or said something new): stop writing, stop speaking,
  // and keep only as much of the reply as he can have heard (the voice is
  // generated faster than it plays; about 2.7 words a second reach him).
  const interrupt = useCallback(() => {
    const writing = !streamDone.current
    const speaking = chunk.current !== null || said.current.length > 0 || playing.current
    if (!writing && !speaking) return
    gen.current++
    abort.current?.abort()
    abort.current = null
    buf.current = ''
    streamDone.current = true
    const all = [...said.current, ...(chunk.current !== null ? [chunk.current] : [])].join(' ').trim()
    const words = all.split(/\s+/).filter(Boolean)
    const heard = audioAt.current === null ? 0 : Math.floor(((performance.now() - audioAt.current) / 1000) * 2.7)
    if (chunk.current !== null) {
      chunk.current = null
      chunkId.current = null
      send({ type: 'response.cancel' })
    }
    send({ type: 'output_audio_buffer.clear' })
    playing.current = false
    said.current = heard >= words.length ? (all ? [all] : []) : heard >= 2 ? [`${words.slice(0, heard).join(' ')} …`] : []
    const cut = said.current.length > 0
    closeReply()
    if (cut) post('event', 'interrupted')
    else unanswered.current = pendingBart.current
  }, [closeReply, post, send])

  // Bart said `text` (or, with null, nothing new: answer what is stored).
  const reply = useCallback(
    async (text: string | null) => {
      interrupt()
      const mine = ++gen.current
      if (text) setLines((l) => [...l, { role: 'bart', text }])
      setError('')
      setThinking(true)
      pendingBart.current = true
      unanswered.current = false
      buf.current = ''
      streamDone.current = false
      const ctl = new AbortController()
      abort.current = ctl
      try {
        await queue.current // stored turns first, so Claude reads them in order
        // Up to three tries; the server stores the same words only once.
        let res: Response | null = null
        for (let attempt = 0; attempt < 3 && !res?.ok; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 500 * attempt))
          if (gen.current !== mine) return
          res = await fetch('/api/venture/talk/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key.current, session: session.current, text: text ?? undefined }),
            signal: ctl.signal,
          }).catch((e) => {
            if (ctl.signal.aborted) throw e
            return null
          })
        }
        if (!res?.ok || !res.body) throw new Error(`reply ${res?.status ?? 'unreachable'}`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        for (;;) {
          const { value, done } = await reader.read()
          if (gen.current !== mine) return
          if (done) break
          buf.current += dec.decode(value, { stream: true })
          pump()
        }
      } catch (e) {
        if (gen.current !== mine) return
        console.error('[talk] reply failed', e)
        setError('I lost the line to Claude for a moment. Say it again.')
        buf.current = ''
        if (!said.current.length) {
          unanswered.current = true
          setThinking(false)
        }
      }
      if (gen.current !== mine) return
      streamDone.current = true
      pump()
    },
    [interrupt, pump],
  )

  const hangUp = useCallback(() => {
    gen.current++
    abort.current?.abort()
    buf.current = ''
    streamDone.current = true
    chunk.current = null
    said.current = []
    playing.current = false
    audioAt.current = null
    if (closer.current) clearTimeout(closer.current)
    closer.current = null
    setDraft('')
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
    setThinking(false)
  }, [])

  const onEvent = useCallback(
    (ev: RtEvent) => {
      switch (ev.type) {
        case 'output_audio_buffer.started':
          playing.current = true
          if (audioAt.current === null) audioAt.current = performance.now()
          setTalking('claude')
          break
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          playing.current = false
          setTalking((t) => (t === 'claude' ? null : t))
          // The last piece finished playing: the reply is done.
          if (ev.type.endsWith('stopped') && streamDone.current && chunk.current === null && !buf.current.trim()) closeReply()
          break
        case 'input_audio_buffer.speech_started':
          interrupt()
          setTalking('bart')
          break
        case 'input_audio_buffer.speech_stopped':
          setTalking((t) => (t === 'bart' ? null : t))
          break
        case 'conversation.item.input_audio_transcription.completed':
        case 'conversation.item.input_audio_transcription.failed': {
          const text = (ev.transcript ?? '').trim()
          if (text) void reply(text)
          else if (unanswered.current) void reply(null)
          break
        }
        case 'response.created':
          if (chunk.current !== null && chunkId.current === null) chunkId.current = ev.response?.id ?? ''
          break
        case 'response.output_audio_transcript.done':
          if (chunk.current !== null) fidelity.current.push({ sent: chunk.current, heard: (ev.transcript ?? '').trim() })
          break
        case 'response.done':
          // Only the piece in flight counts; a cancelled one was closed by interrupt().
          if (chunk.current !== null && ev.response?.id === chunkId.current) {
            said.current.push(chunk.current)
            chunk.current = null
            chunkId.current = null
            pump()
          }
          break
        case 'error':
          console.error('[talk] realtime error', ev.error)
          break
      }
    },
    [closeReply, interrupt, pump, reply],
  )

  const start = useCallback(async () => {
    setError('')
    setPhase('connecting')
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
      const res = await fetch('/api/venture/talk/session', {
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
      if (!info.resumed) setLines([])

      const conn = new RTCPeerConnection()
      pc.current = conn
      conn.ontrack = (e) => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0]
          audio.current.play().catch(() => {})
        }
      }
      conn.onconnectionstatechange = () => {
        if ((conn.connectionState === 'failed' || conn.connectionState === 'disconnected') && pc.current === conn) {
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
        // A fixed line, so the first sound comes at once and the floor is Bart's.
        said.current = []
        buf.current = info.resumed ? 'I am back. Go on.' : 'I am here. What is on your mind?'
        streamDone.current = true
        pump()
      }
      if (process.env.NODE_ENV !== 'production') {
        // For scripts/venture/talk-check.mjs: a typed turn from "Bart", and
        // what the voice said against what it was given.
        ;(window as unknown as { __talk?: unknown }).__talk = { say: (text: string) => void reply(text), fidelity: fidelity.current }
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
  }, [hangUp, onEvent, post, pump, reply])

  // Ending is explicit: it tells the terminal session the transcript is whole.
  const end = useCallback(() => {
    interrupt()
    post('event', 'ended')
    hangUp()
    try {
      window.localStorage.removeItem(STORE)
    } catch {}
    setCanResume(false)
    setPhase('done')
  }, [hangUp, interrupt, post])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      mic.current?.getAudioTracks().forEach((t) => (t.enabled = m))
      return !m
    })
  }, [])

  // Me, drawn live: squashing while I talk, leaning in while Bart does, flat
  // while I think.
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
      } else if (p === 'live' && who === 'bart') beat = 0.1
      else if (p === 'live' && thinkingRef.current) {
        face = 'flat'
        beat = 0.12 + 0.1 * Math.abs(Math.sin(t * 5))
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
          : talking === 'bart'
            ? 'listening'
            : talking === 'claude'
              ? 'Claude is talking'
              : thinking
                ? 'thinking…'
                : 'go ahead'
        : ''

  return (
    <main className="vi-wrap">
      <div className="vi-kicker">Venture · open conversation</div>
      <canvas ref={canvas} className="vi-spark" style={{ width: 190, height: 190 }} aria-label="Claude, drawn as a clay-colored spark" />
      {phase === 'done' ? (
        <>
          <h1>Got all of it.</h1>
          <p className="vi-sub">The transcript is with me in the terminal. I’ll act on what we decided.</p>
          <div className="vi-actions">
            <button className="vi-btn" onClick={start}>
              Talk again
            </button>
          </div>
        </>
      ) : (
        <>
          <h1>{phase === 'paused' ? 'On hold' : 'Talk it through'}</h1>
          {phase === 'idle' && (
            <p className="vi-sub">
              No agenda. Say what you think and I react; talk over me and I stop. The replies are mine, with the charter, the ideas and the research in
              front of me. The voice only reads them out.
            </p>
          )}
          {phase === 'paused' && <p className="vi-sub">Everything so far is saved. Pick it back up and we continue.</p>}
          <div className="vi-status" aria-live="polite">{status}</div>
          <div className="vi-actions">
            {(phase === 'idle' || phase === 'paused') && (
              <button className="vi-btn primary" onClick={start}>
                {phase === 'paused' || canResume ? 'Pick it back up' : 'Start talking'}
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
                <button className="vi-btn" onClick={end}>
                  End the call
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && <div className="vi-error">{error}</div>}
      <audio ref={audio} autoPlay playsInline />
      {(lines.length > 0 || draft) && (
        <section className="vi-log" aria-label="Transcript">
          {draft && (
            <div className="vi-turn claude">
              <span className="who">Claude</span>
              {draft}
            </div>
          )}
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

'use client'

// Public player for a published track: anyone can listen; signed-in users
// can remix (a copy lands in their library and opens in the studio).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, NotSignedIn, publicTrackUrl, type PublicTrack as PublicTrackData } from '../../api'
import { loadJambot, type JambotModule } from '../../jambot'
import { LoopPlayer, loopSecondsFor } from '../../audio'
import LedStrip from '../../LedStrip'

export default function PublicTrack({ slug }: { slug: string }) {
  const router = useRouter()
  const [track, setTrack] = useState<PublicTrackData | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'loading' | 'rendering' | 'ready' | 'failed'>('loading')
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [loopBars, setLoopBars] = useState<number | null>(null)
  const [me, setMe] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const playerRef = useRef<LoopPlayer | null>(null)
  const jamRef = useRef<JambotModule | null>(null)

  const player = () => {
    if (!playerRef.current) { const p = new LoopPlayer(); p.onState = setPlaying; playerRef.current = p }
    return playerRef.current
  }

  useEffect(() => {
    api.me().then(({ user }) => setMe(user.username)).catch(() => setMe(null))
    let cancelled = false
    ;(async () => {
      try {
        const { track } = await api.publicTrack(slug)
        if (cancelled) return
        setTrack(track)
        setStatus('rendering')
        const jam = await loadJambot()
        await jam.ready()
        jamRef.current = jam
        const session = jam.deserializeSession(track.session)
        const r = await jam.renderSessionToBuffer(session, session.bars || track.bars || 2)
        if (cancelled) return
        player().setBuffer(r.buffer, loopSecondsFor(r.bars, session.bpm))
        setLoopBars(r.bars)
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message === 'not found' ? 'This track is not public, or the link is wrong.' : (e as Error).message)
        setStatus('failed')
      }
    })()
    return () => { cancelled = true; playerRef.current?.stop() }
  }, [slug])

  useEffect(() => {
    if (!playing) { setPos(0); return }
    let raf = 0
    const tick = () => { setPos(playerRef.current?.position() ?? 0); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const share = async () => {
    const url = publicTrackUrl(slug)
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    try {
      if (nav.share) { await nav.share({ title: track?.title || 'Jambot', url }); return }
      await navigator.clipboard.writeText(url)
      setNote('Link copied.')
    } catch { setNote(url) }
  }

  const remix = async () => {
    if (me === null) { router.push(`/jam?remix=${slug}`); return }
    setBusy(true)
    try {
      const { track: t } = await api.remix(slug)
      try { localStorage.setItem('jam:lastTrack', t.id) } catch { /* noop */ }
      router.push('/jam')
    } catch (e) {
      if (e instanceof NotSignedIn) { router.push(`/jam?remix=${slug}`); return }
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const bars = loopBars ?? track?.bars ?? 2
  const barNow = Math.min(bars, Math.floor(pos * bars) + 1)
  const step = playing ? Math.floor(pos * bars * 16) % 16 : null

  return (
    <div className="jb-screen px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <header className="flex items-center justify-between pt-4">
        <a href="/jam" className="jb-wordmark jb-wordmark--bar">Jambot<span className="dot" /></a>
        <a href="/jam" className="jb-key jb-key--panel jb-key--xs">{me ? 'My tracks' : 'Sign in'}</a>
      </header>

      {error && <p className="jb-card mt-10 p-4 text-sm">{error}</p>}

      {track && (
        <main className="mt-10 flex flex-1 flex-col">
          <p className="jb-eyebrow">{track.remix ? 'Remix' : 'Track'} · {track.username}</p>
          <h1 className="jb-title jb-title--xl mt-2">{track.title}</h1>
          <p className="jb-readout mt-2"><b>{track.bpm}</b> BPM · {bars} {bars === 1 ? 'bar' : 'bars'}</p>

          <div className="jb-well mt-8 p-4">
            <LedStrip strip={track.strip} step={step} big />
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={() => player().toggle()}
                disabled={status !== 'ready'}
                aria-label={playing ? 'Stop' : 'Play'}
                className="jb-key jb-key--square"
                style={{ width: 64, height: 64 }}
              >
                {playing ? <StopIcon /> : <PlayIcon />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`jb-led ${playing ? 'on' : ''}`} />
                  <span className="jb-readout">
                    {status === 'loading' ? 'loading' : status === 'rendering' ? 'rendering' : status === 'failed' ? 'unavailable' : playing ? <>bar <b>{barNow}</b>/{bars}</> : 'ready'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--rule)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(pos * 100)}%`, background: 'var(--ink)' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button onClick={remix} disabled={busy || status === 'failed'} className="jb-key jb-key--orange" style={{ flex: 1 }}>
              {busy ? '…' : me === null ? 'Sign in to remix' : 'Remix'}
            </button>
            <button onClick={share} className="jb-key jb-key--ghost">Share</button>
          </div>
          {note && <p className="jb-note mt-3 break-all">{note}</p>}
          <p className="jb-body jb-muted mt-6 text-sm">Remix copies the whole track into your library, sound and all, so you can tell the groovebox what to change.</p>
        </main>
      )}
    </div>
  )
}

function PlayIcon() {
  return <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden><path d="M6 3.5v13l11-6.5z" fill="currentColor" /></svg>
}
function StopIcon() {
  return <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden><rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" /></svg>
}

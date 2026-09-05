'use client'

// Public player for a published track: anyone can listen; signed-in users
// can remix (a copy lands in their library and opens in the studio).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, NotSignedIn, publicTrackUrl, type PublicTrack as PublicTrackData } from '../../api'
import { loadJambot, type JambotModule } from '../../jambot'
import { LoopPlayer, loopSecondsFor } from '../../audio'

export default function PublicTrack({ slug }: { slug: string }) {
  const router = useRouter()
  const [track, setTrack] = useState<PublicTrackData | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'loading' | 'rendering' | 'ready' | 'failed'>('loading')
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
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
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message === 'not found' ? 'This track is not public (or the link is wrong).' : (e as Error).message)
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
      if (nav.share) { await nav.share({ title: track?.title || 'Jam', url }); return }
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

  const bars = track?.bars ?? 2
  const barNow = Math.min(bars, Math.floor(pos * bars) + 1)

  return (
    <div
      className="flex h-[100dvh] flex-col bg-[#0d0e12] px-5 text-[#f2f2f5]"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
    >
      <header className="flex items-center justify-between">
        <a href="/jam" className="text-2xl font-extrabold tracking-[-0.06em]">JAM</a>
        <a href="/jam" className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">{me ? 'My tracks' : 'Sign in'}</a>
      </header>

      {error && <p className="mt-10 rounded-2xl border border-[#ff5c7a]/40 bg-[#ff5c7a]/10 p-4 text-sm">{error}</p>}

      {track && (
        <main className="mt-10 flex flex-1 flex-col">
          <p className="text-xs uppercase tracking-widest text-[#5ee0ff]">{track.remix ? 'Remix' : 'Track'} by {track.username}</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">{track.title}</h1>
          <p className="mt-1 font-mono text-xs text-white/50">{track.bpm} BPM · {track.bars} {track.bars === 1 ? 'bar' : 'bars'}</p>

          <div className="mt-10 flex items-center gap-4">
            <button
              onClick={() => player().toggle()}
              disabled={status !== 'ready'}
              aria-label={playing ? 'Stop' : 'Play'}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#ffb02e] text-black disabled:opacity-30 active:scale-95"
            >
              {playing ? (
                <svg width="22" height="22" viewBox="0 0 18 18"><rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" /></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 20 20"><path d="M6 3.5v13l11-6.5z" fill="currentColor" /></svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#5ee0ff] transition-[width] duration-75" style={{ width: `${Math.round(pos * 100)}%` }} />
              </div>
              <div className="mt-1 font-mono text-[11px] text-white/45">
                {status === 'loading' ? 'loading…' : status === 'rendering' ? 'rendering…' : status === 'failed' ? 'unavailable' : playing ? `bar ${barNow}/${bars}` : 'ready'}
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-2">
            <button
              onClick={remix}
              disabled={busy || status === 'failed'}
              className="rounded-2xl bg-[#b6ff3d] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40 active:scale-[0.98]"
            >
              {busy ? '…' : me === null ? 'Sign in to remix' : 'Remix'}
            </button>
            <button onClick={share} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold active:bg-white/20">Share</button>
          </div>
          {note && <p className="mt-3 break-all text-xs text-white/50">{note}</p>}
          <p className="mt-6 text-xs text-white/40">Remixing copies the whole track into your library, sound and all, so you can tell the groovebox what to change.</p>
        </main>
      )}
    </div>
  )
}

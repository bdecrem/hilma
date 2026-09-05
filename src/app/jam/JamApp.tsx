'use client'

// Jam shell: sign in → your tracks → one track (Studio).
// Remembers the last open track so a phone reload lands back in it.

import { useCallback, useEffect, useState } from 'react'
import { api, NotSignedIn, type JamUser, type Track } from './api'
import AuthScreen from './AuthScreen'
import Library from './Library'
import Studio from './Studio'

const LAST_TRACK = 'jam:lastTrack'

export default function JamApp() {
  const [user, setUser] = useState<JamUser | null | undefined>(undefined)
  const [track, setTrack] = useState<Track | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')

  const openTrack = useCallback(async (id: string, opts: { silent?: boolean } = {}) => {
    setOpening(true)
    setError('')
    try {
      const { track } = await api.track(id)
      setTrack(track)
      try { localStorage.setItem(LAST_TRACK, id) } catch { /* noop */ }
    } catch (e) {
      if (e instanceof NotSignedIn) { setUser(null); return }
      try { localStorage.removeItem(LAST_TRACK) } catch { /* noop */ }
      // A remembered track that was deleted elsewhere just means "show the
      // library" — no banner for that.
      if (!opts.silent) setError((e as Error).message)
    } finally {
      setOpening(false)
    }
  }, [])

  // "/jam?remix=<slug>" — a visitor tapped Remix on a public track. Once
  // they are signed in, copy it into their library and open it.
  const [remixSlug, setRemixSlug] = useState<string | null>(null)
  useEffect(() => {
    try {
      const slug = new URLSearchParams(window.location.search).get('remix')
      if (slug && /^[a-z0-9]{4,16}$/.test(slug)) setRemixSlug(slug)
    } catch { /* noop */ }
  }, [])

  const doRemix = useCallback(async (slug: string) => {
    setRemixSlug(null)
    try { window.history.replaceState(null, '', window.location.pathname) } catch { /* noop */ }
    setOpening(true)
    try {
      const { track } = await api.remix(slug)
      await openTrack(track.id)
    } catch (e) {
      if (e instanceof NotSignedIn) { setUser(null); return }
      setError((e as Error).message)
    } finally {
      setOpening(false)
    }
  }, [openTrack])

  useEffect(() => {
    if (user && remixSlug) void doRemix(remixSlug)
  }, [user, remixSlug, doRemix])

  useEffect(() => {
    api.me()
      .then(({ user }) => {
        setUser(user)
        let last: string | null = null
        try { last = localStorage.getItem(LAST_TRACK) } catch { /* noop */ }
        const hasRemix = /[?&]remix=/.test(window.location.search)
        if (last && !hasRemix) void openTrack(last, { silent: true })
      })
      .catch(() => setUser(null))
  }, [openTrack])

  const newTrack = async () => {
    setError('')
    try {
      const { track } = await api.createTrack()
      setTrack(track)
      try { localStorage.setItem(LAST_TRACK, track.id) } catch { /* noop */ }
    } catch (e) {
      if (e instanceof NotSignedIn) { setUser(null); return }
      setError((e as Error).message)
    }
  }

  const signOut = async () => {
    try { await api.logout() } catch { /* cookie may already be gone */ }
    try { localStorage.removeItem(LAST_TRACK) } catch { /* noop */ }
    setTrack(null)
    setUser(null)
  }

  const authLost = () => {
    setTrack(null)
    setUser(null)
  }

  if (user === undefined || opening) {
    return (
      <div className="jb-screen items-center justify-center">
        <span className="jb-readout">{opening ? 'opening track' : 'loading'}</span>
      </div>
    )
  }

  if (!user) return <AuthScreen onSignedIn={(u) => setUser(u)} hint={remixSlug ? 'Sign in (or create an account) and the remix opens in your library.' : undefined} />

  if (track) {
    return (
      <Studio
        key={track.id}
        track={track}
        onBack={() => { setTrack(null); try { localStorage.removeItem(LAST_TRACK) } catch { /* noop */ } }}
        onAuthLost={authLost}
      />
    )
  }

  return (
    <>
      {error && (
        <button
          onClick={() => setError('')}
          className="fixed left-0 right-0 top-0 z-50 px-4 py-2 text-center text-sm font-medium"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', background: 'var(--orange)', color: 'var(--ink)' }}
        >
          {error} · tap to dismiss
        </button>
      )}
      <Library user={user} onOpen={openTrack} onNew={newTrack} onSignOut={signOut} />
    </>
  )
}

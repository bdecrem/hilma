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

  const openTrack = useCallback(async (id: string) => {
    setOpening(true)
    setError('')
    try {
      const { track } = await api.track(id)
      setTrack(track)
      try { localStorage.setItem(LAST_TRACK, id) } catch { /* noop */ }
    } catch (e) {
      if (e instanceof NotSignedIn) { setUser(null); return }
      try { localStorage.removeItem(LAST_TRACK) } catch { /* noop */ }
      setError((e as Error).message)
    } finally {
      setOpening(false)
    }
  }, [])

  useEffect(() => {
    api.me()
      .then(({ user }) => {
        setUser(user)
        let last: string | null = null
        try { last = localStorage.getItem(LAST_TRACK) } catch { /* noop */ }
        if (last) void openTrack(last)
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
      <div className="grid h-[100dvh] place-items-center bg-[#0d0e12] text-sm text-white/50">
        {opening ? 'Opening track…' : '…'}
      </div>
    )
  }

  if (!user) return <AuthScreen onSignedIn={(u) => setUser(u)} />

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
        <div className="fixed left-0 right-0 top-0 z-50 bg-[#ff5c7a] px-4 py-2 text-center text-sm font-medium text-black" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
          {error}
        </div>
      )}
      <Library user={user} onOpen={openTrack} onNew={newTrack} onSignOut={signOut} />
    </>
  )
}

// Thin client for /api/jam/*. Every call throws an Error with the server's
// message on failure; 401 throws a NotSignedIn so the shell can bounce to
// the auth screen.

import type { AgentMessage } from './jambot'

export type JamUser = { id: string; username: string; /** may rename / delete any catalog track */ admin?: boolean }

/** 16-step rhythm of a track (kick / snare / hats), '1' per hit. */
export type Strip = { k: string; s: string; h: string }

export type TrackMeta = {
  id: string
  title: string
  bpm: number
  bars: number
  created_at: string
  updated_at: string
  strip?: Strip | null
  /** Set when the track is public (catalog + /t/<slug>). */
  published_at?: string | null
  /** Public link id; minted on first publish and kept afterwards. */
  slug?: string | null
  remix_of?: string | null
}

/** A published track as anyone sees it (no owner ids). */
export type PublicTrackMeta = {
  slug: string
  title: string
  bpm: number
  bars: number
  published_at: string
  remix: boolean
  username: string
  strip?: Strip | null
}

export type PublicTrack = PublicTrackMeta & { session: unknown }

export function publicTrackUrl(slug: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // On the jambot.to domain /t/<slug> rewrites to /jam/t/<slug>; elsewhere use the full path.
  return /jambot\.to$/.test(typeof window !== 'undefined' ? window.location.hostname : '') ? `${origin}/t/${slug}` : `${origin}/jam/t/${slug}`
}

export type FeedItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; name: string; input: Record<string, unknown>; result?: string; isError?: boolean }
  | { id: string; kind: 'note'; text: string; error?: boolean }

export type Track = TrackMeta & {
  session: unknown | null
  messages: AgentMessage[]
  feed: FeedItem[]
}

export class NotSignedIn extends Error {
  constructor() { super('not signed in') }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    credentials: 'same-origin',
  })
  if (res.status === 401) throw new NotSignedIn()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`)
  return json as T
}

export const api = {
  me: () => call<{ user: JamUser }>('/api/jam/auth/me'),
  signup: (username: string, password: string) =>
    call<{ user: JamUser }>('/api/jam/auth/signup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    call<{ user: JamUser }>('/api/jam/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => call<{ ok: true }>('/api/jam/auth/logout', { method: 'POST' }),

  tracks: () => call<{ tracks: TrackMeta[] }>('/api/jam/tracks'),
  createTrack: (title?: string) =>
    call<{ track: Track }>('/api/jam/tracks', { method: 'POST', body: JSON.stringify({ title }) }),
  track: (id: string) => call<{ track: Track }>(`/api/jam/tracks/${id}`),
  saveTrack: (id: string, patch: Partial<Pick<Track, 'title' | 'bpm' | 'bars' | 'session' | 'messages' | 'feed'>>) =>
    call<{ track: TrackMeta }>(`/api/jam/tracks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteTrack: (id: string) => call<{ ok: true }>(`/api/jam/tracks/${id}`, { method: 'DELETE' }),
  duplicateTrack: (id: string) => call<{ track: TrackMeta }>(`/api/jam/tracks/${id}/duplicate`, { method: 'POST' }),
  publish: (id: string) => call<{ track: TrackMeta }>(`/api/jam/tracks/${id}/publish`, { method: 'POST' }),
  unpublish: (id: string) => call<{ track: TrackMeta }>(`/api/jam/tracks/${id}/publish`, { method: 'DELETE' }),

  // Public (no sign-in)
  catalog: () => call<{ tracks: PublicTrackMeta[] }>('/api/jam/public'),
  publicTrack: (slug: string) => call<{ track: PublicTrack }>(`/api/jam/public/${slug}`),
  remix: (slug: string) => call<{ track: TrackMeta }>(`/api/jam/public/${slug}/remix`, { method: 'POST' }),

  // Admin only (jam_users.is_admin): any track in the catalog
  renamePublicTrack: (slug: string, title: string) =>
    call<{ track: { slug: string; title: string } }>(`/api/jam/public/${slug}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deletePublicTrack: (slug: string) => call<{ ok: true }>(`/api/jam/public/${slug}`, { method: 'DELETE' }),
}

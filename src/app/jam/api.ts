// Thin client for /api/jam/*. Every call throws an Error with the server's
// message on failure; 401 throws a NotSignedIn so the shell can bounce to
// the auth screen.

import type { AgentMessage } from './jambot'

export type JamUser = { id: string; username: string }

export type TrackMeta = {
  id: string
  title: string
  bpm: number
  bars: number
  created_at: string
  updated_at: string
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
}

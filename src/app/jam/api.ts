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
  /** The user's own 1–5 star rating of the creation (taste signal), if any. */
  rating?: number | null
  /** Favourite: set when starred (orange-edged card, sorted first). */
  starred_at?: string | null
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

/** One vote on an agent turn: -3..3, 0 removes it. */
export type VoteBody = {
  trackId: string
  turnId: string
  score: number
  prompt?: string
  reply?: string
  actions?: string[]
  /** The turn's tool calls with their inputs (parameter attribution). */
  calls?: { name: string; input?: unknown }[]
  state?: Record<string, unknown>
}
export type Taste = { note: string | null; votes: number; updatedAt: string | null }

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
  saveTrack: (id: string, patch: Partial<Pick<Track, 'title' | 'bpm' | 'bars' | 'session' | 'messages' | 'feed' | 'rating'>> & { starred?: boolean }) =>
    call<{ track: TrackMeta }>(`/api/jam/tracks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteTrack: (id: string) => call<{ ok: true }>(`/api/jam/tracks/${id}`, { method: 'DELETE' }),
  duplicateTrack: (id: string) => call<{ track: TrackMeta }>(`/api/jam/tracks/${id}/duplicate`, { method: 'POST' }),
  publish: (id: string) => call<{ track: TrackMeta }>(`/api/jam/tracks/${id}/publish`, { method: 'POST' }),
  unpublish: (id: string) => call<{ track: TrackMeta }>(`/api/jam/tracks/${id}/publish`, { method: 'DELETE' }),

  // Public (no sign-in)
  catalog: () => call<{ tracks: PublicTrackMeta[] }>('/api/jam/public'),
  publicTrack: (slug: string) => call<{ track: PublicTrack }>(`/api/jam/public/${slug}`),
  remix: (slug: string) => call<{ track: TrackMeta }>(`/api/jam/public/${slug}/remix`, { method: 'POST' }),

  // Turn votes (👍 / 👎 on the last agent turn) and the taste note they build
  votes: (trackId: string) => call<{ votes: Record<string, number>; taste: Taste; recent?: string[]; starting?: string[] }>(`/api/jam/votes?track=${trackId}`),
  vote: (body: VoteBody) => call<{ ok: true; score: number; tasteUpdated: boolean }>('/api/jam/votes', { method: 'POST', body: JSON.stringify(body) }),
  // Rollback: one snapshot per agent turn (the five most recent), restored by ↺ in the turn's row
  snapshots: (trackId: string) => call<{ snapshots: { turnId: string; createdAt: string }[] }>(`/api/jam/tracks/${trackId}/snapshots`),
  saveSnapshot: (trackId: string, body: { turnId: string; session: unknown; messages: unknown; feed: unknown }) =>
    call<{ ok: true }>(`/api/jam/tracks/${trackId}/snapshots`, { method: 'POST', body: JSON.stringify(body) }),
  snapshot: (trackId: string, turnId: string) =>
    call<{ snapshot: { turnId: string; session: unknown; messages: AgentMessage[]; feed: FeedItem[]; createdAt: string } }>(`/api/jam/tracks/${trackId}/snapshots/${encodeURIComponent(turnId)}`),
  rollback: (trackId: string, body: { turnId: string; dropped: { turnId: string; prompt: string; calls: unknown[] }[] }) =>
    call<{ ok: true }>(`/api/jam/tracks/${trackId}/rollback`, { method: 'POST', body: JSON.stringify(body) }),

  /** Implicit whole-track signal (taste v2): a bounce that produced a file. */
  signal: (trackId: string, kind: 'bounce') => call<{ ok: true }>('/api/jam/signals', { method: 'POST', body: JSON.stringify({ trackId, kind }) }),

  // Admin only (jam_users.is_admin): any track in the catalog
  renamePublicTrack: (slug: string, title: string) =>
    call<{ track: { slug: string; title: string } }>(`/api/jam/public/${slug}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deletePublicTrack: (slug: string) => call<{ ok: true }>(`/api/jam/public/${slug}`, { method: 'DELETE' }),
}

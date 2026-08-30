// F2 artifacts — keepsakes the learner saves, quotes first. Loosely tied to
// a topic for the source chip; browsed in the Pebbles carousel and shown
// one-at-random while a flash set is being graded.

import { f2Supabase } from './supabase'

export type F2Artifact = {
  id: string
  thread_id: string | null
  kind: string
  body: string
  source: string | null
  /// Public URL of the photo for kind = 'image'; null for quotes.
  image_url: string | null
  /// Topic name of the linked thread, for the chip. Null when unlinked.
  topic: string | null
  created_at: string
}

export const PEBBLES_BUCKET = 'f2-pebbles'

const MAX_BODY_CHARS = 2000
const MAX_SOURCE_CHARS = 200

type ArtifactRow = {
  id: string
  thread_id: string | null
  kind: string
  body: string
  source: string | null
  image_url: string | null
  created_at: string
  f2_threads: { topic: string | null } | null
}

function toArtifact(r: ArtifactRow): F2Artifact {
  return {
    id: r.id,
    thread_id: r.thread_id,
    kind: r.kind,
    body: r.body,
    source: r.source,
    image_url: r.image_url ?? null,
    topic: r.f2_threads?.topic ?? null,
    created_at: r.created_at,
  }
}

export async function listArtifacts(userId: string): Promise<F2Artifact[]> {
  const { data, error } = await f2Supabase()
    .from('f2_artifacts')
    .select('id, thread_id, kind, body, source, image_url, created_at, f2_threads(topic)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[f2/artifacts] list failed:', error)
    return []
  }
  return ((data as unknown as ArtifactRow[]) ?? []).map(toArtifact)
}

export async function createArtifact(
  userId: string,
  input: {
    body: string
    source?: string | null
    thread_id?: string | null
    /// Set for photo pebbles; `body` becomes an optional caption.
    image_url?: string | null
  },
): Promise<F2Artifact | null> {
  const body = input.body.trim().slice(0, MAX_BODY_CHARS)
  const image_url = input.image_url ?? null
  if (!body && !image_url) return null
  const source = input.source?.trim().slice(0, MAX_SOURCE_CHARS) || null
  const { data, error } = await f2Supabase()
    .from('f2_artifacts')
    .insert({
      user_id: userId,
      thread_id: input.thread_id ?? null,
      kind: image_url ? 'image' : 'quote',
      body,
      source,
      image_url,
    })
    .select('id, thread_id, kind, body, source, image_url, created_at, f2_threads(topic)')
    .single()
  if (error) {
    console.error('[f2/artifacts] create failed:', error)
    return null
  }
  return toArtifact(data as unknown as ArtifactRow)
}

/// Storage path inside PEBBLES_BUCKET for a public URL we minted, or null.
export function pebbleStoragePath(imageUrl: string | null): string | null {
  if (!imageUrl) return null
  const marker = `/object/public/${PEBBLES_BUCKET}/`
  const i = imageUrl.indexOf(marker)
  return i < 0 ? null : decodeURIComponent(imageUrl.slice(i + marker.length))
}

export async function updateArtifact(
  userId: string,
  id: string,
  patch: { body?: string; source?: string | null; thread_id?: string | null },
): Promise<boolean> {
  const update: Record<string, unknown> = {}
  if (patch.body !== undefined) {
    const body = patch.body.trim().slice(0, MAX_BODY_CHARS)
    if (!body) return false
    update.body = body
  }
  if (patch.source !== undefined) {
    update.source = patch.source?.trim().slice(0, MAX_SOURCE_CHARS) || null
  }
  if (patch.thread_id !== undefined) update.thread_id = patch.thread_id
  if (Object.keys(update).length === 0) return true
  const { error } = await f2Supabase()
    .from('f2_artifacts')
    .update(update)
    .eq('user_id', userId)
    .eq('id', id)
  if (error) {
    console.error('[f2/artifacts] update failed:', error)
    return false
  }
  return true
}

export async function deleteArtifact(
  userId: string,
  id: string,
): Promise<boolean> {
  const sb = f2Supabase()
  const { data, error } = await sb
    .from('f2_artifacts')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('image_url')
  if (error) {
    console.error('[f2/artifacts] delete failed:', error)
    return false
  }
  // Photo pebble: drop the storage object too so the bucket doesn't grow.
  const path = pebbleStoragePath((data?.[0] as { image_url?: string | null } | undefined)?.image_url ?? null)
  if (path) {
    const { error: rmErr } = await sb.storage.from(PEBBLES_BUCKET).remove([path])
    if (rmErr) console.error('[f2/artifacts] image remove failed:', rmErr)
  }
  return true
}

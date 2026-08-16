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
  /// Topic name of the linked thread, for the chip. Null when unlinked.
  topic: string | null
  created_at: string
}

const MAX_BODY_CHARS = 2000
const MAX_SOURCE_CHARS = 200

type ArtifactRow = {
  id: string
  thread_id: string | null
  kind: string
  body: string
  source: string | null
  created_at: string
  f2_threads: { topic: string | null } | null
}

export async function listArtifacts(userId: string): Promise<F2Artifact[]> {
  const { data, error } = await f2Supabase()
    .from('f2_artifacts')
    .select('id, thread_id, kind, body, source, created_at, f2_threads(topic)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[f2/artifacts] list failed:', error)
    return []
  }
  return ((data as unknown as ArtifactRow[]) ?? []).map((r) => ({
    id: r.id,
    thread_id: r.thread_id,
    kind: r.kind,
    body: r.body,
    source: r.source,
    topic: r.f2_threads?.topic ?? null,
    created_at: r.created_at,
  }))
}

export async function createArtifact(
  userId: string,
  input: { body: string; source?: string | null; thread_id?: string | null },
): Promise<F2Artifact | null> {
  const body = input.body.trim().slice(0, MAX_BODY_CHARS)
  if (!body) return null
  const source = input.source?.trim().slice(0, MAX_SOURCE_CHARS) || null
  const { data, error } = await f2Supabase()
    .from('f2_artifacts')
    .insert({
      user_id: userId,
      thread_id: input.thread_id ?? null,
      kind: 'quote',
      body,
      source,
    })
    .select('id, thread_id, kind, body, source, created_at, f2_threads(topic)')
    .single()
  if (error) {
    console.error('[f2/artifacts] create failed:', error)
    return null
  }
  const r = data as unknown as ArtifactRow
  return {
    id: r.id,
    thread_id: r.thread_id,
    kind: r.kind,
    body: r.body,
    source: r.source,
    topic: r.f2_threads?.topic ?? null,
    created_at: r.created_at,
  }
}

export async function deleteArtifact(
  userId: string,
  id: string,
): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_artifacts')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) {
    console.error('[f2/artifacts] delete failed:', error)
    return false
  }
  return true
}

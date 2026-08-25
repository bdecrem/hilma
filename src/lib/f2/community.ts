import { f2Supabase } from './supabase'
import type { F2Thread } from './threads'

// Community-shared topics: a share is a pointer to the owner's live thread
// (see apps/f2/schema/044_f2_community.sql). Forking copies the material —
// sources + uploaded notes + flash cards — into a brand-new thread owned by
// the forker; chat history, stars, and study focus stay behind.

export type CommunityTopicRow = {
  id: string
  thread_id: string
  shared_at: string
  topic: string | null
  url: string | null
  kind: string | null
  author: string
}

/// Everything currently shared, newest share first. Deleted originals never
/// appear: the community row cascades away with its thread.
export async function listCommunityTopics(): Promise<CommunityTopicRow[]> {
  const { data, error } = await f2Supabase()
    .from('f2_community_topics')
    .select('id, thread_id, shared_at, f2_threads(topic, url, kind), f2_users(username)')
    .order('shared_at', { ascending: false })
  if (error) {
    console.error('[f2/community] list failed:', error)
    return []
  }
  type Row = {
    id: string
    thread_id: string
    shared_at: string
    f2_threads: { topic: string | null; url: string | null; kind: string | null } | null
    f2_users: { username: string } | null
  }
  // Supabase types FK embeds as arrays; at runtime a to-one FK embed is a
  // single object (confirmed against the live schema), hence the cast.
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.f2_threads !== null)
    .map((r) => ({
      id: r.id,
      thread_id: r.thread_id,
      shared_at: r.shared_at,
      topic: r.f2_threads?.topic ?? null,
      url: r.f2_threads?.url ?? null,
      kind: r.f2_threads?.kind ?? null,
      author: r.f2_users?.username ?? '(unknown)',
    }))
}

/// Thread ids the user has shared — drives the Share/Unshare menu item.
export async function sharedThreadIds(userId: string): Promise<Set<string>> {
  const { data, error } = await f2Supabase()
    .from('f2_community_topics')
    .select('thread_id')
    .eq('user_id', userId)
  if (error) {
    console.error('[f2/community] sharedThreadIds failed:', error)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.thread_id as string))
}

/// Share a thread the user owns. Idempotent (unique thread_id).
export async function shareThread(userId: string, threadId: string): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_community_topics')
    .upsert({ thread_id: threadId, user_id: userId }, { onConflict: 'thread_id' })
  if (error) {
    console.error('[f2/community] share failed:', error)
    return false
  }
  return true
}

export async function unshareThread(userId: string, threadId: string): Promise<boolean> {
  const { error } = await f2Supabase()
    .from('f2_community_topics')
    .delete()
    .eq('thread_id', threadId)
    .eq('user_id', userId)
  if (error) {
    console.error('[f2/community] unshare failed:', error)
    return false
  }
  return true
}

/// Fork a community topic into the user's own account. Returns the new
/// thread id, or null on failure. Copies the source material verbatim; the
/// flash deck is copied card-for-card with fresh scheduling (no ratings, no
/// spaced-repetition state, the forker starts clean).
export async function forkCommunityTopic(
  userId: string,
  username: string,
  communityId: string,
): Promise<string | null> {
  const db = f2Supabase()

  const { data: entry, error: entryErr } = await db
    .from('f2_community_topics')
    .select('thread_id, user_id')
    .eq('id', communityId)
    .maybeSingle()
  if (entryErr || !entry) {
    if (entryErr) console.error('[f2/community] fork lookup failed:', entryErr)
    return null
  }

  const { data: orig, error: origErr } = await db
    .from('f2_threads')
    .select('*')
    .eq('id', entry.thread_id)
    .maybeSingle()
  if (origErr || !orig) {
    if (origErr) console.error('[f2/community] fork thread load failed:', origErr)
    return null
  }
  const source = orig as F2Thread

  const { data: fresh, error: insertErr } = await db
    .from('f2_threads')
    .insert({
      user_id: userId,
      client: 'web',
      handle: username,
      topic: source.topic,
      url: source.url,
      content: source.content,
      additional_sources: source.additional_sources ?? [],
      kind: source.kind,
      video_band: source.video_band,
      messages: [],
    })
    .select('id')
    .single()
  if (insertErr || !fresh) {
    console.error('[f2/community] fork insert failed:', insertErr)
    return null
  }
  const newThreadId = fresh.id as string

  // Copy the deck. Card content only — ratings and review history are the
  // original owner's, and the forker's scheduler starts from zero.
  const { data: cards, error: cardsErr } = await db
    .from('f2_flash_cards')
    .select('question, answer, distractors, open_question, grading_note')
    .eq('thread_id', entry.thread_id)
    .eq('user_id', entry.user_id)
  if (cardsErr) {
    console.error('[f2/community] fork cards load failed:', cardsErr)
  } else if (cards && cards.length > 0) {
    const { error: copyErr } = await db.from('f2_flash_cards').insert(
      cards.map((c) => ({
        user_id: userId,
        thread_id: newThreadId,
        question: c.question,
        answer: c.answer,
        distractors: c.distractors ?? [],
        open_question: c.open_question ?? null,
        grading_note: c.grading_note ?? null,
      })),
    )
    if (copyErr) console.error('[f2/community] fork cards copy failed:', copyErr)
  }

  return newThreadId
}

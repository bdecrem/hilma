import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  classifyTopicKind,
  getThreadById,
  type F2AdditionalSource,
} from '@/lib/f2/threads'
import { fetchUrlContent, isUrl } from '@/lib/f2/url'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'
// URL fetches (especially YouTube via the proxy) can take ~10s.
export const maxDuration = 60

// Each storage row (primary or additional[i]) is exposed to the UI as one or
// two display items. For video/audio URLs that have an extracted transcript,
// we split the URL itself from the transcript so the user can delete just
// one without losing the other. Plain articles + pastes stay bundled.
type SourcePart = 'source' | 'url' | 'transcript'
type SourceKind = 'primary' | 'additional'

type SourceItem = {
  /** Stable id for the UI row. */
  id: string
  /** Which storage slot this comes from. */
  kind: SourceKind
  /** Index into additional_sources for kind='additional', else 0. */
  index: number
  /** Whether this row represents the whole bundled source, or just one half. */
  part: SourcePart
  /** Classified shape ('video' | 'audio' | 'web' | 'paste' | 'fallback'). */
  topic_kind: ReturnType<typeof classifyTopicKind>
  url: string | null
  title: string | null
  content_length: number
  added_at: string | null
}

function expandSource(input: {
  kind: SourceKind
  index: number
  url: string | null
  title: string | null
  content: string | null
  added_at: string | null
}): SourceItem[] {
  const topicKind = classifyTopicKind({
    url: input.url,
    content: input.content,
    topic: null,
  })
  const isMedia = topicKind === 'audio' || topicKind === 'video'
  const hasUrl = !!input.url
  const hasContent = (input.content?.length ?? 0) > 0
  const baseId = `${input.kind}-${input.index}`

  // Media URL with an actual transcript → two rows so the user can drop one
  // half independently of the other.
  if (isMedia && hasUrl && hasContent) {
    return [
      {
        id: `${baseId}-url`,
        kind: input.kind,
        index: input.index,
        part: 'url',
        topic_kind: topicKind,
        url: input.url,
        title: input.title,
        content_length: 0,
        added_at: input.added_at,
      },
      {
        id: `${baseId}-transcript`,
        kind: input.kind,
        index: input.index,
        part: 'transcript',
        topic_kind: topicKind,
        url: input.url,
        title: input.title,
        content_length: input.content?.length ?? 0,
        added_at: input.added_at,
      },
    ]
  }

  // Everything else stays as a single bundled row.
  if (!hasUrl && !hasContent) return []
  return [
    {
      id: `${baseId}-source`,
      kind: input.kind,
      index: input.index,
      part: 'source',
      topic_kind: topicKind,
      url: input.url,
      title: input.title,
      content_length: input.content?.length ?? 0,
      added_at: input.added_at,
    },
  ]
}

// GET /api/f2/topics/[id]/sources
// Returns every displayable source row for the View Context modal — primary
// first, then each additional source. Media URLs with transcripts are split
// into two rows; everything else is a single bundled row.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const items: SourceItem[] = []
  items.push(
    ...expandSource({
      kind: 'primary',
      index: 0,
      url: thread.url,
      title: null,
      content: thread.content,
      added_at: thread.created_at,
    }),
  )
  for (let i = 0; i < (thread.additional_sources?.length ?? 0); i++) {
    const s = thread.additional_sources[i]
    items.push(
      ...expandSource({
        kind: 'additional',
        index: i,
        url: s.url,
        title: s.title,
        content: s.content,
        added_at: s.added_at,
      }),
    )
  }

  return NextResponse.json({ items })
}

// POST /api/f2/topics/[id]/sources
// Body: { url: string }
//
// Fetches the URL's content (HTML/text or YouTube transcript) and appends
// { url, title, content, added_at } to the thread's additional_sources jsonb.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const url = body.url?.trim()
  if (!url || !isUrl(url)) {
    return NextResponse.json({ error: 'valid URL required' }, { status: 400 })
  }

  const fetched = await fetchUrlContent(url)
  const entry: F2AdditionalSource = {
    url,
    title: fetched.title,
    content: fetched.body,
    added_at: new Date().toISOString(),
  }
  const next = [...(thread.additional_sources ?? []), entry]

  const { error } = await f2Supabase()
    .from('f2_threads')
    .update({
      additional_sources: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[f2] add source failed:', error)
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  return NextResponse.json({
    source: entry,
    total: next.length,
    fetched: fetched.body !== null,
  })
}

// DELETE /api/f2/topics/[id]/sources
// Body: { kind, index?, part }
//   part = 'source'     → drop the whole entry (both url and content)
//   part = 'url'        → clear the URL but keep the content body
//   part = 'transcript' → clear the content but keep the URL
//
// For kind='additional', if both halves end up empty we drop the entry
// from the array entirely rather than leaving an empty stub behind.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let body: { kind?: string; index?: number; part?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const part = (body.part ?? 'source') as SourcePart
  if (part !== 'source' && part !== 'url' && part !== 'transcript') {
    return NextResponse.json({ error: "part must be 'source', 'url', or 'transcript'" }, { status: 400 })
  }

  const sb = f2Supabase()

  if (body.kind === 'primary') {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (part === 'source' || part === 'url') update.url = null
    if (part === 'source' || part === 'transcript') update.content = null
    const { error } = await sb
      .from('f2_threads')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      console.error('[f2] delete primary source failed:', error)
      return NextResponse.json({ error: 'delete failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.kind === 'additional') {
    const idx = body.index
    const arr = thread.additional_sources ?? []
    if (typeof idx !== 'number' || idx < 0 || idx >= arr.length) {
      return NextResponse.json({ error: 'invalid index' }, { status: 400 })
    }

    let next: F2AdditionalSource[]
    if (part === 'source') {
      next = arr.filter((_, i) => i !== idx)
    } else {
      const entry = arr[idx]
      const updated: F2AdditionalSource = {
        ...entry,
        url: part === 'url' ? null : entry.url,
        content: part === 'transcript' ? null : entry.content,
      }
      const hasUrl = !!updated.url
      const hasContent = (updated.content?.length ?? 0) > 0
      // If we just cleared both halves, drop the entry entirely.
      next = !hasUrl && !hasContent
        ? arr.filter((_, i) => i !== idx)
        : arr.map((s, i) => (i === idx ? updated : s))
    }

    const { error } = await sb
      .from('f2_threads')
      .update({
        additional_sources: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      console.error('[f2] delete additional source failed:', error)
      return NextResponse.json({ error: 'delete failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, total: next.length })
  }

  return NextResponse.json({ error: 'kind must be primary or additional' }, { status: 400 })
}

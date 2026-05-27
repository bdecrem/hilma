import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById, type F2AdditionalSource } from '@/lib/f2/threads'
import { fetchUrlContent, isUrl } from '@/lib/f2/url'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'
// URL fetches (especially YouTube via the proxy) can take ~10s.
export const maxDuration = 60

// GET /api/f2/topics/[id]/sources
// Returns every source attached to the topic (primary first, then additional)
// for the View Topic Context modal. Each item carries enough metadata for the
// UI to identify it back to the DELETE endpoint (kind + index).
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

  const sources: Array<{
    kind: 'primary' | 'additional'
    index: number
    url: string | null
    title: string | null
    content_length: number
    added_at: string | null
  }> = []

  if (thread.url || thread.content) {
    sources.push({
      kind: 'primary',
      index: 0,
      url: thread.url,
      title: null,
      content_length: thread.content?.length ?? 0,
      added_at: thread.created_at,
    })
  }
  for (let i = 0; i < (thread.additional_sources?.length ?? 0); i++) {
    const s = thread.additional_sources[i]
    sources.push({
      kind: 'additional',
      index: i,
      url: s.url,
      title: s.title,
      content_length: s.content?.length ?? 0,
      added_at: s.added_at,
    })
  }

  return NextResponse.json({ sources })
}

// POST /api/f2/topics/[id]/sources
// Body: { url: string }
//
// Fetches the URL's content (HTML/text or YouTube transcript) and appends
// { url, title, content, added_at } to the thread's additional_sources jsonb.
// Returns the appended entry plus the updated array length.
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
// Body: { kind: 'primary' } — clears thread.url + thread.content.
//   or  { kind: 'additional', index: number } — removes additional_sources[index].
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

  let body: { kind?: string; index?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sb = f2Supabase()
  if (body.kind === 'primary') {
    const { error } = await sb
      .from('f2_threads')
      .update({
        url: null,
        content: null,
        updated_at: new Date().toISOString(),
      })
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
    if (typeof idx !== 'number' || idx < 0 || idx >= (thread.additional_sources?.length ?? 0)) {
      return NextResponse.json({ error: 'invalid index' }, { status: 400 })
    }
    const next = thread.additional_sources.filter((_, i) => i !== idx)
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

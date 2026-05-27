import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById, type F2AdditionalSource } from '@/lib/f2/threads'
import { fetchUrlContent, isUrl } from '@/lib/f2/url'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'
// URL fetches (especially YouTube via the proxy) can take ~10s.
export const maxDuration = 60

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

import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

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
  return NextResponse.json({ thread })
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params

  let body: { topic?: string; pinned?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Pin/unpin — orthogonal to rename. A PATCH sets whichever field it carries.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.pinned === 'boolean') {
    update.pinned_at = body.pinned ? new Date().toISOString() : null
  }
  if (body.topic !== undefined) {
    const topic = body.topic.trim()
    if (!topic) {
      return NextResponse.json({ error: 'topic required' }, { status: 400 })
    }
    update.topic = topic
  }
  if (update.topic === undefined && update.pinned_at === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, topic, pinned_at')
    .maybeSingle()

  if (error) {
    console.error('[f2] update topic failed:', error)
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ thread: data })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params

  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[f2] delete topic failed:', error)
    return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, id: data.id })
}

import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { ALL_TOPIC_KINDS, getThreadById, type TopicKind } from '@/lib/f2/threads'
import { getSecondChanceState, listFlashCards } from '@/lib/f2/flash'
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

  // Second Chance window (24h after a failed 2nd+ Final Review) — drives
  // the Final Review chip's retake offer. Only worth computing while the
  // topic is still at the Final Review stage.
  let second_chance_until: string | null = null
  if (thread.stars >= 2 && thread.stars < 3 && !thread.hard_quiz_completed_at) {
    const sc = await getSecondChanceState(user.id, thread.id)
    second_chance_until = sc.eligible ? sc.until : null
  }

  return NextResponse.json({ thread: { ...thread, second_chance_until } })
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

  let body: { topic?: string; pinned?: boolean; study_focus?: string | null; kind?: string; peck_excluded?: boolean }
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
  if (typeof body.peck_excluded === 'boolean') {
    update.peck_excluded = body.peck_excluded
  }
  if (body.topic !== undefined) {
    const topic = body.topic.trim()
    if (!topic) {
      return NextResponse.json({ error: 'topic required' }, { status: 400 })
    }
    update.topic = topic
  }
  // Study focus — empty string clears it. Capped so a pasted essay can't
  // become the focus; this is a one-line instruction, not more material.
  if (body.study_focus !== undefined) {
    const focus = (body.study_focus ?? '').trim().slice(0, 500)
    update.study_focus = focus || null
  }
  // Topic type — user override of the auto-classified kind (drives the icon).
  if (body.kind !== undefined) {
    if (!ALL_TOPIC_KINDS.includes(body.kind as TopicKind)) {
      return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
    }
    update.kind = body.kind
  }
  if (
    update.topic === undefined &&
    update.pinned_at === undefined &&
    update.study_focus === undefined &&
    update.kind === undefined &&
    update.peck_excluded === undefined
  ) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await f2Supabase()
    .from('f2_threads')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, topic, pinned_at, study_focus, kind')
    .maybeSingle()

  if (error) {
    console.error('[f2] update topic failed:', error)
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // When the focus changed, tell the client how big the existing deck is so
  // it can kick off a rebuild (the deck was generated under the old focus).
  let flash_card_count: number | undefined
  if (update.study_focus !== undefined) {
    flash_card_count = (await listFlashCards(user.id, id)).length
  }
  return NextResponse.json({ thread: data, flash_card_count })
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

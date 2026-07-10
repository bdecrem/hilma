import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { omniSupabase } from '@/lib/omni/supabase'
import { getCardsWithReviews, getTopicForUser } from '@/lib/omni/topics'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const { id } = await params
  const topic = await getTopicForUser(user.id, id)
  if (!topic) {
    return NextResponse.json({ error: 'Chapter not found.' }, { status: 404 })
  }
  const cards = await getCardsWithReviews(user.id, topic.id)
  return NextResponse.json({ topic, cards })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const { id } = await params
  const { data, error } = await omniSupabase()
    .from('omni_topics')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // own topics only; prebaked chapters are shared
    .select('id')
  if (error) {
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Chapter not found.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'

// GET /api/feynd/chats/:id — chat row + full messages jsonb (in order).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const sb = feyndSupabase()

  const { data: chat, error } = await sb
    .from('feynd_chats')
    .select('*')
    .eq('id', id)
    .eq('device_id', auth.deviceId)
    .single()
  if (error || !chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  const messages = Array.isArray(chat.messages) ? chat.messages : []
  return NextResponse.json({
    chat: {
      id: chat.id,
      device_id: chat.device_id,
      course_id: chat.course_id,
      video_id: chat.video_id,
      title: chat.title,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    },
    messages,
  })
}

// DELETE /api/feynd/chats/:id — remove chat (messages go with it).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const sb = feyndSupabase()
  const { error } = await sb
    .from('feynd_chats')
    .delete()
    .eq('id', id)
    .eq('device_id', auth.deviceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

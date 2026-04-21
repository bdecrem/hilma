import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'

// GET /api/feynd/chats/:id — chat metadata + all messages in order
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const sb = feyndSupabase()

  const { data: chat, error: chatErr } = await sb
    .from('feynd_chats')
    .select('*')
    .eq('id', id)
    .eq('device_id', auth.deviceId)
    .single()
  if (chatErr || !chat) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
  }

  const { data: messages, error: msgErr } = await sb
    .from('feynd_messages')
    .select('id, role, text, source, audio_url, created_at')
    .eq('chat_id', id)
    .order('created_at', { ascending: true })
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  return NextResponse.json({ chat, messages })
}

// DELETE /api/feynd/chats/:id — remove chat (cascades to messages)
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
